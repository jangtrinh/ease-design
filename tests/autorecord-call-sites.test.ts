/**
 * CLI seam for spec 006 P1 — the nine outcome-bearing commands each append a
 * MemoryEvent via `withOutcome`.
 *
 * Seven of the nine commands (a11y-lint, content-lint, taste-lint,
 * validate-layout, audit, autofix, taste record) resolve the ledger from
 * `process.cwd()` — there is no `--dir` flag (Key Insight 6). Testing that
 * honestly means driving a real per-process cwd. `process.chdir()` is
 * process-global and vitest's default pool runs multiple test files in one
 * shared process/worker, so calling it here would race every other suite
 * running concurrently (confirmed: it corrupted the repo's own working tree
 * with cross-file events during authoring). Instead we spawn the BUILT
 * binary (`dist/cli.js`) as a real subprocess with `cwd` set via
 * `spawnSync`'s `cwd` option — this isolates cwd per invocation with zero
 * shared state, mirroring `tests/cmd-init-built-binary.test.ts`.
 *
 * The two `--dir`-taking commands (ds change-token, figma reconcile) stay
 * in-process via `run()` — they never touch `process.cwd()`.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { encodePng } from "../src/core/png-codec.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_CLI = join(REPO_ROOT, "dist", "cli.js");
const PERSONA_DATA = join(REPO_ROOT, "knowledge", "personas", "personas.json");

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = origOut; process.stderr.write = origErr; }
  return { code, out, err };
}

/** Spawn the built binary with `cwd` set — isolates process.cwd() per call, no global chdir. */
function spawnUi(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [DIST_CLI, ...args], { cwd, encoding: "utf8" });
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function lastLedgerLine(proj: string): Record<string, unknown> {
  const lines = readFileSync(join(proj, "design", "memory.events.jsonl"), "utf8").trim().split("\n");
  return JSON.parse(lines[lines.length - 1] ?? "{}");
}

function tmpFile(dir: string, name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content, "utf8");
  return p;
}

const savedHome = process.env["EASE_DESIGN_HOME"];
let proj: string; // design project (has design/) — the auto-record target for cwd-resolved commands
let scratch: string; // scratch dir for input fixtures, outside proj

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "ease-autorec-proj-"));
  mkdirSync(join(proj, "design"), { recursive: true });
  scratch = mkdtempSync(join(tmpdir(), "ease-autorec-scratch-"));
  process.env["EASE_DESIGN_HOME"] = mkdtempSync(join(tmpdir(), "ease-autorec-home-"));
});
afterEach(() => {
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHome;
});

const distMissing = !existsSync(DIST_CLI);
if (distMissing) {
  console.warn(`SKIP autorecord-call-sites: ${DIST_CLI} not found — run "npm run build" first.`);
}

// ─── a11y-lint / content-lint / taste-lint / validate-layout / audit (lint_run) ──
//
// The ledger project is resolved from the LINTED FILE (walk-up from its dir looking
// for design/), never from cwd — so every fixture below lives inside a nested
// subdir of `proj` (proving the walk-up), and every command is spawned with cwd set
// to `scratch` (an unrelated dir with no design/ ancestor — proving cwd is now
// irrelevant to where the outcome lands; spec 006 P1 blocker fix).

