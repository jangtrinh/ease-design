/**
 * `ui content-lint <file.html>` — the deterministic content/UX-writing floor. Static,
 * precision-first, low-FP-only rules (see content-checks.ts). Exit 1 on error-severity.
 * Voice/tone FIT is a model judgment (curator), never mechanised here.
 */
import { readFileSync } from "node:fs";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { allContentChecks } from "../core/content-checks.js";
import type { ContentFinding } from "../core/content-checks.js";
import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";

const CMD = "content-lint";

export const CONTENT_LINT_HELP = `ui content-lint — deterministic content / UX-writing floor

Usage:
  ui content-lint <file.html> [--json]

Checks (low-false-positive only; voice/tone fit stays a model judgment):
  lorem-ipsum · placeholder-copy · placeholder-name   (errors — unfinished copy)
  click-here-link (WCAG 2.4.4) · error-code-alone · exclamation-overload ·
  insensitive-terms (whitelist/blacklist/master-slave) · plural-s-hack ("item(s)") ·
  text-in-image · all-caps-shout            (warnings)

Deliberately NOT included: write-good/proselint/alex-adjectives/Flesch–Kincaid — they
misfire on short imperative microcopy. Voice, wit and brand fit are scored by the curator
against knowledge/content-design.md's tone matrix, not by this linter.

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

export const contentLintCommand = {
  name: CMD,
  summary: "Deterministic content / UX-writing floor (low-FP static checks)",
  hasSubcommands: false,
  help: CONTENT_LINT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const file = parsed.positionals[0];
    if (file === undefined) {
      const msg = "ui content-lint requires <file.html>";
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

    const all: ContentFinding[] = [];
    for (const check of allContentChecks) all.push(...check(html));
    all.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || (a.line ?? 0) - (b.line ?? 0) || a.checkId.localeCompare(b.checkId));
    const errorCount = all.filter((f) => f.severity === "error").length;
    const result = { file, findings: all, errorCount, warningCount: all.length - errorCount };
    const exitCode = errorCount > 0 ? 1 : 0;

    const lines = all.length === 0
      ? [`content-lint: ${file} — 0 findings.`]
      : [`content-lint: ${file} — ${errorCount} error(s), ${result.warningCount} warning(s)`,
         ...all.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]${f.line !== undefined ? ` line ${f.line}` : ""}: ${f.message}`)];
    const out = useJson ? okJsonWithExit(CMD, result, exitCode) : { exitCode, stdout: lines.join("\n") + "\n" };
    return withOutcome(out, parsed, { type: "lint_run", actor: "ui content-lint", projectDir: file, data: lintOutcomeData("content-lint", file, result) });
  },
};
