/**
 * `ui validate-layout` command — static HTML structural/overflow linter.
 *
 * Runs 13 heuristic checks against an HTML file and reports findings.
 * Read-only: never writes to disk.
 *
 * Exit code policy (D4): exit 1 iff any error-severity finding; warnings → 0.
 * No subcommands — hasSubcommands: false.
 */
import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { lintLayout } from "../core/layout-lint.js";
import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";

const CMD = "validate-layout";

export const VALIDATE_LAYOUT_HELP = `ui validate-layout — static HTML structural/overflow linter

Usage:
  ui validate-layout <file.html> [--json]

Options:
  --json     Emit a JSON envelope instead of human-readable output
  -h, --help Show this help

Checks (heuristic — may false-positive on unusual markup):
  missing-html-root         error   No <html> tag present
  missing-body              error   No <body> tag present
  unclosed-structural-tag   error   Unbalanced open/close counts for structural tags
  missing-doctype           warning No <!doctype html> declaration
  fixed-width-overflow      warning Inline width or Tailwind class > 1280px
  viewport-unit-on-body     warning <body>/<html> uses width:100vw or w-screen
  nested-scroll-container   warning 2+ scroll containers detected (count heuristic)
  absolute-without-relative warning position:absolute with no relative anchor
  img-no-dimensions         warning <img> lacks width/height attrs and Tailwind size class
  empty-flex-grid           warning flex/grid container with no child tags
  css-100vw-width           warning width:100vw in a <style> rule (scrollbar gutter → overflow)
  root-overflow-x-hidden    warning overflow-x:hidden on html/body/:root (breaks position:sticky)
  avoidable-screenshot-crop warning <img> is a crops/ screenshot when a same-role real/ original exists

Exit codes:
  0  No error-severity findings (warnings are allowed)
  1  One or more error-severity findings, or user/file error

Error codes:
  BAD_ARG        Missing <file.html> argument
  FILE_NOT_FOUND File does not exist (ENOENT)
  READ_ERROR     File exists but cannot be read
`;

// ─── Text report formatter ────────────────────────────────────────────────────

function formatReport(
  filePath: string,
  errorCount: number,
  warningCount: number,
  findings: Array<{ checkId: string; severity: string; message: string; line?: number }>,
): string {
  const lines: string[] = [];
  lines.push(`validate-layout: ${filePath}`);

  if (findings.length === 0) {
    lines.push("  No issues found.");
  } else {
    for (const f of findings) {
      const loc = f.line !== undefined ? `:${f.line}` : "";
      const sev = f.severity === "error" ? "ERROR  " : "warning";
      lines.push(`  [${sev}] ${f.checkId}${loc}: ${f.message}`);
    }
  }

  lines.push("");
  lines.push(`${errorCount} error(s), ${warningCount} warning(s)`);
  return lines.join("\n") + "\n";
}

// ─── Command handler ──────────────────────────────────────────────────────────

export const validateLayoutCommand = {
  name: CMD,
  summary: "Static HTML structural/overflow linter (12 heuristic checks)",
  hasSubcommands: false,
  help: VALIDATE_LAYOUT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    // 1. Resolve file path from positionals[0].
    // cli.ts ensures that for no-subcommand commands the file argument is
    // always in positionals[0].
    const filePath = parsed.positionals[0];
    if (filePath === undefined) {
      const msg = "ui validate-layout requires a <file.html> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    if (parsed.positionals.length > 1) {
      const msg = `ui validate-layout takes exactly one file argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // 2. Read input file
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (e) {
      const isNotFound =
        e instanceof Error &&
        "code" in e &&
        (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound
        ? `file not found: '${filePath}'`
        : `cannot read file '${filePath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }

    // 3. Run linter (pure transform)
    const { findings, errorCount, warningCount } = lintLayout(raw);

    // 4. D4: exit 1 iff any error-severity finding
    const exitCode = errorCount > 0 ? 1 : 0;

    // 5. Shape output
    const out = useJson
      ? okJsonWithExit(CMD, { file: filePath, errorCount, warningCount, findings }, exitCode)
      : { exitCode, stdout: formatReport(filePath, errorCount, warningCount, findings) };
    return withOutcome(out, parsed, {
      type: "lint_run",
      actor: "ui validate-layout",
      projectDir: filePath,
      data: lintOutcomeData("validate-layout", filePath, { errorCount, warningCount, findings }),
    });
  },
};
