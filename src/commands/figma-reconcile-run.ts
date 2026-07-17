/**
 * `ui figma reconcile` runner (spec 004 P2 dry-run + P4 apply, spec 005 P4 mirror) —
 * the IO layer. Owns ALL fs IO; the transforms are pure (figma-reconcile.ts preview,
 * figma-apply.ts apply). Zero network, zero LLM. Split from figma.ts to keep it a shell.
 *   --dry-run (default)  → preview the delta; write nothing; cursor untouched.
 *   --apply              → commit (soft-deprecate deletes, refresh scope / un-deprecate
 *                          re-touches) and advance the apply cursor.
 *   --mirror-file <path> → (with --apply) node specs captured from the live plugin by the
 *                          broker's sync-apply orchestration; apply replaces each
 *                          component's sidecar 1:1 and points the record at it. Absent =
 *                          no capture ran → the log-only commit still lands, every
 *                          un-mirrored component named in the report. The live scan never
 *                          happens here: the kernel stays pure (Art I.2).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import {
  RegistryError,
  createEmptyRegistry,
  loadRegistry,
  saveRegistry,
  type Registry,
} from "../core/registry-store.js";
import {
  ReconcileError,
  coalesceFrames,
  computePreviewDelta,
  parseChangeLog,
  scopeSummary,
} from "../core/figma-reconcile.js";
import type { RegistryView } from "../core/figma-reconcile.js";
import { applyDelta, type SidecarWrite } from "../core/figma-apply.js";
import { indexCaptures, parseMirrorCapture, type MirrorIndex } from "../core/figma-mirror-capture.js";
import { writeFigmaNode } from "../core/figma-node-reader.js";
import { readCursor, syncStatePath, writeCursor } from "../core/figma-sync-state.js";
import { renderApply, renderDryRun } from "./figma-reconcile-render.js";
import { withOutcome } from "../core/memory-autorecord.js";

const CHANGE_LOG_RELPATH = ["design", "figma.changes.jsonl"] as const;
const REGISTRY_RELPATH = ["design", "component-registry.json"] as const;
const DESIGN_DIR = "design";
const SUB = "figma reconcile";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flagString(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
}

function projectDir(parsed: ParsedArgs): string {
  const dir = flagString(parsed, "dir");
  return dir !== undefined ? resolve(dir) : process.cwd();
}

/** Parse --since into a non-negative integer, or null if malformed. undefined → null (not given). */
function parseSince(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number.parseInt(raw.trim(), 10);
}

// ─── Runner ─────────────────────────────────────────────────────────────────

export function runReconcile(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const apply = parsed.flags["apply"] === true;
  const dryRunFlag = parsed.flags["dry-run"] === true;

  if (apply && dryRunFlag) {
    const msg = "--apply cannot be combined with --dry-run";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const mirrorPath = flagString(parsed, "mirror-file");
  if (mirrorPath !== undefined && !apply) {
    const msg = "--mirror-file only applies with --apply (a dry-run writes no sidecars)";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const sinceRaw = flagString(parsed, "since");
  const sinceGiven = sinceRaw !== undefined;
  const since = parseSince(sinceRaw);
  if (sinceGiven && since === null) {
    const msg = "--since must be a non-negative integer (a line-count cursor)";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const dir = projectDir(parsed);
  const logPath = join(dir, ...CHANGE_LOG_RELPATH);
  const registryPath = join(dir, ...REGISTRY_RELPATH);
  const statePath = syncStatePath(dir);

  // Parse the whole change-log (absent → empty). A corrupt line fails hard.
  let frames;
  try {
    const raw = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    frames = parseChangeLog(raw);
  } catch (e) {
    if (e instanceof ReconcileError) {
      return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  // Load the full registry (absent → empty). A malformed registry fails hard.
  let registry: Registry;
  try {
    registry = existsSync(registryPath) ? loadRegistry(registryPath) : createEmptyRegistry();
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }
  const existing: ReadonlyMap<string, RegistryView> = new Map(
    registry.components.map((c) => [c.name, { name: c.name, scope: c.scope, deprecated: c.deprecated }]),
  );

  const cursorTo = frames.length;
  // dry-run defaults the cursor to 0 (preview whole log); apply defaults it to the
  // persisted apply cursor (resume where the last commit stopped). --since overrides both.
  const cursorFrom0 = sinceGiven ? (since as number) : apply ? readCursor(statePath) : 0;
  const cursorFrom = Math.min(cursorFrom0, cursorTo);
  const slice = frames.slice(cursorFrom);
  const delta = computePreviewDelta(coalesceFrames(slice), existing);
  const scope = scopeSummary(delta);

  const base = {
    cursor_from: cursorFrom,
    cursor_to: cursorTo,
    delta: { added: delta.added, updated: delta.updated, deprecated: delta.deprecated },
    scope_summary: scope,
    ...(delta.unresolved.length > 0 && { caps: { unresolved: delta.unresolved } }),
  };

  if (!apply) {
    const data = { ...base, dry_run: true as const };
    return useJson ? okJson(SUB, data) : { exitCode: 0, stdout: renderDryRun(data) };
  }

  // ── APPLY: sidecars first, then the registry, then the cursor ───────────────
  // A pointer must never outlive the file it points at, so the sidecars land BEFORE the
  // registry: a failed write aborts with nothing committed and the cursor unmoved, and
  // the next apply retries the same slice.
  let mirror: MirrorIndex | undefined;
  if (mirrorPath !== undefined) {
    try {
      const raw = readFileSync(resolve(mirrorPath), "utf8");
      mirror = indexCaptures(parseMirrorCapture(raw, mirrorPath));
    } catch (e) {
      if (e instanceof ReconcileError) {
        return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
      }
      const msg = `cannot read mirror capture '${mirrorPath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(SUB, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
    }
  }

  const { registry: next, report, sidecarWrites, changed } = applyDelta(registry, delta, mirror);
  try {
    writeSidecars(join(dir, DESIGN_DIR), sidecarWrites);
    if (changed) saveRegistry(registryPath, next);
    writeCursor(statePath, cursorTo);
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(SUB, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  const data = { ...base, dry_run: false as const, applied: true as const, apply: report };
  const out = useJson ? okJson(SUB, data) : { exitCode: 0, stdout: renderApply(data, report) };
  const recordable = changed || sidecarWrites.length > 0;
  if (!recordable) return out;
  return withOutcome(out, parsed, {
    type: "reconcile_applied",
    actor: "ui figma reconcile",
    projectDir: dir,
    data: {
      added: report.added, updated: report.updated, deprecated: report.deprecated,
      mirrored: report.mirrored.length, cursorFrom, cursorTo,
    },
  });
}

/** Write every captured sidecar (content-guarded by writeFigmaNode). Throws RegistryError. */
function writeSidecars(designDir: string, writes: readonly SidecarWrite[]): void {
  for (const w of writes) writeFigmaNode(designDir, w.name, w.node);
}
