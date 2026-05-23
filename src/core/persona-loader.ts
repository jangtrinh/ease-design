/**
 * Persona index loader: reads knowledge/personas/personas.json and validates
 * each record against the PersonaRecord schema.
 *
 * Discovery order (first hit wins):
 *   1. explicit path argument (from --persona-data flag)
 *   2. process.env.UI_PERSONAS_PATH
 *   3. <binary-dir>/../knowledge/personas/personas.json (installed-alongside default)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersonaRecord {
  slug: string;
  family: string;
  uiTypes: string[];
  density: "compact" | "comfortable" | "spacious";
  colorMode: "light" | "dark" | "both";
  trending?: boolean;
  keywords: string[];
  typography: {
    fontFamilyDisplay: string;
    fontFamilyBody: string;
    fontWeightBody: number;
    fontWeightHeading: number;
  };
  colorPhilosophy: {
    primaryHex: string;       // required
    neutralHex?: string;
    successHex?: string;
    warningHex?: string;
    dangerHex?: string;
    infoHex?: string;
    bgLightHex?: string;
    bgDarkHex?: string;
  };
  radius: { sm: string; md: string; lg: string; full: string };
  spacing: { base: number };
  shadowIntensity: "none" | "soft" | "medium" | "strong";
  antiPatterns: string[];
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class PersonaError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PersonaError";
    this.code = code;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
const DENSITY_VALUES = new Set(["compact", "comfortable", "spacious"]);
const COLOR_MODE_VALUES = new Set(["light", "dark", "both"]);
const SHADOW_INTENSITY_VALUES = new Set(["none", "soft", "medium", "strong"]);

const RECORD_ALLOWED_KEYS = new Set([
  "slug", "family", "uiTypes", "density", "colorMode", "trending",
  "keywords", "typography", "colorPhilosophy", "radius", "spacing",
  "shadowIntensity", "antiPatterns",
]);

const TYPOGRAPHY_ALLOWED_KEYS = new Set([
  "fontFamilyDisplay", "fontFamilyBody", "fontWeightBody", "fontWeightHeading",
]);

const COLOR_PHILOSOPHY_ALLOWED_KEYS = new Set([
  "primaryHex", "neutralHex", "successHex", "warningHex",
  "dangerHex", "infoHex", "bgLightHex", "bgDarkHex",
]);

const RADIUS_ALLOWED_KEYS = new Set(["sm", "md", "lg", "full"]);
const SPACING_ALLOWED_KEYS = new Set(["base"]);

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate one raw object against the PersonaRecord shape.
 * Throws PersonaError("BAD_PERSONA_INDEX") on any violation.
 */
