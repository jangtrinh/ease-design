# Changelog

All notable changes to ease-design are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **Journey skills — the whole user journey as three installable skills.** `ui init` now
  emits `design-os-onboard` (six entry routes, git + manifest-name STOP-gates, soul
  layer selection, heartbeat schema), `design-os-daily` (the four-"audit"
  disambiguation table, finding triage, Figma preflight, taste corpus loop) and
  `design-os-deliver` (the ordered full-stack audit playbook, static-vs-rendered a11y
  ship-guard, semver handoff) across all three runtimes — 11 skills total, every skill
  now prefixed `design-os-*`. Paired linters: journey-command-consistency (every `ui`/
  `design-os` command a template cites must exist) and journey template-drift coverage
  in `ui doctor`.
- **`ui ds soul factory` — the shipped design:os baseline stance.** A world-class
  product-design soul (Never / Always / Voice, ratified by the product itself) compiled
  into the binary as a new tier BELOW project and studio soul — so a mass user has a
  top-tier stance day-0 with zero setup. It rides in every `ui ds context` as the
  `## Soul — factory` section (always present; overridden clause-by-clause by any
  project/studio soul above it, never merged), and prints on demand via `ui ds soul
  factory`. Emitter+linter paired: a test enforces `checkSoul(FACTORY_SOUL)` returns
  0 findings forever. Precedence: brief > project > studio > factory > memory > floors.
- **`ui agents` — soul-bound, task-scoped project agents.** `agents init` writes Claude Code
  subagents into `.claude/agents/` — role-first names with a genealogy suffix
  (`designer-jang-vsf-pcp`), identity read at runtime via `ui ds context` (souls are never
  baked into the file), hard role boundaries (designer never self-scores · curator never
  edits · figma-hand never simulates), opt-in roster, and a template-hash drift check
  (`agents check` → `agent-stale`).
- **`ui ds soul` (+ `--studio`) — the declared design stance.** `design/soul.md` (Never /
  Always / Voice, owner-ratified) rides ahead of personas in every generation flow;
  `~/.ease-design/studio-soul.md` is the studio layer above every project soul and names
  the agents. Emitter + linter: scaffolds from `ds init`, a 6-check structure floor, and
  evidence-cited extraction via `/ui:learn`. Precedence: brief > soul > memory > floors.
- **`design-os heartbeat` — deterministic design-health rhythm.** Due-scheduled checks
  (ds-a11y · specimen · audit-pages · figma-audit) with per-task intervals, a DESIGN_OK
  silence contract, worsened/improved delta gating (exit 1 = the notification), skip
  reasons everywhere, FNV-1a stagger, and `--stats` ok-rates. No model calls.
- **`ui taste` — vote-driven taste corpus.** Ingest with sha256 + dHash dedup, pairwise
  Elo ranking, study-verdict ledger; pure JSONL stores.
- **`design-os figma audit` / `figma-agent audit-ds` — automated DS-hygiene audit.** One
  raw plugin pass (dynamic-page-safe, census-accurate on 160k-instance files), judged
  entirely in fixture-tested CLI code: ds/icon/screen segmentation, ten detectors
  (unused, junk names, deprecated, duplicates by name and structure, dead variants,
  redundant families, empty sets, misfiled, unbound paints), offline `--from-facts` replay.
- **Slop gates** — 8 deterministic anti-generated-UI checks (overshoot easing, italic
  display headings, uppercase tight line-height, focus rings that fade in, z-index
  inflation, 100vw widths, root overflow-x hidden, placeholder names) wired into the
  taste/layout/content linters, plus `knowledge/page-structures.md` (21 macrostructures,
  variety↔conformance switch, honest copy, pre-emit self-critique).
- **`brand/`** — the studio's own design-system store (Swiss Monolith, machine-corrected
  contrast) and the first evidence-cited soul, extracted from five live products.

### Changed
- **DESIGN:OS** — project rebranded (repo renamed to `design-os`); README rebuilt hero-first
  with a live-product demo gallery, workflow maps, and this changelog surfaced as a table.

