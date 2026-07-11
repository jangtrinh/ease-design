/**
 * runSpecimen — `ui ds specimen [--dir] [--strict] [--json]`.
 *
 * Reads the component-registry and reports each component's variant×state matrix + the
 * applicable-state gaps (learn-from-shadcn Phase 3). Low-false-positive by design: only
 * `missing-disabled` (interactive) and `missing-empty` (data-family) — see specimen-check.ts.
 * Informational by default (exit 0); `--strict` gates (exit 1 on any warning).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { errJson, errText, ok, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { checkSpecimen } from "../core/specimen-check.js";
import type { SpecimenComponent } from "../core/specimen-check.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds specimen";
const KNOWN_FLAGS = ["dir", "strict"] as const;

export function runSpecimen(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => (useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const dirFlag = parsed.flags["dir"];
  const designDir = join(typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd(), "design");
  const regPath = join(designDir, "component-registry.json");
  if (!existsSync(regPath)) return err("DS_NOT_FOUND", `no component-registry.json under '${designDir}' — run 'ui ds init' or 'ui ingest-figma-ds' first`);

  let components: SpecimenComponent[];
  try {
    const raw = JSON.parse(readFileSync(regPath, "utf8")) as { components?: unknown };
    if (!Array.isArray(raw.components)) return err("BAD_JSON", `${regPath}: missing 'components' array`);
    components = raw.components as SpecimenComponent[];
  } catch (e) {
    return err("BAD_JSON", `bad registry '${regPath}': ${e instanceof Error ? e.message : String(e)}`);
  }

  const result = checkSpecimen(components);
  const strict = parsed.flags["strict"] === true;
  const exitCode = strict && result.warningCount > 0 ? 1 : 0;

  if (useJson) return okJsonWithExit(CMD, { total: components.length, stateful: result.stateful, warningCount: result.warningCount, findings: result.findings }, exitCode);

  const lines = [
    `ds specimen: ${components.length} component(s), ${result.stateful} declare states, ${result.warningCount} completeness gap(s)${strict ? " (strict: gated)" : ""}`,
  ];
  for (const f of result.findings) lines.push(`  ! [${f.checkId}] ${f.component}: ${f.message}`);
  if (result.warningCount === 0) lines.push("  No applicable-state gaps found.");
  lines.push("  NOTE: checks only reliably-modelled gaps (disabled on interactive, empty on data-family). 'focus' is intentionally not required (usually a runtime :focus-visible, not a Figma variant).");
  return exitCode === 0 ? ok(lines.join("\n") + "\n") : { exitCode, stdout: lines.join("\n") + "\n" };
}
