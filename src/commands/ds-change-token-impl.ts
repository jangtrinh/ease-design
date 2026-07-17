/**
 * runChangeToken — implementation for `ui ds change-token`.
 *
 * Changes one token's $value (literal or alias), re-resolves the tree,
 * atomically writes the new tokens file and manifest, bumps generation,
 * and appends a changelog entry.
 *
 * Atomicity sequence (A-F):
 *   A. canonicalStringify(newTree)     → newTokensStr  (in memory)
 *   B. canonicalStringify(newManifest) → newManifestStr (in memory)
 *   C. writeFileSync(tokens.tmp, newTokensStr)
 *   D. writeFileSync(manifest.tmp, newManifestStr)
 *   E. renameSync(tokens.tmp, tokens)
 *   F. renameSync(manifest.tmp, manifest)
 * If C/D throws → no live files mutated.
 * If E succeeds but F fails → DS_TAMPERED on next load (document recovery).
 */
import { renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cwd } from "node:process";

import { errJson, errText, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import {
  discoverDesignSystem,
  loadDesignSystem,
  pathsForDir,
  DSError,
} from "../core/design-system.js";
import {
  canonicalStringify,
  canonicalHash,
  appendChangelog,
} from "../core/ds-manifest.js";
import { resolveTokens } from "../core/token-resolve.js";
import { parseTokenFile } from "../core/token-model.js";
import type { TokenType } from "../core/token-model.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { withOutcome } from "../core/memory-autorecord.js";

const CMD = "ds change-token";

/** Long flags `ui ds change-token` accepts (globals --help/--json handled separately). */
const KNOWN_FLAGS = ["value", "reason", "dir"] as const;

// ─── Value validation ─────────────────────────────────────────────────────────

const ALIAS_RE = /^\{[a-z0-9][a-z0-9.-]*\}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,6}$/;
const DIMENSION_RE = /^-?\d+(\.\d+)?(px|rem|em|%)$/;
const DURATION_RE = /^\d+(\.\d+)?ms$/;

