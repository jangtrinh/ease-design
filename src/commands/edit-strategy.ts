/**
 * `ui edit-strategy` command — select strategy, number lines, apply ln-diff.
 *
 * Subcommands:
 *   select <change-request>          → strategy classifier (pure, no I/O)
 *   number-lines <file.html|->       → prefix every line with a right-aligned number
 *   apply <file.html> --diff <file|-> → apply a ln-diff patch to an HTML file
 *
 * hasSubcommands: true
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errJsonWithData, errText, okJson } from "../core/output.js";
import { readAllStdin } from "../core/stdin-reader.js";
import {
  selectEditStrategy,
  addLineNumbers,
  parseLnDiff,
  applyLnDiffDetailed,
} from "../core/edit-strategy.js";
import type { UnmatchedChunk } from "../core/edit-strategy.js";

const CMD = "edit-strategy";

export const EDIT_STRATEGY_HELP = `ui edit-strategy — select strategy, number lines, apply ln-diff patch

Usage:
  ui edit-strategy select "<change request>" [--json]
  ui edit-strategy number-lines <file.html|-> [--json]
  ui edit-strategy apply <file.html> --diff <diff-file|-> [--write] [--json]

Subcommands:
  select        Classify a change request as deterministic | ln_diff | full_regen
  number-lines  Prefix every HTML line with a right-aligned line number
  apply         Apply a ln-diff patch produced by an LLM to an HTML file

Options:
  --diff <path|->  Diff source file or stdin (apply only)
  --write          Overwrite the HTML file in place (apply only)
  --json           Emit JSON envelope instead of human-readable output
  -h, --help       Show this help

Diff format:
  @@ line <start>[-<end>] @@
  - <old line>
  + <new line>
    <context line>

Error codes:
  BAD_ARG        Missing required positional or flag
  FILE_NOT_FOUND File does not exist
  READ_ERROR     File exists but cannot be read
  WRITE_ERROR    --write failed
  BAD_DIFF       Zero chunks parsed from diff input
  DIFF_NO_MATCH  A chunk matched no lines within ±5; --json carries a
                 data.unmatched[] diagnostic (nearest window + rule) so you can
                 repair the diff once before falling back to full regen
`;

// ─── File read helper ─────────────────────────────────────────────────────────

function readSource(
  pathOrDash: string,
  label: string,
  useJson: boolean,
  sub: string,
): { content: string } | CommandResult {
  if (pathOrDash === "-") {
    try {
      return { content: readAllStdin() };
    } catch (e) {
      const msg = `cannot read ${label} from stdin: ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(sub, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
    }
  }
  try {
    return { content: readFileSync(pathOrDash, "utf8") };
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
    const msg = isNotFound
      ? `file not found: '${pathOrDash}'`
      : `cannot read '${pathOrDash}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
  }
}

function isCommandResult(v: { content: string } | CommandResult): v is CommandResult {
  return "exitCode" in v;
}

/**
 * Human-readable summary for a DIFF_NO_MATCH failure. Names each unmatched
 * chunk and, when found, the nearest window it should have quoted — enough for
 * one repair pass before the caller falls back to full regen.
 */
function formatNoMatch(unmatched: UnmatchedChunk[]): string {
  const lines: string[] = [
    `${unmatched.length} diff chunk(s) did not match — re-quote the exact lines, then retry once before full regen:`,
  ];
  for (const u of unmatched) {
    lines.push(`  @@ line ${u.startLine}-${u.endLine} @@ — ${u.rule}`);
    if (u.nearest !== null) {
      lines.push(
        `    nearest match at line ${u.nearest.startLine} (${u.nearest.matched}/${u.oldLines.length} lines):`,
      );
      for (const l of u.nearest.lines) lines.push(`      | ${l}`);
    }
  }
  return lines.join("\n");
}

// ─── Subcommand: select ───────────────────────────────────────────────────────

