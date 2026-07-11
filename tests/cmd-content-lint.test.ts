/**
 * `ui content-lint` — E2E over the deterministic content/UX-writing floor.
 * Mirrors the mkdtempSync + stdout/stderr capture convention in cmd-critique-coverage.test.ts.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

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
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

let dir: string;
const write = (name: string, contents: string): string => {
  const p = join(dir, name);
  writeFileSync(p, contents, "utf8");
  return p;
};
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-content-lint-")); });

describe("content-lint — findings", () => {
  it("lorem/placeholder copy → exit 1, --json errorCount > 0, findings present", () => {
    const file = write("bad.html", "<p>Lorem ipsum dolor sit amet</p><p>Insert text here</p>");
    const r = capture(["content-lint", file, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { errorCount: number; warningCount: number; findings: unknown[] };
    expect(d.errorCount).toBeGreaterThan(0);
    expect(d.findings.length).toBeGreaterThan(0);
  });

  it("text mode reports error/warning counts and findings", () => {
    const file = write("bad.html", "<p>Lorem ipsum content</p>");
    const r = capture(["content-lint", file]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("content-lint:");
    expect(r.out).toContain("lorem-ipsum");
  });

  it("clean page → exit 0, no error findings", () => {
    const file = write("clean.html", "<p>Welcome back. Please sign in to continue.</p>");
    const r = capture(["content-lint", file, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { errorCount: number };
    expect(d.errorCount).toBe(0);
  });

  it("clean page in text mode reports 0 findings", () => {
    const file = write("clean.html", "<p>Welcome back. Please sign in to continue.</p>");
    const r = capture(["content-lint", file]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 findings");
  });
});

describe("content-lint — error paths (code in --json envelope)", () => {
  const code = (args: string[]): string => {
    const r = capture([...args, "--json"]);
    expect(r.code).toBe(1);
    return (JSON.parse(r.out) as { error: { code: string } }).error.code;
  };

  it("missing positional → BAD_ARG", () => {
    expect(code(["content-lint"])).toBe("BAD_ARG");
  });

  it("nonexistent file → FILE_NOT_FOUND", () => {
    expect(code(["content-lint", join(dir, "nope.html")])).toBe("FILE_NOT_FOUND");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    const file = write("clean.html", "<p>Welcome back.</p>");
    expect(code(["content-lint", file, "--bogus-flag"])).toBe("UNKNOWN_FLAG");
  });
});
