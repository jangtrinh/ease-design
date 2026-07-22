/**
 * Runtime registry — single source of truth for per-runtime adapter config.
 *
 * Spec 021 P1 (registry consolidation, pure refactor — no behavior change).
 * Before this file, the same 3-runtime knowledge was hand-duplicated across
 * `init-stub.ts` (manifest path switch), `adapters/index.ts` (dispatch switch),
 * `model-adapter-registry.ts` (record + wrapper-path switch), and
 * `command-signatures.ts` (hand-copied enum). A partial migration reintroduces
 * that two-sources bug, so all four consumers now read this one array.
 *
 * `detect` is part of the P3 (auto-detect) contract; P1 does not call it —
 * every entry here always returns `false` as a placeholder until P3 fills it in.
 *
 * Coverage v1 (this file): the 3 native runtimes only. The universal
 * `agents-md` fallback entry is added in P2.
 */
import { join } from "node:path";
import { generateClaudeAdapter } from "../adapters/claude.js";
import { generateAntigravityAdapter } from "../adapters/antigravity.js";
import { generateCodexAdapter } from "../adapters/codex.js";
import type { AdapterArtifact, AdapterInput } from "../adapters/index.js";

export type ModelAdapterMode = "stdin" | "arg";

/** Native runtime ids, in canonical order. `Runtime` is derived from this, not hand-written. */
export const NATIVE_RUNTIME_IDS = ["claude", "antigravity", "codex"] as const satisfies readonly string[];

/** Back-compat alias — `src/core/init-stub.ts` re-exports this for existing consumers. */
export type Runtime = (typeof NATIVE_RUNTIME_IDS)[number];

export interface RuntimeEntry {
  id: Runtime;
  /** false only for the future universal `agents-md` fallback entry (P2). */
  native: boolean;
  /**
   * Auto-detect signal (P3). Reads cwd + env only, no network/model. P1 never
   * calls this — every entry's implementation is a placeholder for now.
   */
  detect(cwd: string, env: NodeJS.ProcessEnv): boolean;
  /** ← was init-stub.ts:190-195's manifestTargetPath switch */
  manifestPath(cwd: string): string;
  /** ← was adapters/index.ts:56-66's dispatch switch */
  adapterFn(input: AdapterInput): AdapterArtifact[];
  /** ← was model-adapter-registry.ts:34-41's MODEL_ADAPTERS record */
  modelAdapter: { argv: string[]; mode: ModelAdapterMode };
  /** ← was model-adapter-registry.ts:79-88's modelWrapperRelPath switch */
  wrapperRelPath: string;
}

const claude: RuntimeEntry = {
  id: "claude",
  native: true,
  detect: () => false, // P3 fills this in
  manifestPath: (cwd) => join(cwd, ".claude", "ease-design.json"),
  adapterFn: generateClaudeAdapter,
  modelAdapter: { argv: ["claude", "-p"], mode: "stdin" },
  wrapperRelPath: ".claude/design-os-model.sh",
};

const antigravity: RuntimeEntry = {
  id: "antigravity",
  native: true,
  detect: () => false, // P3 fills this in
  manifestPath: (cwd) => join(cwd, ".agent", "ease-design.json"),
  adapterFn: generateAntigravityAdapter,
  modelAdapter: {
    argv: ["agy", "--dangerously-skip-permissions", "-p"],
    mode: "arg",
  },
  wrapperRelPath: ".agent/design-os-model.sh",
};

const codex: RuntimeEntry = {
  id: "codex",
  native: true,
  detect: () => false, // P3 fills this in
  manifestPath: (cwd) => join(cwd, "AGENTS.ease-design.json"),
  adapterFn: generateCodexAdapter,
  modelAdapter: { argv: ["codex", "exec"], mode: "stdin" },
  wrapperRelPath: "design-os-model.sh",
};

/** Registration order is the canonical order every derived list (RUNTIMES, enums, …) uses. */
export const RUNTIME_REGISTRY: readonly RuntimeEntry[] = [claude, antigravity, codex] as const;

/** Back-compat: the native-runtime id list, in registry order. */
export const RUNTIMES: readonly Runtime[] = RUNTIME_REGISTRY.filter((r) => r.native).map(
  (r) => r.id,
);

/** Look up a registry entry by id. Returns undefined for an unknown id. */
export function findRuntimeEntry(id: string): RuntimeEntry | undefined {
  return RUNTIME_REGISTRY.find((r) => r.id === id);
}
