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
import { errJson } from "./core/output.js";
import type { CommandResult } from "./core/output.js";
import { signatureFor } from "./core/command-signatures.js";
import { findUnknownFlag, unknownFlagMessage } from "./core/flag-guard.js";

import { colorCommand } from "./commands/color.js";
import { tokensCommand } from "./commands/tokens.js";
import { autofixCommand } from "./commands/autofix.js";
import { validateLayoutCommand } from "./commands/validate-layout.js";
import { tasteLintCommand } from "./commands/taste-lint.js";
import { auditCommand } from "./commands/audit.js";
import { critiqueCoverageCommand } from "./commands/critique-coverage.js";
import { registryCommand } from "./commands/registry.js";
import { editStrategyCommand } from "./commands/edit-strategy.js";
import { stripFencesCommand } from "./commands/strip-fences.js";
import { parseJsonStreamCommand } from "./commands/parse-json-stream.js";
import { exportCommand } from "./commands/export.js";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { scanCommand } from "./commands/scan.js";
import { guideCommand } from "./commands/guide.js";
import { dsCommand } from "./commands/ds.js";
import { designmdCommand } from "./commands/designmd.js";
import { schemaCommand } from "./commands/schema.js";
import { memoryCommand } from "./commands/memory.js";
import { changelogCommand } from "./commands/changelog.js";
import { a11yLintCommand } from "./commands/a11y-lint.js";
import { dsUsageLintCommand } from "./commands/ds-usage-lint.js";
import { flowCommand } from "./commands/flow.js";
import { contentLintCommand } from "./commands/content-lint.js";
import { vrCommand } from "./commands/vr.js";
import { evidenceCommand } from "./commands/evidence.js";
import { ingestFigmaDsCommand } from "./commands/ingest-figma-ds.js";
import { ingestCssDsCommand } from "./commands/ingest-css-ds.js";
import { figmaCommand } from "./commands/figma.js";
import { synthesizeConventionsCommand } from "./commands/synthesize-conventions.js";
import { tasteCommand } from "./commands/taste.js";
import { agentsCommand } from "./commands/agents.js";
import { knowledgeCommand } from "./commands/knowledge.js";
import { deliveryCommand } from "./commands/delivery.js";

// Keep in sync with package.json "version". A test (tests/cli-version.test.ts)
// asserts these match, so drift fails CI rather than shipping silently.
const VERSION = "0.1.0";

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
COMMANDS[tasteLintCommand.name] = tasteLintCommand;
COMMANDS[auditCommand.name] = auditCommand;
COMMANDS[critiqueCoverageCommand.name] = critiqueCoverageCommand;
COMMANDS[registryCommand.name] = registryCommand;
COMMANDS[editStrategyCommand.name] = editStrategyCommand;
COMMANDS[stripFencesCommand.name] = stripFencesCommand;
COMMANDS[parseJsonStreamCommand.name] = parseJsonStreamCommand;
COMMANDS[exportCommand.name] = exportCommand;
COMMANDS[guideCommand.name] = guideCommand;
COMMANDS[initCommand.name] = initCommand;
COMMANDS[doctorCommand.name] = doctorCommand;
COMMANDS[scanCommand.name] = scanCommand;
COMMANDS[dsCommand.name] = dsCommand;
COMMANDS[designmdCommand.name] = designmdCommand;
COMMANDS[schemaCommand.name] = schemaCommand;
COMMANDS[memoryCommand.name] = memoryCommand;
COMMANDS[changelogCommand.name] = changelogCommand;
COMMANDS[a11yLintCommand.name] = a11yLintCommand;
COMMANDS[dsUsageLintCommand.name] = dsUsageLintCommand;
COMMANDS[flowCommand.name] = flowCommand;
COMMANDS[contentLintCommand.name] = contentLintCommand;
COMMANDS[vrCommand.name] = vrCommand;
COMMANDS[evidenceCommand.name] = evidenceCommand;
COMMANDS[ingestFigmaDsCommand.name] = ingestFigmaDsCommand;
COMMANDS[ingestCssDsCommand.name] = ingestCssDsCommand;
COMMANDS[figmaCommand.name] = figmaCommand;
COMMANDS[synthesizeConventionsCommand.name] = synthesizeConventionsCommand;
COMMANDS[tasteCommand.name] = tasteCommand;
COMMANDS[agentsCommand.name] = agentsCommand;
COMMANDS[knowledgeCommand.name] = knowledgeCommand;
COMMANDS[deliveryCommand.name] = deliveryCommand;

// ─── Root help ────────────────────────────────────────────────────────────────

function buildRootHelp(): string {
  const lines = [
    "ui — ease-design CLI",
    "",
    "New here? Run `ui guide` for the plain-language workflow (start a design, tweak it, …).",
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

  // Central unknown-flag guard: every (sub)command with a declared signature
  // (src/core/command-signatures.ts) rejects flags outside it — a hallucinated
  // `--brand-color` fails loud with a did-you-mean hint instead of silently
  // no-opping. Unresolvable signatures (unknown subcommand, dispatcher without
  // a subcommand) fall through to the command's own BAD_ARG handling.
  const sig = signatureFor(parsed.command, parsed.subcommand);
  if (sig !== null) {
    const unknown = findUnknownFlag(parsed.flags, sig.flags.map((f) => f.name));
    if (unknown !== null) {
      const msg = unknownFlagMessage(unknown);
      const label =
        parsed.subcommand !== undefined ? `${parsed.command} ${parsed.subcommand}` : parsed.command;
      const res = parsed.json
        ? errJson(label, "UNKNOWN_FLAG", msg)
        : { exitCode: 1, stderr: `ui: ${msg}\n` };
      if (res.stdout !== undefined) stdout.write(res.stdout);
      if (res.stderr !== undefined) stderr.write(res.stderr);
      return res.exitCode;
    }
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
