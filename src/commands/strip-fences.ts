/**
 * `ui strip-fences` — remove ```html / ``` code-fence wrappers from LLM output.
 *
 * hasSubcommands: false
 * Positional [0]: file path or `-` (stdin)
 * --json: emit JsonEnvelope
 * No file mutation — read-only transform.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { readAllStdin } from "../core/stdin-reader.js";
import { stripFencesDetailed } from "../core/stream-parse.js";

const CMD = "strip-fences";

export const STRIP_FENCES_HELP = `ui strip-fences — remove code-fence wrappers from LLM HTML output

Usage:
  ui strip-fences <file|-> [--json]

Options:
  --json     Emit a JSON envelope instead of writing to stdout
  -h, --help Show this help

Notes:
  - Strips leading \`\`\`html or \`\`\` and trailing \`\`\` fences.
  - For FULL documents (input contains <!doctype or <html>): also absorbs
    stray prose before the document open and commentary after </html>.
    Fragments (no document boundary) pass through fence-stripped only —
    no fuzzy first-tag guessing.
  - --json reports strippedFences / strippedLeading / strippedTrailing
    booleans for observability.
  - No file is written; output always goes to stdout.
  - Use \`-\` to read from stdin: cat model-output.txt | ui strip-fences -

Error codes:
  BAD_ARG        Missing file argument
  FILE_NOT_FOUND File does not exist
  READ_ERROR     File exists but cannot be read
`;

export const stripFencesCommand = {
  name: CMD,
  summary: "Remove ```html / ``` fences from LLM HTML output",
  hasSubcommands: false,
  help: STRIP_FENCES_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    const filePath = parsed.positionals[0];
    if (filePath === undefined) {
      const msg = "ui strip-fences requires a <file|-> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    let raw: string;
    if (filePath === "-") {
      try {
        raw = readAllStdin();
      } catch (e) {
        const msg = `cannot read from stdin: ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
    } else {
      const abs = resolve(filePath);
      try {
        raw = readFileSync(abs, "utf8");
      } catch (e) {
        const isNotFound =
          e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
        const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
        const msg = isNotFound
          ? `file not found: '${filePath}'`
          : `cannot read '${filePath}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
      }
    }

    const result = stripFencesDetailed(raw);

    if (useJson) {
      return okJson(CMD, {
        file: filePath,
        strippedHtml: result.html,
        removedFences: result.strippedFences,
        strippedLeading: result.strippedLeading,
        strippedTrailing: result.strippedTrailing,
      });
    }
    return { exitCode: 0, stdout: result.html + "\n" };
  },
};
