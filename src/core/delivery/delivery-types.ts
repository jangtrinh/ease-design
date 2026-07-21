export const REQUIRED_GATES = [
  "validate-layout", "a11y-lint", "taste-lint", "content-lint", "ds-usage-lint", "ds-a11y",
] as const;
export const MARKETING_VIEWPORTS = [1440, 768, 390] as const;

export type DeliveryKind =
  | "design-brief"
  | "generation-contract"
  | "qualification-record"
  | "learning-record";
export type DeliverySeverity = "error" | "warning";
export interface DeliveryFinding { checkId: string; severity: DeliverySeverity; message: string }
export interface DeliveryResult {
  kind: DeliveryKind;
  version: number;
  errorCount: number;
  warningCount: number;
  findings: DeliveryFinding[];
}
export interface DeliveryValidationContext {
  contract?: Record<string, unknown>;
}
export class DeliveryError extends Error {
  constructor(readonly code: "BAD_DELIVERY", message: string) { super(message); }
}
