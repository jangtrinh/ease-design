---
description: "Generate an evidence-qualified marketing or landing-page design. Use when the user asks to create UI from a plain-language request or visual reference."
---

# Workflow: generate

`/ui:generate "<intent>"` compiles weak intent into a prompt plan and delivery contracts, generates one deliberate
candidate, and delivers it by qualification status. Read `knowledge/qualified-delivery.md` and
`knowledge/prompt-plan-orchestration.md` and `knowledge/generation-craft-defaults.md` first. For benchmark or learning runs, also read
`knowledge/world-class-learning-loop.md`.

## Inputs

- `<intent>` required; preserve it verbatim.
- `--mode` optional. Spec 014 P0 qualifies `desktop` marketing/landing surfaces only.
- `--brand-hex`, `--industry`, and `--persona` remain optional DS/style constraints.
- `--count` is accepted for compatibility, but delivery count is subordinate to qualification.

## 1. Compile intent into a prompt plan

Read only the relevant parts of:

- `knowledge/figma-craft/facet-model.md`;
- `knowledge/user-evidence.md` when claims or research are present;
- `knowledge/prompt-modes.md` when a visual reference is supplied.

Write `design-brief.json` matching `schemas/design-brief.schema.json`. Preserve the raw request,
tag every assumption with provenance and confidence, declare prohibited claims, and produce
evaluable Must criteria. Ask one focused question only for design-changing ambiguity.

```sh
ui delivery validate design-brief.json --json
```

Do not proceed while the brief has errors.

Compile `prompt-plan.json` matching `schemas/prompt-plan.schema.json`. Bind all facets and
cross-cutting layers to evidence, preserve exactly three structurally divergent directions, give
every major region a production brief, and define actionable visual-system DNA.

Always create a content-led and a golden proportion candidate. Render and compare them under the
same content, assets, visual DNA, regions, and viewports. Golden ratio is a candidate only; release
it when content, readability, crop safety, or responsive flow fails. Preserve both scorecards and
the selected rationale.

Compile a builder packet no larger than 6,000 tokens. Keep requirements, region briefs,
accessibility, states, and responsive behavior even when compressing.

```sh
ui prompt-plan validate prompt-plan.json --json
ui prompt-plan preflight prompt-plan.json --json
```

Do not select a direction or generate while either command reports an error.

## 2. Ground the project

Run `ui scan --json` and `ui ds status --json`.

- Brownfield without a learned DS: stop and route to `/ui:learn`, unless the user explicitly
  chooses a fresh direction.
- Greenfield without a DS: initialize from the highest-fit existing persona.
- Existing DS: reuse it.

Load:

```sh
ui ds context --strict --with-theme
ui memory context --for generate
```

Soul and evidence outrank memory. Memory is a weak prior.

## 3. Resolve the selected direction

Use the three preserved prompt-plan directions. Confirm the selected direction still has the best
brief fit after proportion comparison. Do not recreate or silently collapse the alternatives.

Write a version 2 `generation-contract.json` matching
`schemas/generation-contract.schema.json`, including:

- selected direction;
- content sections and required states;
- canonical `1440`, `768`, and `390` viewports;
- all six required static gates;
- Phosphor icon policy or an evidenced brownfield exception;
- project/SVGL/generated asset roles with provenance;
- responsive transformations at mobile, tablet, and desktop;
- hero ambient, scroll, loading, interaction, reduced-motion, and JavaScript-failure behavior;
- every selection control's semantic base, states, and keyboard/touch behavior;
- composition thesis, signature spatial move, whitespace strategy, and template avoidance;
- section architecture covering every section's purpose, narrative role, topic-derived layout
  model, composition anchor, content dependency, responsive transformation, and justified reuse;
- `html` output.

```sh
ui delivery validate generation-contract.json --json
```

Do not generate while the contract has errors.

## 4. Resolve assets

Resolve in order:

```text
project asset → approved source → generated asset → intentional no-image
```

- Greenfield interface icons use the official Phosphor package for the runtime.
- Existing brownfield icon systems win only with the contract's evidence reference.
- Resolve supported third-party marks from SVGL, cache the SVG locally, and record its URL.
- When an approved direction requires original imagery and no suitable asset exists, use the
  host's Codex image-generation capability backed by GPT Image 2. Generate artwork only; keep
  essential copy and controls as live HTML.

The `ui` binary never performs these network or model operations.

## 5. Generate one candidate

Read:

- the selected persona family only;
- `knowledge/mode-constraints.md` universal guide + desktop section;
- `knowledge/taste-rubric.md`;
- relevant page structure and signature-device entries.

Generate one self-contained HTML candidate from the validated builder packet, brief, selected direction, DS context, memory
prior, mode floor, and output contract. Use realistic content without unsupported claims. Build
semantic responsive structure before motion. Custom-style controls from the correct semantic
primitive; use custom behavior only when the contract declares and tests it.

Implement the declared section architecture, not a shared visual template with substituted copy.
Related sections may share tokens and motifs; their spatial model must follow their content job.

Normalize:

```sh
ui strip-fences candidate.raw.html > candidate.html
ui autofix candidate.html --write
```

## 6. Run correctness gates

Run every declared gate. A missing DS gate is a concern, not a pass.

