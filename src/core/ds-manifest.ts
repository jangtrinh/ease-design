/**
 * DS manifest schema, I/O, and canonical-JSON hashing.
 *
 * canonicalStringify is the single source of truth for both the on-disk
 * write format and the hash input. Every writer in this codebase must call
 * canonicalStringify — never JSON.stringify directly — so that
 * loadDesignSystem's hash verification never produces a false DS_TAMPERED.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DSChangelogEntry {
  ts: string;       // ISO-8601 UTC
  kind: "init" | "change-token" | "register" | "set-role";
  by: string;       // "ui ds init" | "ui ds change-token" | "ui registry register" | "ui ds set-role"
  path?: string;    // change-token/set-role: token path
  from?: string;    // change-token: previous serialized $value; set-role: previous role (absent if none)
  to?: string;      // change-token: new serialized $value; set-role: new role
  reason?: string;
  note?: string;
}

export interface DSManifest {
  name: string;
  version: string;         // semver
  createdAt: string;
  persona: { slug: string; family: string; antiPatterns?: string[] };
  intent: string;
  compiledHash: string;    // "sha256-…" (base64url)
  registryHash: string;
  generation: number;      // ≥ 1
  changelog: DSChangelogEntry[];
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class DSManifestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DSManifestError";
    this.code = code;
  }
}

// ─── Canonical JSON ───────────────────────────────────────────────────────────

/**
 * Replacer that recursively sorts object keys alphabetically.
 * Arrays retain their original order.
 */
function sortedKeysReplacer(
  _key: string,
  value: unknown,
): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Canonical JSON: sorted keys, 2-space indent, trailing newline.
 * This is the ONLY function that should be called when writing any JSON
 * artifact (tokens, manifest) that participates in hash verification.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, sortedKeysReplacer, 2) + "\n";
}

/**
 * SHA-256(base64url) of the canonicalised JSON of `value`.
 * Prefix: "sha256-".
 */
