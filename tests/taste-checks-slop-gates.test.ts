/**
 * The five slop-gate taste checks (Motion ×2, Typography ×2, Depth ×1).
 * Each check gets a positive fixture plus the mandated negatives from
 * phase-01-kernel-gates.md Bước 2. The final block drives them end-to-end through
 * lintTaste() to prove wiring + axis-order sorting, not just the unit functions.
 */
import { describe, expect, it } from "vitest";
import { checkOvershootEasing, checkFocusRingAnimatesIn } from "../src/core/taste-checks-motion-state.js";
import { checkItalicDisplayHeading, checkUppercaseTightLineHeight } from "../src/core/taste-checks-typography.js";
import { checkZIndexInflation } from "../src/core/taste-checks-depth.js";
import { lintTaste } from "../src/core/taste-lint.js";

// ─── overshoot-easing (Motion) ──────────────────────────────────────────────────

describe("overshoot-easing", () => {
  it("flags a transition whose cubic-bezier overshoots (y1 > 1)", () => {
    const f = checkOvershootEasing("<style>.b{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("overshoot-easing");
    expect(f[0]?.axis).toBe("Motion");
  });

  it("flags a negative-y undershoot (y2 < 0) too", () => {
    expect(checkOvershootEasing("<style>.b{transition:all .3s cubic-bezier(.5,-0.5,.5,1)}</style>")).toHaveLength(1);
  });

  it("does NOT flag the boundary ease-out cubic-bezier(0.16, 1, 0.3, 1) — y=1 is not overshoot", () => {
    expect(checkOvershootEasing("<style>.b{transition:transform .2s cubic-bezier(0.16, 1, 0.3, 1)}</style>")).toHaveLength(0);
  });

  it("does NOT flag overshoot inside animation timing (only transitions are in scope)", () => {
    expect(checkOvershootEasing("<style>.b{animation-timing-function:cubic-bezier(.34,1.56,.64,1)}</style>")).toHaveLength(0);
  });

  it("does NOT match cubic-bezier mentioned in body copy", () => {
    expect(checkOvershootEasing("<p>Try cubic-bezier(.34,1.56,.64,1) for bounce.</p>")).toHaveLength(0);
  });
});

// ─── focus-ring-animates-in (Motion) ────────────────────────────────────────────

describe("focus-ring-animates-in", () => {
  it("Prong A: flags a transition that names an outline property", () => {
    const f = checkFocusRingAnimatesIn("<style>.btn{transition:outline-color .2s ease}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("focus-ring-animates-in");
    expect(f[0]?.axis).toBe("Motion");
  });

  it("Prong B: flags a :focus-visible rule that transitions box-shadow", () => {
    expect(checkFocusRingAnimatesIn("<style>.btn:focus-visible{box-shadow:0 0 0 3px blue;transition:box-shadow .2s}</style>")).toHaveLength(1);
  });

  it("emits one finding per prong (both prongs hit → 2)", () => {
    // transition names outline (A) AND lives on a :focus rule transitioning outline (B).
    expect(checkFocusRingAnimatesIn("<style>.btn:focus{outline:2px solid;transition:outline .2s}</style>")).toHaveLength(2);
  });

  it("does NOT flag transition:transform on a :focus-visible rule", () => {
    expect(checkFocusRingAnimatesIn("<style>.btn:focus-visible{transition:transform .1s}</style>")).toHaveLength(0);
  });

  it("does NOT flag a box-shadow transition on a hover rule (prong B is focus-only)", () => {
    expect(checkFocusRingAnimatesIn("<style>.btn:hover{box-shadow:0 2px 4px #0002;transition:box-shadow .2s}</style>")).toHaveLength(0);
  });
});

// ─── italic-display-heading (Typography) ────────────────────────────────────────

describe("italic-display-heading", () => {
  it("Prong A: flags an h1 element rule set to font-style: italic", () => {
    const f = checkItalicDisplayHeading("<style>h1{font-style:italic}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("italic-display-heading");
    expect(f[0]?.axis).toBe("Typography");
  });

  it("Prong A: flags heading class tokens (.card-title, .display-lg, .hero__title)", () => {
    expect(checkItalicDisplayHeading("<style>.card-title{font-style:italic}</style>")).toHaveLength(1);
    expect(checkItalicDisplayHeading("<style>.display-lg{font-style:italic}</style>")).toHaveLength(1);
    expect(checkItalicDisplayHeading("<style>.hero__title{font-style:italic}</style>")).toHaveLength(1);
  });

  it("Prong B: flags an <em> inside a heading, with a line number", () => {
    const f = checkItalicDisplayHeading("<h2>Meet <em>Ada</em></h2>");
    expect(f).toHaveLength(1);
    expect(f[0]?.line).toBe(1);
  });

  it("does NOT flag body <em> (<p><em>x</em></p>)", () => {
    expect(checkItalicDisplayHeading("<p><em>x</em></p>")).toHaveLength(0);
  });

  it("does NOT flag a non-heading .card { font-style: italic }", () => {
    expect(checkItalicDisplayHeading("<style>.card{font-style:italic}</style>")).toHaveLength(0);
  });

  it("does NOT flag an italic blockquote", () => {
    expect(checkItalicDisplayHeading("<style>blockquote{font-style:italic}</style>")).toHaveLength(0);
  });

  it("does NOT flag .subtitled-x (token mid-word, not a bounded heading class)", () => {
    expect(checkItalicDisplayHeading("<style>.subtitled-x{font-style:italic}</style>")).toHaveLength(0);
  });
});

// ─── uppercase-tight-line-height (Typography) ───────────────────────────────────

describe("uppercase-tight-line-height", () => {
  it("flags uppercase + unitless line-height < 1 (0.94), naming the value", () => {
    const f = checkUppercaseTightLineHeight("<style>.b{text-transform:uppercase;line-height:0.94}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("uppercase-tight-line-height");
    expect(f[0]?.message).toContain("0.94");
  });

  it("flags uppercase + <1em and uppercase + <100%", () => {
    expect(checkUppercaseTightLineHeight("<style>.b{text-transform:uppercase;line-height:0.9em}</style>")).toHaveLength(1);
    expect(checkUppercaseTightLineHeight("<style>.b{text-transform:uppercase;line-height:90%}</style>")).toHaveLength(1);
  });

  it("does NOT flag uppercase + line-height: 1 (exactly 1.0 — floor is strict < 1)", () => {
    expect(checkUppercaseTightLineHeight("<style>.b{text-transform:uppercase;line-height:1}</style>")).toHaveLength(0);
  });

  it("does NOT flag a tight line-height when there is no uppercase transform", () => {
    expect(checkUppercaseTightLineHeight("<style>.b{line-height:0.9}</style>")).toHaveLength(0);
  });

  it("does NOT flag when uppercase and tight line-height are in DIFFERENT rules", () => {
    expect(checkUppercaseTightLineHeight("<style>.a{text-transform:uppercase}.b{line-height:0.8}</style>")).toHaveLength(0);
  });
});

// ─── z-index-inflation (Depth/Surface) ──────────────────────────────────────────

describe("z-index-inflation", () => {
  it("flags an all-nines z-index (9999), naming the value", () => {
    const f = checkZIndexInflation("<style>.modal{z-index:9999}</style>");
    expect(f).toHaveLength(1);
    expect(f[0]?.checkId).toBe("z-index-inflation");
    expect(f[0]?.axis).toBe("Depth/Surface");
    expect(f[0]?.message).toContain("9999");
  });

  it("flags 999 and the 32-bit max int", () => {
    expect(checkZIndexInflation("<style>.x{z-index:999}</style>")).toHaveLength(1);
    expect(checkZIndexInflation("<style>.x{z-index:2147483647}</style>")).toHaveLength(1);
  });

  it("does NOT flag a deliberate scale value (z-index: 1000)", () => {
    expect(checkZIndexInflation("<style>.x{z-index:1000}</style>")).toHaveLength(0);
  });

  it("does NOT flag z-index digits in body copy (CSS regions only)", () => {
    expect(checkZIndexInflation("<p>Set z-index:9999 in your CSS.</p>")).toHaveLength(0);
  });
});

// ─── lintTaste end-to-end (wiring + axis-order sort) ─────────────────────────────

describe("lintTaste — slop-gate checks wired + axis-sorted", () => {
  it("surfaces all five checks and sorts axes Typography < Motion < Depth/Surface", () => {
    const bad = [
      "<style>",
      "h1{font-style:italic}",
      ".label{text-transform:uppercase;line-height:0.9}",
      ".modal{z-index:9999}",
      ".btn{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}",
      ".ipt:focus-visible{box-shadow:0 0 0 3px;transition:box-shadow .2s}",
      "</style>",
    ].join("\n");
    const r = lintTaste(bad);
    const ids = new Set(r.findings.map((f) => f.checkId));
    for (const id of ["italic-display-heading", "uppercase-tight-line-height", "z-index-inflation", "overshoot-easing", "focus-ring-animates-in"]) {
      expect(ids.has(id), `missing ${id}`).toBe(true);
    }
    const idx = (ax: string) => r.axesAffected.indexOf(ax as never);
    expect(idx("Typography")).toBeLessThan(idx("Motion"));
    expect(idx("Motion")).toBeLessThan(idx("Depth/Surface"));
  });

  it("clean DS-faithful markup trips none of the five new checks", () => {
    const clean = [
      "<!doctype html><html><head><style>",
      "h1{font-style:normal}",
      ".label{text-transform:uppercase;line-height:1}",
      ".modal{z-index:100}",
      ".btn{transition:transform .2s cubic-bezier(0.16,1,0.3,1)}",
      ".ipt:focus-visible{outline:2px solid}",
      "</style></head><body><h2>Title</h2></body></html>",
    ].join("\n");
    expect(lintTaste(clean).errorCount).toBe(0);
  });
});