```sh
ui validate-layout candidate.html
ui a11y-lint candidate.html
ui taste-lint candidate.html
ui content-lint candidate.html
ui ds-usage-lint candidate.html
ui ds a11y
```

No qualitative score is produced while an error-severity machine finding remains.

## 7. Render behavioral evidence

When available:

```sh
page-shot candidate.html --out evidence/1440 --width 1440
page-shot candidate.html --out evidence/768 --width 768
page-shot candidate.html --out evidence/390 --width 390
a11y-audit candidate.html --tags wcag2a,wcag2aa,wcag21aa --json
```

Record screenshots, viewports, gate envelopes, artifact fingerprint, and declared states. If
rendered hands are unavailable, status cannot be `QUALIFIED`.

Also capture:

- default hero and scroll motion;
- loading-to-content stability;
- `prefers-reduced-motion` behavior;
- essential content with JavaScript unavailable;
- keyboard and pointer operation for every custom behavioral control;
- open, disabled, loading, and error states where applicable.

## 8. Independent qualification

Give the curator the brief, contract, rendered evidence, criteria coverage, benchmark traits, and
gate results. Do not include the maker's private rationale.

Judge:

1. Must acceptance-criteria coverage;
2. craft against `knowledge/taste-rubric.md`;
3. product specificity and signature;
4. section topic fit, composition distinction, and content-layout coupling;
5. responsive evidence;
6. unsupported content.

Write a version 2 `qualification-record.json` matching
`schemas/qualification-record.schema.json`. It must reference the generation contract beside it
and record asset, responsive, motion, control, composition, and per-section rendered evidence.
Every material finding cites its rendered region and prompt-plan decision IDs, then classifies the
cause as missing evidence, weak decision, implementation drift, taste preference, or floor
regression.
A generic section that could accept another section's copy unchanged blocks qualification unless
the contract contains a valid repetition rationale. Then:

```sh
ui delivery validate qualification-record.json --json
```

## 9. Targeted repair

For `DRAFT_WITH_CONCERNS`, return only the worst evidence-backed finding. Make one targeted repair,
rerun all affected gates and all canonical renders, and create the next immutable qualification
record. Maximum three attempts. Stop earlier when the same failure repeats twice, repair violates
a higher constraint, or evidence blocks a responsible decision.

## 10. Deliver by status

- `QUALIFIED`: present as delivery-grade with evidence and manual residue.
- `DRAFT_WITH_CONCERNS`: show named unresolved failures; never label complete.
- `BLOCKED_BY_EVIDENCE`: ask for the missing product truth or decision.

After qualified HTML is integrated into real source, Spec 013 code intake is the downstream gate.

## 11. Art-direct the qualified artifact

When the task includes quality learning or asks to push the boundary, preserve the first qualified
artifact as the `qualified` control. Render it beside raw and enhanced controls with randomized
labels. Critique floor and ceiling separately.

Create an `art-directed` variant through at most three targeted revisions. Each revision addresses
the single highest-leverage ceiling weakness: originality, hierarchy, composition, emotional
impact, motion craft, responsive art direction, or reference fidelity.

Before the first revision, generate one horizontal reference board per major section with the
host's Codex image-generation capability. Keep the same thesis and visual grammar across boards
while varying section composition. Store boards as experiment evidence, not production assets.
Re-read each board while implementing and record the layout, spacing, palette, component, and
motif logic preserved in code.

Before generating boards, write:

- one Design Read: page kind, audience, vibe, and system/family;
- independent `1–10` values for design variance, motion intensity, and visual density.

Declare the major section IDs. For each board, retain section ID, board reference, selection
rationale, whether it was accepted or rerolled, and its composition anchor. Sections, board
entries, and references must match exactly. The fidelity record must cite typography, spacing,
palette, component, motif, and rendered-output evidence.

Maintain an asset manifest for production and rejected media. Record role, provenance, local
reference, palette/grade family, status, and actual section usage. Production assets without a
local reference or real use invalidate the art-directed record.

Record palette family, type pairing, hero architecture, signature technique, CTA garment, and
shape language for every variant. Use this identity signature to detect convergence across runs.
Compare these axes with recent relevant cases. Name every repeated axis and its evidence-backed
brand/project justification. Unexplained repeated defaults invalidate the art-directed record;
do not force arbitrary difference when evidence supports consistency.
Rerun every floor gate after every revision. A floor regression invalidates the revision.

Stop on no material weakness, no measurable improvement, the same weakness twice, a floor
regression, or missing evidence. Preserve all attempts.

## 12. Extract and promote learning

Write `learning-record.json` matching `schemas/learning-record.schema.json`. Preserve raw,
enhanced, qualified, orchestrated content-led, orchestrated golden, orchestrated selected, and
art-directed variants under controlled inputs and blinded evaluation. The current learning schema
records the historical four-way promotion subset; keep the orchestration comparison beside it
until a future schema version absorbs all variants.

Classify each lesson as a hard rule, taste pattern, or contextual recipe. A single benchmark
creates a hypothesis, not a universal rule. Promotion requires explicit expert approval or three
winning controlled cases across at least two categories.

```sh
ui delivery validate learning-record.json --json
```

Only promoted lessons update durable generation knowledge or design memory. Keep rejected lessons
as counterevidence.
