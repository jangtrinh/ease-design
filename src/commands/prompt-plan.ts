import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import {
  PromptPlanError,
  validatePromptPlan,
} from "../core/prompt-plan-model.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";

const CMD = "prompt-plan";
export const PROMPT_PLAN_HELP = `ui prompt-plan - validate design orchestration artifacts

Usage:
  ui prompt-plan validate <file.json> [--json]
  ui prompt-plan preflight <file.json> [--json]

validate checks the complete prompt-plan v1 contract.
preflight emits the same deterministic findings for generation gating.
The host model owns inference, comparison, and qualitative judgment.

Options:
  --json      Emit structured findings
  -h, --help  Show this help

Error codes:
  BAD_ARG        Missing or unsupported subcommand
  UNKNOWN_FLAG   Unrecognised --flag
  FILE_NOT_FOUND File does not exist
  READ_ERROR     File cannot be read
  BAD_PROMPT_PLAN Invalid JSON or prompt-plan shape
`;

function check(parsed: ParsedArgs): CommandResult {
  const subcommand = parsed.subcommand ?? "validate";
  const command = `${CMD} ${subcommand}`;
  const file = parsed.positionals[0];
  if (file === undefined) {
    const message = `ui ${command} requires <file.json>`;
    return parsed.json ? errJson(command, "BAD_ARG", message) : errText(`ui: ${message}\n`);
  }
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    const missing = error instanceof Error && "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    const code = missing ? "FILE_NOT_FOUND" : "READ_ERROR";
    const message = missing ? `file not found: '${file}'` : `cannot read '${file}'`;
    return parsed.json ? errJson(command, code, message) : errText(`ui: ${message}\n`);
  }
  try {
    const result = validatePromptPlan(JSON.parse(raw) as unknown);
    const exitCode = result.ready ? 0 : 1;
    if (parsed.json) return okJsonWithExit(command, { file, ...result }, exitCode);
    const heading = result.ready
      ? `${command}: ${file} - ready`
      : `${command}: ${file} - ${result.errorCount} error(s), ${result.warningCount} warning(s)`;
    const findings = result.findings.map(
      (row) => `  ${row.severity === "error" ? "x" : "!"} [${row.checkId}] ${row.message}`,
    );
    return { exitCode, stdout: [heading, ...findings].join("\n") + "\n" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof PromptPlanError ? error.code : "BAD_PROMPT_PLAN";
    return parsed.json ? errJson(command, code, message) : errText(`ui: ${message}\n`);
  }
}

export const promptPlanCommand = {
  name: CMD,
  summary: "Validate design prompt orchestration plans",
  hasSubcommands: true,
  help: PROMPT_PLAN_HELP,
  run(parsed: ParsedArgs): CommandResult {
    if (parsed.subcommand === "validate" || parsed.subcommand === "preflight") {
      return check(parsed);
    }
    const message = parsed.subcommand === undefined
      ? "ui prompt-plan requires a subcommand. Run 'ui prompt-plan --help'."
      : `unknown subcommand '${parsed.subcommand}'. Run 'ui prompt-plan --help'.`;
    return parsed.json ? errJson(CMD, "BAD_ARG", message) : errText(`ui: ${message}\n`);
  },
};
