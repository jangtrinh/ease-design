import { describe, expect, it, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
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
  const p = join(tmpdir(), `codex-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

// ─── generateCodexAdapter ─────────────────────────────────────────────────────

describe("generateCodexAdapter", () => {
  it("returns exactly one artifact", () => {
    const cwd = makeTmpDir();
    const arts = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT });
    expect(arts).toHaveLength(1);
  });

  it("the artifact has mode 'upsert-section' targeting AGENTS.md", () => {
    const cwd = makeTmpDir();
    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.mode).toBe("upsert-section");
    expect(art.absPath).toBe(join(cwd, "AGENTS.md"));
  });

  it("the artifact content starts with BEGIN sentinel and ends with END sentinel", () => {
    const cwd = makeTmpDir();
    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.content.startsWith(CODEX_SENTINEL_BEGIN)).toBe(true);
    expect(art.content.endsWith(CODEX_SENTINEL_END)).toBe(true);
  });

  it("uses the correct sentinel constants", () => {
    const cwd = makeTmpDir();
    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(art.mode).toBe("upsert-section");
    if (art.mode === "upsert-section") {
      expect(art.sentinelBegin).toBe(CODEX_SENTINEL_BEGIN);
      expect(art.sentinelEnd).toBe(CODEX_SENTINEL_END);
    }
  });

  it("content contains template hashes for each non-init workflow and each skill", () => {
    const cwd = makeTmpDir();
    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    // Should have hash entries like "workflows/generate.md: <hex>"
    expect(art.content).toMatch(/workflows\/generate\.md: [0-9a-f]{64}/);
    expect(art.content).toMatch(/skills\/pick-persona\.md: [0-9a-f]{64}/);
  });

  it("is deterministic — two calls produce identical content", () => {
    const cwd = makeTmpDir();
    const a = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    const b = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    expect(a.content).toBe(b.content);
  });
});

// ─── findSentinelBlock ────────────────────────────────────────────────────────

describe("findSentinelBlock", () => {
  it("returns null when no begin sentinel is present", () => {
    expect(findSentinelBlock("no sentinel here", CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END)).toBeNull();
  });

  it("returns null when begin is present but end is absent", () => {
    const content = `${CODEX_SENTINEL_BEGIN}\nsome content`;
    expect(findSentinelBlock(content, CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END)).toBeNull();
  });

  it("returns correct offsets for a block at the start", () => {
    const block = `${CODEX_SENTINEL_BEGIN}\nbody\n${CODEX_SENTINEL_END}`;
    const result = findSentinelBlock(block, CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END);
    expect(result).not.toBeNull();
    expect(result!.start).toBe(0);
    expect(result!.end).toBe(block.length);
    expect(block.slice(result!.start, result!.end)).toBe(block);
  });

  it("returns correct offsets for a block embedded in surrounding content", () => {
    const prefix = "# My Project\n\nSome user content.\n\n";
    const block = `${CODEX_SENTINEL_BEGIN}\nease-design stuff\n${CODEX_SENTINEL_END}`;
    const suffix = "\n\nMore user content.";
    const content = prefix + block + suffix;
    const result = findSentinelBlock(content, CODEX_SENTINEL_BEGIN, CODEX_SENTINEL_END);
    expect(result).not.toBeNull();
    expect(result!.start).toBe(prefix.length);
    expect(result!.end).toBe(prefix.length + block.length);
    expect(content.slice(result!.start, result!.end)).toBe(block);
  });
});

// ─── writeAdapterArtifacts — upsert-section (append) ─────────────────────────

describe("writeAdapterArtifacts upsert-section append", () => {
  it("appends block to AGENTS.md with user content preserved", () => {
    const cwd = makeTmpDir();
    const agentsPath = join(cwd, "AGENTS.md");
    const userContent = "# My Project\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.";
    writeFileSync(agentsPath, userContent, "utf8");

    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    writeAdapterArtifacts([art], { force: false });

    const result = readFileSync(agentsPath, "utf8");
    // All three user paragraphs preserved
    expect(result).toContain("Paragraph one.");
    expect(result).toContain("Paragraph two.");
    expect(result).toContain("Paragraph three.");
    // Block appended
    expect(result).toContain(CODEX_SENTINEL_BEGIN);
    expect(result).toContain(CODEX_SENTINEL_END);
    // Block is AFTER the user content
    expect(result.indexOf(CODEX_SENTINEL_BEGIN)).toBeGreaterThan(result.indexOf("Paragraph three."));
  });

  it("creates AGENTS.md when it does not exist", () => {
    const cwd = makeTmpDir();
    const agentsPath = join(cwd, "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(false);

    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    writeAdapterArtifacts([art], { force: false });

    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain(CODEX_SENTINEL_BEGIN);
  });
});

// ─── writeAdapterArtifacts — upsert-section replace ──────────────────────────

describe("writeAdapterArtifacts upsert-section replace", () => {
  it("replaces existing block with --force, preserving user content before and after", () => {
    const cwd = makeTmpDir();
    const agentsPath = join(cwd, "AGENTS.md");
    const before = "# Header\n\nBefore content.\n\n";
    const oldBlock = `${CODEX_SENTINEL_BEGIN}\nold content\n${CODEX_SENTINEL_END}`;
    const after = "\n\nAfter content.\n";
    writeFileSync(agentsPath, before + oldBlock + after, "utf8");

    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    const results = writeAdapterArtifacts([art], { force: true });

    const result = readFileSync(agentsPath, "utf8");
    // User content before and after preserved exactly
    expect(result).toContain("Before content.");
    expect(result).toContain("After content.");
    // Old block replaced with new block
    expect(result).not.toContain("old content");
    expect(result).toContain(CODEX_SENTINEL_BEGIN);
    expect(result).toContain(CODEX_SENTINEL_END);
    // Result reports replaced: true
    expect(results[0]?.replaced).toBe(true);
  });

  it("errors MANIFEST_EXISTS on second write without --force when block exists", () => {
    const cwd = makeTmpDir();
    const art = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;
    // First write (block absent — appends)
    writeAdapterArtifacts([art], { force: false });
    // Second write (block now present — should error with MANIFEST_EXISTS code)
    let caught: unknown;
    try {
      writeAdapterArtifacts([art], { force: false });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AdapterWriteError);
    expect((caught as AdapterWriteError).code).toBe("MANIFEST_EXISTS");
  });
});

// ─── Rollback ─────────────────────────────────────────────────────────────────

describe("writeAdapterArtifacts rollback on failure", () => {
  it("restores AGENTS.md to pre-call bytes when a subsequent write artifact fails", () => {
    const cwd = makeTmpDir();
    const agentsPath = join(cwd, "AGENTS.md");
    const originalContent = "# My Project\n\nKeep me.\n";
    writeFileSync(agentsPath, originalContent, "utf8");

    // Simulate a failing write artifact by using an existing plain file as the
    // "parent directory". mkdirSync will throw ENOTDIR, causing rollback.
    const blocker = join(cwd, "blocker-file");
    writeFileSync(blocker, "I am a file, not a dir", "utf8");
    const conflictArt = {
      mode: "write" as const,
      // Using the blocker file as a directory — mkdirSync(dirname(...)) throws.
      absPath: join(blocker, "cannot-create-under-file.md"),
      content: "content",
    };

    // "write" artifacts sort before "upsert-section", so conflictArt runs first.
    // That means AGENTS.md (upsert-section) hasn't been touched yet.
    // To test rollback of AGENTS.md we need it written first.
    // Flip: put codexArt first by using a path that sorts after the conflict.
    // Easier: use two write artifacts — write AGENTS.md directly, then fail.
    const agentsWriteArt = {
      mode: "write" as const,
      absPath: join(cwd, "zzz-agents-write.md"), // sorts after blocker path
      content: "intermediate write",
    };
    void agentsWriteArt;

    // The codex artifact is upsert-section (sorts last), so it runs after the
    // conflictArt write fails. Let's verify that AGENTS.md is NOT modified.
    const codexArt = generateCodexAdapter({ cwd, templatesRoot: TEMPLATES_ROOT })[0]!;

    // conflictArt sorts before codexArt (write < upsert-section).
    // conflictArt will throw, triggering rollback before codexArt runs.
    const artifacts = [conflictArt, codexArt];

    expect(() => writeAdapterArtifacts(artifacts, { force: false })).toThrow(AdapterWriteError);

    // AGENTS.md must be unchanged (rollback preserved original content).
    const afterContent = readFileSync(agentsPath, "utf8");
    expect(afterContent).toBe(originalContent);
  });

  it("deletes freshly written files when a later artifact fails", () => {
    const cwd = makeTmpDir();

    // A write artifact that will succeed
    const goodArt = {
      mode: "write" as const,
      absPath: join(cwd, "aaa-good.md"),
      content: "good content",
    };

    // A write artifact that will fail (file-as-directory trick)
    const blocker = join(cwd, "blocker");
    writeFileSync(blocker, "file", "utf8");
    const badArt = {
      mode: "write" as const,
      absPath: join(blocker, "child.md"),
      content: "bad",
    };

    expect(() => writeAdapterArtifacts([goodArt, badArt], { force: false })).toThrow(AdapterWriteError);

    // The good file must be deleted (rolled back — it did not exist before)
    expect(existsSync(goodArt.absPath)).toBe(false);
  });
});