describe.skipIf(distMissing)("lint_run auto-record", () => {
  it("ui a11y-lint appends one lint_run event naming the rules that tripped", () => {
    const pages = join(proj, "pages");
    mkdirSync(pages, { recursive: true });
    const file = tmpFile(pages, "a11y.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><img src="a.jpg"></body></html>`);
    const r = spawnUi(["a11y-lint", file], scratch);
    expect(r.code).toBe(1);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("lint_run");
    expect((line["data"] as Record<string, unknown>)["check"]).toBe("a11y-lint");
    expect((line["data"] as Record<string, unknown>)["checkIds"]).toContain("img-missing-alt");
  });

  it("ui a11y-lint records a CLEAN run too — a pass is an outcome", () => {
    const pages = join(proj, "pages");
    mkdirSync(pages, { recursive: true });
    const file = tmpFile(pages, "a11y-clean.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><img src="a.jpg" alt="a"></body></html>`);
    const r = spawnUi(["a11y-lint", file], scratch);
    expect(r.code).toBe(0);
    const line = lastLedgerLine(proj);
    const data = line["data"] as Record<string, unknown>;
    expect(data["errorCount"]).toBe(0);
    expect(data["checkIds"]).toEqual([]);
    const lines = readFileSync(join(proj, "design", "memory.events.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("ui content-lint appends lint_run with check=content-lint", () => {
    const pages = join(proj, "pages");
    mkdirSync(pages, { recursive: true });
    const file = tmpFile(pages, "content.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><p>Lorem ipsum dolor sit amet</p></body></html>`);
    const r = spawnUi(["content-lint", file], scratch);
    expect(r.code).toBe(1);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("lint_run");
    expect((line["data"] as Record<string, unknown>)["check"]).toBe("content-lint");
    expect((line["data"] as Record<string, unknown>)["checkIds"]).toContain("lorem-ipsum");
  });

  it("ui taste-lint appends lint_run carrying the axes affected", () => {
    const pages = join(proj, "pages");
    mkdirSync(pages, { recursive: true });
    const file = tmpFile(pages, "taste.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><p style="font-size:12px">Body copy text here</p></body></html>`);
    const r = spawnUi(["taste-lint", file], scratch);
    expect(r.code).toBe(1);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("lint_run");
    const data = line["data"] as Record<string, unknown>;
    expect(data["check"]).toBe("taste-lint");
    expect((data["axes"] as string[]).length).toBeGreaterThan(0);
  });

  it("ui validate-layout appends lint_run with check=validate-layout", () => {
    const pages = join(proj, "pages");
    mkdirSync(pages, { recursive: true });
    const file = tmpFile(pages, "layout.html", `<body><p>no html root</p></body>`);
    const r = spawnUi(["validate-layout", file], scratch);
    expect(r.code).toBe(1);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("lint_run");
    expect((line["data"] as Record<string, unknown>)["check"]).toBe("validate-layout");
    expect((line["data"] as Record<string, unknown>)["checkIds"]).toContain("missing-html-root");
  });

  it("ui audit maps total violations onto errorCount and rules onto checkIds", () => {
    const pages = join(proj, "pages");
    mkdirSync(pages, { recursive: true });
    const nodes = tmpFile(pages, "nodes.json", JSON.stringify({ name: "Bad", type: "FRAME", fills: [{ hex: "#ff0000" }] }));
    const tokens = tmpFile(scratch, "tokens.json", JSON.stringify({ color: { danger: { $value: "#ff0000", $type: "color" } } }));
    const r = spawnUi(["audit", nodes, "--tokens", tokens], scratch);
    expect(r.code).toBe(1);
    const line = lastLedgerLine(proj);
    const data = line["data"] as Record<string, unknown>;
    expect(data["check"]).toBe("audit");
    const checkIds = data["checkIds"] as string[];
    expect(data["warningCount"]).toBe(0);
    expect(checkIds.length).toBeGreaterThan(0);
  });

  it("a lint on a file OUTSIDE any design/ project records nothing, even though cwd has one", () => {
    // The NIT this closes: a lint used to resolve the ledger from cwd, so linting a
    // file that belongs to a DIFFERENT (or no) project could silently write into
    // whichever project happened to be cwd. Now resolution follows the file.
    const file = tmpFile(scratch, "a11y-orphan.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><img src="a.jpg"></body></html>`);
    const r = spawnUi(["a11y-lint", file], proj);
    expect(r.code).toBe(1);
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(false);
  });

  it("lints a file in project OTHER while cwd is project A → records into OTHER, not A", () => {
    const other = mkdtempSync(join(tmpdir(), "ease-autorec-other-"));
    mkdirSync(join(other, "design"), { recursive: true });
    const file = tmpFile(other, "page.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><img src="a.jpg"></body></html>`);
    const r = spawnUi(["a11y-lint", file], proj);
    expect(r.code).toBe(1);
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(false);
    const line = lastLedgerLine(other);
    expect(line["type"]).toBe("lint_run");
    expect((line["data"] as Record<string, unknown>)["check"]).toBe("a11y-lint");
  });
});

// ─── autofix (conditional autofix_applied) ───────────────────────────────────

describe.skipIf(distMissing)("autofix auto-record", () => {
  it("ui autofix without --write records nothing (stdout only, no state change)", () => {
    const file = tmpFile(scratch, "dirty.html", `<!doctype html><html lang="en"><body><div id="x"></div><div id="x"></div></body></html>`);
    const r = spawnUi(["autofix", file], proj);
    expect(r.code).toBe(0);
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(false);
  });

  it("ui autofix --write on already-fixed HTML records nothing (0 fixes = no change)", () => {
    const file = tmpFile(scratch, "clean.html", `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body><p>Hi</p></body></html>`);
    const r = spawnUi(["autofix", file, "--write"], proj);
    expect(r.code).toBe(0);
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(false);
  });

  it("ui autofix --write that applies a fix appends autofix_applied with sorted ruleIds", () => {
    // Fixture lives inside proj (project resolves from the fixed FILE, not cwd);
    // spawned with cwd=scratch to prove cwd no longer matters.
    const pages = join(proj, "pages");
    mkdirSync(pages, { recursive: true });
    const file = tmpFile(pages, "dirty2.html", `<!doctype html><html lang="en"><body><div id="x">a</div><div id="x">b</div></body></html>`);
    const r = spawnUi(["autofix", file, "--write"], scratch);
    expect(r.code).toBe(0);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("autofix_applied");
    const data = line["data"] as Record<string, unknown>;
    expect(data["file"]).toBe(file);
    expect((data["fixCount"] as number)).toBeGreaterThan(0);
    const ruleIds = data["ruleIds"] as string[];
    expect(ruleIds).toEqual([...ruleIds].sort());
  });
});

// ─── ds change-token (token_change, --dir = project dir; in-process is safe) ──

describe("ds change-token auto-record", () => {
  function initDs(dir: string): void {
    capture(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "test", "--dir", dir, "--persona-data", PERSONA_DATA]);
  }

  it("ui ds change-token records token_change carrying the reason", () => {
    initDs(proj);
    const r = capture(["ds", "change-token", "color.primary", "--value", "{primary.600}", "--reason", "brand refresh", "--dir", proj, "--json"]);
    expect(r.code).toBe(0);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("token_change");
    expect((line["data"] as Record<string, unknown>)["reason"]).toBe("brand refresh");
  });

  it("ui ds change-token to the SAME value records nothing (the no-op branch)", () => {
    initDs(proj);
    const first = capture(["ds", "change-token", "color.primary", "--value", "{primary.600}", "--dir", proj, "--json"]);
    expect(first.code).toBe(0);
    const linesAfterFirst = readFileSync(join(proj, "design", "memory.events.jsonl"), "utf8").trim().split("\n").length;
    const second = capture(["ds", "change-token", "color.primary", "--value", "{primary.600}", "--dir", proj, "--json"]);
    expect(second.code).toBe(0);
    expect(JSON.parse(second.out).data.changed).toBe(false);
    const linesAfterSecond = readFileSync(join(proj, "design", "memory.events.jsonl"), "utf8").trim().split("\n").length;
    expect(linesAfterSecond).toBe(linesAfterFirst);
  });
});

// ─── ds change-token WITHOUT --dir: discovery must drive the ledger, not cwd ──
// (spec 006 P1 blocker, symptoms A and B — needs a real per-process cwd, so this
// spawns the built binary rather than using in-process `capture()`.)

describe.skipIf(distMissing)("ds change-token subdir + discovery resolution (blocker fix)", () => {
  function initDsBuilt(dir: string): void {
    spawnSync("node", [DIST_CLI, "ds", "init", "acme", "--persona", "liquid-glass", "--intent", "test", "--dir", dir, "--persona-data", PERSONA_DATA], { encoding: "utf8" });
  }

  it("symptom A: running from a SUBDIR still records into the discovered project, not cwd", () => {
    const p = mkdtempSync(join(tmpdir(), "ease-autorec-dctokA-"));
    initDsBuilt(p);
    const subdir = join(p, "src");
    mkdirSync(subdir, { recursive: true });

    const r = spawnUi(["ds", "change-token", "color.primary", "--value", "{primary.600}", "--json"], subdir);
    expect(r.code).toBe(0);
    expect(existsSync(join(subdir, "design"))).toBe(false); // never created at cwd
    const line = lastLedgerLine(p);
    expect(line["type"]).toBe("token_change");
  });

  it("symptom B: a decoy design/ dir in the subdir (no manifest) does not steal the event", () => {
    const p = mkdtempSync(join(tmpdir(), "ease-autorec-dctokB-"));
    initDsBuilt(p);
    const subdir = join(p, "src");
    mkdirSync(join(subdir, "design"), { recursive: true }); // decoy: design/ exists but has no ds.manifest.json

    const r = spawnUi(["ds", "change-token", "color.primary", "--value", "{primary.600}", "--json"], subdir);
    expect(r.code).toBe(0);
    expect(existsSync(join(subdir, "design", "memory.events.jsonl"))).toBe(false);
    const line = lastLedgerLine(p);
    expect(line["type"]).toBe("token_change");
  });
});

// ─── figma reconcile --apply (reconcile_applied, --dir = project dir) ────────

describe("figma reconcile auto-record", () => {
  function writeLog(dir: string, lines: Record<string, unknown>[]): void {
    writeFileSync(join(dir, "design", "figma.changes.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  }
  function writeRegistry(dir: string, components: Array<Record<string, unknown>>): void {
    writeFileSync(join(dir, "design", "component-registry.json"), JSON.stringify({ version: "0.1.0", components }, null, 2) + "\n", "utf8");
  }
  function frame(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { v: 1, ts: 1000, op: "deleted", nodeId: "1:1", nodeName: "Card/Basic", nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Page 1", fileKey: "abc", ...over };
  }

  it("ui figma reconcile --dry-run records nothing", () => {
    writeRegistry(proj, [{ name: "Card/Basic", category: "card", markup: "<div></div>", tokensUsed: [], scope: "local" }]);
    writeLog(proj, [frame()]);
    const r = capture(["figma", "reconcile", "--dir", proj, "--json"]);
    expect(r.code).toBe(0);
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(false);
  });

  it("ui figma reconcile --apply that changed the registry appends reconcile_applied", () => {
    writeRegistry(proj, [{ name: "Card/Basic", category: "card", markup: "<div></div>", tokensUsed: [], scope: "local" }]);
    writeLog(proj, [frame()]);
    const r = capture(["figma", "reconcile", "--dir", proj, "--apply", "--json"]);
    expect(r.code).toBe(0);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("reconcile_applied");
    const data = line["data"] as Record<string, unknown>;
    expect(data["deprecated"]).toEqual(["Card/Basic"]);
  });
});

// ─── taste record --mode pair (taste_vote, cwd-resolved, never touches designs) ──

describe.skipIf(distMissing)("taste record auto-record", () => {
  function seedItem(root: string, genre: string, offset: number): string {
    const src = mkdtempSync(join(tmpdir(), "ease-autorec-seed-"));
    const data = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < 8 * 8; i++) {
      const v = (i * 7 + offset) % 256;
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    writeFileSync(join(src, "x.png"), encodePng({ width: 8, height: 8, data }));
    const r = spawnSync("node", [DIST_CLI, "taste", "ingest", "--root", root, "--dir", src, "--genre", genre, "--json"], { encoding: "utf8" });
    return (JSON.parse(r.stdout ?? "{}").data.items[0].id) as string;
  }

  it("ui taste record --mode pair appends taste_vote and never touches the designs graph", () => {
    const tasteRoot = mkdtempSync(join(tmpdir(), "ease-autorec-taste-"));
    const id1 = seedItem(tasteRoot, "g", 0);
    const id2 = seedItem(tasteRoot, "g", 90);

    const r = spawnUi(["taste", "record", "--mode", "pair", "--root", tasteRoot, "--a", id1, "--b", id2, "--winner", "a", "--json"], proj);
    expect(r.code).toBe(0);
    const line = lastLedgerLine(proj);
    expect(line["type"]).toBe("taste_vote");
    expect((line["data"] as Record<string, unknown>)["winner"]).toBe("a");

    const compileR = capture(["memory", "compile", "--now", "2026-07-17T00:00:00Z", "--dir", proj, "--json"]);
    expect(compileR.code).toBe(0);
    const graph = JSON.parse(readFileSync(join(proj, "design", "memory.graph.json"), "utf8"));
    expect(graph.designs).toEqual({});
  });
});

// ─── regression + failure-isolation guards ───────────────────────────────────

describe.skipIf(distMissing)("auto-record regression guards", () => {
  it("a lint in a project WITHOUT design/ exits 0/1 exactly as before and writes nothing", () => {
    const bareDir = mkdtempSync(join(tmpdir(), "ease-autorec-bare-"));
    const file = tmpFile(scratch, "a11y-bare.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><img src="a.jpg"></body></html>`);
    const r = spawnUi(["a11y-lint", file], bareDir);
    expect(r.code).toBe(1);
    expect(existsSync(join(bareDir, "design"))).toBe(false);
  });

  it("a failing auto-record never changes the lint's exit code", () => {
    if (process.getuid?.() === 0) return; // root bypasses fs permission bits
    const file = tmpFile(scratch, "a11y-ro.html", `<!doctype html><html lang="en"><head><title>T</title></head><body><img src="a.jpg"></body></html>`);
    const pristine = spawnUi(["a11y-lint", file], proj);
    chmodSync(join(proj, "design"), 0o500);
    try {
      const ro = spawnUi(["a11y-lint", file], proj);
      expect(ro.code).toBe(pristine.code);
    } finally {
      chmodSync(join(proj, "design"), 0o700);
    }
  });
});
