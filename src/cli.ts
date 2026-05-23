/**
 * ease-design CLI — the `ui` binary entrypoint and subcommand router.
 *
 * Commands register into COMMANDS below. Each command module exports a
 * command object that is appended here; adding a new command is a one-line
 * registration, not a switch-case edit.
 */
import { realpathSync } from "node:fs";
import { argv, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./core/cli-args.js";
import type { ParsedArgs } from "./core/cli-args.js";
import type { CommandResult } from "./core/output.js";

import { colorCommand } from "./commands/color.js";
import { tokensCommand } from "./commands/tokens.js";
import { autofixCommand } from "./commands/autofix.js";
import { validateLayoutCommand } from "./commands/validate-layout.js";
import { registryCommand } from "./commands/registry.js";
import { editStrategyCommand } from "./commands/edit-strategy.js";
import { stripFencesCommand } from "./commands/strip-fences.js";
import { parseJsonStreamCommand } from "./commands/parse-json-stream.js";
import { exportCommand } from "./commands/export.js";
import { initCommand } from "./commands/init.js";
import { dsCommand } from "./commands/ds.js";

const VERSION = "0.0.1";

// ─── Command registry ─────────────────────────────────────────────────────────

interface Command {
  name: string;
  summary: string;
  hasSubcommands: boolean;
  run: (parsed: ParsedArgs) => CommandResult;
  help: string;
}

const COMMANDS: Record<string, Command> = {};

COMMANDS[colorCommand.name] = colorCommand;
COMMANDS[tokensCommand.name] = tokensCommand;
COMMANDS[autofixCommand.name] = autofixCommand;
COMMANDS[validateLayoutCommand.name] = validateLayoutCommand;
COMMANDS[registryCommand.name] = registryCommand;
COMMANDS[editStrategyCommand.name] = editStrategyCommand;
COMMANDS[stripFencesCommand.name] = stripFencesCommand;
COMMANDS[parseJsonStreamCommand.name] = parseJsonStreamCommand;
COMMANDS[exportCommand.name] = exportCommand;
COMMANDS[initCommand.name] = initCommand;
COMMANDS[dsCommand.name] = dsCommand;

// ─── Root help ────────────────────────────────────────────────────────────────

function buildRootHelp(): string {
  const lines = [
    "ui — ease-design CLI",
    "",
    "Usage:",
    "  ui <command> [subcommand] [options]",
    "",
    "Commands:",
  ];
  for (const cmd of Object.values(COMMANDS)) {
    lines.push(`  ${cmd.name.padEnd(16)} ${cmd.summary}`);
  }
  lines.push(
    "",
    "Options:",
    "  -h, --help     Show this help text",
    "  -v, --version  Show the version",
    "      --json     Emit JSON envelope instead of human-readable text",
    "",
  );
  return lines.join("\n");
}

// ─── run() — testable entry point ────────────────────────────────────────────

/** Runs the CLI for the given args (process.argv without node + script). */
export function run(args: string[]): number {
  const parsed = parseArgs(args);

  // Root --version
  if (parsed.version && parsed.command === undefined) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  // Root --help or no command
  if (parsed.command === undefined || (parsed.help && parsed.command === undefined)) {
    stdout.write(buildRootHelp());
    return 0;
  }

  // --help with no real command resolved above; handle --help + command below
  if (parsed.help && parsed.command !== undefined) {
    const cmd = COMMANDS[parsed.command];
    if (cmd === undefined) {
      stderr.write(
        `ui: unknown command '${parsed.command}'\nRun 'ui --help' for usage.\n`,
      );
      return 1;
    }
    stdout.write(cmd.help + "\n");
    return 0;
  }

  // --version
  if (parsed.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  // Dispatch
  const cmd = COMMANDS[parsed.command];
  if (cmd === undefined) {
    stderr.write(
      `ui: unknown command '${parsed.command}'\nRun 'ui --help' for usage.\n`,
    );
    return 1;
  }

  // For commands with no real subcommands the parser slots the file/positional
  // argument into parsed.subcommand (second non-flag token). Shift it back into
  // positionals[0] so command handlers read parsed.positionals[0] unconditionally.
  if (!cmd.hasSubcommands && parsed.subcommand !== undefined) {
    parsed.positionals.unshift(parsed.subcommand);
    parsed.subcommand = undefined;
  }

  // Wrap dispatch so any unexpected throw becomes a clean exit 2 instead of
  // an unhandled exception that dumps a stack trace to the terminal.
  let result;
  try {
    result = cmd.run(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    stderr.write(`ui: internal error: ${msg}\n`);
    return 2;
  }

  if (result.stdout !== undefined) stdout.write(result.stdout);
  if (result.stderr !== undefined) stderr.write(result.stderr);

  return result.exitCode;
}

// ─── Entrypoint guard ────────────────────────────────────────────────────────

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
