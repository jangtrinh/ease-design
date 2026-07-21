import type {
  PromptPlanFinding,
  PromptPlanSeverity,
} from "./prompt-plan-types.js";

export function objectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(nonEmptyString) ? value : null;
}

export function namedObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(objectValue) : [];
}

export function finding(
  checkId: string,
  stage: string,
  message: string,
  severity: PromptPlanSeverity = "error",
): PromptPlanFinding {
  return { checkId, severity, stage, message };
}

export function hasDecision(
  value: unknown,
): value is Record<string, unknown> {
  return objectValue(value) &&
    nonEmptyString(value["id"]) &&
    nonEmptyString(value["value"]) &&
    ["user", "reference", "project", "knowledge", "assumption"].includes(
      String(value["sourceType"]),
    ) &&
    nonEmptyString(value["sourceRef"]) &&
    ["high", "medium", "low"].includes(String(value["confidence"]));
}

export function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
