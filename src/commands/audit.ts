/**
 * `ui audit` command — deterministic DS-violation audit of a structured node
 * export against a design-system spec (tokens + registry).
 *
 * Zero-token, zero-network: reads a node-tree JSON + optional token/registry
 * JSON and reports violations by node NAME + per-rule counts, plus a remap table
 * the canvas normalize step applies. Read-only. Exit 1 iff any violation (mirrors
 * validate-layout / taste-lint). The canvas edits are the hand — see
 * `templates/workflows/audit.md`.
 *
 * No subcommands — hasSubcommands: false.
 */
import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { buildAuditSpec } from "../core/audit-spec.js";
import { detectViolations, type AuditNode } from "../core/audit-detect.js";
import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";

const CMD = "audit";

export const AUDIT_HELP = `ui audit — deterministic DS-violation audit of a structured node export

Usage:
  ui audit <nodes.json> [--tokens <tokens.json>] [--registry <registry.json>]
                        [--grid <n>] [--json]

Inputs:
  <nodes.json>       Structured node export: a node, or an array of nodes, each
                     { name, type, fills:[{hex,boundToken}], cornerRadius,
                       itemSpacing, padding*, mainComponent, detached, role,
                       characters, children:[...] }. Extra fields are ignored;
                     SECTION/children are walked so a full-page sweep is complete.

Options:
  --tokens <f>       DTCG token file; enables the raw-hex-vs-token check
  --registry <f>     Component registry; enables detached/raw-icon/deprecated checks
  --grid <n>         Base grid for off-grid radius/spacing (default 4)
  --json             Emit a JSON envelope (violations, counts, remap table)
  -h, --help         Show this help

Checks (violation families, reported by node NAME + count):
  raw-hex-vs-token     an unbound solid fill whose hex is a DS token (needs --tokens)
  detached-instance    a detached instance, or a frame named like a component (needs --registry)
  raw-icon-vs-Icon     a raw icon (glyph/vector) where an Icon component exists (needs --registry)
  off-grid             cornerRadius/itemSpacing/padding off the base grid (pill radii >=100 exempt)
  deprecated-component an instance of a registry-deprecated component (needs --registry)

The remap table (--json) pairs each raw color/radius/spacing with its snapped
target so the canvas normalize step (see templates/workflows/audit.md) applies a
deterministic fix; detection is the zero-token ui binary, the canvas edit is the hand.

Exit codes:
  0  No violations
  1  One or more violations, or a user/file error

Error codes:
  BAD_ARG        Missing <nodes.json>, unexpected extra positionals, or bad --grid
  FILE_NOT_FOUND An input file does not exist (ENOENT)
  READ_ERROR     An input file exists but cannot be read
  BAD_JSON       An input file is not valid JSON, or nodes.json is the wrong shape
`;

// ─── File helpers ─────────────────────────────────────────────────────────────

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

function flagString(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
}

// ─── Text report formatter ────────────────────────────────────────────────────

function formatReport(filePath: string, result: ReturnType<typeof detectViolations>): string {
  const lines: string[] = [`audit: ${filePath}`];
  if (result.violations.length === 0) {
    lines.push("  No DS violations found.");
  } else {
    for (const v of result.violations) {
      lines.push(`  [${v.rule}] ${v.nodeName}: ${v.detail}`);
    }
  }
  lines.push("");
  const byRule = Object.entries(result.counts)
    .filter(([, n]) => n > 0)
    .map(([rule, n]) => `${rule}=${n}`)
    .join(", ");
  lines.push(`${result.total} violation(s)${byRule ? ` (${byRule})` : ""}`);
  return lines.join("\n") + "\n";
}

// ─── Command handler ──────────────────────────────────────────────────────────

export const auditCommand = {
  name: CMD,
  summary: "Deterministic DS-violation audit of a structured node export (5 families)",
  hasSubcommands: false,
  help: AUDIT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    const nodesPath = parsed.positionals[0];
    if (nodesPath === undefined) {
      const msg = "ui audit requires a <nodes.json> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (parsed.positionals.length > 1) {
      const msg = `ui audit takes exactly one node-export file; unexpected: ${parsed.positionals.slice(1).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // Optional --grid (positive integer).
    let gridBase: number | undefined;
    const gridRaw = flagString(parsed, "grid");
    if (gridRaw !== undefined) {
      const n = Number(gridRaw);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        const msg = `--grid must be a positive integer, got '${gridRaw}'`;
        return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      gridBase = n;
    }

    // Read inputs (nodes required; tokens/registry optional).
    let nodesJson: unknown;
    let tokensJson: unknown;
    let registryJson: unknown;
    try {
      nodesJson = readJson(nodesPath);
      const tokensPath = flagString(parsed, "tokens");
      if (tokensPath !== undefined) tokensJson = readJson(tokensPath);
      const registryPath = flagString(parsed, "registry");
      if (registryPath !== undefined) registryJson = readJson(registryPath);
    } catch (e) {
      if (e instanceof InputError) {
        return useJson ? errJson(CMD, e.code, e.message) : errText(`ui: ${e.message}\n`);
      }
      throw e;
    }

    // Node export must be an object or an array of nodes.
    if (nodesJson === null || typeof nodesJson !== "object") {
      const msg = `nodes file '${nodesPath}' must be a node object or an array of nodes`;
      return useJson ? errJson(CMD, "BAD_JSON", msg) : errText(`ui: ${msg}\n`);
    }

    const spec = buildAuditSpec({ tokens: tokensJson, registry: registryJson, gridBase });
    const result = detectViolations(nodesJson as AuditNode | AuditNode[], spec);

    const exitCode = result.total > 0 ? 1 : 0;
    const out = useJson
      ? okJsonWithExit(CMD, { file: nodesPath, ...result }, exitCode)
      : { exitCode, stdout: formatReport(nodesPath, result) };
    return withOutcome(out, parsed, {
      type: "lint_run",
      actor: "ui audit",
      projectDir: nodesPath,
      data: lintOutcomeData("audit", nodesPath, {
        errorCount: result.total,
        warningCount: 0,
        findings: result.violations.map((v) => ({ checkId: v.rule })),
      }),
    });
  },
};
