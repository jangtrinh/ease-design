/**
 * runSoul — implementation for `ui ds soul init|check`.
 *
 * The command-layer half of the design-soul standard (pure kernel:
 * src/core/ds-soul.ts). `init` writes the scaffold; `check` structure-lints
 * design/soul.md (findings-linter pattern — exit 1 on error-severity findings).
 * A soul is OPTIONAL everywhere else; only this explicit `check` treats a
 * missing file as an error (invoking it means you expect a soul to exist).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJson, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { writeSoulScaffold, checkSoul, SOUL_FILENAME } from "../core/ds-soul.js";
import type { SoulCheckResult } from "../core/ds-soul.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds soul";

export function runSoul(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const action = parsed.positionals[0];
  if (action !== "init" && action !== "check") {
    const msg =
      action === undefined
        ? "ui ds soul requires an action: init | check. Run 'ui ds --help'."
        : `unknown action '${action}' — expected init | check. Run 'ui ds --help'.`;
    return err("BAD_ARG", msg);
  }

  const dirFlag = parsed.flags["dir"];
  const designDir = join(typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd(), "design");
  const soulPath = join(designDir, SOUL_FILENAME);

  // ── init — write the scaffold ─────────────────────────────────────────────

  if (action === "init") {
    const unknown = findUnknownFlag(parsed.flags, ["dir", "force"]);
    if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

    const force = parsed.flags["force"] === true;
    if (existsSync(soulPath) && !force) {
      return err("EXISTS", `'${soulPath}' already exists. Re-run with --force to overwrite.`);
    }

    let result: { path: string; written: boolean };
    try {
      result = writeSoulScaffold(designDir, force);
    } catch (e) {
      return err("WRITE_ERROR", `cannot write '${soulPath}': ${e instanceof Error ? e.message : String(e)}`);
    }

    if (useJson) return okJson(CMD, result);
    return ok(
      `ds soul: scaffold written to ${result.path}\n` +
      `Edit the Never / Always / Voice sections, set 'status: ratified', then run 'ui ds soul check'.\n`,
    );
  }

  // ── check — structure-lint the file ───────────────────────────────────────

  const unknown = findUnknownFlag(parsed.flags, ["dir"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  let result: SoulCheckResult;
  if (!existsSync(soulPath)) {
    // Missing file is a FINDING (not an error envelope): calling `check`
    // explicitly means a soul is expected here.
    result = {
      findings: [{
        checkId: "soul-missing",
        severity: "error",
        message: "no design/soul.md — run `ui ds soul init`",
      }],
      errorCount: 1,
      warningCount: 0,
    };
  } else {
    let text: string;
    try {
      text = readFileSync(soulPath, "utf8");
    } catch (e) {
      return err("READ_ERROR", `cannot read '${soulPath}': ${e instanceof Error ? e.message : String(e)}`);
    }
    result = checkSoul(text);
  }

  const exitCode = result.errorCount > 0 ? 1 : 0;
  if (useJson) return okJsonWithExit(CMD, { path: soulPath, ...result }, exitCode);

  const lines =
    result.findings.length === 0
      ? [`ds soul check: ${soulPath} — 0 findings.`]
      : [
          `ds soul check: ${soulPath} — ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
          ...result.findings.map(
            (f) =>
              `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]${f.line !== undefined ? ` line ${f.line}` : ""}: ${f.message}`,
          ),
        ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}
