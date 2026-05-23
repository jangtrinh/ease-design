/**
 * runContext — implementation for `ui ds context`.
 *
 * Emits the active design system as a compact, model-readable context block.
 * Read-only: never modifies any artifact on disk.
 */
import { resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir, DSError } from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import { formatMarkdown, formatStructured, parseInclude } from "../core/ds-context.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds context";

export function runContext(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  // ── Resolve DS paths ────────────────────────────────────────────────────────

  const dirFlag = parsed.flags["dir"];
  let paths;
  try {
    paths =
      typeof dirFlag === "string"
        ? pathsForDir(resolve(dirFlag, "design"))
        : discoverDesignSystem(undefined);
  } catch (e) {
    const code = e instanceof DSError ? e.code : "DS_NOT_FOUND";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  // ── Load and verify ─────────────────────────────────────────────────────────

  let ds;
  try {
    ds = loadDesignSystem(paths);
  } catch (e) {
    const code =
      e instanceof DSError
        ? e.code
        : e instanceof DSManifestError
        ? e.code
        : "BAD_DS";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  // ── Parse options ───────────────────────────────────────────────────────────

  let include;
  try {
    include = parseInclude(parsed.flags["include"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const strict = parsed.flags["strict"] === true;

  const maxBytesRaw = parsed.flags["max-bytes"];
  let maxBytes = 4096;
  if (maxBytesRaw !== undefined) {
    const parsed2 = parseInt(String(maxBytesRaw), 10);
    if (isNaN(parsed2) || parsed2 <= 0) {
      const msg = `--max-bytes must be a positive integer, got '${String(maxBytesRaw)}'`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    maxBytes = parsed2;
  }

  const format = parsed.flags["format"] ?? "markdown";
  if (format !== "markdown" && format !== "json") {
    const msg = `--format must be 'markdown' or 'json', got '${String(format)}'`;
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const opts = { include, strict, maxBytes };

  // ── Format and respond ──────────────────────────────────────────────────────

  if (format === "json") {
    const structured = formatStructured(ds, opts);
    return useJson
      ? okJson(CMD, structured)
      : ok(JSON.stringify(structured, null, 2) + "\n");
  }

  const md = formatMarkdown(ds, opts);
  return useJson ? okJson(CMD, md) : ok(md);
}
