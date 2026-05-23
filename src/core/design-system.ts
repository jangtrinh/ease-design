/**
 * Design System in-memory model: discovery, load, hash verification.
 *
 * This module is the only place that reads all three DS artifacts together
 * (tokens + registry + manifest) and verifies their mutual consistency.
 * Pure transforms except for loadDesignSystem which performs filesystem I/O.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parseTokenFile } from "./token-model.js";
import { resolveTokens } from "./token-resolve.js";
import { loadRegistry } from "./registry-store.js";
import { loadManifest, canonicalHash, DSManifestError } from "./ds-manifest.js";
import type { DSManifest } from "./ds-manifest.js";
import type { TokenTree, ResolvedMap } from "./token-model.js";
import type { Registry } from "./registry-store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesignSystemPaths {
  dir: string;       // absolute resolved design/ directory
  tokens: string;    // <dir>/design.tokens.json
  registry: string;  // <dir>/component-registry.json
  manifest: string;  // <dir>/ds.manifest.json
}

export interface DesignSystem {
  paths: DesignSystemPaths;
  manifest: DSManifest;
  tokens: TokenTree;
  resolved: ResolvedMap;  // pre-resolved at load-time
  registry: Registry;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class DSError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DSError";
    this.code = code;
  }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Build the three artifact paths from an absolute design/ directory. */
export function pathsForDir(dir: string): DesignSystemPaths {
  const absDir = resolve(dir);
  return {
    dir: absDir,
    tokens:   resolve(absDir, "design.tokens.json"),
    registry: resolve(absDir, "component-registry.json"),
    manifest: resolve(absDir, "ds.manifest.json"),
  };
}

/**
 * Walk up from `start` (default: cwd), max 5 levels, looking for
 * design/ds.manifest.json. Stops early at any .git boundary.
 * Throws DSError("DS_NOT_FOUND") if not found.
 */
export function discoverDesignSystem(start: string | undefined): DesignSystemPaths {
  let cur = resolve(start ?? process.cwd());

  for (let level = 0; level < 5; level++) {
    const candidateManifest = resolve(cur, "design", "ds.manifest.json");
    if (existsSync(candidateManifest)) {
      return pathsForDir(resolve(cur, "design"));
    }
    // Stop at repo root — don't cross .git boundary upward
    if (existsSync(resolve(cur, ".git"))) break;
    const parent = dirname(cur);
    if (parent === cur) break; // filesystem root
    cur = parent;
  }

  throw new DSError(
    "DS_NOT_FOUND",
    "no design/ds.manifest.json found in cwd or parents (5 levels). " +
      "Run 'ui ds init <name>' to compile a design system.",
  );
}

// ─── Hash verification ────────────────────────────────────────────────────────

/**
 * Verify that manifest hashes match the on-disk file contents.
 * Throws DSError("DS_TAMPERED") on any mismatch.
 */
export function verifyHashes(
  manifest: DSManifest,
  tokensJson: unknown,
  registryJson: unknown,
): void {
  const actualTokensHash = canonicalHash(tokensJson);
  if (manifest.compiledHash !== actualTokensHash) {
    throw new DSError(
      "DS_TAMPERED",
      `tokens file hash mismatch — manifest has ${manifest.compiledHash}, ` +
        `file hashes to ${actualTokensHash}. ` +
        "Use 'ui ds change-token' to update tokens safely.",
    );
  }

  const actualRegistryHash = canonicalHash(registryJson);
  if (manifest.registryHash !== actualRegistryHash) {
    throw new DSError(
      "DS_TAMPERED",
      `registry file hash mismatch — manifest has ${manifest.registryHash}, ` +
        `file hashes to ${actualRegistryHash}. ` +
        "The registry was modified outside a sanctioned command.",
    );
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load the design system from the three artifact files, verify hashes,
 * parse and resolve tokens. Throws on tamper, missing files, or parse errors.
 *
 * Guarantee: any missing-manifest condition is always surfaced as DS_NOT_FOUND,
 * never as the internal MANIFEST_NOT_FOUND code from ds-manifest.ts.
 */
export function loadDesignSystem(paths: DesignSystemPaths): DesignSystem {
  // Load and validate manifest — remap only MANIFEST_NOT_FOUND → DS_NOT_FOUND.
  // READ_ERROR (permission denied, EBUSY, EISDIR, …) is a real I/O failure and
  // must propagate as-is so callers can surface the correct recovery action.
  let manifest;
  try {
    manifest = loadManifest(paths.manifest);
  } catch (e) {
    if (e instanceof DSManifestError && e.code === "MANIFEST_NOT_FOUND") {
      throw new DSError(
        "DS_NOT_FOUND",
        `no design system found at '${paths.manifest}' — run 'ui ds init <name>' to compile one.`,
      );
    }
    throw e;
  }

  // Read tokens file
  let tokensRaw: string;
  try {
    tokensRaw = readFileSync(paths.tokens, "utf8");
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new DSError(
      isNotFound ? "DS_NOT_FOUND" : "DS_TAMPERED",
      `cannot read tokens file '${paths.tokens}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let tokensJson: unknown;
  try {
    tokensJson = JSON.parse(tokensRaw);
  } catch {
    throw new DSError("DS_TAMPERED", `tokens file is not valid JSON: '${paths.tokens}'`);
  }

  // Read registry file
  let registryJson: unknown;
  try {
    const registryRaw = readFileSync(paths.registry, "utf8");
    registryJson = JSON.parse(registryRaw);
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new DSError(
      isNotFound ? "DS_NOT_FOUND" : "DS_TAMPERED",
      `cannot read registry file '${paths.registry}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Verify hashes before trusting the content
  verifyHashes(manifest, tokensJson, registryJson);

  // Parse and resolve tokens
  const tokens = parseTokenFile(tokensJson);
  const resolved = resolveTokens(tokens);

  // Load registry (re-validates shape)
  const registry = loadRegistry(paths.registry);

  return { paths, manifest, tokens, resolved, registry };
}

/**
 * Count all token leaves in a TokenTree (primitive + semantic).
 * Useful for status display and test assertions.
 */
export function countTokens(tree: TokenTree): number {
  let count = 0;
  for (const group of Object.values(tree)) {
    count += Object.keys(group).length;
  }
  return count;
}

/**
 * Validate a raw object as a DSManifest — thin re-export so callers
 * that only need shape-checking don't need to import ds-manifest directly.
 */
export { validateManifestShape } from "./ds-manifest.js";
