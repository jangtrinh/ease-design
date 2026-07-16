/**
 * `ui figma` command — the deterministic Figma live-sync surface (spec 004, Tier 3).
 *
 * P2 ships one subcommand: `reconcile --dry-run`. It walks the append-only change-log
 * (design/figma.changes.jsonl) from a line-count cursor, coalesces cross-batch to the
 * component level, and previews the registry delta (added / updated / deprecated) —
 * WITHOUT writing anything. `--apply` (commit + cursor advance) lands in P4.
 *
 * This command owns all IO; the transform is pure (src/core/figma-reconcile.ts). Zero
 * network, zero LLM (kernel rule). The `design-os figma reconcile` umbrella is a thin
 * Typer passthrough to this command — deferred to P4 where apply + the panel land.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { RegistryError, loadRegistry } from "../core/registry-store.js";
import {
  ReconcileError,
  coalesceFrames,
  computePreviewDelta,
  parseChangeLog,
  scopeSummary,
} from "../core/figma-reconcile.js";
import type { RegistryView } from "../core/figma-reconcile.js";

const CMD = "figma";
const CHANGE_LOG_RELPATH = ["design", "figma.changes.jsonl"] as const;
const REGISTRY_RELPATH = ["design", "component-registry.json"] as const;

export const FIGMA_HELP = `ui figma — deterministic Figma live-sync (spec 004)

Usage:
  ui figma reconcile [--since <n>] [--dry-run] [--dir <project>] [--json]

Subcommands:
  reconcile   Preview the registry delta implied by the change-log (dry-run only)

reconcile walks design/figma.changes.jsonl from line-count cursor <n> to the end,
coalesces cross-batch to the component level, and reports what the registry WOULD
become — added / updated / deprecated — without writing anything or advancing the
cursor. Apply (--apply, cursor commit) lands in P4.

Options:
  --since <n>      Line-count cursor to start from (default 0 = whole log)
  --dry-run        Preview only; never writes (P2 is always dry-run — this is the
                   default and only mode; --apply arrives in P4)
  --dir <path>     Project directory holding design/ (default: current directory)
  --json           Emit a JSON envelope instead of human-readable text
  -h, --help       Show this help

Scope mapping:
  Records are tagged scope: local | global. scopeHint (origin REMOTE → global) is a
  HINT, not authoritative: a new component takes the hint; an existing one keeps its
  registry scope unless the hint promotes local → global. Each entry reports
  scopeFromHint so the decision is transparent.

Error codes:
  BAD_ARG            --since is not a non-negative integer, or unknown subcommand
  UNKNOWN_FLAG       a flag outside this command's signature was passed
  BAD_CHANGE_LOG     the change-log has a malformed / wrong-version line
  BAD_REGISTRY       the component registry is invalid JSON or wrong shape
  READ_ERROR         a non-ENOENT I/O failure reading the registry

Notes:
  - A missing change-log or missing registry is not an error: an absent log yields an
    empty delta (exit 0); an absent registry previews every component as added.
  - Exit 0 even when the delta is empty (a clean, already-synced project).
  - Deterministic: pure transform over the captured log. No network, no model call.
`;

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

/** Parse --since into a non-negative integer, or return null if malformed. */
function parseSince(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number.parseInt(raw.trim(), 10);
}

// ─── Subcommand: reconcile ────────────────────────────────────────────────────

function runReconcile(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const sub = "figma reconcile";

  const since = parseSince(flagString(parsed, "since"));
  if (since === null) {
    const msg = "--since must be a non-negative integer (a line-count cursor)";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const dir = projectDir(parsed);
  const logPath = join(dir, ...CHANGE_LOG_RELPATH);
  const registryPath = join(dir, ...REGISTRY_RELPATH);

  // Parse the whole change-log (absent → empty). A corrupt line fails hard.
  let frames;
  try {
    const raw = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    frames = parseChangeLog(raw);
  } catch (e) {
    if (e instanceof ReconcileError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  // Load the registry (absent → empty: every component previews as added).
  let existing: ReadonlyMap<string, RegistryView>;
  try {
    const reg = loadRegistry(registryPath);
    existing = new Map(
      reg.components.map((c) => [c.name, { name: c.name, scope: c.scope, deprecated: c.deprecated } as RegistryView]),
    );
  } catch (e) {
    if (e instanceof RegistryError && e.code === "REGISTRY_NOT_FOUND") {
      existing = new Map();
    } else if (e instanceof RegistryError) {
      return useJson ? errJson(sub, e.code, e.message) : errText(`ui: ${e.message}\n`);
    } else {
      throw e;
    }
  }

  const cursorTo = frames.length;
  const cursorFrom = Math.min(since, cursorTo);
  const slice = frames.slice(cursorFrom);
  const delta = computePreviewDelta(coalesceFrames(slice), existing);
  const scope = scopeSummary(delta);

  const data = {
    cursor_from: cursorFrom,
    cursor_to: cursorTo,
    dry_run: true as const,
    delta: { added: delta.added, updated: delta.updated, deprecated: delta.deprecated },
    scope_summary: scope,
    ...(delta.unresolved.length > 0 && { caps: { unresolved: delta.unresolved } }),
  };

  if (useJson) return okJson(sub, data);

  return { exitCode: 0, stdout: renderText(data) };
}

/** Human-readable summary (names sanitized). The JSON envelope is the authoritative form. */
function renderText(data: {
  cursor_from: number;
  cursor_to: number;
  delta: { added: { name: string; scope: string }[]; updated: { name: string; scope: string; fields: string[] }[]; deprecated: { name: string; scope: string }[] };
  scope_summary: { local: number; global: number };
  caps?: { unresolved: { nodeId: string; reason: string }[] };
}): string {
  const lines: string[] = [];
  lines.push(`figma reconcile (dry-run) — cursor ${data.cursor_from}..${data.cursor_to}`);
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
  if (data.caps !== undefined) {
    lines.push(`  ! ${data.caps.unresolved.length} unresolved (no component name)`);
  }
  return lines.join("\n") + "\n";
}

// ─── Command registration object ──────────────────────────────────────────────

export const figmaCommand = {
  name: CMD,
  summary: "Deterministic Figma live-sync: reconcile the change-log into the registry",
  hasSubcommands: true,
  help: FIGMA_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "reconcile":
        return runReconcile(parsed);
      case undefined: {
        const msg = "ui figma requires a subcommand. Run 'ui figma --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${sub}'. Run 'ui figma --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
