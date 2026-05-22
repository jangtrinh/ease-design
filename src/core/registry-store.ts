/**
 * Component registry store — hand-rolled validation, load/save, and query logic.
 *
 * This module is the only Phase 2b core module that performs filesystem I/O;
 * that is its defined purpose. loadRegistry / saveRegistry are the I/O boundary;
 * all other exports (validate, register, lookup, list) are pure transforms
 * testable without touching disk.
 *
 * On-disk format mirrors schemas/component-registry.schema.json exactly.
 * Validation is hand-rolled (zero runtime deps — no AJV).
 *
 * Write contract: saveRegistry always sorts components by name before writing,
 * so the file is stable regardless of insert order.
 */
import { readFileSync, writeFileSync } from "node:fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComponentState = "default" | "hover" | "active" | "focus" | "disabled";

export interface ComponentRecord {
  name: string;
  category: string;
  markup: string;
  tokensUsed: string[];
  variants?: string[];
  states?: ComponentState[];
  description?: string;
}

export interface Registry {
  version: string;
  components: ComponentRecord[];
}

/** Typed error for all registry validation and I/O failures. */
export class RegistryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NAME_PATTERN = /^[A-Z][A-Za-z]+\/[A-Z][A-Za-z]+$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9.-]*$/;
const VALID_STATES = new Set<string>(["default", "hover", "active", "focus", "disabled"]);

/** Keys permitted at the registry root object (mirrors schema additionalProperties:false). */
const REGISTRY_ROOT_KEYS = new Set(["version", "components"]);

/** Keys permitted on a component record (mirrors schema additionalProperties:false). */
const COMPONENT_ALLOWED_KEYS = new Set([
  "name", "category", "markup", "tokensUsed", "variants", "states", "description",
]);

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate an unknown value as a ComponentRecord against the schema constraints.
 * Throws RegistryError with a precise code on any violation.
 */
