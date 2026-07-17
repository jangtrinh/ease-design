/**
 * Flat-token importer (DESIGN-OS dogfood G1) — convert a common flat design-token
 * file `{ category: { name: value } }` (e.g. a Figma-reconciled tokens.json) into
 * the DTCG shape the `ui ds *` store expects `{ category: { name: { $value, $type } } }`.
 * Pure: no IO. Type is inferred from the value + category/name; anything that can't be
 * typed to a KNOWN DTCG type is SKIPPED and reported (honest — never emit a bad $type).
 * Nested groups (e.g. typography.sizes) are hoisted into their own `<cat>-<sub>` category
 * since DTCG is two levels deep.
 */

import { isAlias, isTokenLeaf } from "./token-model.js";
import { sanitizeSeg } from "./figma-ds-tokens.js";

export type ImportedType = "color" | "dimension" | "number" | "fontFamily" | "fontWeight" | "duration";

export interface ImportStats {
  imported: number;
  skipped: number;
  byType: Record<string, number>;
  /** `category.name` of each skipped token + why. */
  skippedKeys: { key: string; reason: string }[];
}
export interface ImportResult {
  /** DTCG token tree ready for parseTokenFile. `$extensions` survives an already-DTCG
   * leaf pass-through (F2/D5) — e.g. a mode carried by ingest-css-ds/ingest-figma-ds. */
  dtcg: Record<string, Record<string, { $value: string | number; $type: ImportedType; $extensions?: Record<string, unknown> }>>;
  stats: ImportStats;
}

const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const COLOR_FN_RE = /^(?:rgb|rgba|hsl|hsla|oklch|oklab|color)\(/i;
const DIM_RE = /^-?\d*\.?\d+(?:px|rem|em|%|vh|vw|vmin|vmax)$/i;
const DIM_CAT_RE = /(?:spac|radi|size|width|height|layout|gap|inset|offset|topbar|rail|track|leading|height)/i;
const FAMILY_RE = /font-?family|family/i;
const WEIGHT_RE = /weight/i;
const DURATION_CAT_RE = /motion|duration|transition|delay/i;

/** Infer a DTCG {$value,$type} for one leaf, or null to skip (with a reason). */
export function inferToken(category: string, name: string, value: unknown): { $value: string | number; $type: ImportedType } | { skip: string } {
  const ctx = `${category} ${name}`;
  if (typeof value === "string") {
    const v = value.trim();
    if (COLOR_RE.test(v) || COLOR_FN_RE.test(v)) return { $value: v, $type: "color" };
    if (DIM_RE.test(v)) return { $value: v, $type: "dimension" };
    if (FAMILY_RE.test(ctx)) return { $value: v, $type: "fontFamily" };
    if (DURATION_CAT_RE.test(ctx) && /^\d+m?s$/i.test(v)) return { $value: v, $type: "duration" };
    // numeric-looking string
    if (/^-?\d*\.?\d+$/.test(v)) return numeric(category, name, Number(v));
    // F2 (spec 009 P3): an alias front-door refusal drops the entire semantic tier
    // (token-taxonomy.md:110) — ALIAS_RE already exists (token-model.ts), change-token
    // already accepts aliases; only this front door refused. No literal to type from, so
    // fall back to a category/name hint (color dominates the real alias layer).
    if (isAlias(v)) return { $value: v, $type: aliasTypeHint(ctx) };
    return { skip: `unmappable string value "${String(value).slice(0, 24)}"` };
  }
  if (typeof value === "number") return numeric(category, name, value);
  return { skip: `unsupported value type ${typeof value}` };
}

/** No literal value to test (the leaf is alias-only) — infer $type from category+name hints. */
function aliasTypeHint(ctx: string): ImportedType {
  if (FAMILY_RE.test(ctx)) return "fontFamily";
  if (WEIGHT_RE.test(ctx)) return "fontWeight";
  if (DURATION_CAT_RE.test(ctx)) return "duration";
  if (DIM_CAT_RE.test(ctx)) return "dimension";
  return "color";
}

/** A bare number becomes a px dimension in a dimension-ish category, a fontWeight under weight, else a number. */
function numeric(category: string, name: string, n: number): { $value: string | number; $type: ImportedType } {
  const ctx = `${category} ${name}`;
  if (WEIGHT_RE.test(ctx)) return { $value: n, $type: "fontWeight" };
  if (DURATION_CAT_RE.test(ctx) && /ms\b/i.test(name)) return { $value: `${n}ms`, $type: "duration" };
  if (DIM_CAT_RE.test(ctx)) return { $value: `${n}px`, $type: "dimension" };
  return { $value: n, $type: "number" };
}

/** Convert a flat token object to DTCG + import stats. `_`-prefixed top keys (metadata) are ignored. */
export function importFlatTokens(flat: unknown): ImportResult {
  if (typeof flat !== "object" || flat === null || Array.isArray(flat)) {
    throw new Error("token file must be a JSON object");
  }
  const dtcg: ImportResult["dtcg"] = {};
  const stats: ImportStats = { imported: 0, skipped: 0, byType: {}, skippedKeys: [] };

  const putCategory = (cat: string, entries: [string, unknown][]): void => {
    for (const [name, value] of entries) {
      // F2/D5: an already-DTCG leaf (e.g. from ingest-css-ds/ingest-figma-ds, which both
      // seal via 'ds import') is passed through as-is, $extensions included — recursing
      // into its $value/$type as if they were child token names (the old behaviour)
      // silently corrupted every such import into bogus "<cat>.$value" tokens.
      if (isTokenLeaf(value) && (typeof value.$value === "string" || typeof value.$value === "number")) {
        const catSan = sanitizeSeg(cat);
        const nameSan = sanitizeSeg(name);
        (dtcg[catSan] ??= {})[nameSan] = {
          $value: value.$value,
          $type: value.$type as ImportedType,
          ...(value.$extensions !== undefined ? { $extensions: value.$extensions } : {}),
        };
        stats.imported++;
        stats.byType[value.$type] = (stats.byType[value.$type] ?? 0) + 1;
        continue;
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // nested group → hoist into its own category `<cat>-<name>`
        putCategory(`${cat}-${name}`, Object.entries(value as Record<string, unknown>));
        continue;
      }
      const r = inferToken(cat, name, value);
      if ("skip" in r) {
        stats.skipped++;
        stats.skippedKeys.push({ key: `${cat}.${name}`, reason: r.skip });
        continue;
      }
      // F6 (spec 009 P3): 'ds init' writes kebab-case; TOKEN_PATTERN (registry-store.ts)
      // forbids uppercase — a camelCase source group ("fontSize") used to pass through
      // verbatim and become unreferencable from any component. Sanitize on the way in.
      const catSan = sanitizeSeg(cat);
      const nameSan = sanitizeSeg(name);
      (dtcg[catSan] ??= {})[nameSan] = r;
      stats.imported++;
      stats.byType[r.$type] = (stats.byType[r.$type] ?? 0) + 1;
    }
  };

  for (const [category, groupVal] of Object.entries(flat as Record<string, unknown>)) {
    if (category.startsWith("_")) continue; // metadata (_source, _provenance, …)
    if (typeof groupVal !== "object" || groupVal === null || Array.isArray(groupVal)) {
      stats.skipped++;
      stats.skippedKeys.push({ key: category, reason: "top-level value is not a token group" });
      continue;
    }
    putCategory(category, Object.entries(groupVal as Record<string, unknown>));
  }
  return { dtcg, stats };
}
