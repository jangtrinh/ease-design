/**
 * `ui taste-lint` command — deterministic taste-rubric floor for generated HTML.
 *
 * Runs the mechanically-verifiable subset of the 6+1 taste rubric against an
 * HTML file and reports violations. Read-only: never writes to disk. This is the
 * binary floor under the model's self-scored critique gate — a variant that
 * trips an error here breaks a rubric rule the model cannot talk past.
 *
 * Exit code policy (mirrors validate-layout's D4): exit 1 iff any error-severity
 * finding. Most taste findings are errors (definite rubric violations); a few
 * craft lints are warnings (smells that surface but never fail the build).
 * No subcommands — hasSubcommands: false.
 */
import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { lintTaste } from "../core/taste-lint.js";
import { isTokenLeaf } from "../core/token-model.js";
import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";

const CMD = "taste-lint";

export const TASTE_LINT_HELP = `ui taste-lint — deterministic taste-rubric floor for generated HTML

Usage:
  ui taste-lint <file.html> [--tokens <design.tokens.json>] [--json]

Options:
  --tokens <f>  DS token file; enables the Consistency raw-hex check
  --json        Emit a JSON envelope instead of human-readable output
  -h, --help    Show this help

Checks (the machine-verifiable subset of knowledge/taste-rubric.md; error unless noted):
  tap-target-undersized      Spacing        interactive control below the 44px touch target (warning)
  ai-cliche-gradient         Depth/Surface  large indigo/violet/magenta "AI glow" background gradient
  tiny-body-text             Typography     font-size <= 13px (rubric: body never below 16px)
  italic-display-heading     Typography     italic heading/display type (a generated-UI tell)
  uppercase-tight-line-height Typography    all-caps text with line-height below 1.0
  off-grid-spacing           Spacing        Tailwind spacing not on the 4px base grid
  mixed-icon-families        Iconography    two or more icon libraries in one UI
  pure-black-shadow          Depth/Surface  hard/opaque black shadow (should be tinted)
  z-index-inflation          Depth/Surface  all-nines z-index (9999) — an un-designed stacking scale
  linear-easing              Motion         transition uses linear easing
  transition-all             Motion         transition: all (animates layout properties)
  animation-no-reduced-motion Motion        animation/@keyframes/anim library with no prefers-reduced-motion fallback
  keyframes-layout-props     Motion         @keyframes animating a layout property (width/height/top/…)
  overshoot-easing           Motion         transition uses overshoot/bounce cubic-bezier (y outside [0,1])
  focus-ring-animates-in     Motion         focus ring transitions in (it must appear instantly)
  raw-hex-when-token-exists  Consistency    arbitrary hex not in the DS palette (needs --tokens)

Subjective axis judgment (is the composition authored? the scale on one ratio?)
stays with the model's critique. This command only catches unambiguous breaches.

Exit codes:
  0  No error-severity violations (warnings may still be reported)
  1  One or more error-severity violations, or user/file error

Error codes:
  BAD_ARG        Missing <file.html> argument or unexpected extra positionals
  FILE_NOT_FOUND File does not exist (ENOENT)
  READ_ERROR     File exists but cannot be read
`;

// ─── Token-hex harvest (tolerant) ──────────────────────────────────────────────

/**
 * Recursively collect every color hex ($value of a color leaf) from a parsed
 * token file into a lower-cased, alpha-stripped, 6-digit-normalised set.
 * Tolerant by design: a lint must not fail because the token file has an
 * unrelated issue, so this never throws — malformed leaves are skipped.
 */
function collectTokenHexes(node: unknown, out: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (isTokenLeaf(node)) {
    const val = (node as { $value: unknown }).$value;
    if (typeof val === "string") {
      const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(val.trim());
      if (m) {
        let h = (m[1] ?? "").toLowerCase();
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        out.add(`#${h}`);
      }
    }
    return; // a leaf has no further token children to walk
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    collectTokenHexes(v, out);
  }
}

/** Load token hexes from a file path; returns undefined on any read/parse failure. */
function loadTokenHexes(path: string): Set<string> | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const out = new Set<string>();
  collectTokenHexes(parsed, out);
  return out.size > 0 ? out : undefined;
}

// ─── Text report formatter ──────────────────────────────────────────────────────

function formatReport(
  filePath: string,
  errorCount: number,
  warningCount: number,
  axesAffected: string[],
  findings: Array<{ checkId: string; axis: string; severity: string; message: string; line?: number }>,
): string {
  const lines: string[] = [];
  lines.push(`taste-lint: ${filePath}`);

  if (findings.length === 0) {
    lines.push("  No taste violations found.");
  } else {
    for (const f of findings) {
      const loc = f.line !== undefined ? `:${f.line}` : "";
      lines.push(`  [${f.axis}] ${f.checkId} (${f.severity})${loc}: ${f.message}`);
    }
  }

  lines.push("");
  const axes = axesAffected.length > 0 ? ` (axes: ${axesAffected.join(", ")})` : "";
  const total = errorCount + warningCount;
  const split = total > 0 ? ` (${errorCount} error, ${warningCount} warning)` : "";
  lines.push(`${total} violation(s)${split}${axes}`);
  return lines.join("\n") + "\n";
}

// ─── Command handler ──────────────────────────────────────────────────────────

export const tasteLintCommand = {
  name: CMD,
  summary: "Deterministic taste-rubric floor for generated HTML (6 machine-checkable axes)",
  hasSubcommands: false,
  help: TASTE_LINT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    // 1. Resolve file path from positionals[0].
    const filePath = parsed.positionals[0];
    if (filePath === undefined) {
      const msg = "ui taste-lint requires a <file.html> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (parsed.positionals.length > 1) {
      const msg = `ui taste-lint takes exactly one file argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // 2. Read input HTML file.
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (e) {
      const isNotFound =
        e instanceof Error && "code" in e &&
        (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound
        ? `file not found: '${filePath}'`
        : `cannot read file '${filePath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }

    // 3. Optionally load DS token hexes for the Consistency check.
    const tokensFlag = parsed.flags["tokens"];
    const knownHexes =
      typeof tokensFlag === "string" ? loadTokenHexes(tokensFlag) : undefined;

    // 4. Run the linter (pure transform).
    const { findings, errorCount, warningCount, axesAffected } = lintTaste(raw, { knownHexes });

    // 5. Exit 1 iff any error-severity violation; warnings never fail the build.
    const exitCode = errorCount > 0 ? 1 : 0;

    // 6. Shape output.
    const out = useJson
      ? okJsonWithExit(CMD, { file: filePath, errorCount, warningCount, axesAffected, findings }, exitCode)
      : { exitCode, stdout: formatReport(filePath, errorCount, warningCount, axesAffected, findings) };
    return withOutcome(out, parsed, {
      type: "lint_run",
      actor: "ui taste-lint",
      projectDir: filePath,
      data: { ...lintOutcomeData("taste-lint", filePath, { errorCount, warningCount, findings }), axes: axesAffected },
    });
  },
};
