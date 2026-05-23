/**
 * Adapter dispatch — generate the per-runtime adapter artifact list.
 *
 * An AdapterArtifact describes a single file to write:
 *   mode "write"          — create or overwrite the file at absPath with content.
 *   mode "upsert-section" — insert/replace a sentinel-delimited block inside
 *                           an existing or new host file (used by Codex for AGENTS.md).
 */
import type { Runtime } from "../core/init-stub.js";
import { generateClaudeAdapter } from "./claude.js";
import { generateAntigravityAdapter } from "./antigravity.js";
import { generateCodexAdapter } from "./codex.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdapterArtifact =
  | {
      mode: "write";
      absPath: string;
      content: string;
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
 */
export function generateAdapter(input: GenerateAdapterInput): AdapterArtifact[] {
  switch (input.runtime) {
    case "claude":
      return generateClaudeAdapter(input);
    case "antigravity":
      return generateAntigravityAdapter(input);
    case "codex":
      return generateCodexAdapter(input);
  }
}
