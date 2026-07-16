/**
 * Figma-node sidecar storage (spec 005 P3) — one `<design>/components/<slug>.figma.json`
 * file per component, holding the buildable `FigmaExportNode` spec captured from Figma.
 * The registry record keeps a *pointer* (`ComponentRecord.figmaNode`), never the tree
 * inline, so the shared registry JSON stays small and a component's spec diffs on its own.
 *
 * Direction of truth (spec 005): the Figma-native node spec is the reversible half;
 * `markup` (HTML/JSX) stays one-way design→code and is NOT touched by this module.
 *
 * Storage only — no reconcile wiring (that is P4), no live Figma call. This is the IO
 * boundary for sidecars; `figmaNodeRelPath` / `validateFigmaNodeSidecar` are pure.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { toSafeFilename } from "./html-export.js";
import { FIGMA_NODE_SUFFIX, RegistryError, validateFigmaNodePointer } from "./registry-store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One captured Figma node spec — the sidecar payload.
 *
 * The full field list is `FigmaExportNode` in `figma-agent/shared/figma-payload-types.ts`
 * and is owned there (`nodeToSpec` produces it, `createFigmaNode` consumes it). As
 * `figma-reconcile.ts` does for `ChangeFrame`, the kernel does NOT import that type:
 * figma-agent is a separate package/bundle and the FILE is the contract, not the type.
 * Storage only needs the discriminant, so the payload stays open and passes through
 * rather than being re-declared here, where a ~100-field mirror would silently drift.
 */
export type FigmaNodeSpec = {
  type: string;
  name: string;
  [key: string]: unknown;
};

/**
 * On-disk sidecar envelope. `version` follows the registry file convention (every
 * ease-design data file carries one) so the payload migrates independently of the
 * registry schema; `name` makes an orphaned sidecar self-identifying.
 */
export interface FigmaNodeSidecar {
  version: string;
  name: string;
  node: FigmaNodeSpec;
}

