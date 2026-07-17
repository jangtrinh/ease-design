/**
 * Token extraction from raw HTML + linked CSS bytes.
 *
 * Pure regex scan — no CSS parser, no inference. The point of this
 * module is to produce the canonical source-of-truth token list that
 * the audit's source-fidelity family compares emitted DESIGN.md
 * tokens against.
 *
 * What we extract:
 *   - Hex colour values (#RRGGBB / #RRGGBBAA), normalised to #RRGGBB
 *     lowercase, with occurrence counts and line provenance.
 *   - font-family declarations (CSS + inline style), with the
 *     primary family name normalised (quotes stripped) and the
 *     observation context (CSS rule or inline style).
 *   - CSS custom properties (--name: value) when the value is a hex.
 *
 * What we do NOT extract:
 *   - rgb()/rgba()/hsl()/oklch() — out of scope this phase; the host
 *     model handles those via cross-check (the workflow's step 5).
 *   - Tailwind utility class names (e.g. `bg-orange-500`) — we look at
 *     the compiled CSS, not the class names, because the compiled CSS
 *     carries the actual hex values regardless of utility naming.
 *   - Font sizes / weights — these come from the workflow's
 *     `extract.md` recipe still.
 */
import { computeSelectorBlocks, selectorAt } from "./css-selector-blocks.js";

export interface HexObservation {
  /** Lowercase #RRGGBB. */
  hex: string;
  /** Total occurrence count across all supplied sources. */
  count: number;
  /** Source label + line number for the first N observations. */
  sources: string[];
}

export interface FontObservation {
  /** Primary family name (first in a font-family stack), quotes stripped. */
  family: string;
  /** Free-text label of where it was observed. */
  context: "css-rule" | "inline-style" | "html-class";
  /** Source label + line number for the first N observations. */
  sources: string[];
}

export interface CustomPropertyObservation {
  /** Variable name including the leading `--`. */
  name: string;
  /** Raw value as declared. */
  value: string;
  /** Lowercase hex if the value resolves to a hex; undefined otherwise. */
  hex?: string;
  /** Source label + line number for the first N observations. */
  sources: string[];
  /** Enclosing selector per observation, index-aligned with `sources` (D1, spec 009 P3).
   * E.g. ":root", "@theme", '[data-theme="dark"]'; "" when none. Parallel field —
   * `sources` keeps its "file:Lnn" shape (load-bearing elsewhere). */
  selectors: string[];
}

export interface ExtractedTokens {
  colors: HexObservation[];
  fonts: FontObservation[];
  customProperties: CustomPropertyObservation[];
}

export interface SourceFile {
  /** Short label used in provenance strings, e.g. "source.html". */
  name: string;
  /** Raw bytes as a string. */
  body: string;
}

