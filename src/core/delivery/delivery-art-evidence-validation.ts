import type { DeliveryFinding } from "./delivery-types.js";
import {
  finding,
  namedObjects,
  nonEmptyString as str,
  objectValue as obj,
} from "./delivery-shared-validation.js";

const FIDELITY_FIELDS = [
  "typographyRef",
  "spacingRef",
  "paletteRef",
  "componentRef",
  "motifRef",
  "renderedOutputRef",
] as const;

export function validateArtEvidence(
  variant: Record<string, unknown>,
  direction: Record<string, unknown>,
  out: DeliveryFinding[],
): void {
  validateBoards(
    direction["majorSections"],
    direction["boards"],
    variant["boardRefs"],
    out,
  );
  const fidelity = direction["fidelity"];
  if (
    !obj(fidelity) ||
    FIDELITY_FIELDS.some((field) => !str(fidelity[field]))
  ) {
    out.push(
      finding(
        "missing-board-fidelity-evidence",
        `board fidelity must cite ${FIDELITY_FIELDS.join(", ")}`,
      ),
    );
  }
  validateAssets(direction["assetManifest"], out);
}

function validateBoards(
  sectionValue: unknown,
  value: unknown,
  refValue: unknown,
  out: DeliveryFinding[],
): void {
  const sections = stringList(sectionValue);
  const boards = namedObjects(value);
  if (
    sections === null ||
    sections.length === 0 ||
    new Set(sections).size !== sections.length ||
    !Array.isArray(value) ||
    boards.length === 0 ||
    boards.length !== value.length ||
    boards.some(
      (board) =>
        [
          "sectionId",
          "boardRef",
          "selectionRationale",
          "compositionAnchor",
        ].some((field) => !str(board[field])) ||
        !["accepted", "rerolled"].includes(String(board["rerollDecision"])),
    )
  ) {
    out.push(
      finding(
        "missing-section-board-evidence",
        "art direction requires declared major sections and boards with rationale, reroll decision, and composition anchor",
      ),
    );
    return;
  }
  const boardSections = boards.map((board) => board["sectionId"]).filter(str);
  const boardRefs = boards.map((board) => board["boardRef"]).filter(str);
  if (
    new Set(boardSections).size !== boardSections.length ||
    new Set(boardRefs).size !== boardRefs.length
  ) {
    out.push(
      finding(
        "duplicate-section-board",
        "section board IDs and references must be unique",
      ),
    );
  }
  if (
    !sameMembers(sections, boardSections) ||
    !sameMembers(stringList(refValue) ?? [], boardRefs)
  ) {
    out.push(
      finding(
        "section-board-coverage-mismatch",
        "majorSections, board section IDs, and boardRefs must describe the same complete board set",
      ),
    );
  }
}

function validateAssets(value: unknown, out: DeliveryFinding[]): void {
  const assets = namedObjects(value);
  if (
    !Array.isArray(value) ||
    assets.length === 0 ||
    assets.length !== value.length ||
    assets.some(
      (asset) =>
        ["id", "role", "sourceRef", "paletteGradeFamily"].some(
          (field) => !str(asset[field]),
        ) ||
        !["user", "project", "generated", "stock", "none"].includes(
          String(asset["sourceType"]),
        ) ||
        !["production", "rejected"].includes(String(asset["status"])) ||
        !Array.isArray(asset["usedIn"]) ||
        !asset["usedIn"].every(str) ||
        (asset["status"] === "production" &&
          (asset["sourceType"] === "none" ||
            !str(asset["localRef"]) ||
            asset["usedIn"].length === 0)),
    )
  ) {
    out.push(
      finding(
        "invalid-asset-manifest",
        "assets require provenance, palette/grade, status, and production usage/local references",
      ),
    );
  }
  const production = assets.filter((asset) => asset["status"] === "production");
  if (
    new Set(production.map((asset) => asset["id"])).size !== production.length
  ) {
    out.push(
      finding(
        "duplicate-production-asset",
        "production asset IDs must be unique",
      ),
    );
  }
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(str) ? value : null;
}

function sameMembers(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}
