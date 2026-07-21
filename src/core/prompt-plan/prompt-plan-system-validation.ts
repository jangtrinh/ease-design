import type { PromptPlanFinding } from "./prompt-plan-types.js";
import {
  finding,
  nonEmptyString as str,
  objectValue as obj,
} from "./prompt-plan-shared-validation.js";

const SYSTEM_FIELDS = [
  "typography",
  "palette",
  "spacingCadence",
  "grid",
  "shapeGrammar",
  "depthMaterial",
  "mediaGrade",
  "iconFamily",
  "controlGarment",
  "motionCharacter",
  "themeBehavior",
] as const;

const ADJECTIVE_ONLY = /^(clean|minimal|modern|premium|bold|elegant|beautiful|professional|sleek)$/i;

export function validateVisualSystem(
  value: unknown,
  out: PromptPlanFinding[],
): void {
  if (!obj(value) || SYSTEM_FIELDS.some((field) => !str(value[field]))) {
    out.push(finding(
      "incomplete-visual-system-dna",
      "visual-system",
      `visual system requires actionable ${SYSTEM_FIELDS.join(", ")}`,
    ));
    return;
  }
  if (SYSTEM_FIELDS.some((field) =>
    ADJECTIVE_ONLY.test(String(value[field]).trim())
  )) {
    out.push(finding(
      "non-actionable-visual-dna",
      "visual-system",
      "visual-system fields must describe implementation consequences, not mood adjectives alone",
    ));
  }
  if (String(value["iconFamily"]).toLowerCase() !== "phosphor" &&
      !str(value["iconExceptionRef"])) {
    out.push(finding(
      "unsupported-icon-exception",
      "visual-system",
      "non-Phosphor icon systems require an evidence reference",
    ));
  }
}

export function validateDeliveryPlan(
  value: unknown,
  out: PromptPlanFinding[],
): void {
  const viewports = obj(value) ? value["viewports"] : undefined;
  if (
    !obj(value) ||
    !Array.isArray(value["assets"]) ||
    !Array.isArray(viewports) ||
    !viewports.every((width) => Number.isInteger(width) && Number(width) > 0) ||
    !str(value["states"]) ||
    !str(value["motion"]) ||
    !str(value["reducedMotion"]) ||
    !str(value["javascriptFailure"])
  ) {
    out.push(finding(
      "incomplete-delivery-plan",
      "delivery-planning",
      "delivery plan requires assets, viewports, states, motion, reduced motion, and JavaScript fallback",
    ));
    return;
  }
  if (value["assets"].some((asset) =>
    !obj(asset) ||
    !str(asset["id"]) ||
    !str(asset["source"]) ||
    !["provided", "generated", "licensed", "project"].includes(String(asset["provenance"])) ||
    asset["fakeEvidence"] === true
  )) {
    out.push(finding(
      "invalid-asset-provenance",
      "delivery-planning",
      "every asset requires valid provenance and cannot be fake product or logo evidence",
    ));
  }
  const requiredImageFields = [
    "subject",
    "narrativeJob",
    "aspectRatio",
    "focalSafeArea",
    "cropBehavior",
    "altText",
    "loadingPriority",
    "mobileTransformation",
  ];
  if (value["assets"].some((asset) =>
    obj(asset) && (
      requiredImageFields.some((field) => !str(asset[field])) ||
      !Array.isArray(asset["usedIn"]) ||
      asset["usedIn"].length === 0 ||
      asset["usedIn"].some((region) => !str(region))
    )
  )) {
    out.push(finding(
      "invalid-visual-asset-contract",
      "delivery-planning",
      "every visual asset requires narrative, crop, accessibility, loading, mobile, and region-use contracts",
    ));
  }
}
