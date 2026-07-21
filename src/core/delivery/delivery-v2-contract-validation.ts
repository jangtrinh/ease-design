import type { DeliveryFinding } from "./delivery-types.js";
import {
  finding, namedObjects, nonEmptyString as str, numberArray as numbers,
  objectValue as obj, requireBase, stringArray as strings,
} from "./delivery-shared-validation.js";
import { validateContractBase } from "./delivery-v1-validation.js";
import { validateSectionArchitecture } from "./delivery-section-architecture-validation.js";

const CONTROL_STATES = ["default", "hover", "focus-visible", "disabled", "error"];
const KEYBOARD_ACTIONS = ["open", "navigate", "select", "escape"];

export function validateContractV2(j: Record<string, unknown>): DeliveryFinding[] {
  requireBase(j, "generation-contract", 2);
  const out = validateContractBase(j);
  validateAssets(j["assetPolicy"], out);
  validateResponsive(j, out);
  validateMotion(j["motion"], out);
  validateControls(j["controls"], out);
  validateComposition(j["composition"], out);
  validateSectionArchitecture(j["sections"], j["sectionArchitecture"], out);
  return out;
}

function validateAssets(value: unknown, out: DeliveryFinding[]): void {
  if (!obj(value)) {
    out.push(finding("missing-craft-contract", "assetPolicy must be an object")); return;
  }
  const icon = value["iconSource"];
  if (!obj(icon) || !str(icon["provider"]) || !str(icon["package"]) || !str(icon["weight"])) {
    out.push(finding("bad-icon-source", "iconSource requires provider, package, and weight"));
  } else if (icon["provider"] !== "phosphor") {
    const exception = icon["exception"];
    if (!obj(exception) || !str(exception["reason"]) || !str(exception["evidenceRef"])) {
      out.push(finding("unsupported-icon-exception", "non-Phosphor icon source requires reason and evidenceRef"));
    }
  }
  validateLogos(value["logos"], out);
  validateImages(value["images"], out);
}

function validateLogos(value: unknown, out: DeliveryFinding[]): void {
  if (!Array.isArray(value)) {
    out.push(finding("bad-logo-assets", "assetPolicy.logos must be an array")); return;
  }
  for (const logo of value) {
    if (!obj(logo) || !str(logo["role"]) || !str(logo["brand"]) ||
        !["svgl", "project"].includes(String(logo["provider"])) ||
        !str(logo["sourceUrl"]) || !str(logo["localPath"]) ||
        !["single", "light-dark"].includes(String(logo["theme"]))) {
      out.push(finding("missing-asset-provenance", "each logo requires role, brand, provider, sourceUrl, localPath, and theme"));
    }
  }
}

function validateImages(value: unknown, out: DeliveryFinding[]): void {
  if (!Array.isArray(value)) {
    out.push(finding("bad-image-assets", "assetPolicy.images must be an array")); return;
  }
  for (const image of value) {
    if (!obj(image) || !str(image["role"]) ||
        !["project", "harvested", "gpt-image-2", "none"].includes(String(image["provider"])) ||
        !str(image["sourceRef"]) || !str(image["aspectRatio"]) || !str(image["focalSafeArea"]) ||
        typeof image["containsEssentialText"] !== "boolean") {
      out.push(finding("missing-asset-provenance", "each image requires role, provider, sourceRef, aspectRatio, focalSafeArea, and containsEssentialText"));
      continue;
    }
    if (image["containsEssentialText"] === true) {
      out.push(finding("essential-text-in-image", `image role '${String(image["role"])}' cannot contain essential UI text`));
    }
  }
}