/** Serialize a token $value to a string for changelog from/to fields. */
function serializeValue(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/**
 * Validate a new literal value against the token's $type.
 * Returns the validated value (same string, or parsed number for fontWeight/number).
 * Throws with BAD_VALUE code on failure.
 */
function validateLiteralValue(
  rawValue: string,
  tokenType: TokenType,
  tokenPath: string,
): string | number {
  switch (tokenType) {
    case "color":
      if (!COLOR_RE.test(rawValue)) {
        throw Object.assign(
          new Error(`value '${rawValue}' is not a valid color for token '${tokenPath}' — expected #RRGGBB or #RGB`),
          { code: "BAD_VALUE" },
        );
      }
      return rawValue;

    case "dimension":
      if (!DIMENSION_RE.test(rawValue)) {
        throw Object.assign(
          new Error(`value '${rawValue}' is not a valid dimension for token '${tokenPath}' — expected e.g. 16px, 1rem`),
          { code: "BAD_VALUE" },
        );
      }
      return rawValue;

    case "duration":
      if (!DURATION_RE.test(rawValue)) {
        throw Object.assign(
          new Error(`value '${rawValue}' is not a valid duration for token '${tokenPath}' — expected e.g. 150ms`),
          { code: "BAD_VALUE" },
        );
      }
      return rawValue;

    case "fontWeight": {
      const n = parseInt(rawValue, 10);
      if (isNaN(n) || n < 100 || n > 900 || n % 100 !== 0) {
        throw Object.assign(
          new Error(`value '${rawValue}' is not a valid fontWeight for token '${tokenPath}' — expected 100–900 (multiple of 100)`),
          { code: "BAD_VALUE" },
        );
      }
      return n;
    }

    case "number": {
      const n = Number(rawValue);
      if (!isFinite(n)) {
        throw Object.assign(
          new Error(`value '${rawValue}' is not a valid number for token '${tokenPath}'`),
          { code: "BAD_VALUE" },
        );
      }
      return n;
    }

    case "fontFamily":
      if (rawValue.trim().length === 0) {
        throw Object.assign(
          new Error(`fontFamily value for token '${tokenPath}' must be a non-empty string`),
          { code: "BAD_VALUE" },
        );
      }
      return rawValue;

    case "typography":
    case "shadow":
      throw Object.assign(
        new Error(
          `token '${tokenPath}' is a composite type (${tokenType}) — change individual members ` +
            "by editing the token file manually, then re-seal.",
        ),
        { code: "BAD_VALUE" },
      );

    default:
      throw Object.assign(
        new Error(`unsupported $type '${String(tokenType)}' for token '${tokenPath}'`),
        { code: "BAD_VALUE" },
      );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function runChangeToken(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  // ── Reject unknown flags (loud misconfig beats a silent no-op) ───────────────

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) {
    const msg = unknownFlagMessage(unknown);
    return useJson ? errJson(CMD, "UNKNOWN_FLAG", msg) : errText(`ui: ${msg}\n`);
  }

  // ── Validate inputs ─────────────────────────────────────────────────────────

  const tokenPath = parsed.positionals[0];
  if (typeof tokenPath !== "string" || tokenPath.length === 0) {
    const msg = "missing required argument <token.path>. Usage: ui ds change-token <path> --value <v>";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  // Schema is two-level: category.name
  const parts = tokenPath.split(".");
  if (parts.length !== 2) {
    const msg = `token path '${tokenPath}' must be two-level (e.g. color.primary)`;
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  const [category, tokenName] = parts as [string, string];

  const rawValue = parsed.flags["value"];
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    const msg = "--value <v> is required";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const reason = typeof parsed.flags["reason"] === "string"
    ? parsed.flags["reason"].slice(0, 256)
    : undefined;

  const dirFlag = parsed.flags["dir"];
  const baseDir = typeof dirFlag === "string" ? resolve(dirFlag) : cwd();

  // ── Resolve DS paths ────────────────────────────────────────────────────────

  let paths;
  try {
    paths =
      typeof dirFlag === "string"
        ? pathsForDir(resolve(baseDir, "design"))
        : discoverDesignSystem(undefined);
  } catch (e) {
    const code = e instanceof DSError ? e.code : "DS_NOT_FOUND";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  // ── Load and verify current DS ──────────────────────────────────────────────

  let ds;
  try {
    ds = loadDesignSystem(paths);
  } catch (e) {
    const code = e instanceof DSError ? e.code : "BAD_DS";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  // ── Locate the token ────────────────────────────────────────────────────────

  const categoryGroup = ds.tokens[category];
  if (categoryGroup === undefined || categoryGroup[tokenName] === undefined) {
    const msg = `token '${tokenPath}' not found in design system`;
    return useJson ? errJson(CMD, "TOKEN_NOT_FOUND", msg) : errText(`ui: ${msg}\n`);
  }

  const existingToken = categoryGroup[tokenName];
  if (existingToken === undefined) {
    const msg = `token '${tokenPath}' not found in design system`;
    return useJson ? errJson(CMD, "TOKEN_NOT_FOUND", msg) : errText(`ui: ${msg}\n`);
  }
  const tokenType = existingToken.$type;

  // ── Parse and validate new value ────────────────────────────────────────────

  let newValue: string | number;
  try {
    // Composite tokens (typography/shadow) cannot be changed via CLI — reject before alias check
    if (tokenType === "typography" || tokenType === "shadow") {
      throw Object.assign(
        new Error(
          `token '${tokenPath}' is a composite type (${tokenType}) — change individual members ` +
            "by editing the token file manually, then re-seal.",
        ),
        { code: "BAD_VALUE" },
      );
    }
    if (ALIAS_RE.test(rawValue)) {
      // Alias form: {category.name}
      newValue = rawValue;
    } else {
      newValue = validateLiteralValue(rawValue, tokenType, tokenPath);
    }
  } catch (e) {
    const code =
      e !== null && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "BAD_VALUE";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  // ── No-op check ─────────────────────────────────────────────────────────────

  const oldValue = existingToken.$value;
  const oldSerialized = serializeValue(oldValue);
  const newSerialized = serializeValue(newValue);

  if (oldSerialized === newSerialized) {
    return okJson(CMD, {
      path: tokenPath,
      from: oldSerialized,
      to: newSerialized,
      changed: false,
      generation: ds.manifest.generation,
      compiledHash: ds.manifest.compiledHash,
    });
  }

  // ── Build new TokenTree (shallow clone, replace one leaf) ───────────────────

  const newCategoryGroup = {
    ...categoryGroup,
    [tokenName]: { ...existingToken, $value: newValue },
  };
  const newTokens = { ...ds.tokens, [category]: newCategoryGroup };

  // ── Validate new graph resolves cleanly ─────────────────────────────────────

  try {
    parseTokenFile(newTokens as unknown);
    resolveTokens(newTokens);
  } catch (e) {
    // Re-map TokenError codes to their alias-graph equivalents
    const rawCode =
      e !== null && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "BAD_VALUE";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, rawCode, msg) : errText(`ui: ${msg}\n`);
  }

  // ── Atomic write sequence (A → F) ───────────────────────────────────────────

  const newTokensStr = canonicalStringify(newTokens);
  const newHash = canonicalHash(newTokens);

  const newManifestObj = appendChangelog(
    { ...ds.manifest, generation: ds.manifest.generation + 1, compiledHash: newHash },
    {
      ts: new Date().toISOString(),
      kind: "change-token",
      by: "ui ds change-token",
      path: tokenPath,
      from: oldSerialized,
      to: newSerialized,
      ...(reason !== undefined && { reason }),
    },
  );
  const newManifestStr = canonicalStringify(newManifestObj);

  const tokensTmp = paths.tokens + ".tmp";
  const manifestTmp = paths.manifest + ".tmp";

  try {
    writeFileSync(tokensTmp, newTokensStr, "utf8");     // C
    writeFileSync(manifestTmp, newManifestStr, "utf8"); // D
  } catch (e) {
    const msg = `failed to write temporary files: ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  try {
    renameSync(tokensTmp, paths.tokens);     // E
  } catch (e) {
    const msg = `failed to commit tokens file: ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  try {
    renameSync(manifestTmp, paths.manifest); // F
  } catch (e) {
    // Tokens committed, manifest stale — DS_TAMPERED on next load.
    const msg =
      `tokens file updated but manifest commit failed: ${e instanceof Error ? e.message : String(e)}. ` +
      "The design system is in a partially-updated state — hashes will not match on next load. " +
      `Recover: restore from '${manifestTmp}' if present, or run 'ui ds init --force' to recompile from scratch.`;
    return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  // ── Respond ─────────────────────────────────────────────────────────────────

  const out = okJson(CMD, {
    path: tokenPath,
    from: oldSerialized,
    to: newSerialized,
    changed: true,
    generation: newManifestObj.generation,
    compiledHash: newHash,
  });
  return withOutcome(out, parsed, {
    type: "token_change",
    actor: "ui ds change-token",
    projectDir: dirname(paths.dir),
    data: { path: tokenPath, from: oldSerialized, to: newSerialized, ...(reason !== undefined && { reason }), generation: newManifestObj.generation },
  });
}
