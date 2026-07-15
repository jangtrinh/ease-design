# ease-design Knowledge Core

The `knowledge/` directory is one of ease-design's two sources of truth (the other is the
deterministic `ui` binary). These are **plain-Markdown files the host AI model reads
directly** while designing UI — curated design taste that sets the quality floor.

> **Selective reading.** Open only the file(s) a task needs — never load the whole core.
> Each file is self-contained; the task map below routes you to the right one.

## The files

| File | Covers |
|---|---|
| `authoring-standard.md` | **The meta-standard for writing knowledge/ files** — the repeatable file frame (`Purpose → Mental Model → When to Use/NOT → Content → Failure Modes`, Failure Modes mandatory), the constraint-language rules (bilateral ALLOWED/NOT-ALLOWED, WHY-with-mechanism, CAPS discipline), no-hardcoded-counts-in-prose, dual machine+human examples, the `<!-- ease:source ref=… -->` provenance grammar, untrusted-content quarantine, and scar-driven guardrails. Enforced by `ui knowledge check`. Read when writing or editing any knowledge file. |
| `taste-rubric.md` | The 6-axis taste model — Layout, Typography, Spacing, Motion, Iconography, Depth/Surface — plus the 7th Consistency axis. Per-axis 0–10 scoring and the critique-gate pass thresholds. |
| `motion-craft.md` | The animation decision ladder (T1 CSS → T6 Lottie/WebGL) — which motion technology to reach for so capability never exceeds intent, plus persona tier caps, the non-negotiable motion floors (reduced-motion every tier, transform/opacity only), and copy-paste CDN recipes. The *build* contract; `taste-rubric.md` Motion axis is the *grading* contract. |
| `personas/<family>.md` | The persona library — 23 curated personas across 7 families, one file per family. Each persona carries full aesthetic DNA (typography, color, spacing, depth, motion, anti-patterns, …). A persona is a fixed point in taste-space. |
| `persona-index.md` | Compact lookup table for all 23 personas + the auto-selection algorithm (keyword scoring, industry affinity, diverse-top-K) that picks personas from a user's intent. |
| `mode-constraints.md` | The 8 UI-mode constraint sets — mobile, desktop, component, slide, dashboard, app, admin, ecommerce — plus `TECHNICAL_RULES`, the universal hard style guide. |
| `component-catalog.md` | 32 reusable components across 8 categories — id, name, description, and generation spec for each. |
| `color-science.md` | OKLCH reasoning, WCAG contrast targets, 11-stop scale generation, semantic role mapping. The *reasoning* — the *math* is a `ui` binary subcommand. |
| `token-taxonomy.md` | The DTCG design-token model — primitive vs. semantic tiers, naming, alias resolution, post-compile immutability, and the paired `{role}`/`{role}-foreground` semantic standard (deterministic a11y). |
| `design-review.md` | The git-native **review + handoff** flow — how the host model runs a design PR review (materialise base/head from git refs → `ui ds diff --format pr-comment` → `gh pr comment`), cuts release notes (`ui changelog`), and hands off to engineering (`ui ds docs` + the behavioural prose no static tool can produce). Read when reviewing a design change or preparing a handoff. |
| `flow-craft.md` | Designing a **multi-screen flow** — the `flow.json` model (screens + data-lifecycle states + transitions + entry points), the two decisions that make it work (data states are flow nodes, pointer states aren't; guards are declared not executed), and the deterministic `ui flow lint` contract (unreachable screen · dead end · missing error/empty/skeleton state · dangling ref · guard-without-else). Read when designing more than one screen. |
| `versioning-semver.md` | Semver for a design system — how `ui ds diff` classifies a change (token/component add·remove·change) as **breaking/additive/patch**, incl. *computed* visual-breaking-change (colour ΔEOK, dimension %), and the cross-artifact dangling-reference check. Read when releasing a DS version or generating a design PR comment. |
| `user-evidence.md` | **Grounding design in real user evidence** — the `ui evidence` ledger + its anti-fabrication gate: a `quote` finding must be a *verbatim substring* of its committed source, so the model can't invent user words. The three support levels (quote / metric / observation=unsupported), the self-contained git-committable store (`design/research.events.jsonl` + `research-sources/`), and the T0 loop-closure (`ui critique-coverage --evidence-dir` resolves a criterion's `evidence[]` as ledger ids — a broken citation fails the gate). Read when sourcing acceptance criteria or recording research. The binary records + verifies; it never writes findings. |
| `visual-regression.md` | **The rendered-output floor** — how `ui vr diff`/`gate`/`accept` catch visual changes a code diff can't (a token tweak that moved every button, a deleted shadow). The constitutional split (binary compares, host renders), why the #1 flake source is *render environment* not the algorithm (pin baseline + gate to the same font stack), the pixelmatch + anti-aliasing + mask defence, and the LAND-time gate workflow (render → gate → deliberately `accept` intended changes). Read when setting up a VR gate or reasoning about screenshot flake. VR guards *change*, not *quality*. |
| `accessibility.md` | **The two-tier a11y model — honesty-first** — tier 1 STATIC (`ui a11y-lint`, `ui ds a11y`: source AST + declared token pairs, free/every build) vs tier 2 RENDERED (the optional `a11y-audit` workspace, axe-core over live Chrome: computed contrast, ARIA-in-context, review gates). What each tier CAN and CANNOT prove, the manual-judgment residue (focus-visibility quality, reading-order sense, alt-text *quality*, motion honoured in practice), when to run which, and the non-negotiable never-claim-"compliant"/"accessible" wording rule. Read when reasoning about accessibility or adding an a11y check. |
| `content-design.md` | **Voice, tone & the microcopy floor** — voice vs tone (voice dimensions + the non-tunable voice constants), the tone-by-situation matrix (the load-bearing artefact; humour/enthusiasm track inversely to user stress), the error-message standard (NN/g + WCAG 3.3.1/3.3.3), i18n-readiness rules, and the deterministic `ui content-lint` floor (lorem-ipsum · placeholder-copy · placeholder-name · click-here-link · error-code-alone · exclamation-overload · insensitive-terms · plural-s-hack · text-in-image · all-caps-shout). Read when writing UI copy or scoring content; the curator scores tone-cell conformance, never free-form copyediting. |
| `design-soul.md` | **The declared design stance** — `design/soul.md` (owner-ratified Never / Always / Voice) and its place in the precedence chain (`brief > soul > memory prior > knowledge floors`); how to write clauses that stay short, sharp, and measurable; evidence-cited extraction via `/ui:learn`; and the deterministic structure floor `ui ds soul check` (soul-missing-section · soul-empty-section · soul-placeholder-copy · soul-draft-status · soul-scaffold-untouched · soul-too-long). Declared ≠ learned: the soul outranks the memory prior and never overrides the explicit brief or the a11y floors. Read when declaring, extracting, or checking a project's stance. |
| `librarian-loop.md` | **The graduation procedure the librarian runs** — the veto chain (collect → assess → recurrence gate → draft → self-check → judge → PR → human merge), each stop naming one of 8 reason codes; the deterministic `design-os librarian collect` step, the post-merge-only insight rule (§1b: an `insight` marks a gap resolved ONLY after its PR merges; a closed PR is `pr_abandoned`), the one-active-run rule, and the semantic-not-keyword assessment floor. Read when running the librarian. |
| `design-agents.md` | **Soul-bound, task-scoped project agents** — what a design agent is, the role-first naming with a genealogy suffix (studio soul `name:` × project → `designer-jang-vsf-pcp`), the first three roles and their hard boundaries (designer never self-scores · curator never edits · figma-hand never simulates), runtime-read identity (agents read `ui ds context`, soul text is never baked), the opt-in roster (`ui agents init|list|check`), and the stale-drift check. Claude Code only for now. Read when generating or auditing a project's agent roster. |
| `page-structures.md` | **Shape before dress — the page-composition layer between persona and code.** The macrostructure catalog (21 named page shapes — pick one shape, not six loose axes), the diversification rule + the variety↔conformance switch (resist the default-attractor), honest-copy rules (no fabricated evidence), the six-axis pre-emit self-critique, and the nav/footer/hero "AI tells" (with pointers to the `taste-lint`/`layout-lint` checkIds that catch the machine-detectable ones). Read when shaping a standalone landing / marketing / docs surface or a custom `ds preview` chrome — NOT for a single component. |
| `prompt-modes.md` | The replicate / enhance / adapt strategy modifiers for reference-driven generation. |
| `delivery-assets.md` | **Resolve reproduced images to originals, never screenshot crops** — the best→last-resort resolution ladder (inline-SVG logo → harvested site-served raster → sprite slice → screenshot-crop LAST RESORT, art-only), the machine floor (the deterministic `avoidable-screenshot-crop` lint in `ui validate-layout` + the host-model resolution workflow that fills `real/` and emits `ASSET-MAP.json` provenance), and the failure modes (crop-includes-text · screenshot-as-hero · missing-DPR · provenance-loss). Read when rebuilding / cloning / design-from-URL off a probed source with a mirror + asset harvest — NOT for a from-scratch generative design. |
| `ux-psychology.md` | UX laws (Hick's, Fitts', Miller's, …), Gestalt perception, cognitive biases, emotional design, trust building, cognitive-load management, ethical persuasion — with per-law application rules and a final audit checklist. Read selectively: only the law(s) a brief triggers. |
| `benchmarks/*.dna.json` | SOURCE-grade measured DNA (type ramps, surfaces, shadows, gaps) of 8 ship-grade products — Arc, Figma, Framer, Linear, Notion, Raycast, Stripe, Vercel. Calibration data for the excellence-tier reference duel; see `benchmarks/README.md`. |
| `figma-craft/workflow-experience.md` | The **interaction + cost brain** above the Figma verbs — the intent router (intent/drop → job → verb, incl. the multi-URL/image reference-drop row), the uniform job lifecycle (REFERENCE→SCOPE→PLAN→BUILD→SEE→ITERATE→LAND), reference intake (subagent-isolated DNA extract → cache in `<project>/references/` → deterministic synth), the "eyes" feedback contract, trust/clone-safety, progressive disclosure, and the zero-token-`ui`-binary cost contract. Read FIRST when routing a plain-language Figma job; every `/ui:*` Figma verb follows it. |
| `figma-craft/figma-craft.md` | The senior-designer construction brain for **authoring idiomatic Figma** — craft philosophy, a decision ladder, build workflows, and the L1–L19 construction lints. Deep-dives live in `figma-craft/{layout-mastery,components-variables-styles,structure-hygiene,visual-craft,intent-recipes,canvas-operations,code-connect}.md` (`canvas-operations` = operating on an existing/team-owned file: rebuild against a live library, audit + normalize, idempotent re-run). Used by `/ui:to-figma` and `/ui:audit`. |
| `figma-craft/component-design.md` | The **design brain for a single component** — the four things to decide when designing one from a requirement: ① anatomy (slots) · ② variant axes (size/tone/density/icon/orientation) · ③ states (default→hover→focus→pressed→disabled→loading→selected→error→…→skeleton, consider-each-include-the-applicable) · ④ edge cases (long/empty text, number & count extremes, missing image, i18n/RTL, min/max width, null data, keyboard/touch) · ⑤ create-new-vs-extend-existing (registry-first) + register/update + the specimen contract (`ui ds specimen`) · lifecycle status draft→beta→stable (stable gap = gating error) · the foundations→components→blocks tiers. Used by `/ui:design` (component scope). |
| `figma-craft/code-connect.md` | Mapping Figma components to code via Code Connect — what it is, that **authoring/publishing `.figma.tsx` templates needs an Org/Enterprise seat** (a hard gap on Figma Free), but the **discovery half — resolving component keys + prop mappings by reading `*.figma.tsx` next to component source — works on any seat**. Read when a repo already ships Code Connect templates or a design↔code mapping is needed. |
| `figma-craft/facet-model.md` | The **composition brain** — how ANY design job decomposes into 7 FACETS (intent/goal · requirements · IA/flow · layout · style · content · behavior) + 5 cross-cutting LAYERS (audience · tone · constraints · accessibility · states) each BOUND to a SOURCE (provided input tagged by role > project DS > persona/knowledge > data > AI judgment), with the binding-matrix + show-to-confirm + single-facet-regenerate UX and cheap per-facet extraction. Read when a designer designs something new from mixed inputs (Figma link=style, image=content, user-story=requirements). Used by `/ui:design`. |
| `figma-craft/curator.md` | The **two-axis quality gate** every design passes in SEE — TASTE (`critique.md` + `taste-rubric.md` 7 axes) + GOAL/SPEC (acceptance-criteria coverage via `ui critique-coverage`, goal-plausibility vs `ux-psychology.md` incl. honest-persuasion, accessibility gate + `ui ds a11y` paired mode + DS-standard conformance (specimen clean, status honesty), adversarial refuter). Honest verdict → iterate the worst finding; each verdict seeds a learned `insight`. |
| `figma-agent-hand.md` | How to drive the `figma-agent` CLI (the Figma "hands"). An optional **in-repo** hand — like the `ui` binary it runs over Bash, but it is NOT part of ease-design's deterministic binary; it ships as an npm workspace at `figma-agent/` (build once with `npm run build --workspace=figma-agent`) and needs its Figma plugin loaded. |
| `designmd-format.md` | **The DESIGN.md contract** (Google Labs alpha) — the pinned on-disk spec for the `DESIGN.md` file the host model writes at project root: the YAML front-matter token schema + the exactly-8-sections-in-fixed-order Markdown body, both halves required. Read instead of refetching upstream; the `ui designmd` toolchain (extract-tokens/snapshot/audit) gates against it. |
| `recall-mind.md` | How to drive the `recall` CLI (the semantic **"mind"** over the design memory). Another optional in-repo workspace (`recall/`, Node ≥ 22, local ONNX embeddings): `recall index` embeds the ledger corpus (+ this knowledge core) into a rebuildable `*.vec.db`; `recall query … --out ids.json` hybrid-ranks it (RRF × half-life decay × supersession) and feeds `ui memory context --rank-file`. The ledger stays truth; the `ui` binary never imports any of it. |

## Task → files

**Writing or editing a knowledge file** — `authoring-standard.md`: the file frame,
constraint-language rules, provenance grammar, and quarantine rules `ui knowledge check`
enforces.

**Generate a design from an intent**
1. `persona-index.md` — auto-select personas from the intent
2. `personas/<family>.md` — load the full DNA of each chosen persona
3. `mode-constraints.md` — apply the UI mode's constraints + `TECHNICAL_RULES`
4. `taste-rubric.md` — score the result; refine the failing axes

**Establish / compile a design system**
- `token-taxonomy.md` — token tiers and immutability rules
- `color-science.md` — palette generation and contrast

**Critique or score a generation** — `taste-rubric.md` (all 7 axes; the Consistency axis grades against `token-taxonomy.md`). For ship-grade briefs, add § "The Excellence Tier" + the `benchmarks/` DNA for the reference duel.

**Design heavy choice architecture (forms, pricing, funnels, dense nav)** — `ux-psychology.md`, only the law(s) the brief triggers

**Build a specific component** — `component-catalog.md`

**Generate from a reference (image or existing design)** — `prompt-modes.md` to pick
replicate / enhance / adapt, then the generate flow above

**Rebuilding / cloning from a source** (design-from-URL, clone-adapt off a probed site) —
`delivery-assets.md`: resolve every reproduced image to the original the source serves
(inline-SVG → harvested raster → sprite slice → crop last resort), enforced by the
`avoidable-screenshot-crop` lint

**Make a color decision** — `color-science.md`

**Add or fix animation** — `motion-craft.md` (ladder + floors), then `taste-rubric.md`
Motion axis for grading

**Run a Figma job / route a plain-language intent** (any `/ui:*` Figma verb, or a bare description / dropped references)
1. `figma-craft/workflow-experience.md` — the intent router (intent/drop → job → verb), the
   uniform lifecycle, reference intake, the "eyes" + trust contracts, and the cost contract
2. Then the routed verb's own template + the "Author idiomatic Figma from intent" route below

**Design a screen / component from a requirement** (`/ui:design`)
1. `figma-craft/workflow-experience.md` — the lifecycle + cost contract the flow parameterizes
2. **Screen scope:** `ux-psychology.md` (only the law(s) the brief triggers) + `mode-constraints.md`
   (the UI mode) + `persona-index.md` for IA and best-practice, then compose from real DS instances
   (`figma-craft/intent-recipes.md` Recipe 18) grounded in the project's `CONVENTIONS.md`
3. **Component scope:** `figma-craft/component-design.md` — anatomy → variants → states → edge cases →
   create-new-vs-extend-existing (registry-first), then the states board (Recipe 17)

**Author idiomatic Figma from intent** (`/ui:to-figma`)
1. `figma-agent-hand.md` — confirm the external hand is set up and live
2. `figma-craft/figma-craft.md` — the construction brain + decision ladder
3. `figma-craft/<reference>.md` — the one deep-dive the current step needs
4. `taste-rubric.md` — critique the exported PNG; refine the failing axes

**Onboard an existing project** (`/ui:learn`) — `ui scan` routes into the `extract.md`
flow, which draws on `token-taxonomy.md` + `color-science.md`

**Ask why a decision was made** — `/ui:why` (reads the design memory; no knowledge file needed).

**Recall the most relevant past knowledge before designing** — `recall-mind.md`: `recall query`
the project (or cross-project) index, then prime the prior with
`ui memory context --rank-file ids.json`. Optional; the binary works without it.

## Relationship to the `ui` binary

These files hold *design knowledge and reasoning*. Deterministic work — color math, token
compilation, layout validation, autofix, the component registry — is the `ui` binary's job.
When a knowledge file says the binary computes something, shell out to `ui` rather than
doing the math in-context.
