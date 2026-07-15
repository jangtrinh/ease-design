/**
 * Linter for the 3 journey templates (`templates/journeys/*.md`) — the emitter half
 * lives in templates/journeys/ itself; this is its paired linter (repo rule: every
 * standard ships an emitter AND a linter in the same commit).
 *
 * Walks every journey template, extracts each backtick-quoted `ui <cmd> [<sub>]` /
 * `design-os <cmd> [<sub>]` invocation (inline code spans AND fenced code blocks),
 * and asserts the (sub)command is real:
 *   - `ui <cmd>` / `ui <cmd> <sub>`  → looked up in COMMAND_SIGNATURES
 *     (src/core/command-signatures.ts — the TS kernel's own schema, single source
 *     of truth, so this half can never drift).
 *   - `design-os <cmd>` [`<sub>`]    → design-os is a SEPARATE Python conductor
 *     binary (design-os/); command-signatures.ts has no knowledge of it, so its
 *     top-level command set (and figma's own subcommands) are hand-maintained
 *     allowlists below instead — see the comment on DESIGN_OS_TOP_LEVEL.
 *
 * Flags (`--x`) and positionals (`<x>`, `x.json`, `a|b|c`) are never validated —
 * only the identifier immediately after `ui`/`design-os` (cmd) and, if present,
 * the one after that (sub) are checked; anything else naturally falls outside the
 * identifier character class below and ends the capture.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { COMMAND_SIGNATURES } from "../src/core/command-signatures.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JOURNEYS_DIR = join(REPO_ROOT, "templates", "journeys");

// design-os's top-level command set — verified 2026-07-15 against a live
// `design-os --help`. NOT derived from any schema (design-os is a Python/Typer
// conductor, outside the TS kernel's COMMAND_SIGNATURES) — update this list WITH
// INTENT whenever the conductor gains or drops a top-level command; this is the
// one place that drift would otherwise go unnoticed by any test.
const DESIGN_OS_TOP_LEVEL = new Set([
  "doctor",
  "audit",
  "reference",
  "vr-matrix",
  "figma",
  "update",
  "plugins",
  "heartbeat",
]);

// `design-os figma` is the one design-os command whose OWN subcommands this
// linter also checks — verified against a live `design-os figma --help`. No
// other design-os command's second token is validated (see file-header comment).
const DESIGN_OS_FIGMA_SUBS = new Set(["status", "scan", "audit"]);

type Binary = "ui" | "design-os";

interface ExtractedCommand {
  binary: Binary;
  cmd: string;
  sub: string | null;
  /** File + the exact backtick region it came from, for a readable failure message. */
  source: string;
}

// `ui`/`design-os`, then an identifier (cmd), then optionally one more identifier
// (sub) if a second one immediately follows. Identifiers are letters/digits/
// hyphens only — a flag ("--x"), a positional ("<x>", "x.json"), or an enum list
// ("a|b|c") all start with a character outside this class, so the match simply
// stops there without those ever needing to be excluded explicitly.
const INVOCATION_RE =
  /\b(ui|design-os)\s+([a-zA-Z][a-zA-Z0-9-]*)(?:\s+([a-zA-Z][a-zA-Z0-9-]*))?/g;

/** Every backtick-delimited region in a template: fenced ``` blocks first (so
 * inline-span scanning below doesn't also walk code sitting inside a fence),
 * then every remaining inline `code` span. */
function backtickRegions(markdown: string): string[] {
  const regions: string[] = [];
  const fenced = markdown.match(/```[\s\S]*?```/g) ?? [];
  for (const block of fenced) {
    regions.push(block.replace(/^```[a-z]*\n?/, "").replace(/```$/, ""));
  }
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, "");
  const inline = withoutFences.match(/`[^`\n]+`/g) ?? [];
  for (const span of inline) {
    regions.push(span.slice(1, -1));
  }
  return regions;
}

/** Extract every `ui`/`design-os` invocation from a template's backtick regions. */
export function extractCommands(markdown: string, fileLabel: string): ExtractedCommand[] {
  const found: ExtractedCommand[] = [];
  for (const region of backtickRegions(markdown)) {
    for (const m of region.matchAll(INVOCATION_RE)) {
      found.push({
        binary: m[1] as Binary,
        cmd: m[2] as string,
        sub: m[3] ?? null,
        source: `${fileLabel}: \`${region}\``,
      });
    }
  }
  return found;
}

