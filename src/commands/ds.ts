/**
 * `ui ds` dispatcher — routes ds subcommands to their implementations.
 */
import { errJson, errText } from "../core/output.js";
import { runInit } from "./ds-init-impl.js";
import { runContext } from "./ds-context-impl.js";
import { runChangeToken } from "./ds-change-token-impl.js";
import { runStatus } from "./ds-status-impl.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds";

export const DS_HELP = `ui ds — Design System SSOT (compile + enforce)

Usage:
  ui ds init <name> --persona <slug> --intent "<text>" [options]
  ui ds context [--strict] [--with-theme] [--format markdown|json] [options]
  ui ds change-token <path> --value <v> [options]
  ui ds status   [--dir <project-dir>] [--json]

Subcommands:
  init           Compile a project-scoped design system from a persona + intent
  context        Emit the active design system as a context block for the host model
  change-token   Update one token's $value (only sanctioned mutation post-init)
  status         Show the manifest summary (generation, persona, hashes)

'ds context' options:
  --strict       Prepend the registered-components-only enforcement preamble
  --with-theme   Also emit the compiled Tailwind v4 @theme block (full token map,
                 immune to --max-bytes) — folds context + 'tokens compile' into one
                 read-only call. Markdown: appended as a fenced section; JSON: a
                 sibling 'theme' string field.
  --include <s>  Comma-separated sections: tokens,registry,naming,anti-patterns
  --format <f>   markdown (default) | json
  --max-bytes <n>  Truncate the context block to fit n bytes (default 4096)
  --dir <path>   Override the project directory

Project layout (all under <project-dir>/design/):
  design.tokens.json       DTCG two-tier tokens
  component-registry.json  Canonical component records
  ds.manifest.json         DS seal: hashes, generation, changelog

Discovery:
  --dir <path>             Override the project directory
  (default)                Walks up from cwd (max 5 levels, stops at .git)

Immutability:
  Once 'ds init' compiles a DS, the tokens file is sealed by a SHA-256 hash in
  the manifest. Hand-editing the tokens file triggers DS_TAMPERED on the next
  command. Use 'ds change-token' to update a value (bumps generation, re-seals).

  Re-init with --force:
  'ds init --force' overwrites the existing artifacts but preserves the prior
  changelog history. New init entry is appended after all prior entries.
  The 'generation' field reflects the current compiled state only (resets to 1
  on --force). The 'changelog[]' array spans the manifest's full lifetime
  across all --force re-inits and grows without bound.

Common options:
  --json                   Emit a JSON envelope
  -h, --help               Show this help

Error codes:
  DS_NOT_FOUND       No manifest in cwd or parents
  DS_EXISTS          'ds init' against an existing manifest without --force
  DS_TAMPERED        Manifest hash != on-disk file hash
  BAD_MANIFEST       Manifest shape invalid
  BAD_NAME           Invalid <name> on 'ds init'
  BAD_INTENT         Invalid --intent
  BAD_BRAND_HEX      Invalid --brand-hex
  PERSONA_NOT_FOUND  --persona slug not in personas.json
  TOKEN_NOT_FOUND    'change-token' on a non-existent path
  BAD_VALUE          'change-token' --value fails type/format check
  ALIAS_CYCLE        New alias graph has a cycle
  DANGLING_ALIAS     New alias points to a missing token
  TYPE_MISMATCH      New alias crosses incompatible $type
  BAD_ARG            Missing required flag, unknown subcommand, etc.
  UNKNOWN_FLAG       Unrecognised --flag (rejected, with a did-you-mean hint)
`;

export const dsCommand = {
  name: CMD,
  summary: "Compile, inspect, and mutate the project's design system",
  hasSubcommands: true,
  help: DS_HELP,
  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "init":         return runInit(parsed);
      case "context":      return runContext(parsed);
      case "change-token": return runChangeToken(parsed);
      case "status":       return runStatus(parsed);
      case undefined: {
        const msg = "ui ds requires a subcommand. Run 'ui ds --help'.";
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${sub}'. Run 'ui ds --help'.`;
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
    }
  },
};
