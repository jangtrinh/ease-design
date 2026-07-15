import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  buildClaudeCommand,
  buildClaudeSkill,
  buildAntigravityWorkflow,
  buildAntigravitySkill,
  buildCodexBlock,
  CODEX_SENTINEL_BEGIN,
  CODEX_SENTINEL_END,
} from "../src/adapters/wrapper-shapes.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FAKE_TEMPLATES = join(REPO_ROOT, "templates");
const FAKE_TPL = `${FAKE_TEMPLATES}/workflows/generate.md`;
const FAKE_SKILL_TPL = `${FAKE_TEMPLATES}/skills/pick-persona.md`;

// ─── Shared assertions ────────────────────────────────────────────────────────

// NOTE: `audit` is intentionally NOT here — `/ui:audit` is a shipped product
// verb that legitimately appears in generated wrappers. This pattern guards
// against internal PLAN/PHASE/FINDING references leaking in, not product verbs.
const PLAN_REF_PATTERN = /phase[-_ ]\d|finding|F\d+|OD-\d/i;

function assertNoPlanRefs(output: string, label: string): void {
  expect(
    PLAN_REF_PATTERN.test(output),
    `${label} must not contain plan/phase/finding references`,
  ).toBe(false);
}

function assertNoTimestamp(output: string, label: string): void {
  // Timestamps look like ISO-8601 (digits-T-digits) or unix epoch numbers
  expect(
    /\d{4}-\d{2}-\d{2}T/.test(output),
    `${label} must not contain a timestamp`,
  ).toBe(false);
}

function assertDeterministic(a: string, b: string, label: string): void {
  expect(a, `${label} must be deterministic`).toBe(b);
}

// ─── buildClaudeCommand ───────────────────────────────────────────────────────

describe("buildClaudeCommand", () => {
  it("contains the verb in the YAML frontmatter description", () => {
    const out = buildClaudeCommand("generate", FAKE_TPL, ["pick-persona"]);
    expect(out).toContain("description:");
    expect(out).toContain("/ui:generate");
  });

  it("embeds the absolute template path (forward-slash normalised)", () => {
    const out = buildClaudeCommand("generate", FAKE_TPL, []);
    const fwdPath = FAKE_TPL.replace(/\\/g, "/");
    expect(out).toContain(fwdPath);
  });

  it("includes skill-ref lines for each supplied skill", () => {
    const out = buildClaudeCommand("generate", FAKE_TPL, ["pick-persona", "score-taste"]);
    expect(out).toContain("design-os-pick-persona");
    expect(out).toContain("design-os-score-taste");
  });

  it("synthetic init verb uses ui init shell instruction instead of template ref", () => {
    const out = buildClaudeCommand("init", null, []);
    expect(out).toContain("ui init --runtime claude");
    expect(out).not.toContain("Follow the runtime-neutral workflow at:");
  });

  it("is deterministic", () => {
    const a = buildClaudeCommand("generate", FAKE_TPL, ["pick-persona"]);
    const b = buildClaudeCommand("generate", FAKE_TPL, ["pick-persona"]);
    assertDeterministic(a, b, "buildClaudeCommand");
  });

  it("contains no plan/phase/finding references", () => {
    assertNoPlanRefs(buildClaudeCommand("generate", FAKE_TPL, []), "buildClaudeCommand");
  });

  it("contains no timestamps", () => {
    assertNoTimestamp(buildClaudeCommand("generate", FAKE_TPL, []), "buildClaudeCommand");
  });

  it("produces valid YAML frontmatter (--- delimiters)", () => {
    const out = buildClaudeCommand("generate", FAKE_TPL, []);
    expect(out).toMatch(/^---\n/);
    expect(out).toContain("\n---\n");
  });
});

// ─── buildClaudeSkill ─────────────────────────────────────────────────────────

describe("buildClaudeSkill", () => {
  it("contains the skill name prefixed with design-os-", () => {
    const out = buildClaudeSkill("pick-persona", FAKE_SKILL_TPL);
    expect(out).toContain("name: design-os-pick-persona");
  });

  it("embeds the absolute template path", () => {
    const out = buildClaudeSkill("pick-persona", FAKE_SKILL_TPL);
    const fwdPath = FAKE_SKILL_TPL.replace(/\\/g, "/");
    expect(out).toContain(fwdPath);
  });

  it("is deterministic", () => {
    const a = buildClaudeSkill("pick-persona", FAKE_SKILL_TPL);
    const b = buildClaudeSkill("pick-persona", FAKE_SKILL_TPL);
    assertDeterministic(a, b, "buildClaudeSkill");
  });

  it("contains no plan/phase/finding references", () => {
    assertNoPlanRefs(buildClaudeSkill("pick-persona", FAKE_SKILL_TPL), "buildClaudeSkill");
  });

  it("contains no timestamps", () => {
    assertNoTimestamp(buildClaudeSkill("pick-persona", FAKE_SKILL_TPL), "buildClaudeSkill");
  });
});

