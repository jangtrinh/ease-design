import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  buildClaudeCommand,
  buildClaudeSkill,
  buildAntigravityWorkflow,
  buildAntigravitySkill,
  buildAgentsMdBlock,
  CODEX_SENTINEL_BEGIN,
  CODEX_SENTINEL_END,
} from "../src/adapters/wrapper-shapes.js";
import { WORKFLOW_VERBS } from "../src/adapters/templates.js";

// Spec 021 P2 renamed `buildCodexBlock` → `buildAgentsMdBlock(id, ...)`. Every
// existing "buildCodexBlock" test below now calls `buildAgentsMdBlock` with
// id="codex" — same output, since the codex regen-hint line is `--runtime
// codex --force` either way (see the golden test at the bottom of this file).
function buildCodexBlock(templatesRoot: string, hashes: Record<string, string>, knowledgeRoot?: string): string {
  return buildAgentsMdBlock("codex", templatesRoot, hashes, knowledgeRoot);
}

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FAKE_TEMPLATES = join(REPO_ROOT, "templates");
const FAKE_TPL = `${FAKE_TEMPLATES}/workflows/generate.md`;
const FAKE_SKILL_TPL = `${FAKE_TEMPLATES}/skills/pick-persona.md`;

// ─── Shared assertions ────────────────────────────────────────────────────────

// NOTE: `audit` is intentionally NOT here — `/ui:audit` is a shipped product
// verb that legitimately appears in generated wrappers. This pattern guards
// against internal PLAN/PHASE/FINDING references leaking in, not product verbs.
// Word-boundaried on purpose: the wrapper embeds an ABSOLUTE knowledge-root path
// (buildKnowledgeAnchor), so an unanchored /F\d+/i matches any hex-ish path segment —
// a git worktree at `.claude/worktrees/agent-a4cf826d…` made these four tests fail on
// `f826` alone, while the same code passed from a checkout whose path had no such run.
// A test that asserts a property of its own filesystem path is asserting nothing.
// The boundaries keep every real catch (`F1`, `phase-1`, `finding`, `OD-3` as tokens)
// and drop only matches buried inside another word.
const PLAN_REF_PATTERN = /\bphase[-_ ]\d|\bfinding\b|\bF\d+\b|\bOD-\d/i;

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

// ─── Golden: buildAgentsMdBlock("codex") byte-identical to the pre-P2 buildCodexBlock ─
//
// Spec 021 P2 hard rule: codex's sentinel block must stay byte-for-byte
// unchanged (existing installs upgrade in place). This test reconstructs the
// pre-rename `buildCodexBlock` output INDEPENDENTLY — a hardcoded literal
// mirroring the original function body, not a second call into the renamed
// builder — and diffs it against the real `buildAgentsMdBlock("codex", ...)`
// output. A drift in the codex shape (including the regen-hint line) fails here.
describe("buildAgentsMdBlock('codex') — byte-identical golden", () => {
  it("matches the pre-P2 buildCodexBlock shape exactly, including the regen-hint line", () => {
    const hashes = { "workflows/generate.md": "abc123", "skills/pick-persona.md": "def456" };
    const knowledgeRoot = "/fake/knowledge";
    const fwdRoot = FAKE_TEMPLATES.replace(/\\/g, "/");
    const fwdKnowledge = knowledgeRoot.replace(/\\/g, "/");
    const hashLines = Object.keys(hashes)
      .sort()
      .map((k) => `  ${k}: ${(hashes as Record<string, string>)[k] ?? ""}`)
      .join("\n");

    // Sentinels are HARDCODED here (not the imported constants) on purpose: they are
    // the upgrade-in-place invariant — an accidental rename would silently orphan the
    // block in every existing install, and a golden that imports the same constant could
    // never catch that. This literal is the contract old files were written with.
    const golden = [
      "<!-- BEGIN ease-design -->",
      "## ease-design",
      "",
      "This project uses ease-design. Workflows, skills, and journeys live under",
      `\`${fwdRoot}/workflows/\`, \`${fwdRoot}/skills/\`, and \`${fwdRoot}/journeys/\`.`,
      "Invoke them by following the relevant Markdown file when the user asks for",
      "design work (journeys cover onboarding/daily/delivery sequencing across",
      `multiple commands). Templates reference \`knowledge/<file>\` — resolve those against \`${fwdKnowledge}\`. The \`ui\` binary handles all non-LLM`,
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
      "<!-- END ease-design -->",
    ].join("\n");

    const actual = buildAgentsMdBlock("codex", FAKE_TEMPLATES, hashes, knowledgeRoot);
    expect(actual).toBe(golden);
  });

  it("id='agents-md' differs ONLY in the regen-hint runtime name, not any other byte", () => {
    const hashes = { "workflows/generate.md": "abc123" };
    const codexOut = buildAgentsMdBlock("codex", FAKE_TEMPLATES, hashes);
    const agentsMdOut = buildAgentsMdBlock("agents-md", FAKE_TEMPLATES, hashes);
    expect(codexOut.replace("--runtime codex --force", "--runtime agents-md --force")).toBe(
      agentsMdOut,
    );
    expect(agentsMdOut).toContain("`ui init --runtime agents-md --force`");
  });
});
