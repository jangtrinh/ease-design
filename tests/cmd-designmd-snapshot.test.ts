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
  const p = join(tmpdir(), `designmd-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.${suffix}`);
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

describe("ui designmd snapshot — basic transform", () => {
  it("produces an HTML file with 0 <script> tags", () => {
    const outPath = tmpPath("html");
    const { code } = captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
      "--css", fix("sample.css"),
      "--out", outPath,
    ]);
    expect(code).toBe(0);
    const html = readFileSync(outPath, "utf8");
    expect(html).not.toContain("<script");
  });

  it("inlines supplied CSS as <style> blocks", () => {
    const outPath = tmpPath("html");
    captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
      "--css", fix("sample.css"),
      "--out", outPath,
    ]);
    const html = readFileSync(outPath, "utf8");
    expect(html).toContain('<style data-source="sample.css">');
    expect(html).toContain("--color-brand: #f97316");
  });

  it("strips inline opacity:0 reveal-state styles", () => {
    const outPath = tmpPath("html");
    captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
      "--out", outPath,
    ]);
    const html = readFileSync(outPath, "utf8");
    // The header had opacity:0;transform:translateY — both should be gone
    expect(html).not.toMatch(/style="[^"]*opacity:\s*0[^.]/);
    // But opacity:0.8 (not zero) on the <p> should survive
    expect(html).toContain("opacity: 0.8");
  });

  it("strips root-relative stylesheet links", () => {
    const outPath = tmpPath("html");
    captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
      "--out", outPath,
    ]);
    const html = readFileSync(outPath, "utf8");
    expect(html).not.toContain('href="/styles/main.css"');
    expect(html).not.toContain('rel="stylesheet"');
  });

  it("absolutises root-relative URLs against --origin", () => {
    const outPath = tmpPath("html");
    captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
      "--out", outPath,
    ]);
    const html = readFileSync(outPath, "utf8");
    expect(html).toContain('src="https://example.com/hero.png"');
    expect(html).toContain('href="https://example.com/about"');
    expect(html).toContain("https://example.com/hero.png 1x");
    expect(html).toContain("https://example.com/hero@2x.png 2x");
  });

  it("strips preload/prefetch links", () => {
    const outPath = tmpPath("html");
    captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
      "--out", outPath,
    ]);
    const html = readFileSync(outPath, "utf8");
    expect(html).not.toContain('rel="preload"');
  });
});

describe("ui designmd snapshot — flag handling", () => {
  it("missing <html-path> → exit 1, BAD_ARG", () => {
    const { code, err } = captureRun([
      "designmd", "snapshot",
      "--origin", "https://example.com",
    ]);
    expect(code).toBe(1);
    expect(err).toMatch(/requires <html-path>/);
  });

  it("missing --origin → exit 1, BAD_ARG", () => {
    const { code, err } = captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
    ]);
    expect(code).toBe(1);
    expect(err).toMatch(/--origin/);
  });

  it("invalid --origin URL → exit 1, BAD_ARG", () => {
    const { code, err } = captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "not a url",
    ]);
    expect(code).toBe(1);
    expect(err).toMatch(/--origin must be a valid URL/);
  });

  it("nonexistent HTML file → exit 1, FILE_NOT_FOUND", () => {
    const { code, out } = captureRun([
      "designmd", "snapshot",
      "/nonexistent/path/x.html",
      "--origin", "https://example.com",
      "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("writes to stdout when --out is absent", () => {
    const { code, out } = captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
    ]);
    expect(code).toBe(0);
    expect(out).toContain("<!DOCTYPE html>");
  });

  it("--json envelope on success has removed counts", () => {
    const { code, out } = captureRun([
      "designmd", "snapshot",
      fix("sample.html"),
      "--origin", "https://example.com",
      "--css", fix("sample.css"),
      "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { html: string; removed: Record<string, number> } };
    expect(json.ok).toBe(true);
    expect(json.data.removed.cssInlined).toBe(1);
    expect(json.data.removed.scripts).toBeGreaterThan(0);
  });
});
