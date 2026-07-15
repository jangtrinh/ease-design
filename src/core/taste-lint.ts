/**
 * Deterministic taste linter — pure string/regex heuristics, zero deps.
 *
 * Enforces the mechanically-verifiable subset of the 6+1 taste rubric
 * (knowledge/taste-rubric.md) so the model's self-scored critique gate has a
 * binary floor it cannot talk past. Subjective axis judgment stays with the
 * model; this only catches unambiguous, machine-detectable rubric breaches.
 *
 * Severity model:
 *   error   — a definite rubric-rule violation (exit 1). These are not smells;
 *             each is a rule the rubric states as an absolute ("body never below
 *             16px", "exactly one icon family", "never linear easing").
 *   warning — a craft smell the rubric flags but does not treat as absolute; it
 *             surfaces in the report but never fails the exit code (e.g. an
 *             undersized touch target whose true size may live in external CSS).
 *
 * Coverage (axis → check):
 *   Typography    → tiny-body-text          (font-size ≤ 13px)
 *   Typography    → font-scale-sprawl       (> 7 hand-picked font sizes; error > 10)
 *   Spacing       → off-grid-spacing        (Tailwind spacing not on 4px grid)
 *   Spacing       → tap-target-undersized   (interactive control < 44px; warning)
 *   Iconography   → mixed-icon-families     (≥ 2 icon libraries)
 *   Typography    → italic-display-heading, uppercase-tight-line-height
 *   Depth/Surface → pure-black-shadow       (hard/opaque black shadow)
 *   Depth/Surface → z-index-inflation       (all-nines z-index)
 *   Depth/Surface → z-index-off-ladder      (z-index off a base-10 scale; warning)
 *   Depth/Surface → mode-invisible-surface  (low-alpha same-mode surface tint; error)
 *   Depth/Surface → ai-cliche-gradient      (indigo/violet/magenta AI-glow gradient)
 *   Motion        → linear-easing, transition-all, animation-no-reduced-motion,
 *                   keyframes-layout-props
 *   Motion        → overshoot-easing, focus-ring-animates-in
 *   Consistency   → raw-hex-when-token-exists (needs DS token set)
 *
 * Axes intentionally NOT covered (subjective — left to the model): Layout in
 * full, plus the qualitative dimensions of every axis (is the scale on one
 * ratio? is the composition authored? is the elevation ramp coherent?).
 */
import {
  checkTinyBodyText,
  checkOffGridSpacing,
  checkMixedIconFamilies,
  checkPureBlackShadow,
  checkLinearOrAllTransition,
  checkAnimationNoReducedMotion,
  checkKeyframesLayoutProps,
  checkRawHexWhenTokenExists,
} from "./taste-checks.js";
// The slop-gate checks live in their own modules (taste-checks.ts is over the
// 200-line guideline, so we import these directly rather than via that barrel).
import { checkOvershootEasing, checkFocusRingAnimatesIn } from "./taste-checks-motion-state.js";
import { checkItalicDisplayHeading, checkUppercaseTightLineHeight } from "./taste-checks-typography.js";
import { checkZIndexInflation, checkZIndexOffLadder } from "./taste-checks-depth.js";
import { checkTapTargetUndersized } from "./taste-checks-tap-target.js";
import { checkAiClicheGradient } from "./taste-checks-gradient.js";
import { checkFontScaleSprawl } from "./taste-checks-font-scale.js";
import { checkModeInvisibleSurface } from "./taste-checks-invisible-surface.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Most taste findings are `error` — a definite rubric-rule breach that exits 1.
 * A `warning` is a craft smell the rubric flags but does not treat as absolute
 * (e.g. an undersized touch target whose real size may live in external CSS); it
 * surfaces in the report but never fails the exit code.
 */
export type TasteSeverity = "error" | "warning";

/** A taste-rubric axis label (matches knowledge/taste-rubric.md exactly). */
export type TasteAxis =
  | "Layout"
  | "Typography"
  | "Spacing"
  | "Motion"
  | "Iconography"
  | "Depth/Surface"
  | "Consistency";

export interface TasteFinding {
  checkId: string;
  axis: TasteAxis;
  severity: TasteSeverity;
  message: string;
  /** 1-based line number when locatable; omitted for whole-document checks. */
  line?: number;
}

export interface TasteLintResult {
  findings: TasteFinding[];
  /** Count of error-severity findings only — the exit code keys off this. */
  errorCount: number;
  /** Count of warning-severity findings (craft smells; never fail the build). */
  warningCount: number;
  /** Distinct rubric axes that have at least one violation. */
  axesAffected: TasteAxis[];
}

export interface TasteLintOptions {
  /**
   * Lower-cased, alpha-stripped hex strings (e.g. "#896d31") of the project's
   * design-system color tokens. Enables the Consistency raw-hex check; omit it
   * (no DS context) to skip that check entirely.
   */
  knownHexes?: Set<string>;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Replace each HTML comment with an equal-length run of spaces so byte offsets
 * (and line numbers) stay correct. Prevents commented-out markup — including
 * the AI_CRITIQUE_LOG block critique.md writes — from tripping checks.
 */
function stripCommentsPreservingOffsets(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length));
}

/** Axis order for stable sorting (matches the rubric's listed order). */
const AXIS_ORDER: Record<TasteAxis, number> = {
  Layout: 0, Typography: 1, Spacing: 2, Motion: 3,
  Iconography: 4, "Depth/Surface": 5, Consistency: 6,
};

/** Run every taste check and return findings grouped/sorted by rubric axis. */
export function lintTaste(html: string, opts: TasteLintOptions = {}): TasteLintResult {
  const stripped = stripCommentsPreservingOffsets(html);

  const findings: TasteFinding[] = [
    ...checkTinyBodyText(stripped),
    ...checkItalicDisplayHeading(stripped),
    ...checkUppercaseTightLineHeight(stripped),
    ...checkOffGridSpacing(stripped),
    ...checkMixedIconFamilies(stripped),
    ...checkPureBlackShadow(stripped),
    ...checkZIndexInflation(stripped),
    ...checkZIndexOffLadder(stripped),
    ...checkLinearOrAllTransition(stripped),
    ...checkAnimationNoReducedMotion(stripped),
    ...checkKeyframesLayoutProps(stripped),
    ...checkOvershootEasing(stripped),
    ...checkFocusRingAnimatesIn(stripped),
    ...checkRawHexWhenTokenExists(stripped, opts.knownHexes),
    // Craft lints (spec 003 P1). ai-cliche-gradient is an error; tap-target is a warning.
    ...checkAiClicheGradient(stripped),
    ...checkTapTargetUndersized(stripped),
    // Web craft lints (spec 003 P2). font-scale-sprawl & z-index-off-ladder are warnings
    // (font-scale escalates to error past 10 sizes); mode-invisible-surface is an error.
    ...checkFontScaleSprawl(stripped),
    ...checkModeInvisibleSurface(stripped),
  ];

  // Sort by rubric axis order, then by line (undefined lines last).
  findings.sort((a, b) => {
    const ax = AXIS_ORDER[a.axis] - AXIS_ORDER[b.axis];
    if (ax !== 0) return ax;
    return (a.line ?? Infinity) - (b.line ?? Infinity);
  });

  const axesAffected = [...new Set(findings.map((f) => f.axis))].sort(
    (a, b) => AXIS_ORDER[a] - AXIS_ORDER[b],
  );

  const errorCount = findings.filter((f) => f.severity === "error").length;
  return { findings, errorCount, warningCount: findings.length - errorCount, axesAffected };
}
