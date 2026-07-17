import { describe, expect, it, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", "designmd", name);

const tmpFiles: string[] = [];
function tmpPath(suffix: string): string {
  const p = join(tmpdir(), `designmd-tokens-${Date.now()}-${Math.random().toString(36).slice(2)}.${suffix}`);
  tmpFiles.push(p);
  return p;
}
afterEach(() => {
  for (const p of tmpFiles) if (existsSync(p)) rmSync(p, { force: true });
  tmpFiles.length = 0;
});

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
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

describe("ui designmd extract-tokens — sample fixture", () => {
  it("recovers #f97316 as the dominant brand colour", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", fix("sample.css"),
    ]);
    expect(code).toBe(0);
    const tokens = JSON.parse(out) as { colors: { hex: string; count: number }[] };
    const orange = tokens.colors.find(c => c.hex === "#f97316");
    expect(orange).toBeDefined();
    expect(orange!.count).toBeGreaterThanOrEqual(2);
  });

  it("recovers Plus Jakarta Sans and Nunito as fonts", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", fix("sample.css"),
    ]);
    expect(code).toBe(0);
    const tokens = JSON.parse(out) as { fonts: { family: string }[] };
    const families = tokens.fonts.map(f => f.family);
    expect(families).toContain("Plus Jakarta Sans");
    expect(families).toContain("Nunito");
  });

  it("resolves --color-brand to #f97316 custom property", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", fix("sample.css"),
    ]);
    expect(code).toBe(0);
    const tokens = JSON.parse(out) as { customProperties: { name: string; hex?: string }[] };
    const brand = tokens.customProperties.find(p => p.name === "--color-brand");
    expect(brand?.hex).toBe("#f97316");
  });

  it("--out writes tokens.json to disk and stdout is human summary", () => {
    const outPath = tmpPath("json");
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", fix("sample.css"),
      "--out", outPath,
    ]);
    expect(code).toBe(0);
    expect(out).toMatch(/wrote tokens\.json/);
    expect(existsSync(outPath)).toBe(true);
    const tokens = JSON.parse(readFileSync(outPath, "utf8")) as { colors: unknown[] };
    expect(tokens.colors.length).toBeGreaterThan(0);
  });

  it("--json envelope mode wraps tokens in {ok, data}", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--json",
    ]);
    expect(code).toBe(0);
    const env = JSON.parse(out) as { ok: boolean; data: { colors: unknown[] } };
    expect(env.ok).toBe(true);
    expect(Array.isArray(env.data.colors)).toBe(true);
  });

  it("works with HTML alone (no CSS chunks supplied)", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
    ]);
    expect(code).toBe(0);
    const tokens = JSON.parse(out) as { colors: { hex: string }[] };
    // sample.html's inline <style> declares #f97316 and #fffee7
    expect(tokens.colors.some(c => c.hex === "#f97316")).toBe(true);
  });

  it("provenance entries include line numbers", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", fix("sample.css"),
    ]);
    expect(code).toBe(0);
    const tokens = JSON.parse(out) as { colors: { hex: string; sources: string[] }[] };
    const orange = tokens.colors.find(c => c.hex === "#f97316");
    expect(orange!.sources[0]).toMatch(/:L\d+$/);
  });
});

describe("ui designmd extract-tokens — error handling", () => {
  it("missing <html-path> → exit 1, BAD_ARG", () => {
    const { code, err } = captureRun(["designmd", "extract-tokens"]);
    expect(code).toBe(1);
    expect(err).toMatch(/requires <html-path>/);
  });

  it("nonexistent file → FILE_NOT_FOUND in JSON mode", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      "/nonexistent/x.html",
      "--json",
    ]);
    expect(code).toBe(1);
    const env = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(env.error.code).toBe("FILE_NOT_FOUND");
  });

  it("nonexistent CSS path → FILE_NOT_FOUND in JSON mode", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", "/nonexistent/x.css",
      "--json",
    ]);
    expect(code).toBe(1);
    const env = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(env.error.code).toBe("FILE_NOT_FOUND");
  });
});

describe("ui designmd extract-tokens — D1: selector provenance (spec 009 P3)", () => {
  it("each custom-property source carries its enclosing selector", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", fix("sample.css"),
      "--json",
    ]);
    expect(code).toBe(0);
    const env = JSON.parse(out) as { data: { customProperties: { name: string; selectors: string[] }[] } };
    const brand = env.data.customProperties.find((p) => p.name === "--color-brand");
    expect(brand?.selectors[0]).toBe(":root");
  });
});

describe("ui designmd extract-tokens — F4: repeated --css is a hard error (spec 009 P3)", () => {
  it("a comma-joined --css scans every file (the working multi-file form)", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", `${fix("sample.css")},${fix("sample.css")}`,
      "--json",
    ]);
    expect(code).toBe(0);
    const env = JSON.parse(out) as { data: { customProperties: { name: string }[] } };
    expect(env.data.customProperties.some((p) => p.name === "--color-brand")).toBe(true);
  });

  it("--css passed twice → REPEATED_FLAG, not a silent last-wins drop", () => {
    const { code, out } = captureRun([
      "designmd", "extract-tokens",
      fix("sample.html"),
      "--css", fix("sample.css"),
      "--css", fix("sample.css"),
      "--json",
    ]);
    expect(code).toBe(1);
    const env = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(env.error.code).toBe("REPEATED_FLAG");
  });
});
