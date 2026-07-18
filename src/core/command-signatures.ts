/**
 * Machine-readable command signatures for the `ui` binary — the single
 * typed contract behind `ui schema [--json]`.
 *
 * WHY: the host model forms invocations from prose today; a typed
 * signature surface (positionals / flags / enums / error codes, per
 * subcommand) removes the reverse-engineering step and lets the flag
 * guard reject hallucinated flags on every command from ONE source.
 *
 * INVARIANT (enforced by tests/cmd-schema-consistency.test.ts): every
 * flag name and error code declared here appears verbatim in that
 * command's --help text, so this table can never silently drift from
 * the documented contract. This is a data table (config-like); it is
 * exempt from the 200-line code-file guideline.
 */

export interface FlagSignature {
  /** Long-flag name without leading dashes. */
  name: string;
  type: "string" | "boolean";
  required?: true;
  /** Closed enum of accepted values, when the flag takes one of a fixed set. */
  values?: readonly string[];
  summary: string;
}

export interface PositionalSignature {
  name: string;
  required: boolean;
  variadic?: true;
  summary: string;
}

export interface CommandSignature {
  summary: string;
  positionals: readonly PositionalSignature[];
  flags: readonly FlagSignature[];
  errorCodes: readonly string[];
}

export interface CommandSchema {
  summary: string;
  /** Present for dispatcher commands (ds, color, tokens, registry, edit-strategy, designmd). */
  subcommands?: Readonly<Record<string, CommandSignature>>;
  /** Present for flat commands. */
  signature?: CommandSignature;
}

/** Flags accepted by every command; never repeated in per-command signatures. */
export const GLOBAL_FLAG_SIGNATURES: readonly FlagSignature[] = [
  { name: "json", type: "boolean", summary: "Emit a JSON envelope instead of human-readable text" },
  { name: "help", type: "boolean", summary: "Show the command's help text" },
  { name: "version", type: "boolean", summary: "Show the version" },
];

// ─── Shared shorthand builders (keep the table terse) ─────────────────────────

const IO_CODES = ["BAD_ARG", "FILE_NOT_FOUND", "READ_ERROR"] as const;

function htmlFile(summary: string): PositionalSignature {
  return { name: "<file.html>", required: true, summary };
}

const STDIN_FILE: PositionalSignature = {
  name: "<file|->", required: true, summary: "Input file path, or '-' to read stdin",
};

// ─── The table ────────────────────────────────────────────────────────────────

