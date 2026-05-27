/**
 * Audit family: format
 *
 * Checks DESIGN.md structural conformance to the Google-Labs alpha
 * spec. Operates on a parsed DesignMdDocument; no source or tokens
 * input required. This is the family that catches "the file isn't
 * even shaped right" before any source-fidelity work begins.
 *
 * Rules:
 *   - YAML front-matter parses (no parseErrors).
 *   - All 8 sections present.
 *   - Section order matches the spec (synonyms allowed per spec).
 *   - No duplicate headings.
 *   - `version` if present is exactly "alpha".
 *   - Every hex value in the YAML is exactly /^#[0-9a-fA-F]{6}$/.
 *   - Every dimension value is /^[0-9]*\.?[0-9]+(px|em|rem)$/.
 */
import { walkYamlLeaves } from "./designmd-parser.js";
import type { DesignMdDocument } from "./designmd-parser.js";
import type { AuditRow } from "./designmd-audit-types.js";

/** The 8 canonical sections in spec order, with accepted synonyms. */
const SPEC_SECTIONS: { canonical: string; synonyms: string[] }[] = [
  { canonical: "Overview",         synonyms: ["Overview", "Brand & Style"] },
  { canonical: "Colors",           synonyms: ["Colors"] },
  { canonical: "Typography",       synonyms: ["Typography"] },
  { canonical: "Layout",           synonyms: ["Layout", "Layout & Spacing"] },
  { canonical: "Elevation & Depth", synonyms: ["Elevation & Depth", "Elevation"] },
  { canonical: "Shapes",           synonyms: ["Shapes"] },
  { canonical: "Components",       synonyms: ["Components"] },
  { canonical: "Do's and Don'ts",  synonyms: ["Do's and Don'ts"] },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DIM_RE = /^[0-9]*\.?[0-9]+(px|em|rem)$/;

const COLOR_GROUP = "colors";
const SPACING_GROUP = "spacing";
const ROUNDED_GROUP = "rounded";
const TYPOGRAPHY_GROUP = "typography";

export function auditFormat(doc: DesignMdDocument): AuditRow[] {
  const rows: AuditRow[] = [];

  // 1. YAML parses
  if (doc.parseErrors.length === 0) {
    rows.push({ family: "format", rule: "yaml-parses", status: "PASS", detail: "front-matter parsed without errors" });
  } else {
    rows.push({
      family: "format",
      rule: "yaml-parses",
      status: "FAIL",
      detail: `${doc.parseErrors.length} parse error(s): ${doc.parseErrors.slice(0, 3).join("; ")}`,
      suggestedFix: "open DESIGN.md and fix the YAML indentation / keys at the lines listed",
    });
  }

  // 2. All 8 sections present + 3. ordered + 4. no duplicates
  const headings = doc.sectionHeadings;
  const matchedIndices: number[] = [];
  for (const heading of headings) {
    const matchIdx = SPEC_SECTIONS.findIndex(s => s.synonyms.includes(heading));
    if (matchIdx !== -1) matchedIndices.push(matchIdx);
  }

  const presentCanonicals = new Set(matchedIndices.map(i => SPEC_SECTIONS[i]!.canonical));
  const missing = SPEC_SECTIONS.filter(s => !presentCanonicals.has(s.canonical));
  if (missing.length === 0) {
    rows.push({ family: "format", rule: "all-8-sections-present", status: "PASS", detail: "all 8 spec sections found" });
  } else {
    rows.push({
      family: "format",
      rule: "all-8-sections-present",
      status: "FAIL",
      detail: `missing sections: ${missing.map(m => m.canonical).join(", ")}`,
      suggestedFix: "add the missing section heading(s) in spec order",
    });
  }

  // Ordering — strictly increasing matched indices
  let inOrder = true;
  for (let i = 1; i < matchedIndices.length; i++) {
    if (matchedIndices[i]! < matchedIndices[i - 1]!) {
      inOrder = false;
      break;
    }
  }
  rows.push({
    family: "format",
    rule: "sections-in-spec-order",
    status: inOrder ? "PASS" : "FAIL",
    detail: inOrder ? "section order matches spec" : `section order is wrong: got ${matchedIndices.map(i => SPEC_SECTIONS[i]!.canonical).join(" → ")}`,
    ...(inOrder ? {} : { suggestedFix: "rearrange the ## headings to match Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts" }),
  });

  // Duplicates
  const dupHeadings = headings.filter((h, i) => headings.indexOf(h) !== i);
  if (dupHeadings.length === 0) {
    rows.push({ family: "format", rule: "no-duplicate-headings", status: "PASS", detail: "every ## heading is unique" });
  } else {
    rows.push({
      family: "format",
      rule: "no-duplicate-headings",
      status: "FAIL",
      detail: `duplicate headings: ${[...new Set(dupHeadings)].join(", ")}`,
      suggestedFix: "merge or rename the duplicate ## headings",
    });
  }

  // 5. version if present equals "alpha"
  const version = doc.yamlTree["version"];
  if (typeof version === "string") {
    if (version === "alpha") {
      rows.push({ family: "format", rule: "version-is-alpha", status: "PASS", detail: 'version: "alpha"' });
    } else {
      rows.push({
        family: "format",
        rule: "version-is-alpha",
        status: "FAIL",
        detail: `version is '${version}' but spec only declares "alpha"`,
        suggestedFix: 'change `version: "..."` to `version: "alpha"` or remove the version key entirely',
      });
    }
  }

  // 6. Hex shape — every value under colors.* must be #RRGGBB
  const colorsNode = doc.yamlTree[COLOR_GROUP];
  if (colorsNode && typeof colorsNode !== "string") {
    const badHex: string[] = [];
    for (const [path, value] of walkYamlLeaves(colorsNode, COLOR_GROUP)) {
      if (!HEX_RE.test(value)) {
        badHex.push(`${path}: '${value}'`);
      }
    }
    if (badHex.length === 0) {
      rows.push({ family: "format", rule: "hex-shape", status: "PASS", detail: "every colour is #RRGGBB" });
    } else {
      rows.push({
        family: "format",
        rule: "hex-shape",
        status: "FAIL",
        detail: `${badHex.length} non-#RRGGBB value(s): ${badHex.slice(0, 3).join("; ")}`,
        suggestedFix: "convert each value to a six-digit lowercase hex string (e.g. \"#f97316\")",
      });
    }
  }

  // 7. Dimension shape — every value under spacing.* and rounded.* must be <n>px|em|rem
  const dimGroups = [SPACING_GROUP, ROUNDED_GROUP];
  for (const groupName of dimGroups) {
    const groupNode = doc.yamlTree[groupName];
    if (!groupNode || typeof groupNode === "string") continue;
    const badDim: string[] = [];
    for (const [path, value] of walkYamlLeaves(groupNode, groupName)) {
      if (!DIM_RE.test(value)) {
        badDim.push(`${path}: '${value}'`);
      }
    }
    if (badDim.length === 0) {
      rows.push({ family: "format", rule: `dimension-shape-${groupName}`, status: "PASS", detail: `every ${groupName} value is <n>px|em|rem` });
    } else {
      rows.push({
        family: "format",
        rule: `dimension-shape-${groupName}`,
        status: "FAIL",
        detail: `${badDim.length} non-dimension value(s) in ${groupName}: ${badDim.slice(0, 3).join("; ")}`,
        suggestedFix: 'change values to "<number>px" / "em" / "rem" (no unitless, no %, no vw/vh)',
      });
    }
  }

  // 8. Typography slot values: fontSize must be a dimension, lineHeight may be unitless number or dimension
  const typographyNode = doc.yamlTree[TYPOGRAPHY_GROUP];
  if (typographyNode && typeof typographyNode !== "string") {
    const badTypo: string[] = [];
    for (const [path, value] of walkYamlLeaves(typographyNode, TYPOGRAPHY_GROUP)) {
      if (path.endsWith(".fontSize") && !DIM_RE.test(value)) {
        badTypo.push(`${path}: '${value}'`);
      }
    }
    if (badTypo.length === 0) {
      rows.push({ family: "format", rule: "typography-fontSize-shape", status: "PASS", detail: "every typography.fontSize is a dimension" });
    } else {
      rows.push({
        family: "format",
        rule: "typography-fontSize-shape",
        status: "FAIL",
        detail: `${badTypo.length} bad fontSize value(s): ${badTypo.slice(0, 3).join("; ")}`,
        suggestedFix: 'change fontSize values to "<n>px" / "em" / "rem"',
      });
    }
  }

  return rows;
}
