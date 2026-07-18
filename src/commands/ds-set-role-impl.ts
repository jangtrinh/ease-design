/**
 * runSetRole — implementation for `ui ds set-role <token.path> <role>`.
 *
 * The owner-edit path for role recognition (spec 011 Phase 2, decision 2: editable).
 * Sets $extensions["design-os.role"] on ONE token and reseals — the same load →
 * mutate → reseal ceremony as ds-change-token-impl.ts (the proven oracle for
 * `reseal`). This is how an owner corrects a mis-recognition (`ds set-role
 * color.surface-overlay popover`) as a first-class, changelogged mutation —
 * never a silent hand-edit of design.tokens.json.
 *
 * `ds context` reads exactly what this writes and never recomputes recognition,
 * so a correction here is permanent until the owner runs `set-role` again.
 */
import { resolve } from "node:path";
import { cwd } from "node:process";

import { errJson, errText, okJson } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir, DSError } from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import { reseal } from "../core/ds-reseal.js";
import { tokenExistsInTree } from "../core/registry-token-check.js";
import { CANONICAL_ROLES } from "../core/role-recognition.js";
import type { Role } from "../core/role-recognition.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "ds set-role";

/** Long flags `ui ds set-role` accepts (globals --help/--json handled separately). */
const KNOWN_FLAGS = ["dir"] as const;

function isRole(v: string): v is Role {
  return (CANONICAL_ROLES as readonly string[]).includes(v);
}

export function runSetRole(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  // ── Reject unknown flags ────────────────────────────────────────────────────

  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  // ── Validate positionals ────────────────────────────────────────────────────

  const tokenPath = parsed.positionals[0];
  const role = parsed.positionals[1];
  if (typeof tokenPath !== "string" || tokenPath.length === 0 || typeof role !== "string" || role.length === 0) {
    return err("BAD_ARG", "missing required arguments. Usage: ui ds set-role <token.path> <role> [--dir <project>]");
  }

  const parts = tokenPath.split(".");
  if (parts.length !== 2) {
    return err("BAD_ARG", `token path '${tokenPath}' must be two-level (e.g. color.primary)`);
  }
  const [category, tokenName] = parts as [string, string];

  // ── Resolve DS paths ────────────────────────────────────────────────────────

  const dirFlag = parsed.flags["dir"];
  const baseDir = typeof dirFlag === "string" ? resolve(dirFlag) : cwd();

  let paths;
  try {
    paths = typeof dirFlag === "string" ? pathsForDir(resolve(baseDir, "design")) : discoverDesignSystem(undefined);
  } catch (e) {
    const code = e instanceof DSError ? e.code : "DS_NOT_FOUND";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  // ── Load and verify current DS ──────────────────────────────────────────────

  let ds;
  try {
    ds = loadDesignSystem(paths);
  } catch (e) {
    const code = e instanceof DSError ? e.code : e instanceof DSManifestError ? e.code : "BAD_DS";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  // ── Validate the token exists (BAD_TOKEN), then the role is canonical (BAD_ROLE) ──

  if (!tokenExistsInTree(ds.tokens, tokenPath)) {
    return err("BAD_TOKEN", `token '${tokenPath}' does not exist in the compiled design system`);
  }
  if (!isRole(role)) {
    return err("BAD_ROLE", `'${role}' is not a known role — expected one of: ${CANONICAL_ROLES.join(", ")}`);
  }

  const categoryGroup = ds.tokens[category]!;
  const existingToken = categoryGroup[tokenName]!;
  const prevRole = (existingToken.$extensions as Record<string, unknown> | undefined)?.["design-os.role"];
  const prevRoleStr = typeof prevRole === "string" ? prevRole : undefined;

  // ── No-op check ─────────────────────────────────────────────────────────────

  if (prevRoleStr === role) {
    return okJson(CMD, {
      path: tokenPath, role, changed: false,
      generation: ds.manifest.generation, compiledHash: ds.manifest.compiledHash,
    });
  }

  // ── Build new TokenTree (shallow clone, replace one leaf's $extensions) ─────

  const newExtensions = { ...existingToken.$extensions, "design-os.role": role };
  const newCategoryGroup = { ...categoryGroup, [tokenName]: { ...existingToken, $extensions: newExtensions } };
  const newTokens = { ...ds.tokens, [category]: newCategoryGroup };

  // ── Reseal (spec 009 P1: the shared Art IV ceremony) ────────────────────────

  let resealResult;
  try {
    resealResult = reseal({
      ds, paths, tokens: newTokens,
      entry: {
        kind: "set-role",
        by: "ui ds set-role",
        path: tokenPath,
        ...(prevRoleStr !== undefined && { from: prevRoleStr }),
        to: role,
      },
      nowIso: new Date().toISOString(),
    });
  } catch (e) {
    const code = e instanceof DSManifestError ? e.code : "WRITE_ERROR";
    return err(code, e instanceof Error ? e.message : String(e));
  }

  return okJson(CMD, {
    path: tokenPath, role, changed: true,
    generation: resealResult.generation, compiledHash: resealResult.compiledHash,
  });
}
