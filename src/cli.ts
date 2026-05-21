/**
 * ease-design CLI — the `ui` binary entrypoint and subcommand router.
 *
 * Phase 0 ships the router skeleton with `--help` / `--version` only.
 * Deterministic subcommands (autofix, validate-layout, tokens, color,
 * registry, edit-strategy, export, ds, init) are registered here in Phase 2 —
 * see plans/ease-design/implementation-plan.md in the EaseUI repo.
 */
import { realpathSync } from "node:fs";
import { argv, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const VERSION = "0.0.0";

const HELP = `ui — ease-design CLI

Usage:
  ui <command> [options]

Commands:
  (none yet — deterministic subcommands land in Phase 2)

Options:
  -h, --help     Show this help text
  -v, --version  Show the version
`;

/** Runs the CLI for the given args (process.argv without node + script). */
export function run(args: string[]): number {
  const command = args[0];

  if (command === undefined || command === "-h" || command === "--help") {
    stdout.write(HELP);
    return 0;
  }

  if (command === "-v" || command === "--version") {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  stderr.write(`ui: unknown command '${command}'\nRun 'ui --help' for usage.\n`);
  return 1;
}

/** True when this file is executed directly as the `ui` binary (not imported). */
function isEntrypoint(): boolean {
  const entry = argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  exit(run(argv.slice(2)));
}
