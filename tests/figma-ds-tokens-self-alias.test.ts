import { describe, it, expect } from "vitest";
import { buildTokensTree } from "../src/core/figma-ds-tokens.js";
import type { DsVariable } from "../src/core/figma-ds-tokens.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";

/**
 * Dogfood F1: two distinct Figma variables that collapse to the SAME DTCG path, where one
 * aliases the other, used to emit a self-alias `{self}` that made the whole tokens file
 * unresolvable ("alias cycle detected"). buildTokensTree must drop the self-alias and keep the
 * literal sibling instead. (An own-id alias is a separate case already caught by resolveType.)
 */
describe("figma-ds-tokens — self-alias drop (F1)", () => {
  const vars: DsVariable[] = [
    // Alias var: "color/brand" → the literal below; collapses to the same path `color.brand`.
    { id: "x", name: "color/brand", type: "COLOR", value: { type: "VARIABLE_ALIAS", id: "y" } },
    // Literal var: "color/Brand" → #000000, same collapsed path `color.brand`.
    { id: "y", name: "color/Brand", type: "COLOR", value: { r: 0, g: 0, b: 0 } },
  ];

  it("keeps the literal, never emits a self-referential alias", () => {
    const { tree } = buildTokensTree(vars);
    const leaf = (tree["color"] as Record<string, { $value: unknown }>)["brand"];
    expect(leaf).toBeDefined();
    expect(leaf?.$value).toBe("#000000");
    expect(leaf?.$value).not.toBe("{color.brand}");
  });

  it("produces a tokens tree that resolves without an alias cycle", () => {
    const { tree } = buildTokensTree(vars);
    // Round-trips through the real parser+resolver the ds commands use — must not throw.
    expect(() => resolveTokens(parseTokenFile(tree))).not.toThrow();
  });

  it("an own-id self-alias yields no usable token (caught upstream, not emitted)", () => {
    const selfVars: DsVariable[] = [
      { id: "s", name: "breakpoint/2xl", type: "FLOAT", value: { type: "VARIABLE_ALIAS", id: "s" } },
      { id: "lit", name: "color/ok", type: "COLOR", value: { r: 1, g: 1, b: 1 } },
    ];
    const { tree } = buildTokensTree(selfVars);
    expect(tree["breakpoint"]).toBeUndefined(); // dropped, not emitted as `{breakpoint.2xl}`
    expect(() => resolveTokens(parseTokenFile(tree))).not.toThrow();
  });
});
