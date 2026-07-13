import { describe, expect, it } from "vitest";

import { expandPersona, ExpandError, pickAccentFg } from "../src/core/persona-expand.js";
import { loadPersonaIndex, findPersona } from "../src/core/persona-loader.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { contrastRatio, STOPS } from "../src/core/color-scale.js";

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

  it("produces paired semantic color aliases ({role}/{role}-foreground)", () => {
    const persona = liquidGlass(); // colorMode "both" → light-mode defaults
    const { tokens } = expandPersona({ persona, intent: "test" });
    const color = tokens["color"] ?? {};
    // Brand + surfaces
    expect(color["primary"]?.$value).toBe("{primary.500}");
    expect(color["primary-hover"]?.$value).toBe("{primary.600}");
    expect(color["background"]?.$value).toBe("{neutral.50}");
    expect(color["foreground"]?.$value).toBe("{neutral.900}");
    expect(color["card"]?.$value).toBe("{neutral.100}");
    expect(color["muted"]?.$value).toBe("{neutral.200}");
    // Every foreground is present and aliases a primitive (two-tier); on-color
    // foregrounds resolve through the pure-white/black base primitives.
    expect(color["primary-foreground"]?.$value).toMatch(/^\{base\.(white|black)\}$/);
    expect(color["card-foreground"]?.$value).toMatch(/^\{neutral\.\d+\}$/);
    expect(color["muted-foreground"]?.$value).toMatch(/^\{neutral\.\d+\}$/);
    for (const role of ["danger", "success", "info", "warning"]) {
      expect(color[`${role}-foreground`]?.$value, `${role}-foreground`).toMatch(/^\{base\.(white|black)\}$/);
    }
    // The pre-standard names are gone (dogfood finding L7).
    for (const old of ["text-body", "text-muted", "text-on-primary", "surface", "surface-raised"]) {
      expect(color[old], `stale name ${old}`).toBeUndefined();
    }
  });

  it("emits the FULL Design-OS semantic vocabulary (L8: secondary/accent/popover/input/ring/sidebar/chart)", () => {
    const { tokens } = expandPersona({ persona: liquidGlass(), intent: "test" });
    const color = tokens["color"] ?? {};

    // Extended paired surface roles — each aliases a primitive (two-tier), each has a foreground.
    expect(color["secondary"]?.$value).toBe("{neutral.200}");
    expect(color["accent"]?.$value).toBe("{primary.100}");
    expect(color["popover"]?.$value).toBe("{neutral.100}");
    // Neutral foregrounds on the soft surfaces: secondary/popover/sidebar.
    for (const role of ["secondary", "popover", "sidebar"]) {
      expect(color[`${role}-foreground`]?.$value, `${role}-foreground`).toMatch(/^\{neutral\.\d+\}$/);
    }
    // Accent + sidebar-accent foregrounds are ON-BRAND (Fix 4): the darkest primary step that
    // clears AA on the accent tint, not a flat neutral.
    for (const role of ["accent", "sidebar-accent"]) {
      expect(color[`${role}-foreground`]?.$value, `${role}-foreground`).toMatch(/^\{primary\.\d+\}$/);
    }
    // Sidebar-primary reuses the brand fill → on-color (white/black) foreground.
    expect(color["sidebar-primary"]?.$value).toBe("{primary.500}");
    expect(color["sidebar-primary-foreground"]?.$value).toMatch(/^\{base\.(white|black)\}$/);

    // Unpaired roles (no -foreground): border-strength input, focus ring, sidebar hairline/ring.
    expect(color["input"]?.$value).toBe("{neutral.300}");         // one step stronger than border (neutral.200)
    expect(color["ring"]?.$value).toMatch(/^\{primary\.\d+\}$/);   // a brand step
    expect(color["sidebar-border"]?.$value).toBe("{neutral.200}");
    expect(color["sidebar-ring"]?.$value).toMatch(/^\{primary\.\d+\}$/);

    // Scrim — unpaired dimming veil: a FIXED neutral-dark alias in every theme (Fix 3), NOT a foreground.
    expect(color["scrim"]?.$value).toBe("{neutral.950}");
    expect(color["scrim-foreground"], "scrim is unpaired — no foreground").toBeUndefined();

    // Data-viz palette — semantic aliases into a real chart PRIMITIVE scale (two-tier discipline).
    for (let i = 1; i <= 5; i++) {
      expect(color[`chart-${i}`]?.$value, `chart-${i}`).toBe(`{chart.${i}}`);
      expect(tokens["chart"]?.[String(i)]?.$value, `chart primitive ${i}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // chart primitives are literals (primitive tier), NOT aliases.
    expect(tokens["chart"]?.["1"]?.$type).toBe("color");
  });

  it("dark-only persona flips accent/secondary/popover/sidebar to dark-appropriate primitives", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    const dark = findPersona(records, "velvet-noir"); // colorMode: dark
    const { tokens } = expandPersona({ persona: dark, intent: "test" });
    const color = tokens["color"] ?? {};
    expect(color["secondary"]?.$value).toBe("{neutral.700}");
    expect(color["accent"]?.$value).toBe("{primary.800}");
    expect(color["popover"]?.$value).toBe("{neutral.800}");
    expect(color["sidebar"]?.$value).toBe("{neutral.800}");
    expect(color["input"]?.$value).toBe("{neutral.600}");
  });

  it("exposes pure white/black base primitives (the on-color foreground anchors)", () => {
    const { tokens } = expandPersona({ persona: liquidGlass(), intent: "test" });
    expect(tokens["base"]?.["white"]?.$value).toBe("#FFFFFF");
    expect(tokens["base"]?.["black"]?.$value).toBe("#000000");
  });

  it("dark-only persona swaps background and foreground to dark-appropriate values", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    const darkPersona = findPersona(records, "velvet-noir"); // colorMode: dark
    const { tokens } = expandPersona({ persona: darkPersona, intent: "test" });
    expect(tokens["color"]?.["background"]?.$value).toBe("{neutral.900}");
    expect(tokens["color"]?.["foreground"]?.$value).toBe("{neutral.50}");
    expect(tokens["color"]?.["card"]?.$value).toBe("{neutral.800}");
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

// ─── Ring: non-text (3:1) contrast floor, not the 4.5 text floor ───────────────

describe("expandPersona — focus ring targets the 3:1 non-text UI floor (L8)", () => {
  /** Resolve a compiled DS to a path→literal map. */
  function resolvedMap(slug: string): Map<string, string> {
    const persona = findPersona(loadPersonaIndex(PERSONAS_PATH), slug);
    const resolved = resolveTokens(expandPersona({ persona, intent: "test" }).tokens);
    return new Map(resolved.map((t) => [t.path, t.value as string]));
  }

  it("every persona's ring reaches 3:1 against its background (WCAG 1.4.11 non-text floor)", () => {
    for (const p of loadPersonaIndex(PERSONAS_PATH)) {
      const m = resolvedMap(p.slug);
      const ring = m.get("color.ring")!;
      const bg = m.get("color.background")!;
      expect(ring, `${p.slug} ring hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      // Reaches the 3:1 UI floor — a ring is a non-text affordance.
      expect(contrastRatio(ring, bg), `${p.slug} ring contrast`).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the 3:1 floor, NOT the 4.5 text floor — at least one persona's ring sits below 4.5", () => {
    // A picker anchored on the 4.5 text floor could never produce a sub-4.5 ring. That
    // some (in fact most) rings land in [3, 4.5) is proof the non-text floor is in force.
    const belowText = loadPersonaIndex(PERSONAS_PATH).filter((p) => {
      const m = resolvedMap(p.slug);
      return contrastRatio(m.get("color.ring")!, m.get("color.background")!) < 4.5;
    });
    expect(belowText.length).toBeGreaterThan(0);
  });

  it("sidebar-ring likewise reaches 3:1 against the sidebar surface", () => {
    const m = resolvedMap("saas-aurora-minimal");
    expect(contrastRatio(m.get("color.sidebar-ring")!, m.get("color.sidebar")!)).toBeGreaterThanOrEqual(3);
  });
});