export function canonicalHash(value: unknown): string {
  const json = canonicalStringify(value);
  const buf = Buffer.from(json, "utf8");
  const digest = createHash("sha256").update(buf).digest("base64url");
  return `sha256-${digest}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const MANIFEST_ROOT_KEYS = new Set([
  "name", "version", "createdAt", "persona", "intent",
  "compiledHash", "registryHash", "generation", "changelog",
]);
const CHANGELOG_KEYS = new Set([
  "ts", "kind", "by", "path", "from", "to", "reason", "note",
]);
const CHANGELOG_KINDS = new Set(["init", "change-token", "register", "set-role"]);
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const HASH_RE = /^sha256-[A-Za-z0-9_-]+$/;
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Validate an unknown value as a DSManifest. Hand-rolled — zero runtime deps.
 * Throws DSManifestError("BAD_MANIFEST") on any violation.
 */
export function validateManifestShape(obj: unknown): DSManifest {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new DSManifestError("BAD_MANIFEST", "manifest must be a JSON object");
  }
  const m = obj as Record<string, unknown>;

  // additionalProperties: false
  for (const key of Object.keys(m)) {
    if (!MANIFEST_ROOT_KEYS.has(key)) {
      throw new DSManifestError(
        "BAD_MANIFEST",
        `manifest has unexpected property '${key}'`,
      );
    }
  }

  // name
  if (typeof m["name"] !== "string" || m["name"].length === 0 || m["name"].length > 64) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.name must be a non-empty string (max 64)");
  }

  // version
  if (typeof m["version"] !== "string" || !SEMVER_RE.test(m["version"])) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.version must be semver (x.y.z)");
  }

  // createdAt
  if (typeof m["createdAt"] !== "string" || m["createdAt"].length === 0) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.createdAt must be an ISO-8601 string");
  }

  // persona
  if (m["persona"] === null || typeof m["persona"] !== "object" || Array.isArray(m["persona"])) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.persona must be an object");
  }
  const persona = m["persona"] as Record<string, unknown>;
  if (typeof persona["slug"] !== "string" || !SLUG_RE.test(persona["slug"])) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.persona.slug must match ^[a-z][a-z0-9-]*$");
  }
  if (typeof persona["family"] !== "string" || !SLUG_RE.test(persona["family"])) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.persona.family must match ^[a-z][a-z0-9-]*$");
  }
  if (persona["antiPatterns"] !== undefined) {
    if (!Array.isArray(persona["antiPatterns"])) {
      throw new DSManifestError("BAD_MANIFEST", "manifest.persona.antiPatterns must be an array");
    }
    for (const ap of persona["antiPatterns"] as unknown[]) {
      if (typeof ap !== "string") {
        throw new DSManifestError("BAD_MANIFEST", "each manifest.persona.antiPattern must be a string");
      }
    }
  }
  for (const key of Object.keys(persona)) {
    if (key !== "slug" && key !== "family" && key !== "antiPatterns") {
      throw new DSManifestError("BAD_MANIFEST", `manifest.persona has unexpected property '${key}'`);
    }
  }

  // intent
  if (typeof m["intent"] !== "string" || m["intent"].length > 512) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.intent must be a string (max 512)");
  }

  // compiledHash / registryHash
  if (typeof m["compiledHash"] !== "string" || !HASH_RE.test(m["compiledHash"])) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.compiledHash must match ^sha256-[A-Za-z0-9_-]+$");
  }
  if (typeof m["registryHash"] !== "string" || !HASH_RE.test(m["registryHash"])) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.registryHash must match ^sha256-[A-Za-z0-9_-]+$");
  }

  // generation
  if (typeof m["generation"] !== "number" || !Number.isInteger(m["generation"]) || m["generation"] < 1) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.generation must be an integer ≥ 1");
  }

  // changelog
  if (!Array.isArray(m["changelog"])) {
    throw new DSManifestError("BAD_MANIFEST", "manifest.changelog must be an array");
  }
  for (const entry of m["changelog"] as unknown[]) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new DSManifestError("BAD_MANIFEST", "each changelog entry must be an object");
    }
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (!CHANGELOG_KEYS.has(key)) {
        throw new DSManifestError("BAD_MANIFEST", `changelog entry has unexpected property '${key}'`);
      }
    }
    if (typeof e["ts"] !== "string" || e["ts"].length === 0) {
      throw new DSManifestError("BAD_MANIFEST", "changelog entry.ts must be a non-empty string");
    }
    if (typeof e["kind"] !== "string" || !CHANGELOG_KINDS.has(e["kind"])) {
      throw new DSManifestError("BAD_MANIFEST", `changelog entry.kind must be one of: ${[...CHANGELOG_KINDS].join(", ")}`);
    }
    if (typeof e["by"] !== "string" || e["by"].length === 0 || e["by"].length > 64) {
      throw new DSManifestError("BAD_MANIFEST", "changelog entry.by must be a non-empty string (max 64)");
    }
    for (const optKey of ["path", "from", "to", "reason", "note"] as const) {
      if (e[optKey] !== undefined && typeof e[optKey] !== "string") {
        throw new DSManifestError("BAD_MANIFEST", `changelog entry.${optKey} must be a string if present`);
      }
    }
  }

  return {
    name: m["name"],
    version: m["version"],
    createdAt: m["createdAt"],
    persona: {
      slug: persona["slug"] as string,
      family: persona["family"] as string,
      ...(persona["antiPatterns"] !== undefined && {
        antiPatterns: persona["antiPatterns"] as string[],
      }),
    },
    intent: m["intent"],
    compiledHash: m["compiledHash"],
    registryHash: m["registryHash"],
    generation: m["generation"],
    changelog: m["changelog"] as DSChangelogEntry[],
  };
}

// ─── I/O ──────────────────────────────────────────────────────────────────────

/** Load and validate a manifest from disk. Throws DSManifestError on failure. */
export function loadManifest(path: string): DSManifest {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) {
      throw new DSManifestError("MANIFEST_NOT_FOUND", `manifest not found: '${path}'`);
    }
    throw new DSManifestError(
      "READ_ERROR",
      `cannot read manifest '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DSManifestError("BAD_MANIFEST", `manifest is not valid JSON: '${path}'`);
  }

  return validateManifestShape(parsed);
}

/** Serialize and write a manifest. Throws DSManifestError("WRITE_ERROR") on failure. */
export function saveManifest(path: string, m: DSManifest): void {
  const content = canonicalStringify(m);
  try {
    writeFileSync(path, content, "utf8");
  } catch (e) {
    throw new DSManifestError(
      "WRITE_ERROR",
      `cannot write manifest '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/** Create a new manifest at generation 1. */
export function newManifest(args: {
  name: string;
  persona: { slug: string; family: string; antiPatterns?: string[] };
  intent: string;
  compiledHash: string;
  registryHash: string;
}): DSManifest {
  return {
    name: args.name,
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    persona: args.persona,
    intent: args.intent,
    compiledHash: args.compiledHash,
    registryHash: args.registryHash,
    generation: 1,
    changelog: [],
  };
}

/**
 * Return a new manifest with the entry appended to changelog.
 * Never mutates the input manifest.
 */
export function appendChangelog(m: DSManifest, entry: DSChangelogEntry): DSManifest {
  return { ...m, changelog: [...m.changelog, entry] };
}
