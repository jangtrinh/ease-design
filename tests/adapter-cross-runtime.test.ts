/**
 * Cross-runtime equivalence tests.
 *
 * For every non-init workflow verb, assert that the Claude command and
 * Antigravity workflow both embed the same absolute template path.
 * Catches the failure mode where one runtime's wrapper references a different
 * template file than another runtime's wrapper for the same verb.
 */
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { generateClaudeAdapter } from "../src/adapters/claude.js";
import { generateAntigravityAdapter } from "../src/adapters/antigravity.js";
import { generateCodexAdapter } from "../src/adapters/codex.js";
import { WORKFLOW_VERBS } from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");
const FAKE_CWD = "/tmp/ease-design-cross-runtime-test";

/** Extract the first backtick-quoted absolute path containing "templates/workflows/" */
function extractWorkflowPath(content: string): string | null {
  const m = content.match(/`([^`]*templates\/workflows\/[^`]+)`/);
  return m?.[1] ?? null;
}

describe("cross-runtime template path equivalence", () => {
  const claudeArts = generateClaudeAdapter({
    cwd: FAKE_CWD,
    templatesRoot: TEMPLATES_ROOT,
  });
  const agArts = generateAntigravityAdapter({
    cwd: FAKE_CWD,
    templatesRoot: TEMPLATES_ROOT,
  });
  const codexArts = generateCodexAdapter({
    cwd: FAKE_CWD,
    templatesRoot: TEMPLATES_ROOT,
  });

  const codexContent = codexArts[0]?.content ?? "";

  for (const verb of WORKFLOW_VERBS) {
    if (verb === "init") continue;

    it(`verb '${verb}': Claude and Antigravity reference the same template path`, () => {
      const claudeArt = claudeArts.find(
        (a) => a.absPath.endsWith(`/${verb}.md`) && a.absPath.includes("commands/ui"),
      );
      const agArt = agArts.find((a) => a.absPath.endsWith(`/ui-${verb}.md`));

      expect(claudeArt, `Claude artifact for '${verb}' not found`).toBeDefined();
      expect(agArt, `Antigravity artifact for '${verb}' not found`).toBeDefined();

      const claudePath = extractWorkflowPath(claudeArt!.content);
      const agPath = extractWorkflowPath(agArt!.content);

      expect(claudePath, `Claude template path for '${verb}' not found in content`).not.toBeNull();
      expect(agPath, `Antigravity template path for '${verb}' not found in content`).not.toBeNull();
      expect(claudePath).toBe(agPath);
    });

    it(`verb '${verb}': Codex block references the same templatesRoot`, () => {
      const fwdRoot = TEMPLATES_ROOT.replace(/\\/g, "/");
      expect(codexContent).toContain(fwdRoot);
    });
  }
});

describe("cross-runtime artifact counts are symmetric", () => {
  it("Claude and Antigravity produce the same number of artifacts", () => {
    const claudeCount = generateClaudeAdapter({
      cwd: FAKE_CWD,
      templatesRoot: TEMPLATES_ROOT,
    }).length;
    const agCount = generateAntigravityAdapter({
      cwd: FAKE_CWD,
      templatesRoot: TEMPLATES_ROOT,
    }).length;
    expect(claudeCount).toBe(agCount);
  });

  it("Codex produces exactly 1 artifact", () => {
    const codexCount = generateCodexAdapter({
      cwd: FAKE_CWD,
      templatesRoot: TEMPLATES_ROOT,
    }).length;
    expect(codexCount).toBe(1);
  });
});