// ─── buildAntigravityWorkflow ─────────────────────────────────────────────────

describe("buildAntigravityWorkflow", () => {
  it("contains the verb in the frontmatter description", () => {
    const out = buildAntigravityWorkflow("generate", FAKE_TPL);
    expect(out).toContain("description:");
    expect(out).toContain("ui-generate");
  });

  it("embeds the absolute template path", () => {
    const out = buildAntigravityWorkflow("generate", FAKE_TPL);
    const fwdPath = FAKE_TPL.replace(/\\/g, "/");
    expect(out).toContain(fwdPath);
  });

  it("contains // turbo above a bash block", () => {
    const out = buildAntigravityWorkflow("generate", FAKE_TPL);
    expect(out).toContain("// turbo");
    expect(out).toContain("```bash");
  });

  it("synthetic init verb uses ui init shell block with // turbo", () => {
    const out = buildAntigravityWorkflow("init", null);
    expect(out).toContain("ui init --runtime antigravity");
    expect(out).toContain("// turbo");
  });

  it("is deterministic", () => {
    const a = buildAntigravityWorkflow("iterate", FAKE_TPL);
    const b = buildAntigravityWorkflow("iterate", FAKE_TPL);
    assertDeterministic(a, b, "buildAntigravityWorkflow");
  });

  it("contains no plan/phase/finding references", () => {
    assertNoPlanRefs(buildAntigravityWorkflow("generate", FAKE_TPL), "buildAntigravityWorkflow");
  });

  it("contains no timestamps", () => {
    assertNoTimestamp(buildAntigravityWorkflow("generate", FAKE_TPL), "buildAntigravityWorkflow");
  });
});

// ─── buildAntigravitySkill ────────────────────────────────────────────────────

describe("buildAntigravitySkill", () => {
  it("is byte-identical to buildClaudeSkill for the same inputs", () => {
    const claude = buildClaudeSkill("score-taste", FAKE_SKILL_TPL);
    const ag = buildAntigravitySkill("score-taste", FAKE_SKILL_TPL);
    expect(ag).toBe(claude);
  });
});

// ─── buildCodexBlock ─────────────────────────────────────────────────────────

describe("buildCodexBlock", () => {
  it("starts with the BEGIN sentinel and ends with the END sentinel", () => {
    const out = buildCodexBlock(FAKE_TEMPLATES, {});
    expect(out.startsWith(CODEX_SENTINEL_BEGIN)).toBe(true);
    expect(out.endsWith(CODEX_SENTINEL_END)).toBe(true);
  });

  it("contains the templatesRoot path (forward-slash normalised)", () => {
    const out = buildCodexBlock(FAKE_TEMPLATES, {});
    const fwdRoot = FAKE_TEMPLATES.replace(/\\/g, "/");
    expect(out).toContain(fwdRoot);
  });

  it("includes sorted hash entries", () => {
    const hashes = { "workflows/generate.md": "abc123", "skills/pick-persona.md": "def456" };
    const out = buildCodexBlock(FAKE_TEMPLATES, hashes);
    // Sorted keys: skills/... comes before workflows/...
    const skillIdx = out.indexOf("skills/pick-persona.md");
    const workflowIdx = out.indexOf("workflows/generate.md");
    expect(skillIdx).toBeGreaterThanOrEqual(0);
    expect(workflowIdx).toBeGreaterThanOrEqual(0);
    expect(skillIdx).toBeLessThan(workflowIdx);
  });

  it("is deterministic", () => {
    const hashes = { "workflows/generate.md": "abc" };
    const a = buildCodexBlock(FAKE_TEMPLATES, hashes);
    const b = buildCodexBlock(FAKE_TEMPLATES, hashes);
    assertDeterministic(a, b, "buildCodexBlock");
  });

  it("contains no plan/phase/finding references", () => {
    assertNoPlanRefs(buildCodexBlock(FAKE_TEMPLATES, {}), "buildCodexBlock");
  });

  it("contains no timestamps", () => {
    assertNoTimestamp(buildCodexBlock(FAKE_TEMPLATES, {}), "buildCodexBlock");
  });

  it("contains the /ui:* slash-command list derived from every workflow verb", () => {
    const out = buildCodexBlock(FAKE_TEMPLATES, {});
    expect(out).toContain("/ui:generate");
    expect(out).toContain("/ui:init");
    // The list is derived from WORKFLOW_VERBS (not a hand-maintained copy), so
    // verbs the old hardcoded line omitted — /ui:learn, /ui:to-figma — appear.
    expect(out).toContain("/ui:learn");
    expect(out).toContain("/ui:to-figma");
  });
});