export const COMMAND_SIGNATURES: Readonly<Record<string, CommandSchema>> = {
  color: {
    summary: "OKLCH color math",
    subcommands: {
      convert: {
        summary: "Convert hex → OKLCH triple (or OKLCH → hex with --oklch / --to hex)",
        positionals: [{ name: "<hex>", required: false, summary: "Hex color (required unless --oklch is given)" }],
        flags: [
          { name: "oklch", type: "string", summary: 'Reverse mode input: three space-separated numbers "<L> <C> <H>"' },
          { name: "to", type: "string", values: ["hex"], summary: "Reverse-mode output format (only 'hex')" },
        ],
        errorCodes: ["BAD_ARG", "BAD_HEX"],
      },
      scale: {
        summary: "Generate an 11-stop perceptual color scale",
        positionals: [{ name: "<hex>", required: true, summary: "Base hex color" }],
        flags: [],
        errorCodes: ["BAD_ARG", "BAD_HEX"],
      },
      contrast: {
        summary: "Compute WCAG 2.2 contrast ratio between two colors",
        positionals: [
          { name: "<hex1>", required: true, summary: "First color" },
          { name: "<hex2>", required: true, summary: "Second color" },
        ],
        flags: [],
        errorCodes: ["BAD_ARG", "BAD_HEX"],
      },
      semantic: {
        summary: "Generate a semantic palette from named hex colors",
        positionals: [{ name: "<name:hex>", required: true, variadic: true, summary: "One or more name:hex pairs" }],
        flags: [],
        errorCodes: ["BAD_ARG", "BAD_HEX"],
      },
    },
  },

  tokens: {
    summary: "DTCG token file compiler",
    subcommands: {
      compile: {
        summary: "Read a DTCG token file and emit the chosen target to stdout",
        positionals: [{ name: "<file.json>", required: true, summary: "DTCG token file" }],
        flags: [
          { name: "target", type: "string", values: ["css", "tailwind", "figma"], summary: "Output format (default css); --json returns all three" },
        ],
        errorCodes: [...IO_CODES, "BAD_JSON", "BAD_TOKEN", "ALIAS_CYCLE", "DANGLING_ALIAS", "TYPE_MISMATCH"],
      },
    },
  },

  autofix: {
    summary: "Apply deterministic HTML fix rules",
    signature: {
      summary: "Apply the 5 deterministic HTML fix rules to a file",
      positionals: [htmlFile("HTML file to fix")],
      flags: [{ name: "write", type: "boolean", summary: "Overwrite the input file (default: print to stdout)" }],
      errorCodes: [...IO_CODES, "WRITE_ERROR"],
    },
  },

  "validate-layout": {
    summary: "Static HTML structural/overflow linter",
    signature: {
      summary: "Lint an HTML file; exit 1 on error-severity findings",
      positionals: [htmlFile("HTML file to lint")],
      flags: [],
      errorCodes: [...IO_CODES],
    },
  },

  "a11y-lint": {
    summary: "Static-HTML accessibility linter (Tier-1 WCAG checks; not a conformance claim)",
    signature: {
      summary: "Lint an HTML file for static a11y violations; exit 1 on error-severity findings",
      positionals: [htmlFile("HTML file to lint")],
      flags: [],
      errorCodes: [...IO_CODES],
    },
  },

  "content-lint": {
    summary: "Deterministic content / UX-writing floor (low-FP static checks)",
    signature: {
      summary: "Lint an HTML file for content defects; exit 1 on error-severity findings",
      positionals: [htmlFile("HTML file to lint")],
      flags: [],
      errorCodes: [...IO_CODES],
    },
  },

  "ds-usage-lint": {
    summary: "ENFORCEMENT gate — does the page use the design system's own tokens? (not a conformance claim)",
    signature: {
      summary: "Check an HTML file's CSS against the project DS's declared tokens; exit 1 on error-severity findings",
      positionals: [htmlFile("HTML file to lint")],
      flags: [{ name: "dir", type: "string", summary: "Project directory holding design/ (default: cwd)" }],
      errorCodes: [...IO_CODES, "DS_NOT_FOUND", "BAD_JSON"],
    },
  },

  flow: {
    summary: "Lint a multi-screen flow (IA graph) deterministically",
    subcommands: {
      lint: {
        summary: "Deterministically lint an IA graph (screens + states + transitions)",
        positionals: [{ name: "<flow.json>", required: true, summary: "The flow artefact to lint" }],
        flags: [],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_FLOW"],
      },
    },
  },

  vr: {
    summary: "Deterministic visual-regression diff/gate for rendered screenshots",
    subcommands: {
      diff: {
        summary: "Compare two PNGs; exit 1 if the changed-pixel ratio exceeds --max-ratio",
        positionals: [
          { name: "<base.png>", required: true, summary: "Baseline screenshot" },
          { name: "<head.png>", required: true, summary: "Current screenshot" },
        ],
        flags: [
          { name: "threshold", type: "string", summary: "Per-pixel matching tolerance, 0–1 (default 0.1)" },
          { name: "max-ratio", type: "string", summary: "Max changed-pixel ratio, 0–1, that still passes (default 0)" },
          { name: "include-aa", type: "boolean", summary: "Count anti-aliased pixels as real differences" },
          { name: "mask", type: "string", summary: 'Rectangles to ignore: "x,y,w,h" separated by ";"' },
          { name: "out", type: "string", summary: "Write the diff PNG to this file" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_PNG", "BAD_MASK"],
      },
      gate: {
        summary: "Diff every baseline PNG against the same-named current render; exit 1 on any regression",
        positionals: [
          { name: "<baseline-dir>", required: true, summary: "Directory of committed baseline PNGs" },
          { name: "<current-dir>", required: true, summary: "Directory of freshly-rendered PNGs" },
        ],
        flags: [
          { name: "threshold", type: "string", summary: "Per-pixel matching tolerance, 0–1 (default 0.1)" },
          { name: "max-ratio", type: "string", summary: "Max changed-pixel ratio, 0–1, that still passes (default 0)" },
          { name: "include-aa", type: "boolean", summary: "Count anti-aliased pixels as real differences" },
          { name: "out-dir", type: "string", summary: "Write per-file diff PNGs into this directory" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_PNG"],
      },
      accept: {
        summary: "Promote current renders to baselines (copies *.png current → baseline)",
        positionals: [
          { name: "<current-dir>", required: true, summary: "Directory of freshly-rendered PNGs" },
          { name: "<baseline-dir>", required: true, summary: "Destination baseline directory" },
        ],
        flags: [],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR"],
      },
    },
  },

  evidence: {
    summary: "Record & verify user-evidence findings (anti-fabrication ledger)",
    subcommands: {
      add: {
        summary: "Append a finding; a quote must be a verbatim substring of its source",
        positionals: [],
        flags: [
          { name: "kind", type: "string", values: ["quote", "metric", "observation"], summary: "Evidence kind (default quote)" },
          { name: "finding", type: "string", summary: "The synthesised insight (required)" },
          { name: "quote", type: "string", summary: "Verbatim source text (required for kind=quote)" },
          { name: "source", type: "string", summary: "Source file to ingest and verify against" },
          { name: "medium", type: "string", summary: "interview | survey | analytics | support | review | …" },
          { name: "locator", type: "string", summary: "Where in the source (line 42, 0:14:20) — provenance only" },
          { name: "metric", type: "string", summary: "Metric value (required for kind=metric)" },
          { name: "unit", type: "string", summary: "Metric unit" },
          { name: "n", type: "string", summary: "Sample size" },
          { name: "tags", type: "string", summary: "Comma-separated tags" },
          { name: "dir", type: "string", summary: "Evidence store directory (default 'design')" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "QUOTE_TOO_SHORT", "QUOTE_MISMATCH", "SOURCE_COLLISION", "BAD_EVIDENCE"],
      },
      list: {
        summary: "List every recorded finding with support level and verify status",
        positionals: [],
        flags: [{ name: "dir", type: "string", summary: "Evidence store directory (default 'design')" }],
        errorCodes: ["UNKNOWN_FLAG", "READ_ERROR", "BAD_EVIDENCE"],
      },
      verify: {
        summary: "Re-check every quote finding against its stored source; exit 1 on any break",
        positionals: [],
        flags: [{ name: "dir", type: "string", summary: "Evidence store directory (default 'design')" }],
        errorCodes: ["UNKNOWN_FLAG", "READ_ERROR", "SOURCE_MISSING", "BAD_EVIDENCE"],
      },
      show: {
        summary: "Print one finding by id",
        positionals: [{ name: "<id>", required: true, summary: "Evidence id (e.g. ev1)" }],
        flags: [{ name: "dir", type: "string", summary: "Evidence store directory (default 'design')" }],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "READ_ERROR", "NOT_FOUND", "BAD_EVIDENCE"],
      },
    },
  },

  "taste-lint": {
    summary: "Deterministic taste-rubric floor for generated HTML",
    signature: {
      summary: "Check the machine-verifiable taste-rubric subset; exit 1 on violations",
      positionals: [htmlFile("HTML file to check")],
      flags: [{ name: "tokens", type: "string", summary: "DS token file; enables the Consistency raw-hex check" }],
      errorCodes: [...IO_CODES],
    },
  },

  audit: {
    summary: "Deterministic DS-violation audit of a structured node export",
    signature: {
      summary: "Audit a node-export JSON against a DS spec; exit 1 on any violation",
      positionals: [{ name: "<nodes.json>", required: true, summary: "Structured node export (a node or array of nodes)" }],
      flags: [
        { name: "tokens", type: "string", summary: "DTCG token file; enables the raw-hex-vs-token check" },
        { name: "registry", type: "string", summary: "Component registry; enables detached/raw-icon/deprecated checks" },
        { name: "grid", type: "string", summary: "Base grid for off-grid radius/spacing (default 4)" },
      ],
      errorCodes: [...IO_CODES, "BAD_JSON"],
    },
  },

  "critique-coverage": {
    summary: "Deterministic acceptance-criteria coverage of a produced design (the curator's goal axis)",
    signature: {
      summary: "Report uncovered acceptance criteria + coverage %; exit 1 on any gap",
      positionals: [
        { name: "<spec.json>", required: true, summary: "Brief: acceptanceCriteria[] + successMetrics?" },
        { name: "<manifest.json>", required: true, summary: "Produced design: screens[] with coversCriteria" },
      ],
      flags: [
        { name: "require-evidence", type: "boolean", summary: "Treat criteria with no evidence provenance as assumptions, not real coverage" },
        { name: "evidence-dir", type: "string", summary: "Resolve criterion evidence[] as ids in the T6 evidence ledger at DIR" },
      ],
      errorCodes: [...IO_CODES, "BAD_JSON", "BAD_EVIDENCE"],
    },
  },

  registry: {
    summary: "Component registry store",
    subcommands: {
      register: {
        summary: "Add (or replace with --force) a component in the registry",
        positionals: [{ name: "<Category/Variant>", required: true, summary: "Canonical PascalCase component name" }],
        flags: [
          { name: "category", type: "string", required: true, summary: "Component category" },
          { name: "markup", type: "string", required: true, summary: "Markup source file, or '-' for stdin" },
          { name: "tokens", type: "string", summary: "Comma-separated token paths the component uses" },
          { name: "variants", type: "string", summary: "Comma-separated variant names" },
          { name: "states", type: "string", values: ["default", "hover", "active", "focus", "disabled"], summary: "Comma-separated states (each from the enum); folded into --variants as State=X, not into the record's own states field" },
          { name: "description", type: "string", summary: "Free-text component description" },
          { name: "force", type: "boolean", summary: "Overwrite an existing component" },
          { name: "file", type: "string", summary: "Registry file path (default ./design/component-registry.json)" },
        ],
        errorCodes: ["BAD_ARG", "BAD_NAME", "BAD_STATE", "BAD_TOKEN", "NAME_EXISTS", "FILE_NOT_FOUND", "BAD_REGISTRY", "READ_ERROR", "WRITE_ERROR"],
      },
      lookup: {
        summary: "Find a component by canonical name",
        positionals: [{ name: "<Category/Variant>", required: true, summary: "Canonical component name" }],
        flags: [{ name: "file", type: "string", summary: "Registry file path" }],
        errorCodes: ["BAD_ARG", "BAD_NAME", "NOT_FOUND", "REGISTRY_NOT_FOUND", "BAD_REGISTRY", "READ_ERROR"],
      },
      list: {
        summary: "List all components, optionally filtered by category",
        positionals: [],
        flags: [
          { name: "category", type: "string", summary: "Filter by category" },
          { name: "file", type: "string", summary: "Registry file path" },
        ],
        errorCodes: ["BAD_ARG", "REGISTRY_NOT_FOUND", "BAD_REGISTRY", "READ_ERROR"],
      },
    },
  },

  "edit-strategy": {
    summary: "Select strategy, number lines, apply ln-diff patch",
    subcommands: {
      select: {
        summary: "Classify a change request as deterministic | ln_diff | full_regen",
        positionals: [{ name: '"<change request>"', required: true, summary: "Plain-language change request" }],
        flags: [],
        errorCodes: ["BAD_ARG"],
      },
      "number-lines": {
        summary: "Prefix every HTML line with a right-aligned line number",
        positionals: [STDIN_FILE],
        flags: [],
        errorCodes: [...IO_CODES],
      },
      apply: {
        summary: "Apply a ln-diff patch produced by an LLM to an HTML file",
        positionals: [htmlFile("HTML file to patch")],
        flags: [
          { name: "diff", type: "string", required: true, summary: "Diff source file, or '-' for stdin" },
          { name: "write", type: "boolean", summary: "Overwrite the HTML file in place" },
        ],
        errorCodes: [...IO_CODES, "WRITE_ERROR", "BAD_DIFF", "DIFF_NO_MATCH"],
      },
    },
  },

  "strip-fences": {
    summary: "Remove code-fence wrappers from LLM HTML output",
    signature: {
      summary: "Strip code fences and stray prose around a full HTML document",
      positionals: [STDIN_FILE],
      flags: [],
      errorCodes: [...IO_CODES],
    },
  },

  "parse-json-stream": {
    summary: "Extract JSON objects from a concatenated stream",
    signature: {
      summary: "Parse concatenated JSON objects; NDJSON out",
      positionals: [STDIN_FILE],
      flags: [{ name: "strict", type: "boolean", summary: "Exit 1 (INCOMPLETE_STREAM) if trailing bytes remain" }],
      errorCodes: [...IO_CODES, "INCOMPLETE_STREAM"],
    },
  },

  export: {
    summary: "Export HTML as a standalone self-contained file",
    signature: {
      summary: "Write a standalone copy of an HTML file",
      positionals: [htmlFile("HTML file to export")],
      flags: [
        { name: "out", type: "string", summary: "Output file path" },
        { name: "title", type: "string", summary: "Override the <title> tag" },
        { name: "minify", type: "boolean", summary: "Collapse whitespace, remove comments" },
        { name: "zip", type: "boolean", summary: "Not yet implemented (exits 2 NOT_IMPLEMENTED)" },
      ],
      errorCodes: [...IO_CODES, "WRITE_ERROR", "NOT_IMPLEMENTED"],
    },
  },

  guide: {
    summary: "A plain-language map of what ease-design can do",
    signature: { summary: "Show the designer-facing workflow map", positionals: [], flags: [], errorCodes: [] },
  },

  schema: {
    summary: "Machine-readable command signatures for every ui (sub)command",
    signature: { summary: "Emit the typed invocation contract (flags, positionals, enums, error codes)", positionals: [], flags: [], errorCodes: [] },
  },

  changelog: {
    summary: "Fold the design-system history into a readable changelog",
    signature: {
      summary: "Fold the DS manifest changelog + recorded decisions into a Keep-a-Changelog history",
      positionals: [],
      flags: [
        { name: "dir", type: "string", summary: "Project directory holding design/ (default: cwd)" },
        { name: "format", type: "string", values: ["markdown", "json"], summary: "Output format (default markdown)" },
      ],
      errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "NO_MEMORY", "BAD_JSON"],
    },
  },

  init: {
    summary: "Write the ease-design manifest and per-runtime adapter tree",
    signature: {
      summary: "Install adapter wrappers for one or all runtimes",
      positionals: [],
      flags: [
        { name: "runtime", type: "string", values: ["claude", "antigravity", "codex"], summary: "Target runtime" },
        { name: "all", type: "boolean", summary: "Write all three runtimes (mutually exclusive with --runtime)" },
        { name: "cwd", type: "string", summary: "Target directory (default: current working directory)" },
        { name: "force", type: "boolean", summary: "Overwrite existing manifest and adapter files" },
      ],
      errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "MANIFEST_EXISTS", "WRITE_ERROR"],
    },
  },

  doctor: {
    summary: "Verify an ease-design install (and optionally a project) is healthy",
    signature: {
      summary: "Run install/project health checks; exit 1 on failure",
      positionals: [],
      flags: [{ name: "cwd", type: "string", summary: "Also check the adapter install in this project directory" }],
      errorCodes: [],
    },
  },

  scan: {
    summary: "Detect existing design signals in a project (framework, styling, components)",
    signature: {
      summary: "Detect existing design signals in a project (framework, styling, components)",
      positionals: [],
      flags: [{ name: "cwd", type: "string", summary: "Directory to scan (default: current working directory)" }],
      errorCodes: ["BAD_ARG", "READ_ERROR"],
    },
  },

  figma: {
    summary: "Deterministic Figma live-sync: reconcile the change-log into the registry",
    subcommands: {
      reconcile: {
        summary: "Preview (--dry-run) or commit (--apply) the registry delta from the change-log",
        positionals: [],
        flags: [
          { name: "since", type: "string", summary: "Line-count cursor to start from (dry-run default 0; apply default = persisted cursor)" },
          { name: "dry-run", type: "boolean", summary: "Preview only; never writes; cursor untouched (the default)" },
          { name: "apply", type: "boolean", summary: "Commit the delta into the registry and advance the apply cursor" },
          { name: "mirror-file", type: "string", summary: "With --apply: node specs captured from the live plugin; replaces each component's Figma sidecar 1:1" },
          { name: "dir", type: "string", summary: "Project directory holding design/ (default: current directory)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_CHANGE_LOG", "BAD_REGISTRY", "BAD_MIRROR_CAPTURE", "BAD_SIDECAR", "WRITE_ERROR", "READ_ERROR"],
      },
    },
  },

  ds: {
    summary: "Compile, inspect, and mutate the project's design system",
    subcommands: {
      init: {
        summary: "Compile a project-scoped design system from a persona + intent",
        positionals: [{ name: "<name>", required: true, summary: "Project DS name (slug)" }],
        flags: [
          { name: "persona", type: "string", required: true, summary: "Persona slug from personas.json" },
          { name: "intent", type: "string", required: true, summary: "Plain-language design intent (max 512 chars)" },
          { name: "brand-hex", type: "string", summary: "Brand seed color (#RRGGBB)" },
          { name: "dir", type: "string", summary: "Override the project directory" },
          { name: "force", type: "boolean", summary: "Overwrite an existing DS (preserves changelog)" },
          { name: "bare", type: "boolean", summary: "Skip the default component kit (start with an empty registry)" },
          { name: "persona-data", type: "string", summary: "Override the personas.json path (test support)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_NAME", "BAD_INTENT", "BAD_BRAND_HEX", "PERSONA_NOT_FOUND", "BAD_TOKEN", "DS_EXISTS", "WRITE_ERROR"],
      },
      specimen: {
        summary: "Report each component's variant×state matrix + applicable-state gaps",
        positionals: [],
        flags: [
          { name: "dir", type: "string", summary: "Project directory holding design/ (default cwd)" },
          { name: "strict", type: "boolean", summary: "Exit 1 if any completeness gap is found" },
        ],
        errorCodes: ["UNKNOWN_FLAG", "DS_NOT_FOUND", "BAD_JSON"],
      },
      import: {
        summary: "Onboard an existing flat tokens.json into the DTCG store",
        positionals: [{ name: "<tokens.json>", required: true, summary: "Flat token file { category: { name: value } }" }],
        flags: [
          { name: "dir", type: "string", summary: "Project directory to write design/ into (default cwd)" },
          { name: "name", type: "string", summary: "DS name for the sealed manifest (default imported-ds)" },
          { name: "force", type: "boolean", summary: "Overwrite an existing design.tokens.json" },
          { name: "reset-registry", type: "boolean", summary: "Confirm --force may wipe a non-empty registry (required alongside --force when the registry has components)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_NAME", "FILE_NOT_FOUND", "BAD_JSON", "EXISTS", "REGISTRY_NOT_EMPTY", "EMPTY_IMPORT", "WRITE_ERROR"],
      },
      context: {
        summary: "Emit the active design system as a context block for the host model",
        positionals: [],
        flags: [
          { name: "strict", type: "boolean", summary: "Prepend the registered-components-only enforcement preamble" },
          { name: "with-theme", type: "boolean", summary: "Also emit the compiled Tailwind v4 @theme block (full token map, immune to --max-bytes)" },
          { name: "include", type: "string", summary: "Comma-separated sections: tokens,registry,naming,anti-patterns,soul" },
          { name: "format", type: "string", values: ["markdown", "json"], summary: "Output format (default markdown)" },
          { name: "max-bytes", type: "string", summary: "Budget for the variable sections (token/registry/naming/anti-pattern tables); the soul chain and --with-theme are fixed prose outside it (default 4096)" },
          { name: "dir", type: "string", summary: "Override the project directory" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "DS_NOT_FOUND", "DS_TAMPERED", "BAD_MANIFEST"],
      },
      "change-token": {
        summary: "Update one token's $value (only sanctioned mutation post-init)",
        positionals: [{ name: "<path>", required: true, summary: "Token path (e.g. color.primary)" }],
        flags: [
          { name: "value", type: "string", required: true, summary: "New $value for the token" },
          { name: "reason", type: "string", summary: "Changelog note for the mutation" },
          { name: "dir", type: "string", summary: "Override the project directory" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "DS_NOT_FOUND", "DS_TAMPERED", "BAD_MANIFEST", "TOKEN_NOT_FOUND", "BAD_VALUE", "ALIAS_CYCLE", "DANGLING_ALIAS", "TYPE_MISMATCH", "WRITE_ERROR"],
      },
      "set-role": {
        summary: "Set/correct one token's recognized role (owner-edit path, spec 011 P2)",
        positionals: [
          { name: "<token.path>", required: true, summary: "Existing token path (e.g. color.primary)" },
          { name: "<role>", required: true, summary: "One of the canonical roles (background, foreground, card, popover, primary, secondary, muted, accent, border, input, ring, destructive, success, warning, info, neutral)" },
        ],
        flags: [{ name: "dir", type: "string", summary: "Override the project directory" }],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "DS_NOT_FOUND", "DS_TAMPERED", "BAD_MANIFEST", "BAD_TOKEN", "BAD_ROLE", "WRITE_ERROR"],
      },
      status: {
        summary: "Show the manifest summary (generation, persona, hashes)",
        positionals: [],
        flags: [{ name: "dir", type: "string", summary: "Override the project directory" }],
        errorCodes: ["UNKNOWN_FLAG", "DS_NOT_FOUND", "DS_TAMPERED", "BAD_MANIFEST"],
      },
      diff: {
        summary: "Compare two DS states → semver + visual-breaking classification",
        positionals: [
          { name: "<base-dir>", required: true, summary: "Baseline dir holding design.tokens.json (+ optional component-registry.json)" },
          { name: "<head-dir>", required: true, summary: "Candidate dir to compare against the baseline" },
        ],
        flags: [
          { name: "format", type: "string", values: ["markdown", "json", "pr-comment"], summary: "Output format (default markdown)" },
          { name: "base-version", type: "string", summary: "Base semver to compute the recommended next version from" },
          { name: "color-tolerance", type: "string", summary: "OKLab ΔE below which a colour change is a patch (default 0.02)" },
          { name: "dim-tolerance", type: "string", summary: "Dimension % change below which it is a patch (default 5)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "BAD_JSON", "READ_ERROR"],
      },
      docs: {
        summary: "Regenerate component reference docs from the registry (decay-proof)",
        positionals: [],
        flags: [
          { name: "dir", type: "string", summary: "Project directory holding design/ (default: cwd)" },
          { name: "out", type: "string", summary: "Write the docs to a file instead of stdout" },
          { name: "format", type: "string", values: ["markdown", "json"], summary: "Output format (default markdown)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "REGISTRY_NOT_FOUND", "BAD_REGISTRY", "WRITE_ERROR"],
      },
      a11y: {
        summary: "Token-pair contrast audit (text×surface ≥ AA, incl. hover/active state pairs); declared tokens only",
        positionals: [],
        flags: [
          { name: "dir", type: "string", summary: "Project directory holding design/ (default: cwd)" },
          { name: "pairs", type: "string", summary: "Pin explicit text:surface token pairs (skips name-role inference)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "DS_NOT_FOUND", "BAD_JSON"],
      },
      preview: {
        summary: "Generate a self-contained specimen.html from the compiled tokens + registry",
        positionals: [],
        flags: [
          { name: "dir", type: "string", summary: "Project directory holding design/ (default: cwd, else discovered)" },
          { name: "out", type: "string", summary: "Output HTML path (default: <project>/design/preview/specimen.html)" },
          { name: "split", type: "string", summary: "Emit one page per component into this dir (+ index.json) instead of one specimen" },
        ],
        errorCodes: ["UNKNOWN_FLAG", "DS_NOT_FOUND", "DS_TAMPERED", "BAD_MANIFEST", "WRITE_ERROR"],
      },
      soul: {
        summary: "Scaffold + structure-lint the declared design stance (design/soul.md); 'factory' prints the shipped design:os baseline",
        positionals: [{ name: "<init|check|factory>", required: true, summary: "init writes the scaffold; check structure-lints the file (exit 1 on errors); factory prints the shipped design:os baseline stance" }],
        flags: [
          { name: "dir", type: "string", summary: "Project directory holding design/ (default: cwd)" },
          { name: "force", type: "boolean", summary: "'soul init' only: overwrite an existing soul.md" },
          { name: "studio", type: "boolean", summary: "Target $EASE_DESIGN_HOME/studio-soul.md instead of the project soul; conflicts with --dir" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "EXISTS", "WRITE_ERROR", "READ_ERROR"],
      },
    },
  },

  designmd: {
    summary: "DESIGN.md (Google-Labs alpha spec) toolchain",
    subcommands: {
      "extract-tokens": {
        summary: "Emit frequency-ranked source tokens (colours, fonts, custom-props)",
        positionals: [{ name: "<html-path>", required: true, summary: "Source HTML file" }],
        flags: [
          { name: "css", type: "string", summary: "Additional CSS file(s) to scan — comma-separate for multiple (e.g. --css a.css,b.css); passing --css twice is a REPEATED_FLAG error, not a silent overwrite" },
          { name: "out", type: "string", summary: "Write the token report to a file" },
        ],
        errorCodes: [...IO_CODES, "WRITE_ERROR", "REPEATED_FLAG"],
      },
      snapshot: {
        summary: "Produce a self-contained preview HTML (CSS inlined, scripts stripped)",
        positionals: [{ name: "<html-path>", required: true, summary: "Source HTML file" }],
        flags: [
          { name: "origin", type: "string", required: true, summary: "Origin URL recorded in the snapshot" },
          { name: "css", type: "string", summary: "Additional CSS file to inline" },
          { name: "out", type: "string", summary: "Snapshot output path" },
        ],
        errorCodes: [...IO_CODES, "WRITE_ERROR"],
      },
      audit: {
        summary: "Run the 5 audit families on a per-project folder; gates the workflow",
        positionals: [{ name: "<folder-path>", required: true, summary: "Per-project DESIGN.md folder" }],
        flags: [],
        errorCodes: ["BAD_ARG", "FOLDER_MISSING", "READ_ERROR", "WRITE_ERROR"],
      },
    },
  },

  "ingest-figma-ds": {
    summary: "Onboard an existing Figma design system (ds.json → tokens + registry + DESIGN.md)",
    signature: {
      summary: "Compile a scan-design-system ds.json into portable tokens + registry + DESIGN.md",
      positionals: [{ name: "<ds.json>", required: true, summary: "figma-agent scan-design-system output" }],
      flags: [
        { name: "out", type: "string", summary: "Output directory (default: current working directory)" },
        { name: "name", type: "string", summary: "Design-system name for DESIGN.md (default: the --out folder name)" },
        { name: "seed-memory", type: "boolean", summary: "Also seed 'ui memory' (harvested + component_registered events)" },
        { name: "now", type: "string", summary: "Deterministic clock for the seeded memory graph (ISO-8601)" },
      ],
      errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_JSON", "BAD_DS", "WRITE_ERROR"],
    },
  },

  "ingest-css-ds": {
    summary: "Compile CSS custom properties (extract-tokens JSON) into a portable, unsealed tokens.json",
    signature: {
      summary: "Compile a 'designmd extract-tokens' output into DTCG tokens + modes",
      positionals: [{ name: "<extract-tokens.json>", required: true, summary: "ui designmd extract-tokens --css ... --out output" }],
      flags: [
        { name: "out", type: "string", summary: "Output directory (default: current working directory)" },
        { name: "name", type: "string", summary: "Recorded in the JSON summary only (no manifest is written here)" },
      ],
      errorCodes: ["UNKNOWN_FLAG", "BAD_ARG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_JSON", "LEAF_COLLISION", "WRITE_ERROR"],
    },
  },

  "synthesize-conventions": {
    summary: "Learn applied conventions from real screens (usage-dna.json → CONVENTIONS.md)",
    signature: {
      summary: "Compile a scan-conventions usage-dna.json into a CONVENTIONS.md of measured DO/DON'T",
      positionals: [{ name: "<usage-dna.json>", required: true, summary: "figma-agent scan-conventions output" }],
      flags: [
        { name: "ds", type: "string", summary: "DTCG tokens.json; cross-references the DS scale/grid to split valid values from real deviations" },
        { name: "out", type: "string", summary: "Output directory (default: current working directory)" },
        { name: "seed-memory", type: "boolean", summary: "Also seed 'ui memory' (a harvested anchor + prefers/avoids insight events)" },
        { name: "now", type: "string", summary: "Deterministic clock for the seeded memory graph (ISO-8601)" },
      ],
      errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_JSON", "BAD_DNA", "BAD_DS", "WRITE_ERROR"],
    },
  },

  memory: {
    summary: "Record, compile, and query the project's design memory + taste profile",
    subcommands: {
      record: {
        summary: "Append one validated event to the ledger (folds in a recompile)",
        positionals: [{ name: "<type>", required: true, summary: "Event type (v1 closed set)" }],
        flags: [
          { name: "data", type: "string", required: true, summary: "Event payload (JSON object)" },
          { name: "at", type: "string", summary: "Event timestamp (ISO-8601; default: system clock)" },
          { name: "actor", type: "string", summary: "Who caused the event" },
          { name: "medium", type: "string", values: ["html", "figma"], summary: "Output medium" },
          { name: "design", type: "string", summary: "Design id this event is about" },
          { name: "artifact-ref", type: "string", summary: "Artifact reference (file path or node id)" },
          { name: "fingerprint", type: "string", summary: "Artifact fingerprint (sha256:…)" },
          { name: "refs", type: "string", summary: "Comma-separated source event ids (required for insight)" },
          { name: "dir", type: "string", summary: "Project directory (default: cwd)" },
          { name: "no-registry", type: "boolean", summary: "Do not upsert this project into the user registry" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_EVENT_TYPE", "BAD_EVENT", "WRITE_ERROR"],
      },
      compile: {
        summary: "Rebuild memory.graph.json from the ledger",
        positionals: [],
        flags: [
          { name: "now", type: "string", summary: "Clock for decay + compiledAt (deterministic when fixed)" },
          { name: "dir", type: "string", summary: "Project directory (default: cwd)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "NO_MEMORY", "BAD_LEDGER", "WRITE_ERROR"],
      },
      context: {
        summary: "Emit a compact memory prior for the host model",
        positionals: [],
        flags: [
          { name: "for", type: "string", values: ["generate", "critique", "why"], summary: "Consumer mode (default generate)" },
          { name: "rank-file", type: "string", summary: "JSON array of ranked event ids to splice into the prior (never for --for critique)" },
          { name: "max-bytes", type: "string", summary: "Truncate the block, sections whole (default 2048)" },
          { name: "now", type: "string", summary: "Decay clock (deterministic when fixed)" },
          { name: "dir", type: "string", summary: "Project directory (default: cwd)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_LEDGER", "FILE_NOT_FOUND", "READ_ERROR"],
      },

      "export-corpus": {
        summary: "Emit tiered natural-language payloads for the recall workspace to embed",
        positionals: [],
        flags: [
          { name: "since", type: "string", summary: "Emit only items recorded after this event id" },
          { name: "dir", type: "string", summary: "Project directory (default: cwd)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_LEDGER"],
      },
      query: {
        summary: "List raw events, newest first",
        positionals: [],
        flags: [
          { name: "type", type: "string", summary: "Filter by event type" },
          { name: "design", type: "string", summary: "Filter by design id" },
          { name: "persona", type: "string", summary: "Filter by persona slug" },
          { name: "limit", type: "string", summary: "Max events (default 20)" },
          { name: "dir", type: "string", summary: "Project directory (default: cwd)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_LEDGER"],
      },
      fingerprint: {
        summary: "Print sha256:<hex> of a file's bytes",
        positionals: [{ name: "<file>", required: true, summary: "File to hash" }],
        flags: [],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR"],
      },
      consolidate: {
        summary: "Rebuild the cross-project taste profile (user scope)",
        positionals: [],
        flags: [
          { name: "insight", type: "string", summary: "Append one insight (needs --refs)" },
          { name: "refs", type: "string", summary: "Insight provenance JSON [{project,events}]" },
          { name: "actor", type: "string", summary: "Restrict to one actor's events" },
          { name: "now", type: "string", summary: "Consolidation clock (deterministic when fixed)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG"],
      },
      status: {
        summary: "Ledger count, graph freshness, registry size, profile presence",
        positionals: [],
        flags: [{ name: "dir", type: "string", summary: "Project directory (default: cwd)" }],
        errorCodes: ["UNKNOWN_FLAG"],
      },
    },
  },

  agents: {
    summary: "Generate + lint soul-bound, task-scoped project agents (Claude Code)",
    subcommands: {
      init: {
        summary: "Generate one .claude/agents/<name>.md per roster role from the project DS + studio soul",
        positionals: [],
        flags: [
          { name: "dir", type: "string", summary: "Project directory holding design/ (default: walk up from cwd)" },
          { name: "roster", type: "string", summary: "Comma-separated roles to generate: designer,curator,figma-hand (default: all 3)" },
          { name: "force", type: "boolean", summary: "Overwrite existing agent files" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "DS_NOT_FOUND", "BAD_MANIFEST", "EXISTS", "READ_ERROR", "WRITE_ERROR"],
      },
      list: {
        summary: "List stamped design-os agents (role / name / hash / fresh)",
        positionals: [],
        flags: [{ name: "dir", type: "string", summary: "Project directory (default: the discovered DS project, else cwd)" }],
        errorCodes: ["UNKNOWN_FLAG", "DS_NOT_FOUND", "BAD_MANIFEST", "READ_ERROR"],
      },
      check: {
        summary: "Findings-linter over generated agents (agent-stale / agent-unknown-role / no-agents)",
        positionals: [],
        flags: [{ name: "dir", type: "string", summary: "Project directory (default: the discovered DS project, else cwd)" }],
        errorCodes: ["UNKNOWN_FLAG", "DS_NOT_FOUND", "BAD_MANIFEST", "READ_ERROR"],
      },
    },
  },

  knowledge: {
    summary: "Governance checks over the knowledge core (index / persona / xref / provenance drift)",
    subcommands: {
      check: {
        summary: "Findings-linter over knowledge/; exit 1 on error-severity findings",
        positionals: [],
        flags: [
          { name: "dir", type: "string", summary: "Repo root holding knowledge/ (default: current working directory)" },
          { name: "as-of", type: "string", summary: "Reference month YYYYMM for benchmark-stale (default: current month)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "NO_KNOWLEDGE", "BAD_AS_OF", "READ_ERROR"],
      },
    },
  },

  taste: {
    summary: "Vote-driven taste corpus: ingest, pairwise Elo ranking, study verdicts",
    subcommands: {
      ingest: {
        summary: "Scan taste/inbox/<genre>/ (+ optional --dir sources), dedup by sha256/dHash, move/copy into corpus/",
        positionals: [],
        flags: [
          { name: "root", type: "string", summary: "Store root (default: DESIGN_OS_TASTE_ROOT env, else <cwd>/taste)" },
          { name: "dir", type: "string", summary: "Extra source directory outside inbox/ (comma-separated for more than one)" },
          { name: "genre", type: "string", summary: "Genre tag for files pulled in via --dir (required whenever --dir is given)" },
          { name: "source-url", type: "string", summary: "Provenance URL recorded on every item ingested this run" },
        ],
        errorCodes: ["E_TASTE_BAD_FLAGS", "E_TASTE_LEDGER", "UNKNOWN_FLAG"],
      },
      next: {
        summary: "Propose the next pair (--mode pair) or study item (--mode study); read-only",
        positionals: [],
        flags: [
          { name: "root", type: "string", summary: "Store root (default: DESIGN_OS_TASTE_ROOT env, else <cwd>/taste)" },
          { name: "mode", type: "string", required: true, values: ["pair", "study"], summary: "pair or study" },
          { name: "genre", type: "string", summary: "Restrict to one genre" },
        ],
        errorCodes: ["E_TASTE_ROOT", "E_TASTE_BAD_FLAGS", "E_TASTE_NO_ITEMS", "UNKNOWN_FLAG"],
      },
      record: {
        summary: "Append one validated pair vote (--mode pair) or study verdict (--mode study)",
        positionals: [],
        flags: [
          { name: "root", type: "string", summary: "Store root (default: DESIGN_OS_TASTE_ROOT env, else <cwd>/taste)" },
          { name: "mode", type: "string", required: true, values: ["pair", "study"], summary: "pair or study" },
          { name: "a", type: "string", summary: "Item id (required with --mode pair)" },
          { name: "b", type: "string", summary: "Item id, must differ from --a (required with --mode pair)" },
          { name: "winner", type: "string", values: ["a", "b", "tie", "skip"], summary: "Which item won (required with --mode pair)" },
          { name: "reasons", type: "string", summary: "Comma-separated reason tags (--mode pair)" },
          { name: "note", type: "string", summary: "Free-text note" },
          { name: "swapped", type: "boolean", summary: "Echo the display order 'taste next' returned (--mode pair)" },
          { name: "repeat-of", type: "string", summary: "ts of the original vote this repeats (--mode pair)" },
          { name: "ms", type: "string", summary: "Time-to-decide, milliseconds (--mode pair)" },
          { name: "item", type: "string", summary: "Item id (required with --mode study)" },
          { name: "verdict", type: "string", values: ["LEARN", "PARTIAL", "SKIP"], summary: "Required with --mode study" },
          { name: "blind-verdict", type: "string", values: ["LEARN", "PARTIAL", "SKIP"], summary: "Verdict recorded before seeing the known lesson (--mode study)" },
          { name: "lesson-ref", type: "string", summary: "Path to the knowledge/ entry this verdict folds into (--mode study)" },
        ],
        errorCodes: ["E_TASTE_ROOT", "E_TASTE_BAD_FLAGS", "E_TASTE_UNKNOWN_ITEM", "E_TASTE_BAD_VOTE", "E_TASTE_LEDGER", "UNKNOWN_FLAG"],
      },
      status: {
        summary: "Ledger counts, top-Elo per genre, self-consistency from repeat votes",
        positionals: [],
        flags: [
          { name: "root", type: "string", summary: "Store root (default: DESIGN_OS_TASTE_ROOT env, else <cwd>/taste)" },
          { name: "genre", type: "string", summary: "Restrict counts/top-Elo/consistency to one genre" },
        ],
        errorCodes: ["E_TASTE_ROOT", "E_TASTE_LEDGER", "UNKNOWN_FLAG"],
      },
    },
  },
};

// ─── Lookup helper (shared by `ui schema` and the central flag guard) ─────────

/**
 * Resolve the signature governing an invocation, or null when none applies
 * (unknown command, dispatcher invoked without/with an unknown subcommand —
 * those cases produce their own BAD_ARG downstream).
 */
export function signatureFor(
  command: string,
  subcommand: string | undefined,
): CommandSignature | null {
  const entry = COMMAND_SIGNATURES[command];
  if (entry === undefined) return null;
  if (entry.subcommands !== undefined) {
    if (subcommand === undefined) return null;
    return entry.subcommands[subcommand] ?? null;
  }
  return entry.signature ?? null;
}
