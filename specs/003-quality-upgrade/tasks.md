# Tasks — 003 quality upgrade

> Draft-for-review. Owner reads spec.md (esp. decisions D1–D4) before P3/P5. P1/P2/P4 need
> no decision — safe to build first. Each phase = 1 PR, 3-tier pipeline, human merge.

- [x] P1 — tap-target-undersized + ai-cliche-gradient — ✓ 2026-07-15 merged (PR #23, CI 5/5, suite 1739; dogfood-fire precision-verified on hashicorp/composio/cohere)
- [ ] P2 — web craft lints: font-scale-sprawl, mode-invisible-surface, clickable-no-pointer,
      font-display-missing, z-index-off-ladder (unbounded-measure D3-gated) — stage:spec
- [ ] P3 — mobile floor M1–M6 (layout-checks-mobile.ts + a11y-checks.ts) — stage:spec ·
      D1 (web-only OK without native)
- [ ] P4 — delivery-assets: knowledge/delivery-assets.md + resolve-assets + avoidable-crop
      lint (draft + prototype ready in lab) — stage:spec
- [ ] P5 — signature-devices.md + persona directions (D2) + RODES generation contract in
      prompt-modes.md — stage:spec
- [ ] Decisions D1 (native scope) · D2 (persona bloat) · D3 (heuristic severity) · D4
      (cross-axis priority → constitution) — owner
