/**
 * Manifest builder for `ui init --runtime`.
 *
 * Writes a JSON file that marks the project as ease-design initialised
 * and (when `status: "ready"`) records the adapter tree that was generated.
 *
 * `status` values:
 *   "stub"  — written by earlier installs; no adapter tree generated yet.
 *             Re-run `ui init --runtime <r> --force` to upgrade.
 *   "ready" — adapter tree generated; `adapters` and `templateHashes` fields
 *             are present.
 *
 * The `now` parameter is injectable so tests can assert on a fixed timestamp
 * without time-dependent flakiness.
 */
import { join } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Runtime = "claude" | "antigravity" | "codex";

export const RUNTIMES: readonly Runtime[] = ["claude", "antigravity", "codex"] as const;

export interface InitManifest {
  version: 1;
  runtime: Runtime;
  /** ISO-8601 timestamp supplied by the caller (injectable for deterministic tests). */
  generatedAt: string;
  /**
   * Install state.
   *   "stub"  — adapter tree not yet generated.
   *   "ready" — adapter tree generated; `adapters` and `templateHashes` present.
   */
  status: "stub" | "ready";
  /** PATH-lookup name or absolute path the host runtime uses to invoke the binary via Bash. */
  binaryPath: string;
  /** Absolute path to the knowledge/ directory the host model reads directly. */
  knowledgePath: string;
  /**
   * Stable pointer to the implementation roadmap for this feature area.
   * References a heading anchor so it survives plan renumbering.
   */
  roadmapPointer: string;
  /**
   * Relative-to-cwd paths of all adapter files generated for this runtime.
   * Present only when `status === "ready"`.
   */
  adapters?: string[];
  /**
   * sha256 of each referenced template file at generation time.
   * Key = template path relative to templatesRoot. Supports future drift detection.
   * Present only when `status === "ready"`.
   */
  templateHashes?: Record<string, string>;
}

/** @deprecated Use `InitManifest`. Kept for back-compat with pre-ready installs. */
export type InitStubManifest = InitManifest;

// ─── Manifest builder ─────────────────────────────────────────────────────────

const ROADMAP_POINTER =
  "plans/ease-design/implementation-plan.md#per-runtime-adapters-ui-init";

/**
 * Build the manifest for a given runtime.
 *
 * @param input.runtime        Target runtime identifier.
 * @param input.binaryPath     Resolved path to the `ui` binary (e.g. `which ui` output).
 * @param input.knowledgePath  Resolved path to the `knowledge/` directory.
 * @param input.now            Injectable clock — called once for `generatedAt`.
 * @param input.status         "stub" (default) or "ready".
 * @param input.adapters       Relative paths of generated adapter files (ready only).
 * @param input.templateHashes sha256 per referenced template file (ready only).
 */
export function buildManifest(input: {
  runtime: Runtime;
  binaryPath: string;
  knowledgePath: string;
  now: () => Date;
  status?: "stub" | "ready";
  adapters?: string[];
  templateHashes?: Record<string, string>;
}): InitManifest {
  const status = input.status ?? "stub";
  const manifest: InitManifest = {
    version: 1,
    runtime: input.runtime,
    generatedAt: input.now().toISOString(),
    status,
    binaryPath: input.binaryPath,
    knowledgePath: input.knowledgePath,
    roadmapPointer: ROADMAP_POINTER,
  };
  if (status === "ready" && input.adapters !== undefined) {
    manifest.adapters = input.adapters;
  }
  if (status === "ready" && input.templateHashes !== undefined) {
    manifest.templateHashes = input.templateHashes;
  }
  return manifest;
}

// ─── Target path resolution ───────────────────────────────────────────────────

/**
 * Resolve the absolute path where the manifest should be written for a given
 * runtime and working directory.
 *
 * - claude      → `<cwd>/.claude/ease-design.json`
 * - antigravity → `<cwd>/.agent/ease-design.json`
 * - codex       → `<cwd>/AGENTS.ease-design.json`
 *
 * The Codex target uses a sidecar JSON file rather than appending to
 * `AGENTS.md` so the write is idempotent and machine-readable.
 */
export function manifestTargetPath(cwd: string, runtime: Runtime): string {
  switch (runtime) {
    case "claude":      return join(cwd, ".claude", "ease-design.json");
    case "antigravity": return join(cwd, ".agent",  "ease-design.json");
    case "codex":       return join(cwd, "AGENTS.ease-design.json");
  }
}
