/**
 * Claude Code adapter — generates the adapter artifact list for the claude runtime.
 *
 * Emits:
 *   16 slash-command files → <cwd>/.claude/commands/ui/<verb>.md
 *   11 skill files         → <cwd>/.claude/skills/design-os-<name>/SKILL.md  (8 craft + 3 journey)
 *
 * Total: 27 artifacts, all mode "write".
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
import { buildClaudeCommand, buildClaudeSkill } from "./wrapper-shapes.js";
import { VERB_SKILL_REFS } from "./skill-refs.js";

/**
 * Push one `.claude/skills/design-os-<name>/SKILL.md` artifact. Shared by the
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
    // Skills/journeys always have a template file; null here indicates a registry/fs mismatch.
    throw new Error(`${kind} template not found for "${name}" under ${templatesRoot}`);
  }
  const description = readTemplateDescription(templatePath) ?? undefined;
  const content = buildClaudeSkill(name, templatePath, knowledgeRoot, description);
  artifacts.push({
    mode: "write",
    absPath: join(cwd, ".claude", "skills", `design-os-${name}`, "SKILL.md"),
    content,
  });
}

/**
 * Generate all Claude Code adapter artifacts for the given cwd + templatesRoot.
 * Pure function — no filesystem writes.
 */
export function generateClaudeAdapter(input: AdapterInput): AdapterArtifact[] {
  const { cwd, templatesRoot } = input;
  // knowledge/ is the sibling of templates/ at the package root — supply it as
  // an absolute anchor so the template's bare `knowledge/...` refs resolve.
  const knowledgeRoot = resolve(templatesRoot, "..", "knowledge");
  const artifacts: AdapterArtifact[] = [];

  // ── Slash-command files ────────────────────────────────────────────────────
  for (const verb of WORKFLOW_VERBS) {
    const templatePath = resolveTemplatePath(templatesRoot, "workflow", verb);
    const skillRefs = VERB_SKILL_REFS[verb] ?? [];
    // Discovery description comes from the template's own frontmatter (SSOT).
    const description =
      templatePath !== null ? readTemplateDescription(templatePath) ?? undefined : undefined;
    const content = buildClaudeCommand(verb, templatePath, skillRefs, knowledgeRoot, description);
    artifacts.push({
      mode: "write",
      absPath: join(cwd, ".claude", "commands", "ui", `${verb}.md`),
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
