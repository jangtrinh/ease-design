# Prompt-plan orchestration

## Purpose

Compile weak design requests into a typed, evidence-bound production strategy before generation.

## Mental model

The prompt plan is an intermediate representation, not a longer prompt:

```text
request + evidence -> product truth -> divergent directions -> region architecture
-> visual DNA -> proportion comparison -> preflight -> compact builder packet
```

The host model performs inference and qualitative comparison. The deterministic `ui` binary
validates coverage, provenance, divergence, safeguards, and readiness.

## When to use / when not

Use before generating a landing page, portfolio, editorial surface, redesign, product
application, dashboard, or admin surface. Use it when a reference image is present too; prompt
mode changes how evidence is interpreted, not whether orchestration happens.

Do not use it for a surgical edit whose layout and product truth are already established, because
recompiling the entire strategy would erase local intent. Route that work through iteration.

## Compile the plan

Write `prompt-plan.json` against `schemas/prompt-plan.schema.json`.

### Bind product truth

ALLOWED: bind every facet and cross-cutting layer to user, reference, project, knowledge, or an
explicit assumption with confidence.

NOT ALLOWED: resolve a decision-changing unknown with a low-confidence assumption, because the
result would optimize a product direction the user did not choose.

Define audience situation, desired change, primary outcome and action, available proof,
prohibited claims, decision-changing unknowns, and content inventory before visual direction.

### Preserve three real directions

Each direction defines structural thesis, focal mechanism, region rhythm, signature technique,
hero or workspace architecture, shape language, system fit, and execution/convergence risk.

ALLOWED: select the strongest direction while retaining the other two as inspectable alternatives.

NOT ALLOWED: submit palette swaps or cosmetic variants as directions, because they do not test a
different composition hypothesis.

### Give every region a production brief

Each major section or product region declares its purpose, narrative/task role, entry and exit
state, content/data dependency, layout, composition anchor, hierarchy event, alignment keylines,
content measure, grouping, interactions and states, responsive transformation, memorable detail,
anti-pattern, and craft investment.

Repeating a layout is ALLOWED when product behavior, content, or the established system requires
it and the plan records why. Same-layout-different-copy is NOT ALLOWED because it decouples
composition from meaning and produces depth-quality decay.

### Define visual DNA as implementation

Specify typography roles and scale, palette and accent lock, spacing cadence, grid, shape grammar,
depth/material, media grade, icon family and weight, controls, motion character, and theme.

Mood adjectives alone are NOT ALLOWED because they cannot constrain code or support evaluation.
Greenfield interface icons use Phosphor. Third-party logos use cached SVGL assets. Brownfield
exceptions cite project evidence.

### Invest imagery across the whole page

Treat every major region as a visual product, not only the hero. For each region, decide whether
its meaning needs photography, illustration, diagram, real product UI, typography, or deliberate
negative space. When a bespoke explanatory or material visual would otherwise become a CSS
rectangle, texture swatch, fake screenshot, or generic card, generate or source a section-specific
asset instead. Keep labels, icons, controls, and essential content as live interface elements.

ALLOWED: CSS gradients and patterns as atmosphere, loading treatment, or minor surface texture.

NOT ALLOWED: CSS texture as the primary proof of a real material, a div-built fake product image,
or an empty placeholder where imagery carries the section's argument.

Before generation, inventory image opportunities across hero, proof, process, feature, story,
conversion, and conclusion regions. Record subject, narrative job, aspect ratio, focal-safe area,
crop behavior, alt text, loading priority, and mobile transformation for every selected asset.
Do not force an image into a region whose meaning is better served by typography or interaction.
The rule is purposeful visual evidence throughout the page, not maximum image count.

For product-led heroes, the demonstration must earn its viewport area. A live component must show
enough product hierarchy, state, and consequence to explain the value proposition. A generated
image must supply context or evidence that cannot be communicated more truthfully as live UI.
Four generic boxes, an empty dotted canvas, a CSS texture swatch, or a static success state is a
placeholder-primary-visual and blocks delivery.

The hero headline, supporting copy, primary action, and complete primary demonstration must fit
the initial desktop viewport. On mobile, preserve the copy and action first, then stack the
demonstration without horizontal overflow or loss of its focal state.

### Compare proportion candidates

Always preserve `content-led` and `golden` candidates with identical content, assets, visual DNA,
regions, and surface constraints. Change only proportion strategy.

Golden ratio is ALLOWED as a testable composition hypothesis. It is NOT ALLOWED as a beauty
claim, universal grid, or responsive invariant because content minimums, readable measure, focal
safety, and reflow determine whether a ratio survives.

For the golden candidate:

- record every application, target, content rationale, and fallback;
- cap nesting and prominent applications per region at two;
- apply it to no more than 40% of major regions;
- release it when copy, controls, crops, or responsive flow fail;
- render canonical and intermediate widths before selection.

Compare hierarchy, grid coherence, scan path, topic/task coupling, responsive composure, readable
measure, and depth-quality consistency. Preserve both scorecards and the selection rationale.

### Compile the builder packet

Order the packet as:

1. role and outcome;
2. surface constraints and product truth;
3. selected direction and visual DNA;
4. region production briefs;
5. selected proportion plan;
6. assets, content, behavior, motion, responsive, and states;
7. negative constraints;
8. output and evidence requirements.

Keep it at or below 6,000 tokens. Remove rejected-direction prose first, then compress rationale
through decision references. Do not remove requirements, accessibility, state behavior,
responsive transformations, or region briefs because those are the builder's load-bearing input.

Validate before generation:

```sh
ui prompt-plan validate prompt-plan.json --json
ui prompt-plan preflight prompt-plan.json --json
```

Errors block generation. Contextual warnings require a recorded accept, override, or repair.

## Curator boundary

The independent curator receives the raw brief, acceptance criteria, rendered output, and rubric.
It does not receive direction labels, maker rationale, or workflow labels.

Every material finding names a rendered reference, region, prompt decision references, and a
cause: missing evidence, weak decision, implementation drift, taste preference, or floor
regression. This link makes repair target the orchestration decision rather than cosmetic symptoms.

## Failure modes

- **prompt-expansion** - the request becomes verbose prose without typed decisions. Observable:
  no provenance IDs or region contracts exist. Cure: compile the artifact before builder prose.
- **cosmetic-direction-set** - three candidates share structure and focal mechanism. Observable:
  only type, color, or copy differs. Cure: reject the set before selection.
- **phi-everywhere** - golden ratio appears across most regions or survives forced mobile reflow.
  Observable: cramped copy, unsafe crops, or arbitrary gaps. Cure: enforce coverage and release.
- **hero-only-investment** - later regions lack anchors, responsive transformations, or memorable
  details. Observable: region scores decline toward the footer. Cure: complete and score every
  production brief independently.
- **packet-amnesia** - compression removes states, accessibility, or section-specific layout.
  Observable: builder output falls back to generic cards or static success states. Cure: remove
  rejected rationale, never load-bearing constraints.
- **curator-contamination** - the evaluator sees workflow labels or maker rationale. Observable:
  preference cannot be treated as blind evidence. Cure: isolate evaluation inputs.
