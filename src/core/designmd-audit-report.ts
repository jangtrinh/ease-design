/**
 * Audit report assembler — turns 5 family row-lists into:
 *   audit.md   (human-readable, family-grouped, with per-row tables)
 *   audit.json (machine-parseable mirror of the same data)
 *
 * Pure transform — caller writes the strings to disk.
 */
import type {
  AuditFamily,
  AuditResult,
  AuditRow,
  AuditStatus,
} from "./designmd-audit-types.js";
import { worstOf } from "./designmd-audit-types.js";

const FAMILY_ORDER: AuditFamily[] = [
  "format",
  "source-fidelity",
  "ref-integrity",
  "accessibility",
  "discipline",
];

const FAMILY_TITLE: Record<AuditFamily, string> = {
  "format": "Format",
  "source-fidelity": "Source fidelity",
  "ref-integrity": "Reference integrity",
  "accessibility": "Accessibility (WCAG contrast)",
  "discipline": "Shipping discipline",
};

/**
 * Combine row lists from every family into an AuditResult with counts,
 * timings, and the worst-status flag that drives the exit code.
 */
export function assembleAuditResult(
  byFamily: Record<AuditFamily, AuditRow[]>,
  timings: Record<AuditFamily, number>,
): AuditResult {
  const rows: AuditRow[] = [];
  let worst: AuditStatus = "PASS";
  const counts = { PASS: 0, FAIL: 0, WARN: 0 };

  for (const fam of FAMILY_ORDER) {
    for (const row of byFamily[fam]) {
      rows.push(row);
      counts[row.status]++;
      worst = worstOf(worst, row.status);
    }
  }

  return { rows, worstStatus: worst, counts, timings };
}

/**
 * Render the audit result as Markdown for `audit.md`.
 */
export function renderAuditMarkdown(result: AuditResult, runFolder: string): string {
  const lines: string[] = [];
  lines.push(`# Audit report — ${runFolder}`);
  lines.push("");
  lines.push(`**Verdict:** ${verdictBadge(result.worstStatus)}`);
  lines.push("");
  lines.push(`- PASS: ${result.counts.PASS}`);
  lines.push(`- WARN: ${result.counts.WARN}`);
  lines.push(`- FAIL: ${result.counts.FAIL}`);
  lines.push("");
  lines.push("## Family timings");
  lines.push("");
  lines.push("| Family | Time (ms) |");
  lines.push("|---|--:|");
  for (const fam of FAMILY_ORDER) {
    lines.push(`| ${FAMILY_TITLE[fam]} | ${result.timings[fam]} |`);
  }
  lines.push("");

  for (const fam of FAMILY_ORDER) {
    const famRows = result.rows.filter(r => r.family === fam);
    if (famRows.length === 0) continue;
    lines.push(`## ${FAMILY_TITLE[fam]}`);
    lines.push("");
    lines.push("| Status | Rule | Detail |");
    lines.push("|---|---|---|");
    for (const row of famRows) {
      const detail = row.detail.replace(/\|/g, "\\|");
      lines.push(`| ${row.status} | \`${row.rule}\` | ${detail} |`);
    }
    lines.push("");
    // Suggested fixes for non-PASS rows
    const fixes = famRows.filter(r => r.status !== "PASS" && r.suggestedFix);
    if (fixes.length > 0) {
      lines.push("### Suggested fixes");
      lines.push("");
      for (const f of fixes) {
        lines.push(`- **${f.rule}** (${f.status}) — ${f.suggestedFix}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Render the audit result as machine-parseable JSON for `audit.json`.
 */
export function renderAuditJson(result: AuditResult, runFolder: string): string {
  const payload = {
    runFolder,
    verdict: result.worstStatus,
    counts: result.counts,
    timings: result.timings,
    rows: result.rows,
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

function verdictBadge(status: AuditStatus): string {
  switch (status) {
    case "PASS": return "✅ PASS — exit 0";
    case "WARN": return "⚠️ WARN — exit 2";
    case "FAIL": return "❌ FAIL — exit 1";
  }
}
