/**
 * Adapter integrity lint for `ui doctor --cwd`.
 *
 * `ui init` records a sha256 per referenced template in the manifest "for drift
 * detection" and writes a per-runtime wrapper tree — but nothing ever read those
 * hashes back or opened a wrapper. So editing `templates/` without re-running
 * `ui init --force` left every runtime silently stale, and a broken wrapper
 * still reported "healthy". Two read-only checks close that gap:
 *
 *   1. template-drift    — re-hash the live package templates and compare to the
 *                          manifest's recorded hashes (added / removed / changed).
 *   2. adapter-wrappers  — each generated wrapper is well-formed (see
 *                          adapter-wrapper-lint.ts).
 *
 * Pure except fs reads (via the template hasher). No writes, no network.
 */
import {
  WORKFLOW_VERBS,
  SKILL_NAMES,
  JOURNEY_NAMES,
  resolveTemplatePath,
  hashTemplateFile,
} from "../adapters/templates.js";
import { checkWrappers } from "./adapter-wrapper-lint.js";

export type LintStatus = "pass" | "warn" | "fail";

export interface AdapterLintCheck {
  id: string;
  status: LintStatus;
  detail: string;
}

/** The manifest fields this lint reads (all optional — old installs omit them). */
export interface ReadManifest {
  status?: unknown;
  runtime?: unknown;
  adapters?: unknown;
  templateHashes?: unknown;
}

// ─── Live template hashes ───────────────────────────────────────────────────────

/** resolveTemplatePath but returns null instead of throwing on a missing file. */
function resolveTemplatePathSafe(
  root: string,
  kind: "workflow" | "skill" | "journey",
  name: string,
): string | null {
  try {
    return resolveTemplatePath(root, kind, name);
  } catch {
    return null;
  }
}

/**
 * Build `{ "workflows/generate.md": sha256, "skills/pick-persona.md": sha256,
 * "journeys/onboard.md": sha256, … }` for the live package. MUST enumerate the
 * same registries as init.ts's manifest templateHashes builder (lockstep — an
 * asymmetry makes template-drift false-fail/false-pass).
 */
function liveTemplateHashes(templatesRoot: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const verb of WORKFLOW_VERBS) {
    if (verb === "init") continue; // synthetic — no template file
    const p = resolveTemplatePathSafe(templatesRoot, "workflow", verb);
    if (p !== null) hashes[`workflows/${verb}.md`] = hashTemplateFile(p);
  }
  for (const name of SKILL_NAMES) {
    const p = resolveTemplatePathSafe(templatesRoot, "skill", name);
    if (p !== null) hashes[`skills/${name}.md`] = hashTemplateFile(p);
  }
  for (const name of JOURNEY_NAMES) {
    const p = resolveTemplatePathSafe(templatesRoot, "journey", name);
    if (p !== null) hashes[`journeys/${name}.md`] = hashTemplateFile(p);
  }
  return hashes;
}

// ─── Check 1: template drift ────────────────────────────────────────────────────

function checkTemplateDrift(templatesRoot: string, manifest: ReadManifest): AdapterLintCheck {
  const recorded = manifest.templateHashes;
  const recordedMap =
    recorded !== null && typeof recorded === "object" ? (recorded as Record<string, unknown>) : null;
  // No usable hashes (old manifest, or a hand-cleared `{}`) → nothing to compare.
  if (recordedMap === null || Object.keys(recordedMap).length === 0) {
    return {
      id: "template-drift",
      status: "warn",
      detail: "manifest records no template hashes — run 'ui init --force' to enable drift detection",
    };
  }
  const live = liveTemplateHashes(templatesRoot);

  const drifted: string[] = [];
  // Changed or removed relative to what was installed.
  for (const [key, hash] of Object.entries(recordedMap)) {
    const liveHash = live[key];
    if (liveHash === undefined) drifted.push(`${key} (removed from package)`);
    else if (liveHash !== String(hash)) drifted.push(`${key} (changed)`);
  }
  // Added to the package since the last init.
  for (const key of Object.keys(live)) {
    if (!(key in recordedMap)) drifted.push(`${key} (added since init)`);
  }

  if (drifted.length > 0) {
    return {
      id: "template-drift",
      status: "fail",
      detail:
        `${drifted.length} template(s) drifted since 'ui init' — re-run 'ui init --force' to regenerate wrappers: ` +
        drifted.join(", "),
    };
  }
  return { id: "template-drift", status: "pass", detail: `${Object.keys(recordedMap).length} template hashes match the live package` };
}

// ─── Entry point ────────────────────────────────────────────────────────────────

/**
 * Run the two adapter-integrity checks for an initialised project.
 * template-drift is skipped when no templates root resolved (nothing to hash).
 */
export function lintProjectAdapters(input: {
  cwd: string;
  templatesRoot: string | null;
  manifest: ReadManifest;
}): AdapterLintCheck[] {
  const checks: AdapterLintCheck[] = [];
  if (input.templatesRoot !== null) {
    checks.push(checkTemplateDrift(input.templatesRoot, input.manifest));
  }
  checks.push(checkWrappers(input.cwd, input.manifest));
  return checks;
}