export function validateComponentRecord(rec: unknown): ComponentRecord {
  if (rec === null || typeof rec !== "object" || Array.isArray(rec)) {
    throw new RegistryError("BAD_ARG", "component must be a plain object");
  }
  const r = rec as Record<string, unknown>;

  // Required: name
  if (typeof r["name"] !== "string" || r["name"].length === 0) {
    throw new RegistryError("BAD_ARG", "component.name is required and must be a string");
  }
  if (!NAME_PATTERN.test(r["name"])) {
    throw new RegistryError(
      "BAD_NAME",
      `component name '${r["name"]}' must match Category/Variant (PascalCase/PascalCase, letters only)`,
    );
  }

  // Required: category
  if (typeof r["category"] !== "string" || r["category"].length === 0) {
    throw new RegistryError("BAD_ARG", "component.category is required and must be a non-empty string");
  }

  // Required: markup
  if (typeof r["markup"] !== "string") {
    throw new RegistryError("BAD_ARG", "component.markup is required and must be a string");
  }

  // Required: tokensUsed (array of strings matching token pattern)
  if (!Array.isArray(r["tokensUsed"])) {
    throw new RegistryError("BAD_ARG", "component.tokensUsed is required and must be an array");
  }
  for (const t of r["tokensUsed"] as unknown[]) {
    if (typeof t !== "string" || !TOKEN_PATTERN.test(t)) {
      throw new RegistryError(
        "BAD_TOKEN",
        `invalid token path '${String(t)}' — must match ^[a-z][a-z0-9.-]*$ (e.g. color.primary)`,
      );
    }
  }

  // Optional: variants (array of strings)
  if (r["variants"] !== undefined) {
    if (!Array.isArray(r["variants"])) {
      throw new RegistryError("BAD_ARG", "component.variants must be an array of strings");
    }
    for (const v of r["variants"] as unknown[]) {
      if (typeof v !== "string") {
        throw new RegistryError("BAD_ARG", "each variant must be a string");
      }
    }
  }

  // Optional: states (array of enum values)
  if (r["states"] !== undefined) {
    if (!Array.isArray(r["states"])) {
      throw new RegistryError("BAD_ARG", "component.states must be an array");
    }
    for (const s of r["states"] as unknown[]) {
      if (typeof s !== "string" || !VALID_STATES.has(s)) {
        throw new RegistryError(
          "BAD_STATE",
          `invalid state '${String(s)}' — must be one of: default, hover, active, focus, disabled`,
        );
      }
    }
  }

  // Optional: description
  if (r["description"] !== undefined && typeof r["description"] !== "string") {
    throw new RegistryError("BAD_ARG", "component.description must be a string");
  }

  // additionalProperties: false — reject keys outside the schema
  for (const key of Object.keys(r)) {
    if (!COMPONENT_ALLOWED_KEYS.has(key)) {
      throw new RegistryError(
        "BAD_REGISTRY",
        `component has unexpected property '${key}' — schema allows: ${[...COMPONENT_ALLOWED_KEYS].join(", ")}`,
      );
    }
  }

  return {
    name: r["name"],
    category: r["category"],
    markup: r["markup"],
    tokensUsed: r["tokensUsed"] as string[],
    ...(r["variants"] !== undefined && { variants: r["variants"] as string[] }),
    ...(r["states"] !== undefined && { states: r["states"] as ComponentState[] }),
    ...(r["description"] !== undefined && { description: r["description"] as string }),
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/** Return a new empty registry at schema version 0.1.0. */
export function createEmptyRegistry(): Registry {
  return { version: "0.1.0", components: [] };
}

// ─── I/O boundary ─────────────────────────────────────────────────────────────

/**
 * Load and validate a registry file from disk.
 * Missing file → throws RegistryError("REGISTRY_NOT_FOUND").
 * Invalid JSON or wrong shape → throws RegistryError("BAD_REGISTRY").
 */
export function loadRegistry(path: string): Registry {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) {
      throw new RegistryError("REGISTRY_NOT_FOUND", `registry file not found: '${path}'`);
    }
    throw new RegistryError(
      "READ_ERROR",
      `cannot read registry '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RegistryError("BAD_REGISTRY", `registry file is not valid JSON: '${path}'`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RegistryError("BAD_REGISTRY", `registry file root must be an object: '${path}'`);
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj["version"] !== "string") {
    throw new RegistryError("BAD_REGISTRY", `registry missing required 'version' string: '${path}'`);
  }
  if (!Array.isArray(obj["components"])) {
    throw new RegistryError("BAD_REGISTRY", `registry missing required 'components' array: '${path}'`);
  }

  // additionalProperties: false at root level
  for (const key of Object.keys(obj)) {
    if (!REGISTRY_ROOT_KEYS.has(key)) {
      throw new RegistryError(
        "BAD_REGISTRY",
        `registry root has unexpected property '${key}' — only 'version' and 'components' are allowed`,
      );
    }
  }

  return { version: obj["version"], components: obj["components"] as ComponentRecord[] };
}

/**
 * Serialize and write a registry to disk.
 * Components are sorted by name before writing (deterministic output).
 * Throws RegistryError("WRITE_ERROR") on failure.
 */
export function saveRegistry(path: string, reg: Registry): void {
  const sorted: Registry = {
    version: reg.version,
    components: [...reg.components].sort((a, b) => a.name.localeCompare(b.name)),
  };
  const content = JSON.stringify(sorted, null, 2) + "\n";
  try {
    writeFileSync(path, content, "utf8");
  } catch (e) {
    throw new RegistryError(
      "WRITE_ERROR",
      `cannot write registry '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ─── Pure operations ──────────────────────────────────────────────────────────

/**
 * Add or replace a component in the registry.
 * Without force: throws RegistryError("NAME_EXISTS") if the name is taken.
 * With force: replaces the existing record at the same array position.
 */
export function registerComponent(
  reg: Registry,
  rec: ComponentRecord,
  force: boolean,
): { registry: Registry; replaced: boolean } {
  const existingIdx = reg.components.findIndex((c) => c.name === rec.name);
  if (existingIdx !== -1 && !force) {
    throw new RegistryError(
      "NAME_EXISTS",
      `component '${rec.name}' already exists — use --force to overwrite`,
    );
  }

  let components: ComponentRecord[];
  let replaced = false;

  if (existingIdx !== -1) {
    // Replace in place
    components = reg.components.map((c, i) => (i === existingIdx ? rec : c));
    replaced = true;
  } else {
    components = [...reg.components, rec];
  }

  return { registry: { version: reg.version, components }, replaced };
}

/** Find a component by exact name. Returns undefined when not found. */
export function lookupComponent(reg: Registry, name: string): ComponentRecord | undefined {
  return reg.components.find((c) => c.name === name);
}

/**
 * List all components, optionally filtered by exact category match.
 * Returns a new array; original registry is unmodified.
 */
export function listComponents(reg: Registry, category?: string): ComponentRecord[] {
  if (category === undefined) return [...reg.components];
  return reg.components.filter((c) => c.category === category);
}
