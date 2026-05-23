/**
 * Codex adapter — generates the adapter artifact list for the codex runtime.
 *
 * Emits a single upsert-section artifact targeting <cwd>/AGENTS.md.
 * The block is delimited by sentinel comments so it can be idempotently
 * replaced without disturbing user-authored content around it.
 */
import { join } from "node:path";
import type { AdapterArtifact, AdapterInput } from "./index.js"; // AdapterInput: {cwd, templatesRoot}
import {
  WORKFLOW_VERBS,
  SKILL_NAMES,
  resolveTemplatePath,
  hashTemplateFile,
} from "./templates.js";
import {
  buildCodexBlock,
  CODEX_SENTINEL_BEGIN,
  CODEX_SENTINEL_END,
} from "./wrapper-shapes.js";

/**
 * Generate the Codex adapter artifact for the given cwd + templatesRoot.
 * Returns a single upsert-section artifact targeting AGENTS.md.
 * Pure function — no filesystem writes.
 */
export function generateCodexAdapter(input: AdapterInput): AdapterArtifact[] {
  const { cwd, templatesRoot } = input;

  // Build hash map over all non-init workflow templates + all skill templates.
  const hashes: Record<string, string> = {};

  for (const verb of WORKFLOW_VERBS) {
    if (verb === "init") continue; // no template file for the synthetic init verb
    const absPath = resolveTemplatePath(templatesRoot, "workflow", verb);
    if (absPath !== null) {
      hashes[`workflows/${verb}.md`] = hashTemplateFile(absPath);
    }
  }

  for (const name of SKILL_NAMES) {
    const absPath = resolveTemplatePath(templatesRoot, "skill", name);
    if (absPath !== null) {
      hashes[`skills/${name}.md`] = hashTemplateFile(absPath);
    }
  }

  const content = buildCodexBlock(templatesRoot, hashes);

  return [
    {
      mode: "upsert-section",
      absPath: join(cwd, "AGENTS.md"),
      content,
      sentinelBegin: CODEX_SENTINEL_BEGIN,
      sentinelEnd: CODEX_SENTINEL_END,
    },
  ];
}
