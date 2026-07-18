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
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Runtime = "claude" | "antigravity" | "codex";

export const RUNTIMES: readonly Runtime[] = ["claude", "antigravity", "codex"] as const;

// ─── Package-root resolution ────────────────────────────────────────────────────

/** Resolved absolute paths to the bundled `templates/` and `knowledge/` roots. */
export interface PackageRoots {
  /** Absolute path to `<pkg>/templates`, or null if not found. */
  templatesRoot: string | null;
  /** Absolute path to `<pkg>/knowledge` (sibling of templates), or null. */
  knowledgeRoot: string | null;
}

/**
 * Locate the ease-design package roots by walking upward from `startDir` until
 * a sibling `templates/` containing the canonical sentinel
 * `workflows/generate.md` is found. Requiring the sentinel prevents latching
 * onto a stray `templates/` in a parent monorepo workspace before reaching the
 * real ease-design package root.
 *
 *   - Bundled binary: dist/cli.js → dist/ → ../templates/  (1 hop up from dist)
 *   - Vitest source import: src/commands/init.ts → ... → ../../templates/
 *
 * `knowledgeRoot` is resolved as the sibling `knowledge/` of `templatesRoot`
 * (the bundle layout — both ship at the package root per package.json `files`).
 * Both are null when the package layout cannot be found (a broken install).
 *
 * Pure except for `existsSync` reads; no writes, no network.
 */
export function resolvePackageRoots(startDir: string): PackageRoots {
  let searchDir = startDir;
  let templatesRoot: string | null = null;
  while (true) {
    const candidate = join(searchDir, "templates");
    if (
      existsSync(candidate) &&
      existsSync(join(candidate, "workflows", "generate.md"))
    ) {
      templatesRoot = candidate;
      break;
    }
    const parent = resolve(searchDir, "..");
    if (parent === searchDir) break; // filesystem root reached
    searchDir = parent;
  }
  const knowledgeRoot =
    templatesRoot !== null ? resolve(templatesRoot, "..", "knowledge") : null;
  return { templatesRoot, knowledgeRoot };
}

/** `dirname` re-export convenience so callers needn't import it separately. */
export function dirOf(filePath: string): string {
  return dirname(filePath);
}

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
  /**
   * The host-model wrapper script `ui init` wrote for this runtime (spec 013 P1) —
   * lets the learning loop's harvest/reflect step call the user's own host model
   * with zero manual `DESIGN_OS_MODEL_CMD` config. Deliberately NOT part of
   * `adapters[]` (adapter-wrapper-lint expects workflow/skill/AGENTS.md shapes).
   * Present only when `status === "ready"`.
   */
  modelAdapter?: {
    runtime: Runtime;
    /** Manifest-relative (POSIX) path to the wrapper script, e.g. ".claude/design-os-model.sh". */
    wrapper: string;
    mode: "stdin" | "arg";
    /** Date the invocation in model-adapter-registry.ts was last live-probed. */
    verifiedAt: string;
  };
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
 * @param input.modelAdapter   Host-model wrapper record (spec 013 P1; ready only).
 */
export function buildManifest(input: {
  runtime: Runtime;
  binaryPath: string;
  knowledgePath: string;
  now: () => Date;
  status?: "stub" | "ready";
  adapters?: string[];
  templateHashes?: Record<string, string>;
  modelAdapter?: InitManifest["modelAdapter"];
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
  if (status === "ready" && input.modelAdapter !== undefined) {
    manifest.modelAdapter = input.modelAdapter;
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
