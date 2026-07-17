/**
 * The outcome-bearing command registry (spec 006 P2).
 *
 * The single source of truth for WHICH kernel subcommands must append a MemoryEvent as
 * a side-effect of running (spec 006 P1), and under what condition. Pure metadata — the
 * same role command-signatures.ts plays for flags.
 *
 * Its paired linter is tests/autorecord-wiring.test.ts (Art II): it fails when a listed
 * file stops calling withOutcome, AND when an unlisted src/commands file starts calling
 * it. Adding a new outcome-bearing command = add an entry here + wire the call site;
 * the linter fails until both halves exist.
 *
 * `condition` is prose for humans and for the PR reviewer — it is NOT executed. The
 * executable truth is the call site's own guard; keep the two in sync by hand.
 */
import type { EventType } from "./memory-events.js";

export interface OutcomeCommandSpec {
  /** The invocation as a user types it, e.g. "ui audit". */
  command: string;
  /** Repo-relative path of the file holding the call site. */
  file: string;
  /** The event type this command appends. Typed → a bogus type fails typecheck. */
  eventType: EventType;
  /** When it records (prose; the call site holds the executable guard). */
  condition: string;
}

export const OUTCOME_BEARING: readonly OutcomeCommandSpec[] = [
  { command: "ui a11y-lint",       file: "src/commands/a11y-lint.ts",           eventType: "lint_run",          condition: "every successful run (a clean pass is an outcome)" },
  { command: "ui content-lint",    file: "src/commands/content-lint.ts",        eventType: "lint_run",          condition: "every successful run" },
  { command: "ui taste-lint",      file: "src/commands/taste-lint.ts",          eventType: "lint_run",          condition: "every successful run" },
  { command: "ui validate-layout", file: "src/commands/validate-layout.ts",     eventType: "lint_run",          condition: "every successful run" },
  { command: "ui audit",           file: "src/commands/audit.ts",               eventType: "lint_run",          condition: "every successful run (total→errorCount)" },
  { command: "ui autofix",         file: "src/commands/autofix.ts",             eventType: "autofix_applied",   condition: "--write AND >=1 fix applied (state change only)" },
  { command: "ui taste record",    file: "src/commands/taste-record-impl.ts",   eventType: "taste_vote",        condition: "--mode pair only; --mode study is deferred (P1 Decision 6)" },
  { command: "ui ds change-token", file: "src/commands/ds-change-token-impl.ts", eventType: "token_change",     condition: "the value actually changed (the no-op branch returns first)" },
  { command: "ui figma reconcile", file: "src/commands/figma-reconcile-run.ts", eventType: "reconcile_applied", condition: "--apply AND (registry changed OR a sidecar was written)" },
];

/** Repo-relative files that are allowed to call withOutcome/recordOutcome. */
export const OUTCOME_FILES: readonly string[] = OUTCOME_BEARING.map((s) => s.file);
