import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { generateAntigravityAdapter } from "../src/adapters/antigravity.js";
import { WORKFLOW_VERBS, SKILL_NAMES } from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");
const FAKE_CWD = "/tmp/ease-design-test-ag";

function makeArtifacts() {
  return generateAntigravityAdapter({ cwd: FAKE_CWD, templatesRoot: TEMPLATES_ROOT });
}

describe("generateAntigravityAdapter", () => {
  it("returns exactly 24 artifacts (16 workflows + 8 skills)", () => {
    expect(makeArtifacts()).toHaveLength(24);
  });

  it("all artifacts have mode 'write'", () => {
    for (const art of makeArtifacts()) {
      expect(art.mode).toBe("write");
    }
  });

  it("16 artifacts are workflow paths under .agent/workflows/ui-<verb>.md", () => {
    const workflows = makeArtifacts().filter((a) =>
      a.absPath.includes(".agent/workflows/"),
    );
    expect(workflows).toHaveLength(WORKFLOW_VERBS.length);
    for (const verb of WORKFLOW_VERBS) {
      expect(workflows.some((w) => w.absPath.endsWith(`/ui-${verb}.md`))).toBe(true);
    }
    expect(workflows.some((w) => w.absPath.endsWith("/ui-from-url.md"))).toBe(true);
  });

  it("8 artifacts are skill paths under .agent/skills/ease-design-*/SKILL.md", () => {
    const skills = makeArtifacts().filter((a) =>
      a.absPath.includes(".agent/skills/ease-design-"),
    );
    expect(skills).toHaveLength(SKILL_NAMES.length);
    for (const name of SKILL_NAMES) {
      expect(
        skills.some((s) => s.absPath.endsWith(`ease-design-${name}/SKILL.md`)),
      ).toBe(true);
    }
    expect(
      skills.some((s) => s.absPath.endsWith("ease-design-designmd-emit/SKILL.md")),
    ).toBe(true);
  });

  it("each non-init workflow content contains // turbo above a bash block", () => {
    const arts = makeArtifacts();
    for (const verb of WORKFLOW_VERBS) {
      if (verb === "init") continue;
      const art = arts.find((a) => a.absPath.endsWith(`/ui-${verb}.md`));
      expect(art, `workflow for verb '${verb}' not found`).toBeDefined();
      expect(art!.content).toContain("// turbo");
      expect(art!.content).toContain("```bash");
    }
  });

  it("init workflow content contains // turbo and ui init --runtime antigravity", () => {
    const art = makeArtifacts().find((a) => a.absPath.endsWith("/ui-init.md"));
    expect(art).toBeDefined();
    expect(art!.content).toContain("// turbo");
    expect(art!.content).toContain("ui init --runtime antigravity");
  });

  it("each non-init workflow content references the absolute workflow template path", () => {
    const arts = makeArtifacts();
    for (const verb of WORKFLOW_VERBS) {
      if (verb === "init") continue;
      const art = arts.find((a) => a.absPath.endsWith(`/ui-${verb}.md`));
      expect(art!.content).toContain(`templates/workflows/${verb}.md`);
    }
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
