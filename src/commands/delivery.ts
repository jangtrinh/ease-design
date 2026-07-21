import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { DeliveryError, validateDelivery } from "../core/delivery-model.js";
import type { DeliveryValidationContext } from "../core/delivery-model.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";

const CMD = "delivery";
export const DELIVERY_HELP = `ui delivery — validate Qualified Delivery artifacts

Usage:
  ui delivery validate <file.json> [--json]

Kinds:
  design-brief          Provenance-tagged intent and evaluable criteria
  generation-contract  v1 direction/evidence; v2 adds implementation craft defaults
  qualification-record v1 historical verdict; v2 validates referenced craft evidence
  learning-record      Four-way trials and anti-overfitting lesson promotion

validate is deterministic: it checks shape and false-green invariants only.
For v2 qualification records it reads contractRef relative to the record.
The host model owns inference and qualitative judgment.

Options:
  --json      Emit { kind, errorCount, warningCount, findings }
  -h, --help  Show this help

Error codes:
  BAD_ARG        Missing subcommand or <file.json>
  UNKNOWN_FLAG   Unrecognised --flag
  FILE_NOT_FOUND File does not exist
  READ_ERROR     File cannot be read
  BAD_DELIVERY   Invalid JSON, shape, or artifact kind
`;

function validate(parsed: ParsedArgs): CommandResult {
  const sub = "delivery validate";
  const file = parsed.positionals[0];
  if (file === undefined) {
    const msg = "ui delivery validate requires <file.json>";
    return parsed.json ? errJson(sub, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  let raw: string;
  try { raw = readFileSync(file, "utf8"); }
  catch (e) {
    const missing = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    const code = missing ? "FILE_NOT_FOUND" : "READ_ERROR";
    const msg = missing ? `file not found: '${file}'` : `cannot read '${file}'`;
    return parsed.json ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
  }
  try {
    const json = JSON.parse(raw) as unknown;
    const context = qualificationContext(json, file);
    const result = validateDelivery(json, context);
    const exitCode = result.errorCount > 0 ? 1 : 0;
    if (parsed.json) return okJsonWithExit(sub, { file, ...result }, exitCode);
    const lines = result.findings.length === 0
      ? [`delivery validate: ${file} — ${result.kind} valid`]
      : [`delivery validate: ${file} — ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
        ...result.findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}] ${f.message}`)];
    return { exitCode, stdout: lines.join("\n") + "\n" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof DeliveryError ? e.code : "BAD_DELIVERY";
    return parsed.json ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
  }
}

function qualificationContext(json: unknown, file: string): DeliveryValidationContext {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return {};
  const record = json as Record<string, unknown>;
  if (record["kind"] !== "qualification-record" || record["version"] !== 2 ||
      typeof record["contractRef"] !== "string" || record["contractRef"].length === 0) return {};
  try {
    if (isAbsolute(record["contractRef"])) return {};
    const recordDirectory = realpathSync(resolve(dirname(file)));
    const contractPath = resolve(recordDirectory, record["contractRef"]);
    if (!contractPath.startsWith(`${recordDirectory}${sep}`)) return {};
    const realContractPath = realpathSync(contractPath);
    if (!realContractPath.startsWith(`${recordDirectory}${sep}`)) return {};
    const contract = JSON.parse(readFileSync(realContractPath, "utf8")) as unknown;
    return contract !== null && typeof contract === "object" && !Array.isArray(contract)
      ? { contract: contract as Record<string, unknown> } : {};
  } catch {
    return {};
  }
}
export const deliveryCommand = {
  name: CMD, summary: "Validate Qualified Delivery contracts and verdicts",
  hasSubcommands: true, help: DELIVERY_HELP,
  run(parsed: ParsedArgs): CommandResult {
    if (parsed.subcommand === "validate") return validate(parsed);
    const msg = parsed.subcommand === undefined
      ? "ui delivery requires a subcommand. Run 'ui delivery --help'."
      : `unknown subcommand '${parsed.subcommand}'. Run 'ui delivery --help'.`;
    return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  },
};
