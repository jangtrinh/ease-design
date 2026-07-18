/**
 * Model-adapter registry — spec 013 P1.
 *
 * Asserts MODEL_ADAPTERS transcribes the live-probed table in
 * specs/013-host-model-fuel-line/plan.md exactly, and that
 * buildModelWrapperScript / modelWrapperRelPath emit the correct shape per mode.
 */
import { describe, expect, it } from "vitest";
import {
  MODEL_ADAPTERS,
  buildModelWrapperScript,
  modelWrapperRelPath,
} from "../src/core/model-adapter-registry.js";
import { RUNTIMES } from "../src/core/init-stub.js";

describe("MODEL_ADAPTERS", () => {
  it("has an entry for all 3 runtimes", () => {
    for (const runtime of RUNTIMES) {
      expect(MODEL_ADAPTERS[runtime]).toBeDefined();
    }
  });

  it("claude: `claude -p`, stdin", () => {
    expect(MODEL_ADAPTERS.claude).toEqual({ argv: ["claude", "-p"], mode: "stdin" });
  });

  it("codex: `codex exec`, stdin", () => {
    expect(MODEL_ADAPTERS.codex).toEqual({ argv: ["codex", "exec"], mode: "stdin" });
  });

  it("antigravity: `agy --dangerously-skip-permissions -p`, arg", () => {
    expect(MODEL_ADAPTERS.antigravity).toEqual({
      argv: ["agy", "--dangerously-skip-permissions", "-p"],
      mode: "arg",
    });
  });
});

describe("buildModelWrapperScript", () => {
  it("claude (stdin): execs `claude -p`, does not read stdin into a var", () => {
    const script = buildModelWrapperScript("claude");
    expect(script.startsWith("#!/usr/bin/env sh\n")).toBe(true);
    expect(script).toContain("exec claude -p");
    expect(script).not.toContain("$(cat)");
    expect(script).not.toContain("prompt=");
  });

  it("codex (stdin): execs `codex exec`, does not read stdin into a var", () => {
    const script = buildModelWrapperScript("codex");
    expect(script.startsWith("#!/usr/bin/env sh\n")).toBe(true);
    expect(script).toContain("exec codex exec");
    expect(script).not.toContain("$(cat)");
    expect(script).not.toContain("prompt=");
  });

  it("antigravity (arg): captures stdin into $prompt, passes it as a quoted -p arg", () => {
    const script = buildModelWrapperScript("antigravity");
    expect(script.startsWith("#!/usr/bin/env sh\n")).toBe(true);
    expect(script).toContain('prompt="$(cat)"');
    expect(script).toContain('agy --dangerously-skip-permissions -p "$prompt"');
  });

  it("is deterministic per runtime", () => {
    for (const runtime of RUNTIMES) {
      expect(buildModelWrapperScript(runtime)).toBe(buildModelWrapperScript(runtime));
    }
  });
});

describe("modelWrapperRelPath", () => {
  it("claude → .claude/design-os-model.sh", () => {
    expect(modelWrapperRelPath("claude")).toBe(".claude/design-os-model.sh");
  });

  it("antigravity → .agent/design-os-model.sh", () => {
    expect(modelWrapperRelPath("antigravity")).toBe(".agent/design-os-model.sh");
  });

  it("codex → design-os-model.sh (cwd root, alongside AGENTS.ease-design.json)", () => {
    expect(modelWrapperRelPath("codex")).toBe("design-os-model.sh");
  });
});
