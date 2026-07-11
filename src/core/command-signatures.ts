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
      ],
      errorCodes: [...IO_CODES, "BAD_JSON"],
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
          { name: "states", type: "string", values: ["default", "hover", "active", "focus", "disabled"], summary: "Comma-separated states (each from the enum)" },
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
          { name: "persona-data", type: "string", summary: "Override the personas.json path (test support)" },
        ],
        errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "BAD_NAME", "BAD_INTENT", "BAD_BRAND_HEX", "PERSONA_NOT_FOUND", "BAD_TOKEN", "DS_EXISTS", "WRITE_ERROR"],
      },
      context: {
        summary: "Emit the active design system as a context block for the host model",
        positionals: [],
        flags: [
          { name: "strict", type: "boolean", summary: "Prepend the registered-components-only enforcement preamble" },
          { name: "with-theme", type: "boolean", summary: "Also emit the compiled Tailwind v4 @theme block (full token map, immune to --max-bytes)" },
          { name: "include", type: "string", summary: "Comma-separated sections: tokens,registry,naming,anti-patterns" },
          { name: "format", type: "string", values: ["markdown", "json"], summary: "Output format (default markdown)" },
          { name: "max-bytes", type: "string", summary: "Truncate the context block to fit n bytes (default 4096)" },
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
      status: {
        summary: "Show the manifest summary (generation, persona, hashes)",
        positionals: [],
        flags: [{ name: "dir", type: "string", summary: "Override the project directory" }],
        errorCodes: ["UNKNOWN_FLAG", "DS_NOT_FOUND", "DS_TAMPERED", "BAD_MANIFEST"],
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
          { name: "css", type: "string", summary: "Additional CSS file to scan" },
          { name: "out", type: "string", summary: "Write the token report to a file" },
        ],
        errorCodes: [...IO_CODES, "WRITE_ERROR"],
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