/** Null when the extracted (sub)command is real; otherwise a human-readable problem. */
export function validationProblem(entry: ExtractedCommand): string | null {
  if (entry.binary === "ui") {
    const schema = COMMAND_SIGNATURES[entry.cmd];
    if (schema === undefined) return `${entry.source} — unknown 'ui ${entry.cmd}' command`;
    if (entry.sub !== null && schema.subcommands !== undefined && !(entry.sub in schema.subcommands)) {
      return `${entry.source} — unknown subcommand 'ui ${entry.cmd} ${entry.sub}'`;
    }
    return null;
  }
  // binary === "design-os"
  if (!DESIGN_OS_TOP_LEVEL.has(entry.cmd)) {
    return `${entry.source} — unknown 'design-os ${entry.cmd}' command`;
  }
  if (entry.cmd === "figma" && entry.sub !== null && !DESIGN_OS_FIGMA_SUBS.has(entry.sub)) {
    return `${entry.source} — unknown 'design-os figma ${entry.sub}' subcommand`;
  }
  return null;
}

describe("journey templates only reference real ui / design-os (sub)commands", () => {
  const files = readdirSync(JOURNEYS_DIR).filter((f) => f.endsWith(".md"));

  it("templates/journeys/ exists and has the 3 journey files", () => {
    expect(files.sort()).toEqual(["daily.md", "deliver.md", "onboard.md"]);
  });

  for (const file of files) {
    it(`${file}: every extracted ui/design-os invocation resolves to a real (sub)command`, () => {
      const markdown = readFileSync(join(JOURNEYS_DIR, file), "utf8");
      const commands = extractCommands(markdown, file);
      // A journey with zero extracted commands would mean the extractor silently
      // matched nothing — every journey template references concrete commands.
      expect(commands.length, `${file}: extractor found no ui/design-os invocations`).toBeGreaterThan(0);
      const problems = commands.map(validationProblem).filter((p): p is string => p !== null);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});

describe("negative fixture — extractor + assertion actually catch a fabricated command", () => {
  it("flags a fabricated `ui nonexist` invocation", () => {
    const fixture = "Run `ui nonexist --flag value` before continuing, then `ui doctor`.";
    const commands = extractCommands(fixture, "fixture");
    // Both the real (`ui doctor`) and fabricated (`ui nonexist`) invocations extract.
    expect(commands).toHaveLength(2);
    const problems = commands.map(validationProblem).filter((p): p is string => p !== null);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("unknown 'ui nonexist' command");
  });

  it("flags a fabricated `design-os nonexist` invocation and a fabricated figma subcommand", () => {
    const fixture = "Run `design-os nonexist --json`, then `design-os figma teleport`.";
    const commands = extractCommands(fixture, "fixture");
    expect(commands).toHaveLength(2);
    const problems = commands.map(validationProblem).filter((p): p is string => p !== null);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("unknown 'design-os nonexist' command");
    expect(problems[1]).toContain("unknown 'design-os figma teleport' subcommand");
  });

  it("does NOT flag a real command with an unrecognised sub-token that belongs to a flat command (no false positive)", () => {
    // `ui audit` is FLAT (no subcommands) — a following identifier-like token here
    // is a positional, not a subcommand, and must not be validated as one.
    const fixture = "Run `ui audit nodes` — nodes.json is a positional, not a subcommand.";
    const commands = extractCommands(fixture, "fixture");
    expect(commands).toHaveLength(1);
    expect(validationProblem(commands[0]!)).toBeNull();
  });
});
