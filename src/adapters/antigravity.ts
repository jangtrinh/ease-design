/**
 * Antigravity adapter — generates the adapter artifact list for the antigravity runtime.
 *
 * Emits:
 *   16 workflow files → <cwd>/.agent/workflows/ui-<verb>.md
 *   11 skill files    → <cwd>/.agent/skills/design-os-<name>/SKILL.md  (8 craft + 3 journey)
 *
 * Total: 27 artifacts, all mode "write".
 *
 * Antigravity uses the same YAML-frontmatter Markdown shape as Claude.
 * Shell blocks are preceded by `// turbo` to mark them as auto-executable.
 */
import { join, resolve } from "node:path";
import type { AdapterArtifact, AdapterInput } from "./index.js"; // AdapterInput: {cwd, templatesRoot}
import {
  WORKFLOW_VERBS,
  SKILL_NAMES,
  JOURNEY_NAMES,
  resolveTemplatePath,
  readTemplateDescription,
} from "./templates.js";
import { buildAntigravityWorkflow, buildAntigravitySkill } from "./wrapper-shapes.js";

/**
 * Push one `.agent/skills/design-os-<name>/SKILL.md` artifact. Shared by the
 * craft-skill loop (kind "skill") and the journey-skill loop (kind "journey")
 * below — both emit through the identical wrapper shape.
 */
function pushSkillArtifact(
  artifacts: AdapterArtifact[],
  cwd: string,
  templatesRoot: string,
  knowledgeRoot: string,
  kind: "skill" | "journey",
  name: string,
): void {
  const templatePath = resolveTemplatePath(templatesRoot, kind, name);
  if (templatePath === null) {
    throw new Error(`${kind} template not found for "${name}" under ${templatesRoot}`);
  }
  const description = readTemplateDescription(templatePath) ?? undefined;
  const content = buildAntigravitySkill(name, templatePath, knowledgeRoot, description);
  artifacts.push({
    mode: "write",
    absPath: join(cwd, ".agent", "skills", `design-os-${name}`, "SKILL.md"),
    content,
  });
}

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
    // Discovery description comes from the template's own frontmatter (SSOT).
    const description =
      templatePath !== null ? readTemplateDescription(templatePath) ?? undefined : undefined;
    const content = buildAntigravityWorkflow(verb, templatePath, knowledgeRoot, description);
    artifacts.push({
      mode: "write",
      absPath: join(cwd, ".agent", "workflows", `ui-${verb}.md`),
      content,
    });
  }

  // ── Skill files (8 craft skills) ────────────────────────────────────────────
  for (const name of SKILL_NAMES) {
    pushSkillArtifact(artifacts, cwd, templatesRoot, knowledgeRoot, "skill", name);
  }

  // ── Journey-skill files (3 journey skills: onboard/daily/deliver) ──────────
  for (const name of JOURNEY_NAMES) {
    pushSkillArtifact(artifacts, cwd, templatesRoot, knowledgeRoot, "journey", name);
  }

  return artifacts;
}
