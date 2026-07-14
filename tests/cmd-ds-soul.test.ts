/**
 * `ui ds soul init|check` — command-layer behaviour through the CLI seam:
 * exit codes, JSON envelopes, EXISTS/--force semantics, the soul-missing
 * finding on an absent file, and the per-action flag guard.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { SOUL_SCAFFOLD } from "../src/core/ds-soul.js";

// Named "vela", not "acme" — Acme is in content-checks' placeholder-name set
// and would (correctly) trip soul-placeholder-copy.
const RATIFIED = `---
status: ratified
---

# Design Soul — vela

## Never

- rounded corners over 4px

## Always

- display type at 44px or larger

## Voice

- direct, no filler
`;

function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try {
    exitCode = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

// ─── ds soul init ─────────────────────────────────────────────────────────────

describe("ui ds soul init", () => {
  it("writes the scaffold and reports {path, written:true}", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-init-"));
    const r = capture(["ds", "soul", "init", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.command).toBe("ds soul");
    expect(env.data.written).toBe(true);
    const path = join(tmp, "design", "soul.md");
    expect(env.data.path).toBe(path);
    expect(readFileSync(path, "utf8")).toBe(SOUL_SCAFFOLD);
  });

  it("errors EXISTS on a second init without --force (file preserved)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-init-"));
    capture(["ds", "soul", "init", "--dir", tmp]);
    const path = join(tmp, "design", "soul.md");
    writeFileSync(path, RATIFIED, "utf8");
    const r = capture(["ds", "soul", "init", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("EXISTS");
    expect(readFileSync(path, "utf8")).toBe(RATIFIED);
  });

  it("--force overwrites back to the scaffold", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-init-"));
    capture(["ds", "soul", "init", "--dir", tmp]);
    const path = join(tmp, "design", "soul.md");
    writeFileSync(path, RATIFIED, "utf8");
    const r = capture(["ds", "soul", "init", "--dir", tmp, "--force", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).data.written).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(SOUL_SCAFFOLD);
  });
});

// ─── ds soul check ────────────────────────────────────────────────────────────

describe("ui ds soul check", () => {
  it("missing file → the soul-missing error finding, exit 1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-check-"));
    const r = capture(["ds", "soul", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const env = JSON.parse(r.stdout);
    expect(env.ok).toBe(true); // linter result, not a command error
    expect(env.data.errorCount).toBe(1);
    expect(env.data.findings[0].checkId).toBe("soul-missing");
    expect(env.data.findings[0].message).toContain("ui ds soul init");
  });

  it("the untouched scaffold exits 1 with 3 errors + 2 warnings", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-check-"));
    capture(["ds", "soul", "init", "--dir", tmp]);
    const r = capture(["ds", "soul", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(1);
    const data = JSON.parse(r.stdout).data;
    expect(data.errorCount).toBe(3);
    expect(data.warningCount).toBe(2);
    const ids = data.findings.map((f: { checkId: string }) => f.checkId);
    expect(ids).toContain("soul-empty-section");
    expect(ids).toContain("soul-draft-status");
    expect(ids).toContain("soul-scaffold-untouched");
  });

  it("a ratified, edited soul exits 0 with 0/0 (warnings do not gate)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-check-"));
    mkdirSync(join(tmp, "design"), { recursive: true });
    writeFileSync(join(tmp, "design", "soul.md"), RATIFIED, "utf8");
    const r = capture(["ds", "soul", "check", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.errorCount).toBe(0);
    expect(data.warningCount).toBe(0);
    expect(data.findings).toEqual([]);
  });

  it("text mode lists findings with severity glyphs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-check-"));
    capture(["ds", "soul", "init", "--dir", tmp]);
    const r = capture(["ds", "soul", "check", "--dir", tmp]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("3 error(s), 2 warning(s)");
    expect(r.stdout).toContain("[soul-empty-section]");
  });

  it("rejects --force (an init-only flag) with UNKNOWN_FLAG", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-check-"));
    const r = capture(["ds", "soul", "check", "--dir", tmp, "--force", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("UNKNOWN_FLAG");
  });
});

// ─── dispatcher edges ─────────────────────────────────────────────────────────

describe("ui ds soul — action routing", () => {
  it("no action → BAD_ARG", () => {
    const r = capture(["ds", "soul", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("BAD_ARG");
  });

  it("unknown action → BAD_ARG naming the action", () => {
    const r = capture(["ds", "soul", "frobnicate", "--json"]);
    expect(r.exitCode).toBe(1);
    const env = JSON.parse(r.stdout);
    expect(env.error.code).toBe("BAD_ARG");
    expect(env.error.message).toContain("frobnicate");
  });

  it("init works without a compiled DS (the soul is standalone)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-soul-standalone-"));
    expect(existsSync(join(tmp, "design", "ds.manifest.json"))).toBe(false);
    const r = capture(["ds", "soul", "init", "--dir", tmp, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(tmp, "design", "soul.md"))).toBe(true);
  });
});
