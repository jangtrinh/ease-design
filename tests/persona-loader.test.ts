import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadPersonaIndex,
  findPersona,
  validatePersonaRecord,
  PersonaError,
} from "../src/core/persona-loader.js";

const PERSONAS_PATH = new URL(
  "../knowledge/personas/personas.json",
  import.meta.url,
).pathname;

// ─── loadPersonaIndex ─────────────────────────────────────────────────────────

describe("loadPersonaIndex", () => {
  it("loads and validates all 23 records from the committed index", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    expect(records).toHaveLength(23);
  });

  it("every record has a non-empty slug and family", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    for (const r of records) {
      expect(r.slug.length).toBeGreaterThan(0);
      expect(r.family.length).toBeGreaterThan(0);
    }
  });

  it("every primaryHex is a 6-digit hex", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    const hex6 = /^#[0-9a-fA-F]{6}$/;
    for (const r of records) {
      expect(r.colorPhilosophy.primaryHex).toMatch(hex6);
    }
  });

  it("throws PERSONA_INDEX_NOT_FOUND for missing file", () => {
    expect(() => loadPersonaIndex("/does/not/exist.json")).toThrow(PersonaError);
    try {
      loadPersonaIndex("/does/not/exist.json");
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("PERSONA_INDEX_NOT_FOUND");
    }
  });

  it("throws BAD_PERSONA_INDEX for non-array JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), "persona-test-"));
    const f = join(tmp, "bad.json");
    writeFileSync(f, '{"not":"an array"}');
    expect(() => loadPersonaIndex(f)).toThrow(PersonaError);
    try {
      loadPersonaIndex(f);
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("BAD_PERSONA_INDEX");
    }
  });
});

// ─── findPersona ─────────────────────────────────────────────────────────────

describe("findPersona", () => {
  it('returns the expected family for "liquid-glass"', () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    const p = findPersona(records, "liquid-glass");
    expect(p.family).toBe("material-surface");
  });

  it("throws PERSONA_NOT_FOUND for an unknown slug", () => {
    const records = loadPersonaIndex(PERSONAS_PATH);
    expect(() => findPersona(records, "not-a-slug")).toThrow(PersonaError);
    try {
      findPersona(records, "not-a-slug");
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("PERSONA_NOT_FOUND");
    }
  });
});

// ─── validatePersonaRecord ────────────────────────────────────────────────────

describe("validatePersonaRecord", () => {
  function validRecord() {
    return {
      slug: "test-persona",
      family: "test-family",
      uiTypes: ["landing"],
      density: "comfortable",
      colorMode: "both",
      keywords: ["test"],
      typography: {
        fontFamilyDisplay: "Inter, sans-serif",
        fontFamilyBody: "Inter, sans-serif",
        fontWeightBody: 400,
        fontWeightHeading: 600,
      },
      colorPhilosophy: {
        primaryHex: "#3B82F6",
      },
      radius: { sm: "4px", md: "8px", lg: "12px", full: "9999px" },
      spacing: { base: 4 },
      shadowIntensity: "soft",
      antiPatterns: ["flat design"],
    };
  }

  it("accepts a valid record", () => {
    const r = validatePersonaRecord(validRecord());
    expect(r.slug).toBe("test-persona");
  });

  it("rejects missing primaryHex", () => {
    const rec = validRecord();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (rec.colorPhilosophy as any).primaryHex;
    expect(() => validatePersonaRecord(rec)).toThrow(PersonaError);
    try {
      validatePersonaRecord(rec);
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("BAD_PERSONA_INDEX");
    }
  });

  it("rejects bad density enum value", () => {
    const rec = { ...validRecord(), density: "extreme" };
    expect(() => validatePersonaRecord(rec)).toThrow(PersonaError);
  });

  it("rejects 3-digit hex for primaryHex", () => {
    const rec = validRecord();
    rec.colorPhilosophy.primaryHex = "#F00";
    expect(() => validatePersonaRecord(rec)).toThrow(PersonaError);
    try {
      validatePersonaRecord(rec);
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("BAD_PERSONA_INDEX");
    }
  });

  it("rejects extra top-level field", () => {
    const rec = { ...validRecord(), unknownField: true };
    expect(() => validatePersonaRecord(rec)).toThrow(PersonaError);
    try {
      validatePersonaRecord(rec);
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("BAD_PERSONA_INDEX");
    }
  });

  it("rejects bad shadowIntensity", () => {
    const rec = { ...validRecord(), shadowIntensity: "heavy" };
    expect(() => validatePersonaRecord(rec)).toThrow(PersonaError);
  });

  it("rejects family that does not match slug pattern (e.g. contains uppercase)", () => {
    const rec = { ...validRecord(), family: "Material Surface" };
    expect(() => validatePersonaRecord(rec)).toThrow(PersonaError);
    try {
      validatePersonaRecord(rec);
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("BAD_PERSONA_INDEX");
    }
  });

  it("rejects family that starts with a digit", () => {
    const rec = { ...validRecord(), family: "1invalid" };
    expect(() => validatePersonaRecord(rec)).toThrow(PersonaError);
    try {
      validatePersonaRecord(rec);
    } catch (e) {
      expect(e instanceof PersonaError && e.code).toBe("BAD_PERSONA_INDEX");
    }
  });
});
