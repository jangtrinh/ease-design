/**
 * `ui ingest-css-ds <extract-tokens.json>` — the code road's C0 step (D4, spec 009 P3).
 *
 * Takes the JSON `ui designmd extract-tokens --css ... --out t.json` already writes
 * (`customProperties[]`, per-line + per-selector provenance) and compiles it,
 * deterministically and zero-network/zero-LLM, into a portable, UNSEALED tokens.json —
 * mirroring `ui ingest-figma-ds`'s onboarding shape (onboard.md §4 E4). `ui ds import`
 * seals it afterwards; this command never touches `design/`.
 *
 * All the transform lives in src/core/css-token-ingest.ts (pure); this file is the
 * I/O boundary, matching ingest-figma-ds.ts's own split.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { ingestCssTokens, CssTokenIngestError } from "../core/css-token-ingest.js";
import type { CustomPropertyObservation } from "../core/designmd-token-extractor.js";

const CMD = "ingest-css-ds";
const KNOWN_FLAGS = ["out", "name"] as const;

export const INGEST_CSS_DS_HELP = `ui ingest-css-ds — compile CSS custom properties into a vocabulary (spec 009 P3)

Usage:
  ui ingest-css-ds <extract-tokens.json> [--out <dir>] [--name <slug>] [--json]

Takes the JSON 'ui designmd extract-tokens --css ...' already writes and compiles
its customProperties[] — deterministically, zero-network, zero-LLM — into a
portable, UNSEALED tokens.json (literal → primitive, var(--x) alias → semantic;
each theme selector becomes a mode under $extensions["mode.<name>"]).

Writes (into <out>, default: current directory):
  tokens.json   DTCG tokens — primitive literals + semantic aliases; base + modes

'ui ds import <out>/tokens.json --dir <project> --name <slug>' seals the result
into a design/ store afterwards — this command never writes a manifest.

Options:
  --out <dir>      Output directory (default: current working directory)
  --name <slug>    Recorded in the JSON summary only (no manifest is written here)
  --json           Emit a JSON envelope instead of human-readable text
  -h, --help       Show this help

Error codes:
  UNKNOWN_FLAG     Unrecognised --flag
  BAD_ARG          Missing <extract-tokens.json> positional
  FILE_NOT_FOUND   extract-tokens.json does not exist (ENOENT)
  READ_ERROR       extract-tokens.json exists but cannot be read
  BAD_JSON         extract-tokens.json is not valid JSON, or missing customProperties[]
  LEAF_COLLISION   Two source custom properties strip to the same token path (D6) — fails
                   loudly with both source lines rather than merging or suffixing
  WRITE_ERROR      An output file could not be written
`;

function flagStr(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
}

function runIngest(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => (useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const srcPath = parsed.positionals[0];
  if (typeof srcPath !== "string" || srcPath.length === 0) {
    return err("BAD_ARG", "ui ingest-css-ds requires a <extract-tokens.json> path");
  }

  let raw: string;
  try {
    raw = readFileSync(srcPath, "utf8");
  } catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    return notFound
      ? err("FILE_NOT_FOUND", `file not found: '${srcPath}'`)
      : err("READ_ERROR", `cannot read '${srcPath}': ${e instanceof Error ? e.message : String(e)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    return err("BAD_JSON", `invalid JSON in '${srcPath}'`);
  }
  const customProperties = (json as { customProperties?: unknown }).customProperties;
  if (!Array.isArray(customProperties)) {
    return err("BAD_JSON", `'${srcPath}' has no customProperties[] array — is this a 'ui designmd extract-tokens' output?`);
  }

  let result;
  try {
    result = ingestCssTokens(customProperties as CustomPropertyObservation[]);
  } catch (e) {
    if (e instanceof CssTokenIngestError) return err(e.code, e.message);
    throw e;
  }

  const outDir = resolve(flagStr(parsed, "out") ?? process.cwd());
  const name = flagStr(parsed, "name") ?? basename(outDir);
  const tokensPath = join(outDir, "tokens.json");
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(tokensPath, JSON.stringify(result.tree, null, 2) + "\n", "utf8");
  } catch (e) {
    return err("WRITE_ERROR", `cannot write output: ${e instanceof Error ? e.message : String(e)}`);
  }

  const data = {
    out: outDir,
    tokens: tokensPath,
    name,
    stats: result.stats,
    unverified: result.unverified,
  };
  if (useJson) return okJson(CMD, data);
  const lines = [
    `Ingested CSS vocabulary → ${tokensPath}`,
    `  ${result.stats.primitives} primitive(s) · ${result.stats.semantics} semantic(s)${result.stats.skipped > 0 ? ` · ${result.stats.skipped} skipped` : ""}`,
    ...(result.unverified.length > 0 ? [`  unverified: ${result.unverified.slice(0, 5).map((u) => u.name).join(", ")}${result.unverified.length > 5 ? " …" : ""}`] : []),
    `  next: ui ds import ${tokensPath} --dir <project> --name ${name}`,
  ];
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}

export const ingestCssDsCommand = {
  name: CMD,
  summary: "Compile CSS custom properties (extract-tokens JSON) into a portable, unsealed tokens.json",
  hasSubcommands: false,
  help: INGEST_CSS_DS_HELP,
  run: runIngest,
};
