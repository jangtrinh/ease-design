/**
 * `ui ds a11y [--dir <project>] [--pairs "t:s,..."] [--json]` — token-pair contrast
 * audit of the design system. Read-only, pure color math. Exit 1 on any AA failure.
 * Never claims "accessible": it verifies declared token pairs only (see ds-a11y.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { parseTokenFile } from "../core/token-model.js";
import { resolveTokens } from "../core/token-resolve.js";
import { checkTokenContrast, renderA11yReport, parsePairs } from "../core/ds-a11y.js";

const CMD = "ds a11y";

export function runA11y(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const dirFlag = parsed.flags["dir"];
  const designDir = join(typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd(), "design");
  const tokensPath = join(designDir, "design.tokens.json");
  if (!existsSync(tokensPath)) {
    return err("DS_NOT_FOUND", `no design.tokens.json under '${designDir}' — run 'ui ds init' first`);
  }

  let explicit: [string, string][] | undefined;
  const pairsFlag = parsed.flags["pairs"];
  if (typeof pairsFlag === "string") {
    try {
      explicit = parsePairs(pairsFlag);
    } catch (e) {
      return err("BAD_ARG", e instanceof Error ? e.message : String(e));
    }
  }

  let tokens;
  try {
    tokens = resolveTokens(parseTokenFile(JSON.parse(readFileSync(tokensPath, "utf8"))));
  } catch (e) {
    return err("BAD_JSON", `bad token file '${tokensPath}': ${e instanceof Error ? e.message : String(e)}`);
  }

  const result = checkTokenContrast(tokens, explicit);
  const exitCode = result.failures.length > 0 ? 1 : 0;
  if (useJson) return okJsonWithExit(CMD, result, exitCode);
  return exitCode === 0 ? ok(renderA11yReport(result)) : { exitCode, stdout: renderA11yReport(result) };
}
