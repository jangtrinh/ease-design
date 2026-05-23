import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { canonicalStringify, canonicalHash, validateManifestShape, newManifest } from "../src/core/ds-manifest.js";
import {
  discoverDesignSystem,
  loadDesignSystem,
  pathsForDir,
  countTokens,
  DSError,
} from "../src/core/design-system.js";
import { DSManifestError } from "../src/core/ds-manifest.js";
import { saveManifest } from "../src/core/ds-manifest.js";
import { saveRegistry, createEmptyRegistry } from "../src/core/registry-store.js";

// ─── canonicalStringify ───────────────────────────────────────────────────────

describe("canonicalStringify", () => {
  it("produces sorted keys", () => {
    const result = canonicalStringify({ z: 1, a: 2, m: 3 });
    const parsed = JSON.parse(result) as Record<string, number>;
    expect(Object.keys(parsed)).toEqual(["a", "m", "z"]);
  });

  it("uses 2-space indent", () => {
    const result = canonicalStringify({ a: 1 });
    expect(result).toContain("  ");
  });

  it("has a trailing newline", () => {
    const result = canonicalStringify({ a: 1 });
    expect(result.endsWith("\n")).toBe(true);
  });

  it("preserves array order", () => {
    const result = canonicalStringify({ arr: [3, 1, 2] });
    const parsed = JSON.parse(result) as { arr: number[] };
    expect(parsed.arr).toEqual([3, 1, 2]);
  });

  it("sorts nested object keys recursively", () => {
    const result = canonicalStringify({ b: { z: 1, a: 2 }, a: 0 });
    const parsed = JSON.parse(result) as { b: Record<string, number>; a: number };
    expect(Object.keys(parsed)).toEqual(["a", "b"]);
    expect(Object.keys(parsed.b)).toEqual(["a", "z"]);
  });
});

// ─── canonicalHash ────────────────────────────────────────────────────────────