/** Result of a sidecar write. */
export interface FigmaNodeWriteResult {
  /** Pointer to store on the record, relative to the design dir. */
  relPath: string;
  path: string;
  /** False = content guard found identical bytes and skipped the rewrite. */
  written: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIDECAR_VERSION = "0.1.0";
/** Sidecar sub-directory under the project design dir. */
const SIDECAR_DIR = "components";
/** Node types the sidecar accepts — must stay in sync with FigmaExportNode["type"]. */
const VALID_NODE_TYPES = new Set<string>(["FRAME", "TEXT", "RECTANGLE", "IMAGE", "GROUP", "INSTANCE"]);

// ─── Pure: pointer + payload validation ───────────────────────────────────────

/**
 * Derive the sidecar pointer for a component name: `components/<slug>.figma.json`.
 *
 * The slug reuses `toSafeFilename` (the existing kebab-case filename util), so
 * `Button/Primary` → `components/button-primary.figma.json`. Registry names are
 * `Category/Variant` in letters only, so slugs collide only for names differing by case
 * alone — which the registry already treats as two distinct records.
 */
export function figmaNodeRelPath(name: string): string {
  return `${SIDECAR_DIR}/${toSafeFilename(name)}${FIGMA_NODE_SUFFIX}`;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Validate an unknown value as a captured node spec (the sidecar payload).
 *
 * Shallow by design (see {@link FigmaNodeSpec}): assert the node's discriminant, pass
 * the tree through. Shared, not sidecar-private: every consumer of a captured spec —
 * the sidecar reader here AND the reconcile mirror-capture file (spec 005 P4) — needs
 * the same "is this actually a FigmaExportNode" floor, so the check lives once (Art IV).
 *
 * @param code Error code the caller's boundary reports (`BAD_SIDECAR` / `BAD_MIRROR_CAPTURE`).
 * @throws RegistryError(code) on any violation.
 */
export function validateFigmaNodeSpec(value: unknown, source: string, code: string): FigmaNodeSpec {
  const bad = (msg: string): never => {
    throw new RegistryError(code, `${msg}: '${source}'`);
  };
  if (!isObject(value)) return bad("figma node spec must be an object");
  if (typeof value["type"] !== "string" || !VALID_NODE_TYPES.has(value["type"])) {
    return bad(
      `node.type '${String(value["type"])}' must be one of: ${[...VALID_NODE_TYPES].join(", ")}`,
    );
  }
  if (typeof value["name"] !== "string") return bad("node.name is required and must be a string");
  return value as FigmaNodeSpec;
}

/**
 * Validate an unknown value as a sidecar envelope.
 *
 * Shallow by design (see {@link FigmaNodeSpec}): assert the envelope + the node's
 * discriminant, pass the tree through.
 *
 * @throws RegistryError("BAD_SIDECAR") on any violation.
 */
export function validateFigmaNodeSidecar(value: unknown, source: string): FigmaNodeSidecar {
  const bad = (msg: string): never => {
    throw new RegistryError("BAD_SIDECAR", `${msg}: '${source}'`);
  };

  if (!isObject(value)) return bad("figma node sidecar root must be an object");
  if (typeof value["version"] !== "string" || value["version"].length === 0) {
    return bad("sidecar missing required 'version' string");
  }
  if (typeof value["name"] !== "string" || value["name"].length === 0) {
    return bad("sidecar missing required 'name' string");
  }
  if (!isObject(value["node"])) return bad("sidecar 'node' must be an object");

  const node = validateFigmaNodeSpec(value["node"], source, "BAD_SIDECAR");
  return { version: value["version"], name: value["name"], node };
}

// ─── I/O boundary ─────────────────────────────────────────────────────────────

/** Serialize a sidecar deterministically (stable key order via the literal). */
function serialize(name: string, node: FigmaNodeSpec): string {
  const sidecar: FigmaNodeSidecar = { version: SIDECAR_VERSION, name, node };
  return JSON.stringify(sidecar, null, 2) + "\n";
}

/**
 * Write a component's node spec to its sidecar under `<designDir>/components/`.
 *
 * Content guard: the serialized bytes are compared against what is already on disk and
 * the write is skipped when identical, so a component whose structure did not change
 * produces no sidecar churn (spec 005 plan, sidecar-sprawl mitigation). Byte-equality is
 * the exact form of that guard — no hash collisions to reason about.
 *
 * @throws RegistryError("WRITE_ERROR") on failure.
 */
export function writeFigmaNode(
  designDir: string,
  name: string,
  node: FigmaNodeSpec,
): FigmaNodeWriteResult {
  const relPath = figmaNodeRelPath(name);
  const path = resolve(join(designDir, relPath));
  const content = serialize(name, node);

  let existing: string | undefined;
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    existing = undefined; // absent or unreadable → fall through to write
  }
  if (existing === content) {
    return { relPath, path, written: false };
  }

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  } catch (e) {
    throw new RegistryError(
      "WRITE_ERROR",
      `cannot write figma node sidecar '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return { relPath, path, written: true };
}

/**
 * Read + validate a component's node spec from its sidecar pointer.
 *
 * @param designDir Project design dir the pointer is relative to.
 * @param relPath   `ComponentRecord.figmaNode` value.
 * @throws RegistryError: BAD_ARG (bad pointer), FILE_NOT_FOUND, READ_ERROR, BAD_SIDECAR.
 */
export function readFigmaNode(designDir: string, relPath: string): FigmaNodeSpec {
  const safeRel = validateFigmaNodePointer(relPath);
  const path = resolve(join(designDir, safeRel));

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) {
      throw new RegistryError("FILE_NOT_FOUND", `figma node sidecar not found: '${path}'`);
    }
    throw new RegistryError(
      "READ_ERROR",
      `cannot read figma node sidecar '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RegistryError("BAD_SIDECAR", `figma node sidecar is not valid JSON: '${path}'`);
  }

  return validateFigmaNodeSidecar(parsed, path).node;
}
