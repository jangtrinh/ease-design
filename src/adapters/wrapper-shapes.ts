/**
 * Pure string builders that produce the body of each adapter wrapper file.
 *
 * Rules for all builders:
 * - No embedded timestamps (deterministic output — same inputs → same bytes).
 * - No plan/phase/finding references in the generated content.
 * - All file paths use forward-slash separators for cross-platform Markdown rendering.
 * - Wrappers point AT template files; they never copy their content.
 */
// WORKFLOW_VERBS is the canonical verb registry. Importing it keeps the Codex
// slash-command list derived (never a hand-maintained copy that drifts). This
// is a const-array import only — templates.ts does no fs work at import time, so
// the "no fs access" rule above still holds.
import { WORKFLOW_VERBS } from "./templates.js";

// ─── Descriptions ─────────────────────────────────────────────────────────────
//
// Wrapper `description:` frontmatter is the ONLY preloaded discovery signal a
// runtime sees for a skill/command, so it is sourced from the template's own
// frontmatter (single source of truth — see templates.ts readTemplateDescription)
// and passed in explicitly by the adapters. The builders stay pure string
// functions: no fs access here, the bare name is the legacy fallback.

/** Description for the synthetic `init` verb, which has no template file. */
export const INIT_VERB_DESCRIPTION = "Initialise ease-design for this project";

/**
 * Render a description as a single-line double-quoted YAML scalar. Sourced
 * descriptions are multi-sentence ("… Use when …") with commas/colons, which
 * are unsafe as plain YAML scalars.
 */
function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim()}"`;
}

// ─── Path normalisation ────────────────────────────────────────────────────────

/** Normalise OS path separators to forward-slash so Markdown links render correctly on Windows-authored docs too. */
function toFwdSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

// ─── Knowledge anchor ───────────────────────────────────────────────────────────

/**
 * Build the anchor line that resolves the bare `knowledge/<file>` references
 * inside a runtime-neutral template to an absolute base.
 *
 * The templates are intentionally runtime-neutral: they say `knowledge/foo.md`,
 * not an absolute path. The wrapper supplies the absolute knowledge root — the
 * same way it supplies the absolute template path — so a consumer running
 * outside the ease-design repo (e.g. an npm install) can still reach the
 * knowledge core. Without this, every `knowledge/...` read in the workflow has
 * no resolvable anchor. Returns "" when no root is supplied (legacy callers).
 */
function buildKnowledgeAnchor(knowledgeRoot: string | undefined): string {
  if (knowledgeRoot === undefined || knowledgeRoot === "") return "";
  const kr = toFwdSlash(knowledgeRoot);
  return (
    "\nThe workflow reads files under `knowledge/`. Resolve every such path " +
    `against this absolute base: \`${kr}\` ` +
    `(e.g. \`knowledge/persona-index.md\` → \`${kr}/persona-index.md\`).\n`
  );
}

// ─── Skill-ref prose helpers ──────────────────────────────────────────────────

/** Build the "invoke skill" lines appended to Claude command bodies. */
function buildSkillRefLines(skillRefs: readonly string[]): string {
  if (skillRefs.length === 0) return "";
  const lines = skillRefs.map(
    (s) => `When the workflow instructs it, invoke skill \`design-os-${s}\`.`,
  );
  return "\n" + lines.join("\n") + "\n";
}

// ─── Claude builders ──────────────────────────────────────────────────────────

/**
 * Build the body of a `.claude/commands/ui/<verb>.md` slash-command wrapper.
 *
 * @param verb          The workflow verb (e.g. "generate").
 * @param templatePath  Absolute path to the workflow template file, or null for "init".
 * @param skillRefs     Skill names the command should delegate to.
 * @param description   Discovery description sourced from the template's frontmatter.
 */
export function buildClaudeCommand(
  verb: string,
  templatePath: string | null,
  skillRefs: readonly string[],
  knowledgeRoot?: string,
  description?: string,
): string {
  const summary = description ?? (verb === "init" ? INIT_VERB_DESCRIPTION : verb);
  const skillBlock = buildSkillRefLines(skillRefs);

  if (verb === "init" || templatePath === null) {
    return [
      "---",
      `description: ${yamlQuote(`ease-design /ui:init — ${description ?? INIT_VERB_DESCRIPTION}`)}`,
      "---",
      "",
      "# /ui:init",
      "",
      "Run the ease-design initialiser for this runtime:",
      "",
      "```bash",
      "ui init --runtime claude",
      "```",
      "",
      "Pass `--force` to overwrite an existing installation.",
      "",
    ].join("\n");
  }

  const tplPath = toFwdSlash(templatePath);
  return [
    "---",
    `description: ${yamlQuote(`ease-design /ui:${verb} — ${summary}`)}`,
    "---",
    "",
    `# /ui:${verb}`,
    "",
    "Follow the runtime-neutral workflow at:",
    `\`${tplPath}\``,
    buildKnowledgeAnchor(knowledgeRoot),
    skillBlock,
  ].join("\n");
}

/**
 * Build the body of a `.claude/skills/design-os-<name>/SKILL.md` wrapper.
 *
 * @param name         The skill name (e.g. "pick-persona").
 * @param templatePath Absolute path to the skill template file.
 * @param description  Discovery description sourced from the template's frontmatter.
 */
