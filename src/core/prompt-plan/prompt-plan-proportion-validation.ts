import type { PromptPlanFinding } from "./prompt-plan-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
  objectValue as obj,
  stringArray,
} from "./prompt-plan-shared-validation.js";

const REQUIRED_MODES = ["content-led", "golden"];

export function validateProportions(
  value: unknown,
  regionCount: number,
  out: PromptPlanFinding[],
): void {
  const rows = namedObjects(value);
  const modes = rows.map((row) => row["mode"]).filter(str);
  if (
    !Array.isArray(value) ||
    rows.length !== 2 ||
    REQUIRED_MODES.some((mode) => !modes.includes(mode)) ||
    rows.some((row) =>
      !str(row["id"]) ||
      !str(row["mode"]) ||
      !obj(row["pageGrid"]) ||
      !Array.isArray(row["alignmentKeylines"]) ||
      !Array.isArray(row["spacingScale"]) ||
      !Array.isArray(row["typeScale"]) ||
      !str(row["textMeasure"]) ||
      !Array.isArray(row["breakpoints"]) ||
      !Array.isArray(row["regionGeometry"]) ||
      !Array.isArray(row["ratioApplications"])
    )
  ) {
    out.push(finding(
      "incomplete-proportion-candidates",
      "proportion-system",
      "content-led and golden candidates require complete grid, scale, measure, breakpoint, region, and ratio plans",
    ));
    return;
  }
  const golden = rows.find((row) => row["mode"] === "golden") ?? {};
  const applications = namedObjects(golden["ratioApplications"]);
  if (applications.some((row) =>
    !str(row["regionId"]) ||
    !str(row["target"]) ||
    !str(row["contentRationale"]) ||
    !str(row["fallback"]) ||
    !Number.isFinite(row["ratio"])
  )) {
    out.push(finding(
      "ratio-without-content-rationale",
      "proportion-system",
      "golden applications require region, target, ratio, content rationale, and fallback",
    ));
  }
  const uniqueRegions = new Set(applications.map((row) => row["regionId"]));
  if (regionCount > 0 && uniqueRegions.size / regionCount > 0.4) {
    out.push(finding(
      "phi-everywhere",
      "proportion-system",
      "golden ratio may not dominate more than 40% of major regions",
    ));
  }
  if (applications.some((row) =>
    Number(row["nestingDepth"] ?? 1) > 2 ||
    Number(row["applicationsInRegion"] ?? 1) > 2
  )) {
    out.push(finding(
      "nested-ratio-decoration",
      "proportion-system",
      "golden nesting depth and prominent applications per region are limited to two",
    ));
  }
  const releaseRules = stringArray(golden["responsiveReleaseRules"]);
  if (!releaseRules || releaseRules.length === 0) {
    out.push(finding(
      "responsive-ratio-preservation",
      "proportion-system",
      "golden candidate must declare rules that release phi for content and responsive stability",
    ));
  }
}
