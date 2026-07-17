/**
 * The mode convention's Art II linter (D3, spec 009 P3): `$extensions["mode.<name>"]`
 * now has TWO independent emitters — figma-ds-tokens.ts (kept local "to avoid a cycle")
 * and css-token-ingest.ts (this phase, using the shared home in token-model.ts). A
 * convention with two emitters and no check is exactly what Art II exists to stop —
 * this suite is that check. It does not require either emitter to import the other;
 * it drives both to an equivalent logical input and asserts the OUTPUT shape agrees.
 */
import { describe, expect, it } from "vitest";
import { buildTokensTree } from "../src/core/figma-ds-tokens.js";
import type { DsVariable } from "../src/core/figma-ds-tokens.js";
import { ingestCssTokens } from "../src/core/css-token-ingest.js";
import type { CustomPropertyObservation } from "../src/core/designmd-token-extractor.js";
import { modeExtensionKey, sanitizeModeName } from "../src/core/token-model.js";

describe("test_both_emitters_encode_a_mode_identically", () => {
  it("figma-ds-tokens and css-token-ingest driven to the same logical input produce byte-identical $extensions", () => {
    const figmaVar: DsVariable = {
      id: "1",
      name: "color/bg",
      type: "COLOR",
      valuesByMode: {
        Light: { r: 1, g: 1, b: 1 },
        Dark: { r: 0, g: 0, b: 0 },
      },
    };
    const figmaResult = buildTokensTree([figmaVar]);

    const cssProps: CustomPropertyObservation[] = [
      { name: "--color-bg", value: "#ffffff", sources: ["a.css:L1"], selectors: [":root"] },
      { name: "--color-bg", value: "#000000", sources: ["a.css:L2"], selectors: ['[data-theme="dark"]'] },
    ];
    const cssResult = ingestCssTokens(cssProps);

    expect(figmaResult.tree.color?.bg?.$extensions).toEqual({ "mode.dark": { $value: "#000000" } });
    expect(cssResult.tree.color?.bg?.$extensions).toEqual({ "mode.dark": { $value: "#000000" } });
    // Byte-identical shape between the two independently-implemented emitters.
    expect(cssResult.tree.color?.bg?.$extensions).toEqual(figmaResult.tree.color?.bg?.$extensions);
  });

  it("modeExtensionKey is the shared encoding both emitters converge on", () => {
    expect(modeExtensionKey("dark")).toBe("mode.dark");
    expect(modeExtensionKey("Dark Mode")).toBe(`mode.${sanitizeModeName("Dark Mode")}`);
  });
});

describe("test_a_mode_value_never_becomes_the_base_value (D2)", () => {
  it("figma-ds-tokens: a variable with no recognisable base/light mode still emits SOME base (Figma always has one)", () => {
    // Figma variables always carry a base/first mode by construction — the "no base"
    // edge case is CSS-specific (a declaration that only ever appears under a theme
    // selector). That case is covered on the css-token-ingest side below.
    const figmaVar: DsVariable = { id: "1", name: "color/accent", type: "COLOR", value: { r: 1, g: 0, b: 0 } };
    const result = buildTokensTree([figmaVar]);
    expect(result.tree.color?.accent?.$value).toBe("#FF0000");
  });

  it("css-token-ingest: a theme-only declaration is never promoted to $value", () => {
    const cssProps: CustomPropertyObservation[] = [
      { name: "--surface-danger", value: "#ff0000", sources: ["a.css:L1"], selectors: ['[data-theme="dark"]'] },
    ];
    const result = ingestCssTokens(cssProps);
    expect(result.tree.color?.["surface-danger"]).toBeUndefined();
    expect(result.unverified.some((u) => u.name === "--surface-danger")).toBe(true);
  });
});
