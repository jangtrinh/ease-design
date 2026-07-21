import { validateDirections } from "./prompt-plan-direction-validation.js";
import {
  validateFacets,
  validateProductTruth,
} from "./prompt-plan-facet-validation.js";
import {
  validateBuilderPacket,
  validatePreflight,
} from "./prompt-plan-preflight-validation.js";
import { validateProportions } from "./prompt-plan-proportion-validation.js";
import { validateRegions } from "./prompt-plan-region-validation.js";
import {
  nonEmptyString as str,
  objectValue as obj,
} from "./prompt-plan-shared-validation.js";
import {
  validateDeliveryPlan,
  validateVisualSystem,
} from "./prompt-plan-system-validation.js";
import {
  PromptPlanError,
} from "./prompt-plan-types.js";
import type {
  PromptPlanFinding,
  PromptPlanResult,
} from "./prompt-plan-types.js";

const SURFACES = [
  "marketing-landing",
  "portfolio",
  "editorial",
  "redesign-preserve",
  "redesign-overhaul",
  "product-app",
  "dashboard",
  "admin",
] as const;

export function validatePromptPlan(json: unknown): PromptPlanResult {
  if (!obj(json) || json["kind"] !== "prompt-plan" || json["version"] !== 1) {
    throw new PromptPlanError(
      "BAD_PROMPT_PLAN",
      "expected prompt-plan artifact with version 1",
    );
  }
  const findings: PromptPlanFinding[] = [];
  validateIdentity(json, findings);
  validateFacets(json, findings);
  validateProductTruth(json["productTruth"], findings);
  validateDirections(json, findings);
  validateVisualSystem(json["visualSystem"], findings);
  validateRegions(json["regions"], findings);
  const regionCount = Array.isArray(json["regions"]) ? json["regions"].length : 0;
  validateProportions(json["proportionCandidates"], regionCount, findings);
  validateDeliveryPlan(json["deliveryPlan"], findings);
  validatePreflight(json["preflight"], findings);
  validateBuilderPacket(json["builderPacket"], findings);
  const errorCount = findings.filter((row) => row.severity === "error").length;
  const warningCount = findings.length - errorCount;
  return {
    kind: "prompt-plan",
    version: 1,
    ready: errorCount === 0,
    errorCount,
    warningCount,
    findings,
  };
}

function validateIdentity(
  json: Record<string, unknown>,
  out: PromptPlanFinding[],
): void {
  if (
    !str(json["id"]) ||
    !str(json["rawRequest"]) ||
    !SURFACES.includes(json["surface"] as (typeof SURFACES)[number]) ||
    !["replicate", "enhance", "adapt", "generate"].includes(String(json["promptMode"])) ||
    !obj(json["pageNarrative"]) ||
    !str((json["pageNarrative"] as Record<string, unknown>)["thesis"])
  ) {
    out.push({
      checkId: "missing-prompt-plan-identity",
      severity: "error",
      stage: "intake",
      message: "prompt plan requires identity, raw request, supported surface, prompt mode, and page narrative",
    });
  }
}
