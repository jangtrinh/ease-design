/**
 * Responsive-story lint (spec 010 P1) — the check the kit's four floors cannot express.
 *
 * `a11y-lint` / `layout-lint` / `taste-lint` / `content-lint` all check for HAZARDS —
 * fixed-width overflow, undersized tap targets, missing alt text. A component with NO
 * `@media (min-width: …)` at all has no breakpoint bugs, so those floors pass it cleanly
 * (verified: 0/27 errors on every one, spec 010 brainstorm §2). That green result is the
 * bug: the standard "a component has a responsive story" had no linter, because an
 * absence produces no hazard for a hazard-scanner to find.
 *
 * This is a different *kind* of check from the four floors above (Art II: new standard,
 * new linter) — it does not scan generic HTML for a mistake, it scans a KIT COMPONENT
 * for a missing dimension. It therefore lives beside the kit it audits
 * (`src/core/component-kit/`), not alongside the generic per-document floors in
 * `src/core/*-lint.ts`, and it is exercised at the seam (`tests/component-kit.test.ts`)
 * rather than through a standalone `ui` subcommand — Phase 1 does not touch the command
 * registry (spec 009 owns it in parallel).
 *
 * Rule: a component markup string either contains `@media (min-width: …)` (it reflows),
 * or it declares `<!-- responsive-exempt: <reason> -->` with a NON-EMPTY reason (Art VIII
 * — an exemption with no reason is a failure, not a pass). Anything else fails.
 */

export type ResponsiveSeverity = "error";

export interface ResponsiveFinding {
  checkId: "responsive-missing" | "responsive-exempt-no-reason";
  severity: ResponsiveSeverity;
  message: string;
  /** The component's registry name, e.g. "Data/Table" — the unit this floor judges. */
  component: string;
}

export interface ResponsiveLintResult {
  findings: ResponsiveFinding[];
  errorCount: number;
  /** Always 0 — this floor is binary (reflows-or-exempt vs neither); kept for shape
   * parity with the other four floors' {findings, errorCount, warningCount} envelope. */
  warningCount: number;
}

const MEDIA_MIN_WIDTH_RE = /@media\s*\(\s*min-width\s*:/i;
// The `: <reason>` half is OPTIONAL in the pattern on purpose: `<!-- responsive-exempt -->`
// (no colon, no reason) must still be RECOGNIZED as an exemption marker — just an invalid
// one — so it reports "declared but unreasoned" (Art VIII) rather than "not declared at
// all". Group 1 is `undefined` in that no-colon case; `exemptReason` normalizes to "".
const EXEMPT_RE = /<!--\s*responsive-exempt\s*(?::\s*(.*?)\s*)?-->/i;

/** Reflows via a `@media (min-width: …)` rule anywhere in the markup. */
export function hasResponsiveReflow(markup: string): boolean {
  return MEDIA_MIN_WIDTH_RE.test(markup);
}

/**
 * The declared exemption reason (trimmed), or `null` when no exemption marker is
 * present at all. A marker with nothing after the colon returns `""` (present, empty) —
 * `checkComponentReflow` tells that apart from "no marker" via {@link hasExemptMarker}.
 */
function exemptReason(markup: string): string | null {
  const m = EXEMPT_RE.exec(markup);
  if (!m) return null;
  return (m[1] ?? "").trim();
}

/** True when an (empty-reason) exemption MARKER is present at all, reasoned or not. */
function hasExemptMarker(markup: string): boolean {
  return EXEMPT_RE.test(markup);
}

/**
 * Lint one component's markup. Empty result = passes (reflows, or a validly-reasoned
 * exemption). A non-empty result is always an error — this floor has no warning tier.
 */
export function checkComponentReflow(component: string, markup: string): ResponsiveFinding[] {
  if (hasResponsiveReflow(markup)) return [];

  if (hasExemptMarker(markup)) {
    const reason = exemptReason(markup);
    if (reason !== null && reason.length > 0) return []; // reasoned exemption — pass
    return [{
      checkId: "responsive-exempt-no-reason",
      severity: "error",
      message: `${component} declares <!-- responsive-exempt --> with no reason — Art VIII requires saying exactly what was checked; add one after the colon, e.g. "<!-- responsive-exempt: icon-only control, nothing to reflow -->"`,
      component,
    }];
  }

  return [{
    checkId: "responsive-missing",
    severity: "error",
    message: `${component} has no "@media (min-width: …)" and no declared "<!-- responsive-exempt: <reason> -->" — it renders exactly one way at every viewport width`,
    component,
  }];
}

/** Lint every component; findings sorted by component name for deterministic output. */
export function lintResponsive(components: { name: string; markup: string }[]): ResponsiveLintResult {
  const findings = components
    .flatMap((c) => checkComponentReflow(c.name, c.markup))
    .sort((a, b) => a.component.localeCompare(b.component));
  return { findings, errorCount: findings.length, warningCount: 0 };
}
