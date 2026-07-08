/**
 * Template path resolver and hash utility for the adapter generator.
 *
 * WORKFLOW_VERBS and SKILL_NAMES are the canonical registries. If a new
 * template file is added to templates/, these lists must be updated in the
 * same commit. The test suite asserts parity with the actual filesystem.
 *
 * The `init` verb is a special case: there is no `templates/workflows/init.md`
 * because the init slash-command wraps `ui init` itself, not a design workflow.
 * `resolveTemplatePath` returns null for ("workflow", "init") and callers
 * must handle null to produce a synthetic body.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// ─── Registries ───────────────────────────────────────────────────────────────

/**
 * All user-facing workflow verbs. "init" is synthetic (no template file).
 * The remaining 11 correspond to files in templates/workflows/.
 */
export const WORKFLOW_VERBS = [
  "generate",
  "iterate",
  "refine",
  "redesign",
  "extract",
  "learn",
  "why",
  "from-ref",
  "from-url",
  "figma",
  "to-figma",
  "slides",
  "init",
] as const satisfies readonly string[];

export type WorkflowVerb = (typeof WORKFLOW_VERBS)[number];

/**
 * All skill names. Each corresponds to a file in templates/skills/.
 */
export const SKILL_NAMES = [
  "pick-persona",
  "score-taste",
  "check-consistency",
  "color-decision",
  "token-model",
  "apply-prompt-mode",
  "designmd-emit",
  "figma-craft",
] as const satisfies readonly string[];

export type SkillName = (typeof SKILL_NAMES)[number];

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path of a template file.
 *
 * Returns null for the synthetic "init" workflow (no template file exists).
 * Throws if any other template is missing — a missing template is a hard error
 * caught before any file is written.
 */
export function resolveTemplatePath(
  templatesRoot: string,
  kind: "workflow" | "skill",
  name: string,
): string | null {
  if (kind === "workflow" && name === "init") {
    return null;
  }
  const subdir = kind === "workflow" ? "workflows" : "skills";
  const absPath = join(templatesRoot, subdir, `${name}.md`);
  if (!existsSync(absPath)) {
    throw new Error(`template not found at ${absPath}`);
  }
  return absPath;
}

// ─── Frontmatter description ──────────────────────────────────────────────────

/**
 * Read the `description:` value from a template's YAML frontmatter, or null
 * when the file has no frontmatter / no description line.
 *
 * This is the single source of the wrapper discovery descriptions (what +
 * when + trigger terms). The wrapper builders (wrapper-shapes.ts) stay pure
 * string functions — the fs read lives here, next to the other template fs
 * access, and the adapters pass the result in explicitly.
 *
 * Deterministic, intentionally narrow parse: a leading `---` line, a closing
 * `---` line, and a single-line `description:` between them. Surrounding
 * single/double quotes are stripped.
 */
export function readTemplateDescription(absPath: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  if (!raw.startsWith("---\n")) return null;
  const closeIdx = raw.indexOf("\n---", 4);
  if (closeIdx === -1) return null;
  const block = raw.slice(4, closeIdx);
  for (const line of block.split("\n")) {
    const m = /^description:\s*(.+)\s*$/.exec(line);
    if (m !== null && m[1] !== undefined) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1).replace(/\\"/g, '"');
      }
      return v.length > 0 ? v : null;
    }
  }
  return null;
}

// ─── Hasher ───────────────────────────────────────────────────────────────────

/**
 * Return the sha256 hex digest of a template file's contents.
 * Used to record templateHashes in the manifest for future drift detection.
 */
export function hashTemplateFile(absPath: string): string {
  const buf = readFileSync(absPath);
  return createHash("sha256").update(buf).digest("hex");
}