// ─── Chart palette: 5 distinct, deterministic ──────────────────────────────────

describe("expandPersona — data-viz chart palette (L8)", () => {
  function chartHexes(persona: ReturnType<typeof liquidGlass>): string[] {
    const { tokens } = expandPersona({ persona, intent: "test" });
    const chart = tokens["chart"] as Record<string, { $value: string }>;
    return [1, 2, 3, 4, 5].map((i) => chart[String(i)]!.$value);
  }

  it("chart-1..5 are 5 distinct hue-rotated colors for every persona", () => {
    for (const p of loadPersonaIndex(PERSONAS_PATH)) {
      const hexes = chartHexes(p);
      expect(hexes, `${p.slug} chart`).toHaveLength(5);
      expect(new Set(hexes).size, `${p.slug} distinct charts`).toBe(5);
      for (const hex of hexes) expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("is deterministic — two compiles of the same persona yield identical chart hexes", () => {
    const persona = liquidGlass();
    expect(chartHexes(persona)).toEqual(chartHexes(persona));
  });

  it("chart-1 sits on the brand hue (seeded from the persona primary, not a fixed palette)", () => {
    // Different brand hex → different chart palette (proves derivation from the seed).
    const persona = liquidGlass();
    const a = expandPersona({ persona, intent: "t" }).tokens["chart"] as Record<string, { $value: string }>;
    const b = expandPersona({ persona, intent: "t", brandHex: "#FF0066" }).tokens["chart"] as Record<string, { $value: string }>;
    expect(a["1"]?.$value).not.toBe(b["1"]?.$value);
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

// ─── Accent foreground: on-brand tint first, guaranteed-AA neutral fallback (Fix 4) ─

describe("pickAccentFg — on-brand tint with neutral fallback", () => {
  type Cat = Record<string, { $value: string; $type: "color" }>;
  const cat = (hexes: Record<number, string>): Cat =>
    Object.fromEntries(STOPS.map((s) => [String(s), { $value: hexes[s] ?? "#808080", $type: "color" }])) as Cat;

  it("prefers the DARKEST on-brand primary step that clears AA on a light accent surface", () => {
    // Dark high stops clear on a very light accent tint; the darkest (950) wins.
    const primary = cat({ 950: "#0B0B1A", 900: "#141433", 800: "#232357", 500: "#5B5BD6", 100: "#E6E6FF" });
    const neutral = cat({ 900: "#18181B" });
    expect(pickAccentFg(primary, neutral, "#F0F0FF", [900, 950, 800])).toBe("{primary.950}");
  });

  it("falls back to the guaranteed-AA neutral pick when NO primary step clears", () => {
    const flatPrimary = cat({}); // every stop #808080 → none clears on a light accent
    const neutral = cat({ 900: "#111111", 950: "#0A0A0A" });
    expect(pickAccentFg(flatPrimary, neutral, "#DDDDDD", [900, 950, 800])).toBe("{neutral.900}");
  });

  it("every persona's accent/sidebar-accent foreground clears AA on its accent surface", () => {
    for (const p of loadPersonaIndex(PERSONAS_PATH)) {
      const resolved = resolveTokens(expandPersona({ persona: p, intent: "test" }).tokens);
      const m = new Map(resolved.map((t) => [t.path, t.value as string]));
      for (const role of ["accent", "sidebar-accent"]) {
        const fg = m.get(`color.${role}-foreground`)!;
        const surface = m.get(`color.${role}`)!;
        expect(contrastRatio(fg, surface), `${p.slug} ${role}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

// ─── Shadow tinting (regression: no pure-black shadows) ───────────────────────

describe("expandPersona — shadows are tinted, never pure black", () => {
  it("no persona emits a pure-black (#000000) shadow color", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    for (const persona of records) {
      const { tokens } = expandPersona({ persona, intent: "test" });
      const shadow = tokens["shadow"] as unknown as Record<string, { $value: { color: string } }>;
      for (const step of ["sm", "md", "lg"]) {
        const color = shadow[step]?.$value.color.toLowerCase();
        // Rubric: "tinted toward the background hue, not pure black."
        // taste-lint flags #000/#000000 — the engine must not emit them.
        expect(color, `${persona.slug} shadow.${step}`).not.toBe("#000000");
        expect(color, `${persona.slug} shadow.${step}`).not.toBe("#000");
      }
    }
  });

  it("derives shadow hue from the persona neutral (deterministic)", () => {
    const persona = liquidGlass();
    const a = expandPersona({ persona, intent: "x" }).tokens["shadow"] as unknown as Record<string, { $value: { color: string } }>;
    const b = expandPersona({ persona, intent: "x" }).tokens["shadow"] as unknown as Record<string, { $value: { color: string } }>;
    expect(a["md"]?.$value.color).toBe(b["md"]?.$value.color); // same in → same out
    expect(a["md"]?.$value.color).toMatch(/^#[0-9a-fA-F]{6}$/);  // schema-valid hex
  });
});
