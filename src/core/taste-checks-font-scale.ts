/**
 * font-scale-sprawl (Typography axis, WARNING at > 7 / ERROR at > 10) — the
 * machine floor under the rubric's scale rule ("pick one modular ratio and derive
 * the scale from it; do not hand-pick unrelated sizes" — taste-rubric.md Axis 2).
 *
 * A designed type scale is a handful of steps on one ratio. A sprawl of many
 * distinct hand-picked sizes reads as unauthored — vertical rhythm dies when
 * every element sits on its own arbitrary size.
 *
 * What is counted: only ARBITRARY concrete font sizes — Tailwind arbitrary values
 * (`text-[13px]` / `text-[1.1rem]`), raw CSS `font-size: 17px`, and inline
 * `style="font-size:..."`. NOT counted: named Tailwind steps (`text-sm`/`text-lg`
 * …) — those already ride a fixed ratio — and `font-size: var(--…)` token
 * references, which by definition resolve to a design-system scale. A document
 * that dresses type entirely from a token scale or the named ramp trips nothing.
 *
 * Thresholds: > 10 distinct arbitrary sizes → error (definite sprawl); > 7 →
 * warning (drifting). One whole-document finding; no line number.
 *
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions } from "./taste-checks-shared.js";

const CHECK_ID = "font-scale-sprawl";
const WARN_OVER = 7;
const ERROR_OVER = 10;

/** Normalize a numeric size + unit to px (2-dp) so equivalent sizes dedupe. Null if not a length. */
function toPx(value: string, unit: string): number | null {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = unit.toLowerCase();
  const px =
    u === "px" ? n :
    u === "rem" || u === "em" ? n * 16 : // em approximated at the 16px root — good enough to dedupe
    u === "pt" ? n * (96 / 72) :
    null;
  return px === null ? null : Math.round(px * 100) / 100;
}

/** Collect distinct arbitrary font sizes (in px) declared anywhere in the document. */
function distinctArbitrarySizes(html: string): Set<number> {
  const sizes = new Set<number>();

  // Tailwind arbitrary font-size utilities: text-[13px], text-[1.125rem] (skip named steps entirely).
  const twRe = /\btext-\[(\d+(?:\.\d+)?)(px|rem|em|pt)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = twRe.exec(html)) !== null) {
    const px = toPx(m[1] ?? "", m[2] ?? "");
    if (px !== null) sizes.add(px);
  }

  // Raw `font-size:` in <style> rules and inline styles. `var(--…)` values carry no
  // literal length and are skipped (they resolve to a token scale by construction).
  const css = cssRegions(html);
  const fsRe = /font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em|pt)\b/gi;
  while ((m = fsRe.exec(css)) !== null) {
    const px = toPx(m[1] ?? "", m[2] ?? "");
    if (px !== null) sizes.add(px);
  }

  return sizes;
}

/**
 * font-scale-sprawl: count the distinct arbitrary font sizes in the document.
 * More than 10 is an error (the scale was never designed); more than 7 a warning
 * (it is drifting off one ratio). Named Tailwind steps and token references never
 * count — only hand-picked concrete sizes do.
 */
export function checkFontScaleSprawl(html: string): TasteFinding[] {
  const count = distinctArbitrarySizes(html).size;
  if (count <= WARN_OVER) return [];
  const severity = count > ERROR_OVER ? "error" : "warning";
  return [{
    checkId: CHECK_ID,
    axis: "Typography",
    severity,
    message: `${count} distinct hand-picked font sizes (rubric Typography: "pick one modular ratio and derive the scale from it; do not hand-pick unrelated sizes") — derive the scale from one ratio or map these onto the design-system type steps`,
  }];
}
