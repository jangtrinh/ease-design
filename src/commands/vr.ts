/**
 * `ui vr` — deterministic visual-regression tooling (DESIGN-OS T5). Compares
 * screenshots the host already rendered (figma-agent / preview); the binary
 * never renders. Zero-dependency PNG codec + pixelmatch diff; pure math, no
 * network. Subcommands: diff (two files), gate (two dirs), accept (promote).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { decodePng, encodePng } from "../core/png-codec.js";
import { diffImages } from "../core/snapshot-diff.js";
import type { DiffOptions } from "../core/snapshot-diff.js";
import { parseMasks, parseUnit, isRegression, formatGateLine } from "../core/vr-support.js";
import type { GateEntry } from "../core/vr-support.js";

const CMD = "vr";

export const VR_HELP = `ui vr — deterministic visual-regression tooling

Usage:
  ui vr diff   <base.png> <head.png> [--threshold N] [--max-ratio N] [--include-aa] [--mask "x,y,w,h;…"] [--out diff.png] [--json]
  ui vr gate   <baseline-dir> <current-dir> [--threshold N] [--max-ratio N] [--include-aa] [--out-dir dir] [--json]
  ui vr accept <current-dir> <baseline-dir> [--json]

Subcommands:
  diff    Compare two PNGs; exit 1 if the changed-pixel ratio exceeds --max-ratio
  gate    Diff every baseline PNG against the same-named current render; exit 1 on any regression
  accept  Promote current renders to baselines (copies *.png current → baseline)

The binary never renders. Produce the PNGs with your host (figma-agent / preview),
then diff them here. Diff is a zero-dependency pixelmatch port (YIQ perceptual delta
+ anti-aliasing detection); --mask ignores known-dynamic regions (timestamps, avatars).

Options:
  --threshold N   Per-pixel matching tolerance, 0–1 (default 0.1; larger = more permissive)
  --max-ratio N   Max changed-pixel ratio, 0–1, that still passes (default 0 — any real diff fails)
  --include-aa    Count anti-aliased pixels as real differences (default: treat them as flake)
  --mask SPEC     Rectangles to ignore: "x,y,w,h" separated by ';' (diff only)
  --out FILE      Write the diff PNG to FILE (diff only)
  --out-dir DIR   Write per-file diff PNGs into DIR (gate only)
  --json          Emit a JSON envelope
  -h, --help      Show this help

Exit codes:
  0  No regression (matches within tolerance; new baselines are not a failure)
  1  A regression (changed ratio over --max-ratio, or a size/missing mismatch), or a user/file error

Error codes:
  BAD_ARG        Missing subcommand or positional
  UNKNOWN_FLAG   Unrecognised --flag
  FILE_NOT_FOUND An input file/dir does not exist
  READ_ERROR     An input cannot be read
  BAD_PNG        An input is not a decodable 8-bit PNG
  BAD_MASK       A --mask rectangle is malformed
`;

function readOpts(parsed: ParsedArgs): { opts: DiffOptions; maxRatio: number } {
  const opts: DiffOptions = {};
  if (typeof parsed.flags["threshold"] === "string") opts.threshold = parseUnit(parsed.flags["threshold"], "threshold");
  if (parsed.flags["include-aa"] === true) opts.includeAA = true;
  if (typeof parsed.flags["mask"] === "string") opts.masks = parseMasks(parsed.flags["mask"]);
  const maxRatio = typeof parsed.flags["max-ratio"] === "string" ? parseUnit(parsed.flags["max-ratio"], "max-ratio") : 0;
  return { opts, maxRatio };
}

function fail(useJson: boolean, sub: string, code: string, msg: string): CommandResult {
  return useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
}

/** Read + decode a PNG, mapping IO/decode failure to a typed CommandResult (thrown as a tagged error). */
function loadPng(file: string): ReturnType<typeof decodePng> {
  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new TaggedError(notFound ? "FILE_NOT_FOUND" : "READ_ERROR", notFound ? `file not found: '${file}'` : `cannot read '${file}': ${msgOf(e)}`);
  }
  try {
    return decodePng(buf);
  } catch (e) {
    throw new TaggedError("BAD_PNG", `cannot decode '${file}': ${msgOf(e)}`);
  }
}

class TaggedError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function runDiff(parsed: ParsedArgs): CommandResult {
  const sub = "vr diff";
  const useJson = parsed.json;
  const base = parsed.positionals[0], head = parsed.positionals[1];
  if (base === undefined || head === undefined) return fail(useJson, sub, "BAD_ARG", "ui vr diff requires <base.png> <head.png>");
  let opts: DiffOptions, maxRatio: number;
  try { ({ opts, maxRatio } = readOpts(parsed)); }
  catch (e) { return fail(useJson, sub, e instanceof Error && /mask/.test(e.message) ? "BAD_MASK" : "BAD_ARG", msgOf(e)); }

  let result;
  try {
    result = diffImages(loadPng(base), loadPng(head), opts);
  } catch (e) {
    if (e instanceof TaggedError) return fail(useJson, sub, e.code, e.message);
    throw e;
  }

  const out = typeof parsed.flags["out"] === "string" ? parsed.flags["out"] : undefined;
  if (out !== undefined) writeFileSync(out, encodePng(result.diff));
  const regression = result.diffRatio > maxRatio;
  const exitCode = regression ? 1 : 0;
  const summary = { base, head, ...stripDiff(result), maxRatio, regression, out };
  if (useJson) return okJsonWithExit(sub, summary, exitCode);

