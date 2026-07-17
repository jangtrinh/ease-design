import { describe, expect, it } from "vitest";
import { inferForegroundPairs, hasForegroundTokens } from "../src/core/token-pairs.js";

// ─── inferForegroundPairs ──────────────────────────────────────────────────────

describe("inferForegroundPairs", () => {
  it("pairs a {role}-foreground with its base {role} when both exist", () => {
    expect(inferForegroundPairs(["color.primary", "color.primary-foreground"])).toEqual([
      ["color.primary-foreground", "color.primary"],
    ]);
  });

  it("pairs a bare color.foreground with its background sibling (app-default)", () => {
    expect(inferForegroundPairs(["color.background", "color.foreground"])).toEqual([
      ["color.foreground", "color.background"],
    ]);
  });

  it("emits multiple pairs sorted by foreground path when several roles are paired", () => {
    const paths = [
      "color.background",
      "color.foreground",
      "color.card",
      "color.card-foreground",
      "color.muted",
      "color.muted-foreground",
    ];
    expect(inferForegroundPairs(paths)).toEqual([
      ["color.card-foreground", "color.card"],
      ["color.foreground", "color.background"],
      ["color.muted-foreground", "color.muted"],
    ]);
  });

  it("emits no pair when the -foreground token's base is absent and no surface sibling exists", () => {
    expect(inferForegroundPairs(["color.accent-foreground"])).toEqual([]);
  });

  it("pairs a dash-separated compound role (sidebar-primary-foreground) when its base exists", () => {
    expect(inferForegroundPairs(["sidebar-primary", "sidebar-primary-foreground"])).toEqual([
      ["sidebar-primary-foreground", "sidebar-primary"],
    ]);
  });

  it("is separator-agnostic: slash-separated base + foreground pairs correctly", () => {
    expect(inferForegroundPairs(["color/primary", "color/primary-foreground"])).toEqual([
      ["color/primary-foreground", "color/primary"],
    ]);
  });

  it("falls back to the 'bg' surface suffix when 'background' is absent (priority order)", () => {
    expect(inferForegroundPairs(["group.bg", "group.foreground"])).toEqual([
      ["group.foreground", "group.bg"],
    ]);
  });

  it("prefers 'bg' over 'surface' when both are present (SURFACE_SUFFIXES priority)", () => {
    expect(inferForegroundPairs(["group.bg", "group.surface", "group.foreground"])).toEqual([
      ["group.foreground", "group.bg"],
    ]);
  });

  it("falls back to the 'base' surface suffix when it's the only sibling available", () => {
    expect(inferForegroundPairs(["group.base", "group.foreground"])).toEqual([
      ["group.foreground", "group.base"],
    ]);
  });

  it("does NOT match a path that merely contains 'foreground' mid-string (must end with it)", () => {
    expect(inferForegroundPairs(["color.foreground-alt", "color.background"])).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(inferForegroundPairs([])).toEqual([]);
  });
});

// ─── foreground synonyms (F11 fix — role-synonym-dictionary.md) ────────────────

describe("inferForegroundPairs — foreground synonyms (-text/-fg/-content/-ink)", () => {
  it("pairs dana's real {role}-text with {role}-bg (badge-danger-text on badge-danger-bg)", () => {
    expect(inferForegroundPairs(["color.badge-danger-bg", "color.badge-danger-text"])).toEqual([
      ["color.badge-danger-text", "color.badge-danger-bg"],
    ]);
  });

  it("SAFETY: badge-danger-text pairs ONLY with badge-danger-bg — never badge-neutral-bg (no cross-role over-pairing)", () => {
    const paths = [
      "color.badge-danger-text",
      "color.badge-danger-bg",
      "color.badge-neutral-text",
      "color.badge-neutral-bg",
    ];
    const result = inferForegroundPairs(paths);
    expect(result).toEqual([
      ["color.badge-danger-text", "color.badge-danger-bg"],
      ["color.badge-neutral-text", "color.badge-neutral-bg"],
    ]);
    expect(result).not.toContainEqual(["color.badge-danger-text", "color.badge-neutral-bg"]);
    expect(result).not.toContainEqual(["color.badge-neutral-text", "color.badge-danger-bg"]);
  });

  it("emits no pair when a role has -text but no matching -bg (real dana shape: badge-light-text + badge-light-border only)", () => {
    expect(inferForegroundPairs(["color.badge-light-text", "color.badge-light-border"])).toEqual([]);
  });

  it("pairs the -fg synonym with its role's -bg", () => {
    expect(inferForegroundPairs(["color.alert-fg", "color.alert-bg"])).toEqual([
      ["color.alert-fg", "color.alert-bg"],
    ]);
  });

  it("pairs the -ink synonym with its role's -bg", () => {
    expect(inferForegroundPairs(["color.panel-ink", "color.panel-bg"])).toEqual([
      ["color.panel-ink", "color.panel-bg"],
    ]);
  });

  it("pairs the -content synonym with its role's -bg, but does NOT misfire on a bare surface token ending in 'content' (color.surface-content, real dana shape)", () => {
    // "surface-content" itself ends in the "content" synonym, but has no "surface-content-bg"
    // sibling — must fall through to no pair, not be treated as a stray foreground.
    expect(inferForegroundPairs(["color.surface-content", "color.surface-chrome"])).toEqual([]);
    // A real role-content/-bg pair still resolves.
    expect(inferForegroundPairs(["color.callout-content", "color.callout-bg"])).toEqual([
      ["color.callout-content", "color.callout-bg"],
    ]);
  });

  it("still pairs shadcn's {role}-foreground convention correctly alongside a dana-style {role}-text/-bg pair (no regression from the synonym extension)", () => {
    const paths = [
      "color.primary",
      "color.primary-foreground",
      "color.badge-danger-text",
      "color.badge-danger-bg",
    ];
    expect(inferForegroundPairs(paths)).toEqual([
      ["color.badge-danger-text", "color.badge-danger-bg"],
      ["color.primary-foreground", "color.primary"],
    ]);
  });

  it("pairs a bare {role}-text with the bare {role} token when it exists (interactive-primary-text → interactive-primary, real dana shape)", () => {
    expect(inferForegroundPairs(["color.interactive-primary", "color.interactive-primary-text"])).toEqual([
      ["color.interactive-primary-text", "color.interactive-primary"],
    ]);
  });
});

// ─── hasForegroundTokens ────────────────────────────────────────────────────────

describe("hasForegroundTokens", () => {
  it("is true when any path ends with -foreground", () => {
    expect(hasForegroundTokens(["color.primary", "color.primary-foreground"])).toBe(true);
  });

  it("is false when no path ends with foreground", () => {
    expect(hasForegroundTokens(["color.primary", "color.background"])).toBe(false);
  });

  it("is false for a path that merely contains 'foreground' mid-string", () => {
    expect(hasForegroundTokens(["color.foreground-alt"])).toBe(false);
  });
});
