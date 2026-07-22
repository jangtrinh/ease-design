# Spec 021 — Any-agent compatibility (auto-detect + universal AGENTS.md + registry)

**Owner directive:** on install, DESIGN:OS should work with whatever host agent the user
runs (Claude Code, Codex, Antigravity, or any other), without the user hand-picking a
runtime. **Decision (locked):** file-adapter approach — auto-detect + a universal `AGENTS.md`
fallback + a data-driven runtime registry. Coverage v1: keep the 3 natives + universal
fallback. **No MCP.**

**Pipeline:** Opus spec → Sonnet implement → Opus + Codex 5.6 sol review → Fable audit.
Branch `feat/021-any-agent-compat`. Not merged/pushed until owner review.

## Grounded facts (from the integration-map research + live env check)

- One source array already: `src/core/init-stub.ts:21,23` (`Runtime` type + `RUNTIMES`).
  Hardcoded per-runtime logic is scattered across `init-stub.ts:190-195` (manifest path),
  `adapters/index.ts:56-66` (dispatch), `model-adapter-registry.ts:34-88` (argv/mode + wrapper
  path), `command-signatures.ts:464` (enum). `doctor.ts:108-114` + `onboard.ts:100-104` already
  loop `RUNTIMES`.
- codex's AGENTS.md block (`wrapper-shapes.ts:262-302`) is ALREADY host-neutral **except one
  line** (`:299`, the `--runtime codex --force` regen hint). Sentinels are product-named
  (`<!-- BEGIN ease-design -->` / `END`) — must stay byte-for-byte (upgrade-in-place matching).
- Live env: Claude Code sets `CLAUDE_CODE_ENTRYPOINT` / `CLAUDE_CODE_EXECPATH` (definitive).
  `CODEX_HOME` is set even inside a Claude Code session here → **unreliable, do not use for codex
  detection**. `~/.codex` / `~/.claude` are machine-level (both present) → useless for "who is the
  host". Project-level dirs (`.claude/`, `.agent/`, `AGENTS.md`) are the stable signals.

## Design

### Runtime registry (single source)

New `src/core/runtime-registry.ts`:
```ts
export interface RuntimeEntry {
  id: string;                 // "claude" | "antigravity" | "codex" | "agents-md"
  native: boolean;            // false only for "agents-md"
  detect(cwd: string, env: NodeJS.ProcessEnv): boolean;
  manifestPath(cwd: string): string;                 // ← init-stub.ts:190-195
  adapterFn(input: AdapterInput): AdapterArtifact[]; // ← adapters/index.ts:56-66
  modelAdapter: { argv: string[]; mode: "stdin" | "arg" }; // ← model-adapter-registry.ts:34-41
  wrapperRelPath: string;                            // ← model-adapter-registry.ts:79-88
}
export const RUNTIME_REGISTRY: readonly RuntimeEntry[] = [ claude, antigravity, codex, agentsMd ] as const;
export const RUNTIMES = RUNTIME_REGISTRY.filter(r => r.native).map(r => r.id); // back-compat
```
**Migrate all consolidated tables together** (init-stub manifest switch, adapters/index dispatch,
model-adapter-registry record+switch) — a partial migration reintroduces the two-sources bug.
`command-signatures.ts:464` derives its `values[]` from the registry ids (no hand-copied array).
`doctor.ts` + `onboard.ts` iterate `RUNTIME_REGISTRY` (their existing loops just grow by one).

### The 4 entries

- **claude** (native) — `.claude/commands/ui/*.md` + `.claude/skills/design-os-*` (unchanged
  `generateClaudeAdapter`). detect: `env.CLAUDE_CODE_ENTRYPOINT` set OR `.claude/` in cwd.
- **antigravity** (native) — `.agent/workflows/ui-*.md` + `.agent/skills/*` (unchanged). detect:
  `.agent/` in cwd (plus any verified antigravity env var — implementer checks; may be none).
- **codex** (native) — the AGENTS.md sentinel block + `AGENTS.ease-design.json` sidecar (unchanged
  behavior). detect: `AGENTS.md` file present in cwd. (Do NOT use `CODEX_HOME` — unreliable.)
- **agents-md** (universal, NEW, `native:false`) — the SAME AGENTS.md sentinel block as codex, via
  the generalized builder. This is the fallback for any AGENTS.md-reading agent (Cursor, Cline,
  Aider, Gemini-CLI, …). manifestPath = same `AGENTS.ease-design.json`.

### Generalize the codex block builder

