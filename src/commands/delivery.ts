import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import { DeliveryError, validateDelivery } from "../core/delivery-model.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";

const CMD = "delivery";
export const DELIVERY_HELP = `ui delivery — validate Qualified Delivery artifacts

Usage:
  ui delivery validate <file.json> [--json]

Kinds:
  design-brief          Provenance-tagged intent and evaluable criteria
  generation-contract  Direction, sections, canonical viewports, required gates
  qualification-record Gate evidence and honest delivery status

validate is deterministic: it checks shape and false-green invariants only.
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
    const result = validateDelivery(JSON.parse(raw));
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
