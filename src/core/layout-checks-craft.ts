/**
 * Two web-craft layout checks that are functional affordance/loading bugs rather
 * than taste-axis judgments, so they live on the layout linter (no rubric axis):
 *
 *   clickable-no-pointer (warning) — a non-native element made clickable
 *     (`[onclick]` / `role="button"`) with no `cursor: pointer`, so the hand
 *     affordance native buttons/links get for free is missing.
 *   font-display-missing (warning) — an `@font-face` with no `font-display`, or a
 *     Google-Fonts `<link>` with no `display=` param → FOIT (invisible text while
 *     the font loads) plus a layout shift when it swaps in.
 *
 * Split into its own module (layout-checks.ts is already over the 200-line
 * guideline). Reuses the CSS helpers from taste-checks-shared. Pure string/regex —
 * no DOM, no deps.
 */
import type { LayoutFinding } from "./layout-lint.js";
import { cssRegions, cssRules, lineOf } from "./taste-checks-shared.js";

// ─── clickable-no-pointer ───────────────────────────────────────────────────────

/** Native controls already carry a pointer cursor and are never flagged. */
const NATIVE_CONTROL = /^(?:button|a|input|select|textarea|label|summary|option)$/i;

/** Classes targeted by a CSS rule whose body sets `cursor: pointer`. */
function pointerClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const { selector, body } of cssRules(css)) {
    if (!/cursor\s*:\s*pointer/i.test(body)) continue;
    for (const m of selector.matchAll(/\.([\w-]+)/g)) out.add((m[1] ?? "").toLowerCase());
  }
  return out;
}

/** The element's own class list (lower-cased) from its attribute string. */
function classList(attrs: string): string[] {
  const cm = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs);
  if (!cm) return [];
  return (cm[1] ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * clickable-no-pointer: a non-native element carrying a click handler or
 * `role="button"` but no `cursor: pointer` (utility `cursor-pointer`, inline
 * `cursor:pointer`, or a matching CSS rule on one of its classes). Precision-first:
 * native controls are skipped (they get the cursor for free) and any provable
 * pointer source exempts the element, so only genuinely bare clickables flag.
 */
export function checkClickableNoPointer(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const ptrClasses = pointerClasses(cssRegions(html));
  const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1] ?? "";
    const attrs = m[2] ?? "";
    if (NATIVE_CONTROL.test(tag)) continue;
    const clickable = /\bonclick\s*=/i.test(attrs) || /\brole\s*=\s*["']?button\b/i.test(attrs);
    if (!clickable) continue;
    if (/\bcursor-pointer\b/i.test(attrs)) continue;               // Tailwind utility
    if (/cursor\s*:\s*pointer/i.test(attrs)) continue;             // inline style
    if (classList(attrs).some((c) => ptrClasses.has(c))) continue; // CSS rule on a class
    findings.push({
      checkId: "clickable-no-pointer", severity: "warning",
      message: `<${tag}> is made clickable (onclick / role=button) but has no cursor:pointer — non-native controls do not get the hand affordance for free; add cursor-pointer (or use a real <button>)`,
      line: lineOf(html, m.index),
    });
  }
  return findings;
}

// ─── font-display-missing ───────────────────────────────────────────────────────

/**
 * font-display-missing: an `@font-face` block with no `font-display` descriptor,
 * or a Google-Fonts stylesheet `<link>` with no `display=` query param. Either
 * leaves the browser in its default (block) behaviour — invisible text for up to
 * 3s (FOIT) then a swap-in layout shift. `font-display: swap|optional|fallback`
 * fixes it. Precision-first: an `@font-face` that already declares any
 * `font-display` is respected (the author made a choice) and not flagged.
 */
export function checkFontDisplayMissing(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];

  // @font-face blocks (in <style> or inline CSS) lacking a font-display descriptor.
  const css = cssRegions(html);
  const faceRe = /@font-face\s*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = faceRe.exec(css)) !== null) {
    if (/font-display\s*:/i.test(m[1] ?? "")) continue;
    findings.push({
      checkId: "font-display-missing", severity: "warning",
      message: `@font-face has no font-display descriptor — the browser defaults to block (FOIT: invisible text while the font loads, then a swap-in layout shift); add font-display: swap (or optional)`,
    });
  }

  // Google-Fonts <link> stylesheets with no display= param.
  const linkRe = /<link\b[^>]*\bhref\s*=\s*["']([^"']*fonts\.googleapis\.com[^"']*)["'][^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    if (/[?&]display=/i.test(m[1] ?? "")) continue;
    findings.push({
      checkId: "font-display-missing", severity: "warning",
      message: `Google-Fonts <link> has no display= param — the font renders with the default block behaviour (FOIT + swap-in shift); append &display=swap to the href`,
      line: lineOf(html, m.index),
    });
  }

  return findings;
}
