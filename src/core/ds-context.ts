/**
 * DS context formatter: DesignSystem → markdown string or structured object.
 *
 * Only semantic tokens (those whose source $value was an alias) appear in the
 * default token table. Primitives are intentionally omitted to keep context
 * blocks concise and model-friendly.
 */
import { isAlias } from "./token-model.js";
import type { DesignSystem } from "./design-system.js";
import type { ResolvedToken } from "./token-model.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContextSection = "tokens" | "registry" | "naming" | "anti-patterns";

export interface ContextOptions {
  include: ContextSection[];
  strict: boolean;
  maxBytes: number;
}

export interface StructuredContext {
  name: string;
  generation: number;
  persona: { slug: string; family: string };
  intent: string;
  semantic: { path: string; value: string }[];
  registry: { name: string; category: string; tokensUsed: string[] }[];
  naming: { rule: string }[];
  antiPatterns: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NAMING_RULES = [
  "Use semantic tokens, never primitives, in markup.",
  "Component names follow `Category/Variant` PascalCase.",
  "One canonical name per concept.",
];

const STRICT_PREAMBLE =
  "> ENFORCEMENT: This is the active design system. Any new design **MUST** consume\n" +
  "> only the semantic tokens below and only the registered components below. Adding\n" +
  "> a new component requires `ui registry register`. Adding/changing a token\n" +
  "> requires `ui ds change-token`.\n";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a resolved token value as a human-readable string. */
function formatValue(token: ResolvedToken): string {
  const v = token.value;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    // Typography composite
    if ("fontFamily" in obj || "fontSize" in obj) {
      const parts: string[] = [];
      if (obj["fontFamily"]) parts.push(String(obj["fontFamily"]));
      if (obj["fontSize"])   parts.push(String(obj["fontSize"]));
      if (obj["fontWeight"]) parts.push(`/ ${String(obj["fontWeight"])}`);
      if (obj["lineHeight"]) parts.push(`/ ${String(obj["lineHeight"])}`);
      return parts.join(" ");
    }
    // Shadow composite
    if ("offsetX" in obj || "blur" in obj) {
      return [
        obj["offsetX"] ?? "0px",
        obj["offsetY"] ?? "0px",
        obj["blur"]    ?? "0px",
        obj["spread"]  ?? "0px",
        obj["color"]   ?? "",
      ].join(" ");
    }
    return JSON.stringify(v);
  }
  return String(v);
}

/**
 * Extract only the semantic tokens from a DesignSystem.
 * A token is semantic when its source $value in tokens tree is an alias string.
 * Returns resolved tokens sorted by category then path.
 */
function semanticTokens(ds: DesignSystem): ResolvedToken[] {
  const result: ResolvedToken[] = [];
  for (const [category, group] of Object.entries(ds.tokens)) {
    for (const [name, token] of Object.entries(group)) {
      if (isAlias(token.$value)) {
        const path = `${category}.${name}`;
        const resolved = ds.resolved.find((r) => r.path === path);
        if (resolved !== undefined) {
          result.push(resolved);
        }
      }
    }
  }
  // Sort: category alphabetical, then path within category
  result.sort((a, b) => {
    const [ac] = a.path.split(".");
    const [bc] = b.path.split(".");
    if (ac !== bc) return (ac ?? "").localeCompare(bc ?? "");
    return a.path.localeCompare(b.path);
  });
  return result;
}

// ─── Truncation ───────────────────────────────────────────────────────────────

/**
 * Apply deterministic truncation to stay within maxBytes.
 * Drop order: anti-patterns beyond 5 → registry beyond 10 → tokens beyond 30.
 */
