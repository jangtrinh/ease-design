/**
 * `ui ds` dispatcher — routes ds subcommands to their implementations.
 */
import { errJson, errText } from "../core/output.js";
import { runInit } from "./ds-init-impl.js";
import { runContext } from "./ds-context-impl.js";
import { runDiff } from "./ds-diff-impl.js";
import { runDocs } from "./ds-docs-impl.js";
import { runA11y } from "./ds-a11y-impl.js";
import { runChangeToken } from "./ds-change-token-impl.js";
import { runStatus } from "./ds-status-impl.js";
import { runImport } from "./ds-import-impl.js";
import { runSpecimen } from "./ds-specimen-impl.js";
import { runPreview } from "./ds-preview-impl.js";
import { runSoul } from "./ds-soul-impl.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds";

export const DS_HELP = `ui ds — Design System SSOT (compile + enforce)

Usage:
  ui ds init <name> --persona <slug> --intent "<text>" [options]
  ui ds context [--strict] [--with-theme] [--format markdown|json] [options]
  ui ds change-token <path> --value <v> [options]
  ui ds status   [--dir <project-dir>] [--json]
  ui ds diff <base-dir> <head-dir> [--format markdown|json|pr-comment] [--base-version <v>]
  ui ds docs [--dir <project>] [--out <file>] [--format markdown|json]
  ui ds a11y [--dir <project>] [--pairs "text:surface,..."] [--json]
  ui ds preview [--dir <project>] [--out <file>] [--split <dir>] [--json]
  ui ds soul init  [--dir <project>] [--force]
  ui ds soul check [--dir <project>] [--json]

Subcommands:
  init           Compile a project-scoped design system from a persona + intent
  import         Onboard an EXISTING flat tokens.json → the DTCG store (so ds a11y/status/diff work)
  context        Emit the active design system as a context block for the host model
  change-token   Update one token's $value (only sanctioned mutation post-init)
  status         Show the manifest summary (generation, persona, hashes)
  diff           Compare two DS states (dirs with design.tokens.json) → semver + visual-breaking classification
  docs           Regenerate component reference docs from the registry (decay-proof)
  a11y           Token-pair contrast audit (text×surface ≥ AA, incl. hover/active state pairs); exit 1 on a fail. Declared tokens only — not a conformance claim.
  specimen       Report each component's variant×state matrix + applicable-state gaps (missing disabled/empty)
  preview        Generate a self-contained specimen.html from the compiled tokens + registry
  soul           Scaffold + structure-lint the declared design stance (design/soul.md)

'ds a11y' options:
  --dir <path>       Project directory holding design/ (default: cwd)
  --pairs "t:s,..."  Pin explicit text:surface token pairs (skips name-role inference)

'ds docs' options:
  --dir <path>       Project directory holding design/ (default: cwd)
  --out <file>       Write the docs to a file instead of stdout
  --format <f>       markdown (default) | json

'ds diff' options:
  --format <f>       markdown (default) | json | pr-comment
  --base-version <v> Base semver (x.y.z) to compute the recommended next version from
  --color-tolerance <n>  OKLab ΔE below which a colour change is a patch (default 0.02)
  --dim-tolerance <n>    Dimension % change below which it is a patch (default 5)

'ds init' options:
  --persona <slug>   Persona slug from personas.json (required)
  --intent "<text>"  Plain-language design intent, max 512 chars (required)
  --brand-hex <hex>  Brand seed color (#RRGGBB)
  --force            Overwrite an existing DS (preserves changelog history)
  --bare             Skip the default component kit (start with an empty registry)
  --persona-data <f> Override the personas.json path (test support)
  --dir <path>       Override the project directory

'ds import' options:
  --dir <path>       Project directory to write design/ into (default: cwd)
  --name <name>      DS name for the sealed manifest (default: imported-ds)
  --force            Overwrite an existing design.tokens.json
  Converts a flat { category: { name: value } } token file into DTCG, inferring
  $type per value (color/dimension/number/fontFamily/fontWeight/duration). Nested
  groups are hoisted to <cat>-<sub>. Un-typeable values (box-shadow strings,
  bezier easings) are SKIPPED and reported — never emitted with a bad type.

'ds specimen' options:
  --dir <path>       Project directory holding design/ (default: cwd)
  --strict           Exit 1 if any completeness gap is found (default: informational, exit 0)
  Reads component-registry.json and reports each component's variant dimensions + declared
  states. Flags only reliably-modelled gaps: missing 'disabled' on an interactive control,
  missing 'empty' on a data-family component. 'focus' is intentionally NOT required (it is
  usually a runtime :focus-visible, not a Figma variant, so requiring it would over-fire).

'ds preview' options:
  --dir <path>       Project directory holding design/ (default: cwd, else discovered)
  --out <file>       Output HTML path (default: <project>/design/preview/specimen.html)
  --split <dir>      Emit one self-contained page per component into <dir> (+ a deterministic
                     index.json), instead of one whole-DS specimen. One page per registry
                     record with markup; each reuses the specimen chrome + :root tokens.
  Renders the compiled design system as ONE self-contained page: :root tokens, colour
  paired roles (each swatch renders its own declared foreground), the type ramp,
  radius/elevation/duration chips, and one block per registered component (markup comes
  from the registry — the only component source). Deterministic: same DS → byte-identical.

'ds change-token' options:
  --value <v>        New $value for the token (required)
  --reason "<text>"  Changelog note recorded with the mutation
  --dir <path>       Override the project directory

'ds context' options:
  --strict       Prepend the registered-components-only enforcement preamble
  --with-theme   Also emit the compiled Tailwind v4 @theme block (full token map,
                 immune to --max-bytes) — folds context + 'tokens compile' into one
                 read-only call. Markdown: appended as a fenced section; JSON: a
                 sibling 'theme' string field.
  --include <s>  Comma-separated sections: tokens,registry,naming,anti-patterns,soul
  --format <f>   markdown (default) | json
  --max-bytes <n>  Truncate the context block to fit n bytes (default 4096)
  --dir <path>   Override the project directory
  The 'soul' section emits design/soul.md (the declared stance, capped at 150
  lines) when that file exists; a project without a soul just omits the section.

'ds soul' options:
  init           Write the design/soul.md scaffold (status: draft)
  check          Structure-lint design/soul.md; exit 1 on error-severity findings
  --dir <path>   Project directory holding design/ (default: cwd)
  --force        'soul init' only: overwrite an existing soul.md
  Checks (structure only — content taste stays a model judgment):
  soul-missing-section / soul-empty-section / soul-placeholder-copy   (errors)
  soul-draft-status / soul-scaffold-untouched / soul-too-long         (warnings)
  A missing file is the error finding 'soul-missing' (an explicit check expects
  a soul). Everywhere else the soul is OPTIONAL — absence is never an error.

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
  BAD_TOKEN          Compiled token set failed validation on 'ds init'
  PERSONA_NOT_FOUND  --persona slug not in personas.json
  TOKEN_NOT_FOUND    'change-token' on a non-existent path
  UNKNOWN_FLAG       Unrecognised --flag
  BAD_ARG            Missing <tokens.json> on 'ds import'
  FILE_NOT_FOUND     'ds import' source file does not exist
  BAD_JSON           'ds import' source is not valid JSON / did not convert
  EXISTS             'ds import' target design.tokens.json exists (use --force)
  EMPTY_IMPORT       'ds import' found no typeable tokens
  WRITE_ERROR        'ds import' could not write the DS store
  DS_NOT_FOUND       'ds specimen' found no component-registry.json
  BAD_VALUE          'change-token' --value fails type/format check
  ALIAS_CYCLE        New alias graph has a cycle
  DANGLING_ALIAS     New alias points to a missing token
  TYPE_MISMATCH      New alias crosses incompatible $type
  WRITE_ERROR        A design/ artifact could not be written
  BAD_ARG            Missing required flag, unknown subcommand, etc.
  UNKNOWN_FLAG       Unrecognised --flag (rejected, with a did-you-mean hint)
  FILE_NOT_FOUND     'ds diff' input dir has no design.tokens.json
  BAD_JSON           'ds diff' input file is not valid JSON / bad token shape
  READ_ERROR         'ds diff' input could not be read
  REGISTRY_NOT_FOUND 'ds docs' found no component-registry.json
  BAD_REGISTRY       'ds docs' registry file is malformed
  EXISTS             'ds soul init' target soul.md exists (use --force)
  WRITE_ERROR        'ds soul init' could not write the scaffold
  READ_ERROR         'ds soul check' could not read soul.md
`;
// 'ds a11y' error codes (DS_NOT_FOUND / BAD_ARG / BAD_JSON / UNKNOWN_FLAG) are shared with the above.

export const dsCommand = {
  name: CMD,
  summary: "Compile, inspect, and mutate the project's design system",
  hasSubcommands: true,
  help: DS_HELP,
  run(parsed: ParsedArgs): CommandResult {
    const sub = parsed.subcommand;
    switch (sub) {
      case "init":         return runInit(parsed);
      case "import":       return runImport(parsed);
      case "context":      return runContext(parsed);
      case "change-token": return runChangeToken(parsed);
      case "status":       return runStatus(parsed);
      case "diff":         return runDiff(parsed);
      case "docs":         return runDocs(parsed);
      case "a11y":         return runA11y(parsed);
      case "specimen":     return runSpecimen(parsed);
      case "preview":      return runPreview(parsed);
      case "soul":         return runSoul(parsed);
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