export function validatePersonaRecord(obj: unknown): PersonaRecord {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new PersonaError("BAD_PERSONA_INDEX", "persona record must be a plain object");
  }
  const r = obj as Record<string, unknown>;

  // additionalProperties: false
  for (const key of Object.keys(r)) {
    if (!RECORD_ALLOWED_KEYS.has(key)) {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona record has unexpected property '${key}'`);
    }
  }

  // slug
  if (typeof r["slug"] !== "string" || !SLUG_RE.test(r["slug"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", "persona.slug must match ^[a-z][a-z0-9-]*$");
  }

  // family
  if (typeof r["family"] !== "string" || !SLUG_RE.test(r["family"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", "persona.family must match ^[a-z][a-z0-9-]*$");
  }

  // uiTypes
  if (!Array.isArray(r["uiTypes"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': uiTypes must be an array`);
  }
  for (const t of r["uiTypes"] as unknown[]) {
    if (typeof t !== "string") {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': each uiType must be a string`);
    }
  }

  // density
  if (typeof r["density"] !== "string" || !DENSITY_VALUES.has(r["density"])) {
    throw new PersonaError(
      "BAD_PERSONA_INDEX",
      `persona '${r["slug"]}': density must be one of: ${[...DENSITY_VALUES].join(", ")}`,
    );
  }

  // colorMode
  if (typeof r["colorMode"] !== "string" || !COLOR_MODE_VALUES.has(r["colorMode"])) {
    throw new PersonaError(
      "BAD_PERSONA_INDEX",
      `persona '${r["slug"]}': colorMode must be one of: ${[...COLOR_MODE_VALUES].join(", ")}`,
    );
  }

  // trending (optional boolean)
  if (r["trending"] !== undefined && typeof r["trending"] !== "boolean") {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': trending must be a boolean`);
  }

  // keywords
  if (!Array.isArray(r["keywords"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': keywords must be an array`);
  }
  for (const k of r["keywords"] as unknown[]) {
    if (typeof k !== "string") {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': each keyword must be a string`);
    }
  }

  // typography
  if (r["typography"] === null || typeof r["typography"] !== "object" || Array.isArray(r["typography"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': typography must be an object`);
  }
  const typo = r["typography"] as Record<string, unknown>;
  for (const key of Object.keys(typo)) {
    if (!TYPOGRAPHY_ALLOWED_KEYS.has(key)) {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': typography has unexpected property '${key}'`);
    }
  }
  if (typeof typo["fontFamilyDisplay"] !== "string" || typo["fontFamilyDisplay"].length === 0) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': typography.fontFamilyDisplay must be a non-empty string`);
  }
  if (typeof typo["fontFamilyBody"] !== "string" || typo["fontFamilyBody"].length === 0) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': typography.fontFamilyBody must be a non-empty string`);
  }
  if (typeof typo["fontWeightBody"] !== "number") {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': typography.fontWeightBody must be a number`);
  }
  if (typeof typo["fontWeightHeading"] !== "number") {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': typography.fontWeightHeading must be a number`);
  }

  // colorPhilosophy
  if (r["colorPhilosophy"] === null || typeof r["colorPhilosophy"] !== "object" || Array.isArray(r["colorPhilosophy"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': colorPhilosophy must be an object`);
  }
  const cp = r["colorPhilosophy"] as Record<string, unknown>;
  for (const key of Object.keys(cp)) {
    if (!COLOR_PHILOSOPHY_ALLOWED_KEYS.has(key)) {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': colorPhilosophy has unexpected property '${key}'`);
    }
  }
  // primaryHex is required and must be 6-digit hex
  if (typeof cp["primaryHex"] !== "string" || !HEX6_RE.test(cp["primaryHex"])) {
    throw new PersonaError(
      "BAD_PERSONA_INDEX",
      `persona '${r["slug"]}': colorPhilosophy.primaryHex must be a 6-digit hex (#RRGGBB)`,
    );
  }
  // optional hex fields — validate format when present
  const optHexFields = ["neutralHex", "successHex", "warningHex", "dangerHex", "infoHex", "bgLightHex", "bgDarkHex"] as const;
  for (const field of optHexFields) {
    if (cp[field] !== undefined) {
      if (typeof cp[field] !== "string" || !HEX6_RE.test(cp[field] as string)) {
        throw new PersonaError(
          "BAD_PERSONA_INDEX",
          `persona '${r["slug"]}': colorPhilosophy.${field} must be a 6-digit hex (#RRGGBB)`,
        );
      }
    }
  }

  // radius
  if (r["radius"] === null || typeof r["radius"] !== "object" || Array.isArray(r["radius"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': radius must be an object`);
  }
  const rad = r["radius"] as Record<string, unknown>;
  for (const key of Object.keys(rad)) {
    if (!RADIUS_ALLOWED_KEYS.has(key)) {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': radius has unexpected property '${key}'`);
    }
  }
  for (const key of ["sm", "md", "lg", "full"] as const) {
    if (typeof rad[key] !== "string") {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': radius.${key} must be a string`);
    }
  }

  // spacing
  if (r["spacing"] === null || typeof r["spacing"] !== "object" || Array.isArray(r["spacing"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': spacing must be an object`);
  }
  const spacing = r["spacing"] as Record<string, unknown>;
  for (const key of Object.keys(spacing)) {
    if (!SPACING_ALLOWED_KEYS.has(key)) {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': spacing has unexpected property '${key}'`);
    }
  }
  if (typeof spacing["base"] !== "number" || spacing["base"] <= 0) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': spacing.base must be a positive number`);
  }

  // shadowIntensity
  if (typeof r["shadowIntensity"] !== "string" || !SHADOW_INTENSITY_VALUES.has(r["shadowIntensity"])) {
    throw new PersonaError(
      "BAD_PERSONA_INDEX",
      `persona '${r["slug"]}': shadowIntensity must be one of: ${[...SHADOW_INTENSITY_VALUES].join(", ")}`,
    );
  }

  // antiPatterns
  if (!Array.isArray(r["antiPatterns"])) {
    throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': antiPatterns must be an array`);
  }
  for (const ap of r["antiPatterns"] as unknown[]) {
    if (typeof ap !== "string") {
      throw new PersonaError("BAD_PERSONA_INDEX", `persona '${r["slug"]}': each antiPattern must be a string`);
    }
  }

  return {
    slug: r["slug"],
    family: r["family"],
    uiTypes: r["uiTypes"] as string[],
    density: r["density"] as PersonaRecord["density"],
    colorMode: r["colorMode"] as PersonaRecord["colorMode"],
    ...(r["trending"] !== undefined && { trending: r["trending"] as boolean }),
    keywords: r["keywords"] as string[],
    typography: {
      fontFamilyDisplay: typo["fontFamilyDisplay"] as string,
      fontFamilyBody: typo["fontFamilyBody"] as string,
      fontWeightBody: typo["fontWeightBody"] as number,
      fontWeightHeading: typo["fontWeightHeading"] as number,
    },
    colorPhilosophy: {
      primaryHex: cp["primaryHex"] as string,
      ...(cp["neutralHex"] !== undefined && { neutralHex: cp["neutralHex"] as string }),
      ...(cp["successHex"] !== undefined && { successHex: cp["successHex"] as string }),
      ...(cp["warningHex"] !== undefined && { warningHex: cp["warningHex"] as string }),
      ...(cp["dangerHex"] !== undefined && { dangerHex: cp["dangerHex"] as string }),
      ...(cp["infoHex"] !== undefined && { infoHex: cp["infoHex"] as string }),
      ...(cp["bgLightHex"] !== undefined && { bgLightHex: cp["bgLightHex"] as string }),
      ...(cp["bgDarkHex"] !== undefined && { bgDarkHex: cp["bgDarkHex"] as string }),
    },
    radius: {
      sm: rad["sm"] as string,
      md: rad["md"] as string,
      lg: rad["lg"] as string,
      full: rad["full"] as string,
    },
    spacing: { base: spacing["base"] as number },
    shadowIntensity: r["shadowIntensity"] as PersonaRecord["shadowIntensity"],
    antiPatterns: r["antiPatterns"] as string[],
  };
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Resolve the personas index file path.
 * Resolution order: explicit path → UI_PERSONAS_PATH env → binary-sibling default.
 */
function resolveIndexPath(explicitPath?: string): string {
  if (explicitPath !== undefined && explicitPath.length > 0) {
    return resolve(explicitPath);
  }
  const envPath = process.env["UI_PERSONAS_PATH"];
  if (envPath !== undefined && envPath.length > 0) {
    return resolve(envPath);
  }
  // Default: relative to this file's compiled location in dist/
  // dist/cli.js → project root → knowledge/personas/personas.json
  const binaryDir = dirname(fileURLToPath(import.meta.url));
  return resolve(binaryDir, "..", "knowledge", "personas", "personas.json");
}

/**
 * Load and validate the personas index from disk.
 * Throws PersonaError on missing file, bad JSON, or invalid records.
 */
export function loadPersonaIndex(explicitPath?: string): PersonaRecord[] {
  const indexPath = resolveIndexPath(explicitPath);

  if (!existsSync(indexPath)) {
    throw new PersonaError(
      "PERSONA_INDEX_NOT_FOUND",
      `personas index not found: '${indexPath}'. ` +
        "Set UI_PERSONAS_PATH or pass --persona-data to override.",
    );
  }

  let raw: string;
  try {
    raw = readFileSync(indexPath, "utf8");
  } catch (e) {
    throw new PersonaError(
      "PERSONA_INDEX_NOT_FOUND",
      `cannot read personas index '${indexPath}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PersonaError("BAD_PERSONA_INDEX", `personas index is not valid JSON: '${indexPath}'`);
  }

  if (!Array.isArray(parsed)) {
    throw new PersonaError("BAD_PERSONA_INDEX", `personas index must be a JSON array: '${indexPath}'`);
  }

  return (parsed as unknown[]).map((item, i) => {
    try {
      return validatePersonaRecord(item);
    } catch (e) {
      throw new PersonaError(
        "BAD_PERSONA_INDEX",
        `personas index entry [${i}] invalid: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  });
}

/**
 * Find one persona by slug. Throws PersonaError("PERSONA_NOT_FOUND") when absent.
 */
export function findPersona(records: PersonaRecord[], slug: string): PersonaRecord {
  const found = records.find((r) => r.slug === slug);
  if (found === undefined) {
    throw new PersonaError(
      "PERSONA_NOT_FOUND",
      `persona '${slug}' not found in persona index`,
    );
  }
  return found;
}
