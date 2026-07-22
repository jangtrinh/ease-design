/**
 * Viewport/overflow layout checks — the horizontal-overflow and viewport-height
 * tells the existing layout checks do not cover: a `100vw` width inside a
 * `<style>` rule (the scrollbar-gutter overflow trap), `overflow-x: hidden` on
 * a root element (which silently breaks `position: sticky` descendants), and a
 * `100vh` / `h-screen` full-viewport height (the mobile URL-chrome jump — M6).
 *
 * Split into its own module (layout-checks.ts is already over the 200-line
 * guideline). Both are `warning`-severity: the document still renders. Reuses the
 * CSS helpers from taste-checks-shared (no import cycle — that module is pure and
 * imports nothing back). Pure string/regex — no DOM, no deps.
 */
import type { LayoutFinding } from "./layout-lint.js";
import { cssRegions, cssRules, lineOf } from "./taste-checks-shared.js";

// ─── width: 100vw (scrollbar-gutter overflow) ───────────────────────────────────

/** A `width` / `min-width` / `max-width` declaration whose value uses 100vw. */
const WIDTH_100VW = /(?:^|[{;])\s*(?:min-|max-)?width\s*:\s*[^;}]*\b100vw\b/gi;

/**
 * css-100vw-width: a `width: 100vw` (or min-/max-width) declaration in a
 * `<style>` rule or inline style. `100vw` includes the vertical-scrollbar gutter,
 * so any page with a scrollbar overflows horizontally. Distinct from the existing
 * `viewport-unit-on-body` check, which only inspects inline attributes on
 * `<body>`/`<html>`; this covers stylesheet rules on any selector. One finding per
 * declaration; no line (cssRegions is offset-free).
 */
export function checkCss100vwWidth(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const css = cssRegions(html);
  WIDTH_100VW.lastIndex = 0;
  while (WIDTH_100VW.exec(css) !== null) {
    findings.push({
      checkId: "css-100vw-width", severity: "warning",
      message: `width uses 100vw (includes the scrollbar gutter → horizontal overflow on any page with a vertical scrollbar) — use 100% or width:auto; clip overflow at the shell`,
    });
  }
  return findings;
}

// ─── overflow-x: hidden on a root element (breaks sticky) ───────────────────────

/** `overflow` or `overflow-x` (not `-y`) set to a value containing `hidden`. */
const OVERFLOW_X_HIDDEN = /overflow(?:-x)?\s*:\s*[^;}]*\bhidden\b/i;

/**
 * True when the SUBJECT (rightmost compound) of any comma-separated selector is a
 * root element — `html`/`body` (with optional class/attr/pseudo, but not
 * `.body-text`) or `:root`. The subject is what the rule actually styles, so a
 * descendant rule like `html.js .ln { overflow: hidden }` targets `.ln`, NOT the
 * root, and must not flag. (The old start-anchored match mis-read every
 * `html…`/`body…`-prefixed descendant selector — e.g. `body.dark .card` — as a
 * root rule, a very common false positive.)
 */
function selectorSubjectIsRoot(selector: string): boolean {
  return selector.split(",").some((part) => {
    const compounds = part.trim().split(/[\s>+~]+/);
    const subject = compounds[compounds.length - 1] ?? "";
    return /^(?:html|body)(?![\w-])/i.test(subject) || /^:root(?![\w-])/i.test(subject);
  });
}

/**
 * root-overflow-x-hidden: `overflow-x: hidden` (or shorthand `overflow: hidden`)
 * on `html` / `body` / `:root`. `hidden` clips AND severs `position: sticky` for
 * every descendant; `overflow-x: clip` gives the same clipping while sticky
 * survives. If the document uses `position: sticky` anywhere, the message says so
 * explicitly (it is broken right now). One finding per offending rule.
 */
export function checkRootOverflowXHidden(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const css = cssRegions(html);
  const usesSticky = /position\s*:\s*sticky/i.test(css);
  for (const { selector, body } of cssRules(css)) {
    if (!selectorSubjectIsRoot(selector)) continue;
    if (!OVERFLOW_X_HIDDEN.test(body)) continue;
    let message = `overflow-x: hidden on ${selector} — hidden breaks position:sticky descendants; use overflow-x: clip (same clipping, sticky survives)`;
    if (usesSticky) message += ` (this page USES sticky — it is broken right now)`;
    findings.push({ checkId: "root-overflow-x-hidden", severity: "warning", message });
  }
  return findings;
}

// ─── height: 100vh / h-screen (mobile URL-chrome jump — spec 003 M6) ─────────────

/** A `height`/`min-height`/`max-height` declaration whose value uses 100vh. */
const HEIGHT_100VH = /(?:^|[{;])\s*(?:min-|max-)?height\s*:\s*[^;}]*\b100vh\b/gi;
/** The Tailwind full-viewport-height utilities: h-screen / min-h-screen / max-h-screen. */
const SCREEN_UTIL = /\b(?:min-|max-)?h-screen\b/gi;

/**
 * dvh-over-100vh: a full-viewport height fixed to `100vh` — either a CSS
 * `height:100vh` declaration or a Tailwind `h-screen` / `min-h-screen` utility.
 * On mobile the URL bar shows and hides, changing the visual viewport: `100vh` is
 * sized to the LARGER (URL-bar-hidden) state, so content is clipped while the bar
 * is visible and the layout jumps as it collapses. The dynamic-viewport unit
 * `100dvh` (Tailwind `h-dvh` / `min-h-dvh`) tracks the real viewport and removes
 * the jump. CSS matches carry no line (cssRegions is offset-free); utility matches
 * carry a line. Precision-first: only the exact full-viewport value flags — a
 * `min-h-[80vh]` hero is untouched.
 */
export function checkDvhOver100vh(html: string): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const css = cssRegions(html);
  HEIGHT_100VH.lastIndex = 0;
  while (HEIGHT_100VH.exec(css) !== null) {
    findings.push({
      checkId: "dvh-over-100vh", severity: "warning",
      message: `height uses 100vh — on mobile the URL bar resizes the viewport, so 100vh clips content then jumps as the bar collapses; use 100dvh (dynamic viewport height)`,
    });
  }
  SCREEN_UTIL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCREEN_UTIL.exec(html)) !== null) {
    findings.push({
      checkId: "dvh-over-100vh", severity: "warning",
      message: `${m[0]} is 100vh — on mobile the URL bar resizes the viewport, so it clips content then jumps as the bar collapses; use the dynamic-viewport utility (h-dvh / min-h-dvh)`,
      line: lineOf(html, m.index),
    });
  }
  return findings;
}