export function buildClaudeSkill(
  name: string,
  templatePath: string,
  knowledgeRoot?: string,
  description?: string,
): string {
  const summary = description ?? name;
  const tplPath = toFwdSlash(templatePath);
  return [
    "---",
    `name: design-os-${name}`,
    `description: ${yamlQuote(summary)}`,
    "---",
    "",
    "Follow the runtime-neutral skill at:",
    `\`${tplPath}\``,
    buildKnowledgeAnchor(knowledgeRoot),
    "",
  ].join("\n");
}

// ─── Antigravity builders ─────────────────────────────────────────────────────

/**
 * Build the body of a `.agent/workflows/ui-<verb>.md` workflow wrapper.
 *
 * Antigravity marks shell blocks with `// turbo` so they are auto-executed.
 * Every workflow wrapper includes at least one `ui` shell invocation, so
 * `// turbo` is always present.
 *
 * @param verb          The workflow verb.
 * @param templatePath  Absolute path to the workflow template file, or null for "init".
 */
export function buildAntigravityWorkflow(
  verb: string,
  templatePath: string | null,
  knowledgeRoot?: string,
  description?: string,
): string {
  const summary = description ?? (verb === "init" ? INIT_VERB_DESCRIPTION : verb);

  if (verb === "init" || templatePath === null) {
    return [
      "---",
      `description: ${yamlQuote(`ease-design ui-init — ${description ?? INIT_VERB_DESCRIPTION}`)}`,
      "---",
      "",
      "# ui-init",
      "",
      "Run the ease-design initialiser for this runtime:",
      "",
      "// turbo",
      "```bash",
      "ui init --runtime antigravity",
      "```",
      "",
      "Pass `--force` to overwrite an existing installation.",
      "",
    ].join("\n");
  }

  const tplPath = toFwdSlash(templatePath);
  return [
    "---",
    `description: ${yamlQuote(`ease-design ui-${verb} — ${summary}`)}`,
    "---",
    "",
    `# ui-${verb}`,
    "",
    "Follow the runtime-neutral workflow at:",
    `\`${tplPath}\``,
    buildKnowledgeAnchor(knowledgeRoot),
    "When the workflow calls for a `ui` command, run it via the shell:",
    "",
    "// turbo",
    "```bash",
    `ui ${verb === "from-ref" ? "from-ref" : verb} "$ARGS"`,
    "```",
    "",
  ].join("\n");
}

/**
 * Build the body of a `.agent/skills/design-os-<name>/SKILL.md` wrapper.
 * Shape is byte-identical to the Claude skill wrapper.
 */
export function buildAntigravitySkill(
  name: string,
  templatePath: string,
  knowledgeRoot?: string,
  description?: string,
): string {
  return buildClaudeSkill(name, templatePath, knowledgeRoot, description);
}

// ─── Codex builder ────────────────────────────────────────────────────────────

export const CODEX_SENTINEL_BEGIN = "<!-- BEGIN ease-design -->";
export const CODEX_SENTINEL_END   = "<!-- END ease-design -->";

/**
 * Build the sentinel-bracketed block appended/upserted into `AGENTS.md`.
 *
 * @param templatesRoot Absolute path to the templates/ directory.
 * @param hashes        sha256 per template file (key = verb, skill, or journey name).
 */
export function buildCodexBlock(
  templatesRoot: string,
  hashes: Record<string, string>,
  knowledgeRoot?: string,
): string {
  const tplRoot = toFwdSlash(templatesRoot);
  // Stable sorted hash listing for deterministic output
  const hashLines = Object.keys(hashes)
    .sort()
    .map((k) => `  ${k}: ${hashes[k] ?? ""}`)
    .join("\n");

  const knowledgeLine =
    knowledgeRoot !== undefined && knowledgeRoot !== ""
      ? `Templates reference \`knowledge/<file>\` — resolve those against \`${toFwdSlash(knowledgeRoot)}\`. `
      : "";

  return [
    CODEX_SENTINEL_BEGIN,
    "## ease-design",
    "",
    "This project uses ease-design. Workflows, skills, and journeys live under",
    `\`${tplRoot}/workflows/\`, \`${tplRoot}/skills/\`, and \`${tplRoot}/journeys/\`.`,
    "Invoke them by following the relevant Markdown file when the user asks for",
    `design work (journeys cover onboarding/daily/delivery sequencing across`,
    `multiple commands). ${knowledgeLine}The \`ui\` binary handles all non-LLM`,
    "work (autofix, layout validation, token compilation, color math). Before",
    "forming a `ui` invocation, run `ui schema --json` for the machine-readable",
    "signature (positionals, flags, enums, error codes) of every (sub)command.",
    "",
    "Available slash-commands when proxied:",
    `${WORKFLOW_VERBS.map((v) => `/ui:${v}`).join(" ")}.`,
    "",
    "Template hashes (sha256, for drift detection):",
    hashLines,
    "",
    "Do not edit content between the BEGIN/END markers — it is regenerated",
    "by `ui init --runtime codex --force`.",
    CODEX_SENTINEL_END,
  ].join("\n");
}
