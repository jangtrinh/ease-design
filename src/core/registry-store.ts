/**
 * Component registry store — hand-rolled validation, load/save, and query logic.
 *
 * This module is the only registry module that performs filesystem I/O;
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
import { canonicalStringify } from "./ds-manifest.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComponentState = "default" | "hover" | "active" | "focus" | "disabled";
/** Lifecycle status (shadcn 🔵/🟢 convention): a `stable` component must honour its state contract. */
export type ComponentStatus = "draft" | "beta" | "stable";
/**
 * Reuse scope (spec 004 D3): `local` = owned by this project's DS; `global` = a
 * published/shared library component reusable across projects (inferred from Figma
 * publish-status / `remote` during reconcile). Semantically REQUIRED — every record
 * carries a scope after load/validate. Optional here only so a pre-migration file
 * (written before this field existed) parses; the load/validate boundary normalizes a
 * missing value to `"local"`.
 */
export type ComponentScope = "local" | "global";

export interface ComponentRecord {
  name: string;
  category: string;
  markup: string;
  tokensUsed: string[];
  variants?: string[];
  states?: ComponentState[];
  description?: string;
  status?: ComponentStatus;
  /** Reuse scope; defaults to `"local"` when absent (migration). See {@link ComponentScope}. */
  scope?: ComponentScope;
  /** Soft-deprecation flag (spec 004). Absent = active; `true` = deprecated (audit reads this).
   * A distinct field, NOT a `status` value — a component can be `stable` and `deprecated`. */
  deprecated?: boolean;
  /**
   * Pointer to this component's Figma node sidecar (spec 005 P3), relative to the design
   * dir — e.g. `"components/button-primary.figma.json"`. A POINTER, never the node tree
   * inline, so the shared registry file stays small. Absent = no mirror captured yet
   * (a pre-005 record, or a component never scanned); readers must treat it as optional.
   * Orthogonal to `markup`, which stays one-way design→code. See `figma-node-reader.ts`.
   */
  figmaNode?: string;
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

/**
 * `--states` → `State=X` variant entries (spec 009 D3).
 *
 * The record's `states` field is dead: 0/537 populated in platform-design-system, 0/27 in
 * the `ds init` kit. The only place it was ever mandated was the workflow doctrine
 * (`extract.md`, `learn.md` §3b) — no emitter ever wrote it. States travel as `State=X`
 * inside `variants`, kit-identical to `Tone=`/`Size=`. `--states` keeps validating against
 * the same enum (a scripted caller's contract does not change) but its values now land
 * here instead of in `states`.
 * @throws RegistryError("BAD_STATE") on a value outside the enum.
 */
export function statesToVariants(states: string[]): string[] {
  return states.map((s) => {
    if (!VALID_STATES.has(s)) {
      throw new RegistryError(
        "BAD_STATE",
        `invalid state '${s}' — must be one of: default, hover, active, focus, disabled`,
      );
    }
    return `State=${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  });
}

/** Keys permitted at the registry root object (mirrors schema additionalProperties:false). */
const REGISTRY_ROOT_KEYS = new Set(["version", "components"]);

/** Keys permitted on a component record (mirrors schema additionalProperties:false). */
const COMPONENT_ALLOWED_KEYS = new Set([
  "name", "category", "markup", "tokensUsed", "variants", "states", "description", "status",
  "scope", "deprecated", "figmaNode",
]);
const VALID_STATUSES = new Set<string>(["draft", "beta", "stable"]);
const VALID_SCOPES = new Set<string>(["local", "global"]);
/** Default reuse scope for records that predate the `scope` field (spec 004 migration). */
const DEFAULT_SCOPE: ComponentScope = "local";
/** Required suffix of a `figmaNode` sidecar pointer (spec 005 P3). */
export const FIGMA_NODE_SUFFIX = ".figma.json";

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a `ComponentRecord.figmaNode` pointer: a design-dir-relative path ending in
 * `.figma.json`.
 *
 * Absolute paths and `..` traversal are rejected here, at the shared layer, rather than
 * only where a path gets resolved: a registry file is committed, shared input, so every
 * consumer that joins this pointer to a design dir needs the same guarantee — it must not
 * escape the design dir. `figma-node-reader.readFigmaNode` re-runs this before resolving.
 *
 * @returns the pointer unchanged when valid.
 * @throws RegistryError("BAD_ARG") on a malformed pointer.
 */
export function validateFigmaNodePointer(relPath: unknown): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new RegistryError("BAD_ARG", "component.figmaNode must be a non-empty string");
  }
  // Absolute POSIX ("/x"), Windows drive ("C:\x") and UNC ("\\srv") forms all escape.
  if (relPath.startsWith("/") || relPath.startsWith("\\") || /^[A-Za-z]:/.test(relPath)) {
    throw new RegistryError(
      "BAD_ARG",
      `component.figmaNode must be relative to the design dir, got absolute: '${relPath}'`,
    );
  }
  if (relPath.split(/[/\\]/).includes("..")) {
    throw new RegistryError(
      "BAD_ARG",
      `component.figmaNode must not traverse outside the design dir with '..': '${relPath}'`,
    );
  }
  if (!relPath.endsWith(FIGMA_NODE_SUFFIX)) {
    throw new RegistryError(
      "BAD_ARG",
      `component.figmaNode must point at a '${FIGMA_NODE_SUFFIX}' sidecar: '${relPath}'`,
    );
  }
  return relPath;
}

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

  // Optional: status (lifecycle)
  if (r["status"] !== undefined && (typeof r["status"] !== "string" || !VALID_STATUSES.has(r["status"]))) {
    throw new RegistryError("BAD_ARG", `component.status must be one of: ${[...VALID_STATUSES].join(", ")}`);
  }

  // Optional: scope (reuse scope) — absent is valid and migrates to the default below.
  if (r["scope"] !== undefined && (typeof r["scope"] !== "string" || !VALID_SCOPES.has(r["scope"]))) {
    throw new RegistryError("BAD_ARG", `component.scope must be one of: ${[...VALID_SCOPES].join(", ")}`);
  }

  // Optional: deprecated (soft-deprecation flag)
  if (r["deprecated"] !== undefined && typeof r["deprecated"] !== "boolean") {
    throw new RegistryError("BAD_ARG", "component.deprecated must be a boolean");
  }

  // Optional: figmaNode (sidecar pointer, spec 005) — absent = no mirror captured yet.
  if (r["figmaNode"] !== undefined) {
    validateFigmaNodePointer(r["figmaNode"]);
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
    ...(r["status"] !== undefined && { status: r["status"] as ComponentStatus }),
    // Migration: missing scope defaults to "local" so the returned record always carries one.
    scope: (r["scope"] as ComponentScope | undefined) ?? DEFAULT_SCOPE,
    ...(r["deprecated"] !== undefined && { deprecated: r["deprecated"] as boolean }),
    // No migration default: a record without a sidecar simply has no pointer (P3 no-op).
    ...(r["figmaNode"] !== undefined && { figmaNode: r["figmaNode"] as string }),
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

  // Migration (spec 004): records written before `scope` existed lack it — default to
  // "local" on read so every in-memory record carries a scope. Deliberately scoped to this
  // one field; loadRegistry does not otherwise per-record-validate (that would retroactively
  // reject registries the old lenient loader accepted).
  const components = (obj["components"] as ComponentRecord[]).map((c) =>
    c !== null && typeof c === "object" && (c as ComponentRecord).scope === undefined
      ? { ...(c as ComponentRecord), scope: DEFAULT_SCOPE }
      : c,
  );

  return { version: obj["version"], components };
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
  // D5 (spec 009 P1): canonicalStringify, never JSON.stringify — ds-manifest.ts's mandate.
  // A reseal hashes these bytes, so the write and the hash must agree byte-for-byte.
  const content = canonicalStringify(sorted);
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
