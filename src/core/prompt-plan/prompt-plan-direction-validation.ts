import type { PromptPlanFinding } from "./prompt-plan-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
} from "./prompt-plan-shared-validation.js";

const STRUCTURAL = [
  "structuralThesis",
  "focalMechanism",
  "regionRhythm",
  "signatureTechnique",
  "heroWorkspaceArchitecture",
  "shapeLanguage",
] as const;

export function validateDirections(
  json: Record<string, unknown>,
  out: PromptPlanFinding[],
): void {
  const rows = namedObjects(json["directions"]);
  if (
    rows.length !== 3 ||
    rows.some((row) =>
      !str(row["id"]) ||
      STRUCTURAL.some((field) => !str(row[field])) ||
      !Number.isFinite(row["briefFitScore"]) ||
      !Number.isFinite(row["executionRiskScore"]) ||
      !Number.isFinite(row["convergenceRiskScore"]) ||
      !str(row["selectionDecision"])
    )
  ) {
    out.push(finding(
      "incomplete-direction-set",
      "direction-exploration",
      "prompt plan requires exactly three scored and preserved structural directions",
    ));
    return;
  }
  const ids = rows.map((row) => String(row["id"]));
  if (new Set(ids).size !== ids.length || !ids.includes(String(json["selectedDirectionId"]))) {
    out.push(finding(
      "invalid-direction-selection",
      "direction-exploration",
      "direction IDs must be unique and selectedDirectionId must resolve",
    ));
  }
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const different = STRUCTURAL.filter(
        (field) => rows[left]?.[field] !== rows[right]?.[field],
      );
      const required = ["structuralThesis", "focalMechanism", "signatureTechnique"];
      if (different.length < 4 || required.some((field) => !different.includes(
        field as (typeof STRUCTURAL)[number],
      ))) {
        out.push(finding(
          "insufficient-direction-divergence",
          "direction-exploration",
          `directions '${ids[left]}' and '${ids[right]}' are cosmetic rather than structurally divergent`,
        ));
      }
    }
  }
}
