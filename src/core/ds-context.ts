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
import { factorySoulSectionForContext } from "./ds-soul-factory.js";
import { summarizeRoles, rolesMarkdownLines } from "./ds-context-roles.js";
import type { RolesSummary } from "./ds-context-roles.js";
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
  /**
   * The shipped design:os baseline stance (capped) — the tier BELOW every
   * project/studio soul, compiled in (no fs), so it is present whenever the
   * "soul" section is included. Null ONLY when "soul" is not in `include`.
   */
  factorySoul: string | null;
  semantic: { path: string; value: string }[];
  registry: { name: string; category: string; tokensUsed: string[] }[];
  naming: { rule: string }[];
  antiPatterns: string[];
  /**
   * Roles recognized (spec 011 P2) from the BAKED `$extensions["design-os.role"]`
   * annotation — never recomputed here (an owner's `ds set-role` correction must
   * stick). Empty when the "tokens" section is excluded or no token in the DS
   * carries a baked role (e.g. imported before this feature shipped).
   */
  roles: { role: string; paths: string[] }[];
  /** Canonical roles with zero recognized tokens; same omission rule as `roles`. */
  roleGaps: string[];
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
  // Roles read the BAKED annotation off the full raw tree (not just the
  // "semantic" filter above — a role can live on a literal-valued token too,
  // e.g. dana's surface-content). Never recomputed — see ds-context-roles.ts.
  const rolesSummary = summarizeRoles(ds.tokens);
  const regRows = ds.registry.components.map((c) => ({
    name: c.name,
    category: c.category,
    tokensUsed: c.tokensUsed,
  }));

  // Anti-patterns are persisted in the manifest at ds init time.
  const antiPatterns: string[] = ds.manifest.persona.antiPatterns ?? [];

  // ── Fixed prefix: header + strict preamble + the whole soul chain ────────────
  // EXEMPT from `maxBytes`. That budget governs only the VARIABLE data dump (the
  // token / registry / naming / anti-pattern tables, whose size scales with the
  // system). The declared-stance prose — project soul, studio soul, factory
  // baseline — is fixed and already has its OWN size mechanism: each runs through
  // soulSectionForContext's 150-line cap. Budgeting the soul chain against the
  // same bytes as the tables let a large soul (or the always-present ~2.5KB
  // factory baseline) STARVE the tokens to zero on a default call — the whole
  // point of `ds context` is to deliver those tokens. Exempting the whole chain
  // (not just factory) fixes the class: a 150-line project soul had the same
  // blind spot. Mirrors the `--with-theme` exemption in ds-context-impl.ts.
  const prefixLines: string[] = [];
  const m = ds.manifest;
  prefixLines.push(
    `# Design System: ${m.name}  (generation ${m.generation}, persona ${m.persona.slug} / ${m.persona.family})`,
    "",
    `Intent: ${m.intent}`,
    "",
  );

  if (strict) {
    prefixLines.push(STRICT_PREAMBLE);
  }

  // The soul is the declared stance every flow reads BEFORE personas/tokens,
  // so it leads the sections. Absent soul.md → no section, never an error.
  if (include.includes("soul") && soul !== undefined) {
    prefixLines.push(
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
    prefixLines.push(
      "## Soul — studio (inherited base; the project soul above overrides it on conflict)",
      "",
    );
    if (soul === undefined) {
      prefixLines.push("_no project soul yet — this is the only declared layer_", "");
    }
    prefixLines.push(studioSoulSectionForContext(studioSoul), "");
  }

  // The factory baseline is the stance design:os itself ships — the tier
  // BELOW every project/studio soul. It is a compiled-in constant (no fs), so
  // it renders LAST in the soul chain whenever the section is included, even
  // when the project has declared no soul of its own: mass users get a
  // world-class stance day-0. Any soul above overrides it clause-by-clause.
  if (include.includes("soul")) {
    prefixLines.push(
      "## Soul — factory (design:os baseline; any project/studio soul above overrides it)",
      "",
    );
    if (soul === undefined && studioSoul === undefined) {
      prefixLines.push(
        "_no project or studio soul declared yet — this baseline is the only stance layer; run 'ui ds soul init' to declare yours_",
        "",
      );
    }
    prefixLines.push(factorySoulSectionForContext(), "");
  }

  // Roles + gaps (spec 011 P2) are declared metadata, not variable data — a real
  // LIVE run on dana's 414-token DS (100 recognized) showed the role list itself
  // can be large enough to blow the default 4096-byte budget, truncating the
  // "## Missing roles" gap list right out of the output. Exempt the whole
  // section from `maxBytes`, same reasoning as the soul chain above: read from
  // the BAKED annotation, never recomputed, so an owner's `ds set-role`
  // correction is never silently dropped by a byte budget either.
  if (include.includes("tokens")) {
    prefixLines.push(...rolesMarkdownLines(rolesSummary));
  }

  // ── Variable tail: token / registry / naming / anti-pattern tables ───────────
  // The ONLY part `maxBytes` truncates.
  const build = (
    ap: string[],
    reg: typeof regRows,
    tok: ResolvedToken[],
  ): string => {
    const lines: string[] = [];

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

  // Budget bounds only the variable tail; the soul-chain prefix is fixed prose.
  const { content: tail } = applyTruncation(antiPatterns, regRows, sem, maxBytes, build);
  const prefix = prefixLines.join("\n");
  // prefixLines ends with a trailing "" (→ prefix ends "\n"); one more "\n"
  // restores the blank line that separated the last prefix block from the first
  // table heading in the old single-array layout.
  return tail === "" ? prefix : prefix + "\n" + tail;
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
  rolesSummary: RolesSummary | null,
  ap: string[],
  reg: { name: string; category: string; tokensUsed: string[] }[],
  tok: ResolvedToken[],
): StructuredContext {
  return {
    name: ds.manifest.name,
    generation: ds.manifest.generation,
    persona: ds.manifest.persona,
    intent: ds.manifest.intent,
    // The whole soul chain is exempt from the byte budget (see formatStructured):
    // project soul, studio soul, and the compiled-in factory baseline all ride
    // through at full (capped) text whenever the soul section is included.
    soul: include.includes("soul") ? soul : null,
    studioSoul: include.includes("soul") ? studioSoul : null,
    factorySoul: include.includes("soul") ? factorySoulSectionForContext() : null,
    semantic: include.includes("tokens")
      ? tok.map((t) => ({ path: t.path, value: formatValue(t) }))
      : [],
    registry: include.includes("registry") ? reg : [],
    naming: include.includes("naming")
      ? NAMING_RULES.map((r) => ({ rule: r }))
      : [],
    antiPatterns: include.includes("anti-patterns") ? ap : [],
    // Roles ride the same "tokens" include and the same exemption as the soul
    // chain — read from the BAKED annotation, never recomputed (see
    // ds-context-roles.ts), so an owner's `ds set-role` correction always wins.
    roles: include.includes("tokens") && rolesSummary !== null
      ? rolesSummary.roles.map((r) => ({ role: r.role, paths: r.paths }))
      : [],
    roleGaps: include.includes("tokens") && rolesSummary !== null ? [...rolesSummary.gaps] : [],
  };
}

/** Serialised byte size of ONLY the variable sections of a structured context —
 * the token / registry / naming / anti-pattern payload the `maxBytes` budget
 * governs. The fixed header fields AND the soul chain (soul/studioSoul/factory)
 * are excluded: they are declared-stance prose, exempt from the budget (each
 * already capped at 150 lines by soulSectionForContext). */
function variableBytes(ctx: StructuredContext): number {
  return Buffer.byteLength(
    JSON.stringify({
      semantic: ctx.semantic,
      registry: ctx.registry,
      naming: ctx.naming,
      antiPatterns: ctx.antiPatterns,
    }),
    "utf8",
  );
}

/** Format the design system as a structured JSON-serialisable object.
 *
 * `maxBytes` bounds ONLY the variable data dump (token/registry/naming/anti-pattern
 * rows): truncation drops whole rows deterministically (anti-patterns → registry →
 * tokens), never a mid-string slice, so the result is always a valid object. The
 * soul chain — project soul, studio soul, and the always-present factory baseline —
 * is FIXED declared-stance prose, exempt from the budget (mirrors formatMarkdown's
 * prefix and the `--with-theme` exemption): it is never dropped to make room for
 * tokens, because a large soul (or the ~2.5KB factory constant) starving the tokens
 * defeats the point of `ds context`. Each soul layer has its own size cap
 * (soulSectionForContext, 150 lines). Fixed header fields are never trimmed either.
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
  // The soul chain is always at full (capped) text — never dropped for budget.
  const soulText = opts.soul !== undefined ? soulSectionForContext(opts.soul) : null;
  const studioSoulText = opts.studioSoul !== undefined ? studioSoulSectionForContext(opts.studioSoul) : null;
  // Roles ride the same exemption — read from the baked annotation, never recomputed.
  const rolesSummary = summarizeRoles(ds.tokens);

  // Try progressively more aggressive truncation of the VARIABLE rows only —
  // drop rows, never mid-string slice; the soul chain stays whole throughout.
  const apLimits = [antiPatterns.length, 5, 0];
  const regLimits = [regRows.length, 10, 5, 0];
  const tokLimits = [sem.length, 30, 15, 5, 0];

  for (const apLimit of apLimits) {
    for (const regLimit of regLimits) {
      for (const tokLimit of tokLimits) {
        const ctx = buildStructured(
          ds, include, soulText, studioSoulText, rolesSummary,
          antiPatterns.slice(0, apLimit),
          regRows.slice(0, regLimit),
          sem.slice(0, tokLimit),
        );
        if (variableBytes(ctx) <= maxBytes) {
          return ctx;
        }
      }
    }
  }

  // Budget is too small even for zero variable rows — the soul chain still rides
  // through whole (it is exempt); only the row sections collapse to empty.
  return buildStructured(ds, include, soulText, studioSoulText, rolesSummary, [], [], []);
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
