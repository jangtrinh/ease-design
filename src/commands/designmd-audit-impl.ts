/**
 * `ui designmd audit` — implementation.
 *
 * Reads a per-project run folder, runs the 5 audit families, writes
 * audit.md + audit.json into the same folder, and returns a
 * CommandResult whose exit code matches the worst row:
 *
 *   0  every row PASS
 *   1  any FAIL row
 *   2  no FAIL, ≥ 1 WARN
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { parseDesignMd } from "../core/designmd-parser.js";
import { auditFormat } from "../core/designmd-audit-format.js";
import { auditSourceFidelity } from "../core/designmd-audit-source-fidelity.js";
import type { TokensJson } from "../core/designmd-audit-source-fidelity.js";
import { auditRefIntegrity } from "../core/designmd-audit-ref-integrity.js";
import { auditAccessibility } from "../core/designmd-audit-accessibility.js";
import { auditDiscipline } from "../core/designmd-audit-discipline.js";
import { assembleAuditResult, renderAuditMarkdown, renderAuditJson } from "../core/designmd-audit-report.js";
import type { AuditFamily, AuditRow } from "../core/designmd-audit-types.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "designmd audit";

export function runAudit(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  const folderArg = parsed.positionals[0];
  if (typeof folderArg !== "string" || folderArg.length === 0) {
    const msg = "ui designmd audit requires <folder-path> as first positional argument";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const folder = resolve(folderArg);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    const msg = `folder not found or not a directory: '${folderArg}'`;
    return useJson ? errJson(CMD, "FOLDER_MISSING", msg) : errText(`ui: ${msg}\n`);
  }

  const designMdPath = join(folder, "DESIGN.md");
  if (!existsSync(designMdPath)) {
    const msg = `missing DESIGN.md in folder: '${folderArg}'`;
    return useJson ? errJson(CMD, "FOLDER_MISSING", msg) : errText(`ui: ${msg}\n`);
  }

  let designMdRaw: string;
  try {
    designMdRaw = readFileSync(designMdPath, "utf8");
  } catch (e) {
    const msg = `cannot read DESIGN.md: ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  const doc = parseDesignMd(designMdRaw);

  // tokens.json is optional — source-fidelity downgrades to WARN if absent
  const tokensPath = join(folder, "tokens.json");
  let tokens: TokensJson = {};
  if (existsSync(tokensPath)) {
    try {
      tokens = JSON.parse(readFileSync(tokensPath, "utf8")) as TokensJson;
    } catch {
      // Treat unreadable tokens.json the same as missing — surface as WARN in source-fidelity
      tokens = {};
    }
  }

  // Discipline scans every regular file in the folder.
  const disciplineFiles: Record<string, string> = {};
  for (const entry of readdirSync(folder)) {
    const full = join(folder, entry);
    const st = statSync(full);
    if (!st.isFile()) continue;
    if (st.size > 5 * 1024 * 1024) continue; // skip > 5 MB
    try {
      disciplineFiles[entry] = readFileSync(full, "utf8");
    } catch {
      // ignore unreadable
    }
  }

  // Run families with timing
  const byFamily = {} as Record<AuditFamily, AuditRow[]>;
  const timings = {} as Record<AuditFamily, number>;

  const runFamily = <T extends AuditFamily>(name: T, fn: () => AuditRow[]): void => {
    const start = performance.now();
    byFamily[name] = fn();
    timings[name] = Math.round(performance.now() - start);
  };

  runFamily("format", () => auditFormat(doc));
  runFamily("source-fidelity", () => auditSourceFidelity(doc, tokens));
  runFamily("ref-integrity", () => auditRefIntegrity(doc));
  runFamily("accessibility", () => auditAccessibility(doc));
  runFamily("discipline", () => auditDiscipline({ files: disciplineFiles }));

  const result = assembleAuditResult(byFamily, timings);

  // Write audit.md and audit.json into the folder
  const auditMdPath = join(folder, "audit.md");
  const auditJsonPath = join(folder, "audit.json");
  try {
    writeFileSync(auditMdPath, renderAuditMarkdown(result, folderArg), "utf8");
    writeFileSync(auditJsonPath, renderAuditJson(result, folderArg), "utf8");
  } catch (e) {
    const msg = `cannot write audit report: ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  // Exit code: 0 PASS, 1 FAIL, 2 WARN
  const exitCode = result.worstStatus === "FAIL" ? 1 : result.worstStatus === "WARN" ? 2 : 0;

  if (useJson) {
    return okJsonWithExit(CMD, {
      folder,
      verdict: result.worstStatus,
      counts: result.counts,
      timings: result.timings,
      rows: result.rows,
      auditMd: auditMdPath,
      auditJson: auditJsonPath,
    }, exitCode);
  }

  // Human-readable single-line summary; full report on disk
  const summary = `audit ${result.worstStatus} — PASS:${result.counts.PASS} WARN:${result.counts.WARN} FAIL:${result.counts.FAIL} (report: ${auditMdPath})\n`;
  if (exitCode === 0) return { exitCode, stdout: summary };
  return { exitCode, stdout: "", stderr: summary };
}
