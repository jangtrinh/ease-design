/**
 * Motion-axis state-transition checks for the deterministic taste linter — the
 * machine floor under knowledge/taste-rubric.md Axis 4 ("Rules of motion"). These
 * catch two "generated-UI" tells that the existing motion module
 * (taste-checks-motion.ts) does not: overshoot/bounce easing on state changes and
 * focus rings that animate into existence instead of appearing instantly.
 *
 * Split from taste-checks.ts / taste-checks-motion.ts (both already at/over the
 * 200-line guideline) into its own module. Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions, cssRules } from "./taste-checks-shared.js";

// ─── Motion: never overshoot/bounce on UI state transitions (rubric Axis 4) ─────

/** A `transition` / `transition-timing-function` declaration and its value. */
const TRANSITION_DECL = /transition(?:-timing-function)?\s*:\s*([^;}"']+)/gi;
/** A four-number cubic-bezier(x1, y1, x2, y2). y1 is param 2, y2 is param 4. */
const CUBIC_BEZIER =
  /cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/gi;

/**
 * overshoot-easing: a `transition` (or `transition-timing-function`) whose easing
 * is a cubic-bezier with a control-point Y outside [0, 1] — the bounce/overshoot
 * signature. Scoped to transition declarations only: overshoot inside `@keyframes`
 * or a hero `animation` can be a deliberately physical moment, so it stays out of
 * this floor. The boundary values y = 0 and y = 1 (e.g. the common
 * cubic-bezier(0.16, 1, 0.3, 1) ease-out) are NOT overshoot and do not flag.
 */
export function checkOvershootEasing(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);

  TRANSITION_DECL.lastIndex = 0;
  let d: RegExpExecArray | null;
  while ((d = TRANSITION_DECL.exec(css)) !== null) {
    const value = d[1] ?? "";
    CUBIC_BEZIER.lastIndex = 0;
    let c: RegExpExecArray | null;
    while ((c = CUBIC_BEZIER.exec(value)) !== null) {
      const y1 = parseFloat(c[2] ?? "0"); // control-point 1 Y
      const y2 = parseFloat(c[4] ?? "0"); // control-point 2 Y
      if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) {
        findings.push({
          checkId: "overshoot-easing", axis: "Motion", severity: "error",
          message: `transition uses overshoot/bounce easing cubic-bezier(…) (rubric Motion: "never overshoot/bounce on UI state transitions") — use --ease-out style curves; reserve overshoot for deliberately physical moments`,
        });
      }
    }
  }
  return findings;
}

// ─── Motion: a focus ring appears instantly, never fades in (rubric Axis 4) ─────

const FOCUS_SELECTOR = /:focus\b/i; // matches :focus, :focus-visible, :focus-within
/** transition shorthand / transition-property whose property list names outline. */
const OUTLINE_TOKEN = /\boutline(?:-[a-z]+)?\b/i;
const FOCUS_RING_MSG =
  `focus ring transitions into existence (rubric Motion: "a focus ring appears instantly — keyboard users need an immediate indicator") — remove transition from outline/box-shadow on focus rules`;

/**
 * focus-ring-animates-in: a focus indicator that animates in rather than appearing
 * instantly. Two prongs, each contributing at most one finding (deduped by prong):
 *   A. any `transition`/`transition-property` declaration (anywhere in CSS) whose
 *      property list names `outline` / `outline-color` / `outline-width` /
 *      `outline-offset` — a transitioned outline is a fading focus ring;
 *   B. a rule whose selector targets `:focus` (or `:focus-visible`) AND whose body
 *      transitions `box-shadow` or `outline` (the box-shadow focus-ring idiom).
 * A `:focus` rule that only transitions transform/color is fine (prong B ignores
 * it); a `box-shadow` transition on a hover rule is fine (prong B is focus-only).
 */
export function checkFocusRingAnimatesIn(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);

  // Prong A: a transition property-list that names an outline property.
  const propDecl = /transition(?:-property)?\s*:\s*([^;}"']+)/gi;
  let hitA = false;
  let m: RegExpExecArray | null;
  while ((m = propDecl.exec(css)) !== null) {
    if (OUTLINE_TOKEN.test(m[1] ?? "")) { hitA = true; break; }
  }
  if (hitA) findings.push({ checkId: "focus-ring-animates-in", axis: "Motion", severity: "error", message: FOCUS_RING_MSG });

  // Prong B: a :focus rule that transitions box-shadow or outline into view.
  let hitB = false;
  for (const { selector, body } of cssRules(css)) {
    if (!FOCUS_SELECTOR.test(selector)) continue;
    const td = /transition(?:-property)?\s*:\s*([^;}"']+)/gi;
    let t: RegExpExecArray | null;
    while ((t = td.exec(body)) !== null) {
      const value = t[1] ?? "";
      if (/box-shadow/i.test(value) || OUTLINE_TOKEN.test(value)) { hitB = true; break; }
    }
    if (hitB) break;
  }
  if (hitB) findings.push({ checkId: "focus-ring-animates-in", axis: "Motion", severity: "error", message: FOCUS_RING_MSG });

  return findings;
}
