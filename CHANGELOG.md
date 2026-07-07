# Changelog

All notable changes to ease-design are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **Figma authoring track** — `/ui:to-figma` (11th workflow) + a `figma-craft` skill.
  ease-design can now author **idiomatic Figma** on the canvas (Figma Free) from intent —
  auto-layout, component instances, token-bound variables — not just HTML. Reuses the
  existing design brain (personas, tokens, critique gate) plus new Figma construction
  knowledge in `knowledge/figma-craft/` (craft philosophy, decision ladder, 5 deep-dive
  references, L1–L14 construction lints) and `knowledge/figma-agent-hand.md`. The Figma
  "hands" are an **external** `figma-agent` CLI (the figma-design-agent repo + a Figma
  plugin) — deliberately **not** bundled into the deterministic `ui` binary. Ported from the
  figma-design-agent project. Complements `/ui:figma` (which imports Figma → HTML).
- `ui guide` — plain-language, intent-organized map of the `/ui:*` workflow (the
  designer on-ramp). Root help points newcomers to it.
- `ui doctor` — install/project health check (Node ≥20, bundled `knowledge/` +
  `templates/` resolve, project manifest knowledgePath resolves). `--cwd` checks a project.
- `ui taste-lint` — deterministic taste-rubric floor under the model-scored critique:
  catches tiny body text, off-grid spacing, mixed icon families, pure-black shadows,
  linear/`all` transitions, and off-palette hex. Wired into `critique.md` as a binding gate.
- Proof gallery at `examples/generated/live-2026-05-30/` — real, gate-clean output across
  generate → iterate → redesign → extract, plus a dense-dark dashboard at the opposite taste
  extreme. Browsable `index.html`.
- `QUICKSTART.md`; `LICENSE` (MIT); `CONTRIBUTING.md`; this changelog.
- Release automation: `.github/workflows/release.yml` (tag-triggered, version-matched,
  provenance) + a `prepublishOnly` gate.

### Fixed
- **Token→HTML loop**: `generate.md` (and `slides.md`, `redesign.md`) now compile DS tokens to
  a Tailwind `@theme` block and forbid arbitrary-hex utilities — generated HTML is token-bound
  (was emitting 100+ hardcoded hex per variant).
- **Knowledge delivery**: `ui init` resolves `knowledge/` to the package root and every adapter
  wrapper carries the absolute knowledge anchor, so a consumer install (npm/node_modules) can
  reach the knowledge core. Verified end-to-end via `npm pack` → clean install.
- **`applyLnDiff` over-deletion**: the exact-match path spliced the header range instead of the
  verified line count, silently deleting unverified neighbors. Now splices `oldLines.length`.
- **Pure-black shadows**: `SHADOW_MATRIX` hardcoded `#000000`; shadows are now tinted toward the
  persona's neutral hue (OKLCH-derived), satisfying the rubric and the `taste-lint` floor.
- **Critique gate coherence**: the `--strict` enforcement preamble no longer contradicts itself
  when the registry is empty on the first generation.

### Changed
- Version `0.0.0` → `0.1.0`; binary `--version` aligned to package.json (drift-guarded by a test).
- README rewritten: accurate counts, dual-audience (designer + developer), CLI-native positioning.

> Earlier history (v1 build — phases 1–7, the `ui` binary, knowledge core, 9 workflows,
> critique gate) predates this changelog; see the git log and `docs/journals/`.
