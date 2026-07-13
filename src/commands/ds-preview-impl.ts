/**
 * runPreview — implementation for `ui ds preview [--dir] [--out] [--json]`.
 *
 * Loads the compiled DS (manifest + hash verify, exactly like `ds status`), generates
 * a self-contained specimen.html from the REAL tokens + registry (the ds-preview core),
 * and writes it. Deterministic: same DS → byte-identical file. Default output is
 * <project>/design/preview/specimen.html. JSON envelope: { out, components, pairs, bytes }.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import {
  discoverDesignSystem,
  loadDesignSystem,
  pathsForDir,
  DSError,
} from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import { buildSpecimenPage } from "../core/ds-preview.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds preview";

/** Long flags `ui ds preview` accepts (globals --help/--json handled separately). */
const KNOWN_FLAGS = ["dir", "out"] as const;

export function runPreview(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const dirFlag = parsed.flags["dir"];
  let paths;
  try {
    paths =
      typeof dirFlag === "string"
        ? pathsForDir(resolve(dirFlag, "design"))
        : discoverDesignSystem(undefined);
  } catch (e) {
    const code = e instanceof DSError ? e.code : "DS_NOT_FOUND";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  let ds;
  try {
    ds = loadDesignSystem(paths);
  } catch (e) {
    const code =
      e instanceof DSError ? e.code : e instanceof DSManifestError ? e.code : "BAD_DS";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  const model = buildSpecimenPage(ds);

  const outFlag = parsed.flags["out"];
  const out =
    typeof outFlag === "string"
      ? resolve(outFlag)
      : join(paths.dir, "preview", "specimen.html");

  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, model.html, "utf8");
  } catch (e) {
    return err("WRITE_ERROR", `cannot write '${out}': ${e instanceof Error ? e.message : String(e)}`);
  }

  if (useJson) {
    return okJson(CMD, { out, components: model.components, pairs: model.pairs, bytes: model.bytes });
  }
  return ok(
    `ds preview: ${model.components} component(s), ${model.pairs} pair(s), ${model.bytes} bytes\n` +
      `wrote ${out}\n`,
  );
}
