import type { DeliveryFinding } from "./delivery-types.js";
import {
  finding,
  nonEmptyString as str,
  objectValue as obj,
} from "./delivery-shared-validation.js";
import { validateArtEvidence } from "./delivery-art-evidence-validation.js";

const IDENTITY_AXES = [
  "paletteFamily",
  "typePairing",
  "heroArchitecture",
  "signatureTechnique",
  "ctaGarment",
  "shapeLanguage",
] as const;

export function validateIdentitySignature(
  variant: Record<string, unknown>,
  out: DeliveryFinding[],
): void {
  const identity = obj(variant["identitySignature"])
    ? variant["identitySignature"]
    : {};
  if (
    !obj(variant["identitySignature"]) ||
    IDENTITY_AXES.some((axis) => !str(identity[axis]))
  ) {
    out.push(
      finding(
        "missing-identity-signature",
        `identitySignature must declare ${IDENTITY_AXES.join(", ")}`,
      ),
    );
  }
}

export function validateArtDirection(
  variant: Record<string, unknown>,
  out: DeliveryFinding[],
): void {
  const direction = obj(variant["artDirection"]) ? variant["artDirection"] : {};
  const designRead = obj(direction["designRead"])
    ? direction["designRead"]
    : {};
  const dials = obj(direction["dials"]) ? direction["dials"] : {};
  if (
    !obj(variant["artDirection"]) ||
    ["pageKind", "audience", "vibe", "systemFamily"].some(
      (field) => !str(designRead[field]),
    ) ||
    ["designVariance", "motionIntensity", "visualDensity"].some(
      (field) => !dial(dials[field]),
    )
  ) {
    out.push(
      finding(
        "missing-art-direction-contract",
        "art-directed variants require a Design Read and integer 1–10 variance, motion, and density dials",
      ),
    );
  }
  validateArtEvidence(variant, direction, out);
}

export function validateConvergence(
  trial: Record<string, unknown>,
  out: DeliveryFinding[],
): void {
  const analysis = obj(trial["convergenceAnalysis"])
    ? trial["convergenceAnalysis"]
    : {};
  const repeated = stringList(analysis["repeatedAxes"]);
  const justified = stringList(analysis["justifiedAxes"]);
  const refs = stringList(analysis["recentCaseRefs"]);
  if (
    !obj(trial["convergenceAnalysis"]) ||
    refs === null ||
    refs.length === 0 ||
    repeated === null ||
    justified === null ||
    !["distinct", "evidence-justified-repeat", "default-convergence"].includes(
      String(analysis["verdict"]),
    )
  ) {
    out.push(
      finding(
        "missing-convergence-analysis",
        "each trial requires recentCaseRefs, repeatedAxes, justifiedAxes, and a convergence verdict",
      ),
    );
    return;
  }
  if (
    [...repeated, ...justified].some(
      (axis) => !IDENTITY_AXES.includes(axis as (typeof IDENTITY_AXES)[number]),
    ) ||
    justified.some((axis) => !repeated.includes(axis))
  ) {
    out.push(
      finding(
        "bad-convergence-analysis",
        "convergence axes must use the six identity fields and justifiedAxes must be repeated",
      ),
    );
  }
  if (
    analysis["verdict"] === "default-convergence" ||
    repeated.some((axis) => !justified.includes(axis))
  ) {
    out.push(
      finding(
        "unjustified-default-convergence",
        "repeated identity defaults require explicit project or brand justification",
      ),
    );
  }
}

function dial(value: unknown): boolean {
  return (
    Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 10
  );
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(str) ? value : null;
}
