/**
 * Auto-record — the fuel line (spec 006 P1).
 *
 * An outcome-bearing kernel subcommand appends a MemoryEvent as a side-effect of
 * RUNNING, with no opt-in and no model call. This module is the ONE write path for
 * that (Art IV); it reuses the existing event API (memory-events + memory-store) and
 * invents nothing.
 *
 * Project resolution (Art IV — resolve from the artifact, never guess cwd):
 *   `recordOutcome` resolves the project that OWNS the artifact the command just
 *   acted on, not the invoking process's cwd. A call site passes `input.projectDir`
 *   pointing at that artifact (a file it linted, or a project dir it already
 *   resolved); `recordOutcome` walks up from there (mirrors discoverDesignSystem,
 *   design-system.ts:65-78) looking for a `design/` dir. Only when a call site has
 *   no artifact to point at does resolution fall back to `--dir` then cwd.
 *
 * Invariants:
 *   - Never throws. A ledger failure must never change a lint's exit code.
 *   - Records only into a project that already has design/ (opt-in per project,
 *     automatic per run) — never creates design/ in an arbitrary cwd.
 *   - Appends only: no graph recompile (loadGraph rebuilds lazily on mtime), no
 *     registry upsert (a lint must not write to $HOME).
 *
 * Known limitation: `ui taste record` has no `--dir` and its outcome (a taste_vote)
 * has no design-project artifact to point at (the taste root is a separate tree from
 * design/), so its mirror only fires when cwd itself is a project with design/.
 * `votes.jsonl` stays the system of record either way.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ParsedArgs } from "./cli-args.js";
import type { CommandResult } from "./output.js";
import { buildEvent, nextEventId, validateEvent, MemoryEventError } from "./memory-events.js";
import type { EventType, Medium, MemoryArtifact } from "./memory-events.js";
import { memoryPaths, ledgerLineCount, appendEvent } from "./memory-store.js";

export interface OutcomeInput {
  type: EventType;
  /** Who caused it — the invoking command, e.g. "ui a11y-lint". */
  actor: string;
  data: Record<string, unknown>;
  refs?: readonly string[];
  designId?: string;
  medium?: Medium;
  artifact?: MemoryArtifact;
  /**
   * The artifact this outcome is about — a file the command acted on, or a project
   * dir it already resolved. `recordOutcome` walks up from here looking for
   * `design/`; omit only when the command has no such artifact (see the known
   * limitation above).
   */
  projectDir?: string;
}

/**
 * Resolve the project that OWNS a given artifact path — walk up from it (max 5
 * levels, stop at a .git boundary) looking for a `design/` directory. Mirrors
 * discoverDesignSystem's walk (design-system.ts:65-78), but the target is the
 * ledger's own gate (a bare `design/` dir), not a compiled manifest — an
 * already-resolved project dir matches on the first check.
 * Never throws; returns undefined when no such project is found.
 */
function resolveProjectFromArtifact(artifactPath: string): string | undefined {
  let cur = resolve(artifactPath);
  try {
    if (statSync(cur).isFile()) cur = dirname(cur);
  } catch {
    // Doesn't exist on disk (e.g. a path built for a not-yet-written file) —
    // treat it as a file path and start from its directory.
    cur = dirname(cur);
  }

  for (let level = 0; level < 5; level++) {
    if (existsSync(join(cur, "design"))) return cur;
    if (existsSync(join(cur, ".git"))) return undefined;
    const parent = dirname(cur);
    if (parent === cur) return undefined; // filesystem root
    cur = parent;
  }
  return undefined;
}

export type SkipReason = "not-opted-in" | "invalid-event" | "write-failed";

export interface RecordOutcomeResult {
  recorded: boolean;
  /** The appended event id (e.g. "e12") when recorded. */
  id?: string;
  reason?: SkipReason;
  detail?: string;
}

export function recordOutcome(
  parsed: ParsedArgs,
  input: OutcomeInput,
  nowIso?: string,
): RecordOutcomeResult {
  const dirFlag = parsed.flags["dir"];
  const projectDir =
    input.projectDir !== undefined
      ? resolveProjectFromArtifact(input.projectDir)
      : typeof dirFlag === "string"
        ? resolve(dirFlag)
        : process.cwd();
  if (projectDir === undefined) return { recorded: false, reason: "not-opted-in" };

  const paths = memoryPaths(projectDir);
  if (!existsSync(paths.dir)) return { recorded: false, reason: "not-opted-in" };

  try {
    validateEvent(input.type, input.data, input.refs);
  } catch (e) {
    if (e instanceof MemoryEventError) return { recorded: false, reason: "invalid-event", detail: e.message };
    throw e;
  }

  const id = nextEventId(ledgerLineCount(paths));
  const t = nowIso ?? new Date().toISOString();
  const event = buildEvent({
    id,
    t,
    type: input.type,
    data: input.data,
    actor: input.actor,
    ...(input.medium !== undefined && { medium: input.medium }),
    ...(input.designId !== undefined && { designId: input.designId }),
    ...(input.artifact !== undefined && { artifact: input.artifact }),
    ...(input.refs !== undefined && { refs: input.refs }),
  });

  try {
    appendEvent(paths, event);
  } catch (e) {
    return { recorded: false, reason: "write-failed", detail: e instanceof Error ? e.message : String(e) };
  }
  return { recorded: true, id };
}

/**
 * Call-site sugar: record, and on a real failure append one stderr warning to the
 * command's result. Returns the result (mutated only in the failure case) so a call
 * site is a single wrapped `return`.
 */
export function withOutcome(
  result: CommandResult,
  parsed: ParsedArgs,
  input: OutcomeInput,
  nowIso?: string,
): CommandResult {
  const r = recordOutcome(parsed, input, nowIso);
  if (r.recorded || r.reason === "not-opted-in") return result;
  return {
    ...result,
    stderr: (result.stderr ?? "") + `ui: memory auto-record skipped (${r.reason}): ${r.detail ?? ""}\n`,
  };
}

/** The shared `lint_run` payload builder — five call sites, one shape (Art IV). */
export function lintOutcomeData(
  check: string,
  file: string,
  r: {
    errorCount: number;
    warningCount: number;
    findings: readonly { checkId: string }[];
  },
): Record<string, unknown> {
  return {
    check,
    file,
    errorCount: r.errorCount,
    warningCount: r.warningCount,
    checkIds: [...new Set(r.findings.map((f) => f.checkId))].sort(),
  };
}
