# Tasks — 003 quality upgrade

> Draft-for-review. Owner reads spec.md (esp. decisions D1–D4) before P3/P5. P1/P2/P4 need
> no decision — safe to build first. Each phase = 1 PR, 3-tier pipeline, human merge.

- [x] P1 — tap-target-undersized + ai-cliche-gradient — ✓ 2026-07-15 merged (PR #23, CI 5/5, suite 1739; dogfood-fire precision-verified on hashicorp/composio/cohere)
- [x] P2 — web craft lints (5) — ✓ 2026-07-16 merged (PR #25, CI 5/5, suite 1777; dogfood-fired). unbounded-measure deferred to D3.
- [x] P3 — mobile floor M2-M6 (M1=P1) — ✓ 2026-07-16 merged (PR #27 `a1b6e86`, web-only per D1)
- [x] P4 — delivery-assets — ✓ 2026-07-15 merged (PR #24, CI 5/5). knowledge + avoidable-screenshot-crop lint; resolver = workflow-guidance (kernel stays pure). The 'not a noob' fix shipped.
- [x] P5 — signature-devices + 3 personas (23→26) + RODES contract — ✓ 2026-07-16 merged (PR #26 `2162006`, per D2)
- [x] Decisions D1-D4 RESOLVED (owner 2026-07-16); D4 ratified as constitution Art X `18c0c27`. **SPEC 003 COMPLETE.**