function applyTruncation(
  antiPatterns: string[],
  registryRows: { name: string; category: string; tokensUsed: string[] }[],
  tokenRows: ResolvedToken[],
  maxBytes: number,
  formatter: (
    ap: string[],
    reg: typeof registryRows,
    tok: ResolvedToken[],
  ) => string,
): { content: string; truncated: boolean } {
  // Try progressively more aggressive truncation
  const apLimits = [antiPatterns.length, 5];
  const regLimits = [registryRows.length, 10];
  const tokLimits = [tokenRows.length, 30];

  for (const apLimit of apLimits) {
    for (const regLimit of regLimits) {
      for (const tokLimit of tokLimits) {
        const ap  = antiPatterns.slice(0, apLimit);
        const reg = registryRows.slice(0, regLimit);
        const tok = tokenRows.slice(0, tokLimit);
        const content = formatter(ap, reg, tok);
        if (Buffer.byteLength(content, "utf8") <= maxBytes) {
          const truncated =
            apLimit < antiPatterns.length ||
            regLimit < registryRows.length ||
            tokLimit < tokenRows.length;
          return { content, truncated };
        }
      }
    }
  }

  // Final fallback: hard truncate bytes (markdown only; JSON uses row-drop strategy instead)
  const ap  = antiPatterns.slice(0, 5);
  const reg = registryRows.slice(0, 10);
  const tok = tokenRows.slice(0, 30);
  let content = formatter(ap, reg, tok);
  if (Buffer.byteLength(content, "utf8") > maxBytes) {
    const buf = Buffer.from(content, "utf8");
    // "…(truncated)" is 15 bytes (… = 3 UTF-8 bytes) plus "\n" prefix = 15 total
    content = buf.slice(0, maxBytes - 15).toString("utf8") + "\n…(truncated)";
  }
  return { content, truncated: true };
}

// ─── Markdown formatter ───────────────────────────────────────────────────────

