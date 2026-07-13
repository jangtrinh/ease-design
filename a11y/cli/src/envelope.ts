/**
 * The machine contract + the human renderer — and the honesty wording discipline.
 *
 * Envelope shape mirrors the `ui` kernel exactly:
 *   success: {"ok": true,  "command": "a11y-audit", "data": {…}}
 *   failure: {"ok": false, "command": "a11y-audit", "error": {"code", "message"}}
 *
 * WORDING RULE (hard): output NEVER says "compliant" or "accessible". axe-core proves the
 * ABSENCE of the machine-detectable violations in the rules it ran — never the PRESENCE of
 * accessibility. A clean run reports "0 violations found …; manual criteria remain", same
 * honesty as `ui a11y-lint` / `ui ds a11y` ("not a conformance claim").
 */
import type { AuditData } from "./types.ts";

export const COMMAND = "a11y-audit";

/** The residue no rendered scan can settle — named so a clean run can't be misread as "done". */
export const MANUAL_RESIDUE =
  "focus-visibility quality, reading order sense, alt-text quality, and AT behaviour still need a human";

export interface OkEnvelope {
  ok: true;
  command: string;
  data: AuditData;
}

export interface ErrEnvelope {
  ok: false;
  command: string;
  error: { code: string; message: string };
}

export function okEnv(data: AuditData): OkEnvelope {
  return { ok: true, command: COMMAND, data };
}

export function errEnv(code: string, message: string): ErrEnvelope {
  return { ok: false, command: COMMAND, error: { code, message } };
}

/**
 * Human-readable render, mirroring the `ui` linters' `! [id] target: help (N nodes)` line.
 * A clean page states the honesty caveat inline; the summary always names the manual residue.
 */
export function formatText(data: AuditData): string {
  const lines: string[] = [];
  const ver = data.axeVersion || "unknown";
  for (const page of data.pages) {
    if (page.violationCount === 0) {
      lines.push(
        `a11y-audit: ${page.target} — 0 violations found by axe-core ${ver} on the rules run; manual criteria remain.`,
      );
      continue;
    }
    lines.push(`a11y-audit: ${page.target} — ${page.violationCount} violation(s) found by axe-core ${ver}:`);
    for (const v of page.violations) {
      lines.push(`  ! [${v.id}] ${v.sample}: ${v.help} (${v.nodes} nodes)`);
    }
  }
  lines.push(
    `a11y-audit: ${data.totals.violations} violation(s) across ${data.totals.pages} page(s). ` +
      `Rendered checks only — NOT a conformance claim; ${MANUAL_RESIDUE}.`,
  );
  return lines.join("\n") + "\n";
}
