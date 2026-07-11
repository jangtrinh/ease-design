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
