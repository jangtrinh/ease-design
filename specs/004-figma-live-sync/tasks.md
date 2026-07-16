# Tasks — 004 Figma live-sync

> Draft-for-review. Owner reads spec.md (esp. decisions D1–D3) before P4/P5. P1/P2/P3 need no
> decision — safe to build first. Each phase = 1 PR, 3-tier pipeline, human merge. Parallel
> executors MUST use isolation: worktree (spec 003 P3/P5 race lesson).

- [ ] P1 — Capture read-only: documentchange listener → design/figma.changes.jsonl (identity
      snapshot on DELETE, boot loadAllPagesAsync, EventMsg types + broker append). No apply.
      Dogfood: event coverage + volume on a real Figma file — stage:spec
- [ ] P2 — reconcile --dry-run: deterministic preview-delta from the log (coalesce → ds-diff →
      scope-map) — stage:spec · depends P1
- [ ] P3 — Registry schema: add scope + deprecated to ComponentRecord (D3), migrate default
      scope=local — stage:spec · parallel to P1/P2
- [ ] P4 — LOCAL apply: selectionchange-boundary commit + apply-with-accept (braked) — stage:spec
      · depends P2+P3 · D1
- [ ] P5 — GLOBAL apply: publish-status polling (A, default) → apply; REST webhook (B) opt-in —
      stage:spec · depends P4 · D2
- [ ] P6 — Deletion soft-deprecate + audit integration — stage:spec · depends P3
- [ ] Decisions D1 (local boundary heuristic) · D2 (global publish workaround) · D3 (schema
      fields) — owner
