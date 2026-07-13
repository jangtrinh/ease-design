/**
 * Shared shapes for the tier-2 rendered accessibility audit.
 *
 * These are plain data — the axe-core → {@link PageReport} mapping lives in `audit.ts`
 * (the only browser-coupled module). Keeping the shapes here lets the envelope/format
 * layer (and its tests) work on hand-built data without launching a browser.
 */

/** One axe-core rule violation on one page, flattened to what a reviewer needs. */
export interface Violation {
  /** axe rule id, e.g. `color-contrast`, `image-alt`. */
  id: string;
  /** axe severity: minor | moderate | serious | critical (null when axe omits it). */
  impact: string | null;
  /** Human-readable rule summary from axe. */
  help: string;
  /** Deep link to the axe rule docs. */
  helpUrl: string;
  /** How many DOM nodes failed this rule on this page. */
  nodes: number;
  /** First failing node's first CSS selector — a jump-to sample, not the full list. */
  sample: string;
}

/** The audit result for a single target (file or URL). */
export interface PageReport {
  /** The audited target as given (a display path or URL). */
  target: string;
  violations: Violation[];
  violationCount: number;
  /** axe rules that PASSED — context, never a conformance count. */
  passCount: number;
  /** axe rules that could not be decided automatically — a human must check these. */
  incompleteCount: number;
}

/** The full audit payload carried in the envelope's `data`. */
export interface AuditData {
  pages: PageReport[];
  totals: { violations: number; pages: number };
  /** The axe-core engine version the run used — surfaced so the honesty line can name it. */
  axeVersion: string;
}
