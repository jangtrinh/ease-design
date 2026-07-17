/**
 * Lightweight CSS selector-block scanner (D1, spec 009 P3).
 *
 * NOT a CSS parser — a brace-nesting scan that answers one question:
 * "which selector immediately encloses byte offset N?" That is the one
 * missing piece `ui designmd extract-tokens --css` needs to turn a custom
 * property's line provenance into mode provenance (`:root` → base,
 * `[data-theme="dark"]` → mode.dark, …). Split out of
 * designmd-token-extractor.ts to keep that file under the Art IX budget.
 */

export interface CssBlock {
  /** Verbatim, trimmed selector/at-rule text immediately before the opening `{`. */
  selector: string;
  /** Offset range covered by this block's body (after `{`, before matching `}`). */
  start: number;
  end: number;
}

/**
 * Record, for every `{ ... }` block in `body`, its immediately-enclosing selector
 * text and byte range. Comments are blanked out first (same length, so offsets/line
 * numbers stay correct) so a brace inside a comment never corrupts the nesting count.
 */
function computeBlocksRaw(body: string): CssBlock[] {
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const blocks: CssBlock[] = [];
  const openStack: number[] = []; // indices into `blocks` currently open
  let segStart = 0;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") {
      const selector = stripped.slice(segStart, i).trim();
      openStack.push(blocks.length);
      blocks.push({ selector, start: i + 1, end: stripped.length });
      segStart = i + 1;
    } else if (ch === "}") {
      const openIdx = openStack.pop();
      if (openIdx !== undefined) (blocks[openIdx] as CssBlock).end = i;
      segStart = i + 1;
    } else if (ch === ";" && openStack.length === 0) {
      // A top-level, semicolon-terminated at-rule (`@import "tailwindcss";`,
      // `@charset "utf-8";`) has no brace of its own — without this, its text
      // stays part of the segment being hunted for the NEXT rule's selector,
      // so `:root {` right after an `@import` line captured the whole
      // preamble as its "selector" (measured live on hvs's globals.css).
      segStart = i + 1;
    }
  }
  return blocks;
}

/**
 * `computeBlocksRaw` over a whole file assumes the file IS CSS. An HTML source has
 * markup/script braces (`<script>if (x) { … }</script>`) BEFORE any `<style>` block
 * that would otherwise get swallowed into the first rule's "selector" text. For an
 * HTML source, scan only inside `<style>…</style>` regions, one CSS-brace-scan per
 * region, translating each block's offsets back into the whole-file coordinate space
 * so callers can still index with the original match position.
 */
export function computeSelectorBlocks(body: string, isHtml: boolean): CssBlock[] {
  if (!isHtml) return computeBlocksRaw(body);
  const blocks: CssBlock[] = [];
  const styleTagRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleTagRe.exec(body)) !== null) {
    const content = m[1] ?? "";
    const openTagLen = (/^<style[^>]*>/i.exec(m[0])?.[0] ?? "<style>").length;
    const contentStart = m.index + openTagLen;
    for (const b of computeBlocksRaw(content)) {
      blocks.push({ selector: b.selector, start: b.start + contentStart, end: b.end + contentStart });
    }
  }
  return blocks;
}

/** The innermost block whose range contains `idx`, or "" when none does. */
export function selectorAt(idx: number, blocks: CssBlock[]): string {
  let best: CssBlock | undefined;
  for (const b of blocks) {
    if (b.start <= idx && idx < b.end) {
      if (best === undefined || b.start > best.start) best = b;
    }
  }
  return best?.selector ?? "";
}