- **`ui ds specimen` — the component-registry state/variant completeness contract (learn-from-shadcn Phase 3).**
  A shadcn component page draws every variant×size×state as a specimen grid; `ui ingest-figma-ds` captures it
  as `variants: ["State=Hover", …]`. `ui ds specimen` reads that back and reports each component's variant
  dimensions + declared states, flagging only *reliably-modelled* gaps: a form **control** that models an
  interaction state but no `disabled`, and a **data container** (table/list/select/combobox/…) with no
  `empty`. Role is read from the **leaf** component name so a Button nested under a DatePicker is judged a
  button, not data (the over-pairing lesson applied). `focus` is intentionally never required (usually a
  runtime `:focus-visible`, not a Figma variant). Informational by default; `--strict` gates. On the real
  718-component shadcn-standard registry it surfaces 6 credible gaps (Combobox/Select missing empty;
  MenuItem/Button missing disabled). New pure module `src/core/specimen-check.ts`.

### Fixed
- **`ui ingest-figma-ds` no longer emits self-referential aliases (dogfood F1).** When two distinct Figma
  variables collapse to the same DTCG path and one aliases the other, the ingest used to emit
  `$value: "{self}"`, which made the whole tokens.json unresolvable (`alias cycle detected`) for every
  downstream `ui tokens`/`ds` command. It now detects an alias whose target is the token's own path and
  drops it, keeping the literal sibling instead. Surfaced live-ingesting the real "shadcn - standard"
  Figma DS (2188 components / 802 variables), where `breakpoint.2xl` self-aliased.

### Changed
- **`ui ds a11y` adopts the paired-token model — deterministic contrast, no over-pairing (shadcn standard).**
  When a DS follows the `{role}` / `{role}-foreground` convention (background/foreground,
  primary/primary-foreground, muted/muted-foreground, …), `ds a11y` now checks each foreground against its
  ONE intended surface — the declared pairs — instead of the text×surface cartesian product. This fixes the
  VSF-dogfood "L3" over-pairing (a light-surface text token was wrongly paired against dark panels). The
  result reports `mode: "explicit" | "paired" | "inferred"`; the legacy cartesian inference remains only as a
  fallback for un-paired DSs and the report nudges toward `-foreground` naming or `--pairs`. New pure module
  `src/core/token-pairs.ts` (`inferForegroundPairs`). The paired convention is now the documented Design-OS
  semantic-tier standard (`knowledge/token-taxonomy.md`).
- **taste-lint `tiny-body-text` is now role-aware (dogfood L2).** The 16px body-text floor was firing on
  legitimate UI chrome (badges, nav, labels, table meta, code, eyebrow headings). It now reads the role from
  the `<style>` selector (exempt a ≤13px size when the selector names a chrome/label/heading/secondary role,
  but still flag below a 9px abuse floor) and, for inline/Tailwind sizes, only flags positively body-named
  elements (`p`, `article`, `.prose`, `.description`…) since an inline font-size is almost always a one-off
  chrome tweak. On a real enterprise UI-kit showcase this cut false positives from 35 → 1. `<style>`-rule
  findings now anchor the line at the `font-size` token itself.
- **a11y-lint skips redirect-only stubs (dogfood L1).** `checkHtmlLang` / `checkDocumentTitle` no longer
  flag a document whose body is a bare `<meta http-equiv="refresh">` redirect (no page to title/voice).

### Added
- **`ui ds import` — onboard an existing flat token file into the DS store (dogfood G1).** Real projects
  carry a flat `tokens.json` (`{ category: { name: value } }`, e.g. Figma-reconciled), not a compiled DS
  store — so `ui ds a11y/status/diff/docs` couldn't run on them. `ui ds import <tokens.json> --dir <project>`
  converts the flat file to the DTCG two-tier store (inferring `$type` per value: color / dimension /
  number / fontFamily / fontWeight / duration; hoisting nested groups to `<cat>-<sub>`; **skipping and
  reporting** un-typeable values like box-shadow strings and bezier easings rather than emitting a wrong
  type) and seals a manifest + empty registry. On the VSF-PCP dogfood this imported 117 tokens and
  immediately surfaced a systemic contrast matrix via `ui ds a11y` that a one-off check had missed.
