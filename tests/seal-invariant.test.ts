/**
 * Linter for the DS-seal convention (spec 009 P1, Art II/Art IV) — the emitter half is
 * `reseal` (src/core/ds-reseal.ts); this is its paired linter (repo rule: every standard
 * ships an emitter AND a check that fails without it, same commit).
 *
 * Two halves:
 *  1. STATIC — any src/commands/*.ts that saves the registry or writes tokens must also
 *     import reseal, unless it's a birth site (allowlisted). Regex, not an AST parse (the
 *     repo ships zero runtime deps — tests/zero-runtime-deps.test.ts). Mirrors
 *     tests/autorecord-wiring.test.ts (spec 006 P2) — the in-repo precedent for a
 *     meta-linter as a vitest.
 *  2. BEHAVIORAL — the three sanctioned writers (registry register, figma reconcile
 *     --apply, ds change-token), run against a real sealed fixture, must leave the DS
 *     loadable afterwards. This is the exact test whose absence let two writers drift
 *     (specs/009-code-road/reports/art-iv-seal-audit.md).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { pathsForDir, loadDesignSystem } from "../src/core/design-system.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMANDS_DIR = join(REPO_ROOT, "src", "commands");
const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", name);
const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

function capture(args: string[]): { code: number } {
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (() => true) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (() => true) as any;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code };
}

// ─── 1. STATIC: every sealed-artifact writer must import reseal ───────────────────────

const ALLOWLIST = new Set(["ingest-figma-ds.ts", "ds-init-impl.ts", "ds-import-impl.ts"]);
const SAVE_REGISTRY_CALL_RE = /\bsaveRegistry\s*\(/;
const WRITES_TOKENS_RE = /writeFileSync\(\s*paths\.tokens\b/;
const RESEAL_IMPORT_RE = /from\s+"\.\.\/core\/ds-reseal\.js"/;

function writesASealedArtifact(source: string): boolean {
  return SAVE_REGISTRY_CALL_RE.test(source) || WRITES_TOKENS_RE.test(source);
}

describe("seal invariant — static: a new sealed-artifact writer must reseal", () => {
  it("every src/commands file that saves the registry or writes tokens also imports reseal (unless a birth site)", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(COMMANDS_DIR)) {
      if (!file.endsWith(".ts") || ALLOWLIST.has(file)) continue;
      const source = readFileSync(join(COMMANDS_DIR, file), "utf8");
      if (writesASealedArtifact(source) && !RESEAL_IMPORT_RE.test(source)) offenders.push(file);
    }
    expect(
      offenders,
      "these src/commands/*.ts files write a sealed artifact (saveRegistry or paths.tokens) " +
        `without importing reseal — every writer not on the birth-site allowlist must reseal: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the birth-site allowlist is not stale — every entry still writes what it claims to", () => {
    for (const file of ALLOWLIST) {
      const p = join(COMMANDS_DIR, file);
      expect(existsSync(p), `allowlisted file '${file}' no longer exists`).toBe(true);
      const source = readFileSync(p, "utf8");
      expect(
        writesASealedArtifact(source),
        `${file} is allowlisted as a sealed-artifact writer but no longer writes one — remove it from ALLOWLIST`,
      ).toBe(true);
    }
  });
});

// ─── 2. BEHAVIORAL: every sanctioned write leaves the DS loadable ──────────────────────

function initFixture(bare: boolean): string {
  const tmp = mkdtempSync(join(tmpdir(), "ease-seal-invariant-"));
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass", "--intent", "test",
    "--dir", tmp, "--persona-data", PERSONA_DATA,
    ...(bare ? ["--bare"] : []),
  ]);
  return tmp;
}

describe("seal invariant — behavioral: every sanctioned write leaves the DS loadable", () => {
  it("ds change-token → loadDesignSystem does not throw", () => {
    const tmp = initFixture(true);
    const r = capture(["ds", "change-token", "color.primary", "--value", "{primary.600}", "--dir", tmp]);
    expect(r.code).toBe(0);
    expect(() => loadDesignSystem(pathsForDir(join(tmp, "design")))).not.toThrow();
  });

  it("registry register → loadDesignSystem does not throw", () => {
    const tmp = initFixture(true);
    const registryPath = join(tmp, "design", "component-registry.json");
    const r = capture([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", fix("registry-markup.html"),
      "--file", registryPath,
    ]);
    expect(r.code).toBe(0);
    expect(() => loadDesignSystem(pathsForDir(join(tmp, "design")))).not.toThrow();
  });

  it("figma reconcile --apply → loadDesignSystem does not throw", () => {
    const tmp = initFixture(false); // kit-populated registry — a real name to soft-deprecate
    const frame = {
      v: 1, ts: 1000, op: "deleted", nodeId: "1:1", nodeName: "Control/Button",
      nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local",
      page: "Page 1", fileKey: "abc",
    };
    writeFileSync(join(tmp, "design", "figma.changes.jsonl"), JSON.stringify(frame) + "\n", "utf8");
    const r = capture(["figma", "reconcile", "--dir", tmp, "--apply"]);
    expect(r.code).toBe(0);
    expect(() => loadDesignSystem(pathsForDir(join(tmp, "design")))).not.toThrow();
  });
});
