import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  WORKFLOW_VERBS,
  SKILL_NAMES,
  resolveTemplatePath,
  hashTemplateFile,
} from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");

// ─── Registry parity with filesystem ─────────────────────────────────────────

describe("WORKFLOW_VERBS registry", () => {
  it("matches templates/workflows/ .md files minus critique.md, plus init", () => {
    const fsVerbs = readdirSync(join(TEMPLATES_ROOT, "workflows"))
      .filter((f) => f.endsWith(".md") && f !== "critique.md")
      .map((f) => f.replace(/\.md$/, ""))
      .sort();

    // WORKFLOW_VERBS includes "init" (synthetic) which has no template file.
    const registryVerbs = [...WORKFLOW_VERBS]
      .filter((v) => v !== "init")
      .sort();

    expect(registryVerbs).toEqual(fsVerbs);
  });

  it("includes the synthetic 'init' verb", () => {
    expect(WORKFLOW_VERBS).toContain("init");
  });
});

describe("SKILL_NAMES registry", () => {
  it("matches templates/skills/ .md files exactly", () => {
    const fsSkills = readdirSync(join(TEMPLATES_ROOT, "skills"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();

    const registrySkills = [...SKILL_NAMES].sort();
    expect(registrySkills).toEqual(fsSkills);
  });
});

// ─── resolveTemplatePath ──────────────────────────────────────────────────────

describe("resolveTemplatePath", () => {
  it("returns null for the synthetic init workflow", () => {
    const result = resolveTemplatePath(TEMPLATES_ROOT, "workflow", "init");
    expect(result).toBeNull();
  });

  it("returns an existing absolute path for every non-init workflow", () => {
    for (const verb of WORKFLOW_VERBS) {
      if (verb === "init") continue;
      const p = resolveTemplatePath(TEMPLATES_ROOT, "workflow", verb);
      expect(p).not.toBeNull();
      expect(p).toMatch(/\.md$/);
      // Verify the file actually exists (existsSync check is inside resolver,
      // but we assert the returned string ends with the expected filename).
      expect(p).toContain(`workflows/${verb}.md`);
    }
  });

  it("returns an existing absolute path for every skill", () => {
    for (const name of SKILL_NAMES) {
      const p = resolveTemplatePath(TEMPLATES_ROOT, "skill", name);
      expect(p).not.toBeNull();
      expect(p).toContain(`skills/${name}.md`);
    }
  });

  it("throws when the template file does not exist", () => {
    expect(() =>
      resolveTemplatePath(TEMPLATES_ROOT, "workflow", "nonexistent-verb"),
    ).toThrow(/template not found at/);
  });
});

// ─── hashTemplateFile ─────────────────────────────────────────────────────────

describe("hashTemplateFile", () => {
  it("returns a 64-character hex string", () => {
    const p = resolveTemplatePath(TEMPLATES_ROOT, "workflow", "generate");
    expect(p).not.toBeNull();
    const hash = hashTemplateFile(p!);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — two calls on the same file return the same hash", () => {
    const p = resolveTemplatePath(TEMPLATES_ROOT, "skill", "pick-persona");
    expect(p).not.toBeNull();
    expect(hashTemplateFile(p!)).toBe(hashTemplateFile(p!));
  });

  it("returns different hashes for different files", () => {
    const p1 = resolveTemplatePath(TEMPLATES_ROOT, "workflow", "generate");
    const p2 = resolveTemplatePath(TEMPLATES_ROOT, "workflow", "iterate");
    expect(hashTemplateFile(p1!)).not.toBe(hashTemplateFile(p2!));
  });
});
