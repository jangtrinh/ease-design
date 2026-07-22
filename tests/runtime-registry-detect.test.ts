/**
 * detect() + detectRuntimes() — spec 021 P3 (auto-detect).
 *
 * Deterministic unit tests against constructed cwd/env inputs (no reliance
 * on the real process.env, which may itself carry CLAUDE_CODE_ENTRYPOINT
 * when this suite runs inside a Claude Code session).
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { detectRuntimes, findRuntimeEntry } from "../src/core/runtime-registry.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "runtime-registry-detect-"));
}

const EMPTY_ENV: NodeJS.ProcessEnv = {};

describe("claude.detect", () => {
  it("true when CLAUDE_CODE_ENTRYPOINT is set, even without .claude/", () => {
    const cwd = makeTmpDir();
    try {
      const claude = findRuntimeEntry("claude")!;
      expect(claude.detect(cwd, { CLAUDE_CODE_ENTRYPOINT: "cli" })).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("true when .claude/ exists, even without the env var", () => {
    const cwd = makeTmpDir();
    try {
      mkdirSync(join(cwd, ".claude"));
      const claude = findRuntimeEntry("claude")!;
      expect(claude.detect(cwd, EMPTY_ENV)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("false when neither signal is present", () => {
    const cwd = makeTmpDir();
    try {
      const claude = findRuntimeEntry("claude")!;
      expect(claude.detect(cwd, EMPTY_ENV)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("antigravity.detect", () => {
  it("true when .agent/ exists", () => {
    const cwd = makeTmpDir();
    try {
      mkdirSync(join(cwd, ".agent"));
      const antigravity = findRuntimeEntry("antigravity")!;
      expect(antigravity.detect(cwd, EMPTY_ENV)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("false when .agent/ is absent", () => {
    const cwd = makeTmpDir();
    try {
      const antigravity = findRuntimeEntry("antigravity")!;
      expect(antigravity.detect(cwd, EMPTY_ENV)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("codex.detect", () => {
  it("true when AGENTS.md exists", () => {
    const cwd = makeTmpDir();
    try {
      writeFileSync(join(cwd, "AGENTS.md"), "# project\n", "utf8");
      const codex = findRuntimeEntry("codex")!;
      expect(codex.detect(cwd, EMPTY_ENV)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("false when AGENTS.md is absent, even with CODEX_HOME set (unreliable signal, ignored)", () => {
    const cwd = makeTmpDir();
    try {
      const codex = findRuntimeEntry("codex")!;
      expect(codex.detect(cwd, { CODEX_HOME: "/some/path" })).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("agents-md.detect", () => {
  it("always false — it is the explicit fallback, never auto-detected", () => {
    const cwd = makeTmpDir();
    try {
      writeFileSync(join(cwd, "AGENTS.md"), "# project\n", "utf8");
      const agentsMd = findRuntimeEntry("agents-md")!;
      expect(agentsMd.detect(cwd, { CLAUDE_CODE_ENTRYPOINT: "cli" })).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("detectRuntimes", () => {
  it("empty array when no signals are present", () => {
    const cwd = makeTmpDir();
    try {
      expect(detectRuntimes(cwd, EMPTY_ENV)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns matched native entries in registry order (claude, antigravity, codex)", () => {
    const cwd = makeTmpDir();
    try {
      mkdirSync(join(cwd, ".agent"));
      writeFileSync(join(cwd, "AGENTS.md"), "# project\n", "utf8");
      mkdirSync(join(cwd, ".claude"));
      const ids = detectRuntimes(cwd, EMPTY_ENV).map((r) => r.id);
      expect(ids).toEqual(["claude", "antigravity", "codex"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("never includes the agents-md fallback", () => {
    const cwd = makeTmpDir();
    try {
      writeFileSync(join(cwd, "AGENTS.md"), "# project\n", "utf8");
      const ids = detectRuntimes(cwd, EMPTY_ENV).map((r) => r.id);
      expect(ids).not.toContain("agents-md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
