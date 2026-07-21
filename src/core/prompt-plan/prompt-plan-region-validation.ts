import type { PromptPlanFinding } from "./prompt-plan-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
} from "./prompt-plan-shared-validation.js";

const REQUIRED = [
  "id",
  "purpose",
  "role",
  "entryState",
  "exitState",
  "contentDependency",
  "layoutModel",
  "compositionAnchor",
  "hierarchyEvent",
  "alignmentKeylines",
  "contentMeasure",
  "groupingModel",
  "interaction",
  "responsiveTransformation",
  "memorableDetail",
  "antiPattern",
  "craftInvestment",
] as const;

const IMAGE_VISUALS = new Set([
  "generated-image",
  "provided-image",
  "licensed-image",
  "project-image",
]);
const VISUAL_TYPES = new Set([
  ...IMAGE_VISUALS,
  "product-ui",
  "diagram",
  "typography",
  "interaction",
  "none",
]);

export function validateRegions(
  value: unknown,
  out: PromptPlanFinding[],
): void {
  const rows = namedObjects(value);
  if (
    !Array.isArray(value) ||
    rows.length !== value.length ||
    rows.length < 2 ||
    rows.some((row) => REQUIRED.some((field) => !str(row[field])))
  ) {
    out.push(finding(
      "missing-region-production-brief",
      "region-architecture",
      "every major section or product region requires a complete production brief",
    ));
    return;
  }
  const ids = rows.map((row) => String(row["id"]));
  if (new Set(ids).size !== ids.length) {
    out.push(finding(
      "duplicate-region-id",
      "region-architecture",
      "major region IDs must be unique",
    ));
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    const model = String(row["layoutModel"]);
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  if (rows.some((row) =>
    (counts.get(String(row["layoutModel"])) ?? 0) > 1 &&
    !str(row["repetitionRationale"])
  )) {
    out.push(finding(
      "same-layout-different-copy",
      "region-architecture",
      "repeated layout models require a product, content, task, or system rationale",
    ));
  }
  if (rows.some((row) =>
    !VISUAL_TYPES.has(String(row["visualType"])) || !str(row["visualRationale"])
  )) {
    out.push(finding(
      "missing-region-visual-strategy",
      "region-architecture",
      "every major region requires an explicit supported visual type and rationale",
    ));
  }
  if (rows.some((row) =>
    IMAGE_VISUALS.has(String(row["visualType"])) && !str(row["assetId"])
  )) {
    out.push(finding(
      "missing-region-visual-asset",
      "asset-claims",
      "image-led regions must reference a planned delivery asset",
    ));
  }
}
