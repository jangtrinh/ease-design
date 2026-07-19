export const REQUIRED_GATES = [
  "validate-layout", "a11y-lint", "taste-lint", "content-lint", "ds-usage-lint", "ds-a11y",
] as const;
export const MARKETING_VIEWPORTS = [1440, 768, 390] as const;
export type DeliveryKind = "design-brief" | "generation-contract" | "qualification-record";
export type DeliverySeverity = "error" | "warning";
export interface DeliveryFinding { checkId: string; severity: DeliverySeverity; message: string }
export interface DeliveryResult {
  kind: DeliveryKind; errorCount: number; warningCount: number; findings: DeliveryFinding[];
}
export class DeliveryError extends Error {
  constructor(readonly code: "BAD_DELIVERY", message: string) { super(message); }
}
function obj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function str(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function strings(v: unknown): string[] | null {
  return Array.isArray(v) && v.every(str) ? v : null;
}
function numbers(v: unknown): number[] | null {
  return Array.isArray(v) && v.every((n) => Number.isInteger(n) && n > 0) ? v as number[] : null;
}
function finding(checkId: string, message: string, severity: DeliverySeverity = "error"): DeliveryFinding {
  return { checkId, severity, message };
}
function requireBase(j: Record<string, unknown>, kind: DeliveryKind): void {
  if (j["kind"] !== kind || j["version"] !== 1) {
    throw new DeliveryError("BAD_DELIVERY", `expected kind '${kind}' and version 1`);
  }
}
function validateBrief(j: Record<string, unknown>): DeliveryFinding[] {
  requireBase(j, "design-brief");
  const required = ["rawRequest", "audience", "context", "primaryOutcome", "primaryAction"] as const;
  const out = required.filter((k) => !str(j[k])).map((k) => finding("missing-field", `${k} must be a non-empty string`));
  if (j["surface"] !== "marketing-landing") out.push(finding("unsupported-surface", "P0 supports surface 'marketing-landing' only"));
  for (const key of ["requiredContent", "constraints", "prohibitedClaims"] as const) {
    const values = strings(j[key]);
    if (values === null || (key === "requiredContent" && values.length === 0)) out.push(finding("bad-list", `${key} must be ${key === "requiredContent" ? "a non-empty" : "an"} array of strings`));
  }
  if (!Array.isArray(j["criteria"]) || j["criteria"].length === 0) out.push(finding("missing-criteria", "criteria must be non-empty"));
  else {
    const ids = new Set<string>(); let must = 0;
    for (const c of j["criteria"]) {
      if (!obj(c) || !str(c["id"]) || !str(c["text"]) || !["must", "should"].includes(String(c["priority"]))) {
        out.push(finding("bad-criterion", "each criterion needs id, text, and must|should priority")); continue;
      }
      if (ids.has(c["id"])) out.push(finding("duplicate-criterion", `duplicate criterion '${c["id"]}'`));
      ids.add(c["id"]); if (c["priority"] === "must") must += 1;
    }
    if (must === 0) out.push(finding("missing-must", "at least one criterion must have priority 'must'"));
  }
  if (!Array.isArray(j["assumptions"])) out.push(finding("bad-assumptions", "assumptions must be an array"));
  else for (const a of j["assumptions"]) {
    if (!obj(a) || !str(a["facet"]) || !str(a["value"]) ||
        !["provided", "project-evidence", "inferred", "unknown"].includes(String(a["provenance"])) ||
        !["high", "medium", "low"].includes(String(a["confidence"]))) {
      out.push(finding("bad-assumption", "every assumption needs facet, value, provenance, and confidence"));
    }
  }
  return out;
}
function validateContract(j: Record<string, unknown>): DeliveryFinding[] {
  requireBase(j, "generation-contract"); const out: DeliveryFinding[] = [];
  if (!str(j["briefRef"])) out.push(finding("missing-brief-ref", "briefRef must be non-empty"));
  const d = j["direction"];
  if (!obj(d) || ["thesis", "structure", "focalMechanism", "signatureDevice", "risk"].some((k) => !str(d[k]))) {
    out.push(finding("bad-direction", "direction must declare thesis, structure, focalMechanism, signatureDevice, and risk"));
  }
  const sections = strings(j["sections"]); if (sections === null || sections.length === 0) out.push(finding("missing-sections", "sections must be non-empty"));
  const viewports = numbers(j["viewports"]);
  if (viewports === null) out.push(finding("bad-viewports", "viewports must be positive integers"));
  else for (const width of MARKETING_VIEWPORTS) if (!viewports.includes(width)) out.push(finding("missing-viewport", `required marketing viewport ${width}px is missing`));
  const gates = strings(j["requiredGates"]);
  if (gates === null) out.push(finding("bad-gates", "requiredGates must be strings"));
  else for (const gate of REQUIRED_GATES) if (!gates.includes(gate)) out.push(finding("missing-gate", `required gate '${gate}' is missing`));
  if (j["output"] !== "html") out.push(finding("bad-output", "P0 output must be 'html'"));
  return out;
}
function validateQualification(j: Record<string, unknown>): DeliveryFinding[] {
  requireBase(j, "qualification-record"); const out: DeliveryFinding[] = [];
  if (!str(j["contractRef"])) out.push(finding("missing-contract-ref", "contractRef must be non-empty"));
  if (!Number.isInteger(j["attempt"]) || Number(j["attempt"]) < 1 || Number(j["attempt"]) > 3) out.push(finding("attempt-cap", "attempt must be an integer from 1 to 3"));
  const statuses = ["QUALIFIED", "DRAFT_WITH_CONCERNS", "BLOCKED_BY_EVIDENCE"];
  if (!statuses.includes(String(j["status"]))) out.push(finding("bad-status", `status must be ${statuses.join("|")}`));
  const gates = Array.isArray(j["machineGates"]) ? j["machineGates"] : [];
  if (!Array.isArray(j["machineGates"])) out.push(finding("bad-gate-results", "machineGates must be an array"));
  else if (gates.some((g) => !obj(g) || !str(g["name"]) || typeof g["passed"] !== "boolean")) {
    out.push(finding("bad-gate-result", "each machine gate needs a name and boolean passed result"));
  }
  for (const name of REQUIRED_GATES) {
    const gate = gates.find((g) => obj(g) && g["name"] === name);
    if (!obj(gate) || typeof gate["passed"] !== "boolean") out.push(finding("missing-gate-result", `machine gate '${name}' has no boolean result`));
  }
  if (numbers(j["renderedViewports"]) === null) out.push(finding("bad-rendered-viewports", "renderedViewports must be positive integers"));
  const criteria = Array.isArray(j["mustCriteria"]) ? j["mustCriteria"] : [];
  if (!Array.isArray(j["mustCriteria"]) || criteria.some((c) => !obj(c) || !str(c["id"]) || typeof c["covered"] !== "boolean")) {
    out.push(finding("bad-must-criteria", "mustCriteria must contain id and boolean covered"));
  }
  if (!Number.isInteger(j["unsupportedClaimCount"]) || Number(j["unsupportedClaimCount"]) < 0) {
    out.push(finding("bad-claim-count", "unsupportedClaimCount must be a non-negative integer"));
  }
  if (strings(j["unresolvedFindings"]) === null) out.push(finding("bad-unresolved-findings", "unresolvedFindings must be strings"));
  const qualified = j["status"] === "QUALIFIED";
  if (qualified) {
    for (const g of gates) if (obj(g) && g["passed"] === false) out.push(finding("false-qualified", `QUALIFIED cannot contain failed gate '${String(g["name"])}'`));
    const widths = numbers(j["renderedViewports"]) ?? [];
    for (const width of MARKETING_VIEWPORTS) if (!widths.includes(width)) out.push(finding("false-qualified", `QUALIFIED lacks rendered ${width}px evidence`));
    if (criteria.length === 0 || criteria.some((c) => !obj(c) || c["covered"] !== true)) out.push(finding("false-qualified", "all Must criteria need covered:true"));
    if (j["unsupportedClaimCount"] !== 0) out.push(finding("false-qualified", "QUALIFIED requires zero unsupported claims"));
    if (!Array.isArray(j["unresolvedFindings"]) || j["unresolvedFindings"].length > 0) out.push(finding("false-qualified", "QUALIFIED requires zero unresolved findings"));
  }
  if (j["status"] === "BLOCKED_BY_EVIDENCE" && !str(j["blocker"])) out.push(finding("missing-blocker", "BLOCKED_BY_EVIDENCE requires blocker"));
  return out;
}
export function validateDelivery(json: unknown): DeliveryResult {
  if (!obj(json) || !str(json["kind"])) throw new DeliveryError("BAD_DELIVERY", "delivery artifact must be an object with kind");
  const kind = json["kind"] as DeliveryKind;
  if (!["design-brief", "generation-contract", "qualification-record"].includes(kind)) {
    throw new DeliveryError("BAD_DELIVERY", `unknown kind '${kind}'; expected design-brief|generation-contract|qualification-record`);
  }
  const findings = kind === "design-brief" ? validateBrief(json) : kind === "generation-contract" ? validateContract(json) : validateQualification(json);
  return { kind, errorCount: findings.filter((f) => f.severity === "error").length, warningCount: findings.filter((f) => f.severity === "warning").length, findings };
}
