/**
 * P09 — wrapper discovery descriptions are sourced from template frontmatter.
 *
 * The `description:` frontmatter is the only preloaded discovery signal a
 * runtime sees, so: every registered template must carry one (what + when),
 * and the generated wrappers must emit it (no more bare-slug descriptions,
 * no code-side summary table to drift).
 */
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  WORKFLOW_VERBS,
  SKILL_NAMES,
  resolveTemplatePath,
  readTemplateDescription,
} from "../src/adapters/templates.js";
import { generateClaudeAdapter } from "../src/adapters/claude.js";
import { generateAntigravityAdapter } from "../src/adapters/antigravity.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");

describe("template frontmatter descriptions", () => {
  it("every workflow template has a description with a 'Use when' trigger clause", () => {
    for (const verb of WORKFLOW_VERBS) {
      const p = resolveTemplatePath(TEMPLATES_ROOT, "workflow", verb);
      if (p === null) continue; // synthetic init
      const desc = readTemplateDescription(p);
      expect(desc, `workflow '${verb}' is missing frontmatter description`).not.toBeNull();
      expect(desc, `workflow '${verb}' description must say when to use it`).toMatch(/Use when/);
    }
  });

  it("every skill template has a description with a 'Use' trigger clause", () => {
    for (const name of SKILL_NAMES) {
      const p = resolveTemplatePath(TEMPLATES_ROOT, "skill", name);
      expect(p).not.toBeNull();
      const desc = readTemplateDescription(p as string);
      expect(desc, `skill '${name}' is missing frontmatter description`).not.toBeNull();
      expect((desc as string).length).toBeGreaterThan(40);
      expect(desc, `skill '${name}' description must say when to use it`).toMatch(/Use /);
    }
  });

  it("returns null for a file without frontmatter", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-desc-"));
    const f = join(tmp, "plain.md");
    writeFileSync(f, "# No frontmatter here\n\nBody.\n");
    expect(readTemplateDescription(f)).toBeNull();
  });

  it("strips surrounding double quotes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-desc-"));
    const f = join(tmp, "quoted.md");
    writeFileSync(f, '---\ndescription: "Quoted text. Use when testing."\n---\n\n# T\n');
    expect(readTemplateDescription(f)).toBe("Quoted text. Use when testing.");
  });

  it("returns null for a missing file (no throw)", () => {
    expect(readTemplateDescription("/nonexistent/nope.md")).toBeNull();
  });
});

describe("generated wrappers carry the sourced description", () => {
  const input = { cwd: "/fake/project", templatesRoot: TEMPLATES_ROOT };

  it("no Claude skill wrapper ships a bare-slug description", () => {
    const artifacts = generateClaudeAdapter(input);
    const skills = artifacts.filter((a) => a.absPath.includes("/skills/"));
    expect(skills.length).toBe(SKILL_NAMES.length);
    for (const a of skills) {
      const descLine = a.content.split("\n").find((l) => l.startsWith("description:"));
      expect(descLine, `${a.absPath} has no description line`).toBeDefined();
      // Bare slug = the old fallback failure mode (e.g. `description: figma-craft`)
      expect(descLine).toMatch(/description: ".{40,}"/);
      expect(descLine).toContain("Use ");
    }
  });

  it("no Claude command wrapper ships a bare-verb description (from-url/to-figma covered)", () => {
    const artifacts = generateClaudeAdapter(input);
    const forVerb = (v: string) =>
      artifacts.find((a) => a.absPath.endsWith(`/commands/ui/${v}.md`));
    for (const verb of ["from-url", "to-figma"] as const) {
      const a = forVerb(verb);
      expect(a).toBeDefined();
      const descLine = a?.content.split("\n").find((l) => l.startsWith("description:"));
      expect(descLine, `verb '${verb}' still ships a bare-slug description`).toMatch(/Use when/);
    }
  });

  it("antigravity skill wrappers match claude skill wrappers byte-for-byte", () => {
    const claude = generateClaudeAdapter(input).filter((a) => a.absPath.includes("/skills/"));
    const ag = generateAntigravityAdapter(input).filter((a) => a.absPath.includes("/skills/"));
    expect(ag.map((a) => a.content)).toEqual(claude.map((a) => a.content));
  });

  it("descriptions are single-line double-quoted YAML scalars", () => {
    const artifacts = generateClaudeAdapter(input);
    for (const a of artifacts) {
      const descLine = a.content.split("\n").find((l) => l.startsWith("description:"));
      if (descLine === undefined) continue;
      expect(descLine, `${a.absPath} description must be double-quoted`).toMatch(
        /^description: "[^\n]*"$/,
      );
    }
  });
});
