/**
 * Antigravity adapter — generates the adapter artifact list for the antigravity runtime.
 *
 * Emits:
 *   11 workflow files → <cwd>/.agent/workflows/ui-<verb>.md
 *   8 skill files     → <cwd>/.agent/skills/ease-design-<name>/SKILL.md
 *
 * Total: 19 artifacts, all mode "write".
 *
 * Antigravity uses the same YAML-frontmatter Markdown shape as Claude.
 * Shell blocks are preceded by `// turbo` to mark them as auto-executable.
 */
import { join, resolve } from "node:path";
import type { AdapterArtifact, AdapterInput } from "./index.js"; // AdapterInput: {cwd, templatesRoot}
import { WORKFLOW_VERBS, SKILL_NAMES, resolveTemplatePath } from "./templates.js";
import { buildAntigravityWorkflow, buildAntigravitySkill } from "./wrapper-shapes.js";

/**
 * Generate all Antigravity adapter artifacts for the given cwd + templatesRoot.
 * Pure function — no filesystem writes.
 */
export function generateAntigravityAdapter(input: AdapterInput): AdapterArtifact[] {
  const { cwd, templatesRoot } = input;
  // knowledge/ is the sibling of templates/ at the package root.
  const knowledgeRoot = resolve(templatesRoot, "..", "knowledge");
  const artifacts: AdapterArtifact[] = [];

  // ── Workflow files ─────────────────────────────────────────────────────────
  for (const verb of WORKFLOW_VERBS) {
    const templatePath = resolveTemplatePath(templatesRoot, "workflow", verb);
    const content = buildAntigravityWorkflow(verb, templatePath, knowledgeRoot);
    artifacts.push({
      mode: "write",
      absPath: join(cwd, ".agent", "workflows", `ui-${verb}.md`),
      content,
    });
  }

  // ── Skill files ────────────────────────────────────────────────────────────
  for (const name of SKILL_NAMES) {
    const templatePath = resolveTemplatePath(templatesRoot, "skill", name);
    if (templatePath === null) {
      throw new Error(`skill template not found for "${name}" under ${templatesRoot}`);
    }
    const content = buildAntigravitySkill(name, templatePath, knowledgeRoot);
    artifacts.push({
      mode: "write",
      absPath: join(cwd, ".agent", "skills", `ease-design-${name}`, "SKILL.md"),
      content,
    });
  }

  return artifacts;
}
