/**
 * The three spec-003 P2 taste-lint craft checks:
 *   font-scale-sprawl      (Typography, warning>7 / error>10) — taste-checks-font-scale.ts
 *   mode-invisible-surface (Depth/Surface, error)            — taste-checks-invisible-surface.ts
 *   z-index-off-ladder     (Depth/Surface, warning)          — taste-checks-depth.ts
 * Fixtures fire every prong plus passing negatives, then a wiring block drives
 * them through lintTaste() to prove registration and the severity split.
 */
import { describe, expect, it } from "vitest";
import { checkFontScaleSprawl } from "../src/core/taste-checks-font-scale.js";
import { checkModeInvisibleSurface } from "../src/core/taste-checks-invisible-surface.js";
import { checkZIndexOffLadder } from "../src/core/taste-checks-depth.js";
import { lintTaste } from "../src/core/taste-lint.js";

// ─── font-scale-sprawl (Typography / warning→error) ─────────────────────────────

/** Build markup with `n` distinct arbitrary Tailwind font sizes (13px, 14px, …). */
function nSizes(n: number): string {
  return Array.from({ length: n }, (_, i) => `<p class="text-[${13 + i}px]">x</p>`).join("\n");
}

describe("font-scale-sprawl", () => {
  it("warns at 8 distinct arbitrary sizes (> 7)", () => {
    const f = checkFontScaleSprawl(nSizes(8));
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("font-scale-sprawl");
    expect(f[0]?.axis).toBe("Typography");
    expect(f[0]?.severity).toBe("warning");
    expect(f[0]?.message).toContain("8 distinct");
  });

  it("errors at 11 distinct arbitrary sizes (> 10)", () => {
    const f = checkFontScaleSprawl(nSizes(11));
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe("error");
  });

  it("counts raw CSS font-size and dedupes equivalent units (16px == 1rem)", () => {
    const css = "<style>.a{font-size:16px}.b{font-size:1rem}</style>"; // one distinct size
    expect(checkFontScaleSprawl(css + nSizes(7))).toHaveLength(0); // 7 tw + 1 css = 8 → but 16px dup? 13..19 + 16 dup → 7
  });

  it("does NOT count named Tailwind steps or var() token sizes", () => {
    const html = '<p class="text-xs">a</p><p class="text-sm">b</p><p class="text-lg">c</p>' +
      '<p class="text-xl">d</p><p class="text-2xl">e</p><p class="text-3xl">f</p>' +
      '<p class="text-4xl">g</p><p class="text-5xl">h</p>' +
      "<style>.x{font-size:var(--step-1)}.y{font-size:var(--step-2)}</style>";
    expect(checkFontScaleSprawl(html)).toHaveLength(0);
  });

  it("does NOT flag a tight scale of 7 sizes", () => {
    expect(checkFontScaleSprawl(nSizes(7))).toHaveLength(0);
  });
});

// ─── mode-invisible-surface (Depth/Surface / error) ─────────────────────────────

describe("mode-invisible-surface", () => {
  it("flags border-white/10 on a light-mode document", () => {
    const f = checkModeInvisibleSurface('<body class="bg-white"><div class="border border-white/10">x</div></body>');
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("mode-invisible-surface");
    expect(f[0]?.axis).toBe("Depth/Surface");
    expect(f[0]?.severity).toBe("error");
    expect(f[0]?.message).toContain("light-mode");
  });

  it("flags bg-white/5 on a light (default) document", () => {
    expect(checkModeInvisibleSurface('<div class="bg-white/5">x</div>')).toHaveLength(1);
  });

  it("flags a literal rgba(255,255,255,0.08) background on a light document", () => {
    const f = checkModeInvisibleSurface('<div style="background:rgba(255,255,255,0.08)">x</div>');
    expect(f).toHaveLength(1);
  });

  it("flags the dark inverse — border-black/10 on a dark-mode document", () => {
    const f = checkModeInvisibleSurface('<body class="dark bg-slate-950"><div class="border-black/10">x</div></body>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain("dark-mode");
  });

  it("does NOT flag border-white/10 on a DARK document (it is the correct hairline there)", () => {
    expect(checkModeInvisibleSurface('<body class="dark bg-black"><div class="border-white/10">x</div></body>')).toHaveLength(0);
  });

  it("does NOT flag a visible-alpha tint (border-white/20 ≥ 0.15)", () => {
    expect(checkModeInvisibleSurface('<body class="bg-white"><div class="border-white/20">x</div></body>')).toHaveLength(0);
  });

  it("does NOT flag a low-alpha WHITE text tint (text is not a surface boundary)", () => {
    expect(checkModeInvisibleSurface('<div class="text-white/10">x</div>')).toHaveLength(0);
  });
});

// ─── z-index-off-ladder (Depth/Surface / warning) ───────────────────────────────

describe("z-index-off-ladder", () => {
  it("flags an off-ladder value (z-index: 47)", () => {
    const f = checkZIndexOffLadder("<style>.m{z-index:47}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("z-index-off-ladder");
    expect(f[0]?.axis).toBe("Depth/Surface");
    expect(f[0]?.severity).toBe("warning");
  });

  it("flags 275 but NOT 100 / 1000 (base-10 ladder steps pass)", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:275}</style>")).toHaveLength(1);
    expect(checkZIndexOffLadder("<style>.a{z-index:100}.b{z-index:1000}</style>")).toHaveLength(0);
  });

  it("does NOT flag single-digit local stacking (z-index 1–9)", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:1}.b{z-index:9}</style>")).toHaveLength(0);
  });

  it("does NOT flag a clean 10/20/30/40/50 ladder", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:10}.b{z-index:20}.c{z-index:50}</style>")).toHaveLength(0);
  });

  it("does NOT double-report all-nines (that is z-index-inflation's error)", () => {
    expect(checkZIndexOffLadder("<style>.a{z-index:9999}</style>")).toHaveLength(0);
  });
});

// ─── lintTaste wiring — registration + severity split ───────────────────────────

describe("lintTaste — P2 web-craft lints wired", () => {
  it("registers all three and keeps the severity split (invisible-surface error, off-ladder warning)", () => {
    const html = [
      '<body class="bg-white">',
      '<div class="border-white/10">x</div>',
      "<style>.m{z-index:47}</style>",
      nSizes(8),
      "</body>",
    ].join("\n");
    const r = lintTaste(html);
    const ids = new Set(r.findings.map((f) => f.checkId));
    expect(ids.has("mode-invisible-surface")).toBe(true);
    expect(ids.has("z-index-off-ladder")).toBe(true);
    expect(ids.has("font-scale-sprawl")).toBe(true);
    expect(r.errorCount).toBeGreaterThanOrEqual(1); // mode-invisible-surface
    expect(r.warningCount).toBeGreaterThanOrEqual(2); // off-ladder + font-scale
  });

  it("clean DS-faithful markup trips none of the three", () => {
    const clean = '<body class="bg-white"><div class="border border-slate-200"><p class="text-sm">Hi</p></div></body>';
    const r = lintTaste(clean);
    const ids = new Set(r.findings.map((f) => f.checkId));
    expect(ids.has("mode-invisible-surface")).toBe(false);
    expect(ids.has("z-index-off-ladder")).toBe(false);
    expect(ids.has("font-scale-sprawl")).toBe(false);
  });
});
