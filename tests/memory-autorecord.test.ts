/**
 * `src/core/memory-autorecord.ts` — the fuel-line kernel (spec 006 P1). Calls the
 * exported functions directly (no CLI seam) per plan invariant #5.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseArgs } from "../src/core/cli-args.js";
import { recordOutcome, withOutcome, lintOutcomeData } from "../src/core/memory-autorecord.js";

const savedHome = process.env["EASE_DESIGN_HOME"];
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ease-autorec-home-"));
  process.env["EASE_DESIGN_HOME"] = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHome;
});

function tmpProj(): string {
  return mkdtempSync(join(tmpdir(), "ease-autorec-"));
}

describe("recordOutcome", () => {
  it("does nothing when the project has no design/ dir — no file is created", () => {
    const proj = tmpProj();
    const parsed = parseArgs(["a11y-lint", "--dir", proj]);
    const r = recordOutcome(parsed, { type: "lint_run", actor: "ui a11y-lint", data: { check: "a11y-lint", file: "x.html", errorCount: 0, warningCount: 0, checkIds: [] } });
    expect(r).toEqual({ recorded: false, reason: "not-opted-in" });
    expect(existsSync(join(proj, "design"))).toBe(false);
  });

  it("appends one line and returns the monotonic id once design/ exists", () => {
    const proj = tmpProj();
    mkdirSync(join(proj, "design"), { recursive: true });
    const parsed = parseArgs(["a11y-lint", "--dir", proj]);
    const input = { type: "lint_run" as const, actor: "ui a11y-lint", data: { check: "a11y-lint", file: "x.html", errorCount: 0, warningCount: 0, checkIds: [] } };
    const r1 = recordOutcome(parsed, input);
    const r2 = recordOutcome(parsed, input);
    expect(r1).toEqual({ recorded: true, id: "e1" });
    expect(r2).toEqual({ recorded: true, id: "e2" });
    const lines = readFileSync(join(proj, "design", "memory.events.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
  });

  it("does not write design/memory.graph.json (the graph rebuilds lazily)", () => {
    const proj = tmpProj();
    mkdirSync(join(proj, "design"), { recursive: true });
    const parsed = parseArgs(["a11y-lint", "--dir", proj]);
    recordOutcome(parsed, { type: "lint_run", actor: "ui a11y-lint", data: { check: "a11y-lint", file: "x.html", errorCount: 0, warningCount: 0, checkIds: [] } });
    expect(existsSync(join(proj, "design", "memory.graph.json"))).toBe(false);
  });

  it("does not upsert the user registry (a lint must not write to $HOME)", () => {
    const proj = tmpProj();
    mkdirSync(join(proj, "design"), { recursive: true });
    const parsed = parseArgs(["a11y-lint", "--dir", proj]);
    recordOutcome(parsed, { type: "lint_run", actor: "ui a11y-lint", data: { check: "a11y-lint", file: "x.html", errorCount: 0, warningCount: 0, checkIds: [] } });
    expect(existsSync(join(home, "projects.json"))).toBe(false);
  });

  it("returns invalid-event, and writes nothing, when data misses a required key", () => {
    const proj = tmpProj();
    mkdirSync(join(proj, "design"), { recursive: true });
    const parsed = parseArgs(["a11y-lint", "--dir", proj]);
    const r = recordOutcome(parsed, { type: "lint_run", actor: "ui a11y-lint", data: { check: "a11y-lint" } });
    expect(r.recorded).toBe(false);
    expect(r.reason).toBe("invalid-event");
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(false);
  });

  it("never throws when the ledger is unwritable — returns write-failed", () => {
    if (process.getuid?.() === 0) return; // root bypasses fs permission bits
    const proj = tmpProj();
    const designDir = join(proj, "design");
    mkdirSync(designDir, { recursive: true });
    chmodSync(designDir, 0o500);
    try {
      const parsed = parseArgs(["a11y-lint", "--dir", proj]);
      const r = recordOutcome(parsed, { type: "lint_run", actor: "ui a11y-lint", data: { check: "a11y-lint", file: "x.html", errorCount: 0, warningCount: 0, checkIds: [] } });
      expect(r.recorded).toBe(false);
      expect(r.reason).toBe("write-failed");
    } finally {
      chmodSync(designDir, 0o700);
    }
  });

  it("input.projectDir walks up from a nested artifact path to find the owning project", () => {
    const proj = tmpProj();
    mkdirSync(join(proj, "design"), { recursive: true });
    const nested = join(proj, "pages", "sub");
    mkdirSync(nested, { recursive: true });
    const artifact = join(nested, "page.html");
    const parsed = parseArgs(["a11y-lint", artifact]); // no --dir at all
    const r = recordOutcome(parsed, {
      type: "lint_run",
      actor: "ui a11y-lint",
      projectDir: artifact,
      data: { check: "a11y-lint", file: artifact, errorCount: 0, warningCount: 0, checkIds: [] },
    });
    expect(r).toEqual({ recorded: true, id: "e1" });
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(true);
  });

  it("input.projectDir that resolves to NO design/ ancestor is not-opted-in, even with --dir set elsewhere", () => {
    const orphan = tmpProj(); // no design/ anywhere in its ancestry
    const otherProj = tmpProj();
    mkdirSync(join(otherProj, "design"), { recursive: true });
    const artifact = join(orphan, "page.html");
    // --dir points at a DIFFERENT project that IS opted in — must not be used as a
    // fallback once projectDir is given (that would reintroduce the cwd-guess bug).
    const parsed = parseArgs(["a11y-lint", artifact, "--dir", otherProj]);
    const r = recordOutcome(parsed, {
      type: "lint_run",
      actor: "ui a11y-lint",
      projectDir: artifact,
      data: { check: "a11y-lint", file: artifact, errorCount: 0, warningCount: 0, checkIds: [] },
    });
    expect(r).toEqual({ recorded: false, reason: "not-opted-in" });
    expect(existsSync(join(otherProj, "design", "memory.events.jsonl"))).toBe(false);
  });

  it("input.projectDir as an already-resolved project dir (not a file) matches at level 0", () => {
    const proj = tmpProj();
    mkdirSync(join(proj, "design"), { recursive: true });
    const parsed = parseArgs(["ds", "change-token"]);
    const r = recordOutcome(parsed, {
      type: "token_change",
      actor: "ui ds change-token",
      projectDir: proj,
      data: { path: "color.primary", from: "#000", to: "#fff", generation: 2 },
    });
    expect(r).toEqual({ recorded: true, id: "e1" });
  });

  it("stamps t from nowIso when given, so the line is byte-stable", () => {
    const projA = tmpProj();
    const projB = tmpProj();
    mkdirSync(join(projA, "design"), { recursive: true });
    mkdirSync(join(projB, "design"), { recursive: true });
    const nowIso = "2026-07-17T00:00:00.000Z";
    const input = { type: "lint_run" as const, actor: "ui a11y-lint", data: { check: "a11y-lint", file: "x.html", errorCount: 0, warningCount: 0, checkIds: [] } };
    recordOutcome(parseArgs(["a11y-lint", "--dir", projA]), input, nowIso);
    recordOutcome(parseArgs(["a11y-lint", "--dir", projB]), input, nowIso);
    const lineA = readFileSync(join(projA, "design", "memory.events.jsonl"), "utf8").trim();
    const lineB = readFileSync(join(projB, "design", "memory.events.jsonl"), "utf8").trim();
    expect(lineA).toBe(lineB);
  });
});

describe("lintOutcomeData", () => {
  it("emits checkIds sorted and deduped", () => {
    const data = lintOutcomeData("a11y-lint", "x.html", {
      errorCount: 1,
      warningCount: 0,
      findings: [{ checkId: "b" }, { checkId: "a" }, { checkId: "b" }],
    });
    expect(data["checkIds"]).toEqual(["a", "b"]);
  });

  it("is byte-stable: two calls on the same result stringify identically", () => {
    const result = { errorCount: 1, warningCount: 2, findings: [{ checkId: "b" }, { checkId: "a" }] };
    const d1 = lintOutcomeData("a11y-lint", "x.html", result);
    const d2 = lintOutcomeData("a11y-lint", "x.html", result);
    expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
  });
});

describe("withOutcome", () => {
  it("returns the result untouched when the project is not opted in", () => {
    const proj = tmpProj();
    const parsed = parseArgs(["a11y-lint", "--dir", proj]);
    const result = { exitCode: 0, stdout: "ok\n" };
    const out = withOutcome(result, parsed, { type: "lint_run", actor: "ui a11y-lint", data: { check: "a11y-lint", file: "x.html", errorCount: 0, warningCount: 0, checkIds: [] } });
    expect(out.stdout).toBe(result.stdout);
    expect(out.exitCode).toBe(result.exitCode);
    expect(out.stderr).toBeUndefined();
  });

  it("appends exactly one stderr warning on an invalid event, leaving stdout and exitCode alone", () => {
    const proj = tmpProj();
    mkdirSync(join(proj, "design"), { recursive: true });
    const parsed = parseArgs(["a11y-lint", "--dir", proj]);
    const result = { exitCode: 0, stdout: "ok\n" };
    const out = withOutcome(result, parsed, { type: "lint_run", actor: "ui a11y-lint", data: { check: "a11y-lint" } });
    expect(out.stdout).toBe(result.stdout);
    expect(out.exitCode).toBe(result.exitCode);
    expect(out.stderr).toContain("ui: memory auto-record skipped (invalid-event)");
    expect((out.stderr ?? "").split("\n").filter((l) => l.length > 0)).toHaveLength(1);
  });
});
