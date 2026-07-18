/**
 * Adapter dispatch — generate the per-runtime adapter artifact list.
 *
 * An AdapterArtifact describes a single file to write:
 *   mode "write"          — create or overwrite the file at absPath with content.
 *   mode "upsert-section" — insert/replace a sentinel-delimited block inside
 *                           an existing or new host file (used by Codex for AGENTS.md).
 */
import { join } from "node:path";
import type { Runtime } from "../core/init-stub.js";
import { generateClaudeAdapter } from "./claude.js";
import { generateAntigravityAdapter } from "./antigravity.js";
import { generateCodexAdapter } from "./codex.js";
import { buildModelWrapperScript, modelWrapperRelPath } from "../core/model-adapter-registry.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdapterArtifact =
  | {
      mode: "write";
      absPath: string;
      content: string;
      /** chmod 0o755 after write — used by the model-adapter wrapper script (spec 013 P1). */
      executable?: boolean;
    }
  | {
      mode: "upsert-section";
      absPath: string;
      content: string;
      sentinelBegin: string;
      sentinelEnd: string;
    };

/** Inputs shared by all per-adapter generator functions. */
export interface AdapterInput {
  cwd: string;
  templatesRoot: string;
}

/** Dispatch input — AdapterInput plus the runtime selector. */
export interface GenerateAdapterInput extends AdapterInput {
  runtime: Runtime;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Generate the adapter artifact list for a given runtime.
 * Pure function — no filesystem reads or writes.
 *
 * Appends the model-adapter wrapper (spec 013 P1) uniformly for all three
 * runtimes. Kept out of the per-runtime generators (and out of the manifest's
 * `adapters[]` contract — see commands/init.ts) so adapter-wrapper-lint, which
 * expects only workflow/skill/AGENTS.md shapes, never sees it.
 */
export function generateAdapter(input: GenerateAdapterInput): AdapterArtifact[] {
  const artifacts: AdapterArtifact[] = (() => {
    switch (input.runtime) {
      case "claude":
        return generateClaudeAdapter(input);
      case "antigravity":
        return generateAntigravityAdapter(input);
      case "codex":
        return generateCodexAdapter(input);
    }
  })();
  artifacts.push({
    mode: "write",
    absPath: join(input.cwd, modelWrapperRelPath(input.runtime)),
    content: buildModelWrapperScript(input.runtime),
    executable: true,
  });
  return artifacts;
}
