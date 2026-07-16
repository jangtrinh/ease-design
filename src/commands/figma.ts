/**
 * `ui figma` command — the deterministic Figma live-sync surface (spec 004, Tier 3).
 *
 * One subcommand, two modes:
 *   `reconcile --dry-run` (P2) previews the registry delta implied by the change-log.
 *   `reconcile --apply`   (P4) commits that delta into the registry and advances the
 *                              persisted apply cursor. Both walk design/figma.changes.jsonl
 *                              from a line-count cursor and coalesce cross-batch.
 *
 * This command owns registration + help; the IO runner lives in figma-reconcile-run.ts
 * and the transforms are pure (figma-reconcile.ts preview, figma-apply.ts apply). Zero
 * network, zero LLM (kernel rule).
 */
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText } from "../core/output.js";
import { runReconcile } from "./figma-reconcile-run.js";

const CMD = "figma";

export const FIGMA_HELP = `ui figma — deterministic Figma live-sync (spec 004)

Usage:
  ui figma reconcile [--since <n>] [--dry-run | --apply] [--dir <project>] [--json]

Subcommands:
  reconcile   Preview (--dry-run) or commit (--apply) the registry delta from the change-log

reconcile walks design/figma.changes.jsonl from a line-count cursor, coalesces
cross-batch to the component level, and reports what the registry WOULD become —
added / updated / deprecated.

  --dry-run  Preview only; never writes; the cursor is untouched (the default).
  --apply    Commit the delta: soft-deprecate deletes, refresh scope + un-deprecate
             re-touches, then advance the persisted apply cursor to the log end. New
             components stay 'pending' (the log lacks their markup/tokens — run
             'ui ingest-figma-ds' to materialize them). Undo = replay to a prior
             cursor (the append-only log is the source of truth).

Options:
  --since <n>      Line-count cursor to start from (dry-run default 0; apply default =
                   the persisted apply cursor in design/figma-sync.state.json)
  --dir <path>     Project directory holding design/ (default: current directory)
  --json           Emit a JSON envelope instead of human-readable text
  -h, --help       Show this help

Scope mapping:
  Records are tagged scope: local | global. scopeHint (origin REMOTE → global) is a
  HINT, not authoritative: a new component takes the hint; an existing one keeps its
  registry scope unless the hint promotes local → global.

Error codes:
  BAD_ARG            --since is malformed, --apply combined with --dry-run, or unknown subcommand
  UNKNOWN_FLAG       a flag outside this command's signature was passed
  BAD_CHANGE_LOG     the change-log has a malformed / wrong-version line
  BAD_REGISTRY       the component registry is invalid JSON or wrong shape
  WRITE_ERROR        --apply could not write the registry or the cursor state
  READ_ERROR         a non-ENOENT I/O failure reading the registry

Notes:
  - A missing change-log or registry is not an error: an absent log yields an empty
    delta (exit 0); an absent registry previews every component as added.
  - Exit 0 even when the delta is empty (a clean, already-synced project).
  - Deterministic: pure transform over the captured log. No network, no model call.
`;

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