- **`ui evidence` — user-evidence ledger with an anti-fabrication gate (DESIGN-OS T6).** Grounds design in
  what users actually said: a self-contained, git-committable store (`design/research.events.jsonl` +
  `research-sources/`) of findings at three support levels — `quote` (a verbatim user utterance; **must be a
  whitespace-normalised substring of its ingested source or `add`/`verify` reject it** — the binary cannot
  invent a quote), `metric` (a number + source ref), and `observation` (a hunch, permanently flagged
  `unsupported`). Subcommands `add`/`list`/`verify`/`show`; `verify` exits 1 on any fabricated or drifted
  quote. **Loop-closure with T0:** `ui critique-coverage --evidence-dir DIR` now resolves a criterion's
  `evidence[]` as ledger ids — a criterion counts as evidenced only if a cited id exists AND verifies; a
  missing/drifted citation is reported as `unresolvedEvidence` and fails the gate even without
  `--require-evidence` (legacy string-provenance behaviour is preserved when `--evidence-dir` is absent).
  The binary records and verifies; turning transcripts into findings stays the host model's job. Authoring
  brain `knowledge/user-evidence.md`.
- **`ui vr` — deterministic visual-regression tooling (DESIGN-OS T5).** Catches rendered-output changes a
  code diff can't (a token tweak that moved every button, a silently-deleted shadow). Three subcommands:
  `vr diff <base.png> <head.png>` (one comparison), `vr gate <baseline-dir> <current-dir>` (diff every
  baseline against the same-named fresh render — exit 1 on any regression; a baseline with no current is a
  regression, a current with no baseline is a not-yet-accepted `new`), and `vr accept` (deliberately promote
  current → baseline; the gate never auto-updates). The engine is a **zero-dependency vendored PNG codec**
  (`node:zlib` builtin for inflate/deflate) + a **pixelmatch port** (YIQ perceptual delta + anti-aliasing
  detection), with `--mask "x,y,w,h;…"` for dynamic regions, `--threshold`/`--max-ratio` tolerances, and
  `--out`/`--out-dir` diff images. Constitutional split: the binary only *compares*; the host (figma-agent /
  preview) *renders*. Authoring brain `knowledge/visual-regression.md` (the render-environment flake rule).
- **`ui content-lint` — deterministic content / UX-writing floor (DESIGN-OS T4).** Static, precision-first,
  low-false-positive-only checks on UI microcopy: **errors** — lorem-ipsum, placeholder-copy (unfinished
  copy); **warnings** — click-here-link (WCAG 2.4.4), error-code-alone (a bare code with no human
  explanation), exclamation-overload, insensitive-terms (whitelist/blacklist/master-slave only),
  plural-s-hack (`item(s)` → use ICU MessageFormat), text-in-image, all-caps-shout. Prose linters
  (write-good/proselint/alex/Flesch–Kincaid) are deliberately excluded — they misfire on short imperative
  copy. Voice, tone and brand fit stay a curator (model) judgment against the tone-by-situation matrix in
  `knowledge/content-design.md`. Exit 1 on error-severity; `--json` envelope.
- **`ui flow lint` — deterministic IA linting for multi-screen flows (DESIGN-OS T3).** A `flow.json`
  models screens (each with its data-lifecycle states), transitions and entry points; `ui flow lint`
  runs 12 pure graph checks nobody else does deterministically: **errors** — dangling-ref,
  unreachable-screen, dead-end, missing-error-state (an async/submit transition on a screen with no
  `error` state), invalid-trigger, noop-self-loop, no-entry; **warnings** — orphan-screen,
  unreachable-state (a declared state nothing targets — decorative), missing-back-path,
  missing-empty-state/skeleton (for data modes), guard-without-complement. Guards are declared for
  linting/handoff, never executed (the deterministic guarantee). Schema `schemas/flow.schema.json`;
  authoring brain `knowledge/flow-craft.md`.
