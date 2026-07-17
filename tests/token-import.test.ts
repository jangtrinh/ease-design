/**
 * `importFlatTokens` / `inferToken` — pure flat-token → DTCG conversion (DESIGN-OS
 * dogfood G1). Covers type inference per value/category/name, nested-group hoisting,
 * skip reporting, `_`-prefixed metadata exclusion, and the DTCG round-trip guard.
 */
import { describe, expect, it } from "vitest";
import { importFlatTokens, inferToken } from "../src/core/token-import.js";
import { parseTokenFile } from "../src/core/token-model.js";

describe("importFlatTokens — colors", () => {
  it("hex colors → DTCG color tokens, stats track imported + byType", () => {
    const { dtcg, stats } = importFlatTokens({ colors: { primary: "#e00026", bg: "#fff" } });
    expect(dtcg.colors?.primary).toEqual({ $value: "#e00026", $type: "color" });
    expect(dtcg.colors?.bg).toEqual({ $value: "#fff", $type: "color" });
    expect(stats.imported).toBe(2);
    expect(stats.byType.color).toBe(2);
    expect(stats.skipped).toBe(0);
  });

  it("rgb()/hsl()/oklch() function strings → color", () => {
    const { dtcg, stats } = importFlatTokens({
      colors: { a: "rgb(255,0,0)", b: "hsl(200,50%,50%)", c: "oklch(0.7 0.15 250)" },
    });
    expect(dtcg.colors?.a?.$type).toBe("color");
    expect(dtcg.colors?.b?.$type).toBe("color");
    expect(dtcg.colors?.c?.$type).toBe("color");
    expect(stats.byType.color).toBe(3);
  });
});

describe("importFlatTokens — dimensions", () => {
  it("bare number in a spacing-ish category → dimension 'Npx'", () => {
    const { dtcg, stats } = importFlatTokens({ spacing: { "space-1": 4 } });
    expect(dtcg.spacing?.["space-1"]).toEqual({ $value: "4px", $type: "dimension" });
    expect(stats.byType.dimension).toBe(1);
  });

  it("bare number in a radii category → dimension 'Npx'", () => {
    const { dtcg } = importFlatTokens({ radii: { "radius-sm": 9 } });
    expect(dtcg.radii?.["radius-sm"]).toEqual({ $value: "9px", $type: "dimension" });
  });
});

describe("importFlatTokens — fontWeight", () => {
  it("number under a *weight* category → fontWeight (number $value)", () => {
    const { dtcg, stats } = importFlatTokens({ weights: { bold: 700 } });
    expect(dtcg.weights?.bold).toEqual({ $value: 700, $type: "fontWeight" });
    expect(stats.byType.fontWeight).toBe(1);
  });
});

describe("importFlatTokens — duration", () => {
  it("number in a motion category with 'ms' in the name → duration 'Nms'", () => {
    const { dtcg, stats } = importFlatTokens({ motion: { "duration-fast-ms": 150 } });
    expect(dtcg.motion?.["duration-fast-ms"]).toEqual({ $value: "150ms", $type: "duration" });
    expect(stats.byType.duration).toBe(1);
  });

  it("cubic-bezier easing string in a motion category → SKIP (unmappable)", () => {
    const { dtcg, stats } = importFlatTokens({ motion: { ease: "cubic-bezier(0.4,0,0.2,1)" } });
    expect(dtcg.motion).toBeUndefined();
    expect(stats.skipped).toBe(1);
    expect(stats.skippedKeys).toEqual([{ key: "motion.ease", reason: expect.stringContaining("unmappable") }]);
  });
});

describe("importFlatTokens — skip paths", () => {
  it("box-shadow strings → SKIP", () => {
    const { dtcg, stats } = importFlatTokens({ shadows: { sm: "0 1px 2px rgba(0,0,0,.04)" } });
    expect(dtcg.shadows).toBeUndefined();
    expect(stats.skipped).toBe(1);
    expect(stats.imported).toBe(0);
  });
});

