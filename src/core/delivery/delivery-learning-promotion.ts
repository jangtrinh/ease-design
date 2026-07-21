import type { DeliveryFinding } from "./delivery-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
  objectValue as obj,
} from "./delivery-shared-validation.js";

const CEILING_AXES = [
  "originality",
  "hierarchy",
  "composition",
  "emotionalImpact",
  "motionCraft",
  "responsiveArtDirection",
  "referenceFidelity",
] as const;

export function validateLearnings(
  value: unknown,
  trials: Record<string, unknown>[],
  out: DeliveryFinding[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    out.push(
      finding(
        "missing-learnings",
        "learnings must contain at least one lesson",
      ),
    );
    return;
  }
  if (namedObjects(value).length !== value.length) {
    out.push(finding("bad-learning", "every lesson must be an object"));
  }
  const knownCases = new Set(trials.map((trial) => trial["caseId"]));
  for (const lesson of namedObjects(value)) {
    if (
      !str(lesson["id"]) ||
      !str(lesson["statement"]) ||
      !["hard-rule", "taste-pattern", "contextual-recipe"].includes(
        String(lesson["class"]),
      ) ||
      !["hypothesis", "candidate", "promoted", "rejected"].includes(
        String(lesson["status"]),
      )
    ) {
      out.push(
        finding(
          "bad-learning",
          "lesson requires id, statement, class, and valid status",
        ),
      );
      continue;
    }
    const caseIds = Array.isArray(lesson["evidenceCaseIds"])
      ? [...new Set(lesson["evidenceCaseIds"].filter(str))]
      : [];
    if (caseIds.length === 0 || caseIds.some((id) => !knownCases.has(id))) {
      out.push(
        finding(
          "unsupported-learning",
          `lesson '${String(lesson["id"])}' must reference known evidence cases`,
        ),
      );
    }
    if (
      lesson["status"] === "promoted" &&
      !promotionSupported(lesson, caseIds, trials)
    ) {
      out.push(
        finding(
          "premature-learning-promotion",
          `lesson '${String(lesson["id"])}' needs expert approval or repeated winning evidence across 3 cases and 2 categories`,
        ),
      );
    }
  }
}

function promotionSupported(
  lesson: Record<string, unknown>,
  caseIds: string[],
  trials: Record<string, unknown>[],
): boolean {
  const approval = obj(lesson["expertApproval"])
    ? lesson["expertApproval"]
    : {};
  if (approval["approved"] === true && str(approval["ref"])) return true;
  const evidence = trials.filter((trial) =>
    caseIds.includes(String(trial["caseId"])),
  );
  return (
    evidence.length >= 3 &&
    new Set(evidence.map((trial) => trial["category"])).size >= 2 &&
    evidence.every(artDirectionWins)
  );
}

function artDirectionWins(trial: Record<string, unknown>): boolean {
  const variants = namedObjects(trial["variants"]);
  const qualified = variants.find(
    (variant) => variant["workflow"] === "qualified",
  );
  const directed = variants.find(
    (variant) => variant["workflow"] === "art-directed",
  );
  return Boolean(
    qualified &&
    directed &&
    directed["criticalFailures"] === 0 &&
    meanScore(directed["ceilingScores"]) >
      meanScore(qualified["ceilingScores"]),
  );
}

function meanScore(value: unknown): number {
  if (!obj(value)) return -1;
  const scores = CEILING_AXES.map((axis) => value[axis]);
  if (scores.some((score) => typeof score !== "number")) return -1;
  return (
    scores.reduce<number>((sum, score) => sum + Number(score), 0) /
    scores.length
  );
}
