import { describe, expect, it } from "vitest";
import { checkTokenContrast, renderA11yReport } from "../src/core/ds-a11y.js";
import type { ResolvedToken } from "../src/core/token-model.js";

const tok = (path: string, value: string): ResolvedToken => ({ path, type: "color", value });

// A paired token set following the shadcn {role}/{role}-foreground convention, plus an
// unrelated dark token that must never be pulled into the cartesian pairing (the L3 guard).
const pairedTokens: ResolvedToken[] = [
  tok("color.background", "#ffffff"),
  tok("color.foreground", "#111111"),
  tok("color.primary", "#2563eb"),
  tok("color.primary-foreground", "#ffffff"),
  tok("color.muted", "#f3f4f6"),
  tok("color.muted-foreground", "#a1a6ad"),
  tok("color.panel-900", "#16171b"), // unrelated dark surface — must never be paired
];

describe("checkTokenContrast — paired ({role}/{role}-foreground) mode", () => {
  it("uses mode 'paired' and checks ONLY the 3 intended pairs (never the cartesian)", () => {
    const r = checkTokenContrast(pairedTokens);
    expect(r.mode).toBe("paired");
    expect(r.checkedPairs).toBe(3);
    expect(r.pairs).toHaveLength(3);
  });

  it("never pairs a light foreground against the unrelated dark panel-900 (L3 regression guard)", () => {
    const r = checkTokenContrast(pairedTokens);
    expect(r.pairs.some((p) => p.surface === "color.panel-900" || p.text === "color.panel-900")).toBe(false);
  });

  it("flags the muted-foreground/muted pair (~2.23:1) as a failure", () => {
    const r = checkTokenContrast(pairedTokens);
    const muted = r.pairs.find((p) => p.text === "color.muted-foreground" && p.surface === "color.muted");
    expect(muted).toBeDefined();
    expect(muted!.ratio).toBeCloseTo(2.23, 2);
    expect(muted!.passesNormalText).toBe(false);
    expect(muted!.level).toBe("fail");
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.text).toBe("color.muted-foreground");
  });

  it("does not flag the passing pairs (background/foreground, primary/primary-foreground)", () => {
    const r = checkTokenContrast(pairedTokens);
    const failTexts = r.failures.map((f) => f.text);
    expect(failTexts).not.toContain("color.foreground");
    expect(failTexts).not.toContain("color.primary-foreground");
  });

  it("explicit --pairs still wins even when -foreground tokens exist", () => {
    const r = checkTokenContrast(pairedTokens, [["color.foreground", "color.background"]]);
    expect(r.mode).toBe("explicit");
    expect(r.inferred).toBe(false);
    expect(r.checkedPairs).toBe(1);
  });

  it("falls back to legacy cartesian 'inferred' mode when no -foreground tokens are present", () => {
    const nonPaired: ResolvedToken[] = [
      tok("text.muted", "#8A909C"),
      tok("bg.default", "#FFFFFF"),
      tok("surface.card", "#F0F0F0"),
    ];
    const r = checkTokenContrast(nonPaired);
    expect(r.mode).toBe("inferred");
    expect(r.inferred).toBe(true);
    expect(r.pairs.length).toBeGreaterThan(0);
  });

  it("reports a -foreground pair whose surface has no resolved hex in 'unresolved', not silently dropped", () => {
    const tokens: ResolvedToken[] = [
      tok("color.background", "#ffffff"),
      tok("color.foreground", "#111111"),
      tok("color.primary", "{alias}"), // unresolved alias — no hex
      tok("color.primary-foreground", "#ffffff"),
    ];
    const r = checkTokenContrast(tokens);
    expect(r.mode).toBe("paired");
    expect(r.unresolved).toContain("color.primary-foreground:color.primary");
    expect(r.checkedPairs).toBe(1); // only background/foreground resolves
  });

  it("reports unresolved when the foreground token itself has no hex", () => {
    const tokens: ResolvedToken[] = [
      tok("color.accent", "#123456"),
      tok("color.accent-foreground", "var(--x)"),
    ];
    const r = checkTokenContrast(tokens);
    expect(r.mode).toBe("paired");
    expect(r.unresolved).toContain("color.accent-foreground:color.accent");
    expect(r.checkedPairs).toBe(0);
  });

  it("is deterministic in paired mode", () => {
    expect(checkTokenContrast(pairedTokens)).toEqual(checkTokenContrast(pairedTokens));
  });

  it("renderA11yReport mentions the {role}/{role}-foreground convention for paired results", () => {
    const r = checkTokenContrast(pairedTokens);
    const out = renderA11yReport(r);
    expect(out).toContain("{role}/{role}-foreground pairs");
  });
});