`buildCodexBlock` (`wrapper-shapes.ts:262-302`) → `buildAgentsMdBlock(id: string)`: parameterize
ONLY line 299 to render `` `ui init --runtime ${id} --force` ``. Keep sentinels + all other prose
byte-for-byte. codex's entry calls `buildAgentsMdBlock("codex")`; agents-md's calls
`buildAgentsMdBlock("agents-md")`. Preserve `generateCodexAdapter`'s public behavior.

### Auto-detect + precedence (init.ts:145-166 seam)

Replace the "require --runtime or --all" hard error with:
1. **`--runtime <id>`** (explicit, incl. `agents-md`) → that one entry. Unchanged path. Deterministic.
2. **`--all`** → all `native` entries (claude+antigravity+codex; NOT agents-md — matches current
   `RUNTIMES` semantics). Deterministic.
3. **no flag = AUTO**: `detectRuntimes(cwd, env)` = every native entry whose `detect()` is true. If
   the result is **empty**, use `[agents-md]` (universal fallback — init is never unusable on an
   unrecognized host). 
- Build the selected list as a **Set keyed by manifest target path** so a native + the universal
  fallback can never both write the same `AGENTS.md`+sentinel in one run (they won't — agents-md is
  fallback-only — but dedup by target path is the safety invariant, per the research risk note).
- **Output**: the success text must state what was auto-selected and why, e.g.
  `auto-detected: claude (.claude/), codex (AGENTS.md)` or `no host detected → universal AGENTS.md`.
  Silent auto-selection is a footgun.
- **CI/reproducibility**: explicit `--runtime`/`--all` bypass detection entirely (deterministic).
  Document that scripts should pass an explicit runtime; no separate `--no-detect` flag needed.

`targetCwd` resolution (init.ts:168-170) moves ABOVE the runtime-selection block (detection stats
`targetCwd`, not `processCwd()`). Everything downstream of the `runtimes[]` array (entries build,
adapter-gen loop, write/rollback) is already list-driven → **zero changes** once the list is chosen.

## Phases (each gates green before the next)

- **P1 — Registry consolidation (pure refactor, no behavior change).** Create
  `runtime-registry.ts`; migrate init-stub manifest switch + adapters/index dispatch +
  model-adapter-registry (record+switch) to read the registry; derive command-signatures enum;
  point doctor/onboard loops at it. `RUNTIMES`/`Runtime` back-compat preserved. ALL existing tests
  green, zero behavior change. This is the risky-but-mechanical step; do it alone.
- **P2 — Universal agents-md.** Generalize `buildCodexBlock` → `buildAgentsMdBlock(id)`; add the
  `agents-md` registry entry; `--runtime agents-md` works; `ui schema` lists it. Sentinels
  byte-identical (add a test asserting the codex block is unchanged vs a golden). New
  `adapters-agents-md` test.
- **P3 — Auto-detect.** Add `detectRuntimes(cwd, env)` + the no-flag AUTO default + the
  self-describing output + the target-path dedup Set. Tests: no-flag in a `.claude/` dir → claude;
  no-flag in a bare dir → agents-md fallback; no-flag with `.claude/`+`AGENTS.md` → both; explicit
  `--runtime`/`--all` still bypass detection.

## Tests to preserve/extend
`tests/cmd-init.test.ts`, `tests/cmd-init-built-binary.test.ts`, `tests/adapter-cross-runtime.test.ts`,
`tests/adapters-codex.test.ts`, `tests/adapters-wrapper-shapes.test.ts`,
`tests/model-adapter-registry.test.ts`, `tests/cmd-doctor-adapter-lint.test.ts`. Add:
`runtime-registry` unit, `detectRuntimes` unit, `adapters-agents-md`, and a codex-block golden.

## Constraints
- Deterministic `ui`: no network, no model. Detection reads cwd + env only.
- Sentinel strings byte-for-byte (upgrade-in-place). Migrate the 3 tables together.
- Files < 200 lines; match style. No new deps.

## Acceptance
1. `ui init` with NO flag auto-detects the host(s) and wires them; unrecognized host → a working
   universal `AGENTS.md`. Output says what it chose.
2. `--runtime`/`--all` unchanged + deterministic (bypass detection). `--runtime agents-md` works.
3. Adding a future agent = one `RUNTIME_REGISTRY` entry — no edits to init.ts/doctor.ts/onboard.ts.
4. codex behavior + sentinels byte-identical; all existing tests green + new coverage.