describe("canonicalHash", () => {
  it("is deterministic: same input → same hash", () => {
    const h1 = canonicalHash({ a: 1, b: 2 });
    const h2 = canonicalHash({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it("is key-order insensitive: reordered keys → same hash", () => {
    const h1 = canonicalHash({ a: 1, b: 2 });
    const h2 = canonicalHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it("is value-sensitive: changing one value → different hash", () => {
    const h1 = canonicalHash({ a: 1 });
    const h2 = canonicalHash({ a: 2 });
    expect(h1).not.toBe(h2);
  });

  it("starts with sha256-", () => {
    expect(canonicalHash({ x: 1 })).toMatch(/^sha256-/);
  });

  it("contains only base64url chars after prefix", () => {
    const hash = canonicalHash({ x: 1 });
    expect(hash).toMatch(/^sha256-[A-Za-z0-9_-]+$/);
  });
});

// ─── validateManifestShape ────────────────────────────────────────────────────

describe("validateManifestShape", () => {
  function validManifest() {
    return {
      name: "test-ds",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      persona: { slug: "liquid-glass", family: "material-surface" },
      intent: "test",
      compiledHash: "sha256-abc123",
      registryHash: "sha256-def456",
      generation: 1,
      changelog: [],
    };
  }

  it("accepts a valid manifest", () => {
    const m = validateManifestShape(validManifest());
    expect(m.name).toBe("test-ds");
    expect(m.generation).toBe(1);
  });

  it("rejects missing generation", () => {
    const m = validManifest();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (m as any).generation;
    expect(() => validateManifestShape(m)).toThrow(DSManifestError);
  });

  it("rejects bad hash prefix", () => {
    const m = { ...validManifest(), compiledHash: "md5-abc" };
    expect(() => validateManifestShape(m)).toThrow(DSManifestError);
  });

  it("rejects extra root key", () => {
    const m = { ...validManifest(), unexpected: true };
    expect(() => validateManifestShape(m)).toThrow(DSManifestError);
  });

  it("rejects generation below 1", () => {
    const m = { ...validManifest(), generation: 0 };
    expect(() => validateManifestShape(m)).toThrow(DSManifestError);
  });
});

// ─── loadDesignSystem round-trip ─────────────────────────────────────────────

function makeTmpDs() {
  const tmp = mkdtempSync(join(tmpdir(), "ease-ds-test-"));
  const designDir = join(tmp, "design");
  mkdirSync(designDir, { recursive: true });
  return { tmp, designDir };
}

describe("loadDesignSystem", () => {
  it("round-trip: write three valid files → load → correct shape", () => {
    const { designDir } = makeTmpDs();
    const paths = pathsForDir(designDir);

    const tokens = {
      color: {
        primary: { $value: "#3B82F6", $type: "color" },
      },
    };
    const registry = createEmptyRegistry();

    writeFileSync(paths.tokens, canonicalStringify(tokens));
    saveRegistry(paths.registry, registry);

    const compiledHash = canonicalHash(tokens);
    const registryHash = canonicalHash(registry);
    const manifest = newManifest({
      name: "test",
      persona: { slug: "liquid-glass", family: "material-surface" },
      intent: "testing",
      compiledHash,
      registryHash,
    });
    saveManifest(paths.manifest, manifest);

    const ds = loadDesignSystem(paths);
    expect(ds.manifest.name).toBe("test");
    expect(ds.manifest.generation).toBe(1);
    expect(ds.tokens["color"]?.["primary"]?.$value).toBe("#3B82F6");
    expect(ds.registry.components).toHaveLength(0);
  });

  it("throws DS_NOT_FOUND when manifest is absent (MANIFEST_NOT_FOUND remapped)", () => {
    const { designDir } = makeTmpDs();
    const paths = pathsForDir(designDir);
    // No manifest written — loadManifest will throw MANIFEST_NOT_FOUND internally
    expect(() => loadDesignSystem(paths)).toThrow(DSError);
    try {
      loadDesignSystem(paths);
    } catch (e) {
      expect(e instanceof DSError && e.code).toBe("DS_NOT_FOUND");
    }
  });

  it("propagates READ_ERROR from manifest as DSManifestError, not DS_NOT_FOUND", () => {
    const { designDir } = makeTmpDs();
    const paths = pathsForDir(designDir);
    // Create a directory at the manifest path — causes EISDIR on read (not ENOENT)
    mkdirSync(paths.manifest, { recursive: true });
    let caught: unknown;
    try {
      loadDesignSystem(paths);
    } catch (e) {
      caught = e;
    }
    // Must NOT be a DSError(DS_NOT_FOUND) — must be a DSManifestError propagated as-is
    expect(caught instanceof DSError && (caught as DSError).code === "DS_NOT_FOUND").toBe(false);
    expect(caught instanceof DSManifestError).toBe(true);
    expect((caught as DSManifestError).code).toBe("READ_ERROR");
  });

  it("throws DS_TAMPERED when tokens file is hand-edited", () => {
    const { designDir } = makeTmpDs();
    const paths = pathsForDir(designDir);

    const tokens = { color: { primary: { $value: "#3B82F6", $type: "color" } } };
    const registry = createEmptyRegistry();

    writeFileSync(paths.tokens, canonicalStringify(tokens));
    saveRegistry(paths.registry, registry);

    const compiledHash = canonicalHash(tokens);
    const registryHash = canonicalHash(registry);
    const manifest = newManifest({
      name: "test",
      persona: { slug: "liquid-glass", family: "material-surface" },
      intent: "testing",
      compiledHash,
      registryHash,
    });
    saveManifest(paths.manifest, manifest);

    // Tamper: write different content to the tokens file
    writeFileSync(paths.tokens, JSON.stringify({ color: { primary: { $value: "#FF0000", $type: "color" } } }) + "\n");

    expect(() => loadDesignSystem(paths)).toThrow(DSError);
    try {
      loadDesignSystem(paths);
    } catch (e) {
      expect(e instanceof DSError && e.code).toBe("DS_TAMPERED");
    }
  });
});

// ─── discoverDesignSystem ─────────────────────────────────────────────────────

describe("discoverDesignSystem", () => {
  it("finds ds.manifest.json in the given directory", () => {
    const { tmp, designDir } = makeTmpDs();
    const paths = pathsForDir(designDir);
    const tokens = { color: { primary: { $value: "#000000", $type: "color" } } };
    const registry = createEmptyRegistry();
    writeFileSync(paths.tokens, canonicalStringify(tokens));
    saveRegistry(paths.registry, registry);
    const manifest = newManifest({
      name: "test",
      persona: { slug: "liquid-glass", family: "material-surface" },
      intent: "test",
      compiledHash: canonicalHash(tokens),
      registryHash: canonicalHash(registry),
    });
    saveManifest(paths.manifest, manifest);

    const found = discoverDesignSystem(tmp);
    expect(found.manifest).toBe(paths.manifest);
  });

  it("throws DS_NOT_FOUND when no manifest exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-empty-"));
    expect(() => discoverDesignSystem(tmp)).toThrow(DSError);
    try {
      discoverDesignSystem(tmp);
    } catch (e) {
      expect(e instanceof DSError && e.code).toBe("DS_NOT_FOUND");
    }
    rmSync(tmp, { recursive: true });
  });

  it("stops at .git boundary", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-git-"));
    // Create a .git at root to act as boundary
    mkdirSync(join(tmp, ".git"));
    // No design/ds.manifest.json anywhere
    expect(() => discoverDesignSystem(join(tmp, "sub", "dir"))).toThrow(DSError);
    rmSync(tmp, { recursive: true });
  });
});

// ─── countTokens ─────────────────────────────────────────────────────────────

describe("countTokens", () => {
  it("counts all token leaves across all categories", () => {
    const tree = {
      color: { primary: { $value: "#000", $type: "color" as const }, secondary: { $value: "#fff", $type: "color" as const } },
      space: { "4": { $value: "16px", $type: "dimension" as const } },
    };
    expect(countTokens(tree)).toBe(3);
  });
});
