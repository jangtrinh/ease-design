/**
 * DTCG token file types, parse/validation, and predicate helpers.
 *
 * Accepts a two-tier token file (primitives + semantics in one JSON object).
 * Validates that every leaf has a known $type and a $value; does NOT resolve
 * aliases — that is token-resolve.ts's job.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TokenType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "number"
  | "duration"
  | "shadow"
  | "typography";

const KNOWN_TYPES: ReadonlySet<string> = new Set<TokenType>([
  "color", "dimension", "fontFamily", "fontWeight", "number", "duration", "shadow", "typography",
]);

export interface Token {
  $value: string | number | Record<string, unknown>;
  $type: TokenType;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

/** A category group: one level of nesting under the top-level category key. */
export type TokenGroup = Record<string, Token>;

/** The top-level token file: category → group of token leaves. */
export type TokenTree = Record<string, TokenGroup>;

export interface ResolvedToken {
  /** Dotted path, e.g. "color.primary" */
  path: string;
  type: TokenType;
  /** Literal value after alias resolution. */
  value: string | number | Record<string, unknown>;
}

/** Ordered flat list produced by resolveTokens. */
export type ResolvedMap = ResolvedToken[];

// ─── Error ────────────────────────────────────────────────────────────────────

export class TokenError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}

// ─── Mode convention — the shared home (D3, spec 009 P3) ──────────────────────
//
// figma-ds-tokens.ts encodes `$extensions["mode.<name>"] = { $value }` locally
// ("kept local to avoid a cycle" — figma-ds-tokens.ts:29) because it predates
// this shared home. css-token-ingest.ts is the convention's SECOND emitter
// (Art II: a convention with two emitters needs one shared definition and a
// check — tests/mode-convention.test.ts is that check, driving both emitters
// to equivalent input and asserting byte-identical `$extensions` shape).

/** Lowercase, collapse to the alias-safe [a-z0-9-] alphabet. Never empty.
 * Mirrors figma-ds-tokens.ts's sanitizeSeg exactly (mode-convention.test.ts pins this). */
export function sanitizeModeName(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return out.length > 0 ? out : "x";
}

/** The `$extensions` key for a non-base mode, e.g. "dark" → "mode.dark". */
export function modeExtensionKey(modeName: string): string {
  return `mode.${sanitizeModeName(modeName)}`;
}

// ─── Predicates ───────────────────────────────────────────────────────────────

const ALIAS_RE = /^\{[a-z0-9.-]+\}$/;

/** Returns true if v is a DTCG alias string like "{blue.500}". */
export function isAlias(v: unknown): v is string {
  return typeof v === "string" && ALIAS_RE.test(v);
}

/** Returns true if obj looks like a token leaf (has $value and $type). */
export function isTokenLeaf(obj: unknown): obj is Token {
  if (typeof obj !== "object" || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  return "$value" in rec && "$type" in rec;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a raw JSON.parse result into a validated TokenTree.
 *
 * Validates:
 * - Top level is a non-array object.
 * - Each category value is a non-array object.
 * - Each leaf has a known $type and a $value.
 *
 * Does NOT resolve aliases — call resolveTokens() for that.
 *
 * Throws TokenError with code BAD_JSON or BAD_TOKEN on invalid input.
 */
export function parseTokenFile(json: unknown): TokenTree {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new TokenError("BAD_JSON", "token file must be a JSON object");
  }

  const top = json as Record<string, unknown>;
  const tree: TokenTree = {};

  for (const [category, groupVal] of Object.entries(top)) {
    if (typeof groupVal !== "object" || groupVal === null || Array.isArray(groupVal)) {
      throw new TokenError(
        "BAD_TOKEN",
        `category '${category}' must be an object`,
      );
    }
    const group = groupVal as Record<string, unknown>;
    const tokenGroup: TokenGroup = {};

    for (const [tokenName, leafVal] of Object.entries(group)) {
      if (typeof leafVal !== "object" || leafVal === null || Array.isArray(leafVal)) {
        throw new TokenError(
          "BAD_TOKEN",
          `token '${category}.${tokenName}' must be an object`,
        );
      }
      const leaf = leafVal as Record<string, unknown>;

      if (!("$value" in leaf)) {
        throw new TokenError(
          "BAD_TOKEN",
          `token '${category}.${tokenName}' is missing '$value'`,
        );
      }
      if (!("$type" in leaf)) {
        throw new TokenError(
          "BAD_TOKEN",
          `token '${category}.${tokenName}' is missing '$type'`,
        );
      }
      const $type = leaf["$type"];
      if (typeof $type !== "string" || !KNOWN_TYPES.has($type)) {
        throw new TokenError(
          "BAD_TOKEN",
          `token '${category}.${tokenName}' has unknown $type '${String($type)}'`,
        );
      }

      tokenGroup[tokenName] = {
        $value: leaf["$value"] as Token["$value"],
        $type: $type as TokenType,
        $description:
          typeof leaf["$description"] === "string"
            ? leaf["$description"]
            : undefined,
        $extensions:
          typeof leaf["$extensions"] === "object" &&
          leaf["$extensions"] !== null &&
          !Array.isArray(leaf["$extensions"])
            ? (leaf["$extensions"] as Record<string, unknown>)
            : undefined,
      };
    }

    tree[category] = tokenGroup;
  }

  return tree;
}