function runSelect(parsed: ParsedArgs): CommandResult {
  const sub = `${CMD} select`;
  const useJson = parsed.json;
  const changeRequest = parsed.positionals[0];
  if (changeRequest === undefined) {
    const msg = "ui edit-strategy select requires a <change-request> positional";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  const strategy = selectEditStrategy(changeRequest);
  if (useJson) return okJson(sub, { strategy, changeRequest });
  return { exitCode: 0, stdout: `${strategy}\n` };
}

// ─── Subcommand: number-lines ─────────────────────────────────────────────────

function runNumberLines(parsed: ParsedArgs): CommandResult {
  const sub = `${CMD} number-lines`;
  const useJson = parsed.json;
  const filePath = parsed.positionals[0];
  if (filePath === undefined) {
    const msg = "ui edit-strategy number-lines requires a <file.html|-> argument";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  const read = readSource(filePath, "html", useJson, sub);
  if (isCommandResult(read)) return read;

  const numberedHtml = addLineNumbers(read.content);
  const lineCount = read.content.split("\n").length;

  if (useJson) {
    return okJson(sub, {
      file: filePath,
      lineCount,
      numberedHtml,
    });
  }
  return { exitCode: 0, stdout: numberedHtml + "\n" };
}

// ─── Subcommand: apply ────────────────────────────────────────────────────────

function runApply(parsed: ParsedArgs): CommandResult {
  const sub = `${CMD} apply`;
  const useJson = parsed.json;
  const doWrite = parsed.flags["write"] === true;

  const htmlPath = parsed.positionals[0];
  if (htmlPath === undefined) {
    const msg = "ui edit-strategy apply requires a <file.html> positional";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const diffArg = parsed.flags["diff"];
  if (typeof diffArg !== "string") {
    const msg = "ui edit-strategy apply requires --diff <diff-file|->";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  // Stdin can only be read once — reject if both sources point to stdin.
  if (htmlPath === "-" && diffArg === "-") {
    const msg = "only one of <html> and --diff may be '-' — stdin can be read once";
    return useJson ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const htmlRead = readSource(htmlPath, "html", useJson, sub);
  if (isCommandResult(htmlRead)) return htmlRead;

  const diffRead = readSource(diffArg, "diff", useJson, sub);
  if (isCommandResult(diffRead)) return diffRead;

  const chunks = parseLnDiff(diffRead.content);
  if (chunks.length === 0) {
    const msg = "zero chunks parsed from diff input; check diff format";
    return useJson ? errJson(sub, "BAD_DIFF", msg) : errText(`ui: ${msg}\n`);
  }

  const result = applyLnDiffDetailed(htmlRead.content, chunks);
  if (!result.ok) {
    // Structured diagnostics let the caller repair the diff ONCE (re-quote the
    // nearest window) before escalating to the identity-risky full regen.
    const msg = formatNoMatch(result.unmatched);
    return useJson
      ? errJsonWithData(sub, "DIFF_NO_MATCH", msg, { unmatched: result.unmatched })
      : errText(`ui: ${msg}\n`);
  }
  const patched = result.html;

  let written = false;
  if (doWrite) {
    try {
      writeFileSync(htmlPath, patched, "utf8");
      written = true;
    } catch (e) {
      const msg = `cannot write '${htmlPath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(sub, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }
  }

  if (useJson) {
    return okJson(sub, {
      file: htmlPath,
      chunksApplied: chunks.length,
      patchedHtml: patched,
      written,
    });
  }

  const summary = `applied ${chunks.length} chunk(s)\n`;
  if (doWrite) return { exitCode: 0, stderr: summary };
  return { exitCode: 0, stdout: patched, stderr: summary };
}

// ─── Command registration object ──────────────────────────────────────────────

export const editStrategyCommand = {
  name: CMD,
  summary: "Select edit strategy, number HTML lines, apply ln-diff patch",
  hasSubcommands: true,
  help: EDIT_STRATEGY_HELP,

  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "select":       return runSelect(parsed);
      case "number-lines": return runNumberLines(parsed);
      case "apply":        return runApply(parsed);
      case undefined: {
        const msg = "ui edit-strategy requires a subcommand. Run 'ui edit-strategy --help'.";
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui edit-strategy --help'.`;
        return parsed.json
          ? errJson(CMD, "BAD_ARG", msg)
          : errText(`ui: ${msg}\n`);
      }
    }
  },
};
