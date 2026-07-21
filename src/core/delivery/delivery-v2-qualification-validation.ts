import type { DeliveryFinding, DeliveryValidationContext } from "./delivery-types.js";
import {
  finding, namedObjects, nonEmptyString as str, objectValue as obj, requireBase,
} from "./delivery-shared-validation.js";
import { validateQualificationBase } from "./delivery-v1-validation.js";
import {
  crossCheckSectionReview,
  validateSectionReview,
} from "./delivery-section-architecture-validation.js";

export function validateQualificationV2(
  j: Record<string, unknown>,
  context: DeliveryValidationContext,
): DeliveryFinding[] {
  requireBase(j, "qualification-record", 2);
  const out = validateQualificationBase(j);
  const qualified = j["status"] === "QUALIFIED";
  const assets = validateAssetEvidence(j["assetEvidence"], out);
  const responsive = validateResponsiveEvidence(j["responsiveEvidence"], out);
  validateMotionEvidence(j["motionEvidence"], qualified, out);
  const controls = validateControlEvidence(j["controlEvidence"], out);
  validateCompositionReview(j["compositionReview"], qualified, out);
  const sectionReview = validateSectionReview(j["sectionReview"], qualified, out);
  if (!context.contract) {
    out.push(finding("missing-contract-evidence", "version 2 qualification requires its referenced generation contract"));
  } else {
    crossCheckContract(context.contract, assets, responsive, controls, qualified, out);
    crossCheckSectionReview(context.contract, sectionReview, qualified, out);
  }
  return out;
}

function validateAssetEvidence(value: unknown, out: DeliveryFinding[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    out.push(finding("bad-asset-evidence", "assetEvidence must be an array")); return [];
  }
  const rows = namedObjects(value);
  if (rows.length !== value.length || rows.some((row) =>
    !str(row["role"]) || !str(row["sourceRef"]) || typeof row["verified"] !== "boolean")) {
    out.push(finding("bad-asset-evidence", "asset evidence requires role, sourceRef, and verified"));
  }
  return rows;
}

function validateResponsiveEvidence(value: unknown, out: DeliveryFinding[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    out.push(finding("bad-responsive-evidence", "responsiveEvidence must be an array")); return [];
  }
  const rows = namedObjects(value);
  if (rows.length !== value.length || rows.some((row) =>
    !Number.isInteger(row["viewport"]) || !str(row["renderRef"]) ||
    typeof row["passed"] !== "boolean" || typeof row["overflowFree"] !== "boolean")) {
    out.push(finding("bad-responsive-evidence", "responsive evidence requires viewport, renderRef, passed, and overflowFree"));
  }
  return rows;
}

function validateMotionEvidence(
  value: unknown,
  qualified: boolean,
  out: DeliveryFinding[],
): void {
  if (!obj(value) || !str(value["defaultCapture"]) || !str(value["reducedMotionCapture"]) ||
      typeof value["jsFailureChecked"] !== "boolean" ||
      typeof value["contentVisibleWithoutJs"] !== "boolean" ||
      typeof value["loadingLayoutStable"] !== "boolean") {
    out.push(finding("bad-motion-evidence", "motion evidence requires captures and boolean fallback results"));
    return;
  }
  if (qualified && (value["jsFailureChecked"] !== true || value["contentVisibleWithoutJs"] !== true ||
      value["loadingLayoutStable"] !== true)) {
    out.push(finding("false-qualified-v2", "motion, loading, and JavaScript-failure evidence must pass"));
  }
}

function validateControlEvidence(value: unknown, out: DeliveryFinding[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    out.push(finding("bad-control-evidence", "controlEvidence must be an array")); return [];
  }
  const rows = namedObjects(value);
  if (rows.length !== value.length || rows.some((row) =>
    !str(row["id"]) || typeof row["keyboardPassed"] !== "boolean" ||
    typeof row["pointerPassed"] !== "boolean" || !Array.isArray(row["statesCaptured"]))) {
    out.push(finding("bad-control-evidence", "control evidence requires id, keyboard/pointer results, and captured states"));
  }
  return rows;
}

function validateCompositionReview(
  value: unknown,
  qualified: boolean,
  out: DeliveryFinding[],
): void {
  if (!obj(value) || typeof value["thesisObserved"] !== "boolean" ||
      typeof value["signatureMoveObserved"] !== "boolean" ||
      typeof value["whitespaceSupportsHierarchy"] !== "boolean" ||
      !("finding" in value)) {
    out.push(finding("missing-composition-review", "composition review requires three observations and finding"));
    return;
  }
  if (qualified && (value["thesisObserved"] !== true || value["signatureMoveObserved"] !== true ||
      value["whitespaceSupportsHierarchy"] !== true || value["finding"] !== null)) {
    out.push(finding("false-qualified-v2", "composition thesis, signature move, and whitespace hierarchy must be observed without a finding"));
  }
}

function crossCheckContract(
  contract: Record<string, unknown>,
  assets: Record<string, unknown>[],
  responsive: Record<string, unknown>[],
  controls: Record<string, unknown>[],
  qualified: boolean,
  out: DeliveryFinding[],
): void {
  if (contract["kind"] !== "generation-contract" || contract["version"] !== 2) {
    out.push(finding("contract-version-mismatch", "version 2 qualification must reference a version 2 generation contract"));
    return;
  }
  if (!qualified) return;
  const policy = obj(contract["assetPolicy"]) ? contract["assetPolicy"] : {};
  const requiredAssets = [
    ...namedObjects(policy["logos"]), ...namedObjects(policy["images"]),
  ].filter((asset) => asset["provider"] !== "none");
  for (const asset of requiredAssets) {
    const evidence = assets.find((row) => row["role"] === asset["role"]);
    const expectedSource = asset["sourceRef"] ?? asset["sourceUrl"];
    if (!evidence || evidence["verified"] !== true || evidence["sourceRef"] !== expectedSource) {
      out.push(finding("false-qualified-v2", `asset role '${String(asset["role"])}' lacks matching verified evidence`));
    }
  }
  const requiredWidths = Array.isArray(contract["viewports"]) ? contract["viewports"] : [];
  for (const width of requiredWidths) {
    const evidence = responsive.find((row) => row["viewport"] === width);
    if (!evidence || evidence["passed"] !== true || evidence["overflowFree"] !== true) {
      out.push(finding("false-qualified-v2", `viewport ${String(width)} lacks passing overflow-free evidence`));
    }
  }
  const requiredControls = namedObjects(contract["controls"]).filter((row) => row["customBehavior"] === true);
  for (const control of requiredControls) {
    const evidence = controls.find((row) => row["id"] === control["id"]);
    if (!evidence || evidence["keyboardPassed"] !== true || evidence["pointerPassed"] !== true) {
      out.push(finding("missing-control-evidence", `custom control '${String(control["id"])}' lacks passing keyboard and pointer evidence`));
    }
  }
}
