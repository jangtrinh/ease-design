import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { extractTokens } from "../src/core/designmd-token-extractor.js";
import type { SourceFile } from "../src/core/designmd-token-extractor.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function src(name: string, body: string): SourceFile {
  return { name, body };
}

describe("extractTokens — hex colours", () => {
  it("counts hex occurrences across sources", () => {
    const out = extractTokens([
      src("a.css", ".x { color: #ff0000; } .y { color: #ff0000; }"),
      src("b.css", "#FF0000"),
    ]);
    const red = out.colors.find(c => c.hex === "#ff0000");
    expect(red).toBeDefined();
    expect(red!.count).toBe(3);
  });

  it("normalises hex to lowercase #RRGGBB", () => {
    const out = extractTokens([src("a.css", "color: #ABCDEF;")]);
    expect(out.colors[0]?.hex).toBe("#abcdef");
  });

  it("expands 3-digit shorthand to 6-digit", () => {
    const out = extractTokens([src("a.css", "color: #abc;")]);
    expect(out.colors.some(c => c.hex === "#aabbcc")).toBe(true);
  });

  it("sorts colours by count descending", () => {
    const out = extractTokens([
      src("a.css", "#111111 #111111 #111111 #222222 #222222 #333333"),
    ]);
    expect(out.colors[0]?.hex).toBe("#111111");
    expect(out.colors[0]?.count).toBe(3);
    expect(out.colors[1]?.hex).toBe("#222222");
    expect(out.colors[2]?.hex).toBe("#333333");
  });

  it("records provenance with line numbers", () => {
    const out = extractTokens([
      src("a.css", "line1\nline2 #aabbcc\nline3"),
    ]);
    const aabbcc = out.colors.find(c => c.hex === "#aabbcc");
    expect(aabbcc!.sources[0]).toMatch(/a\.css:L2$/);
  });

  it("caps provenance entries per token", () => {
    const body = Array(20).fill("#ff0000").join("\n");
    const out = extractTokens([src("a.css", body)]);
    const red = out.colors.find(c => c.hex === "#ff0000");
    expect(red!.count).toBe(20);
    expect(red!.sources.length).toBeLessThanOrEqual(5);
  });
});

describe("extractTokens — font families", () => {
  it("captures the primary family from a stack", () => {
    const out = extractTokens([
      src("a.css", "body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }"),
    ]);
    expect(out.fonts.map(f => f.family)).toContain("Plus Jakarta Sans");
  });

  it("strips surrounding quotes", () => {
    const out = extractTokens([
      src("a.css", `.x { font-family: "My Font", serif; }`),
    ]);
    expect(out.fonts.map(f => f.family)).toContain("My Font");
  });

  it("skips generic-only stacks", () => {
    const out = extractTokens([
      src("a.css", ".x { font-family: sans-serif; }"),
    ]);
    expect(out.fonts.length).toBe(0);
  });

  it("captures multiple distinct families from multiple rules", () => {
    const out = extractTokens([
      src("a.css", ".a { font-family: Nunito, sans-serif; } .b { font-family: 'Plus Jakarta Sans', serif; }"),
    ]);
    const names = out.fonts.map(f => f.family);
    expect(names).toContain("Nunito");
    expect(names).toContain("Plus Jakarta Sans");
  });
});

describe("extractTokens — custom properties", () => {
  it("resolves hex-valued custom properties", () => {
    const out = extractTokens([
      src("a.css", ":root { --color-brand: #fdde24; --spacing: 8px; }"),
    ]);
    const brand = out.customProperties.find(p => p.name === "--color-brand");
    expect(brand?.hex).toBe("#fdde24");
    const spacing = out.customProperties.find(p => p.name === "--spacing");
    expect(spacing?.hex).toBeUndefined();
  });

  it("expands 3-digit hex in custom-property values", () => {
    const out = extractTokens([
      src("a.css", ":root { --c: #abc; }"),
    ]);
    expect(out.customProperties.find(p => p.name === "--c")?.hex).toBe("#aabbcc");
  });
});

