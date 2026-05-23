import { describe, expect, it } from "vitest";

import { expandPersona, ExpandError } from "../src/core/persona-expand.js";
import { loadPersonaIndex, findPersona } from "../src/core/persona-loader.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { parseTokenFile } from "../src/core/token-model.js";

const PERSONAS_PATH = new URL(
  "../knowledge/personas/personas.json",
  import.meta.url,
).pathname;

function liquidGlass() {
  const records = loadPersonaIndex(PERSONAS_PATH);
  return findPersona(records, "liquid-glass");
}

// ─── Token skeleton structure ─────────────────────────────────────────────────

describe("expandPersona — token skeleton", () => {
  it("produces a token count in the expected range (≥ 95)", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    let count = 0;
    for (const group of Object.values(tokens)) {
      count += Object.keys(group).length;
    }
    expect(count).toBeGreaterThanOrEqual(95);
  });

  it("produces 11 color stops for the primary palette", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    expect(Object.keys(tokens["primary"] ?? {})).toHaveLength(11);
  });

  it("produces all 6 color palettes", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    for (const cat of ["primary", "neutral", "success", "warning", "danger", "info"]) {
      expect(Object.keys(tokens[cat] ?? {})).toHaveLength(11);
    }
  });

  it("produces semantic color aliases", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    expect(tokens["color"]?.["primary"]?.$value).toBe("{primary.500}");
    expect(tokens["color"]?.["primary-hover"]?.$value).toBe("{primary.600}");
    expect(tokens["color"]?.["text-body"]?.$value).toBe("{neutral.900}");
  });

  it("dark-only persona swaps surface and text-body to dark values", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    const darkPersona = findPersona(records, "velvet-noir"); // colorMode: dark
    const { tokens } = expandPersona({ persona: darkPersona, intent: "test" });
    expect(tokens["color"]?.["text-body"]?.$value).toBe("{neutral.50}");
    expect(tokens["color"]?.["surface"]?.$value).toBe("{neutral.900}");
  });

  it("produces spacing ladder with 11 steps", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    const spaceKeys = Object.keys(tokens["space"] ?? {}).filter((k) => !isNaN(Number(k)));
    expect(spaceKeys).toHaveLength(11);
  });

  it("produces 8 font-size stops", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    expect(Object.keys(tokens["font-size"] ?? {})).toHaveLength(8);
  });

  it("the full token graph resolves without errors", () => {
    const persona = liquidGlass();
    const { tokens } = expandPersona({ persona, intent: "test" });
    expect(() => {
      parseTokenFile(tokens as unknown);
      resolveTokens(tokens);
    }).not.toThrow();
  });

  it("registry is always empty after expand", () => {
    const persona = liquidGlass();
    const { registry } = expandPersona({ persona, intent: "test" });
    expect(registry.components).toHaveLength(0);
  });
});

// ─── brandHex override ────────────────────────────────────────────────────────

describe("expandPersona — brandHex override", () => {
  it("overrides the primary palette when --brand-hex is supplied", () => {
    const persona = liquidGlass();
    const { tokens: withOverride } = expandPersona({
      persona,
      intent: "test",
      brandHex: "#FF0066",
    });
    const { tokens: withDefault } = expandPersona({ persona, intent: "test" });
    // The 500-stop hex will differ because the palette is generated from a different base
    expect(withOverride["primary"]?.["500"]?.$value).not.toBe(
      withDefault["primary"]?.["500"]?.$value,
    );
  });

  it("throws BAD_BRAND_HEX for an invalid hex", () => {
    const persona = liquidGlass();
    expect(() =>
      expandPersona({ persona, intent: "test", brandHex: "#GGG" }),
    ).toThrow(ExpandError);
    try {
      expandPersona({ persona, intent: "test", brandHex: "#1" });
    } catch (e) {
      expect(e instanceof ExpandError && e.code).toBe("BAD_BRAND_HEX");
    }
  });
});
