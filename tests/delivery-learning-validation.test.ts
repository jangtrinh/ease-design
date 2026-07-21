import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateDelivery } from "../src/core/delivery-model.js";

function fixture(): Record<string, unknown> {
  const path = join(
    process.cwd(),
    "tests/fixtures/delivery/learning-record-valid.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}
function ids(record: Record<string, unknown>): string[] {
  return validateDelivery(record).findings.map((finding) => finding.checkId);
}
function trials(
  record: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return record["trials"] as Array<Record<string, unknown>>;
}

describe("world-class learning record", () => {
  it("accepts a controlled four-way hypothesis", () => {
    expect(validateDelivery(fixture()).errorCount).toBe(0);
  });

  it("requires the art-directed comparison variant", () => {
    const record = fixture();
    trials(record)[0]!["variants"] = (
      trials(record)[0]!["variants"] as Array<Record<string, unknown>>
    ).filter((variant) => variant["workflow"] !== "art-directed");
    expect(ids(record)).toContain("missing-comparison-variant");
  });

  it("requires section boards and a six-axis identity signature", () => {
    const record = fixture();
    const variants = trials(record)[0]!["variants"] as Array<
      Record<string, unknown>
    >;
    const directed = variants.find(
      (variant) => variant["workflow"] === "art-directed",
    )!;
    directed["boardRefs"] = [];
    delete directed["identitySignature"];
    const findings = ids(record);
    expect(findings).toContain("missing-section-boards");
    expect(findings).toContain("missing-identity-signature");
  });

  it("requires the Design Read and three independent art-direction dials", () => {
    const record = fixture();
    const directed = variants(record).find(
      (variant) => variant["workflow"] === "art-directed",
    )!;
    const direction = directed["artDirection"] as Record<string, unknown>;
    delete direction["designRead"];
    direction["dials"] = {
      designVariance: 8,
      motionIntensity: 0,
      visualDensity: 4,
    };
    expect(ids(record)).toContain("missing-art-direction-contract");
  });

  it("requires unique section-board decisions with rationale", () => {
    const record = fixture();
    const direction = artDirection(record);
    const boards = direction["boards"] as Array<Record<string, unknown>>;
    boards[1]!["sectionId"] = boards[0]!["sectionId"];
    boards[1]!["boardRef"] = boards[0]!["boardRef"];
    expect(ids(record)).toContain("duplicate-section-board");
    delete boards[0]!["selectionRationale"];
    expect(ids(record)).toContain("missing-section-board-evidence");
  });

  it("requires one board for every major section and aligned boardRefs", () => {
    const record = fixture();
    artDirection(record)["majorSections"] = ["hero", "materials", "process"];
    expect(ids(record)).toContain("section-board-coverage-mismatch");
  });

  it("requires board-to-code fidelity evidence", () => {
    const record = fixture();
    const direction = artDirection(record);
    const fidelity = direction["fidelity"] as Record<string, unknown>;
    delete fidelity["motifRef"];
    expect(ids(record)).toContain("missing-board-fidelity-evidence");
  });

  it("rejects incomplete production assets but retains rejected attempts", () => {
    const record = fixture();
    const assets = artDirection(record)["assetManifest"] as Array<
      Record<string, unknown>
    >;
    assets[0]!["localRef"] = null;
    assets[0]!["usedIn"] = [];
    expect(ids(record)).toContain("invalid-asset-manifest");
    assets.shift();
    expect(validateDelivery(record).errorCount).toBe(0);
  });

  it("rejects placeholder and duplicate production assets", () => {
    const record = fixture();
    const assets = artDirection(record)["assetManifest"] as Array<
      Record<string, unknown>
    >;
    const duplicate = structuredClone(assets[0]!);
    duplicate["sourceType"] = "none";
    assets.push(duplicate);
    const findings = ids(record);
    expect(findings).toContain("invalid-asset-manifest");
    expect(findings).toContain("duplicate-production-asset");
  });

  it("rejects unexplained identity convergence but permits evidence-justified repetition", () => {
    const record = fixture();
    const trial = trials(record)[0]!;
    const analysis = trial["convergenceAnalysis"] as Record<string, unknown>;
    analysis["justifiedAxes"] = [];
    expect(ids(record)).toContain("unjustified-default-convergence");
    analysis["justifiedAxes"] = ["paletteFamily"];
    expect(validateDelivery(record).errorCount).toBe(0);
  });

  it("rejects an unblinded or uncontrolled trial", () => {
    const record = fixture();
    trials(record)[0]!["blindEvaluation"] = false;
    expect(ids(record)).toContain("uncontrolled-learning-trial");
  });

  it("requires evaluator evidence and unique benchmark cases", () => {
    const record = fixture();
    trials(record)[0]!["evaluatorRefs"] = [];
    record["trials"] = [
      trials(record)[0]!,
      structuredClone(trials(record)[0]!),
    ];
    const findings = ids(record);
    expect(findings).toContain("uncontrolled-learning-trial");
    expect(findings).toContain("duplicate-learning-case");
  });

  it("blocks promotion from one attractive case", () => {
    const record = fixture();
    (record["learnings"] as Array<Record<string, unknown>>)[0]!["status"] =
      "promoted";
    expect(ids(record)).toContain("premature-learning-promotion");
  });

  it("allows explicit expert approval with a durable reference", () => {
    const record = fixture();
    const lesson = (record["learnings"] as Array<Record<string, unknown>>)[0]!;
    lesson["status"] = "promoted";
    lesson["expertApproval"] = {
      approved: true,
      ref: "feedback/2026-07-19#icons",
    };
    expect(validateDelivery(record).errorCount).toBe(0);
  });

  it("allows repeated winning evidence across three cases and two categories", () => {
    const record = fixture();
    const base = trials(record)[0]!;
    record["trials"] = [
      base,
      { ...structuredClone(base), caseId: "D02", category: "nutrition" },
      { ...structuredClone(base), caseId: "D03", category: "saas" },
    ];
    const lesson = (record["learnings"] as Array<Record<string, unknown>>)[0]!;
    lesson["status"] = "promoted";
    lesson["evidenceCaseIds"] = ["D01", "D02", "D03"];
    expect(validateDelivery(record).errorCount).toBe(0);
  });

  it("blocks repeated promotion when art direction has a critical failure", () => {
    const record = fixture();
    const base = trials(record)[0]!;
    const d02 = structuredClone(base);
    d02["caseId"] = "D02";
    d02["category"] = "nutrition";
    const d03 = structuredClone(base);
    d03["caseId"] = "D03";
    d03["category"] = "saas";
    const variants = d03["variants"] as Array<Record<string, unknown>>;
    variants.find((variant) => variant["workflow"] === "art-directed")![
      "criticalFailures"
    ] = 1;
    record["trials"] = [base, d02, d03];
    const lesson = (record["learnings"] as Array<Record<string, unknown>>)[0]!;
    lesson["status"] = "promoted";
    lesson["evidenceCaseIds"] = ["D01", "D02", "D03"];
    expect(ids(record)).toContain("premature-learning-promotion");
  });
});

function variants(
  record: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return trials(record)[0]!["variants"] as Array<Record<string, unknown>>;
}

function artDirection(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const directed = variants(record).find(
    (variant) => variant["workflow"] === "art-directed",
  )!;
  return directed["artDirection"] as Record<string, unknown>;
}
