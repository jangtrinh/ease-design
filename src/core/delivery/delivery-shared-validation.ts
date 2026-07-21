import { DeliveryError } from "./delivery-types.js";
import type { DeliveryFinding, DeliveryKind, DeliverySeverity } from "./delivery-types.js";

export function objectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(nonEmptyString) ? value : null;
}
export function numberArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((n) => Number.isInteger(n) && n > 0)
    ? value as number[] : null;
}
export function finding(
  checkId: string,
  message: string,
  severity: DeliverySeverity = "error",
): DeliveryFinding {
  return { checkId, severity, message };
}
export function requireBase(
  json: Record<string, unknown>,
  kind: DeliveryKind,
  version: 1 | 2,
): void {
  if (json["kind"] !== kind || json["version"] !== version) {
    throw new DeliveryError("BAD_DELIVERY", `expected kind '${kind}' and version ${version}`);
  }
}
export function namedObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(objectValue) : [];
}
