import {
  DeliveryError,
} from "./delivery-types.js";
import type {
  DeliveryKind, DeliveryResult, DeliveryValidationContext,
} from "./delivery-types.js";
import { nonEmptyString as str, objectValue as obj } from "./delivery-shared-validation.js";
import {
  validateBriefV1, validateContractV1, validateQualificationV1,
} from "./delivery-v1-validation.js";
import { validateContractV2 } from "./delivery-v2-contract-validation.js";
import { validateQualificationV2 } from "./delivery-v2-qualification-validation.js";
import { validateLearningRecordV1 } from "./delivery-learning-validation.js";

export function validateDelivery(
  json: unknown,
  context: DeliveryValidationContext = {},
): DeliveryResult {
  if (!obj(json) || !str(json["kind"])) {
    throw new DeliveryError("BAD_DELIVERY", "delivery artifact must be an object with kind");
  }
  const kind = json["kind"] as DeliveryKind;
  const version = json["version"];
  if (!["design-brief", "generation-contract", "qualification-record", "learning-record"].includes(kind)) {
    throw new DeliveryError("BAD_DELIVERY", `unknown kind '${kind}'; expected design-brief|generation-contract|qualification-record|learning-record`);
  }
  if (version !== 1 && version !== 2) {
    throw new DeliveryError("BAD_DELIVERY", "delivery artifact version must be 1 or 2");
  }
  if (kind === "design-brief" && version !== 1) {
    throw new DeliveryError("BAD_DELIVERY", "design-brief currently supports version 1 only");
  }
  if (kind === "learning-record" && version !== 1) {
    throw new DeliveryError("BAD_DELIVERY", "learning-record currently supports version 1 only");
  }
  const findings = kind === "learning-record"
    ? validateLearningRecordV1(json)
    : kind === "design-brief"
    ? validateBriefV1(json)
    : kind === "generation-contract"
      ? version === 1 ? validateContractV1(json) : validateContractV2(json)
      : version === 1 ? validateQualificationV1(json) : validateQualificationV2(json, context);
  return {
    kind,
    version,
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
    findings,
  };
}
