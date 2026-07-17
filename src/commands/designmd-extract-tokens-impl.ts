/**
 * `ui designmd extract-tokens` — implementation.
 *
 * Reads raw HTML + zero or more linked CSS files and emits a JSON
 * frequency-ranked token list (colours, fonts, custom properties)
 * with line-level provenance.
 *
 * Output goes to stdout. --out <path> writes the JSON to a file
 * (mirrors --json envelope shape inside `data`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { errJson, errText, okJson } from "../core/output.js";
import { extractTokens } from "../core/designmd-token-extractor.js";
import type { SourceFile } from "../core/designmd-token-extractor.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "designmd extract-tokens";

export function runExtractTokens(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  const htmlPath = parsed.positionals[0];
  if (typeof htmlPath !== "string" || htmlPath.length === 0) {
    const msg = "ui designmd extract-tokens requires <html-path> as first positional argument";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  // F4 (spec 009 P3): --css is a scalar flag (cli-args.ts) — a repeated
  // `--css a --css b` silently drops `a`. Hard-error rather than emit a
  // partial vocabulary; the working multi-file form is a single comma-joined
  // flag (`--css a,b`), documented in --help.
  if (parsed.repeatedFlags.has("css")) {
    const msg =
      "'--css' was passed more than once — only the last value would be used, silently dropping the others. " +
      "Combine multiple files into one flag instead: --css a.css,b.css";
    return useJson ? errJson(CMD, "REPEATED_FLAG", msg) : errText(`ui: ${msg}\n`);
  }

  const cssArg = parsed.flags["css"];
  const cssPaths: string[] = [];
  if (typeof cssArg === "string" && cssArg.length > 0) {
    for (const part of cssArg.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) cssPaths.push(trimmed);
    }
  }

  const sources: SourceFile[] = [];

  try {
    const body = readFileSync(resolve(htmlPath), "utf8");
    sources.push({ name: basename(htmlPath), body });
  } catch (e) {
    const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
    const msg = isNotFound ? `file not found: '${htmlPath}'` : `cannot read '${htmlPath}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  for (const p of cssPaths) {
    try {
      const body = readFileSync(resolve(p), "utf8");
      sources.push({ name: basename(p), body });
    } catch (e) {
      const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound ? `CSS file not found: '${p}'` : `cannot read '${p}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }
  }

  const tokens = extractTokens(sources);

  const outPath = parsed.flags["out"];
  if (typeof outPath === "string" && outPath.length > 0) {
    try {
      writeFileSync(resolve(outPath), JSON.stringify(tokens, null, 2) + "\n", "utf8");
    } catch (e) {
      const msg = `cannot write '${outPath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }
    if (useJson) {
      return okJson(CMD, { wrote: resolve(outPath), tokens });
    }
    return {
      exitCode: 0,
      stdout: `wrote tokens.json to ${outPath} (colors: ${tokens.colors.length}, fonts: ${tokens.fonts.length}, customProperties: ${tokens.customProperties.length})\n`,
    };
  }

  if (useJson) {
    return okJson(CMD, tokens);
  }
  return { exitCode: 0, stdout: JSON.stringify(tokens, null, 2) + "\n" };
}
