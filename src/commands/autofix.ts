/**
 * `ui autofix` command — apply 5 deterministic HTML fix rules.
 *
 * Default: fixed HTML → stdout, findings summary → stderr.
 * --write: overwrite the input file in place (opt-in side effect).
 * --json:  emit JsonEnvelope on stdout; --write still applies when combined.
 *
 * No subcommands — hasSubcommands: false.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { runAutofix } from "../core/html-autofix.js";
import { withOutcome } from "../core/memory-autorecord.js";

const CMD = "autofix";

export const AUTOFIX_HELP = `ui autofix — apply deterministic HTML fix rules

Usage:
  ui autofix <file.html> [--write] [--json]

Options:
  --write    Overwrite the input file with the fixed HTML (default: print to stdout)
  --json     Emit a JSON envelope instead of human-readable output
  -h, --help Show this help

Rules applied (in order):
  viewport-meta      Add missing viewport meta tag
  img-onerror        Add image fallback onerror handlers (picsum → SVG cascade)
  lucide-createicons Insert lucide.createIcons() when Lucide icons are used
  cdn-urls           Replace versioned Lucide CDN URLs with @latest
  duplicate-ids      Append -N suffix to duplicate id="" values

Error codes:
  BAD_ARG        Missing <file.html> argument
  FILE_NOT_FOUND File does not exist (ENOENT)
  READ_ERROR     File exists but cannot be read
  WRITE_ERROR    --write failed (permission denied, etc.)

Notes:
  - The linter is best-effort: malformed HTML yields fewer or zero findings.
  - duplicate-ids uses a regex heuristic and may miss template-literal contexts.
  - Running autofix on already-fixed HTML produces zero findings (idempotent).
`;

// ─── Command handler ──────────────────────────────────────────────────────────

export const autofixCommand = {
  name: CMD,
  summary: "Apply 5 deterministic HTML fix rules (viewport, imgs, Lucide, CDN, dup-ids)",
  hasSubcommands: false,
  help: AUTOFIX_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const doWrite = parsed.flags["write"] === true;

    // 1. Resolve file path from positionals[0].
    // cli.ts ensures that for no-subcommand commands the file argument is
    // always in positionals[0] (the subcommand slot is shifted back before dispatch).
    const filePath = parsed.positionals[0];
    if (filePath === undefined) {
      const msg = "ui autofix requires a <file.html> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    if (parsed.positionals.length > 1) {
      const msg = `ui autofix takes exactly one file argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`;
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

    // 3. Apply autofix rules (pure transform)
    const { html: fixedHtml, findings } = runAutofix(raw);

    // 4. Optionally overwrite the file in place
    let written = false;
    if (doWrite) {
      try {
        writeFileSync(filePath, fixedHtml, "utf8");
        written = true;
      } catch (e) {
        const msg = `cannot write file '${filePath}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
    }

    // 5. Shape output
    let out: CommandResult;
    if (useJson) {
      out = okJson(CMD, {
        file: filePath,
        fixesApplied: findings.length,
        findings,
        written,
        html: fixedHtml,
      });
    } else {
      // Text mode: fixed HTML → stdout, summary → stderr
      const ruleNames = findings.map((f) => f.ruleId).join(", ");
      const summary =
        findings.length === 0
          ? "applied 0 fixes\n"
          : `applied ${findings.length} fix${findings.length === 1 ? "" : "es"}: ${ruleNames}\n`;

      out = doWrite
        ? { exitCode: 0, stderr: summary } // File already written; just emit the summary
        : { exitCode: 0, stdout: fixedHtml, stderr: summary };
    }

    const recordable = doWrite && written && findings.length > 0;
    if (!recordable) return out;
    return withOutcome(out, parsed, {
      type: "autofix_applied",
      actor: "ui autofix",
      projectDir: filePath,
      data: { file: filePath, fixCount: findings.length, ruleIds: [...new Set(findings.map((f) => f.ruleId))].sort() },
    });
  },
};
