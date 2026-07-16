# Plan 005 — Figma mirror: hook points + phasing (binding for executor)

> Executor: Sonnet implements → Opus audits → final gate reviews/commits (Art V). Capture
> outside kernel; the delta→sidecar transform deterministic. Every phase = 1 PR,
> stop-and-report. Hook points from research (lab `harvest/figma-mirror-research.md`) + the
> merged spike; re-verify each before editing.
> **Parallel executors MUST use `isolation: worktree`** (spec 003 P3/P5 + spec 005 spike race).

## Foundation already merged (spike)
`figma-agent/plugin/src/main/scan-node.ts` (`nodeToSpec`), `figma-agent/cli/src/commands/scan-node.ts`
(`scan-node <nodeId>` via EXEC_JS), `figma-agent/tests/scan-node-fixed-point.test.ts` (proves the
core is a fixed point; documents the two gaps). Representation = `FigmaExportNode`
(`figma-agent/shared/figma-payload-types.ts`); build = `executor-frame.createFigmaNode`.

## Phasing

| Phase | Scope | Depends | Note |
|-------|-------|---------|------|
| **P1 Token bindings** | reverse-walker resolves each `boundVariables` id → token **name** (scan already reads the token collection — join id→name); `createFigmaNode` reattaches the binding by name. Fixed-point test extended to assert bindings survive. | — | Closes gap 1. |
| **P2 Instances** | extend `FigmaExportNode` with an INSTANCE node (componentId + overrides + variant props); `createFigmaNode` gets an instance build-case (`figma.importComponentByKeyAsync`/local main → `.createInstance()`); `nodeToSpec` captures INSTANCE instead of degrading to FRAME; recurse overrides. Fixed-point test asserts instances + inner composition survive. | — | Closes gap 2. The hardest phase. |
| **P3 Sidecar storage** | `design/components/<name>.figma.json` writer + `src/core/figma-node-reader.ts` (mirror of `registry-markup-reader`); `ComponentRecord` gains a pointer (not the tree inline); `markup` untouched. Migrate/no-op for records without a sidecar. | P3-schema of spec 004 (scope/deprecated already landed) | |
| **P4 Scoped mirror in reconcile** | spec 004 change-log `nodeId` (ADD/EDIT) → call `scan-node <nodeId>` → write sidecar → registry pointer replace on `ui figma reconcile --apply`. Panel/apply reports what actually landed (added/updated/deprecated that changed the registry — closes the 004 panel-honesty gap event). | P1+P2+P3 | Wires the whole loop. |
| **P5 Live round-trip GATE** | on a real Figma component (owner in the loop): `scan-node` → `createFigmaNode` rebuild → structural diff vs original == fixed point, INCLUDING bindings + instances. Owner-in-the-loop acceptance (Art III). | P1-P4 | Not optional — the definitive proof the mock test can't give. |

## Ràng buộc chung
`ui`/`design-os` deterministic over the captured spec; sidecar write is local file IO from
already-captured data (no live Figma call in the kernel transform — the live scan happens in
the plugin/broker). Module <200 lines. 4 gates + `ui knowledge check` + `uv run pytest -q`.
Git explicit-path + hunk-sweep + AI-ref-clean (harness appends `Co-authored-by`; strip via
`gh pr merge --body ""` / `git commit --amend`).

## Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| Instance modeling is genuinely hard (variant resolution, nested overrides) | P2 isolated; fixed-point test is the gate; if an instance case can't round-trip, document + degrade explicitly (no silent loss) |
| Token id→name join misses cross-file/library variables | P1: resolve within the file's collection; library variables → record the key + note as a known edge |
| Sidecar sprawl (one file per component) | acceptable — mirrors registry-markup pattern; a component with no structural change writes no sidecar churn (content-hash guard) |
| Live P5 needs plugin rebuilt+reloaded each iteration | document the rebuild→reload loop (no hot-reload); use a small test file |
| exec-js-authored components with no clean source | mirror walks the node; document what doesn't survive, don't fake it |
