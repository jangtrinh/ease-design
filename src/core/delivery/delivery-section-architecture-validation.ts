import type { DeliveryFinding } from "./delivery-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
  objectValue as obj,
  stringArray as strings,
} from "./delivery-shared-validation.js";

const REQUIRED_FIELDS = [
  "sectionId",
  "purpose",
  "narrativeRole",
  "layoutModel",
  "compositionAnchor",
  "contentDependency",
  "responsiveTransformation",
] as const;

export function validateSectionArchitecture(
  sectionValue: unknown,
  value: unknown,
  out: DeliveryFinding[],
): void {
  const sectionIds = strings(sectionValue) ?? [];
  const architecture = obj(value) ? value : {};
  const rows = namedObjects(architecture["sections"]);
  if (
    !obj(value) ||
    !str(architecture["pageNarrative"]) ||
    !Array.isArray(architecture["sections"]) ||
    rows.length !== architecture["sections"].length ||
    rows.some((row) => REQUIRED_FIELDS.some((field) => !str(row[field])))
  ) {
    out.push(finding("missing-section-architecture", "section architecture requires a page narrative and complete purpose, role, layout, anchor, content, and responsive declarations"));
    return;
  }
  const rowIds = rows.map((row) => row["sectionId"]).filter(str);
  if (!sameMembers(sectionIds, rowIds) || new Set(rowIds).size !== rowIds.length) {
    out.push(finding("section-architecture-coverage-mismatch", "section architecture must cover every declared section exactly once"));
  }
  const layoutCounts = count(rows.map((row) => String(row["layoutModel"])));
  const repeatedWithoutReason = rows.some((row) =>
    (layoutCounts.get(String(row["layoutModel"])) ?? 0) > 1 &&
    !str(row["repetitionRationale"]));
  if (repeatedWithoutReason || (rows.length >= 3 && layoutCounts.size < 2)) {
    out.push(finding("unjustified-section-redundancy", "repeated section layout models require a content or system rationale; three or more sections need at least two layout models"));
  }
}

export function validateSectionReview(
  value: unknown,
  qualified: boolean,
  out: DeliveryFinding[],
): Record<string, unknown>[] {
  const rows = namedObjects(value);
  if (
    !Array.isArray(value) ||
    rows.length !== value.length ||
    rows.some((row) =>
      !str(row["sectionId"]) ||
      !str(row["renderedRef"]) ||
      typeof row["topicFitObserved"] !== "boolean" ||
      typeof row["distinctCompositionObserved"] !== "boolean" ||
      typeof row["contentLayoutCoupled"] !== "boolean" ||
      !Array.isArray(row["decisionRefs"]) ||
      !(row["decisionRefs"] as unknown[]).every((ref) =>
        str(ref) && ref.startsWith("decision:")) ||
      !["missing-evidence", "weak-decision", "implementation-drift",
        "taste-preference", "floor-regression", null].includes(
        row["cause"] as string | null) ||
      !("finding" in row))
  ) {
    out.push(finding("bad-section-review", "section review requires rendered evidence and topic-fit, composition, and content-layout observations"));
    return rows;
  }
  if (rows.some((row) =>
    row["finding"] !== null &&
    ((row["decisionRefs"] as unknown[]).length === 0 || row["cause"] === null)
  )) {
    out.push(finding(
      "untraceable-section-finding",
      "section findings require prompt decision references and a classified cause",
    ));
  }
  if (qualified && rows.some((row) =>
    row["topicFitObserved"] !== true ||
    row["distinctCompositionObserved"] !== true ||
    row["contentLayoutCoupled"] !== true ||
    row["finding"] !== null)) {
    out.push(finding("false-qualified-section-redundancy", "QUALIFIED sections must visibly fit their topic, avoid unjustified composition reuse, and couple layout to content"));
  }
  return rows;
}

export function crossCheckSectionReview(
  contract: Record<string, unknown>,
  review: Record<string, unknown>[],
  qualified: boolean,
  out: DeliveryFinding[],
): void {
  if (!qualified) return;
  const sections = strings(contract["sections"]) ?? [];
  const reviewed = review.map((row) => row["sectionId"]).filter(str);
  if (!sameMembers(sections, reviewed) || new Set(reviewed).size !== reviewed.length) {
    out.push(finding("missing-section-review", "QUALIFIED evidence must review every contracted section exactly once"));
  }
}

function count(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
