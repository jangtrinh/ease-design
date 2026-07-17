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
  statesToVariants,
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

  // validateComponentRecord is a pure function with no DS access — it can only ever check
  // --tokens FORMAT (spec 009 P4 real-data finding, reports/p4-real-data-gate.md §3, fixed
  // by the owner in the same phase: registry.ts now ALSO calls
  // registry-token-check.ts's assertTokensExist against the loaded DS before saving —
  // see tests/cmd-registry.test.ts's "sealed DS integration" describe block for that half).
  // This test pins that this function's job stops at format, by design — it is not the gap.
  it("accepts a syntactically valid token path regardless of whether it resolves anywhere (format-only, by design — see registry-token-check.ts for the existence half)", () => {
    const rec = validateComponentRecord(
      validRecord({ tokensUsed: ["color.this-token-does-not-exist-anywhere"] }),
    );
    expect(rec.tokensUsed).toEqual(["color.this-token-does-not-exist-anywhere"]);
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

  // ─── lifecycle status (P4) ───────────────────────────────────────────────

  it("accepts each valid lifecycle status and preserves it on the returned record", () => {
    for (const status of ["draft", "beta", "stable"] as const) {
      const rec = validateComponentRecord(validRecord({ status }));
      expect(rec.status).toBe(status);
    }
  });

  it("throws BAD_ARG for an invalid status string", () => {
    expect(() =>
      validateComponentRecord(validRecord({ status: "experimental" as never })),
    ).toThrow(
      expect.objectContaining({
        code: "BAD_ARG",
        message: expect.stringMatching(/component\.status must be one of/),
      }),
    );
  });

  it("throws BAD_ARG when status is not a string", () => {
    expect(() => validateComponentRecord(validRecord({ status: 1 as never }))).toThrow(
      expect.objectContaining({
        code: "BAD_ARG",
        message: expect.stringMatching(/component\.status must be one of/),
      }),
    );
  });

  // ─── scope + deprecated (spec 004 D3) ────────────────────────────────────

  it("accepts each valid scope and preserves it on the returned record", () => {
    for (const scope of ["local", "global"] as const) {
      const rec = validateComponentRecord(validRecord({ scope }));
      expect(rec.scope).toBe(scope);
    }
  });

  it("defaults a missing scope to 'local' (migration)", () => {
    // validRecord() carries no scope — the returned record must still have one.
    const rec = validateComponentRecord({
      name: "Button/Primary",
      category: "action",
      markup: "<button>Click</button>",
      tokensUsed: ["color.primary"],
    });
    expect(rec.scope).toBe("local");
  });

  it("throws BAD_ARG for an invalid scope value", () => {
    expect(() => validateComponentRecord(validRecord({ scope: "team" as never }))).toThrow(
      expect.objectContaining({
        code: "BAD_ARG",
        message: expect.stringMatching(/component\.scope must be one of/),
      }),
    );
  });

  it("accepts deprecated:true and preserves it; absent stays absent", () => {
    const dep = validateComponentRecord(validRecord({ deprecated: true }));
    expect(dep.deprecated).toBe(true);
    const active = validateComponentRecord(validRecord());
    expect(active.deprecated).toBeUndefined();
  });

  it("throws BAD_ARG when deprecated is not a boolean", () => {
    expect(() => validateComponentRecord(validRecord({ deprecated: "yes" as never }))).toThrow(
      expect.objectContaining({
        code: "BAD_ARG",
        message: expect.stringMatching(/component\.deprecated must be a boolean/),
      }),
    );
  });

  it("still rejects an unknown key now that scope/deprecated are allowed", () => {
    expect(() =>
      validateComponentRecord({ ...validRecord({ scope: "global", deprecated: true }), bogus: 1 }),
    ).toThrow(expect.objectContaining({ code: "BAD_REGISTRY" }));
  });

  // ─── figmaNode sidecar pointer (spec 005 P3) ─────────────────────────────

  it("accepts a figmaNode pointer and preserves it on the returned record", () => {
    const rec = validateComponentRecord(
      validRecord({ figmaNode: "components/button-primary.figma.json" }),
    );
    expect(rec.figmaNode).toBe("components/button-primary.figma.json");
  });

  it("leaves figmaNode absent for a record with no sidecar (no migration default)", () => {
    // A pre-005 record must load unchanged — no mirror captured is a valid state.
    const rec = validateComponentRecord(validRecord());
    expect(rec.figmaNode).toBeUndefined();
    expect("figmaNode" in rec).toBe(false);
  });

  it("rejects a figmaNode pointer that escapes the design dir", () => {
    for (const bad of [
      "/etc/passwd.figma.json",
      "../../secrets.figma.json",
      "components/../../x.figma.json",
      "C:\\windows\\x.figma.json",
    ]) {
      expect(() => validateComponentRecord(validRecord({ figmaNode: bad }))).toThrow(
        expect.objectContaining({ code: "BAD_ARG" }),
      );
    }
  });

  it("rejects a figmaNode pointer that is not a .figma.json sidecar", () => {
    expect(() => validateComponentRecord(validRecord({ figmaNode: "components/button.json" }))).toThrow(
      expect.objectContaining({
        code: "BAD_ARG",
        message: expect.stringMatching(/must point at a '\.figma\.json' sidecar/),
      }),
    );
  });

  it("throws BAD_ARG when figmaNode is not a non-empty string", () => {
    for (const bad of ["", 42 as never, null as never]) {
      expect(() => validateComponentRecord(validRecord({ figmaNode: bad }))).toThrow(
        expect.objectContaining({ code: "BAD_ARG" }),
      );
    }
  });

  it("keeps markup untouched alongside a figmaNode pointer (the two halves are orthogonal)", () => {
    const rec = validateComponentRecord(
      validRecord({ markup: "<button>Click</button>", figmaNode: "components/button-primary.figma.json" }),
    );
    expect(rec.markup).toBe("<button>Click</button>");
    expect(rec.figmaNode).toBe("components/button-primary.figma.json");
  });

  it("still rejects an unknown key now that figmaNode is allowed", () => {
    expect(() =>
      validateComponentRecord({
        ...validRecord({ figmaNode: "components/button-primary.figma.json" }),
        bogus: 1,
      }),
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

  it("migrates a pre-scope registry file to scope 'local' on load (spec 004)", () => {
    const path = registerTmp(tmpPath());
    // Simulate a registry written before `scope` existed — the record has no scope key.
    writeFileSync(
      path,
      JSON.stringify(
        {
          version: "0.1.0",
          components: [
            {
              name: "Button/Primary",
              category: "action",
              markup: "<button>Click</button>",
              tokensUsed: ["color.primary"],
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    const loaded = loadRegistry(path);
    expect(loaded.components[0]?.scope).toBe("local");
  });

  it("round-trips scope + deprecated through disk", () => {
    const path = registerTmp(tmpPath());
    const reg: Registry = {
      version: "0.1.0",
      components: [validRecord({ scope: "global", deprecated: true })],
    };
    saveRegistry(path, reg);
    const loaded = loadRegistry(path);
    expect(loaded.components[0]?.scope).toBe("global");
    expect(loaded.components[0]?.deprecated).toBe(true);
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

// ─── registerComponent + lookupComponent — lifecycle status roundtrip (P4) ────

describe("registerComponent + lookupComponent — lifecycle status (P4)", () => {
  it("roundtrips status through register then lookup", () => {
    const reg = createEmptyRegistry();
    const { registry } = registerComponent(reg, validRecord({ status: "beta" }), false);
    const found = lookupComponent(registry, "Button/Primary");
    expect(found?.status).toBe("beta");
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

// ─── statesToVariants (spec 009 D3) ────────────────────────────────────────────

describe("statesToVariants", () => {
  it("PascalCases each valid state into a State=X variant entry", () => {
    expect(statesToVariants(["hover", "focus"])).toEqual(["State=Hover", "State=Focus"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(statesToVariants([])).toEqual([]);
  });

  it("covers the full enum", () => {
    expect(statesToVariants(["default", "hover", "active", "focus", "disabled"])).toEqual([
      "State=Default", "State=Hover", "State=Active", "State=Focus", "State=Disabled",
    ]);
  });

  it("throws RegistryError('BAD_STATE') on a value outside the enum", () => {
    expect(() => statesToVariants(["smashed"])).toThrow(RegistryError);
    try {
      statesToVariants(["smashed"]);
    } catch (e) {
      expect(e).toBeInstanceOf(RegistryError);
      expect((e as RegistryError).code).toBe("BAD_STATE");
    }
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
