import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { generateClaudeAdapter } from "../src/adapters/claude.js";
import { WORKFLOW_VERBS, SKILL_NAMES } from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");
const FAKE_CWD = "/tmp/ease-design-test-claude";

function makeArtifacts() {
  return generateClaudeAdapter({ cwd: FAKE_CWD, templatesRoot: TEMPLATES_ROOT });
}

describe("generateClaudeAdapter", () => {
  it("returns exactly 24 artifacts (16 commands + 8 skills)", () => {
    const arts = makeArtifacts();
    expect(arts).toHaveLength(WORKFLOW_VERBS.length + SKILL_NAMES.length);
    expect(arts).toHaveLength(24);
  });

  it("all artifacts have mode 'write'", () => {
    for (const art of makeArtifacts()) {
      expect(art.mode).toBe("write");
    }
  });

  it("16 artifacts are slash-command paths under .claude/commands/ui/", () => {
    const commands = makeArtifacts().filter((a) =>
      a.absPath.includes(".claude/commands/ui/"),
    );
    expect(commands).toHaveLength(WORKFLOW_VERBS.length);
    for (const verb of WORKFLOW_VERBS) {
      expect(commands.some((c) => c.absPath.endsWith(`/${verb}.md`))).toBe(true);
    }
    // explicit presence assertions for the new verb
    expect(commands.some((c) => c.absPath.endsWith("/from-url.md"))).toBe(true);
  });

  it("8 artifacts are skill paths under .claude/skills/ease-design-*/SKILL.md", () => {
    const skills = makeArtifacts().filter((a) =>
      a.absPath.includes(".claude/skills/ease-design-"),
    );
    expect(skills).toHaveLength(SKILL_NAMES.length);
    for (const name of SKILL_NAMES) {
      expect(
        skills.some((s) => s.absPath.endsWith(`ease-design-${name}/SKILL.md`)),
      ).toBe(true);
    }
    // explicit presence assertion for the new skill
    expect(
      skills.some((s) => s.absPath.endsWith("ease-design-designmd-emit/SKILL.md")),
    ).toBe(true);
  });

  it("each non-init command content references the absolute workflow template path", () => {
    const arts = makeArtifacts();
    for (const verb of WORKFLOW_VERBS) {
      if (verb === "init") continue;
      const art = arts.find((a) => a.absPath.endsWith(`/${verb}.md`) && a.absPath.includes("commands/ui"));
      expect(art, `command for verb '${verb}' not found`).toBeDefined();
      expect(art!.content).toContain(`templates/workflows/${verb}.md`);
    }
  });

  it("init command content uses ui init shell instruction (no template path)", () => {
    const art = makeArtifacts().find((a) => a.absPath.endsWith("/init.md") && a.absPath.includes("commands/ui"));
    expect(art).toBeDefined();
    expect(art!.content).toContain("ui init --runtime claude");
    expect(art!.content).not.toContain("Follow the runtime-neutral workflow at:");
  });

  it("each skill content references the absolute skill template path", () => {
    const arts = makeArtifacts();
    for (const name of SKILL_NAMES) {
      const art = arts.find((a) => a.absPath.endsWith(`ease-design-${name}/SKILL.md`));
      expect(art, `skill '${name}' not found`).toBeDefined();
      expect(art!.content).toContain(`templates/skills/${name}.md`);
    }
  });

  it("all artifact paths are rooted at the supplied cwd", () => {
    for (const art of makeArtifacts()) {
      expect(art.absPath.startsWith(FAKE_CWD)).toBe(true);
    }
  });

  it("is deterministic — two calls produce identical artifacts", () => {
    const a = makeArtifacts();
    const b = makeArtifacts();
    expect(a.map((x) => x.content)).toEqual(b.map((x) => x.content));
    expect(a.map((x) => x.absPath)).toEqual(b.map((x) => x.absPath));
  });
});
