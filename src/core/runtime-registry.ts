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
 * Spec 021 P2 adds the universal `agents-md` fallback entry (`native: false`)
 * — the same AGENTS.md sentinel block as codex, for any AGENTS.md-reading
 * host agent that isn't one of the 3 natives. `Runtime` widens accordingly
 * (see below); `RUNTIMES` (native-only) is unaffected — it still governs
 * `--all`.
 */
import { join } from "node:path";
import { generateClaudeAdapter } from "../adapters/claude.js";
import { generateAntigravityAdapter } from "../adapters/antigravity.js";
import { generateCodexAdapter } from "../adapters/codex.js";
import { generateAgentsMdAdapter } from "../adapters/agents-md.js";
import type { AdapterArtifact, AdapterInput } from "../adapters/index.js";

export type ModelAdapterMode = "stdin" | "arg";

/** Native runtime ids, in canonical order. The native slice of `Runtime` is derived from this, not hand-written. */
export const NATIVE_RUNTIME_IDS = ["claude", "antigravity", "codex"] as const satisfies readonly string[];

/** The universal AGENTS.md fallback id (spec 021 P2) — not native, no `detect()` wiring yet (P3 fills it in). */
export const UNIVERSAL_RUNTIME_ID = "agents-md" as const;

/**
 * Back-compat alias — `src/core/init-stub.ts` re-exports this for existing
 * consumers. Widened in spec 021 P2 to include the universal `agents-md`
 * fallback: `--runtime agents-md` flows through the identical manifest /
 * adapter-dispatch / model-wrapper code paths as a native runtime, so every
 * consumer that types a runtime value must legitimately accept it too.
 */
export type Runtime = (typeof NATIVE_RUNTIME_IDS)[number] | typeof UNIVERSAL_RUNTIME_ID;

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

/**
 * The universal `agents-md` fallback entry (spec 021 P2). Emits the identical
 * AGENTS.md sentinel block as codex — manifestPath, modelAdapter, and
 * wrapperRelPath are literally codex's (same target file, same host-model
 * invocation family: an AGENTS.md-reading agent). `detect` always returns
 * `false` here; P3's no-flag-AUTO path is what actually falls back to this
 * entry, not `detect()` itself.
 */
const agentsMd: RuntimeEntry = {
  id: UNIVERSAL_RUNTIME_ID,
  native: false,
  detect: () => false, // P3 fills this in
  manifestPath: codex.manifestPath,
  adapterFn: generateAgentsMdAdapter,
  modelAdapter: codex.modelAdapter,
  wrapperRelPath: codex.wrapperRelPath,
};

/** Registration order is the canonical order every derived list (RUNTIMES, enums, …) uses. */
export const RUNTIME_REGISTRY: readonly RuntimeEntry[] = [claude, antigravity, codex, agentsMd] as const;

/** Back-compat: the native-runtime id list, in registry order. Governs `--all`. */
export const RUNTIMES: readonly Runtime[] = RUNTIME_REGISTRY.filter((r) => r.native).map(
  (r) => r.id,
);

/**
 * All registry ids, including the universal `agents-md` fallback — used to
 * validate an explicit `--runtime <id>` (which may legitimately target the
 * fallback) and to derive the `ui schema` enum. `RUNTIMES` (native-only)
 * remains the list `--all` expands to.
 */
export const ALL_RUNTIME_IDS: readonly Runtime[] = RUNTIME_REGISTRY.map((r) => r.id);

/** Look up a registry entry by id. Returns undefined for an unknown id. */
export function findRuntimeEntry(id: string): RuntimeEntry | undefined {
  return RUNTIME_REGISTRY.find((r) => r.id === id);
}
