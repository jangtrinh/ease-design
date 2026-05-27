/**
 * `ui designmd snapshot` — implementation.
 *
 * Reads raw HTML + zero or more linked CSS files and produces a
 * self-contained preview HTML (CSS inlined, scripts stripped,
 * reveal-state styles cleaned, root-relative URLs absolutised).
 *
 * Output goes to stdout by default; --out <path> writes to a file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { errJson, errText, okJson } from "../core/output.js";
import { transformSnapshot } from "../core/designmd-html-snapshot.js";
import type { CssChunk } from "../core/designmd-html-snapshot.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "designmd snapshot";

export function runSnapshot(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  const htmlPath = parsed.positionals[0];
  if (typeof htmlPath !== "string" || htmlPath.length === 0) {
    const msg = "ui designmd snapshot requires <html-path> as first positional argument";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const originRaw = parsed.flags["origin"];
  if (typeof originRaw !== "string" || originRaw.length === 0) {
    const msg = "--origin <url> is required (e.g. --origin https://www.example.com)";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  let origin: string;
  try {
    origin = new URL(originRaw).origin;
  } catch {
    const msg = `--origin must be a valid URL: '${originRaw}'`;
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  // --css can be given multiple times. parseArgs collapses repeats to the
  // last value, so we honour both --css single and a comma-separated form.
  const cssArg = parsed.flags["css"];
  const cssPaths: string[] = [];
  if (typeof cssArg === "string" && cssArg.length > 0) {
    for (const part of cssArg.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) cssPaths.push(trimmed);
    }
  }

  let html: string;
  try {
    html = readFileSync(resolve(htmlPath), "utf8");
  } catch (e) {
    const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
    const msg = isNotFound ? `file not found: '${htmlPath}'` : `cannot read '${htmlPath}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  const cssChunks: CssChunk[] = [];
  for (const p of cssPaths) {
    try {
      const body = readFileSync(resolve(p), "utf8");
      cssChunks.push({ name: basename(p), body });
    } catch (e) {
      const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound ? `CSS file not found: '${p}'` : `cannot read '${p}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }
  }

  const { html: out, removed } = transformSnapshot(html, cssChunks, origin);

  const outPath = parsed.flags["out"];
  if (typeof outPath === "string" && outPath.length > 0) {
    try {
      writeFileSync(resolve(outPath), out, "utf8");
    } catch (e) {
      const msg = `cannot write '${outPath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }
    if (useJson) {
      return okJson(CMD, { wrote: resolve(outPath), bytes: out.length, removed });
    }
    return { exitCode: 0, stdout: `wrote ${out.length} bytes to ${outPath}\n` };
  }

  if (useJson) {
    return okJson(CMD, { html: out, removed });
  }
  return { exitCode: 0, stdout: out };
}
