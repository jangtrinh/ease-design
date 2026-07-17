/**
 * `ingestCssTokens` — CSS custom properties → DTCG tree + modes (D4, spec 009 P3).
 * Test names match the phase file verbatim (phase-03-the-vocabulary.md).
 */
import { describe, expect, it } from "vitest";
import { ingestCssTokens, CssTokenIngestError } from "../src/core/css-token-ingest.js";
import type { CustomPropertyObservation } from "../src/core/designmd-token-extractor.js";

function cp(name: string, value: string, selector: string, source = "a.css:L1", hex?: string): CustomPropertyObservation {
  const out: CustomPropertyObservation = { name, value, sources: [source], selectors: [selector] };
  if (hex !== undefined) out.hex = hex;
  return out;
}

describe("test_a_literal_becomes_a_primitive_and_an_alias_becomes_a_semantic", () => {
  it("a literal hex is a primitive; a var() alias is a semantic {category.token}", () => {
    const { tree, stats } = ingestCssTokens([
      cp("--gray-900", "#181818", ":root"),
      cp("--color-text-primary", "var(--gray-900)", ":root"),
    ]);
    expect(tree.color?.["gray-900"]).toEqual({ $value: "#181818", $type: "color" });
    expect(tree.color?.["text-primary"]?.$value).toBe("{color.gray-900}");
    expect(stats.primitives).toBe(1);
    expect(stats.semantics).toBe(1);
  });
});

describe("test_four_theme_values_of_one_name_become_base_plus_three_modes", () => {
  it("the --color-gray-900 shape from Insight 2/3: base @theme + 3 [data-theme] modes", () => {
    // Named --surface-content (not --color-gray-900) to keep this test independent of the
    // D6 collision case (--gray-900 vs --color-gray-900), which is its own test below.
    const { tree } = ingestCssTokens([
      cp("--surface-content", "#0c1220", "@theme", "index.css:L31"),
      cp("--surface-content", "#0c1220", '[data-theme="classic"]', "index.css:L321"),
      cp("--surface-content", "#FBFBFB", '[data-theme="light"]', "index.css:L358"),
      cp("--surface-content", "#0F0F0F", '[data-theme="dark"]', "index.css:L399"),
    ]);
    const leaf = tree.color?.["surface-content"];
    expect(leaf?.$value).toBe("#0c1220"); // base = @theme's value
    expect(leaf?.$extensions).toEqual({
      "mode.classic": { $value: "#0c1220" },
      "mode.light": { $value: "#FBFBFB" },
      "mode.dark": { $value: "#0F0F0F" },
    });
  });
});

describe("test_a_token_declared_only_under_a_theme_has_no_base_and_is_listed_unverified", () => {
  it("a mode-only declaration is not promoted to base", () => {
    const { tree, unverified } = ingestCssTokens([
      cp("--surface-danger", "#ff0000", '[data-theme="dark"]'),
    ]);
    expect(tree.color?.["surface-danger"]).toBeUndefined();
    expect(unverified.some((u) => u.name === "--surface-danger" && /mode/.test(u.reason))).toBe(true);
  });
});

describe("test_a_redundant_category_prefix_is_stripped_once", () => {
  it("--color-gray-900 strips the leading 'color-' once; --gray-900 needs no strip", () => {
    const { tree } = ingestCssTokens([cp("--gray-900", "#181818", ":root")]);
    expect(Object.keys(tree.color ?? {})).toContain("gray-900");
    expect(Object.keys(tree.color ?? {})).not.toContain("color-gray-900");
  });
});

describe("test_a_leaf_name_collision_fails_loudly_with_both_source_lines", () => {
  it("--gray-900 and --color-gray-900 both strip to color.gray-900 — dana has this", () => {
    let error: unknown;
    try {
      ingestCssTokens([
        cp("--gray-900", "#181818", ":root", "dana-tokens.css:L10"),
        cp("--color-gray-900", "var(--gray-900)", "@theme", "index.css:L31"),
      ]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CssTokenIngestError);
    const err = error as CssTokenIngestError;
    expect(err.code).toBe("LEAF_COLLISION");
    expect(err.message).toContain("dana-tokens.css:L10");
    expect(err.message).toContain("index.css:L31");
    expect(err.message).toContain("color.gray-900");
  });
});

describe("test_emitted_group_names_match_the_registry_token_pattern", () => {
  it("category and leaf are always lowercase-kebab (^[a-z][a-z0-9.-]*$)", () => {
    const { tree } = ingestCssTokens([
      cp("--FONT-Family-Body", "Inter", ":root"),
      cp("--space-2", "8px", ":root"),
    ]);
    const pattern = /^[a-z][a-z0-9.-]*$/;
    for (const [category, group] of Object.entries(tree)) {
      expect(pattern.test(category)).toBe(true);
      for (const leaf of Object.keys(group)) expect(pattern.test(leaf)).toBe(true);
    }
  });
});

describe("test_an_unmappable_selector_is_skipped_and_listed_not_silently_dropped", () => {
  it("a declaration under an unrecognised selector is recorded, not dropped without a trace", () => {
    const { tree, unverified } = ingestCssTokens([
      cp("--hover-glow", "#ffcc00", ".some-hover-state"),
    ]);
    expect(tree.color?.["hover-glow"]).toBeUndefined();
    expect(unverified.some((u) => u.name === "--hover-glow" && /unrecognized selector/.test(u.reason))).toBe(true);
  });

  it("an unmapped selector alongside a valid base still reports the unmapped one", () => {
    const { tree, unverified } = ingestCssTokens([
      cp("--brand", "#f97316", ":root"),
      cp("--brand", "#f97316", ".legacy-override"),
    ]);
    expect(tree.color?.brand).toBeDefined();
    expect(unverified.some((u) => u.name === "--brand" && /unrecognized selector/.test(u.reason))).toBe(true);
  });
});

describe("ingestCssTokens — compound comma-separated selector list (real dana shape)", () => {
  it("one declaration under a 3-way selector list becomes 2 distinct modes (dark de-duplicated)", () => {
    const { tree } = ingestCssTokens([
      cp("--gray-900", "#181818", ":root"),
      cp("--surface-content", "#e5e5e5", ":root"),
      cp("--surface-content", "var(--gray-900)", '[data-theme="dark"],\n[data-theme="classic"],\n.dark'),
    ]);
    const ext = tree.color?.["surface-content"]?.$extensions;
    expect(ext).toBeDefined();
    expect(Object.keys(ext ?? {}).sort()).toEqual(["mode.classic", "mode.dark"]);
  });
});

describe("ingestCssTokens — composite/unmappable values are recorded, not dropped", () => {
  it("a shadow composite value skips with a reason", () => {
    const { tree, stats, unverified } = ingestCssTokens([
      cp("--shadow-sm", "0 1px 2px rgba(0,0,0,.05)", ":root"),
    ]);
    expect(tree.shadow?.sm).toBeUndefined();
    expect(stats.skipped).toBe(1);
    expect(unverified.some((u) => u.name === "--shadow-sm")).toBe(true);
  });
});
