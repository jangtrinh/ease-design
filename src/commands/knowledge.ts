/**
 * `ui knowledge check` — the deterministic "unit tier" for the knowledge core.
 * Pure kernel: src/core/knowledge-lint.ts (fs-free). This command owns all IO —
 * it walks knowledge/, reads the markdown + personas.json, and hands already-read
 * content to the linter, which returns findings. Free, no model call, runs on
 * every commit (CI). See knowledge/authoring-standard.md for the conventions.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { lintKnowledge } from "../core/knowledge-lint.js";
import type { KnowledgeFinding } from "../core/knowledge-lint.js";

const CMD = "knowledge";

export const KNOWLEDGE_HELP = `ui knowledge — governance checks over the knowledge core

Usage:
  ui knowledge check [--dir <repo-root>] [--as-of <YYYYMM>] [--json]

Subcommands:
  check   Findings-linter over knowledge/; exit 1 on error-severity findings

Checks:
  index-missing-row       (error)   a knowledge/*.md with no row in README '## The files'
  index-dead-row          (error)   a README table row pointing to a missing file
  persona-drift           (error)   persona-index.md ↔ personas/*.md ↔ personas.json disagree
  broken-xref             (error)   a relative markdown link that does not resolve
  benchmark-stale         (warning) a benchmarks/*.dna.json older than 6 months
  provenance-bad-grammar  (error)   an ease:source marker missing ref= or with a dead ref

Options:
  --dir <path>     Repo root holding knowledge/ (default: current working directory)
  --as-of <YYYYMM> Reference month for benchmark-stale (default: current month) —
                   the one time-dependent input, isolated behind this flag so a
                   pinned value keeps the check fully deterministic
  --json           Emit a JSON envelope
  -h, --help       Show this help

Error codes:
  BAD_ARG       Missing/unknown subcommand
  UNKNOWN_FLAG  Unrecognised --flag (rejected, with a did-you-mean hint)
  NO_KNOWLEDGE  No knowledge/ directory under --dir
  BAD_AS_OF     --as-of is not a YYYYMM month
  READ_ERROR    A knowledge file could not be read
`;

/** Current month as YYYYMM — the sole non-deterministic input, only when --as-of is absent. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Recursively collect posix-relative file paths under `root`. */
function walk(root: string, base = ""): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(root, base), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base === "" ? ent.name : `${base}/${ent.name}`;
    if (ent.isDirectory()) out.push(...walk(root, rel));
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

function runCheck(parsed: ParsedArgs): CommandResult {
  const sub = "knowledge check";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir", "as-of"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const repoRoot = typeof parsed.flags["dir"] === "string" ? resolve(parsed.flags["dir"]) : process.cwd();
  const knowledgeDir = join(repoRoot, "knowledge");
  if (!existsSync(knowledgeDir)) {
    return err("NO_KNOWLEDGE", `no knowledge/ directory under '${repoRoot}' — run from a repo root, or pass --dir`);
  }

  const asOfFlag = parsed.flags["as-of"];
  if (asOfFlag === true) return err("BAD_AS_OF", "--as-of requires a YYYYMM value (e.g. 202607)");
  const asOf = typeof asOfFlag === "string" ? asOfFlag : currentMonth();
  if (!/^\d{6}$/.test(asOf)) return err("BAD_AS_OF", `--as-of must be a YYYYMM month (e.g. 202607), got '${asOf}'`);

  let files: string[];
  const mdContents: Record<string, string> = {};
  try {
    files = walk(knowledgeDir);
    for (const rel of files) if (rel.endsWith(".md")) mdContents[rel] = readFileSync(join(knowledgeDir, rel), "utf8");
  } catch (e) {
    return err("READ_ERROR", `cannot read knowledge/: ${e instanceof Error ? e.message : String(e)}`);
  }

  let personasJson: string | null = null;
  const personasPath = join(knowledgeDir, "personas", "personas.json");
  if (existsSync(personasPath)) {
    try { personasJson = readFileSync(personasPath, "utf8"); } catch { personasJson = null; }
  }

  // repoFiles — the subtrees an ease:source ref may target (knowledge/**, references/**).
  const repoFiles = files.map((f) => `knowledge/${f}`);
  const refsDir = join(repoRoot, "references");
  if (existsSync(refsDir)) {
    try { for (const f of walk(refsDir)) repoFiles.push(`references/${f}`); } catch { /* references/ optional */ }
  }

  const findings: KnowledgeFinding[] = lintKnowledge({ files, mdContents, personasJson, repoFiles, asOf });
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.length - errorCount;
  const exitCode = errorCount > 0 ? 1 : 0;

  if (useJson) return okJsonWithExit(sub, { dir: knowledgeDir, asOf, findings, errorCount, warningCount }, exitCode);
  const lines =
    findings.length === 0
      ? [`knowledge check: ${knowledgeDir} — 0 findings.`]
      : [
          `knowledge check: ${knowledgeDir} — ${errorCount} error(s), ${warningCount} warning(s)`,
          ...findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]: ${f.message}`),
        ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

export const knowledgeCommand = {
  name: CMD,
  summary: "Governance checks over the knowledge core (index / persona / xref / provenance drift)",
  hasSubcommands: true,
  help: KNOWLEDGE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "check": return runCheck(parsed);
      case undefined: {
        const msg = "ui knowledge requires a subcommand (check). Run 'ui knowledge --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui knowledge --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
