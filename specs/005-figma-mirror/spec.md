# Spec 005 — Figma mirror: the registry is a 1:1, rebuildable reflection of each Figma component

**Status**: draft-for-review · **Stage**: spec · **Tracking**: GitHub issues per phase
**Constitution**: Art I (capture outside kernel; transform deterministic), Art II
(emitter+linter), Art III (real data), Art V (three-tier pipeline)

## What

Extend live-sync (spec 004) from *structural tracking* to a *true 1:1 mirror*: each Figma
component's registry record holds the **same representation design:os uses to build onto
Figma** (`FigmaExportNode`), stored as a per-component sidecar file, so an AI can read the
record and rebuild/edit the exact component — read-and-execute, symmetric both ways. On a
Figma edit, the changed component is re-exported via the reverse-walker (spec 005 spike,
already merged) and its sidecar replaced 1:1. Detail + hook points: `plan.md`. Feasibility +
spike verdict: lab `harvest/figma-mirror-research.md` + the merged `scan-node` fixed-point test.

## Why

Owner insight (2026-07-16): "the structure we use to draw onto Figma is exactly what the AI
should read to create/edit a component — fast, accurate, optimal." The live dogfood of spec
004 proved the gap: editing padding/height/visibility flowed into the log but changed nothing
in the registry, because the registry stored only name+tokens, not the component's buildable
definition. A 1:1 mirror closes that: registry ⟷ Figma node, one shared representation.

## Spike verdict (merged: reverse-walker + fixed-point test)

`node → FigmaExportNode spec → node` is a **fixed point for the visual/structural core** —
auto-layout topology (mode/spacing/padding/sizing/align), GRID, fills+alpha, corner radius
(uniform & per-corner), strokes, child HUG/FILL/FIXED, text (chars/size/family/weight/colour/
align) all survive. **Two documented gaps this spec must close:**
1. **Token bindings** — recovered as a variable *id*, not the token *name* the registry needs;
   a rebuild loses the binding.
2. **Instance / component references** — `FigmaExportNode` has no INSTANCE type and
   `createFigmaNode` no instance build-case → an INSTANCE degrades to a plain FRAME, inner
   composition not recursed.
Caveat: the fixed point is proven against the mock/build-convention; a **live round-trip on a
real component** is the final acceptance (P5).

## Locked model (owner, 2026-07-16)

- **1:1 mirror** — registry record = the buildable `FigmaExportNode` representation, symmetric
  with the build path (design:os→Figma).
- **Two halves** (from research): the **Figma-native structural spec is the reversible
  source-of-truth**; **markup (HTML/JSX) stays one-way** (design→code), never the mirror's
  truth. `markup` field untouched.
- **Storage: sidecar file per component** — `design/components/<name>.figma.json`; the
  registry record holds a pointer. Node-trees don't bloat the shared registry JSON.
- Builds on spec 004: capture/log/idle/panel/apply unchanged; the log's `nodeId` drives a
  scoped re-export at reconcile time.

## Non-goals

- Recovering HTML markup from Figma (impossible — one-way).
- Full push-back of arbitrary registry edits to Figma beyond rebuilding a component from its
  spec (the createFigmaNode path already exists; two-way conflict policy stays out).
- exec-js-authored absolute/modal components with no clean structural source — mirror walks
  the resulting node; some inner composition may not survive (documented, not silently fixed).

## Owner decisions — RESOLVED

- Storage = sidecar per component. Reverse-walker = merged (spike). Representation =
  `FigmaExportNode` extended.

## Acceptance criteria (per phase)

1. Token bindings survive round-trip: variable id → token name resolved (scan reads the token
   collection); rebuild reattaches the binding.
2. Instances survive: `FigmaExportNode` models an INSTANCE (componentId + overrides),
   `createFigmaNode` builds it, reverse-walker captures it; inner composition preserved.
3. Sidecar storage: `design/components/<name>.figma.json` + a `figma-node-reader`; registry
   holds the pointer, `markup` untouched.
4. Scoped mirror in reconcile: spec 004 log `nodeId` → scoped `scan-node` → sidecar replace on
   `--apply`; panel reports what actually landed (closes the 004 panel-honesty gap).
5. **Live round-trip GATE**: on a real component in Figma — `scan-node` → rebuild via
   `createFigmaNode` → structural diff vs original == fixed point. Art III real-data proof.
6. Every phase = 1 PR, human merge; 4 gates + `ui knowledge check` + pytest green. Parallel
   executors use isolation: worktree.

## References

- Spike verdict + reverse-walker: merged `scan-node` + `scan-node-fixed-point.test.ts`.
- Research: lab `harvest/figma-mirror-research.md`. Hook points + phasing: `plan.md`.
