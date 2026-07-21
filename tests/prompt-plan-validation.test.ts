import { describe, expect, it } from "vitest";
import { validatePromptPlan } from "../src/core/prompt-plan-model.js";
import { validPromptPlan } from "./fixtures/prompt-plan/prompt-plan-fixture.js";

const surfaces = [
  "marketing-landing", "portfolio", "redesign-preserve", "product-app", "dashboard",
];

describe("prompt-plan validation", () => {
  for (const surface of surfaces) {
    it(`accepts a complete ${surface} plan`, () => {
      expect(validatePromptPlan(validPromptPlan(surface)).ready).toBe(true);
    });
  }

  const failures: Array<[string, string, (plan: Record<string, unknown>) => void]> = [
    ["missing facets", "missing-facet-binding", (plan) => {
      (plan["facetBindings"] as unknown[]).pop();
    }],
    ["cosmetic directions", "insufficient-direction-divergence", (plan) => {
      const rows = plan["directions"] as Array<Record<string, unknown>>;
      rows[1] = { ...rows[0]!, id: "direction-1", selectionDecision: "preserved" };
    }],
    ["repeated region shells", "same-layout-different-copy", (plan) => {
      const rows = plan["regions"] as Array<Record<string, unknown>>;
      rows[1]!["layoutModel"] = rows[0]!["layoutModel"];
    }],
    ["adjective-only DNA", "non-actionable-visual-dna", (plan) => {
      (plan["visualSystem"] as Record<string, unknown>)["typography"] = "premium";
    }],
    ["forced phi", "phi-everywhere", (plan) => {
      const rows = plan["proportionCandidates"] as Array<Record<string, unknown>>;
      const golden = rows[1]!;
      golden["ratioApplications"] = ["hero", "proof"].map((regionId) => ({
        regionId, target: "split", ratio: 1.618, contentRationale: "content fit",
        fallback: "stack", nestingDepth: 1, applicationsInRegion: 1,
      }));
    }],
    ["missing mobile release", "responsive-ratio-preservation", (plan) => {
      const rows = plan["proportionCandidates"] as Array<Record<string, unknown>>;
      rows[1]!["responsiveReleaseRules"] = [];
    }],
    ["packet overflow", "builder-packet-over-budget", (plan) => {
      (plan["builderPacket"] as Record<string, unknown>)["tokenCount"] = 6001;
    }],
    ["fake evidence", "invalid-asset-provenance", (plan) => {
      const delivery = plan["deliveryPlan"] as Record<string, unknown>;
      (delivery["assets"] as Array<Record<string, unknown>>)[0]!["fakeEvidence"] = true;
    }],
    ["missing region visual strategy", "missing-region-visual-strategy", (plan) => {
      const rows = plan["regions"] as Array<Record<string, unknown>>;
      delete rows[1]!["visualType"];
    }],
    ["image region without an asset", "missing-region-visual-asset", (plan) => {
      const rows = plan["regions"] as Array<Record<string, unknown>>;
      rows[1]!["visualType"] = "generated-image";
    }],
    ["incomplete visual asset contract", "invalid-visual-asset-contract", (plan) => {
      const delivery = plan["deliveryPlan"] as Record<string, unknown>;
      const asset = (delivery["assets"] as Array<Record<string, unknown>>)[0]!;
      delete asset["cropBehavior"];
    }],
    ["unclassified preflight coverage", "missing-hard-preflight-check", (plan) => {
      const preflight = plan["preflight"] as Record<string, unknown>;
      const checks = preflight["checks"] as Array<Record<string, unknown>>;
      preflight["checks"] = checks.filter((row) => row["id"] !== "unsupported-claims");
    }],
  ];

  for (const [name, checkId, mutate] of failures) {
    it(`blocks ${name}`, () => {
      const plan = validPromptPlan();
      mutate(plan);
      const result = validatePromptPlan(plan);
      expect(result.ready).toBe(false);
      expect(result.findings.map((row) => row.checkId)).toContain(checkId);
    });
  }
});
