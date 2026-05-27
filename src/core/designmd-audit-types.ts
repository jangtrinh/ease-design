/**
 * Shared types for the 5 designmd audit families.
 *
 * Each family produces a list of AuditRow objects. The aggregator in
 * designmd-audit-report.ts turns those into audit.md (Markdown) and
 * audit.json (machine-parseable).
 */

export type AuditStatus = "PASS" | "FAIL" | "WARN";

export type AuditFamily =
  | "format"
  | "source-fidelity"
  | "ref-integrity"
  | "accessibility"
  | "discipline";

export interface AuditRow {
  family: AuditFamily;
  rule: string;
  status: AuditStatus;
  detail: string;
  /** Optional one-line suggestion for the failing case. */
  suggestedFix?: string;
}

/**
 * Aggregate audit result returned to the command runner.
 *
 * The command decides the exit code from `worstStatus`:
 *   0 — every row PASS (worstStatus === "PASS")
 *   1 — any FAIL              (worstStatus === "FAIL")
 *   2 — no FAIL, ≥ 1 WARN     (worstStatus === "WARN")
 */
export interface AuditResult {
  rows: AuditRow[];
  worstStatus: AuditStatus;
  counts: { PASS: number; FAIL: number; WARN: number };
  /** Per-family timings in milliseconds. */
  timings: Record<AuditFamily, number>;
}

/** Combine two statuses; FAIL > WARN > PASS. */
export function worstOf(a: AuditStatus, b: AuditStatus): AuditStatus {
  if (a === "FAIL" || b === "FAIL") return "FAIL";
  if (a === "WARN" || b === "WARN") return "WARN";
  return "PASS";
}