function validateResponsive(j: Record<string, unknown>, out: DeliveryFinding[]): void {
  const responsive = j["responsive"];
  if (!obj(responsive)) {
    out.push(finding("missing-craft-contract", "responsive must be an object")); return;
  }
  const nested = numbers(responsive["viewports"]);
  const top = numbers(j["viewports"]);
  if (nested === null || top === null || nested.length !== top.length ||
      !nested.every((width) => top.includes(width))) {
    out.push(finding("viewport-contract-mismatch", "responsive.viewports must equal top-level viewports"));
  }
  const adaptations = namedObjects(responsive["adaptations"]);
  if (adaptations.length === 0 || adaptations.some((a) =>
    !str(a["region"]) || !str(a["mobile"]) || !str(a["tablet"]) || !str(a["desktop"]))) {
    out.push(finding("missing-responsive-adaptation", "responsive needs a region with mobile, tablet, and desktop adaptations"));
  }
  if (responsive["overflowPolicy"] !== "no-accidental-horizontal-overflow") {
    out.push(finding("bad-overflow-policy", "responsive overflowPolicy must prevent accidental horizontal overflow"));
  }
}

function validateMotion(value: unknown, out: DeliveryFinding[]): void {
  if (!obj(value)) {
    out.push(finding("missing-craft-contract", "motion must be an object")); return;
  }
  if (!["T1", "T2", "T3", "T4", "T5", "T6"].includes(String(value["tier"]))) {
    out.push(finding("bad-motion-tier", "motion.tier must be T1 through T6"));
  }
  for (const key of ["heroAmbient", "scroll"] as const) {
    const state = value[key];
    if (!obj(state) || typeof state["applicable"] !== "boolean" || !str(state["description"])) {
      out.push(finding("missing-motion-state", `${key} requires applicable and description`));
    } else if (key === "heroAmbient" && state["applicable"] === false) {
      const exception = state["exception"];
      if (!obj(exception) || !str(exception["reason"]) || !str(exception["evidenceRef"])) {
        out.push(finding("missing-motion-state", "marketing hero ambient exception requires reason and evidenceRef"));
      }
    }
  }
  const loading = value["loading"];
  if (!obj(loading) || !str(loading["strategy"]) || loading["layoutStable"] !== true) {
    out.push(finding("unsafe-animation-fallback", "loading requires a strategy and layoutStable:true"));
  }
  const interaction = value["interaction"];
  const reduced = value["reducedMotion"];
  const jsFailure = value["jsFailure"];
  if (!obj(interaction) || !str(interaction["description"])) {
    out.push(finding("missing-motion-state", "interaction motion needs a description"));
  }
  if (!obj(reduced) || reduced["strategy"] !== "static-complete" ||
      !obj(jsFailure) || jsFailure["contentVisible"] !== true) {
    out.push(finding("unsafe-animation-fallback", "motion requires static-complete reduced motion and contentVisible:true without JavaScript"));
  }
}

function validateControls(value: unknown, out: DeliveryFinding[]): void {
  if (!Array.isArray(value)) {
    out.push(finding("missing-craft-contract", "controls must be an array")); return;
  }
  for (const control of value) {
    if (!obj(control) || !str(control["id"]) || !str(control["kind"]) ||
        !str(control["semanticBase"]) || control["customVisual"] !== true ||
        typeof control["customBehavior"] !== "boolean" || control["touch"] !== true) {
      out.push(finding("incomplete-custom-control", "each control requires identity, semantic base, custom visual treatment, behavior mode, and touch support"));
      continue;
    }
    const states = strings(control["states"]) ?? [];
    if (CONTROL_STATES.some((state) => !states.includes(state))) {
      out.push(finding("incomplete-custom-control", `control '${String(control["id"])}' lacks required states`));
    }
    if (control["customBehavior"] === true) {
      const keyboard = strings(control["keyboard"]) ?? [];
      if (KEYBOARD_ACTIONS.some((action) => !keyboard.includes(action))) {
        out.push(finding("incomplete-custom-control", `custom control '${String(control["id"])}' lacks keyboard operations`));
      }
    }
  }
}

function validateComposition(value: unknown, out: DeliveryFinding[]): void {
  if (!obj(value) || ["thesis", "signatureMove", "whitespaceStrategy", "templateAvoidance"]
    .some((key) => !str(value[key]))) {
    out.push(finding("missing-composition-review", "composition requires thesis, signatureMove, whitespaceStrategy, and templateAvoidance"));
  }
}
