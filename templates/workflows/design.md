---
description: "Design something NEW from a requirement, on the Figma canvas — a whole screen or a single component. Detects the scope and runs the matching discipline, driven by an understand-until-decision-ready loop. Use when the user says 'design a screen/page' or 'design a component', 'I want a new <X>', 'add a variant to <component>', or describes a UI to design from scratch (distinct from rebuilding an existing frame or auditing one)."
---

# Workflow — `/ui:design`

Design something **new from a requirement** on the Figma canvas. This is distinct from
rebuilding an existing frame (`/ui:to-figma` real-instance mode / clone) and from auditing one
(`/ui:audit`) — here there is no source to reproduce, only an intent to realize well.

A designer works at one of **two scopes**, and they are two different disciplines:

- **SCREEN** — an objective realized as a full surface: information architecture, a persona,
  best-practice layout, composed from real design-system instances.
- **COMPONENT** — one reusable element designed as a small system of its own: anatomy,
  variant axes, states, edge cases — then authored as a component SET and registered.

`/ui:design` detects the scope, runs an **understand-until-decision-ready** loop to reach a
brief cheaply, then runs the matching discipline. It COMPOSES existing capabilities; it adds no
new `ui` binary command — the understand-loop, the IA, and the variant-thinking are host
judgment; the deterministic bits (registry lookup, token compile, layout validation) reuse the
existing `ui` / `figma-agent` commands.

## Cost budget (state this to the user up front)

| Sub-step | Who | Cost |
|---|---|---|
| Scope detection + the understand-loop + IA / variant judgment | **model** | small, bounded — a few rounds of sharp questions, never a wall |
| Registry lookup by NAME, token compile, layout validation, slug/path | **`ui` / `figma-agent` binary** | 0 tokens, deterministic |
| Canvas build (instances / component SET / states board), batched | the hand (seat-adaptive bridge) | batched writes, one section/component per call |
| Reads | cheapest-first ladder: `get_metadata` → low-res screenshot → full only on demand | never a blind 25K `get_design_context` |
| SEE / critique rounds | model + minimal vision | capped ≤ 5 |

Bounded and surfaced (F0 Part B). Honor a user-set depth/budget; pick the cheapest path that
satisfies the intent.

## Bridge + prerequisites

This job builds on the canvas, so pick the write bridge once via the seat selector (never
hardcode) — `knowledge/figma-agent-hand.md` → "Bridge selection":

```bash
figma-agent seat        # → {seat, bridge, reason}; free → figma-agent CLI, paid → official Figma MCP
```

**Soul gate.** If `design/soul.md` exists, read it FIRST (it also appears as the
`soul` section of `ui ds context`). It is the project's declared stance. Precedence:
**brief > soul > memory prior > knowledge floors** — the soul biases every choice
below it and never overrides the explicit brief. Never propose choices that violate
a `## Never` clause; prefer choices that express `## Always`.

You also need the onboarded design system (C0) so a design reuses real vocabulary:
- **registry** — the component registry (`ui registry list --json` / `design/component-registry.json`).
- **tokens** — the DS token file (`ui ds context --format json` / the project DS).
- **conventions** — `CONVENTIONS.md` (C7 grammar) when composing a screen.

Read `knowledge/figma-craft/workflow-experience.md` first — the interaction + cost brain this verb
parameterizes — and `knowledge/figma-craft/facet-model.md` (the **composition brain**: how a design
decomposes into 7 FACETS + 5 cross-cutting LAYERS each bound to a SOURCE, and the binding-matrix UX
used in Step 2). For component scope, read `knowledge/figma-craft/component-design.md`. The SEE step
is gated by the CURATOR (`knowledge/figma-craft/curator.md` — taste + goal/spec).

## The lifecycle (the uniform F0 shape, parameterized for design)

This is the `knowledge/figma-craft/workflow-experience.md` lifecycle + cost contract
(REFERENCE→SCOPE→PLAN→BUILD→SEE→ITERATE→LAND, the "eyes" contract, determinism-first cost
rules) parameterized for designing something new. Read that doc for the shared rhythm; the
steps below are its `design` specialization.

