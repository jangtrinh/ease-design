/**
 * registry-token-check.ts — the existence half of BAD_TOKEN (spec 009 P4 owner-correction).
 * Pure unit tests over an in-memory TokenTree; no filesystem, no CLI.
 */
import { describe, expect, it } from "vitest";
import { tokenExistsInTree, assertTokensExist } from "../src/core/registry-token-check.js";
import { RegistryError } from "../src/core/registry-store.js";
import type { TokenTree } from "../src/core/token-model.js";

const TREE: TokenTree = {
  color: {
    primary: { $value: "#000000", $type: "color" },
    "accent-strong": { $value: "{color.primary}", $type: "color" },
  },
  dimension: {
    "text-caption": { $value: "12px", $type: "dimension" },
  },
};

describe("tokenExistsInTree", () => {
  it("true for a real category.name path", () => {
    expect(tokenExistsInTree(TREE, "color.primary")).toBe(true);
    expect(tokenExistsInTree(TREE, "color.accent-strong")).toBe(true);
    expect(tokenExistsInTree(TREE, "dimension.text-caption")).toBe(true);
  });

  it("false for a well-formed path that does not resolve", () => {
    expect(tokenExistsInTree(TREE, "color.this-token-does-not-exist-anywhere")).toBe(false);
    expect(tokenExistsInTree(TREE, "shadow.card")).toBe(false);
  });

  it("false for a path with no dot at all (structurally can't resolve)", () => {
    expect(tokenExistsInTree(TREE, "color")).toBe(false);
  });
});

describe("assertTokensExist", () => {
  it("no-op (does not throw) when tokens is undefined — the standalone-registry case", () => {
    expect(() =>
      assertTokensExist(["color.anything-invented"], undefined),
    ).not.toThrow();
  });

  it("does not throw when every path resolves", () => {
    expect(() =>
      assertTokensExist(["color.primary", "dimension.text-caption"], TREE),
    ).not.toThrow();
  });

  it("throws RegistryError('BAD_TOKEN') naming the first unresolved path, message says 'does not exist'", () => {
    try {
      assertTokensExist(["color.primary", "color.invented-one"], TREE);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RegistryError);
      expect((e as RegistryError).code).toBe("BAD_TOKEN");
      expect((e as RegistryError).message).toContain("color.invented-one");
      expect((e as RegistryError).message).toMatch(/does not exist/);
    }
  });
});
