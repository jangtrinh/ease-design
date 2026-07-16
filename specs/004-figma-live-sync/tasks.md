# Tasks — 004 Figma live-sync (idle model)

> Draft-for-review. Owner reads spec.md (decision D3 only). P1/P2/P3 need no decision — safe to
> build first. Each phase = 1 PR, 3-tier pipeline, human merge. Parallel executors MUST use
> isolation: worktree (spec 003 P3/P5 race lesson).

- [x] P1 — Capture read-only (code + unit-gates) — ✓ 2026-07-16 merged (PR #35, CI 5/5, figma-agent 200 tests). JSONL contract locked. ⚠ LIVE dogfood (documentchange on real Figma) = owner-in-the-loop, still pending.
- [x] P2 — reconcile --dry-run — ✓ 2026-07-16 merged (PR #36, CI 5/5, suite 1831; dry-run proven byte-identical). Split-follow-up filed (Art IX).
- [x] P3 — Registry schema (scope + deprecated) — ✓ 2026-07-16 merged (PR #34, CI 5/5, suite 1810; shadcn-standard migrates clean)
- [ ] P4 — Idle-commit + panel prompt + apply: idle timer (config, default 5 min) → panel
      "N changes — Sync/Later" 1-click → reconcile --apply (local+global); deletion
      soft-deprecate + audit; cursor advance + replay-undo — stage:spec · depends P2+P3
- [ ] Decision D3 (schema fields scope + deprecated) — owner
      (D1 local-boundary + D2 publish-workaround RESOLVED — the idle model eliminates both)
