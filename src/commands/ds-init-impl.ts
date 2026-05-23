/**
 * runInit — implementation for `ui ds init`.
 *
 * Compiles a new project-scoped design system from a persona + intent.
 * Writes design.tokens.json, component-registry.json, ds.manifest.json
 * and seals them with canonical SHA-256 hashes.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

import { errJson, errText, okJson } from "../core/output.js";
import { pathsForDir } from "../core/design-system.js";
import { canonicalStringify, canonicalHash, newManifest, appendChangelog, loadManifest, saveManifest } from "../core/ds-manifest.js";
import { loadPersonaIndex, findPersona, PersonaError } from "../core/persona-loader.js";
import { expandPersona, ExpandError } from "../core/persona-expand.js";
import { parseTokenFile } from "../core/token-model.js";
import { resolveTokens } from "../core/token-resolve.js";
import { saveRegistry } from "../core/registry-store.js";
import { countTokens } from "../core/design-system.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds init";
const NAME_RE = /^[a-z][a-z0-9-]*$/;
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

export function runInit(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  // ── Validate inputs ─────────────────────────────────────────────────────────

  const name = parsed.positionals[0];
  if (typeof name !== "string" || name.length === 0) {
    const msg = "missing required argument <name>. Usage: ui ds init <name> --persona <slug> --intent <text>";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  if (!NAME_RE.test(name) || name.length > 64) {
    const msg = `invalid name '${name}' — must match ^[a-z][a-z0-9-]*$ (max 64 chars)`;
    return useJson ? errJson(CMD, "BAD_NAME", msg) : errText(`ui: ${msg}\n`);
  }

  const personaSlug = parsed.flags["persona"];
  if (typeof personaSlug !== "string" || personaSlug.length === 0) {
    const msg = "--persona <slug> is required";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const intent = parsed.flags["intent"];
  if (typeof intent !== "string" || intent.length === 0) {
    const msg = "--intent <text> is required";
    return useJson ? errJson(CMD, "BAD_INTENT", msg) : errText(`ui: ${msg}\n`);
  }
  if (intent.length > 512) {
    const msg = "--intent must be at most 512 characters";
    return useJson ? errJson(CMD, "BAD_INTENT", msg) : errText(`ui: ${msg}\n`);
  }

  const brandHexRaw = parsed.flags["brand-hex"];
  const brandHex = typeof brandHexRaw === "string" ? brandHexRaw : undefined;
  if (brandHex !== undefined && !HEX6_RE.test(brandHex)) {
    const msg = `--brand-hex '${brandHex}' must be a 6-digit hex color (#RRGGBB)`;
    return useJson ? errJson(CMD, "BAD_BRAND_HEX", msg) : errText(`ui: ${msg}\n`);
  }

  const dirFlag = parsed.flags["dir"];
  const baseDir = typeof dirFlag === "string" ? resolve(dirFlag) : cwd();
  const force = parsed.flags["force"] === true;

  const personaDataFlag = parsed.flags["persona-data"];
  const personaDataPath = typeof personaDataFlag === "string" ? personaDataFlag : undefined;

  // ── Check for existing DS ───────────────────────────────────────────────────

  const paths = pathsForDir(resolve(baseDir, "design"));

  const manifestExists = existsSync(paths.manifest);
  if (manifestExists && !force) {
    const msg = `design system already initialised at '${paths.manifest}'. Re-run with --force to overwrite.`;
    return useJson ? errJson(CMD, "DS_EXISTS", msg) : errText(`ui: ${msg}\n`);
  }

  // When overwriting, load prior changelog to preserve history.
  let priorChangelog: import("../core/ds-manifest.js").DSChangelogEntry[] = [];
  if (manifestExists && force) {
    try {
      const prior = loadManifest(paths.manifest);
      priorChangelog = prior.changelog;
    } catch {
      // Prior manifest unreadable (corrupt/tampered) — start fresh changelog
      priorChangelog = [];
    }
  }

  // ── Load persona ────────────────────────────────────────────────────────────

  let records;
  try {
    records = loadPersonaIndex(personaDataPath);
  } catch (e) {
    const code = e instanceof PersonaError ? e.code : "BAD_ARG";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  let persona;
  try {
    persona = findPersona(records, String(personaSlug));
  } catch (e) {
    const code = e instanceof PersonaError ? e.code : "BAD_ARG";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  // ── Expand persona to token skeleton ────────────────────────────────────────

  let expandResult;
  try {
    expandResult = expandPersona({ persona, intent, brandHex });
  } catch (e) {
    const code = e instanceof ExpandError ? e.code : "BAD_ARG";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  const { tokens, registry } = expandResult;

  // Safety validation: parse + resolve the generated token tree
  try {
    parseTokenFile(tokens as unknown);
    resolveTokens(tokens);
  } catch (e) {
    const msg = `internal token skeleton validation failed: ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "BAD_TOKEN", msg) : errText(`ui: ${msg}\n`);
  }

  // ── Write artifacts ─────────────────────────────────────────────────────────

  try {
    mkdirSync(paths.dir, { recursive: true });
  } catch (e) {
    const msg = `cannot create design directory '${paths.dir}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  try {
    writeFileSync(paths.tokens, canonicalStringify(tokens), "utf8");
  } catch (e) {
    const msg = `cannot write tokens file '${paths.tokens}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  try {
    saveRegistry(paths.registry, registry);
  } catch (e) {
    const msg = `cannot write registry file '${paths.registry}': ${e instanceof Error ? e.message : String(e)}`;
    return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  // ── Build and write manifest ────────────────────────────────────────────────

  const compiledHash = canonicalHash(tokens);

  // Hash the registry as it will be saved on disk (sorted by saveRegistry)
  const sortedRegistry = {
    version: registry.version,
    components: [...registry.components].sort((a, b) => a.name.localeCompare(b.name)),
  };
  const registryHash = canonicalHash(sortedRegistry);

  let manifest = newManifest({
    name,
    persona: {
      slug: persona.slug,
      family: persona.family,
      ...(persona.antiPatterns.length > 0 && { antiPatterns: persona.antiPatterns }),
    },
    intent,
    compiledHash,
    registryHash,
  });
  // Prepend prior changelog history (preserved across --force re-inits)
  if (priorChangelog.length > 0) {
    manifest = { ...manifest, changelog: [...priorChangelog] };
  }
  manifest = appendChangelog(manifest, {
    ts: new Date().toISOString(),
    kind: "init",
    by: "ui ds init",
    note: `compiled from persona=${persona.slug}`,
  });

  try {
    if (!force) {
      // Use "wx" (exclusive create) to prevent a TOCTOU race: if another process
      // created the manifest between our existsSync check and this write, we fail
      // instead of silently overwriting.
      writeFileSync(paths.manifest, canonicalStringify(manifest), { encoding: "utf8", flag: "wx" });
    } else {
      saveManifest(paths.manifest, manifest);
    }
  } catch (e) {
    const isExist =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "EEXIST";
    const msg = isExist
      ? `design system already initialised at '${paths.manifest}' (concurrent init). Re-run with --force to overwrite.`
      : `cannot write manifest '${paths.manifest}': ${e instanceof Error ? e.message : String(e)}`;
    const code = isExist ? "DS_EXISTS" : "WRITE_ERROR";
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  // ── Respond ─────────────────────────────────────────────────────────────────

  const tokenCount = countTokens(tokens);

  return okJson(CMD, {
    name,
    paths: {
      dir:      paths.dir,
      tokens:   paths.tokens,
      registry: paths.registry,
      manifest: paths.manifest,
    },
    persona: { slug: persona.slug, family: persona.family },
    generation: manifest.generation,
    tokenCount,
    compiledHash,
    registryHash,
  });
}
