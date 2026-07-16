/**
 * `ui figma reconcile` runner (spec 004 P2 dry-run + P4 apply) — the IO layer.
 * Owns ALL fs IO; the transforms are pure (figma-reconcile.ts preview, figma-apply.ts
 * apply). Zero network, zero LLM. Split from figma.ts to keep it a thin shell.
 *   --dry-run (default) → preview the delta; write nothing; cursor untouched.
 *   --apply             → commit (soft-deprecate deletes, refresh scope / un-deprecate
 *                         re-touches) and advance the apply cursor. Adds stay `pending`.
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
import { applyDelta, type ApplyReport } from "../core/figma-apply.js";
import { readCursor, syncStatePath, writeCursor } from "../core/figma-sync-state.js";

const CHANGE_LOG_RELPATH = ["design", "figma.changes.jsonl"] as const;
const REGISTRY_RELPATH = ["design", "component-registry.json"] as const;
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

/** Strip control chars / collapse newlines so untrusted node names can't spoof text output. */
function safeText(s: string, max = 80): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
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

  // ── APPLY: mutate the registry, persist it (if changed), advance the cursor ──
  const { registry: next, report, changed } = applyDelta(registry, delta);
  try {
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
  return useJson ? okJson(SUB, data) : { exitCode: 0, stdout: renderApply(data, report) };
}

// ─── Text rendering (JSON envelope is the authoritative form) ─────────────────

interface DeltaText {
  cursor_from: number;
  cursor_to: number;
  delta: {
    added: { name: string; scope: string }[];
    updated: { name: string; scope: string; fields: string[] }[];
    deprecated: { name: string; scope: string }[];
  };
  scope_summary: { local: number; global: number };
  caps?: { unresolved: { nodeId: string; reason: string }[] };
}

function renderDeltaLines(data: DeltaText, header: string): string[] {
  const lines: string[] = [];
  lines.push(header);
  lines.push(
    `  ${data.delta.added.length} added · ${data.delta.updated.length} updated · ${data.delta.deprecated.length} deprecated ` +
      `(scope: ${data.scope_summary.local} local, ${data.scope_summary.global} global)`,
  );
  for (const e of data.delta.added) lines.push(`  + ${safeText(e.name)} (${e.scope})`);
  for (const e of data.delta.updated) {
    const fields = e.fields.length > 0 ? ` [${e.fields.join(", ")}]` : "";
    lines.push(`  ~ ${safeText(e.name)} (${e.scope})${fields}`);
  }
  for (const e of data.delta.deprecated) lines.push(`  - ${safeText(e.name)} (${e.scope}) deprecated`);
  if (data.caps !== undefined) lines.push(`  ! ${data.caps.unresolved.length} unresolved (no component name)`);
  return lines;
}

function renderDryRun(data: DeltaText): string {
  const lines = renderDeltaLines(data, `figma reconcile (dry-run) — cursor ${data.cursor_from}..${data.cursor_to}`);
  return lines.join("\n") + "\n";
}

function renderApply(data: DeltaText, report: ApplyReport): string {
  const lines = renderDeltaLines(data, `figma reconcile (applied) — cursor ${data.cursor_from}..${data.cursor_to}`);
  lines.push(
    `  → ${report.deprecated.length} deprecated · ${report.updated.length} updated · ` +
      `${report.pending.length} pending re-ingest · ${report.skipped.length} skipped`,
  );
  for (const p of report.pending) lines.push(`  · pending ${safeText(p.name)} — ${p.reason}`);
  return lines.join("\n") + "\n";
}
