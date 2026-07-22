/**
 * Universal agents-md adapter — generates the adapter artifact list for the
 * `agents-md` runtime (spec 021 P2).
 *
 * This is the universal fallback for any AGENTS.md-reading host agent that
 * isn't one of the three native runtimes (Cursor, Cline, Aider, Gemini-CLI,
 * …). It emits the SAME sentinel-block artifact shape as the codex adapter
 * (see adapters/codex.ts) via the shared `buildAgentsMdBlock` builder,
 * parameterized with id "agents-md" so the regen-hint line reads
 * `ui init --runtime agents-md --force` instead of `--runtime codex --force`.
 *
 * Emits a single upsert-section artifact targeting <cwd>/AGENTS.md.
 */
import { join, resolve } from "node:path";
import type { AdapterArtifact, AdapterInput } from "./index.js"; // AdapterInput: {cwd, templatesRoot}
import {
  WORKFLOW_VERBS,
  SKILL_NAMES,
  JOURNEY_NAMES,
  resolveTemplatePath,
  hashTemplateFile,
} from "./templates.js";
import {
  buildAgentsMdBlock,
  CODEX_SENTINEL_BEGIN,
  CODEX_SENTINEL_END,
} from "./wrapper-shapes.js";

/**
 * Generate the agents-md adapter artifact for the given cwd + templatesRoot.
 * Returns a single upsert-section artifact targeting AGENTS.md.
 * Pure function — no filesystem writes.
 */
export function generateAgentsMdAdapter(input: AdapterInput): AdapterArtifact[] {
  const { cwd, templatesRoot } = input;

  // Build hash map over all non-init workflow templates + all skill + journey templates.
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

  for (const name of JOURNEY_NAMES) {
    const absPath = resolveTemplatePath(templatesRoot, "journey", name);
    if (absPath !== null) {
      hashes[`journeys/${name}.md`] = hashTemplateFile(absPath);
    }
  }

  const knowledgeRoot = resolve(templatesRoot, "..", "knowledge");
  const content = buildAgentsMdBlock("agents-md", templatesRoot, hashes, knowledgeRoot);

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