- **`ui a11y-lint` — Tier-1 static-HTML accessibility linter (DESIGN-OS T2).** Precision-first checks a
  parser can decide with no browser: img-missing-alt (1.1.1), html-lang (3.1.1), document-title (2.4.2),
  positive-tabindex (2.4.3), viewport-zoom-blocked (1.4.4), **icon-control-unnamed (4.1.2)** — an emoji/glyph
  or icon-only button/link with no accessible name (closes the recurring "emoji as a control" defect) — and
  heading-hierarchy (1.3.1/2.4.6, warnings). Exit 1 on error-severity findings. Honest by construction: a pass
  is **not** "accessible" and **not** "WCAG AA conformant"; rendered contrast, focus visibility/order, and
  alt-text quality need a browser (Tier 2) or a human and are explicitly out of scope.
- **`ui ds a11y` — token-pair contrast audit (DESIGN-OS T2).** For every text-role token × surface-role
  token (roles inferred from names, or pinned with `--pairs "text.muted:bg.default,..."`), computes the WCAG
  contrast ratio and flags any pair below AA (4.5:1), exiting 1. This catches the recurring secondary-text
  trap — muted/secondary text ~#8A-lightness on white ≈ 3.2:1 — at the *design-system* level, before a screen
  exists. Disabled/inactive roles are exempt (per SC 1.4.3). Honest by construction: it verifies **declared
  token pairs only** — not rendered contrast, not that a screen uses these pairs — and never emits the word
  "accessible"/"WCAG AA compliant" from a static run.
- **`ui changelog` — a readable design changelog (DESIGN-OS T1).** Folds the DS manifest's `changelog[]`
  (init / change-token / register) and the memory ledger's recorded `insight` decisions into a
  Keep-a-Changelog-style history — Added / Changed / Decisions, newest first, each line provenance-tagged
  (the acting command, or the `refs` behind a decision). Human- and model-readable; pure, read-only.
  `--dir`, `--format markdown|json`.
- **`ui ds docs` — decay-proof component documentation (DESIGN-OS T1).** Regenerates Markdown (or JSON)
  reference docs from the component registry + resolved token values: per component its variants, states,
  tokens-used (with resolved values), and a "consider adding" hint for commonly-missed states
  (focus/disabled/loading/error/empty). Because the docs are a pure function of the registry, they cannot
  drift out of sync the way hand-maintained docs do. `--dir`, `--out <file>`, `--format markdown|json`.
- **`ui ds diff` — semver + computed visual-breaking-change for a design system (DESIGN-OS T1).**
  Compares two DS states (dirs holding `design.tokens.json` + optional `component-registry.json` — the
  host materialises them from git refs) and classifies every token/component change as
  **breaking / additive / patch**, folding to a `recommendedBump` and (with `--base-version`) a
  `recommendedVersion`. Crucially it *measures* visual breakage instead of guessing: a colour change is a
  patch below an OKLab **ΔEOK** tolerance and breaking above it; a dimension change is a patch below a %
  tolerance and breaking above. A token removed while a component still lists it in `tokensUsed` is a
  **dangling** reference — forces major and exits 1. `--format markdown|json|pr-comment` (the last is a
  `gh pr comment`-ready summary). Pure, deterministic; the rules the model narrates from live in
  `knowledge/versioning-semver.md`.
- **`ui critique-coverage --require-evidence` (DESIGN-OS T0)** — closes the fabricated-criteria hole: an
  acceptance criterion with no `evidence` provenance is an **assumption**, never counted as real coverage
  (`evidencedCoveragePct`), and fails the gate. `curator.md` gains the matching honesty rules (coverage is a
  self-report; a11y is a hard floor above the style source; never claim "accessible" from a static check).
