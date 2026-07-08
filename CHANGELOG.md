# Changelog

All notable changes to ease-design are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **`ui schema [--json]`** — machine-readable invocation contract for every `ui`
  (sub)command: positionals, flags (type/required/enums), documented error codes, and
  global flags/error codes. Nested per-subcommand signatures for the dispatcher commands
  (`ds`, `color`, `tokens`, `registry`, `edit-strategy`, `designmd`). A cross-consistency
  test pins every declared flag/error code to the command's `--help` text so the table
  cannot silently drift. The Codex adapter block now points agents at it before forming
  an invocation.
- **Central unknown-flag guard** — the schema signatures power a dispatcher-level flag
  guard: EVERY (sub)command now rejects unknown/misspelled flags with a did-you-mean
  hint (`UNKNOWN_FLAG`), extending the Phase-A per-command guard from 5 commands to all 16.
- **Skill/workflow discovery descriptions from template frontmatter** — all 18 templates
  now carry a `description:` (what + when + triggers); `ui init` sources the wrapper
  frontmatter from it via `readTemplateDescription()`. Kills the code-vs-template drift
  (the `SKILL_SUMMARIES`/`VERB_SUMMARIES` tables are gone) and fixes four
  previously-undiscoverable wrappers (`designmd-emit`, `figma-craft`, `from-url`,
  `to-figma`) that shipped a bare slug as their only discovery signal.
- **`ui strip-fences` full-document boundaries** — absorbs stray prose before
  `<!doctype`/`<html` and commentary after `</html>` (full documents only; fragments pass
  through untouched — no fuzzy first-tag guessing). `--json` reports
  `strippedLeading`/`strippedTrailing`. Now wired into `generate.md`'s raw→html step.

### Changed (workflow templates — propagate via `ui init --force`)
- `generate.md`/`slides.md`/`redesign.md`/`from-ref.md` consume the DS context + Tailwind
  `@theme` pair via ONE call — `ui ds context --strict --with-theme` — retiring the
  separate `ui tokens compile` step and its "adjust the tokens path" foot-gun.
- `generate.md` + `critique.md` prompt skeletons converted from `[BRACKET]` labels to
  XML tags (`<role>`, `<persona_dna>`, `<design_system>`, `<design_tokens>`,
  `<mode_constraints>`, `<output_format>`, …) — instructions separated from large pasted
  data blocks; the output contract explicitly permits the leading `AI_CRITIQUE_LOG`
  comment.
- `generate.md` persona hardening: an anti-default steer (resolve ambiguity inside the
  persona's DNA, never regress to generic clean-modern-SaaS) + an empty-DNA self-STOP at
  the point the family file is read (substitute the next-highest scorer, tell the user).
  Universal Style Guide / Mode Constraints / a11y floors explicitly override persona
  latitude on conflict.
- `generate.md`/`extract.md`/`from-ref.md` split `ui ds init` failures by **argument
  provenance**: model-derived errors (`BAD_NAME`, `PERSONA_NOT_FOUND`, over-long
  `BAD_INTENT`) self-correct with exactly ONE retry; user-supplied/state errors
  (`BAD_BRAND_HEX`, `DS_TAMPERED`, `DS_EXISTS`) surface immediately.
- `iterate.md` recovers `DIFF_NO_MATCH` cheaply: repair the diff ONCE from the envelope's
  `data.unmatched[]` diagnostics (nearest-window + quoted old lines) before falling back
  to identity-risky full regen.
- `refine.md` gains the `ui validate-layout` structural floor that `iterate.md`/
  `redesign.md` already had — gate on error-severity findings introduced by a re-emit
  (pre-existing source errors exempt), restore the pre-pass copy instead of forwarding
  corrupted markup.
- `critique.md` refine rounds now **accumulate** their `AI_CRITIQUE_LOG` blocks (prepend,
  newest first) and feed a `<prior_attempts>` slot so a later round never re-applies a
  fix an earlier round already tried on the same axis.
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
