/**
 * `ui ds-usage-lint <file.html> --dir <project> [--json]` — the ENFORCEMENT
 * gate: does a generated page actually use the project's design-system
 * tokens? Checks `ds context`'s ENFORCEMENT clause ("style exclusively with
 * the semantic tokens below — never hardcode colour when a token covers it")
 * that none of the four existing floors (taste-lint, validate-layout,
 * content-lint, a11y-lint) verify. Read-only, pure string/regex — see
 * ds-usage-lint.ts for the algorithm and its honesty floor.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { parseTokenFile } from "../core/token-model.js";
import { resolveTokens } from "../core/token-resolve.js";
import { declaredCssVarNames } from "../core/token-emit.js";
import { lintDsUsage } from "../core/ds-usage-lint.js";
import type { DsUsageLintResult } from "../core/ds-usage-lint.js";

const CMD = "ds-usage-lint";

export const DS_USAGE_LINT_HELP = `ui ds-usage-lint — ENFORCEMENT gate: does the page use the DS's own tokens?

Usage:
  ui ds-usage-lint <file.html> --dir <project> [--json]

Checks (v1 is COLOUR-ONLY — hardcoded spacing/radius is a deliberate deferral;
literals like 1px borders / 50% radii are legitimate and lower-signal):
  undeclared-token   (error)    var(--x) declared nowhere — not a DS token, not
                                on the page's own :root/@theme/[data-theme]/.dark.
                                A broken/ghost reference.
  off-system-token   (warning)  var(--x) the page declares itself but the DS
                                does not — visible, never build-breaking.
  hardcoded-color    (error)    hex/rgb()/hsl() literal in a colour-bearing
                                property (color, background(-color),
                                border(-color), outline-color, fill, stroke,
                                box-shadow, text-shadow) outside a token block.

Token-declaration blocks (:root / @theme / [data-theme="..."] / .dark) are
stripped before checking — they legitimately hold the literal colour/dimension
values that ARE the token definitions.

This proves token usage in the page's OWN CSS only — never rendered/computed
colour, gradients, or inline-SVG fills it did not parse. Not a conformance claim.

Options:
  --dir <path>  Project directory holding design/ (default: cwd)
  --json        Emit a JSON envelope
  -h, --help    Show this help

Exit codes:
  0  No error-severity findings (off-system-token warnings never fail the build)
  1  One or more error-severity findings, or a user/file error

Error codes:
  BAD_ARG        Missing <file.html> argument
  FILE_NOT_FOUND Input HTML file does not exist
  READ_ERROR     Input HTML file exists but cannot be read
  DS_NOT_FOUND   No design.tokens.json under '<dir>/design' — run 'ui ds init' first
  BAD_JSON       Token file is not valid JSON / fails DTCG validation
`;

function formatReport(file: string, r: DsUsageLintResult): string {
  const lines = [
    `ds-usage-lint: ${file} — ${r.hardcodedColorCount} hardcoded colour(s), ` +
      `${r.offSystemTokenCount} off-system token(s), ${r.undeclaredTokenCount} undeclared reference(s)`,
  ];
  for (const f of r.findings) {
    const mark = f.severity === "error" ? "✗" : "!";
    lines.push(`  ${mark} [${f.checkId}] line ${f.line}: ${f.message}`);
  }
  lines.push("  NOTE: proves token usage in the page's own CSS only — not rendered colour; not a conformance claim.");
  return lines.join("\n") + "\n";
}

export const dsUsageLintCommand = {
  name: CMD,
  summary: "ENFORCEMENT gate — does the page use the design system's own tokens? (not a conformance claim)",
  hasSubcommands: false,
  help: DS_USAGE_LINT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const err = (code: string, msg: string): CommandResult =>
      useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

    const file = parsed.positionals[0];
    if (file === undefined) return err("BAD_ARG", "ui ds-usage-lint requires a <file.html> argument");

    let html: string;
    try {
      html = readFileSync(file, "utf8");
    } catch (e) {
      const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      return err(
        isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR",
        isNotFound ? `file not found: '${file}'` : `cannot read '${file}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const dirFlag = parsed.flags["dir"];
    const designDir = join(typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd(), "design");
    const tokensPath = join(designDir, "design.tokens.json");
    if (!existsSync(tokensPath)) {
      return err("DS_NOT_FOUND", `no design.tokens.json under '${designDir}' — run 'ui ds init' first`);
    }

    let declaredVars: Set<string>;
    try {
      declaredVars = declaredCssVarNames(resolveTokens(parseTokenFile(JSON.parse(readFileSync(tokensPath, "utf8")))));
    } catch (e) {
      return err("BAD_JSON", `bad token file '${tokensPath}': ${e instanceof Error ? e.message : String(e)}`);
    }

    const result = lintDsUsage(html, { declaredVars });
    const exitCode = result.errorCount > 0 ? 1 : 0;
    return useJson
      ? okJsonWithExit(CMD, { file, ...result }, exitCode)
      : { exitCode, stdout: formatReport(file, result) };
  },
};
