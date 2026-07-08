# Changelog

All notable changes to ease-design are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **Behavioral web-clone (Track 5)** — rebuild a live site's *animation, interaction, and
  state*, not just its pixels. Five parts land in the `figma-agent` workspace:
  - **Converter core fills** — CSS `background-image` now paints as a real Figma IMAGE fill
    (the old blank-background bug is closed), `background-size` → scaleMode, `img.currentSrc`
    under srcset/`<picture>`/lazy, multi box-shadow spread → `clipsContent`, WebP fallback.
  - **Registry-driven font matching** — brand fonts + their CSS-stack fallbacks resolve
    against the installed Figma font set (cached `listAvailableFontsAsync`) before Inter.
  - **`figma-agent capture <url>`** — a Playwright hand that writes the unified per-URL folder
    `<slug>/capture/`: `manifest.json` (fonts + background-image bboxes + `<img>`/canvas/video),
    `behavior.json` (keyframes, transitions, hover/focus deltas, carousels with `autoplayMs`),
    `page.html`, `assets/`, `screenshots/`. Headed real-Chrome default, consent/hydration/scroll,
    graded WAF ladder (logged, never auto-escalated).
  - **Interaction + animation → Figma** — hover/focus state deltas become Default/Hover variant
    component sets with an `ON_HOVER` CHANGE_TO Smart-Animate reaction; captured keyframes become
    real Figma Motion tracks (`applyManualKeyframeTrack`), metronome-gated with variant fallback.
  - **Knowledge + templates** — intent-recipe 15 "Rebuild a live website on the canvas
    (with behavior)" + editable-vs-image heuristic + T1–T6 motion mapping; `from-url` gains a
    "Capture hostile/SPA sites" subsection; `to-figma` gains the capture→variants handoff.
- **Design Memory (`ui memory`)** — a per-project, append-only event ledger
  (`design/memory.events.jsonl`) + a deterministically compiled graph
  (`design/memory.graph.json`) + a cross-project taste profile under `~/.ease-design/`
  (override `EASE_DESIGN_HOME`). Seven pure subcommands — `record`, `compile`, `context`,
  `query`, `fingerprint`, `consolidate`, `status` — let the pipeline record what was
  picked / failed / edited / changed and read it back as a generation prior. Precedence is
  strict (brief > project memory > taste profile > `knowledge/` floors); memory biases
  generation and never scores critique. Stays deterministic / zero-dep / no-network / no-LLM.
- **`figma-agent/` in-repo workspace** — the Figma authoring "hands" (the `figma-agent`
  CLI + Figma Free plugin behind `/ui:to-figma`) now ship in this repo as an npm workspace
  instead of a separate external repository. Build from the root with
  `npm run build --workspace=figma-agent` (see `knowledge/figma-agent-hand.md`). It remains
  optional and outside the deterministic `ui` binary.
- **CI job for the figma-agent workspace** — a dedicated `figma-agent` job typechecks and
  builds the workspace on every push/PR so it can't silently rot; the four `ui` gates are
  unchanged.

## [0.1.0] - 2026-07-08

First public release: the multi-runtime design CLI — 12 `/ui:*` workflows, 8 skills,
a 17-command deterministic `ui` binary, the knowledge core (personas, taste rubric,
UX psychology, benchmark DNA, motion craft, Figma craft), and the Figma authoring track.

### Added
- **`knowledge/motion-craft.md`** — the animation **decision ladder** (T1 CSS transitions/
  keyframes → T2 View Transitions → T3 CSS scroll-driven → T4 Motion/anime.js → T5 GSAP →
  T6 authored Lottie/dotLottie · WebGL), so a variant needing motion beyond CSS follows
  doctrine instead of improvising. Carries **persona → tier caps** (a low-motion persona
  never ships GSAP), the non-negotiable **motion floors** (reduced-motion in every tier,
  transform/opacity-only, role-based durations, directional easing), copy-paste **CDN
  recipes** with the reduced-motion guard inline, choreography patterns, and anti-patterns.
  Lottie authoring is framed as an **external Text-to-Lottie hand** (like the figma-agent
  hand) — never bundled, the `ui` binary stays zero-network. Wired into `generate.md`,
  `critique.md`, and `slides.md`.
- **Two new `ui taste-lint` Motion checks** — `animation-no-reduced-motion` (a page that
  ships `@keyframes` / an `animation:` shorthand / a T4–T6 animation library `<script src>`
  but honors `prefers-reduced-motion` nowhere) and `keyframes-layout-props` (a `@keyframes`
  block animating a layout property — width/height/top/left/right/bottom/margin/padding —
  instead of transform/opacity). Both error-severity; they lift the deterministic Motion
  floor from 2 checks to 4.
- **`knowledge/ux-psychology.md`** — UX laws (Hick's, Fitts', Miller's, Von Restorff, …),
  Gestalt perception, cognitive biases, emotional design (Norman's three levels), trust
  building, cognitive-load management, and ethical persuasion, each with application
  rules and a final audit checklist. `generate.md` consults it selectively for heavy
  choice-architecture briefs (forms, pricing, funnels, dense nav). Ported from the
  figma-design-agent design-intelligence corpus.
- **`knowledge/benchmarks/`** — SOURCE-grade measured DNA captures (type ramps, weights,
  surfaces, shadow recipes, radius/gap scales, by usage count) for 8 ship-grade products:
  Arc, Figma, Framer, Linear, Notion, Raycast, Stripe, Vercel. 56 KB of JSON; the heavy
  PNG screenshots are deliberately not checked in (regenerable — see the README).
- **Excellence tier** in `knowledge/taste-rubric.md` + `critique.md` (opt-in, brief-driven,
  on top of the ≥7 gate): (1) correctness is a **gate, not a score** — validate-layout /
  taste-lint / autofix-idempotence / Consistency work list must be clean before any axis
  is scored; (2) **adversarial judging** — a fresh judge context (subagent where the
  runtime has them) that tries to refute each pass, never the maker grading its own work,
  plus a mandatory excellence round on pass; (3) the **reference duel** — the variant is
  duelled against the nearest benchmark DNA on measurable traits, evidence-anchored.
  The protocols consume rounds from the same ≤3-round cap.
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
- **`ui scan`** — deterministic, read-only project scanner: detects existing design
  signals (framework, styling, CSS/HTML files, component directories, design-system
  status) and prints a routing verdict — greenfield, brownfield-code, brownfield-html,
  or ds-present.
- **`/ui:learn`** — brownfield onboarding workflow (12th workflow): runs `ui scan`,
  asks ONE question (learn from code, a URL, Figma, or start fresh), routes to
  `extract.md`, `from-url.md`, or `figma.md`, and compiles the project's own design
  system from that evidence — so `/ui:generate` output matches the product instead of
  a persona default.

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
- `generate.md` Branch A gains a brownfield guard (step 0) — if `ui scan` reports the
  project is brownfield, it stops and points the user to `/ui:learn` instead of
  compiling a persona-default design system over existing UI.
- `ui init` — prints a next-step hint after install (brownfield projects point at
  `/ui:learn`, everything else at `/ui:generate`).
- Codex `AGENTS.md` block — its slash-command list is now derived from the verb
  registry instead of a hardcoded list, fixing drift that had left it missing
  `from-url`/`to-figma`.

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
