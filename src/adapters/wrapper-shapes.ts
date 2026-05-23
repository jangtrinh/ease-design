/**
 * Pure string builders that produce the body of each adapter wrapper file.
 *
 * Rules for all builders:
 * - No embedded timestamps (deterministic output — same inputs → same bytes).
 * - No plan/phase/finding references in the generated content.
 * - All file paths use forward-slash separators for cross-platform Markdown rendering.
 * - Wrappers point AT template files; they never copy their content.
 */

// ─── Summaries ────────────────────────────────────────────────────────────────

/** One-line description for each workflow verb used in adapter frontmatter. */
const VERB_SUMMARIES: Record<string, string> = {
  generate:  "Generate UI variants from a plain-language intent",
  iterate:   "Apply a focused vibe-word edit to an existing variant",
  refine:    "Self-correction pass that fixes execution quality without redesigning",
  redesign:  "Radical contra-persona redesign of an existing variant",
  extract:   "Extract a design system from existing HTML",
  "from-ref":"Generate high-fidelity HTML from a reference screenshot or image",
  figma:     "Import a Figma frame and produce an HTML reproduction",
  slides:    "Generate a full presentation slide deck from a topic",
  init:      "Initialise ease-design for this project",
};

/** One-line description for each skill name used in adapter frontmatter. */
const SKILL_SUMMARIES: Record<string, string> = {
  "pick-persona":       "Choose one or more design personas for a generation task",
  "score-taste":        "Evaluate a generated design against the 6+1-axis taste rubric",
  "check-consistency":  "Score the Consistency axis — DS token and component reuse",
  "color-decision":     "Make a color choice, build a palette, or check contrast",
  "token-model":        "Define, alias, or change design tokens",
  "apply-prompt-mode":  "Decide how faithfully to track a reference input",
};

// ─── Path normalisation ────────────────────────────────────────────────────────

/** Normalise OS path separators to forward-slash so Markdown links render correctly on Windows-authored docs too. */
function toFwdSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

// ─── Skill-ref prose helpers ──────────────────────────────────────────────────

/** Build the "invoke skill" lines appended to Claude command bodies. */
function buildSkillRefLines(skillRefs: readonly string[]): string {
  if (skillRefs.length === 0) return "";
  const lines = skillRefs.map(
    (s) => `When the workflow instructs it, invoke skill \`ease-design-${s}\`.`,
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
 */
export function buildClaudeCommand(
  verb: string,
  templatePath: string | null,
  skillRefs: readonly string[],
): string {
  const summary = VERB_SUMMARIES[verb] ?? verb;
  const skillBlock = buildSkillRefLines(skillRefs);

  if (verb === "init" || templatePath === null) {
    return [
      "---",
      `description: ease-design /ui:init — ${summary}`,
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
    `description: ease-design /ui:${verb} — ${summary}`,
    "---",
    "",
    `# /ui:${verb}`,
    "",
    "Follow the runtime-neutral workflow at:",
    `\`${tplPath}\``,
    skillBlock,
  ].join("\n");
}

/**
 * Build the body of a `.claude/skills/ease-design-<name>/SKILL.md` wrapper.
 *
 * @param name         The skill name (e.g. "pick-persona").
 * @param templatePath Absolute path to the skill template file.
 */
export function buildClaudeSkill(name: string, templatePath: string): string {
  const summary = SKILL_SUMMARIES[name] ?? name;
  const tplPath = toFwdSlash(templatePath);
  return [
    "---",
    `name: ease-design-${name}`,
    `description: ${summary}`,
    "---",
    "",
    "Follow the runtime-neutral skill at:",
    `\`${tplPath}\``,
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
): string {
  const summary = VERB_SUMMARIES[verb] ?? verb;

  if (verb === "init" || templatePath === null) {
    return [
      "---",
      `description: ease-design ui-init — ${summary}`,
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
    `description: ease-design ui-${verb} — ${summary}`,
    "---",
    "",
    `# ui-${verb}`,
    "",
    "Follow the runtime-neutral workflow at:",
    `\`${tplPath}\``,
    "",
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
 * Build the body of a `.agent/skills/ease-design-<name>/SKILL.md` wrapper.
 * Shape is byte-identical to the Claude skill wrapper.
 */
export function buildAntigravitySkill(name: string, templatePath: string): string {
  return buildClaudeSkill(name, templatePath);
}

// ─── Codex builder ────────────────────────────────────────────────────────────

export const CODEX_SENTINEL_BEGIN = "<!-- BEGIN ease-design -->";
export const CODEX_SENTINEL_END   = "<!-- END ease-design -->";

/**
 * Build the sentinel-bracketed block appended/upserted into `AGENTS.md`.
 *
 * @param templatesRoot Absolute path to the templates/ directory.
 * @param hashes        sha256 per template file (key = verb or skill name).
 */
export function buildCodexBlock(
  templatesRoot: string,
  hashes: Record<string, string>,
): string {
  const tplRoot = toFwdSlash(templatesRoot);
  // Stable sorted hash listing for deterministic output
  const hashLines = Object.keys(hashes)
    .sort()
    .map((k) => `  ${k}: ${hashes[k] ?? ""}`)
    .join("\n");

  return [
    CODEX_SENTINEL_BEGIN,
    "## ease-design",
    "",
    "This project uses ease-design. Workflows and skills live under",
    `\`${tplRoot}/workflows/\` and \`${tplRoot}/skills/\`. Invoke them`,
    "by following the relevant Markdown file when the user asks for design",
    "work. The `ui` binary handles all non-LLM work (autofix, layout",
    "validation, token compilation, color math).",
    "",
    "Available slash-commands when proxied: /ui:generate /ui:iterate /ui:refine",
    "/ui:redesign /ui:extract /ui:from-ref /ui:figma /ui:slides /ui:init.",
    "",
    "Template hashes (sha256, for drift detection):",
    hashLines,
    "",
    "Do not edit content between the BEGIN/END markers — it is regenerated",
    "by `ui init --runtime codex --force`.",
    CODEX_SENTINEL_END,
  ].join("\n");
}
