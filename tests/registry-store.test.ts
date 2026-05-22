import { describe, expect, it, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync, writeFileSync } from "node:fs";
import {
  validateComponentRecord,
  createEmptyRegistry,
  loadRegistry,
  saveRegistry,
  registerComponent,
  lookupComponent,
  listComponents,
  RegistryError,
} from "../src/core/registry-store.js";
import type { ComponentRecord, Registry } from "../src/core/registry-store.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function tmpPath(): string {
  return join(tmpdir(), `registry-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

const tmpFiles: string[] = [];
function registerTmp(p: string): string {
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  for (const p of tmpFiles) {
    if (existsSync(p)) unlinkSync(p);
  }
  tmpFiles.length = 0;
});

function validRecord(overrides: Partial<ComponentRecord> = {}): ComponentRecord {
  return {
    name: "Button/Primary",
    category: "action",
    markup: "<button>Click</button>",
    tokensUsed: ["color.primary", "space.4"],
    ...overrides,
  };
}

// ─── validateComponentRecord ──────────────────────────────────────────────────

describe("validateComponentRecord", () => {
  it("accepts a valid minimal record", () => {
    const rec = validateComponentRecord(validRecord());
    expect(rec.name).toBe("Button/Primary");
    expect(rec.tokensUsed).toEqual(["color.primary", "space.4"]);
  });

  it("accepts a record with all optional fields", () => {
    const rec = validateComponentRecord({
      name: "Card/Pricing",
      category: "layout",
      markup: "<div>card</div>",
      tokensUsed: ["color.surface"],
      variants: ["default", "highlighted"],
      states: ["default", "hover"],
      description: "A pricing card",
    });
    expect(rec.variants).toEqual(["default", "highlighted"]);
    expect(rec.states).toEqual(["default", "hover"]);
    expect(rec.description).toBe("A pricing card");
  });

  it("throws BAD_NAME for lowercase category name", () => {
    expect(() => validateComponentRecord(validRecord({ name: "button/primary" }))).toThrow(
      expect.objectContaining({ code: "BAD_NAME" }),
    );
  });

  it("throws BAD_NAME for name without slash", () => {
    expect(() => validateComponentRecord(validRecord({ name: "ButtonPrimary" }))).toThrow(
      expect.objectContaining({ code: "BAD_NAME" }),
    );
  });

  it("throws BAD_NAME for name with digits", () => {
    expect(() => validateComponentRecord(validRecord({ name: "Button2/Primary" }))).toThrow(
      expect.objectContaining({ code: "BAD_NAME" }),
    );
  });

  it("throws BAD_TOKEN for token path that starts with uppercase", () => {
    expect(() =>
      validateComponentRecord(validRecord({ tokensUsed: ["Color.primary"] })),
    ).toThrow(expect.objectContaining({ code: "BAD_TOKEN" }));
  });

  it("throws BAD_TOKEN for token path with spaces", () => {
    expect(() =>
      validateComponentRecord(validRecord({ tokensUsed: ["color primary"] })),
    ).toThrow(expect.objectContaining({ code: "BAD_TOKEN" }));
  });

  it("throws BAD_STATE for an invalid state value", () => {
    expect(() =>
      validateComponentRecord(validRecord({ states: ["default", "clicked" as never] })),
    ).toThrow(expect.objectContaining({ code: "BAD_STATE" }));
  });

  it("throws BAD_ARG when name is missing", () => {
    expect(() => validateComponentRecord({ category: "action", markup: "", tokensUsed: [] })).toThrow(
      expect.objectContaining({ code: "BAD_ARG" }),
    );
  });

  it("throws BAD_REGISTRY for component with extra key not in schema", () => {
    // additionalProperties: false — unknown keys must be rejected.
    expect(() =>
      validateComponentRecord({ ...validRecord(), extraField: "not-allowed" }),
    ).toThrow(expect.objectContaining({ code: "BAD_REGISTRY" }));
  });
});

// ─── createEmptyRegistry ──────────────────────────────────────────────────────

describe("createEmptyRegistry", () => {
  it("returns version 0.1.0 with empty components array", () => {
    const reg = createEmptyRegistry();
    expect(reg.version).toBe("0.1.0");
    expect(reg.components).toEqual([]);
  });
});

// ─── saveRegistry / loadRegistry round-trip ───────────────────────────────────

describe("saveRegistry + loadRegistry", () => {
  it("round-trips a registry through disk", () => {
    const path = registerTmp(tmpPath());
    const reg: Registry = {
      version: "0.1.0",
      components: [validRecord()],
    };
    saveRegistry(path, reg);
    const loaded = loadRegistry(path);
    expect(loaded.version).toBe("0.1.0");
    expect(loaded.components).toHaveLength(1);
    expect(loaded.components[0]?.name).toBe("Button/Primary");
  });

  it("sorts components by name on write", () => {
    const path = registerTmp(tmpPath());
    const reg: Registry = {
      version: "0.1.0",
      components: [
        validRecord({ name: "Card/Pricing" }),
        validRecord({ name: "Button/Primary" }),
      ],
    };
    saveRegistry(path, reg);
    const loaded = loadRegistry(path);
    expect(loaded.components[0]?.name).toBe("Button/Primary");
    expect(loaded.components[1]?.name).toBe("Card/Pricing");
  });

  it("throws REGISTRY_NOT_FOUND for missing file", () => {
    expect(() => loadRegistry("/nonexistent-registry-xyz.json")).toThrow(
      expect.objectContaining({ code: "REGISTRY_NOT_FOUND" }),
    );
  });

  it("throws BAD_REGISTRY when root object has extra keys (additionalProperties:false)", () => {
    const path = registerTmp(tmpPath());
    writeFileSync(
      path,
      JSON.stringify({ version: "0.1.0", components: [], unknownKey: true }, null, 2),
      "utf8",
    );
    expect(() => loadRegistry(path)).toThrow(expect.objectContaining({ code: "BAD_REGISTRY" }));
  });
});

// ─── registerComponent ────────────────────────────────────────────────────────

describe("registerComponent", () => {
  it("appends a new component to the registry", () => {
    const reg = createEmptyRegistry();
    const { registry, replaced } = registerComponent(reg, validRecord(), false);
    expect(registry.components).toHaveLength(1);
    expect(replaced).toBe(false);
  });

  it("throws NAME_EXISTS when name exists without force", () => {
    const reg = createEmptyRegistry();
    const { registry } = registerComponent(reg, validRecord(), false);
    expect(() => registerComponent(registry, validRecord(), false)).toThrow(
      expect.objectContaining({ code: "NAME_EXISTS" }),
    );
  });

  it("replaces existing component when force is true", () => {
    const reg = createEmptyRegistry();
    const { registry: reg1 } = registerComponent(reg, validRecord(), false);
    const updated = validRecord({ description: "Updated" });
    const { registry: reg2, replaced } = registerComponent(reg1, updated, true);
    expect(replaced).toBe(true);
    expect(reg2.components).toHaveLength(1);
    expect(reg2.components[0]?.description).toBe("Updated");
  });

  it("replacement preserves array position", () => {
    const reg = createEmptyRegistry();
    const { registry: r1 } = registerComponent(reg, validRecord({ name: "Card/Pricing" }), false);
    const { registry: r2 } = registerComponent(r1, validRecord({ name: "Button/Primary" }), false);
    const { registry: r3 } = registerComponent(
      r2,
      validRecord({ name: "Card/Pricing", description: "Updated" }),
      true,
    );
    expect(r3.components.findIndex((c) => c.name === "Card/Pricing")).toBe(0);
  });
});

// ─── lookupComponent ──────────────────────────────────────────────────────────

describe("lookupComponent", () => {
  it("finds an existing component by exact name", () => {
    const reg: Registry = { version: "0.1.0", components: [validRecord()] };
    const result = lookupComponent(reg, "Button/Primary");
    expect(result?.name).toBe("Button/Primary");
  });

  it("returns undefined for an absent name", () => {
    const reg = createEmptyRegistry();
    expect(lookupComponent(reg, "Nope/Thing")).toBeUndefined();
  });
});

// ─── listComponents ───────────────────────────────────────────────────────────

describe("listComponents", () => {
  const reg: Registry = {
    version: "0.1.0",
    components: [
      validRecord({ name: "Button/Primary", category: "action" }),
      validRecord({ name: "Button/Ghost",   category: "action" }),
      validRecord({ name: "Card/Pricing",   category: "layout" }),
    ],
  };

  it("returns all components when no category filter", () => {
    expect(listComponents(reg)).toHaveLength(3);
  });

  it("filters by category", () => {
    const result = listComponents(reg, "action");
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.category === "action")).toBe(true);
  });

  it("returns empty array for unknown category", () => {
    expect(listComponents(reg, "nonexistent")).toHaveLength(0);
  });

  it("does not mutate the original registry", () => {
    listComponents(reg, "action");
    expect(reg.components).toHaveLength(3);
  });
});

// ─── RegistryError shape ──────────────────────────────────────────────────────

describe("RegistryError", () => {
  it("exposes code and message", () => {
    const err = new RegistryError("BAD_NAME", "test message");
    expect(err.code).toBe("BAD_NAME");
    expect(err.message).toBe("test message");
    expect(err instanceof Error).toBe(true);
  });
});