### Step 1 — SCOPE (screen or component)

Decide the scope from the user's phrasing — the router is a rule, not model guesswork:

- **"a button / badge / input / card / chip / component"**, "add a variant to <X>" → **COMPONENT**.
- **"a screen / page / view / dashboard"**, a whole-surface objective → **SCREEN**.
- **"a flow / journey / onboarding"**, or **"the screens for <user story / feature>"** → **FEATURE/FLOW**
  — the REQUIREMENTS facet drives a **coverage plan** (Step 2) that fans out to N screens/states; run the
  SCREEN discipline per screen, then lay them out (`intent-recipes.md` Recipe 19, flow layout).

If genuinely ambiguous, ask **ONE** cheap clarifying question — "the whole screen, just the `<X>`
component, or the flow for `<feature>`?" — not a wall. State the detected scope back so the user can
correct it in one word.

### Step 2 — UNDERSTAND (the understand-until-decision-ready loop)

Reach a decision-ready brief **cheaply**. Ask in **rounds** — a few sharp questions via
`AskUserQuestion` (degrade to plain numbered questions where the runtime has no picker), never
a wall. **Prefer proposing a sensible default to confirm** over open-ended asking (cost
contract: a confirmed default is one cheap turn; an open question is many). After each round,
self-check the **readiness gate** for the scope; ask another round ONLY if not yet
decision-ready; **stop the moment it is** — or the moment the user says "just go".

Readiness gates:

- **SCREEN:** objective · primary user + primary action · key content / data · UI mode ·
  constraints · success criteria.
- **COMPONENT:** the component's role · the specific case / variant needed · whether it already
  exists (registry) · which states / edge-cases are in scope.

Feed any priors first (precedence: explicit brief > references > `ui memory` > knowledge
floors) so you never ask what the project already knows.

**Build the binding matrix (`facet-model.md`).** Auto-tag each provided input to the FACET it
supplies — Figma link → STYLE/IA/LAYOUT, image → CONTENT (or STYLE-reference), user-story doc →
REQUIREMENTS, token set → STYLE, copy doc → CONTENT, data/schema → CONTENT. Bind every facet to its
highest-precedence source (input > project DS > persona/knowledge > AI judgment); the understand-loop
asks ONLY for facets that are underbound AND decision-critical. **SHOW the matrix to confirm before
building** ("STYLE ← your Figma · CONTENT ← the image · IA ← the Figma · motion ← DS default") so the
user corrects one line, not a wall. Offer **single-facet regenerate** during iterate (redo STYLE
only, keep CONTENT).

**Coverage plan (FEATURE/FLOW + any acceptance criteria).** When the brief carries a user story /
acceptance criteria, map each criterion → the screen(s)/state(s) that cover it BEFORE building so
nothing is missed. Emit a `spec.json` (`{acceptanceCriteria:[{id,text}], successMetrics}`); the
curator's `ui critique-coverage` checks the built design against it in SEE.

### Step 3a — SCREEN discipline

Design the whole surface as an information-architecture problem, then realize it from the DS.

1. **Objective → IA + best practice (model judgment).** From the brief, consult
   `knowledge/ux-psychology.md` for **only the law(s) the brief triggers** (Hick's for dense
   nav, Fitts' for primary actions, Miller's for grouping, …) and `knowledge/mode-constraints.md`
   for the UI mode's constraint set + `TECHNICAL_RULES`, plus the chosen **persona**
   (`persona-index.md` → the family DNA). Produce the IA: the sections, hierarchy, primary
   action, and content order — the PLAN, no writes yet.
2. **Compose from the DS (the hand).** Build the screen from **real component instances** of
   the onboarded DS (never flat frames) — `intent-recipes.md` **Recipe 18 (C6)** — grounded in
   the project's `CONVENTIONS.md` (**C7** grammar) for on-brand composition, on-token and
   on-grid. Wrapper frame first, one section per call (`workflow-experience.md` §2c). If a
   needed component doesn't exist, that sub-part is a **component-scope** job (Step 3b) — design
   it, then return to composing the screen.
