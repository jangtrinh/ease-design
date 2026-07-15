/**
 * Depth/Surface-axis check for the deterministic taste linter — the machine floor
 * under knowledge/taste-rubric.md Axis 6 ("Rules of depth"). Catches the
 * all-nines z-index escalation that betrays an un-designed stacking scale.
 *
 * Split into its own module to keep taste-checks.ts under the 200-line guideline.
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions } from "./taste-checks-shared.js";

// ─── Depth/Surface: stacking order is a designed scale, not an arms race ─────────

/** All-nines z-index (≥ 999: 999 / 9999 / 99999 …) or the 32-bit max int. */
const Z_INDEX_INFLATION = /z-index\s*:\s*(9{3,}|2147483647)\b/gi;

/**
 * z-index-inflation: a `z-index` of all-nines (999, 9999, …) or the 32-bit max
 * (2147483647) — the signature of an un-designed stacking scale. A deliberate
 * scale value like `z-index: 1000` (Bootstrap-style) is NOT flagged; only the
 * all-nines / max-int "just make it win" values are. Scoped to CSS regions so the
 * digits never match body copy.
 */
export function checkZIndexInflation(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);
  Z_INDEX_INFLATION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = Z_INDEX_INFLATION.exec(css)) !== null) {
    const val = m[1] ?? "";
    findings.push({
      checkId: "z-index-inflation", axis: "Depth/Surface", severity: "error",
      message: `z-index: ${val} — all-nines stacking escalation (rubric Depth/Surface: "stacking order is a designed scale, not an arms race") — define a small named z-scale (e.g. 1/10/100) and use the next tier`,
    });
  }
  return findings;
}

// ─── Off-ladder z-index: a stacking value that is not a clean scale step ─────────

/** Any `z-index` set to an integer (optionally negative). Group 1 = the signed value. */
const Z_INDEX_VALUE = /z-index\s*:\s*(-?\d+)\b/gi;

/**
 * z-index-off-ladder: a `z-index` above single-digit local stacking that is not a
 * base-10 ladder step (10 / 20 / 30 / … / 100 / 1000). Values 0–9 are left alone
 * (legitimate local stacking within a component); the all-nines values are already
 * an error via `checkZIndexInflation`, so they are excluded here to avoid a double
 * report. A value like `z-index: 47` or `z-index: 250` is the tell that the scale
 * was improvised rather than designed. Scoped to CSS regions; a warning (the page
 * still renders). Pure string/regex.
 */
export function checkZIndexOffLadder(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);
  Z_INDEX_VALUE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = Z_INDEX_VALUE.exec(css)) !== null) {
    const raw = m[1] ?? "0";
    const mag = Math.abs(parseInt(raw, 10));
    if (mag <= 9) continue;                     // single-digit local stacking is fine
    if (mag % 10 === 0) continue;               // on the 10/20/…/100/1000 ladder
    if (/^(?:9{3,}|2147483647)$/.test(String(mag))) continue; // all-nines → already an error
    findings.push({
      checkId: "z-index-off-ladder", axis: "Depth/Surface", severity: "warning",
      message: `z-index: ${raw} is off any base-10 ladder (rubric Depth/Surface: "stacking order is a designed scale, not an arms race") — snap it to a named z-scale step (e.g. 10/20/30/40/50)`,
    });
  }
  return findings;
}
