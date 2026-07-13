/**
 * The figma-agent P2 panel UI is DOGFOOD: its tokens come from ease-design's own
 * `ds init`, and its template must clear the SAME four core linters every generated
 * artifact does. This is the paired gate — the panel is a hand-authored HTML surface,
 * so it runs validate-layout / a11y-lint / taste-lint / content-lint with 0 errors,
 * exactly like tests/cmd-ds-preview.test.ts asserts for the machine-generated specimen.
 *
 * It lints the SOURCE template (plugin/src/ui/panel.html, pre-bundle-injection) — the
 * build only inlines the compiled JS at the marker, so the linted markup is what ships.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintLayout } from "../src/core/layout-lint.js";
import { lintA11y } from "../src/core/a11y-lint.js";
import { lintTaste } from "../src/core/taste-lint.js";
import {
  checkLoremIpsum, checkPlaceholderCopy, checkClickHereLink, checkErrorCodeAlone,
  checkExclamationOverload, checkInsensitiveTerms, checkPluralSHack, checkTextInImage, checkAllCapsShout,
} from "../src/core/content-checks.js";

const PANEL = fileURLToPath(new URL("../figma-agent/plugin/src/ui/panel.html", import.meta.url));
const MODEL = fileURLToPath(new URL("../figma-agent/plugin/src/ui/panel-model.ts", import.meta.url));

const html = readFileSync(PANEL, "utf8");
const model = readFileSync(MODEL, "utf8");

/** Count content-lint ERROR-severity findings (mirrors the content-lint command's check set). */
function contentErrors(source: string): number {
  const checks = [
    checkLoremIpsum, checkPlaceholderCopy, checkClickHereLink, checkErrorCodeAlone,
    checkExclamationOverload, checkInsensitiveTerms, checkPluralSHack, checkTextInImage, checkAllCapsShout,
  ];
  let errs = 0;
  for (const c of checks) for (const f of c(source)) if (f.severity === "error") errs++;
  return errs;
}

describe("figma-agent P2 panel — the 4-linter gate", () => {
  it("passes validate-layout / a11y-lint / taste-lint / content-lint with 0 errors", () => {
    expect(lintLayout(html).errorCount, "layout errors").toBe(0);
    expect(lintA11y(html).errorCount, "a11y errors").toBe(0);
    expect(lintTaste(html).errorCount, "taste errors").toBe(0);
    expect(contentErrors(html), "content errors").toBe(0);
  });

  it("is a well-formed, language-tagged, titled document (screen-reader basics)", () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toMatch(/<html\b[^>]*\blang="en"/i);
    expect(html).toMatch(/<title>[^<]+<\/title>/i);
  });
});

describe("figma-agent P2 panel — dogfood tokens + provenance", () => {
  it("embeds the compiled :root token block from ease-design's own DS", () => {
    expect(html).toContain(":root {");
    expect(html).toContain("--color-primary");
    expect(html).toContain("--color-success");
    expect(html).toContain("--font-family-body");
  });

  it("records how to regenerate the tokens (provenance) and the persona", () => {
    expect(html).toContain("ui ds init figma-panel");
    expect(html).toContain("ui tokens compile");
    expect(html).toContain("saas-aurora-minimal");
  });

  it("overrides the body/display font to a system stack (iframe can't load a webfont)", () => {
    expect(html).toContain("-apple-system");
    // the override must come AFTER the compiled :root so it wins the cascade
    expect(html.lastIndexOf("--font-family-body")).toBeGreaterThan(html.indexOf("Inter, system-ui"));
  });

  it("uses no raw hex outside the pasted :root blocks (every chrome color via var())", () => {
    // Strip the two :root{…} blocks, then assert no #RRGGBB / #RGB survives in the chrome/markup.
    const withoutRoot = html.replace(/:root\s*\{[\s\S]*?\}/g, "");
    expect(withoutRoot).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("figma-agent P2 panel — states, a11y live regions, motion", () => {
  it("consumes the P1 connection state machine — all four states have copy in the model", () => {
    for (const state of ["connected", "probing", "handshake", "disconnected"]) {
      expect(model, `missing ${state}`).toContain(`${state}:`);
    }
    // the two spec-mandated sentences are verbatim
    expect(model).toContain("Ready — the CLI can drive this file.");
    expect(model).toContain("The broker starts automatically on your first CLI command.");
  });

  it("wires an activity record shape of {tool, ok, ms, at}", () => {
    expect(model).toContain("tool:");
    expect(model).toContain("ok:");
    expect(model).toContain("ms:");
    expect(model).toContain("at:");
  });

  it("marks status + activity as aria-live polite regions", () => {
    const live = html.match(/aria-live="polite"/g) ?? [];
    expect(live.length, "aria-live regions").toBeGreaterThanOrEqual(2);
  });

  it("guards every animation behind prefers-reduced-motion", () => {
    expect(html).toContain("@keyframes");
    expect(html).toContain("prefers-reduced-motion");
  });

  it("shows the onboarding verify command and a new-tab docs link", () => {
    expect(html).toContain("figma-agent status");
    expect(html).toMatch(/<a\b[^>]*target="_blank"[^>]*>/i);
  });
});
