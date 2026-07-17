/**
 * `ui designmd` dispatcher — routes designmd subcommands to their impls.
 *
 * Subcommands:
 *   extract-tokens   Grep hex/font/custom-property tokens from raw HTML + CSS
 *   snapshot         Strip scripts, inline CSS, sanitise reveal-state styles
 *   audit            Run the 5 audit families on a per-project folder
 */
import { errJson, errText } from "../core/output.js";
import { runExtractTokens } from "./designmd-extract-tokens-impl.js";
import { runSnapshot } from "./designmd-snapshot-impl.js";
import { runAudit } from "./designmd-audit-impl.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "designmd";

export const DESIGNMD_HELP = `ui designmd — DESIGN.md (Google-Labs alpha spec) toolchain

Usage:
  ui designmd extract-tokens <html-path> [--css <path>...] [--out <path>] [--json]
  ui designmd snapshot       <html-path> --origin <url> [--css <path>...] [--out <path>] [--json]
  ui designmd audit          <folder-path> [--json]

Subcommands:
  extract-tokens   Emit frequency-ranked source tokens (colours, fonts, custom-props)
  snapshot         Produce a self-contained preview HTML (CSS inlined, scripts stripped)
  audit            Run the 5 audit families on a per-project folder; gates the workflow

--css accepts multiple files as one comma-separated flag: --css a.css,b.css
Passing --css more than once is rejected (REPEATED_FLAG) rather than silently
dropping every value but the last.

Options:
  --json           Emit a JSON envelope
  -h, --help       Show this help

Audit exit codes:
  0     all families PASS
  1     one or more FAIL rows (workflow MUST stop)
  2     WARN-only (workflow asks user)

Error codes (subcommand-specific):
  BAD_ARG          Missing/invalid argument
  FILE_NOT_FOUND   Required file does not exist
  READ_ERROR       File exists but cannot be read
  WRITE_ERROR      Cannot write to the target path
  FOLDER_MISSING   Audit folder is missing a required file
  REPEATED_FLAG    --css was passed more than once (extract-tokens) — combine with a comma instead
`;

export const designmdCommand = {
  name: CMD,
  summary: "Extract tokens, snapshot, and audit DESIGN.md folders",
  hasSubcommands: true,
  help: DESIGNMD_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "extract-tokens": return runExtractTokens(parsed);
      case "snapshot":       return runSnapshot(parsed);
      case "audit":          return runAudit(parsed);
      case undefined: {
        const msg = "ui designmd requires a subcommand. Run 'ui designmd --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui designmd --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
