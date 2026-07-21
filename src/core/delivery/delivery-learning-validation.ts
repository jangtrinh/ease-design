import type { DeliveryFinding } from "./delivery-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
  objectValue as obj,
  requireBase,
} from "./delivery-shared-validation.js";
import {
  validateArtDirection,
  validateConvergence,
  validateIdentitySignature,
} from "./delivery-art-direction-validation.js";
import { validateLearnings } from "./delivery-learning-promotion.js";

const WORKFLOWS = ["raw", "enhanced", "qualified", "art-directed"] as const;
const CEILING_AXES = [
  "originality",
  "hierarchy",
  "composition",
  "emotionalImpact",
  "motionCraft",
  "responsiveArtDirection",
  "referenceFidelity",
] as const;

export function validateLearningRecordV1(
  j: Record<string, unknown>,
): DeliveryFinding[] {
  requireBase(j, "learning-record", 1);
  const out: DeliveryFinding[] = [];
  if (!str(j["benchmarkId"]) || !str(j["rubricVersion"])) {
    out.push(
      finding(
        "bad-learning-record",
        "benchmarkId and rubricVersion are required",
      ),
    );
  }
  const trials = validateTrials(j["trials"], out);
  validateLearnings(j["learnings"], trials, out);
  return out;
}

function validateTrials(
  value: unknown,
  out: DeliveryFinding[],
): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) {
    out.push(
      finding(
        "missing-learning-evidence",
        "trials must contain at least one comparison",
      ),
    );
    return [];
  }
  const trials = namedObjects(value);
  if (trials.length !== value.length) {
    out.push(finding("bad-learning-trial", "every trial must be an object"));
  }
  const caseIds = trials.map((trial) => trial["caseId"]).filter(str);
  if (new Set(caseIds).size !== caseIds.length) {
    out.push(
      finding("duplicate-learning-case", "trial caseId values must be unique"),
    );
  }
  for (const trial of trials) validateTrial(trial, out);
  return trials;
}

function validateTrial(
  trial: Record<string, unknown>,
  out: DeliveryFinding[],
): void {
  if (
    !str(trial["caseId"]) ||
    !str(trial["category"]) ||
    trial["blindEvaluation"] !== true ||
    trial["controlledInputs"] !== true ||
    !nonEmptyStrings(trial["evaluatorRefs"])
  ) {
    out.push(
      finding(
        "uncontrolled-learning-trial",
        "each trial requires identity, controlled blinded evaluation, and evaluatorRefs",
      ),
    );
  }
  const variants = namedObjects(trial["variants"]);
  const workflows = variants.map((variant) => variant["workflow"]);
  if (
    variants.length !== WORKFLOWS.length ||
    WORKFLOWS.some((workflow) => !workflows.includes(workflow))
  ) {
    out.push(
      finding(
        "missing-comparison-variant",
        `trial '${String(trial["caseId"])}' must include raw, enhanced, qualified, and art-directed variants`,
      ),
    );
  }
  for (const variant of variants) validateVariant(variant, out);
  validateConvergence(trial, out);
}

function validateVariant(
  variant: Record<string, unknown>,
  out: DeliveryFinding[],
): void {
  if (
    !WORKFLOWS.includes(variant["workflow"] as (typeof WORKFLOWS)[number]) ||
    !str(variant["artifactRef"]) ||
    !nonEmptyStrings(variant["evidenceRefs"]) ||
    !Number.isInteger(variant["criticalFailures"]) ||
    (variant["criticalFailures"] as number) < 0
  ) {
    out.push(
      finding(
        "bad-learning-variant",
        "variant requires workflow, artifactRef, evidenceRefs, and non-negative criticalFailures",
      ),
    );
  }
  const scores = obj(variant["ceilingScores"]) ? variant["ceilingScores"] : {};
  if (
    !obj(variant["ceilingScores"]) ||
    CEILING_AXES.some((axis) => {
      const score = scores[axis];
      return (
        !Number.isInteger(score) ||
        (score as number) < 0 ||
        (score as number) > 10
      );
    })
  ) {
    out.push(
      finding(
        "bad-ceiling-scores",
        `ceilingScores must provide integer 0–10 values for ${CEILING_AXES.join(", ")}`,
      ),
    );
  }
  validateIdentitySignature(variant, out);
  if (variant["workflow"] === "art-directed") {
    if (!nonEmptyStrings(variant["boardRefs"])) {
      out.push(
        finding(
          "missing-section-boards",
          "art-directed variants require section-level board evidence",
        ),
      );
    }
    validateArtDirection(variant, out);
  }
}

function nonEmptyStrings(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(str);
}
