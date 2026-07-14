/**
 * runSoul — implementation for `ui ds soul init|check`.
 *
 * The command-layer half of the design-soul standard (pure kernel:
 * src/core/ds-soul.ts). `init` writes the scaffold; `check` structure-lints
 * design/soul.md (findings-linter pattern — exit 1 on error-severity findings).
 * A soul is OPTIONAL everywhere else; only this explicit `check` treats a
 * missing file as an error (invoking it means you expect a soul to exist).
 *
 * `--studio` targets the genealogy layer ABOVE every project soul instead:
 * $EASE_DESIGN_HOME/studio-soul.md (pure kernel: src/core/ds-soul-studio.ts).
 * It is mutually exclusive with `--dir` — a studio is user-scoped, not
 * per-project.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJson, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { writeSoulScaffold, checkSoul, SOUL_FILENAME } from "../core/ds-soul.js";
import { STUDIO_SOUL_FILENAME, checkStudioSoul, writeStudioSoulScaffold } from "../core/ds-soul-studio.js";
import { easeHome } from "../core/memory-store.js";
import type { SoulCheckResult } from "../core/ds-soul.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds soul";

type ErrFn = (code: string, msg: string) => CommandResult;

/** Render a check result the same way in text mode, whether project or studio. */
function renderCheckText(path: string, result: SoulCheckResult): string {
  const lines =
    result.findings.length === 0
      ? [`ds soul check: ${path} — 0 findings.`]
      : [
          `ds soul check: ${path} — ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
          ...result.findings.map(
            (f) =>
              `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]${f.line !== undefined ? ` line ${f.line}` : ""}: ${f.message}`,
          ),
        ];
  return lines.join("\n") + "\n";
}

/** `ds soul init --studio` — writes $EASE_DESIGN_HOME/studio-soul.md. */
function runStudioInit(force: boolean, useJson: boolean, err: ErrFn): CommandResult {
  const home = easeHome();
  const path = join(home, STUDIO_SOUL_FILENAME);
  if (existsSync(path) && !force) {
    return err("EXISTS", `'${path}' already exists. Re-run with --force to overwrite.`);
  }

  let result: { path: string; written: boolean };
  try {
    result = writeStudioSoulScaffold(home, force);
  } catch (e) {
    return err("WRITE_ERROR", `cannot write '${path}': ${e instanceof Error ? e.message : String(e)}`);
  }

  if (useJson) return okJson(CMD, result);
  return ok(
    `ds soul: studio scaffold written to ${result.path}\n` +
    `Edit the Never / Always / Voice sections, set 'name:' + 'status: ratified', then run 'ui ds soul check --studio'.\n`,
  );
}

/** `ds soul check --studio` — structure-lints $EASE_DESIGN_HOME/studio-soul.md. */
function runStudioCheck(useJson: boolean, err: ErrFn): CommandResult {
  const path = join(easeHome(), STUDIO_SOUL_FILENAME);
  let result: SoulCheckResult;
  if (!existsSync(path)) {
    result = {
      findings: [{
        checkId: "soul-missing",
        severity: "error",
        message: "no studio-soul.md — run `ui ds soul init --studio`",
      }],
      errorCount: 1,
      warningCount: 0,
    };
  } else {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (e) {
      return err("READ_ERROR", `cannot read '${path}': ${e instanceof Error ? e.message : String(e)}`);
    }
    result = checkStudioSoul(text);
  }

  const exitCode = result.errorCount > 0 ? 1 : 0;
  if (useJson) return okJsonWithExit(CMD, { path, ...result }, exitCode);
  return { exitCode, stdout: renderCheckText(path, result) };
}

export function runSoul(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err: ErrFn = (code, msg) =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const action = parsed.positionals[0];
  if (action !== "init" && action !== "check") {
    const msg =
      action === undefined
        ? "ui ds soul requires an action: init | check. Run 'ui ds --help'."
        : `unknown action '${action}' — expected init | check. Run 'ui ds --help'.`;
    return err("BAD_ARG", msg);
  }

  const studio = parsed.flags["studio"] === true;
  const dirFlag = parsed.flags["dir"];

  if (studio && dirFlag !== undefined) {
    return err("BAD_ARG", "--studio ignores --dir");
  }

  // ── studio soul — the genealogy layer above every project soul ───────────

  if (studio) {
    if (action === "init") {
      const unknown = findUnknownFlag(parsed.flags, ["studio", "force"]);
      if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
      return runStudioInit(parsed.flags["force"] === true, useJson, err);
    }
    const unknown = findUnknownFlag(parsed.flags, ["studio"]);
    if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
    return runStudioCheck(useJson, err);
  }

  // ── project soul (P1) ──────────────────────────────────────────────────────

  const designDir = join(typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd(), "design");
  const soulPath = join(designDir, SOUL_FILENAME);

  // ── init — write the scaffold ─────────────────────────────────────────────

  if (action === "init") {
    const unknown = findUnknownFlag(parsed.flags, ["dir", "force", "studio"]);
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

  const unknown = findUnknownFlag(parsed.flags, ["dir", "studio"]);
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
  return { exitCode, stdout: renderCheckText(soulPath, result) };
}