describe("extractTokens — D1 selector provenance (spec 009 P3)", () => {
  it("records the enclosing selector for :root, @theme, and a data-theme block", () => {
    const out = extractTokens([
      src("a.css", `
        :root { --color-bg: #ffffff; }
        @theme { --color-gray-900: var(--gray-900); }
        [data-theme="dark"] { --color-bg: #111111; }
      `),
    ]);
    const bgRoot = out.customProperties.find(p => p.name === "--color-bg" && p.value === "#ffffff");
    expect(bgRoot?.selectors[0]).toBe(":root");
    const gray = out.customProperties.find(p => p.name === "--color-gray-900");
    expect(gray?.selectors[0]).toBe("@theme");
    const bgDark = out.customProperties.find(p => p.name === "--color-bg" && p.value === "#111111");
    expect(bgDark?.selectors[0]).toBe('[data-theme="dark"]');
  });

  it("records a compound comma-separated selector list verbatim (dana's 3-mode block)", () => {
    const out = extractTokens([
      src("a.css", `[data-theme="dark"],\n[data-theme="classic"],\n.dark {\n  --surface-content: var(--gray-900);\n}`),
    ]);
    const surface = out.customProperties.find(p => p.name === "--surface-content");
    expect(surface?.selectors[0]).toContain('[data-theme="dark"]');
    expect(surface?.selectors[0]).toContain(".dark");
  });

  it("selectors[] stays index-aligned with sources[] across multiple files", () => {
    const out = extractTokens([
      src("a.css", ":root { --x: 1px; }"),
      src("b.css", ".weird { --x: 1px; }"),
    ]);
    const x = out.customProperties.find(p => p.name === "--x");
    expect(x?.sources.length).toBe(x?.selectors.length);
    expect(x?.selectors).toEqual([":root", ".weird"]);
  });
});

describe("extractTokens — real traicaybentre fixture", () => {
  const htmlPath = join(REPO_ROOT, "plans/260527-from-url-designmd/artifacts/traicaybentre.html");
  const css1Path = join(REPO_ROOT, "plans/260527-from-url-designmd/artifacts/traicaybentre.css");
  const css2Path = join(REPO_ROOT, "plans/260527-from-url-designmd/artifacts/traicaybentre-2.css");

  const hasFixture = existsSync(htmlPath) && existsSync(css1Path) && existsSync(css2Path);

  it.skipIf(!hasFixture)("recovers the real brand primary #f97316 with count ≥ 28", () => {
    const html = readFileSync(htmlPath, "utf8");
    const css = readFileSync(css1Path, "utf8") + "\n" + readFileSync(css2Path, "utf8");
    const out = extractTokens([
      src("source.html", html),
      src("source.css", css),
    ]);
    const orange = out.colors.find(c => c.hex === "#f97316");
    expect(orange).toBeDefined();
    expect(orange!.count).toBeGreaterThanOrEqual(28);
  });

  it.skipIf(!hasFixture)("recovers the secondary brand #fdde24 with count ≥ 6", () => {
    const html = readFileSync(htmlPath, "utf8");
    const css = readFileSync(css1Path, "utf8") + "\n" + readFileSync(css2Path, "utf8");
    const out = extractTokens([
      src("source.html", html),
      src("source.css", css),
    ]);
    const yellow = out.colors.find(c => c.hex === "#fdde24");
    expect(yellow).toBeDefined();
    expect(yellow!.count).toBeGreaterThanOrEqual(6);
  });

  it.skipIf(!hasFixture)("recovers Plus Jakarta Sans and Nunito as fonts", () => {
    const html = readFileSync(htmlPath, "utf8");
    const css = readFileSync(css1Path, "utf8") + "\n" + readFileSync(css2Path, "utf8");
    const out = extractTokens([
      src("source.html", html),
      src("source.css", css),
    ]);
    const families = out.fonts.map(f => f.family);
    expect(families).toContain("Plus Jakarta Sans");
    expect(families).toContain("Nunito");
  });

  it.skipIf(!hasFixture)("resolves --color-brand to #fdde24 via custom property", () => {
    const html = readFileSync(htmlPath, "utf8");
    const css = readFileSync(css1Path, "utf8") + "\n" + readFileSync(css2Path, "utf8");
    const out = extractTokens([
      src("source.html", html),
      src("source.css", css),
    ]);
    const brand = out.customProperties.find(p => p.name === "--color-brand");
    expect(brand?.hex).toBe("#fdde24");
  });
});