const HEX_RE = /#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?\b/g;
const HEX_RE_3 = /#([0-9a-fA-F]{3})\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}\n]*?)(?=;|}|\n|$)/gi;
const CUSTOM_PROP_RE = /(--[a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*([^;}\n]+)/g;

const MAX_PROVENANCE_PER_TOKEN = 5;

/** Normalise a 3-digit hex (#abc) to 6-digit (#aabbcc) lowercase. */
function expandShortHex(short: string): string {
  return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`.toLowerCase();
}

/** Convert a byte offset within a string to a 1-based line number. */
function lineOf(body: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (body.charCodeAt(i) === 10) line++;
  }
  return line;
}


/**
 * Extract canonical tokens from one or more raw source files.
 *
 * Returns the combined view across all sources, sorted by count
 * descending (colours and custom properties) or by name (fonts —
 * order rarely matters).
 */
export function extractTokens(sources: SourceFile[]): ExtractedTokens {
  const hexMap = new Map<string, { count: number; sources: string[] }>();
  const fontMap = new Map<string, { context: FontObservation["context"]; sources: string[] }>();
  const cpMap = new Map<string, { value: string; hex?: string; sources: string[]; selectors: string[] }>();

  function track<T extends { sources: string[] }>(rec: T, src: string): void {
    if (rec.sources.length < MAX_PROVENANCE_PER_TOKEN) {
      rec.sources.push(src);
    }
  }

  for (const source of sources) {
    // ── Hex (6-digit and shorthand 3-digit) ────────────────────────────────────
    HEX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HEX_RE.exec(source.body)) !== null) {
      const hex = `#${m[1]!.toLowerCase()}`;
      const key = hex;
      let rec = hexMap.get(key);
      if (!rec) {
        rec = { count: 0, sources: [] };
        hexMap.set(key, rec);
      }
      rec.count++;
      track(rec, `${source.name}:L${lineOf(source.body, m.index)}`);
    }

    HEX_RE_3.lastIndex = 0;
    while ((m = HEX_RE_3.exec(source.body)) !== null) {
      const expanded = expandShortHex(m[1]!);
      let rec = hexMap.get(expanded);
      if (!rec) {
        rec = { count: 0, sources: [] };
        hexMap.set(expanded, rec);
      }
      rec.count++;
      track(rec, `${source.name}:L${lineOf(source.body, m.index)}`);
    }

    // ── font-family (CSS rules + inline styles) ────────────────────────────────
    FONT_FAMILY_RE.lastIndex = 0;
    while ((m = FONT_FAMILY_RE.exec(source.body)) !== null) {
      const stack = m[1]!.trim();
      if (stack.length === 0) continue;
      // Take the first family name in the stack
      const firstRaw = stack.split(",")[0]!.trim();
      if (firstRaw.length === 0) continue;
      // Strip surrounding quotes if any
      const family = firstRaw.replace(/^["']|["']$/g, "").trim();
      if (family.length === 0) continue;
      // Skip generic fallbacks
      if (/^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|inherit|initial)$/i.test(family)) continue;
      // Skip CSS variable references (var(--font-body) etc.) — they reference, not name
      if (family.startsWith("var(")) continue;
      const isInline = source.name.endsWith(".html") && /style\s*=\s*["'][^"']*$/.test(source.body.slice(Math.max(0, m.index - 200), m.index));
      const context: FontObservation["context"] = isInline ? "inline-style" : "css-rule";
      const key = `${family}::${context}`;
      let rec = fontMap.get(key);
      if (!rec) {
        rec = { context, sources: [] };
        fontMap.set(key, rec);
      }
      track(rec, `${source.name}:L${lineOf(source.body, m.index)}`);
    }

    // ── CSS custom properties ──────────────────────────────────────────────────
    const blocks = computeSelectorBlocks(source.body, source.name.endsWith(".html"));
    CUSTOM_PROP_RE.lastIndex = 0;
    while ((m = CUSTOM_PROP_RE.exec(source.body)) !== null) {
      const name = m[1]!;
      const value = m[2]!.trim();
      // Resolve to hex if the value is a hex literal
      let hex: string | undefined;
      const hexMatch = value.match(/^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/) ?? value.match(/^#([0-9a-fA-F]{3})$/);
      if (hexMatch) {
        const captured = hexMatch[1]!;
        hex = captured.length === 3 ? expandShortHex(captured) : `#${captured.toLowerCase()}`;
      }
      const key = `${name}=${value}`;
      let rec = cpMap.get(key);
      if (!rec) {
        rec = { value, hex, sources: [], selectors: [] };
        cpMap.set(key, rec);
      }
      if (rec.sources.length < MAX_PROVENANCE_PER_TOKEN) {
        rec.selectors.push(selectorAt(m.index, blocks));
      }
      track(rec, `${source.name}:L${lineOf(source.body, m.index)}`);
    }
  }

  // ── Assemble results ─────────────────────────────────────────────────────────
  const colors: HexObservation[] = [...hexMap.entries()]
    .map(([hex, rec]) => ({ hex, count: rec.count, sources: rec.sources }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));

  const fonts: FontObservation[] = [...fontMap.entries()]
    .map(([key, rec]) => {
      const family = key.split("::")[0]!;
      return { family, context: rec.context, sources: rec.sources };
    })
    .sort((a, b) => a.family.localeCompare(b.family));

  const customProperties: CustomPropertyObservation[] = [...cpMap.entries()]
    .map(([key, rec]) => {
      const name = key.split("=")[0]!;
      const out: CustomPropertyObservation = { name, value: rec.value, sources: rec.sources, selectors: rec.selectors };
      if (rec.hex !== undefined) out.hex = rec.hex;
      return out;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { colors, fonts, customProperties };
}
