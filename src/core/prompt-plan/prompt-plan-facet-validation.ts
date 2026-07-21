import type { PromptPlanFinding } from "./prompt-plan-types.js";
import {
  finding,
  hasDecision,
  namedObjects,
  nonEmptyString as str,
} from "./prompt-plan-shared-validation.js";

const FACETS = [
  "intent-goal",
  "requirements",
  "ia-flow",
  "layout",
  "style",
  "content",
  "behavior",
] as const;
const LAYERS = [
  "audience",
  "tone-voice",
  "constraints",
  "accessibility",
  "states-edge-cases",
] as const;

export function validateFacets(
  json: Record<string, unknown>,
  out: PromptPlanFinding[],
): void {
  const bindings = namedObjects(json["facetBindings"]);
  const names = bindings.map((row) => row["facet"]).filter(str);
  const expected = [...FACETS, ...LAYERS];
  if (
    bindings.length !== expected.length ||
    new Set(names).size !== names.length ||
    expected.some((name) => !names.includes(name)) ||
    bindings.some((row) => !str(row["facet"]) || !hasDecision(row["decision"]))
  ) {
    out.push(finding(
      "missing-facet-binding",
      "facet-binding",
      "all seven facets and five cross-cutting layers require one provenance-bound decision",
    ));
  }
  const blockedAssumption = bindings.some((row) => {
    const decision = row["decision"];
    return hasDecision(decision) &&
      decision["sourceType"] === "assumption" &&
      decision["confidence"] === "low" &&
      row["decisionChanging"] === true;
  });
  if (blockedAssumption) {
    out.push(finding(
      "unresolved-decision-changing-ambiguity",
      "facet-binding",
      "low-confidence assumptions cannot resolve decision-changing ambiguity",
    ));
  }
}

export function validateProductTruth(
  value: unknown,
  out: PromptPlanFinding[],
): void {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ["audienceSituation", "desiredChange", "primaryOutcome", "primaryAction"]
      .some((field) => !str((value as Record<string, unknown>)[field])) ||
    !Array.isArray((value as Record<string, unknown>)["availableProof"]) ||
    !Array.isArray((value as Record<string, unknown>)["prohibitedClaims"]) ||
    !Array.isArray((value as Record<string, unknown>)["contentInventory"])
  ) {
    out.push(finding(
      "missing-product-truth",
      "product-truth",
      "product truth requires audience, desired change, outcome, action, proof, claims, and content inventory",
    ));
  }
}
