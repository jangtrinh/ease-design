/**
 * DS context formatter: DesignSystem → markdown string or structured object.
 *
 * Only semantic tokens (those whose source $value was an alias) appear in the
 * default token table. Primitives are intentionally omitted to keep context
 * blocks concise and model-friendly.
 */
import { isAlias } from "./token-model.js";
import { soulSectionForContext } from "./ds-soul.js";
import { studioSoulSectionForContext } from "./ds-soul-studio.js";
import type { DesignSystem } from "./design-system.js";
import type { ResolvedToken } from "./token-model.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContextSection = "tokens" | "registry" | "naming" | "anti-patterns" | "soul";

export interface ContextOptions {
  include: ContextSection[];
  strict: boolean;
  maxBytes: number;
  /**
   * Raw text of design/soul.md, read by the COMMAND layer (ds-context-impl.ts)
   * and passed in — this formatter stays pure (no fs). Undefined when the
   * project has no soul.md; the section is then simply omitted, never an error.
   */
  soul?: string;
  /**
   * Raw text of $EASE_DESIGN_HOME/studio-soul.md — the genealogy layer ABOVE
   * every project soul — read by the command layer the same way as `soul`.
   * Undefined when no studio soul exists; its section is then simply omitted,
   * never an error. Rendered AFTER the project `soul` section: the project is
   * the more specific, later-declared layer and wins on conflict.
   */
  studioSoul?: string;
}

export interface StructuredContext {
  name: string;
  generation: number;
  persona: { slug: string; family: string };
  intent: string;
  /** design/soul.md content (capped), or null when absent / not included. */
  soul: string | null;
  /** $EASE_DESIGN_HOME/studio-soul.md content (capped), or null when absent / not included. */
  studioSoul: string | null;
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
  "> ENFORCEMENT: This is the active design system. Any new design **MUST** style\n" +
  "> exclusively with the semantic tokens below — never hardcode colors, spacing,\n" +
  "> radius, or shadow when a token covers them. Prefer a registered component\n" +
  "> below when one fits; when none does (e.g. the registry is empty on the first\n" +
  "> generation), design the component from these tokens and register it with\n" +
  "> `ui registry register` so the next generation can reuse it. Adding/changing a\n" +
  "> token requires `ui ds change-token`.\n";

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
 *
 * A token is semantic when it carries the `$extensions.ease.layer = "semantic"`
 * marker stamped at expand time (persona-expand.ts). Falls back to alias-shape
 * detection so token files predating the marker still render correctly.
 *
 * The marker is required because `ds change-token` can convert an alias into a
 * literal (e.g. `color.primary` from `{primary.500}` → `#FF0066`). Without the
 * marker, the value-shape filter would silently drop the token from the host
 * model's context block, leaving the model with no semantic token to use.
 */
function semanticTokens(ds: DesignSystem): ResolvedToken[] {
  const result: ResolvedToken[] = [];
  for (const [category, group] of Object.entries(ds.tokens)) {
    for (const [name, token] of Object.entries(group)) {
      const layer = (token.$extensions as { ease?: { layer?: string } } | undefined)?.ease?.layer;
      const isSemantic = layer === "semantic" || isAlias(token.$value);
      if (isSemantic) {
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
  const { include, strict, maxBytes, soul, studioSoul } = opts;
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

    // The soul is the declared stance every flow reads BEFORE personas/tokens,
    // so it leads the sections. Absent soul.md → no section, never an error.
    if (include.includes("soul") && soul !== undefined) {
      lines.push(
        "## Soul (declared stance — precedence: brief > soul > memory > floors)",
        "",
        soulSectionForContext(soul),
        "",
      );
    }

    // The studio soul is the genealogy layer ABOVE every project soul — it
    // rides the same `soul` include (one concept, two tiers) and always
    // renders AFTER the project section above, since project is the more
    // specific, later-declared layer and wins on conflict.
    if (include.includes("soul") && studioSoul !== undefined) {
      lines.push(
        "## Soul — studio (inherited base; the project soul above overrides it on conflict)",
        "",
      );
      if (soul === undefined) {
        lines.push("_no project soul yet — this is the only declared layer_", "");
      }
      lines.push(studioSoulSectionForContext(studioSoul), "");
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
  soul: string | null,
  studioSoul: string | null,
  ap: string[],
  reg: { name: string; category: string; tokensUsed: string[] }[],
  tok: ResolvedToken[],
): StructuredContext {
  return {
    name: ds.manifest.name,
    generation: ds.manifest.generation,
    persona: ds.manifest.persona,
    intent: ds.manifest.intent,
    soul: include.includes("soul") ? soul : null,
    studioSoul: include.includes("soul") ? studioSoul : null,
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
 * Truncation drops whole rows deterministically (anti-patterns → registry → tokens),
 * then — only if zero-row versions still exceed the budget — drops soul text
 * (the declared stance outranks token rows, so it is dropped LAST), so the result
 * is always a valid object — no mid-string slicing. The studio soul (the more
 * expendable, inherited-base layer) drops before the project soul does — see
 * `soulPairs` below — since the project soul is the more specific layer and
 * wins on conflict everywhere else in this formatter too.
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
  const soulText = opts.soul !== undefined ? soulSectionForContext(opts.soul) : null;
  const studioSoulText = opts.studioSoul !== undefined ? studioSoulSectionForContext(opts.studioSoul) : null;

  // Preference-ordered (soul, studioSoul) pairs — keep both as long as budget
  // allows; sacrifice the studio layer first; drop the project soul only as
  // the last resort before falling through to zero rows below. When there is
  // no studio soul at all this reduces to the same 2-state ladder as before
  // (byte-identical behaviour for every caller that never sets studioSoul).
  const soulPairs: { soul: string | null; studio: string | null }[] =
    soulText !== null && studioSoulText !== null
      ? [
          { soul: soulText, studio: studioSoulText },
          { soul: soulText, studio: null },
          { soul: null, studio: null },
        ]
      : soulText !== null
      ? [{ soul: soulText, studio: null }, { soul: null, studio: null }]
      : studioSoulText !== null
      ? [{ soul: null, studio: studioSoulText }, { soul: null, studio: null }]
      : [{ soul: null, studio: null }];

  // Try progressively more aggressive truncation — drop rows, never mid-string slice
  const apLimits = [antiPatterns.length, 5, 0];
  const regLimits = [regRows.length, 10, 5, 0];
  const tokLimits = [sem.length, 30, 15, 5, 0];

  for (const pair of soulPairs) {
    for (const apLimit of apLimits) {
      for (const regLimit of regLimits) {
        for (const tokLimit of tokLimits) {
          const ctx = buildStructured(
            ds, include, pair.soul, pair.studio,
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
  }

  // Budget is too small even for zero rows — return the minimal header-only object
  return buildStructured(ds, include, null, null, [], [], []);
}

// ─── Include parser ───────────────────────────────────────────────────────────

const ALL_SECTIONS: ContextSection[] = ["tokens", "registry", "naming", "anti-patterns", "soul"];
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
