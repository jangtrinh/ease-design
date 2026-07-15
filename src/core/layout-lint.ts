/**
 * Static HTML layout linter — pure string/regex heuristics, zero deps.
 *
 * Runs 15 checks against an HTML string and returns a structured result.
 * All checks are documented as heuristic approximations (no DOM parser, no
 * browser, no rendering). See layout-checks.ts for individual check logic.
 *
 * Severity model:
 *   error   — structurally broken document (exit 1 per D4 policy)
 *   warning — layout smell; document may still render (exit 0)
 *
 * Findings are ordered: all errors first, then warnings, each group in
 * check-table order.
 */
import {
  checkMissingDoctype,
  checkMissingHtmlRoot,
  checkMissingBody,
  checkUnclosedStructuralTags,
  checkFixedWidthOverflow,
  checkViewportUnitOnBody,
  checkNestedScrollContainer,
  checkAbsoluteWithoutRelative,
  checkImgNoDimensions,
  checkEmptyFlexGrid,
} from "./layout-checks.js";
import { checkCss100vwWidth, checkRootOverflowXHidden } from "./layout-checks-viewport.js";
import { checkAvoidableScreenshotCrop } from "./layout-checks-delivery.js";
import { checkClickableNoPointer, checkFontDisplayMissing } from "./layout-checks-craft.js";
import { isRedirectStub } from "./redirect-stub.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LayoutSeverity = "error" | "warning";

export interface LayoutFinding {
  checkId: string;
  severity: LayoutSeverity;
  message: string;
  /** 1-based line number when locatable; omitted for whole-document checks. */
  line?: number;
}

export interface LayoutLintResult {
  findings: LayoutFinding[];
  errorCount: number;
  warningCount: number;
}

// ─── Check pipeline ───────────────────────────────────────────────────────────

/**
 * Checks that produce `error` findings — run first so errors sort before
 * warnings in the output. Order matches the check table in phase-02.
 */
const ERROR_CHECKS = [
  checkMissingHtmlRoot,
  checkMissingBody,
  checkUnclosedStructuralTags,
] as const;

/**
 * Checks that produce `warning` findings — run after errors.
 * missing-doctype is a warning; it comes first in table order.
 */
const WARNING_CHECKS = [
  checkMissingDoctype,
  checkFixedWidthOverflow,
  checkViewportUnitOnBody,
  checkCss100vwWidth,
  checkRootOverflowXHidden,
  checkNestedScrollContainer,
  checkAbsoluteWithoutRelative,
  checkImgNoDimensions,
  checkEmptyFlexGrid,
  checkAvoidableScreenshotCrop,
  // Web craft lints (spec 003 P2): functional affordance/loading bugs, not layout structure.
  checkClickableNoPointer,
  checkFontDisplayMissing,
] as const;

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Replace each HTML comment with an equal-length run of spaces so that all
 * byte offsets (and therefore line numbers) remain correct after stripping.
 * This avoids false positives from commented-out markup in all heuristic checks.
 */
function stripCommentsPreservingOffsets(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length));
}

/** Run all 15 checks and return findings sorted errors-first, then warnings. */
export function lintLayout(html: string): LayoutLintResult {
  // L4 dogfood: a redirect stub intentionally has no <html>/<body>, so every structural
  // check below is noise on it — short-circuit before running any of the other checks.
  if (isRedirectStub(html)) {
    return { findings: [], errorCount: 0, warningCount: 0 };
  }

  // Strip HTML comments once. All checks receive the comment-free string so
  // commented-out markup never triggers false positives. Offsets are preserved
  // (spaces replace comment bodies) so line-number reporting stays accurate.
  const stripped = stripCommentsPreservingOffsets(html);

  const errors: LayoutFinding[] = [];
  const warnings: LayoutFinding[] = [];

  for (const check of ERROR_CHECKS) {
    errors.push(...check(stripped));
  }
  for (const check of WARNING_CHECKS) {
    warnings.push(...check(stripped));
  }

  const findings = [...errors, ...warnings];

  return {
    findings,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}