  const pct = (result.diffRatio * 100).toFixed(2);
  const lines = result.dimensionMismatch
    ? [`vr diff: SIZE MISMATCH — base ${result.dimensionMismatch.base.join("×")} vs head ${result.dimensionMismatch.head.join("×")}`]
    : [`vr diff: ${result.diffPixels} / ${result.totalPixels} px differ (${pct}%) — ${regression ? "REGRESSION" : "within tolerance"}`];
  if (out !== undefined) lines.push(`  diff image → ${out}`);
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

/** Drop the heavy pixel buffer from a diff result before it goes into a JSON envelope. */
function stripDiff(r: ReturnType<typeof diffImages>): Record<string, unknown> {
  const { diff: _diff, ...rest } = r;
  void _diff;
  return rest;
}

const pngsIn = (dir: string): string[] => readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort();

function runGate(parsed: ParsedArgs): CommandResult {
  const sub = "vr gate";
  const useJson = parsed.json;
  const baseDir = parsed.positionals[0], curDir = parsed.positionals[1];
  if (baseDir === undefined || curDir === undefined) return fail(useJson, sub, "BAD_ARG", "ui vr gate requires <baseline-dir> <current-dir>");
  let opts: DiffOptions, maxRatio: number;
  try { ({ opts, maxRatio } = readOpts(parsed)); }
  catch (e) { return fail(useJson, sub, "BAD_ARG", msgOf(e)); }

  let baseFiles: string[], curSet: Set<string>;
  try { baseFiles = pngsIn(baseDir); curSet = new Set(pngsIn(curDir)); }
  catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    return fail(useJson, sub, notFound ? "FILE_NOT_FOUND" : "READ_ERROR", msgOf(e));
  }
  const outDir = typeof parsed.flags["out-dir"] === "string" ? parsed.flags["out-dir"] : undefined;
  if (outDir !== undefined) mkdirSync(outDir, { recursive: true });

  const entries: GateEntry[] = [];
  for (const name of baseFiles) {
    if (!curSet.has(name)) { entries.push({ name, status: "missing-current" }); continue; }
    try {
      const r = diffImages(loadPng(join(baseDir, name)), loadPng(join(curDir, name)), opts);
      if (outDir !== undefined && (r.diffRatio > 0 || r.dimensionMismatch)) writeFileSync(join(outDir, name), encodePng(r.diff));
      if (r.dimensionMismatch) entries.push({ name, status: "size", detail: `base ${r.dimensionMismatch.base.join("×")} vs head ${r.dimensionMismatch.head.join("×")}` });
      else if (r.diffRatio > maxRatio) entries.push({ name, status: "changed", diffPixels: r.diffPixels, diffRatio: r.diffRatio });
      else entries.push({ name, status: "ok", diffPixels: r.diffPixels, diffRatio: r.diffRatio });
    } catch (e) {
      return e instanceof TaggedError ? fail(useJson, sub, e.code, e.message) : (() => { throw e; })();
    }
  }
  for (const name of curSet) if (!baseFiles.includes(name)) entries.push({ name, status: "new" });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const regressions = entries.filter(isRegression).length;
  const exitCode = regressions > 0 ? 1 : 0;
  if (useJson) return okJsonWithExit(sub, { baseDir, curDir, maxRatio, regressions, entries }, exitCode);
  const okCount = entries.filter((e) => e.status === "ok").length;
  const lines = [
    `vr gate: ${entries.length} baseline(s) — ${okCount} match, ${regressions} regression(s)`,
    ...entries.map(formatGateLine),
  ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

function runAccept(parsed: ParsedArgs): CommandResult {
  const sub = "vr accept";
  const useJson = parsed.json;
  const curDir = parsed.positionals[0], baseDir = parsed.positionals[1];
  if (curDir === undefined || baseDir === undefined) return fail(useJson, sub, "BAD_ARG", "ui vr accept requires <current-dir> <baseline-dir>");
  let files: string[];
  try { files = pngsIn(curDir); }
  catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    return fail(useJson, sub, notFound ? "FILE_NOT_FOUND" : "READ_ERROR", msgOf(e));
  }
  mkdirSync(baseDir, { recursive: true });
  for (const name of files) writeFileSync(join(baseDir, basename(name)), readFileSync(join(curDir, name)));
  if (useJson) return okJsonWithExit(sub, { baseDir, curDir, accepted: files.length, files }, 0);
  return { exitCode: 0, stdout: `vr accept: promoted ${files.length} render(s) → ${baseDir}\n` };
}

export const vrCommand = {
  name: CMD,
  summary: "Deterministic visual-regression diff/gate for rendered screenshots",
  hasSubcommands: true,
  help: VR_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "diff": return runDiff(parsed);
      case "gate": return runGate(parsed);
      case "accept": return runAccept(parsed);
      case undefined: return fail(parsed.json, CMD, "BAD_ARG", "ui vr requires a subcommand (diff/gate/accept). Run 'ui vr --help'.");
      default: return fail(parsed.json, CMD, "BAD_ARG", `unknown subcommand '${parsed.subcommand}'. Run 'ui vr --help'.`);
    }
  },
};
