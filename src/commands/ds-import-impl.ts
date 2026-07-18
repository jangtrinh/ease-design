/**
 * runImport — `ui ds import <tokens.json> --dir <project>`.
 *
 * Onboard an EXISTING flat design-token file into the ease-design DS store so the rest of
 * `ui ds *` (a11y, status, diff, docs) works on it (dogfood G1: a Figma-reconciled
 * tokens.json is flat `{category:{name:value}}`, not the DTCG store shape). Converts →
 * DTCG, seals a fresh manifest + empty registry. Deterministic transform; only writes files.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { pathsForDir } from "../core/design-system.js";
import { canonicalStringify, canonicalHash, newManifest } from "../core/ds-manifest.js";
import { createEmptyRegistry } from "../core/registry-store.js";
import { parseTokenFile } from "../core/token-model.js";
import { importFlatTokens } from "../core/token-import.js";
import { recognizeRoles } from "../core/role-recognition.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds import";
const KNOWN_FLAGS = ["dir", "name", "force", "reset-registry"] as const;
const NAME_RE = /^[a-z][a-z0-9-]*$/;

export function runImport(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => (useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const src = parsed.positionals[0];
  if (typeof src !== "string" || src.length === 0) {
    return err("BAD_ARG", "missing <tokens.json>. Usage: ui ds import <tokens.json> --dir <project>");
  }
  const dirFlag = parsed.flags["dir"];
  const projectDir = typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd();
  const designDir = join(projectDir, "design");
  const paths = pathsForDir(designDir);

  const nameFlag = parsed.flags["name"];
  const name = typeof nameFlag === "string" ? nameFlag : "imported-ds";
  if (!NAME_RE.test(name) || name.length > 64) return err("BAD_NAME", `invalid --name '${name}' — must match ^[a-z][a-z0-9-]*$`);

  const force = parsed.flags["force"] === true;
  if (!force && existsSync(paths.tokens)) return err("EXISTS", `${paths.tokens} already exists (use --force to overwrite)`);

  // D2: --force alone must not silently wipe a non-empty registry (dana lost 3 components
  // + 102 changelog entries this way). --reset-registry is the explicit opt-in that
  // preserves today's wipe behaviour verbatim.
  const resetRegistry = parsed.flags["reset-registry"] === true;
  if (force && !resetRegistry && existsSync(paths.registry)) {
    let existingCount: number;
    try {
      const prior = JSON.parse(readFileSync(paths.registry, "utf8")) as { components?: unknown[] };
      existingCount = Array.isArray(prior.components) ? prior.components.length : 0;
    } catch {
      existingCount = 0; // unreadable/corrupt registry — nothing provably non-empty to protect
    }
    if (existingCount > 0) {
      return err(
        "REGISTRY_NOT_EMPTY",
        `--force would wipe ${existingCount} registered component(s) at '${paths.registry}' — ` +
          "pass --reset-registry to confirm, or use 'ui registry register' to add without wiping",
      );
    }
  }

  // Read + convert.
  let flat: unknown;
  try {
    flat = JSON.parse(readFileSync(src, "utf8"));
  } catch (e) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    if (notFound) return err("FILE_NOT_FOUND", `file not found: '${src}'`);
    return err("BAD_JSON", `cannot read/parse '${src}': ${e instanceof Error ? e.message : String(e)}`);
  }

  let dtcg, stats;
  try {
    ({ dtcg, stats } = importFlatTokens(flat));
  } catch (e) {
    return err("BAD_JSON", `import failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (stats.imported === 0) return err("EMPTY_IMPORT", `no typeable tokens found in '${src}' — nothing to import`);

  // Self-check: the emitted DTCG must parse.
  try {
    parseTokenFile(dtcg);
  } catch (e) {
    return err("BAD_JSON", `internal: emitted DTCG did not validate: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Bake role recognition (spec 011 Phase 2) BEFORE sealing, so the seal covers
  // the annotated tree — deterministic, so the hash is stable. Lossless: every
  // name/value survives verbatim; only $extensions["design-os.role"] is added.
  // Never renames, drops, or injects a token (see role-recognition.ts).
  const recognition = recognizeRoles(dtcg);
  const annotated = recognition.annotated;

  // Seal a minimal store: tokens + empty registry + manifest.
  const registry = createEmptyRegistry();
  const manifest = newManifest({
    name,
    persona: { slug: "imported", family: "imported" },
    intent: `imported from ${src}`,
    compiledHash: canonicalHash(annotated),
    registryHash: canonicalHash(registry),
  });
  try {
    mkdirSync(designDir, { recursive: true });
    // canonicalStringify already appends a trailing "\n" (ds-manifest.ts) — do not double it.
    writeFileSync(paths.tokens, canonicalStringify(annotated));
    writeFileSync(paths.registry, canonicalStringify(registry));
    writeFileSync(paths.manifest, canonicalStringify(manifest));
  } catch (e) {
    return err("WRITE_ERROR", `could not write DS store: ${e instanceof Error ? e.message : String(e)}`);
  }

  const summary = {
    name, dir: designDir, ...stats, categories: Object.keys(annotated).length,
    rolesRecognized: recognition.recognized, roleGaps: recognition.gaps,
  };
  if (useJson) return okJsonWithExit(CMD, summary, 0);
  const typeLine = Object.entries(stats.byType).map(([t, n]) => `${n} ${t}`).join(", ");
  const lines = [
    `ds import: ${stats.imported} token(s) [${typeLine}] across ${summary.categories} categories → ${designDir}`,
    `  ${recognition.recognized} roles recognized, ${recognition.gaps.length} gaps: ${recognition.gaps.join(", ")}`,
    ...(stats.skipped > 0 ? [`  skipped ${stats.skipped} un-typeable token(s): ${stats.skippedKeys.slice(0, 6).map((s) => s.key).join(", ")}${stats.skipped > 6 ? " …" : ""}`] : []),
    `  next: ui ds a11y --dir ${parsed.flags["dir"] ?? "."}  ·  ui ds status --dir ${parsed.flags["dir"] ?? "."}`,
  ];
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}
