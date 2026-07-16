# Plan 004 — Figma live-sync: hook points + phasing (binding for executor)

> Executor: Sonnet implements → Opus audits → final gate reviews/commits (Art V). Capture
> (plugin/broker) lives OUTSIDE the kernel; the delta→registry transform is deterministic
> (no network, no LLM) — Art I. Every phase = 1 PR, stop-and-report. All hook points below are
> from the feasibility research (lab `harvest/figma-sync-research.md`), cited to real file:line;
> re-verify each before editing (line numbers drift).

## Architecture (3 tiers)

**Tier 1 — Capture (plugin):** `figma-agent/plugin` (source `main/main.ts` → build `code.js`).
Register `figma.on("documentchange", batch→postMessage)` beside the existing
`figma.on("currentpagechange", announceFileInfo)`. Call `figma.loadAllPagesAsync()` at boot
(currently lazy) — required by the `dynamic-page` manifest for whole-doc events. On DELETE,
snapshot node identity (id/name/type) at capture — `RemovedNode` loses props. `selectionchange`
handler emits a `COMPONENT_EDIT_END` boundary when selection leaves a component subtree (LOCAL
commit). Optional GLOBAL: poll `getPublishStatusAsync()` → synthetic `PUBLISH_DETECTED`.

**Tier 2 — Transport + Log (broker):**
`figma-agent/cli/src/transport/broker-daemon.ts` `broadcastToClients()` (~:259) already fans
out plugin events; `EventMsg` union in `figma-agent/shared/protocol.ts` (~:72). Add event types
`DOC_CHANGE | COMPONENT_EDIT_END | PUBLISH_DETECTED`. The broker (long-lived) **appends each
frame to `design/figma.changes.jsonl`** — CLI clients are ephemeral, the broker is the durable
listener. Reuse the `src/core/memory-store.ts` append-only + line-count-cursor pattern.

**Tier 3 — Reconcile (deterministic CLI):** new `design-os figma reconcile
--since <cursor> [--dry-run|--apply]`. Walk `figma.changes.jsonl` from cursor → coalesce
changes to the component level → map scope (publish-status / `remote`) → compute the delta via
`src/core/ds-diff.ts` (added/removed/changed by name) → `registerComponent(force)`
(`src/core/registry-store.ts` ~:258, name-keyed replace). DELETE/removed → `deprecated: true`.
Emit a preview-delta; accept advances the cursor (= line-count). Zero network, zero LLM.

## Phasing

| Phase | Scope | Depends | Note |
|-------|-------|---------|------|
| **P1 Capture (read-only)** | documentchange listener → `figma.changes.jsonl`; identity snapshot on DELETE; boot `loadAllPagesAsync`; new EventMsg types + broker append. **No apply.** | — | Dogfood: measure event coverage + volume on a real file (Art III one-run budget). Proves the stream is usable before anything consumes it. |
| **P2 reconcile --dry-run** | deterministic preview-delta from the log (coalesce → ds-diff → scope-map). No writes. | P1 | Validates reconcile-by-name + scope mapping against a real change batch. |
| **P3 Registry schema** | add `scope: local\|global` + `deprecated?: boolean` to `ComponentRecord` (D3). Closed allowed-keys + `additionalProperties:false` → schema change; normal reviewed PR (not librarian). Migrate existing registries (default `scope: local`). | — (parallel to P1/P2) | Small, gates the apply phases. |
| **P4 LOCAL apply** | selectionchange-boundary commit + apply-with-accept for `scope=local` (braked). | P2+P3 | D1 heuristic. |
| **P5 GLOBAL apply** | publish-status polling (Workaround A, default) → apply `scope=global`; REST webhook (B) as opt-in team tier. | P4 | D2 — the one risky signal. |
| **P6 Deletion soft-deprecate** | DELETE → `deprecated:true`; audit integration (audit already reads `deprecated`). | P3 | Closes the loop. |

## Ràng buộc chung
`ui`/`design-os` deterministic: reconcile is pure transform over the captured log, no live
Figma call, no LLM. Module <200 lines, kebab-case. Findings/envelope shapes per existing
workspace contracts. 4 gates + `ui knowledge check` + `uv run pytest -q`. Git explicit-path +
hunk-sweep + AI-ref-clean commits (harness appends `Co-authored-by`; strip via `gh pr merge
--body ""` / `git commit --amend`). **Parallel executors MUST use `isolation: worktree`** —
never share one working tree (hard-won lesson, 2026-07-16 spec 003 P3/P5 race).

## Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| GLOBAL publish has no clean plugin signal | D2: poll-status default (no server), webhook opt-in; both append the same jsonl schema so Tier 3 is signal-agnostic |
| documentchange volume/noise | coalesce hard to component level in the broker before append; batched already by Figma |
| RemovedNode loses props | snapshot identity at capture (Tier 1) |
| loadAllPagesAsync RAM cost | accept; measure in P1 dogfood; document |
| ComponentRecord schema is closed | D3 P3 adds fields via reviewed PR; migrate default scope=local |
| registerComponent is whole-record replace (no field merge) | reconcile rebuilds the full record from the change + prior; note if partial-merge ever needed |
