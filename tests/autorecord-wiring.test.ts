/**
 * Linter for the auto-record convention (spec 006 P2) — the emitter half lives in
 * src/core/memory-autorecord.ts (recordOutcome/withOutcome) and the nine call sites
 * wired in spec 006 P1; this is its paired linter (repo rule: every standard ships an
 * emitter AND a linter in the same commit).
 *
 * Bidirectional: fails when a file registered in OUTCOME_BEARING stops calling
 * withOutcome/recordOutcome, AND when an unregistered src/commands/*.ts file starts
 * calling it — the reverse direction is what catches drift as new commands land.
 *
 * Regex, not an AST parse (the repo ships zero runtime deps — tests/zero-runtime-deps.test.ts).
 * A call sitting inside a comment or a string would false-pass; accepted, because the
 * failure mode is a deliberately-commented-out call, which no honest author writes.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { OUTCOME_BEARING, OUTCOME_FILES } from "../src/core/outcome-registry.js";
import { EVENT_TYPES } from "../src/core/memory-events.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMANDS_DIR = join(REPO_ROOT, "src", "commands");
const CALL_RE = /\bwithOutcome\s*\(|\brecordOutcome\s*\(/;
const IMPORT_RE = /from\s+"\.\.\/core\/memory-autorecord\.js"/;

describe("outcome-bearing registry", () => {
  it.each(OUTCOME_BEARING)("$command's file exists", (spec) => {
    expect(existsSync(join(REPO_ROOT, spec.file))).toBe(true);
  });

  it.each(OUTCOME_BEARING)("$command imports memory-autorecord and calls withOutcome", (spec) => {
    const source = readFileSync(join(REPO_ROOT, spec.file), "utf8");
    expect(
      IMPORT_RE.test(source) && CALL_RE.test(source),
      `${spec.command} (${spec.file}) is registered as outcome-bearing but never calls withOutcome — wire it (spec 006 P1) or remove it from OUTCOME_BEARING`,
    ).toBe(true);
  });

  it.each(OUTCOME_BEARING)("$command's eventType is in the closed EVENT_TYPES set", (spec) => {
    expect(EVENT_TYPES as readonly string[]).toContain(spec.eventType);
  });

  it("no src/commands file calls withOutcome without being registered", () => {
    const found: string[] = [];
    for (const file of readdirSync(COMMANDS_DIR)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(join(COMMANDS_DIR, file), "utf8");
      if (CALL_RE.test(source)) found.push(`src/commands/${file}`);
    }
    expect(found.sort()).toEqual([...OUTCOME_FILES].sort());
  });
});

describe("registry shape", () => {
  it("names each command exactly once", () => {
    const commands = OUTCOME_BEARING.map((s) => s.command);
    expect(new Set(commands).size).toBe(OUTCOME_BEARING.length);
  });

  it("covers the nine commands spec 006 locked as outcome-bearing", () => {
    expect(OUTCOME_BEARING).toHaveLength(9);
    expect(OUTCOME_BEARING.map((s) => s.command)).toEqual([
      "ui a11y-lint",
      "ui content-lint",
      "ui taste-lint",
      "ui validate-layout",
      "ui audit",
      "ui autofix",
      "ui taste record",
      "ui ds change-token",
      "ui figma reconcile",
    ]);
  });
});
