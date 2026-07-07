/**
 * Claude Code adapter — generates the adapter artifact list for the claude runtime.
 *
 * Emits:
 *   11 slash-command files → <cwd>/.claude/commands/ui/<verb>.md
 *   8 skill files          → <cwd>/.claude/skills/ease-design-<name>/SKILL.md
 *
 * Total: 19 artifacts, all mode "write".
 */
import { join, resolve } from "node:path";
import type { AdapterArtifact, AdapterInput } from "./index.js"; // AdapterInput: {cwd, templatesRoot}
import { WORKFLOW_VERBS, SKILL_NAMES, resolveTemplatePath } from "./templates.js";
import { buildClaudeCommand, buildClaudeSkill } from "./wrapper-shapes.js";
import { VERB_SKILL_REFS } from "./skill-refs.js";

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
    const content = buildClaudeCommand(verb, templatePath, skillRefs, knowledgeRoot);
    artifacts.push({
      mode: "write",
      absPath: join(cwd, ".claude", "commands", "ui", `${verb}.md`),
      content,
    });
  }

  // ── Skill files ────────────────────────────────────────────────────────────
  for (const name of SKILL_NAMES) {
    const templatePath = resolveTemplatePath(templatesRoot, "skill", name);
    if (templatePath === null) {
      // Skills always have a template file; null here indicates a registry/fs mismatch.
      throw new Error(`skill template not found for "${name}" under ${templatesRoot}`);
    }
    const content = buildClaudeSkill(name, templatePath, knowledgeRoot);
    artifacts.push({
      mode: "write",
      absPath: join(cwd, ".claude", "skills", `ease-design-${name}`, "SKILL.md"),
      content,
    });
  }

  return artifacts;
}
