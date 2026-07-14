/**
 * Viewport/overflow layout checks — the two horizontal-overflow
 * tells the existing layout checks do not cover: a `100vw` width inside a
 * `<style>` rule (the scrollbar-gutter overflow trap) and `overflow-x: hidden` on
 * a root element (which silently breaks `position: sticky` descendants).
 *
 * Split into its own module (layout-checks.ts is already over the 200-line
 * guideline). Both are `warning`-severity: the document still renders. Reuses the
 * CSS helpers from taste-checks-shared (no import cycle — that module is pure and
 * imports nothing back). Pure string/regex — no DOM, no deps.
 */
import type { LayoutFinding } from "./layout-lint.js";
import { cssRegions, cssRules } from "./taste-checks-shared.js";

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

/** A root selector: `html` / `body` element (not `.body-text`), or `:root`. */
const ROOT_SELECTOR = /(?:^|[\s,>+~(])(?:html|body)(?![\w-])|:root\b/i;
/** `overflow` or `overflow-x` (not `-y`) set to a value containing `hidden`. */
const OVERFLOW_X_HIDDEN = /overflow(?:-x)?\s*:\s*[^;}]*\bhidden\b/i;

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
    if (!ROOT_SELECTOR.test(selector)) continue;
    if (!OVERFLOW_X_HIDDEN.test(body)) continue;
    let message = `overflow-x: hidden on ${selector} — hidden breaks position:sticky descendants; use overflow-x: clip (same clipping, sticky survives)`;
    if (usesSticky) message += ` (this page USES sticky — it is broken right now)`;
    findings.push({ checkId: "root-overflow-x-hidden", severity: "warning", message });
  }
  return findings;
}