- **The recall loop closes (Track 9 · P4)** — `recall reflect <job-events.json>` assembles a job's
  own events plus the semantic neighbours memory already held, prints the Reflexion instruction
  ("extract ONE durable lesson — what was LEARNED, not what was said") and the exact
  `ui memory record insight --refs <job ids>` write-back. **recall never calls a model**: the host
  model that ran the job — the one still holding the brief, the curator verdict and the iterate
  rounds — is the reflector, and the lesson re-enters the ledger only through that provenance-checked
  command. The loop is wired into the job choreography (`knowledge/figma-craft/workflow-experience.md`
  §2d): START primes the generation prior with `recall query` → `ui memory context --rank-file`,
  LAND folds the job back in with `recall index` + `recall reflect`. Every step is optional and
  cold-start-safe, and a rank file is still never spliced into `--for critique`.
- **`recall/` — semantic memory over the design ledger (Track 9 · P3b + P3c)** — a new
  optional in-repo npm workspace (Node ≥ 22; never published, never imported by the binary).
  `recall index` pulls `ui memory export-corpus`, embeds it **locally** with
  `all-MiniLM-L6-v2` (ONNX — nothing leaves the machine) and upserts it into a rebuildable
  `sqlite-vec` index (vec0 KNN + FTS5 in one file), incrementally via a per-project cursor
  pinned in the index header alongside the model id and dimensions. Point it at `knowledge/`
  and the knowledge core is embedded into the same index, so one query surfaces a relevant
  persona rule *and* a past project insight. `recall query "<text>" --out ids.json` ranks by
  **RRF (dense KNN + BM25) × the memory graph's 30-day half-life decay × bi-temporal
  validity** — a token rationale superseded by a later change is demoted, never deleted, so it
  is only served when nothing current matches — and emits a rank file that feeds straight into
  `ui memory context --rank-file`. Two indexes: per-project `design/memory.vec.db` and
  cross-project `~/.ease-design/taste.vec.db`. A root test fails the build if anything under
  `src/` mentions the vector store, the embedder, or `node:sqlite`, so the `ui` binary stays
  zero-dependency / no-network / no-LLM. Driving doc: `knowledge/recall-mind.md`.
- **Recall seams on `ui memory` (Track 9 · P3a)** — two pure, deterministic subcommand
  surfaces that let an optional semantic-recall layer sit on top of the design memory without
  adding a single runtime dependency to the binary. `ui memory export-corpus [--since
  <eventId>]` walks the ledger and emits one natural-language payload per embeddable item,
  tagged by tier (`episodic` = recorded insights with provenance, `semantic` = token-change
  rationales + harvest sources, `procedural` = persona signatures + vibe→axis mappings);
  `--since` makes it incremental and it emits NDJSON (or a `--json` envelope). `ui memory
  context --rank-file <ids.json>` splices a recall-ranked selection of those items back into
  the emitted prior, in rank order and capped. The JSONL ledger stays the sole source of truth
  (any vector index is a rebuildable view), and a rank file is **never** spliced into
  `--for critique` — the taste gate stays craft-only.
- **`/ui:design` — scope-aware design of something NEW** (a screen or a component) from a
  requirement, distinct from rebuilding an existing frame (`/ui:to-figma`) or auditing one
  (`/ui:audit`). Detects **SCREEN vs COMPONENT** scope from the phrasing, runs an
  **understand-until-decision-ready** loop (rounds of sharp questions, prefer
  propose-a-default-to-confirm, never a wall), then runs the matching discipline — screen:
  objective → IA (`ux-psychology.md` + `mode-constraints.md` + persona) → compose from real DS
  instances (Recipe 18) grounded in `CONVENTIONS.md` → critique → land; component: registry
  lookup by NAME → create-new (walk the new `component-design.md` → component SET + states
  board + bind tokens + register) / extend-a-missing-variant / already-covered reuse. It
  composes existing capabilities and adds **no new `ui` binary command**; conforms the F0
  lifecycle + cost contract. New knowledge doc **`knowledge/figma-craft/component-design.md`**
  (the design brain for one component: anatomy → variant axes → states → edge cases →
  create-new-vs-extend). Wired into `workflow-experience.md` (two router rows), `ui guide`, and
  the knowledge index.
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
