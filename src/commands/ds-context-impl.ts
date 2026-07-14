/**
 * runContext — implementation for `ui ds context`.
 *
 * Emits the active design system as a compact, model-readable context block.
 * Read-only: never modifies any artifact on disk.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir, DSError } from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import { formatMarkdown, formatStructured, parseInclude } from "../core/ds-context.js";
import { SOUL_FILENAME } from "../core/ds-soul.js";
import { emitTailwind } from "../core/token-emit.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds context";

/** Long flags `ui ds context` accepts (globals --help/--json handled separately). */
const KNOWN_FLAGS = ["dir", "include", "strict", "max-bytes", "format", "with-theme"] as const;

/**
 * Wrap the compiled Tailwind `@theme` block in a labelled, fenced markdown
 * section so a single `ds context --with-theme` call carries both the context
 * block AND the token theme the generation prompt pastes into `<style>`.
 * Appended AFTER truncation, so the theme is never trimmed by `--max-bytes`.
 */
function themeSection(theme: string): string {
  return (
    "\n## Design tokens — Tailwind v4 @theme\n\n" +
    "Paste this block verbatim inside a `<style>` tag in the page `<head>`; " +
    "every token becomes a utility (e.g. `--color-primary` → `bg-primary`).\n\n" +
    "```css\n" +
    theme.trimEnd() +
    "\n```\n"
  );
}

export function runContext(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  // ── Reject unknown flags (loud misconfig beats a silent no-op) ───────────────

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) {
    const msg = unknownFlagMessage(unknown);
    return useJson ? errJson(CMD, "UNKNOWN_FLAG", msg) : errText(`ui: ${msg}\n`);
  }

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

  // The soul file is read HERE (command layer) and handed to the pure formatter
  // as text — the core never touches the filesystem. Absence is not an error:
  // the soul is optional everywhere except an explicit `ui ds soul check`.
  const soulPath = join(paths.dir, SOUL_FILENAME);
  let soul: string | undefined;
  if (include.includes("soul") && existsSync(soulPath)) {
    try {
      soul = readFileSync(soulPath, "utf8");
    } catch {
      soul = undefined; // unreadable soul degrades to "no soul", never an error
    }
  }

  const opts = { include, strict, maxBytes, ...(soul !== undefined && { soul }) };

  // The `@theme` block is compiled from the FULL resolved token map (same bytes
  // as `ui tokens compile … --target tailwind`), so `--with-theme` folds the
  // context+compile pair into one read-only call. It is intentionally excluded
  // from the `--max-bytes` budget that truncates the context block.
  const withTheme = parsed.flags["with-theme"] === true;
  const theme = withTheme ? emitTailwind(ds.resolved) : undefined;

  // ── Format and respond ──────────────────────────────────────────────────────

  if (format === "json") {
    const structured = formatStructured(ds, opts);
    const payload = theme !== undefined ? { ...structured, theme } : structured;
    return useJson
      ? okJson(CMD, payload)
      : ok(JSON.stringify(payload, null, 2) + "\n");
  }

  const md = formatMarkdown(ds, opts);
  const out = theme !== undefined ? md + themeSection(theme) : md;
  return useJson ? okJson(CMD, out) : ok(out);
}
