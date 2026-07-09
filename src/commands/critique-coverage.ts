/**
 * `ui critique-coverage` — the curator's goal-axis accounting (deterministic).
 *
 * Given a brief spec (acceptance criteria) and a produced design manifest
 * (screens + which criteria each covers), report uncovered criteria + coverage %.
 * Zero-token, zero-network, zero-LLM. Read-only. Exit 1 iff coverage < 100% (any
 * uncovered criterion). The taste + goal JUDGMENT stays host-model (curator.md);
 * this is the accounting the binary owns. No subcommands.
 */
import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { parseSpec, parseManifest, checkCoverage, CoverageError } from "../core/coverage-check.js";

const CMD = "critique-coverage";

export const CRITIQUE_COVERAGE_HELP = `ui critique-coverage — acceptance-criteria coverage of a produced design

Usage:
  ui critique-coverage <spec.json> <manifest.json> [--json]

Inputs:
  <spec.json>      The brief: { acceptanceCriteria: [{ id, text? }], successMetrics?: [...] }
  <manifest.json>  The produced design: { screens: [{ name, coversCriteria?: [ids], states?: [...] }] }

Options:
  --json           Emit a JSON envelope (coveragePct, covered, uncovered, perCriterion, unknownRefs)
  -h, --help       Show this help

Reports every acceptance criterion that no screen/state covers, plus the coverage %
and any unknownRefs (a screen claiming a criterion the spec doesn't list). The taste
and goal-plausibility judgment stay host-model (see knowledge/figma-craft/curator.md).

Exit codes:
  0  100% coverage (every acceptance criterion is covered)
  1  One or more uncovered criteria, or a user/file error

Error codes:
  BAD_ARG        Missing <spec.json> or <manifest.json>, or unexpected extra positionals
  FILE_NOT_FOUND An input file does not exist (ENOENT)
  READ_ERROR     An input file exists but cannot be read
  BAD_JSON       An input file is not valid JSON, or is the wrong shape
`;

class InputError extends Error {
  constructor(readonly code: "FILE_NOT_FOUND" | "READ_ERROR" | "BAD_JSON", message: string) {
    super(message);
  }
}

function readJson(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new InputError(
      isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR",
      isNotFound ? `file not found: '${path}'` : `cannot read file '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new InputError("BAD_JSON", `invalid JSON in '${path}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

function formatReport(result: ReturnType<typeof checkCoverage>): string {
  const lines: string[] = [`critique-coverage: ${result.covered.length}/${result.criterionCount} criteria covered (${result.coveragePct}%) across ${result.screenCount} screen(s)`];
  if (result.uncovered.length > 0) {
    lines.push("  UNCOVERED (no screen/state covers these):");
    for (const p of result.perCriterion.filter((x) => x.coveredBy.length === 0)) {
      lines.push(`    [${p.id}] ${p.text ?? ""}`.trimEnd());
    }
  } else {
    lines.push("  All acceptance criteria covered.");
  }
  if (result.unknownRefs.length > 0) {
    lines.push(`  unknownRefs (screens claim criteria not in the spec): ${result.unknownRefs.join(", ")}`);
  }
  return lines.join("\n") + "\n";
}

export const critiqueCoverageCommand = {
  name: CMD,
  summary: "Deterministic acceptance-criteria coverage of a produced design (the curator's goal axis)",
  hasSubcommands: false,
  help: CRITIQUE_COVERAGE_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    const specPath = parsed.positionals[0];
    const manifestPath = parsed.positionals[1];
    if (specPath === undefined || manifestPath === undefined) {
      const msg = "ui critique-coverage requires <spec.json> and <manifest.json>";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (parsed.positionals.length > 2) {
      const msg = `ui critique-coverage takes exactly two files; unexpected: ${parsed.positionals.slice(2).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    let result: ReturnType<typeof checkCoverage>;
    try {
      const spec = parseSpec(readJson(specPath), specPath);
      const manifest = parseManifest(readJson(manifestPath), manifestPath);
      result = checkCoverage(spec, manifest);
    } catch (e) {
      if (e instanceof InputError || e instanceof CoverageError) {
        return useJson ? errJson(CMD, e.code, e.message) : errText(`ui: ${e.message}\n`);
      }
      throw e;
    }

    const exitCode = result.uncovered.length > 0 ? 1 : 0;
    if (useJson) {
      return okJsonWithExit(CMD, result, exitCode);
    }
    return { exitCode, stdout: formatReport(result) };
  },
};
