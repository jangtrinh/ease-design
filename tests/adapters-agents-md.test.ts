import { describe, expect, it, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { generateAgentsMdAdapter } from "../src/adapters/agents-md.js";
import { generateCodexAdapter } from "../src/adapters/codex.js";
import {
  findSentinelBlock,
  writeAdapterArtifacts,
  AdapterWriteError,
} from "../src/core/adapter-writer.js";
import { CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END } from "../src/adapters/wrapper-shapes.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const p = join(tmpdir(), `agents-md-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(p, { recursive: true });
  tmpDirs.push(p);
  return p;
}

afterEach(() => {
  for (const d of tmpDirs) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

// ─── generateAgentsMdAdapter ──────────────────────────────────────────────────

describe("generateAgentsMdAdapter", () => {
  it("returns exactly one artifact", () => {
    const cwd = makeTmpDir();
    const arts = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT });
    expect(arts).toHaveLength(1);
  });

  it("the artifact has mode 'upsert-section' targeting AGENTS.md", () => {
    const cwd = makeTmpDir();
    const art = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.mode).toBe("upsert-section");
    expect(art.absPath).toBe(join(cwd, "AGENTS.md"));
  });

  it("the artifact content starts with BEGIN sentinel and ends with END sentinel", () => {
    const cwd = makeTmpDir();
    const art = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.content.startsWith(CODEX_SENTINEL_BEGIN)).toBe(true);
    expect(art.content.endsWith(CODEX_SENTINEL_END)).toBe(true);
  });

  it("regen-hint line points at --runtime agents-md, not codex", () => {
    const cwd = makeTmpDir();
    const art = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.content).toContain("`ui init --runtime agents-md --force`");
    expect(art.content).not.toContain("--runtime codex --force");
  });

  it("is byte-identical to the codex artifact except the regen-hint runtime name", () => {
    const cwdCodex = makeTmpDir();
    const cwdAgentsMd = makeTmpDir();
    const codexArt = generateCodexAdapter({ cwd: cwdCodex, templatesRoot: TEMPLATES_ROOT })[0]!;
    const agentsMdArt = generateAgentsMdAdapter({ cwd: cwdAgentsMd, templatesRoot: TEMPLATES_ROOT })[0]!;
    const normalizedCodex = codexArt.content.replace(
      "--runtime codex --force",
      "--runtime agents-md --force",
    );
    expect(normalizedCodex).toBe(agentsMdArt.content);
  });

  it("content contains template hashes for each non-init workflow and each skill", () => {
    const cwd = makeTmpDir();
    const art = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.content).toMatch(/workflows\/generate\.md: [0-9a-f]{64}/);
    expect(art.content).toMatch(/skills\/pick-persona\.md: [0-9a-f]{64}/);
  });

  it("is deterministic — two calls produce identical content", () => {
    const cwd = makeTmpDir();
    const a = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    const b = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(a.content).toBe(b.content);
  });
});

// ─── writeAdapterArtifacts — agents-md writes AGENTS.md like codex does ───────

describe("writeAdapterArtifacts with the agents-md artifact", () => {
  it("creates AGENTS.md when it does not exist", () => {
    const cwd = makeTmpDir();
    const agentsPath = join(cwd, "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(false);

    const art = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    writeAdapterArtifacts([art], { force: false });

    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain(CODEX_SENTINEL_BEGIN);
    expect(content).toContain("--runtime agents-md --force");
  });

  it("errors MANIFEST_EXISTS on second write without --force when block exists", () => {
    const cwd = makeTmpDir();
    const art = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    writeAdapterArtifacts([art], { force: false });
    let caught: unknown;
    try {
      writeAdapterArtifacts([art], { force: false });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AdapterWriteError);
    expect((caught as AdapterWriteError).code).toBe("MANIFEST_EXISTS");
  });

  it("findSentinelBlock locates the agents-md block same as a codex block", () => {
    const cwd = makeTmpDir();
    const agentsPath = join(cwd, "AGENTS.md");
    writeFileSync(agentsPath, "# Project\n\nUser content.\n", "utf8");
    const art = generateAgentsMdAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    writeAdapterArtifacts([art], { force: false });
    const result = readFileSync(agentsPath, "utf8");
    const found = findSentinelBlock(result, CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END);
    expect(found).not.toBeNull();
  });
});
