export type PromptPlanSeverity = "error" | "warning";

export interface PromptPlanFinding {
  checkId: string;
  severity: PromptPlanSeverity;
  stage: string;
  message: string;
}

export interface PromptPlanResult {
  kind: "prompt-plan";
  version: 1;
  ready: boolean;
  errorCount: number;
  warningCount: number;
  findings: PromptPlanFinding[];
}

export class PromptPlanError extends Error {
  constructor(
    readonly code: "BAD_PROMPT_PLAN",
    message: string,
  ) {
    super(message);
  }
}
