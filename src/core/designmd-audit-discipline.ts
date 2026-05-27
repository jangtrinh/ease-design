/**
 * Audit family: discipline
 *
 * Scans the run folder for shipping-discipline regressions:
 *   - plan-reference leakage (CLAUDE.md §5 rule)
 *   - TODO / FIXME / template-token markers leaked into the emitted
 *     DESIGN.md or run-summary
 *
 * Operates on already-read file contents — no I/O — so the audit
 * command stays single-pass.
 */
import type { AuditRow } from "./designmd-audit-types.js";

const LEAKAGE_RE = /Phase\s+\d|OD-\d|finding\s+[A-Z]\b/g;
const TODO_RE = /\b(TODO|FIXME|XXX|HACK)\b|<%[^%]+%>/g;

export interface DisciplineInputs {
  /** Map of relative file path → file contents. */
  files: Record<string, string>;
}

export function auditDiscipline(inputs: DisciplineInputs): AuditRow[] {
  const rows: AuditRow[] = [];

  const leakage: { file: string; matches: string[] }[] = [];
  const todos: { file: string; matches: string[] }[] = [];

  for (const [filename, contents] of Object.entries(inputs.files)) {
    // Skip the audit files themselves (they may reference rule names that look like plan refs).
    if (filename === "audit.md" || filename === "audit.json") continue;

    const leakMatches = contents.match(LEAKAGE_RE);
    if (leakMatches && leakMatches.length > 0) {
      leakage.push({ file: filename, matches: [...new Set(leakMatches)].slice(0, 3) });
    }

    const todoMatches = contents.match(TODO_RE);
    if (todoMatches && todoMatches.length > 0) {
      todos.push({ file: filename, matches: [...new Set(todoMatches)].slice(0, 3) });
    }
  }

  if (leakage.length === 0) {
    rows.push({
      family: "discipline",
      rule: "no-plan-reference-leakage",
      status: "PASS",
      detail: "no plan-reference strings (Phase N / OD-N / finding X) leaked into the run folder",
    });
  } else {
    rows.push({
      family: "discipline",
      rule: "no-plan-reference-leakage",
      status: "FAIL",
      detail: `${leakage.length} file(s) contain plan-reference strings: ${leakage.slice(0, 3).map(l => `${l.file} (${l.matches.join(", ")})`).join("; ")}`,
      suggestedFix: "rewrite the offending prose without referencing plan phases, finding codes, or other plan artefacts",
    });
  }

  if (todos.length === 0) {
    rows.push({
      family: "discipline",
      rule: "no-todo-or-template-markers",
      status: "PASS",
      detail: "no TODO/FIXME/HACK/template markers in the run folder",
    });
  } else {
    rows.push({
      family: "discipline",
      rule: "no-todo-or-template-markers",
      status: "WARN",
      detail: `${todos.length} file(s) carry placeholder markers: ${todos.slice(0, 3).map(t => `${t.file} (${t.matches.join(", ")})`).join("; ")}`,
      suggestedFix: "resolve the markers before shipping — either complete the work or remove the placeholder",
    });
  }

  return rows;
}
