import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateDelivery } from "../src/core/delivery-model.js";

function load(name: string): Record<string, unknown> {
  const path = join(process.cwd(), "tests", "fixtures", "delivery", name);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}
function ids(result: ReturnType<typeof validateDelivery>): string[] {
  return result.findings.map((finding) => finding.checkId);
}

describe("Qualified Delivery v2 craft contracts", () => {
  it("accepts a complete craft contract", () => {
    const result = validateDelivery(load("generation-contract-v2-valid.json"));
    expect(result.version).toBe(2);
    expect(result.errorCount).toBe(0);
  });

  it("requires evidence for a non-Phosphor icon exception", () => {
    const contract = load("generation-contract-v2-valid.json");
    const policy = contract["assetPolicy"] as Record<string, unknown>;
    policy["iconSource"] = { provider: "lucide", package: "lucide-react", weight: "regular" };
    expect(ids(validateDelivery(contract))).toContain("unsupported-icon-exception");
  });

  it("blocks essential text baked into generated imagery", () => {
    const contract = load("generation-contract-v2-valid.json");
    const policy = contract["assetPolicy"] as Record<string, unknown>;
    const image = (policy["images"] as Array<Record<string, unknown>>)[0]!;
    image["containsEssentialText"] = true;
    expect(ids(validateDelivery(contract))).toContain("essential-text-in-image");
  });

  it("requires intentional responsive adaptations and matching viewports", () => {
    const contract = load("generation-contract-v2-valid.json");
    const responsive = contract["responsive"] as Record<string, unknown>;
    responsive["viewports"] = [1440, 390];
    responsive["adaptations"] = [];
    const findings = ids(validateDelivery(contract));
    expect(findings).toContain("viewport-contract-mismatch");
    expect(findings).toContain("missing-responsive-adaptation");
  });

  it("requires safe loading, reduced-motion, and JavaScript fallbacks", () => {
    const contract = load("generation-contract-v2-valid.json");
    const motion = contract["motion"] as Record<string, unknown>;
    motion["loading"] = { strategy: "fade", layoutStable: false };
    motion["reducedMotion"] = { strategy: "still-animated" };
    motion["jsFailure"] = { contentVisible: false };
    expect(ids(validateDelivery(contract))).toContain("unsafe-animation-fallback");
  });

  it("blocks same-layout different-copy section architecture", () => {
    const contract = load("generation-contract-v2-valid.json");
    const architecture = contract["sectionArchitecture"] as Record<string, unknown>;
    const sections = architecture["sections"] as Array<Record<string, unknown>>;
    for (const section of sections) {
      section["layoutModel"] = "generic-card-grid";
      section["repetitionRationale"] = null;
    }
    expect(ids(validateDelivery(contract))).toContain("unjustified-section-redundancy");
  });

  it("requires exact section architecture coverage", () => {
    const contract = load("generation-contract-v2-valid.json");
    const architecture = contract["sectionArchitecture"] as Record<string, unknown>;
    (architecture["sections"] as Array<unknown>).pop();
    expect(ids(validateDelivery(contract))).toContain("section-architecture-coverage-mismatch");
  });

  it("requires the full keyboard contract for custom behavioral controls", () => {
    const contract = load("generation-contract-v2-valid.json");
    const control = (contract["controls"] as Array<Record<string, unknown>>)[0]!;
    control["keyboard"] = ["open", "select"];
    expect(ids(validateDelivery(contract))).toContain("incomplete-custom-control");
  });

  it("accepts complete v2 qualification against its contract", () => {
    const contract = load("generation-contract-v2-valid.json");
    const record = load("qualification-v2-valid.json");
    const result = validateDelivery(record, { contract });
    expect(result.errorCount).toBe(0);
  });

  it("blocks false qualification across assets, viewports, motion, controls, and composition", () => {
    const contract = load("generation-contract-v2-valid.json");
    const record = load("qualification-v2-false-green.json");
    const findings = ids(validateDelivery(record, { contract }));
    expect(findings.filter((id) => id === "false-qualified-v2").length).toBeGreaterThanOrEqual(5);
    expect(findings).toContain("missing-control-evidence");
    expect(findings).toContain("false-qualified-section-redundancy");
  });

  it("requires rendered review for every contracted section", () => {
    const contract = load("generation-contract-v2-valid.json");
    const record = load("qualification-v2-valid.json");
    (record["sectionReview"] as Array<unknown>).pop();
    expect(ids(validateDelivery(record, { contract }))).toContain("missing-section-review");
  });

  it("requires prompt-decision traceability for section findings", () => {
    const contract = load("generation-contract-v2-valid.json");
    const record = load("qualification-v2-false-green.json");
    record["status"] = "DRAFT_WITH_CONCERNS";
    const review = record["sectionReview"] as Array<Record<string, unknown>>;
    review[1]!["decisionRefs"] = [];
    expect(ids(validateDelivery(record, { contract })))
      .toContain("untraceable-section-finding");
  });

  it("does not allow v2 qualification without the referenced contract", () => {
    const result = validateDelivery(load("qualification-v2-valid.json"));
    expect(ids(result)).toContain("missing-contract-evidence");
  });

  it("allows a well-formed draft to record failed craft observations", () => {
    const contract = load("generation-contract-v2-valid.json");
    const record = load("qualification-v2-false-green.json");
    record["status"] = "DRAFT_WITH_CONCERNS";
    record["unresolvedFindings"] = ["Mobile overflow and incomplete control behavior"];
    const result = validateDelivery(record, { contract });
    expect(result.errorCount).toBe(0);
  });
});