3. **SEE (the eyes, owed after every mutation).** Export the changed region at the minimal
   scale, `Read`, and give the honest 2–3 lines: what changed, does it meet the objective,
   what's off — plus the PNG path. Assert the real font family (never default to Inter).
4. **ITERATE (the critique gate, C5).** Score against `taste-rubric.md`; refine the failing
   axes; capped rounds (≤5). An honest STOP beats a discounted "done".
5. **LAND.** Update `ui memory` with what was picked and why; register any NEW components the
   screen forced you to create (their rows); a one-line summary.

Never over-ask the visual style — propose a persona-grounded default and confirm.

### Step 3b — COMPONENT discipline

Design ONLY the component — never the surrounding screen. Walk
`knowledge/figma-craft/component-design.md` (anatomy → variants → states → edge cases).

1. **Registry lookup by NAME (deterministic — `ui`/figma-agent).** Resolve the component in the
   onboarded registry (C0) by NAME (ids drift, `canvas-operations.md` R2). Three outcomes:

   - **Not found → CREATE NEW.** Walk `component-design.md` ①→④ to decide the anatomy, the
     variant axes, the applicable states, and the edge cases it must survive. Then author a
     component **SET**: each variant a `COMPONENT`, `figma.combineAsVariants([...])` into a
     `COMPONENT_SET` with props for optional slots (`components-variables-styles.md` B1–B6) +
     **bind tokens** (fills / text / radius / spacing to semantic Variables, §3.4 — never raw
     hex). Lay out a **states board** (`intent-recipes.md` **Recipe 17 / C2**) to prove the
     grammar → SEE → critique → LAND + **register a new registry row**.
   - **Found but a needed variant / state / case is missing → EXTEND.** Add ONLY the missing
     variant to the existing set (combine the new child in, or add the prop) — **do not
     rebuild** — → SEE → critique → **update** the registry row.
   - **Found and it already covers the case → not a design job.** It's screen-scope **reuse**:
     instantiate the existing component (Recipe 18 / C6) with the right variant.

2. **Trust & safety.** New components / edits go to a scratch/Archive page or a clone by default
   (F0 §5); never mutate a team-owned master in place without asking.

## Inputs

- `<requirement>` — plain-language description of the screen or component to design.
- *(optional)* `--scope <screen|component>` — skip the Step-1 detection.
- *(optional)* references (URLs / images) — routed through REFERENCE intake first
  (`workflow-experience.md` §2b) to a reference brief, then this flow.
- *(optional)* `--budget <n>` — cap the understand-rounds / reads / critique rounds.

## Outputs

- **Text (always):** the detected scope, the brief reached, the IA (screen) or the component
  checklist (anatomy / variants / states / edge cases), and a one-line landing summary — the
  runtime-neutral floor.
- **PNG paths:** minimal captures of the built screen / component + its states board.
- The built artifact on the canvas (a scratch/clone page by default), plus any NEW registry
  rows the design created or updated.

## Quality gate

The design is not done until the **CURATOR** (`knowledge/figma-craft/curator.md`) passes BOTH axes:
- **TASTE** — the `taste-rubric.md` 7 axes via the critique gate (capped rounds); on-token / on-grid /
  composed from real instances (screen) or a registered SET with the applicable states + surviving edge
  cases (component).
- **GOAL/SPEC** — `ui critique-coverage <spec.json> <manifest.json>` reports 100% acceptance-criteria
  coverage (no uncovered), the design plausibly serves the success metric (judged vs `ux-psychology.md`,
  incl. **honest persuasion** — no dark patterns), the accessibility gate passes, and an adversarial
  refuter fails to break "it meets the goal".

And — for component scope — the **registry is updated** (a component the system doesn't know about isn't
landed). Each curator verdict seeds a learned `insight` (`ui memory record`). Honest STOP with what
remains beats a discounted "done".
