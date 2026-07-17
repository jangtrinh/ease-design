/**
 * `ui a11y-lint <file.html>` — Tier-1 static-HTML accessibility linter. Exit 1 on any
 * error-severity finding. Precision-first; a pass is NOT a conformance claim.
 */
import { readFileSync } from "node:fs";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { lintA11y } from "../core/a11y-lint.js";
import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";

const CMD = "a11y-lint";

export const A11Y_LINT_HELP = `ui a11y-lint — static-HTML accessibility linter (Tier 1)

Usage:
  ui a11y-lint <file.html> [--json]

Checks (WCAG SC) — decidable from static markup, precision-first:
  img-missing-alt (1.1.1) · html-lang (3.1.1) · document-title (2.4.2) ·
  positive-tabindex (2.4.3) · viewport-zoom-blocked (1.4.4) ·
  icon-control-unnamed (4.1.2 — an emoji/glyph or icon-only button/link with no aria-label) ·
  heading hierarchy (1.3.1/2.4.6, warnings).

A pass is NOT "accessible" and NOT "WCAG AA conformant": this verifies what static markup
can prove. Rendered contrast, focus visibility, focus-order meaning, and alt-text quality
need a browser (Tier 2) or a human — they are out of scope here.

Options:
  --json      Emit a JSON envelope { errorCount, warningCount, findings }
  -h, --help  Show this help

Exit codes:
  0  No error-severity findings (warnings allowed)
  1  One or more error-severity findings, or a user/file error

Error codes:
  BAD_ARG        Missing <file.html>
  FILE_NOT_FOUND The input file does not exist
  READ_ERROR     The input file cannot be read
`;

function formatReport(r: ReturnType<typeof lintA11y>, file: string): string {
  if (r.findings.length === 0) {
    return `a11y-lint: ${file} — 0 static findings. NOTE: not a conformance claim; rendered/behavioural criteria and alt quality need a browser or a human.\n`;
  }
  const lines = [`a11y-lint: ${file} — ${r.errorCount} error(s), ${r.warningCount} warning(s)`];
  for (const f of r.findings) {
    const mark = f.severity === "error" ? "✗" : "!";
    lines.push(`  ${mark} [${f.checkId} · WCAG ${f.sc}]${f.line !== undefined ? ` line ${f.line}` : ""}: ${f.message}`);
  }
  lines.push("  NOTE: static checks only — a pass is not a conformance claim.");
  return lines.join("\n") + "\n";
}

export const a11yLintCommand = {
  name: CMD,
  summary: "Static-HTML accessibility linter (Tier-1 WCAG checks; not a conformance claim)",
  hasSubcommands: false,
  help: A11Y_LINT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const file = parsed.positionals[0];
    if (file === undefined) {
      const msg = "ui a11y-lint requires <file.html>";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    let html: string;
    try {
      html = readFileSync(file, "utf8");
    } catch (e) {
      const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound ? `file not found: '${file}'` : `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }
    const result = lintA11y(html);
    const exitCode = result.errorCount > 0 ? 1 : 0;
    const out = useJson ? okJsonWithExit(CMD, { file, ...result }, exitCode) : { exitCode, stdout: formatReport(result, file) };
    return withOutcome(out, parsed, { type: "lint_run", actor: "ui a11y-lint", projectDir: file, data: lintOutcomeData("a11y-lint", file, result) });
  },
};