/** Format the design system as a markdown context block. */
export function formatMarkdown(ds: DesignSystem, opts: ContextOptions): string {
  const { include, strict, maxBytes } = opts;
  const sem = semanticTokens(ds);
  const regRows = ds.registry.components.map((c) => ({
    name: c.name,
    category: c.category,
    tokensUsed: c.tokensUsed,
  }));

  // Anti-patterns are persisted in the manifest at ds init time.
  const antiPatterns: string[] = ds.manifest.persona.antiPatterns ?? [];

  const build = (
    ap: string[],
    reg: typeof regRows,
    tok: ResolvedToken[],
  ): string => {
    const lines: string[] = [];

    const m = ds.manifest;
    lines.push(
      `# Design System: ${m.name}  (generation ${m.generation}, persona ${m.persona.slug} / ${m.persona.family})`,
      "",
      `Intent: ${m.intent}`,
      "",
    );

    if (strict) {
      lines.push(STRICT_PREAMBLE);
    }

    if (include.includes("tokens")) {
      lines.push("## Tokens (semantic only)", "");
      if (tok.length === 0) {
        lines.push("(no semantic tokens)", "");
      } else {
        const col1 = Math.max(5, ...tok.map((t) => t.path.length));
        const col2 = Math.max(11, ...tok.map((t) => formatValue(t).length));
        lines.push(
          `| ${"Token".padEnd(col1)} | ${"Resolves to".padEnd(col2)} |`,
          `|${"-".repeat(col1 + 2)}|${"-".repeat(col2 + 2)}|`,
        );
        for (const t of tok) {
          lines.push(`| ${t.path.padEnd(col1)} | ${formatValue(t).padEnd(col2)} |`);
        }
        lines.push("");
      }
    }

    if (include.includes("registry")) {
      lines.push("## Registered components", "");
      if (reg.length === 0) {
        lines.push(
          "(none yet — generations may register new components via `ui registry register`)",
          "",
        );
      } else {
        for (const c of reg) {
          lines.push(`- **${c.name}** (${c.category}) — tokens: ${c.tokensUsed.join(", ")}`);
        }
        lines.push("");
      }
    }

    if (include.includes("naming")) {
      lines.push("## Naming rules", "");
      for (const rule of NAMING_RULES) {
        lines.push(`- ${rule}`);
      }
      lines.push("");
    }

    if (include.includes("anti-patterns")) {
      lines.push("## Anti-patterns (from persona)", "");
      if (ap.length === 0) {
        lines.push("(none recorded)", "");
      } else {
        for (const p of ap) {
          lines.push(`- ${p}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  };

  const { content } = applyTruncation(antiPatterns, regRows, sem, maxBytes, build);
  return content;
}

// ─── Structured formatter ─────────────────────────────────────────────────────

/**
 * Build a StructuredContext object from the given row slices.
 * Never produces a string — returns the object directly to avoid JSON.parse on
 * potentially-truncated content (which would produce invalid JSON).
 */
function buildStructured(
  ds: DesignSystem,
  include: ContextSection[],
  ap: string[],
  reg: { name: string; category: string; tokensUsed: string[] }[],
  tok: ResolvedToken[],
): StructuredContext {
  return {
    name: ds.manifest.name,
    generation: ds.manifest.generation,
    persona: ds.manifest.persona,
    intent: ds.manifest.intent,
    semantic: include.includes("tokens")
      ? tok.map((t) => ({ path: t.path, value: formatValue(t) }))
      : [],
    registry: include.includes("registry") ? reg : [],
    naming: include.includes("naming")
      ? NAMING_RULES.map((r) => ({ rule: r }))
      : [],
    antiPatterns: include.includes("anti-patterns") ? ap : [],
  };
}

/** Format the design system as a structured JSON-serialisable object.
 *
 * Truncation drops whole rows deterministically (anti-patterns → registry → tokens)
 * so the result is always a valid object — no mid-string slicing.
 * If even the minimal object exceeds maxBytes, rows are dropped until it fits or
 * all variable rows are exhausted (fixed header fields are never trimmed).
 */
export function formatStructured(ds: DesignSystem, opts: ContextOptions): StructuredContext {
  const { include, maxBytes } = opts;
  const sem = semanticTokens(ds);
  const regRows = ds.registry.components.map((c) => ({
    name: c.name,
    category: c.category,
    tokensUsed: c.tokensUsed,
  }));
  // Anti-patterns are persisted in the manifest at ds init time.
  const antiPatterns: string[] = ds.manifest.persona.antiPatterns ?? [];

  // Try progressively more aggressive truncation — drop rows, never mid-string slice
  const apLimits = [antiPatterns.length, 5, 0];
  const regLimits = [regRows.length, 10, 5, 0];
  const tokLimits = [sem.length, 30, 15, 5, 0];

  for (const apLimit of apLimits) {
    for (const regLimit of regLimits) {
      for (const tokLimit of tokLimits) {
        const ctx = buildStructured(
          ds, include,
          antiPatterns.slice(0, apLimit),
          regRows.slice(0, regLimit),
          sem.slice(0, tokLimit),
        );
        if (Buffer.byteLength(JSON.stringify(ctx), "utf8") <= maxBytes) {
          return ctx;
        }
      }
    }
  }

  // Budget is too small even for zero rows — return the minimal header-only object
  return buildStructured(ds, include, [], [], []);
}

// ─── Include parser ───────────────────────────────────────────────────────────

const ALL_SECTIONS: ContextSection[] = ["tokens", "registry", "naming", "anti-patterns"];
const VALID_SECTIONS = new Set<string>(ALL_SECTIONS);

/**
 * Parse a comma-separated include string into a validated ContextSection[].
 * Returns all sections when the input is undefined or empty.
 * Throws on unknown section names (caller converts to BAD_ARG).
 */
export function parseInclude(raw: unknown): ContextSection[] {
  if (raw === undefined || raw === null || raw === "") return [...ALL_SECTIONS];
  const parts = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return [...ALL_SECTIONS];
  for (const p of parts) {
    if (!VALID_SECTIONS.has(p)) {
      throw new Error(
        `unknown --include value '${p}'. Valid sections: ${ALL_SECTIONS.join(", ")}`,
      );
    }
  }
  return parts as ContextSection[];
}
