/**
 * Style-A report renderer — pure string builders (src/core/report-style.ts).
 * Mirrors color-convert.test.ts's direct-import pattern (pure module, no CLI).
 */
import { describe, expect, it } from "vitest";
import { GLYPH, renderBanner, ruleHeader, checkItem, kv } from "../src/core/report-style.js";

describe("ruleHeader", () => {
  it("pads the line to the requested width and right-aligns the verdict", () => {
    const line = ruleHeader("onboarding", "READY", 64);
    expect(line.length).toBe(64);
    expect(line.endsWith("READY")).toBe(true);
    expect(line.startsWith("onboarding ")).toBe(true);
    expect(line).toContain("─");
  });

  it("falls back to a single-space separator when there's no room for a rule", () => {
    const longTitle = "x".repeat(60);
    const line = ruleHeader(longTitle, "READY", 64);
    expect(line).toBe(`${longTitle} READY`);
    expect(line).not.toContain("─");
  });

  it("returns just the title (padded with a rule) when no verdict is given", () => {
    const line = ruleHeader("onboarding");
    expect(line.startsWith("onboarding ")).toBe(true);
    expect(line).toContain("─");
  });

  it("is deterministic", () => {
    expect(ruleHeader("onboarding", "SETUP")).toBe(ruleHeader("onboarding", "SETUP"));
  });
});

describe("checkItem", () => {
  it("emits [✓] for done, with no hint line even if a hint is supplied", () => {
    const line = checkItem("done", "git initialized", "run `git init`");
    expect(line).toBe("  [✓] git initialized");
  });

  it("emits [ ] for pending, with the hint line when supplied", () => {
    const line = checkItem("pending", "design system", "run `ui ds init`");
    expect(line).toBe("  [ ] design system\n        → run `ui ds init`");
  });

  it("emits [!] for warn, with the hint line when supplied", () => {
    const line = checkItem("warn", "git initialized", "run `git init`");
    expect(line).toBe("  [!] git initialized\n        → run `git init`");
  });

  it("omits the hint line entirely when no hint is given", () => {
    const line = checkItem("pending", "project agents (optional)");
    expect(line).toBe("  [ ] project agents (optional)");
  });

  it("uses the GLYPH constants for done/warn", () => {
    expect(checkItem("done", "x")).toContain(GLYPH.done);
    expect(checkItem("warn", "x")).toContain(GLYPH.warn);
  });

  it("emits [✗] for fail, with the hint line when supplied (phase-2: ui doctor)", () => {
    const line = checkItem("fail", "node-version", "install Node >= 20");
    expect(line).toBe("  [✗] node-version\n        → install Node >= 20");
    expect(line).toContain(GLYPH.fail);
  });
});

describe("kv", () => {
  it("pads the key to keyWidth and separates with one space", () => {
    expect(kv("state", "READY", 8)).toBe("  state    READY");
  });
});

describe("renderBanner", () => {
  it("reads the real wordmark asset and appends the tagline", () => {
    const out = renderBanner("templates");
    expect(out).toContain("the design engine that learns in the work");
    expect(out.length).toBeGreaterThan(20);
  });

  it("falls back to the plain string without throwing when given a bad dir", () => {
    expect(() => renderBanner("/nonexistent/path/xyz")).not.toThrow();
    const out = renderBanner("/nonexistent/path/xyz");
    expect(out).toContain("DESIGN:OS");
    expect(out).toContain("the design engine that learns in the work");
  });

  it("accepts a custom tagline", () => {
    const out = renderBanner("/nonexistent/path/xyz", "custom tagline");
    expect(out).toContain("custom tagline");
  });
});
