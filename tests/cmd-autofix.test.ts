import { describe, expect, it, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { run } from "../src/cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", name);

function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const tmpFiles: string[] = [];
function makeTmp(content: string): string {
  const p = join(tmpdir(), `autofix-test-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(p, content, "utf8");
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  for (const p of tmpFiles) {
    if (existsSync(p)) unlinkSync(p);
  }
  tmpFiles.length = 0;
});

// ─── --json mode ──────────────────────────────────────────────────────────────

describe("ui autofix --json — dirty fixture", () => {
  it("exits 0 and fixesApplied > 0 with findings array", () => {
    const { code, out } = captureRun(["autofix", fix("autofix-dirty.html"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { fixesApplied: number; findings: { ruleId: string }[]; html: string; written: boolean };
    };
    expect(json.ok).toBe(true);
    expect(json.data.fixesApplied).toBeGreaterThan(0);
    expect(json.data.findings.length).toBe(json.data.fixesApplied);
    expect(typeof json.data.html).toBe("string");
    expect(json.data.written).toBe(false);
  });

  it("findings contain expected rule ids for dirty fixture", () => {
    const { out } = captureRun(["autofix", fix("autofix-dirty.html"), "--json"]);
    const json = JSON.parse(out) as { data: { findings: { ruleId: string }[] } };
    const ids = json.data.findings.map((f) => f.ruleId);
    expect(ids).toContain("viewport-meta");
    expect(ids).toContain("img-onerror");
    expect(ids).toContain("lucide-createicons");
    expect(ids).toContain("cdn-urls");
    expect(ids).toContain("duplicate-ids");
  });
});

describe("ui autofix --json — clean fixture", () => {
  it("exits 0 and fixesApplied is 0 with empty findings", () => {
    const { code, out } = captureRun(["autofix", fix("autofix-clean.html"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { fixesApplied: number; findings: unknown[] } };
    expect(json.ok).toBe(true);
    expect(json.data.fixesApplied).toBe(0);
    expect(json.data.findings).toHaveLength(0);
  });
});

// ─── Text mode ────────────────────────────────────────────────────────────────

describe("ui autofix text mode", () => {
  it("outputs fixed HTML on stdout and summary on stderr, exits 0", () => {
    const { code, out, err } = captureRun(["autofix", fix("autofix-dirty.html")]);
    expect(code).toBe(0);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("<html");
    expect(err).toMatch(/applied \d+ fix/);
  });

  it("clean file outputs 'applied 0 fixes' summary on stderr", () => {
    const { code, err } = captureRun(["autofix", fix("autofix-clean.html")]);
    expect(code).toBe(0);
    expect(err).toContain("applied 0 fixes");
  });
});

// ─── --write mode ─────────────────────────────────────────────────────────────

describe("ui autofix --write", () => {
  it("overwrites the file in place and exits 0", () => {
    const original = readFileSync(fix("autofix-dirty.html"), "utf8");
    const tmp = makeTmp(original);
    const { code } = captureRun(["autofix", tmp, "--write"]);
    expect(code).toBe(0);
    const written = readFileSync(tmp, "utf8");
    expect(written).toContain('<meta name="viewport"');
  });

  it("second --write run finds no fixes (idempotence)", () => {
    const original = readFileSync(fix("autofix-dirty.html"), "utf8");
    const tmp = makeTmp(original);
    captureRun(["autofix", tmp, "--write"]);
    const { out } = captureRun(["autofix", tmp, "--json"]);
    const json = JSON.parse(out) as { data: { fixesApplied: number } };
    expect(json.data.fixesApplied).toBe(0);
  });

  it("--write --json sets written:true in envelope", () => {
    const original = readFileSync(fix("autofix-dirty.html"), "utf8");
    const tmp = makeTmp(original);
    const { out } = captureRun(["autofix", tmp, "--write", "--json"]);
    const json = JSON.parse(out) as { data: { written: boolean } };
    expect(json.data.written).toBe(true);
  });
});

// ─── Error paths ──────────────────────────────────────────────────────────────

describe("ui autofix error paths", () => {
  it("missing file --json → exit 1, FILE_NOT_FOUND", () => {
    const { code, out } = captureRun(["autofix", "/nonexistent-file-xyz.html", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("missing file arg --json → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["autofix", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("missing file arg text → exit 1, stderr message", () => {
    const { code, err } = captureRun(["autofix"]);
    expect(code).toBe(1);
    expect(err).toContain("requires a");
  });
});

// ─── --help ───────────────────────────────────────────────────────────────────

describe("ui autofix --help", () => {
  it("exits 0 and prints help text", () => {
    const { code, out } = captureRun(["autofix", "--help"]);
    expect(code).toBe(0);
    expect(out.toLowerCase()).toContain("autofix");
  });
});
