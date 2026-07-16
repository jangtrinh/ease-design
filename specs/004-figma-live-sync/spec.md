# Spec 004 — Figma live-sync: the design system's registry follows Figma in near-real-time

**Status**: draft-for-review · **Stage**: spec · **Tracking**: GitHub issues per phase
**Constitution**: Art I (two sources of truth — capture lives outside the kernel, the
delta→registry transform is deterministic), Art II (emitter+linter), Art III (real data),
Art V (three-tier pipeline), Art X (no auto-overwrite: a11y/quality gates still apply)

## What

Turn Figma from a one-shot snapshot source into a **living source**: when a user edits a
frame or component in Figma, the change is captured near-real-time to an append-only
change-log, and a deterministic reconcile applies it into design:os's component-registry —
one-way (Figma→registry), scope-aware (local vs global), detect-automatically but
apply-with-a-brake (preview-delta → human/heartbeat accept). Detail + exact hook points:
`plan.md`. Feasibility research (all API facts + code hooks cited): lab
`harvest/figma-sync-research.md`.

## Why

Today the flow is pull-once: `figma scan → ingest-figma-ds → registry` re-snapshots the whole
DS. Owner wants push-continuous: an edit to one component flows to the registry without a full
re-scan, so the registry is a live reflection of the design source. Research confirms this maps
cleanly onto primitives design:os already has (broker event fan-out, the memory-store jsonl
ledger+cursor pattern, `registerComponent` reconcile-by-name, `ds-diff` for deltas) — it is an
extension, not new infrastructure.

## Locked model (owner, 2026-07-16)

- **Direction: one-way Figma→registry.** Figma is the design source of truth.
- **Scope: one registry, records tagged `scope: local | global`.** Local = this project only;
  global = shared/published library used across projects. Scope inferred from Figma publish
  status / `remote`.
- **Two-speed commit points:** LOCAL component → applied when the user leaves editing it
  (save/deselect boundary); GLOBAL → only on library publish.
- **Detect auto, apply braked:** changes are logged in real-time automatically; reconcile
  produces a preview-delta; a human or the heartbeat accepts before it lands. No silent
  overwrite of the registry (no-silent-caps).
- **Deletion = soft-deprecate** (not hard-delete), matching the existing audit `deprecated`
  concept.

## Feasibility (from research — VERIFY-first, grades in the report)

Strong for most of the model. Existing primitives reused: broker `broadcastToClients` event
channel + `EventMsg` (transport), `memory-store` append-only jsonl + line-count cursor
(the change-log is a drop-in mirror), `registerComponent` name-keyed replace + `ds-diff`
added/removed/changed (reconcile). `documentchange` gives op + node id + changed props +
`origin: LOCAL|REMOTE`, whole-document under `dynamic-page` + `loadAllPagesAsync()`.

**The one real risk — GLOBAL publish signal.** `LIBRARY_PUBLISH` is exposed only via the
**REST webhook v2** (needs a server + team token + paid plan), NOT as a plugin event.
Plugin-side, `getPublishStatusAsync()` is only accurate inside the library file and emits no
event — it must be polled. So the GLOBAL "second speed" is the only part without a clean
plugin signal. Two workarounds (decision D2 below).

Second-order risks: `documentchange` volume (batched but fires on every settle → must coalesce
hard to the component level); `RemovedNode` loses most props on DELETE → must snapshot identity
at capture time; `loadAllPagesAsync()` at boot loads all pages into RAM.

## Owner decisions needed (flagged)

- **D1 — LOCAL commit boundary:** the "leave editing a component" signal is a *derived
  heuristic* (selectionchange-boundary + documentchange coalesce), not a native Figma event.
  Accept the heuristic (recommended), or require an explicit user action (e.g. a plugin
  "commit" button) as the boundary?
- **D2 — GLOBAL publish workaround:** default **A. plugin publish-status polling** (no server,
  coarse, single-file-only) with **B. REST webhook** as an opt-in team tier later
  (recommended); or require the webhook from the start (accurate, multi-machine, but needs
  server + token + plan)?
- **D3 — Registry schema change:** add `scope: local|global` and `deprecated?: boolean` to
  `ComponentRecord` (its allowed-keys are closed, `additionalProperties:false`) — this is a
  DS-manifest schema change (per constitution, schema changes go through a normal reviewed PR,
  the librarian only proposes). Confirm the two new fields + their defaults.

## Non-goals

- Two-way sync (registry→Figma) — deferred; would need real conflict resolution.
- LLM in the reconcile path — the transform stays deterministic (kernel rule).
- Real-time *apply* — apply is always braked (preview + accept); only *detection* is real-time.

## Acceptance criteria (per phase, 3-tier pipeline)

1. Capture: `documentchange` → `design/figma.changes.jsonl` append-only with identity
   snapshotted; dogfood on a real Figma file measuring event coverage + volume (Art III).
2. Reconcile `--dry-run`: deterministic preview-delta from the log, zero network/LLM, verified
   against a real change batch; scope mapping correct.
3. Apply braked: preview → accept advances the cursor; nothing lands silently.
4. Deletion soft-deprecates; audit still reads `deprecated`.
5. Every phase = 1 PR, human merge; 4 gates + `ui knowledge check` + `uv run pytest -q` green.

## References

- Feasibility research (API + code hooks, file:line): lab `harvest/figma-sync-research.md`.
- Rule/phase detail + exact hook points: `plan.md`.
