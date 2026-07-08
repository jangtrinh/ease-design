/**
 * `ui schema` — emit the machine-readable invocation contract for every
 * ui (sub)command: positionals, flags (with enums + required marks), and
 * documented error codes.
 *
 * This is the typed surface a host model should read INSTEAD of
 * reverse-engineering invocations from help prose. `--json` returns the
 * signature table verbatim; text mode renders a compact per-command view.
 * Static data only (src/core/command-signatures.ts) — deterministic, zero-dep.
 */
import { ok, okJson } from "../core/output.js";
import {
  COMMAND_SIGNATURES,
  GLOBAL_FLAG_SIGNATURES,
} from "../core/command-signatures.js";
import type { CommandSignature } from "../core/command-signatures.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "schema";

export const SCHEMA_HELP = `ui schema — machine-readable command signatures

Usage:
  ui schema [--json]

Emits the typed invocation contract for every ui (sub)command: positional
arguments, flags (type, required, enum values), and documented error codes.
Prefer this over parsing --help prose when forming an invocation
programmatically.

Options:
  --json     Emit the full signature table as a JSON envelope (recommended)
  -h, --help Show this help

JSON shape (data field):
  globalFlags       flags accepted by every command (--json, --help, --version)
  globalErrorCodes  codes any command may emit: UNKNOWN_FLAG (unrecognised
                    --flag, with a did-you-mean hint), INTERNAL (exit 2)
  commands          { <name>: { summary, signature | subcommands: { <sub>: … } } }
  signature         { summary, positionals[], flags[], errorCodes[] }
`;

/** Error codes any (sub)command may emit, on top of its own errorCodes. */
const GLOBAL_ERROR_CODES = ["UNKNOWN_FLAG", "INTERNAL"] as const;

// ─── Text renderer ────────────────────────────────────────────────────────────

function renderSignatureLine(name: string, sig: CommandSignature): string {
  const pos = sig.positionals
    .map((p) => (p.required ? p.name : `[${p.name}]`) + (p.variadic === true ? "..." : ""))
    .join(" ");
  const flags = sig.flags
    .map((f) => {
      const val = f.type === "string" ? (f.values !== undefined ? ` <${f.values.join("|")}>` : " <v>") : "";
      const rendered = `--${f.name}${val}`;
      return f.required === true ? rendered : `[${rendered}]`;
    })
    .join(" ");
  const parts = [`ui ${name}`, pos, flags].filter((s) => s.length > 0).join(" ");
  const codes = sig.errorCodes.length > 0 ? `  # errors: ${sig.errorCodes.join(",")}` : "";
  return `  ${parts}${codes}`;
}

function renderText(): string {
  const lines: string[] = [
    "ui command signatures (run with --json for the full typed table)",
    "",
    `Global flags: ${GLOBAL_FLAG_SIGNATURES.map((f) => `--${f.name}`).join(" ")}`,
    "",
  ];
  for (const [name, entry] of Object.entries(COMMAND_SIGNATURES)) {
    if (entry.subcommands !== undefined) {
      for (const [sub, sig] of Object.entries(entry.subcommands)) {
        lines.push(renderSignatureLine(`${name} ${sub}`, sig));
      }
    } else if (entry.signature !== undefined) {
      lines.push(renderSignatureLine(name, entry.signature));
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ─── Command object ───────────────────────────────────────────────────────────

export const schemaCommand = {
  name: CMD,
  summary: "Emit machine-readable signatures for every ui (sub)command",
  hasSubcommands: false,
  help: SCHEMA_HELP,
  run(parsed: ParsedArgs): CommandResult {
    if (parsed.json) {
      return okJson(CMD, {
        globalFlags: GLOBAL_FLAG_SIGNATURES,
        globalErrorCodes: GLOBAL_ERROR_CODES,
        commands: COMMAND_SIGNATURES,
      });
    }
    return ok(renderText());
  },
};
