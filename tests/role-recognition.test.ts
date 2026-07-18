import { describe, expect, it } from "vitest";
import { recognizeRoles } from "../src/core/role-recognition.js";
import type { TokenTree } from "../src/core/token-model.js";

function tree(color: Record<string, { $value: string; $extensions?: Record<string, unknown> }>): TokenTree {
  const group: Record<string, { $value: string; $type: "color"; $extensions?: Record<string, unknown> }> = {};
  for (const [name, t] of Object.entries(color)) {
    group[name] = { $value: t.$value, $type: "color", ...(t.$extensions ? { $extensions: t.$extensions } : {}) };
  }
  return { color: group };
}

describe("recognizeRoles — Phase 1 contract", () => {
  it("a primitive gets no role (blue-100 literal)", () => {
    const result = recognizeRoles(tree({ "blue-100": { $value: "#DBEAFE" } }));
    expect(result.annotated.color?.["blue-100"]?.$extensions).toBeUndefined();
    expect(result.recognized).toBe(0);
    expect(result.unrecognized).toEqual([]);
  });

  it("a hue re-export gets no role (color-blue-100 alias)", () => {
    const result = recognizeRoles(
      tree({ "blue-100": { $value: "#DBEAFE" }, "color-blue-100": { $value: "{color.blue-100}" } }),
    );
    expect(result.annotated.color?.["color-blue-100"]?.$extensions).toBeUndefined();
    expect(result.recognized).toBe(0);
    expect(result.unrecognized).toEqual(["color.color-blue-100"]);
  });

  it("a semantic token is annotated with its family role (surface-content → background)", () => {
    const result = recognizeRoles(tree({ "surface-content": { $value: "{color.gray-25}" } }));
    expect(result.annotated.color?.["surface-content"]?.$extensions).toEqual({
      "design-os.role": "background",
    });
    expect(result.recognized).toBe(1);
  });

  it("a compound token carries family and position (badge-danger-bg → destructive+bg)", () => {
    const result = recognizeRoles(tree({ "badge-danger-bg": { $value: "{color.error-700}" } }));
    expect(result.annotated.color?.["badge-danger-bg"]?.$extensions).toEqual({
      "design-os.role": "destructive",
      "design-os.role-position": "bg",
    });
  });

  it("an unrecognized semantic is listed, not forced (made-up zorp-glimble alias)", () => {
    const result = recognizeRoles(tree({ "zorp-glimble": { $value: "{color.gray-500}" } }));
    expect(result.annotated.color?.["zorp-glimble"]?.$extensions).toBeUndefined();
    expect(result.unrecognized).toEqual(["color.zorp-glimble"]);
    expect(result.recognized).toBe(0);
  });

  it("names and values are byte-identical after recognition (lossless)", () => {
    const input = tree({
      "blue-100": { $value: "#DBEAFE" },
      "badge-danger-bg": { $value: "{color.error-700}" },
      "zorp-glimble": { $value: "{color.gray-500}" },
    });
    const result = recognizeRoles(input);
    const inNames = Object.keys(input.color ?? {}).sort();
    const outNames = Object.keys(result.annotated.color ?? {}).sort();
    expect(outNames).toEqual(inNames);
    for (const name of inNames) {
      expect(result.annotated.color?.[name]?.$value).toBe(input.color?.[name]?.$value);
    }
  });

  it("is idempotent on a shadcn-native name (background → background)", () => {
    const result = recognizeRoles(tree({ background: { $value: "{color.white}" } }));
    expect(result.annotated.color?.["background"]?.$extensions).toEqual({ "design-os.role": "background" });
  });

  it("preserves existing $extensions (mode.*) — merges, never overwrites", () => {
    const result = recognizeRoles(
      tree({
        "badge-light-border": {
          $value: "{color.gray-300}",
          $extensions: { "mode.dark": { $value: "{color.gray-600}" } },
        },
      }),
    );
    expect(result.annotated.color?.["badge-light-border"]?.$extensions).toEqual({
      "mode.dark": { $value: "{color.gray-600}" },
      "design-os.role": "border",
    });
  });

  it("the SCRIM TRAP: overlay/scrim never auto-maps to popover or any family", () => {
    const result = recognizeRoles(tree({ "surface-overlay": { $value: "{color.gray-950}" } }));
    expect(result.annotated.color?.["surface-overlay"]?.$extensions).toBeUndefined();
    expect(result.unrecognized).toEqual(["color.surface-overlay"]);
  });

  it("focus overrides border → ring (dictionary consequence #4: border-focus is a focus ring)", () => {
    const result = recognizeRoles(tree({ "border-focus": { $value: "{color.blue-500}" } }));
    expect(result.annotated.color?.["border-focus"]?.$extensions).toEqual({ "design-os.role": "ring" });
  });

  it("a domain-prefixed bare -bg/-border with no family keyword stays unrecognized (citation-bg, the dictionary's own cited example)", () => {
    const result = recognizeRoles(tree({ "citation-bg": { $value: "{color.surface-content-hover}" } }));
    expect(result.annotated.color?.["citation-bg"]?.$extensions).toBeUndefined();
    expect(result.unrecognized).toEqual(["color.citation-bg"]);
  });

  it("gaps = canonical roles with zero recognized tokens", () => {
    const result = recognizeRoles(tree({ "badge-danger-bg": { $value: "{color.error-700}" } }));
    expect(result.gaps).toContain("card");
    expect(result.gaps).toContain("popover");
    expect(result.gaps).not.toContain("destructive");
  });
});

