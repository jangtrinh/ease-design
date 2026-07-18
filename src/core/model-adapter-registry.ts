/**
 * Model-adapter registry — spec 013 P1 (host-model fuel line).
 *
 * `ui init --runtime <r>` writes a per-runtime manifest + adapter tree, but the
 * learning loop's harvest/reflect step (design-os/src/design_os/harvest_model.py)
 * still needs a `DESIGN_OS_MODEL_CMD` pointing at the user's own host model —
 * today that is a manual, unset step on every real project. This registry lets
 * `ui init` write a tiny wrapper script that normalizes each host's invocation
 * to harvest_model's fixed contract: the prompt packet arrives on **stdin**,
 * argv is static config, stdout is the model's text.
 *
 * The table below is transcribed EXACTLY from the live-probed table in
 * specs/013-host-model-fuel-line/plan.md ("Verified adapter table — probed live
 * 2026-07-18") — counted, not guessed. Do not alter the invocations without a
 * fresh live probe.
 *
 *   | runtime     | invocation                                          | prompt mode |
 *   |-------------|------------------------------------------------------|-------------|
 *   | claude      | `claude -p`                                          | stdin       |
 *   | codex       | `codex exec`                                         | stdin       |
 *   | antigravity | `agy --dangerously-skip-permissions -p "<prompt>"`   | arg         |
 *
 * stdin-mode hosts: the wrapper just execs the host command; stdin passes
 * through untouched. arg-mode hosts (antigravity/agy): the wrapper reads the
 * whole packet from stdin into a shell variable via `$(cat)` and passes it as
 * a single quoted CLI argument — never via `eval`, so no shell-injection risk
 * from the packet's contents.
 */
import type { Runtime } from "./init-stub.js";

export type ModelAdapterMode = "stdin" | "arg";

/** One entry per runtime design:os models today. Extend only with a fresh live probe. */
export const MODEL_ADAPTERS: Record<Runtime, { argv: string[]; mode: ModelAdapterMode }> = {
  claude: { argv: ["claude", "-p"], mode: "stdin" },
  codex: { argv: ["codex", "exec"], mode: "stdin" },
  antigravity: {
    argv: ["agy", "--dangerously-skip-permissions", "-p"],
    mode: "arg",
  },
};

/**
 * Build the POSIX wrapper script content for a given runtime.
 *
 * stdin-mode hosts (claude, codex): pass stdin straight through to the host CLI.
 * arg-mode hosts (antigravity): capture stdin into `$prompt`, then pass it as a
 * single quoted argument — normalizes the host to harvest_model's stdin contract
 * without the host ever needing to support reading a prompt from stdin itself.
 *
 * Pure — no filesystem access, no process spawn. Deterministic per runtime.
 */
export function buildModelWrapperScript(runtime: Runtime): string {
  const { mode } = MODEL_ADAPTERS[runtime];

  if (mode === "arg") {
    return (
      `#!/usr/bin/env sh\n` +
      `# design:os model adapter (${runtime}) — spec 013. Packet on stdin → arg → host model on stdout.\n` +
      `prompt="$(cat)"\n` +
      `exec agy --dangerously-skip-permissions -p "$prompt"\n`
    );
  }

  const execLine = runtime === "claude" ? "exec claude -p" : "exec codex exec";
  return (
    `#!/usr/bin/env sh\n` +
    `# design:os model adapter (${runtime}) — spec 013. Packet on stdin → host model on stdout.\n` +
    `${execLine}\n`
  );
}

/**
 * The manifest-relative (POSIX, forward-slash) path each runtime's wrapper is
 * written to. Lives inside the runtime's own dir so it travels with the rest
 * of that runtime's adapter tree — except codex, which has no adapter dir of
 * its own (its manifest is a cwd-root sidecar), so the wrapper sits alongside it.
 */
export function modelWrapperRelPath(runtime: Runtime): string {
  switch (runtime) {
    case "claude":
      return ".claude/design-os-model.sh";
    case "antigravity":
      return ".agent/design-os-model.sh";
    case "codex":
      return "design-os-model.sh";
  }
}
