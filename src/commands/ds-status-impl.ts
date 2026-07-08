/**
 * runStatus — implementation for `ui ds status`.
 *
 * Emits a compact manifest summary: name, generation, persona, token count,
 * component count, and hash values. Read-only; never modifies artifacts.
 */
import { resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import {
  discoverDesignSystem,
  loadDesignSystem,
  pathsForDir,
  countTokens,
  DSError,
} from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds status";

/** Long flags `ui ds status` accepts (globals --help/--json handled separately). */
const KNOWN_FLAGS = ["dir"] as const;

export function runStatus(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) {
    const msg = unknownFlagMessage(unknown);
    return useJson ? errJson(CMD, "UNKNOWN_FLAG", msg) : errText(`ui: ${msg}\n`);
  }

  const dirFlag = parsed.flags["dir"];
  let paths;
  try {
    paths =
      typeof dirFlag === "string"
        ? pathsForDir(resolve(dirFlag, "design"))
        : discoverDesignSystem(undefined);
  } catch (e) {
    const code = e instanceof DSError ? e.code : "DS_NOT_FOUND";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  let ds;
  try {
    ds = loadDesignSystem(paths);
  } catch (e) {
    const code =
      e instanceof DSError
        ? e.code
        : e instanceof DSManifestError
        ? e.code
        : "BAD_DS";
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
  }

  if (useJson) {
    return okJson(CMD, {
      name: ds.manifest.name,
      generation: ds.manifest.generation,
      persona: ds.manifest.persona,
      intent: ds.manifest.intent,
      tokenCount: countTokens(ds.tokens),
      componentCount: ds.registry.components.length,
      compiledHash: ds.manifest.compiledHash,
      registryHash: ds.manifest.registryHash,
      paths: ds.paths,
    });
  }

  const m = ds.manifest;
  return ok(
    `ds: ${m.name} (gen ${m.generation})\n` +
    `persona: ${m.persona.slug} / ${m.persona.family}\n` +
    `intent:  ${m.intent}\n` +
    `tokens:  ${countTokens(ds.tokens)} (semantic + primitive)\n` +
    `components: ${ds.registry.components.length}\n` +
    `manifest: ${ds.paths.manifest}\n`,
  );
}