// ─── LIVE (Art III) — dana's real design.tokens.json ───────────────────────────
// Path is the onboard-all scratchpad fixture used across spec 011's research.
// Kept as a conditional describe so the suite stays green on machines without
// the scratchpad fixture (Art III: real data before "done", not a hard fixture
// dependency baked into CI).

import { readFileSync, existsSync } from "node:fs";
import { parseTokenFile } from "../src/core/token-model.js";

const DANA_PATH =
  "/private/tmp/claude-501/-Users-jang-Products-ease-design/7771253a-22c4-494f-bfbc-7432719ee8c1/scratchpad/onboard-all/dana-desktop/design/design.tokens.json";

describe.skipIf(!existsSync(DANA_PATH))("recognizeRoles — LIVE on dana's real tokens", () => {
  it("recognizes dana's real semantic tokens without renaming or dropping any", () => {
    const raw = JSON.parse(readFileSync(DANA_PATH, "utf-8"));
    const parsedTree = parseTokenFile(raw);
    const result = recognizeRoles(parsedTree);

    // Lossless: every input token present in the output, byte-identical $value.
    for (const [cat, group] of Object.entries(parsedTree)) {
      for (const [name, token] of Object.entries(group)) {
        expect(result.annotated[cat]?.[name]?.$value).toBe(token.$value);
      }
    }
    // Real, non-trivial recognition happened.
    expect(result.recognized).toBeGreaterThan(50);
    expect(result.unrecognized.length).toBeGreaterThan(0);
  });

  it("surface-content and surface-chrome — the flagged ambiguous case (report only, no strict assertion)", () => {
    const raw = JSON.parse(readFileSync(DANA_PATH, "utf-8"));
    const result = recognizeRoles(parseTokenFile(raw));
    // surface-content is a LITERAL in dana's real file (#FFFFFF) — a primitive,
    // so it correctly gets no role under the primitive/alias split, even though
    // it plays the background role by convention. See p1-recognition-core.md.
    // (Its real $extensions already carries dana's own mode.classic/mode.dark —
    // must stay untouched, no "design-os.role" key added.)
    expect(result.annotated.color?.["surface-content"]?.$extensions).not.toHaveProperty("design-os.role");
    // surface-chrome IS an alias ({color.gray-900}) but has no single-word
    // reduction (surface + chrome) — correctly falls to unrecognized rather
    // than a forced guess. See p1-recognition-core.md. (Its real $extensions
    // already carries dana's own mode.classic/mode.dark — must stay untouched,
    // no "design-os.role" key added.)
    expect(result.annotated.color?.["surface-chrome"]?.$extensions).not.toHaveProperty("design-os.role");
  });
});
