// Reverse-walker: TEXT-only readers — the inverse of executor-text.createTextNode.
// Extracted from scan-node.ts (Art IX).

import type { FigmaColor, FigmaExportNode } from '../../../shared/figma-payload-types';
import type { ScannedNode } from './scan-node-types';
import { asFills } from './scan-node-paint';
import { safe } from './scan-node-utils';

// Inverse of executor-fonts.getFontStyleVariants: a Figma style name → numeric
// weight. Only recovers the weight the build path could have emitted; unknown
// styles leave fontWeight unset (documented reversibility limit).
export function styleToWeight(style: string): number | undefined {
  const s = style.toLowerCase().replace(/\s|italic/g, '');
  const map: Record<string, number> = {
    thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300,
    regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600,
    bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
  };
  return map[s];
}

const isFontName = (v: unknown): v is FontName =>
  !!v && typeof v === 'object' && 'family' in v && typeof (v as FontName).family === 'string';

/**
 * The node's font — read from the SEGMENTS when the node-level getter refuses.
 *
 * `TextNode.fontName` returns `figma.mixed` on real style-linked text even when
 * every character shares ONE font. Proven on the live footer 25575:354192:
 * `fontName === figma.mixed`, yet `getStyledTextSegments(['fontName'])` reports a
 * SINGLE segment spanning all 23 characters with family "Be Vietnam Pro" /
 * "Regular". Detaching its text style flips the getter back to concrete, so the
 * style link is what triggers the refusal — a state Figma's own UI authors and the
 * Plugin API cannot be talked out of.
 *
 * `safe()` turns that symbol into undefined, so the scan used to emit NO
 * fontFamily and NO fontWeight for such a node. That was a loss of the ORIGINAL,
 * not of the rebuild: the mirror reported `fontFamily: undefined → "Be Vietnam Pro"`
 * and blamed the rebuild for being RIGHT.
 *
 * Exactly ONE segment is the honest condition: it means the whole range shares a
 * font whatever the node-level getter claims. Two or more segments are genuinely
 * mixed — no single fontFamily is true of the node, so both fields stay unset, as
 * before.
 */
function readFontName(n: Record<string, unknown>): FontName | undefined {
  const direct = safe(() => n.fontName as FontName);
  if (isFontName(direct)) return direct;
  const read = safe(() => n.getStyledTextSegments as ((fields: string[]) => Array<{ fontName?: unknown }>));
  if (typeof read !== 'function') return undefined;
  const segments = safe(() => read.call(n, ['fontName']));
  if (!Array.isArray(segments) || segments.length !== 1) return undefined;
  const font = segments[0]?.fontName;
  return isFontName(font) ? font : undefined;
}

/** Text-only fields — inverse of executor-text.createTextNode. */
export function readText(n: Record<string, unknown>, out: ScannedNode): void {
  if (typeof n.characters === 'string') out.characters = n.characters;
  const font = readFontName(n);
  if (font) {
    out.fontFamily = font.family;
    if (font.style.toLowerCase().includes('italic')) out.fontStyle = 'italic';
    const w = styleToWeight(font.style);
    if (w !== undefined) out.fontWeight = w;
  }
  if (typeof n.fontSize === 'number') out.fontSize = n.fontSize;
  const lh = safe(() => n.lineHeight as LineHeight);
  if (lh && typeof lh === 'object' && lh.unit === 'PIXELS') out.lineHeight = lh.value;
  const ls = safe(() => n.letterSpacing as LetterSpacing);
  if (ls && typeof ls === 'object' && ls.unit === 'PIXELS') out.letterSpacing = ls.value;
  if (n.textAlignHorizontal) out.textAlignHorizontal = n.textAlignHorizontal as FigmaExportNode['textAlignHorizontal'];
  if (n.textAutoResize) out.textAutoResize = n.textAutoResize as FigmaExportNode['textAutoResize'];
  if (n.textDecoration && n.textDecoration !== 'NONE') out.textDecoration = n.textDecoration as FigmaExportNode['textDecoration'];
  if (n.textCase && n.textCase !== 'ORIGINAL') out.textCase = n.textCase as FigmaExportNode['textCase'];
  // TEXT colour lives in fills[0]; surface it as textColor (build-path convention).
  const fills = asFills(n.fills);
  if (fills && fills[0]?.type === 'SOLID' && fills[0].color) out.textColor = fills[0].color as FigmaColor;
}
