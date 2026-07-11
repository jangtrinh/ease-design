/**
 * specimen-check.ts — pure unit tests for the variant×state parser and the
 * applicable-state completeness checks (learn-from-shadcn Phase 3).
 *
 * Covers: parseDimensions (dedupe/sort/lowercase-dim-keys), normalizeState
 * (synonym canonicalisation), and checkSpecimen's two low-false-positive
 * warnings — missing-disabled (control family, leaf-role gated) and
 * missing-empty (data family, leaf-role gated, NOT parent-prefix gated).
 */
import { describe, expect, it } from "vitest";
import { checkSpecimen, normalizeState, parseDimensions } from "../src/core/specimen-check.js";
import type { SpecimenComponent } from "../src/core/specimen-check.js";

// ─── parseDimensions ───────────────────────────────────────────────────────

describe("parseDimensions", () => {
  it("dedupes + sorts values, lowercases dim keys, preserves value case", () => {
    expect(parseDimensions(["Size=lg", "Size=sm", "State=Hover"])).toEqual({
      size: ["lg", "sm"],
      state: ["Hover"],
    });
  });

  it("ignores malformed variant strings (no '=', empty dim, empty value)", () => {
    expect(parseDimensions(["=novalue", "nokey=", "novalueatall", "Size=lg"])).toEqual({
      size: ["lg"],
    });
  });
});

// ─── normalizeState ────────────────────────────────────────────────────────

describe("normalizeState", () => {
  it("maps common synonyms to canonical state tokens", () => {
    expect(normalizeState("Default")).toBe("default");
    expect(normalizeState("Rest")).toBe("default");
    expect(normalizeState("Hover")).toBe("hover");
    expect(normalizeState("Hovered")).toBe("hover");
    expect(normalizeState("Disabled")).toBe("disabled");
    expect(normalizeState("Pressed")).toBe("pressed");
    expect(normalizeState("Empty")).toBe("empty");
    expect(normalizeState("Loading")).toBe("loading");
    expect(normalizeState("Selected")).toBe("selected");
    expect(normalizeState("Checked")).toBe("selected");
  });

  it("returns null for a non-state value", () => {
    expect(normalizeState("Primary")).toBeNull();
  });
});

// ─── checkSpecimen ─────────────────────────────────────────────────────────

describe("checkSpecimen", () => {
  it("flags missing-disabled on a control declaring an interaction state (via states[])", () => {
    const r = checkSpecimen([{ name: "Foo / Button", states: ["Hover"] }]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ component: "Foo / Button", checkId: "missing-disabled" });
  });

  it("does NOT flag missing-disabled when the leaf role isn't a control (over-fire guard)", () => {
    const r = checkSpecimen([{ name: "Foo / Close Icon", states: ["Hover"] }]);
    expect(r.findings).toHaveLength(0);
  });

  it("flags missing-empty on a data-container leaf (Combobox) with states but no empty", () => {
    const r = checkSpecimen([{ name: "Combobox", variants: ["State=Default"] }]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ component: "Combobox", checkId: "missing-empty" });
  });

  it("does not flag missing-empty once an 'empty' state is present", () => {
    const r = checkSpecimen([{ name: "Combobox", variants: ["State=Default", "State=Empty"] }]);
    expect(r.findings).toHaveLength(0);
  });

  it("also gates missing-empty on other data-family leaves (Select, List)", () => {
    for (const name of ["Select", "List"]) {
      const r = checkSpecimen([{ name, variants: ["State=Default"] }]);
      expect(r.findings.map((f) => f.checkId)).toEqual(["missing-empty"]);
    }
  });

  it("does NOT flag missing-empty when only a PARENT prefix contains a data word — must match the LEAF (key regression guard)", () => {
    const r = checkSpecimen([{ name: "_DatePicker / Button", states: ["Default"] }]);
    expect(r.findings).toHaveLength(0);
  });

  it("a component with no state dimension and no states[] is not part of the contract — no findings", () => {
    const r = checkSpecimen([{ name: "Icon", variants: ["Size=sm"] }]);
    expect(r.stateful).toBe(0);
    expect(r.findings).toHaveLength(0);
    expect(r.components[0]).toMatchObject({ name: "Icon", states: [], findings: [] });
  });

  it("stateful counts only components that declare >=1 normalized state", () => {
    const components: SpecimenComponent[] = [
      { name: "A", variants: ["Size=sm"] }, // no state → not counted
      { name: "B", states: ["Hover"] },
      { name: "C", states: ["Loading", "Disabled"] },
    ];
    expect(checkSpecimen(components).stateful).toBe(2);
  });

  it("a complete control (hover+focus+disabled) produces no findings", () => {
    const r = checkSpecimen([{ name: "Button", states: ["Hover", "Focus", "Disabled"] }]);
    expect(r.findings).toHaveLength(0);
  });

  it("warningCount equals findings.length", () => {
    const components: SpecimenComponent[] = [
      { name: "Foo / Button", states: ["Hover"] }, // missing-disabled
      { name: "Combobox", variants: ["State=Default"] }, // missing-empty
    ];
    const r = checkSpecimen(components);
    expect(r.warningCount).toBe(r.findings.length);
    expect(r.warningCount).toBe(2);
  });

  it("findings are sorted by component then checkId — including a component with BOTH gaps", () => {
    const components: SpecimenComponent[] = [
      { name: "Zeta / Button", states: ["Hover"] }, // missing-disabled
      { name: "Alpha / Combobox", variants: ["State=Default"] }, // missing-empty
      { name: "Mid / Select", states: ["Hover"] }, // control+data family: both missing-disabled & missing-empty
    ];
    const r = checkSpecimen(components);
    expect(r.findings.map((f) => `${f.component}|${f.checkId}`)).toEqual([
      "Alpha / Combobox|missing-empty",
      "Mid / Select|missing-disabled",
      "Mid / Select|missing-empty",
      "Zeta / Button|missing-disabled",
    ]);
  });
});