describe("importFlatTokens — nested groups + fontFamily", () => {
  it("hoists a nested group into '<cat>-<sub>' and infers fontFamily at the parent level", () => {
    const { dtcg, stats } = importFlatTokens({
      typography: { "font-family": "Inter", sizes: { "text-sm": 13 } },
    });
    expect(dtcg.typography?.["font-family"]).toEqual({ $value: "Inter", $type: "fontFamily" });
    expect(dtcg["typography-sizes"]?.["text-sm"]).toEqual({ $value: "13px", $type: "dimension" });
    expect(stats.imported).toBe(2);
    expect(stats.byType.fontFamily).toBe(1);
    expect(stats.byType.dimension).toBe(1);
  });
});

describe("importFlatTokens — plain number, neutral category", () => {
  it("a bare number in a category with no dimension/weight/duration signal → number", () => {
    const { dtcg, stats } = importFlatTokens({ misc: { opacityScale: 3 } });
    expect(dtcg.misc?.opacityscale).toEqual({ $value: 3, $type: "number" });
    expect(stats.byType.number).toBe(1);
  });

  it("F6 (spec 009 P3): a camelCase source name is sanitized to a TOKEN_PATTERN-legal key", () => {
    // registry-store.ts's TOKEN_PATTERN (^[a-z][a-z0-9.-]*$) forbids uppercase — a
    // camelCase group/token name used to pass through verbatim and become
    // unreferencable from any component (dana: 28/286 tokens this way).
    const { dtcg } = importFlatTokens({ fontSize: { captionText: "12px" } });
    expect(dtcg.fontsize?.captiontext).toEqual({ $value: "12px", $type: "dimension" });
    expect(/^[a-z][a-z0-9.-]*$/.test("fontsize")).toBe(true);
    expect(/^[a-z][a-z0-9.-]*$/.test("captiontext")).toBe(true);
  });
});

describe("importFlatTokens — metadata keys ignored", () => {
  it("`_`-prefixed top-level keys are ignored, not counted as skipped", () => {
    const { dtcg, stats } = importFlatTokens({
      _source: "figma",
      _provenance: { by: "import-script" },
      colors: { primary: "#111111" },
    });
    expect(Object.keys(dtcg)).toEqual(["colors"]);
    expect(stats.imported).toBe(1);
    expect(stats.skipped).toBe(0);
  });
});

describe("inferToken — direct shape checks", () => {
  it("color", () => {
    expect(inferToken("colors", "primary", "#e00026")).toEqual({ $value: "#e00026", $type: "color" });
  });
  it("dimension (already-unit string)", () => {
    expect(inferToken("spacing", "gap", "8px")).toEqual({ $value: "8px", $type: "dimension" });
  });
  it("number (neutral category)", () => {
    expect(inferToken("misc", "x", 5)).toEqual({ $value: 5, $type: "number" });
  });
  it("skip (unmappable string)", () => {
    const r = inferToken("shadows", "sm", "0 1px 2px rgba(0,0,0,.04)");
    expect(r).toHaveProperty("skip");
  });
});

describe("importFlatTokens — DTCG round-trip guard", () => {
  it("the emitted dtcg parses cleanly via parseTokenFile (no throw)", () => {
    const { dtcg } = importFlatTokens({
      colors: { primary: "#e00026", bg: "#fff" },
      spacing: { "space-1": 4 },
      weights: { bold: 700 },
      motion: { "duration-fast-ms": 150 },
      typography: { "font-family": "Inter", sizes: { "text-sm": 13 } },
    });
    expect(() => parseTokenFile(dtcg)).not.toThrow();
  });
});

describe("importFlatTokens — throws on bad input shape", () => {
  it("throws on a string", () => {
    expect(() => importFlatTokens("nope")).toThrow();
  });
  it("throws on null", () => {
    expect(() => importFlatTokens(null)).toThrow();
  });
  it("throws on an array", () => {
    expect(() => importFlatTokens([])).toThrow();
  });
});
