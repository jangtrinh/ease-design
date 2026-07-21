import type { PromptPlanFinding } from "./prompt-plan-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
  objectValue as obj,
} from "./prompt-plan-shared-validation.js";

const HARD_GROUPS = [
  "brief-source-binding",
  "direction-divergence",
  "region-architecture",
  "layout-proportion",
  "asset-claims",
  "accessibility-states",
  "responsive-runtime",
] as const;
const HARD_CHECKS = [
  "missing-facet-source-coverage",
  "unresolved-decision-changing-ambiguity",
  "insufficient-direction-divergence",
  "missing-region-coverage",
  "missing-region-visual-strategy",
  "missing-region-visual-asset",
  "same-layout-different-copy",
  "unresolved-grid-contract",
  "missing-responsive-transformation",
  "ratio-without-rationale",
  "phi-everywhere",
  "responsive-ratio-preservation",
  "unsupported-claims",
  "invalid-asset-provenance",
  "invalid-visual-asset-contract",
  "fake-asset-evidence",
  "placeholder-primary-visual",
  "generated-fake-product-preview",
  "hero-viewport-overflow",
  "inaccessible-required-state",
  "builder-packet-over-budget",
  "missing-decision-ids",
  "conflicting-requirements",
] as const;
const CONTEXTUAL_CHECKS = [
  "eyebrow-overuse",
  "centered-hero-convergence",
  "serif-default-risk",
  "premium-palette-convergence",
  "weak-image-strategy",
  "unplanned-image-opportunity",
  "underpowered-hero-demonstration",
  "excessive-card-containment",
  "unmotivated-advanced-motion",
  "visual-system-drift",
  "depth-quality-decay-risk",
  "afterthought-conclusion-risk",
  "generated-copy-tells",
] as const;

export function validatePreflight(
  value: unknown,
  out: PromptPlanFinding[],
): void {
  if (!obj(value) || !Array.isArray(value["checks"])) {
    out.push(finding(
      "missing-preflight",
      "preflight",
      "prompt plan requires classified hard and contextual preflight checks",
    ));
    return;
  }
  const checks = namedObjects(value["checks"]);
  if (checks.length !== value["checks"].length || checks.some((row) =>
    !str(row["id"]) ||
    !str(row["group"]) ||
    !["hard", "contextual"].includes(String(row["severity"])) ||
    typeof row["passed"] !== "boolean"
  )) {
    out.push(finding(
      "malformed-preflight-check",
      "preflight",
      "preflight checks require id, group, severity, and boolean result",
    ));
    return;
  }
  for (const group of HARD_GROUPS) {
    if (!checks.some((row) => row["group"] === group && row["severity"] === "hard")) {
      out.push(finding(
        "missing-hard-preflight-group",
        "preflight",
        `missing hard preflight group '${group}'`,
      ));
    }
  }
  for (const id of HARD_CHECKS) {
    if (!checks.some((row) => row["id"] === id && row["severity"] === "hard")) {
      out.push(finding(
        "missing-hard-preflight-check",
        "preflight",
        `missing hard preflight check '${id}'`,
      ));
    }
  }
  for (const id of CONTEXTUAL_CHECKS) {
    if (!checks.some((row) => row["id"] === id && row["severity"] === "contextual")) {
      out.push(finding(
        "missing-contextual-preflight-check",
        "preflight",
        `missing contextual preflight check '${id}'`,
      ));
    }
  }
  for (const row of checks.filter((check) => check["passed"] === false)) {
    out.push(finding(
      String(row["id"]),
      "preflight",
      str(row["message"]) ? row["message"] : "preflight check failed",
      row["severity"] === "hard" ? "error" : "warning",
    ));
  }
}

export function validateBuilderPacket(
  value: unknown,
  out: PromptPlanFinding[],
): void {
  if (!obj(value) || !str(value["ref"]) || !Number.isInteger(value["tokenCount"])) {
    out.push(finding(
      "missing-builder-packet",
      "builder-packet",
      "builder packet requires a reference and integer tokenCount",
    ));
    return;
  }
  if (Number(value["tokenCount"]) > 6000) {
    out.push(finding(
      "builder-packet-over-budget",
      "builder-packet",
      "builder packet exceeds the approved 6,000-token budget",
    ));
  }
}
