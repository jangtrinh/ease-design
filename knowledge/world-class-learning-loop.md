# World-Class Learning Loop

Read this after `qualified-delivery.md`. Qualification establishes the delivery floor. This loop
raises the ceiling and turns successful art direction into reusable, evidence-backed knowledge.

## Meaning of world-class

`world-class` is not a style, a single score, or a claim made by the generator. It is a comparative
judgment: the artifact clears every critical floor, exhibits exceptional ceiling traits, and wins
under blinded evaluation against controlled alternatives and relevant references.

Keep two ledgers separate:

- **floor:** correctness, accessibility, responsiveness, provenance, performance, semantics;
- **ceiling:** originality, hierarchy, composition, emotional impact, motion craft, responsive
  art direction, and reference fidelity.

A ceiling score never cancels a floor failure.

## Controlled variants

For each orchestration benchmark, preserve:

1. `raw` — the user's request without enhancement;
2. `enhanced` — improved prose only;
3. `qualified` — Qualified Delivery v2 through its first valid qualification;
4. `orchestrated-content-led` — the validated prompt plan using its content-led proportions;
5. `orchestrated-golden` — the same plan with only the golden proportion strategy changed;
6. `orchestrated-selected` — the independently selected proportion result;
7. `art-directed` — the selected artifact after rendered critique and targeted refinement.

ALLOWED: keep the original four-way set for historical comparisons. NOT ALLOWED: call it an
orchestration test, because it cannot isolate prompt compilation or proportion selection.

Hold model/runtime, evidence, framework, time budget, viewports, and evaluator rubric constant.
Randomize labels before judgment. The curator must not see workflow labels or maker rationale.

## Art-direction loop

```text
qualify → generate → render → compare → critique → revise → verify → extract → promote
```

Run at most three revisions. Each revision targets the single highest-leverage ceiling weakness
that can improve without violating a floor. Preserve every attempt and its rendered evidence.
Stop when:

- the curator finds no material ceiling weakness;
- the last revision produces no measurable improvement;
- the same weakness repeats twice;
- a floor regresses;
- evidence or a product decision is missing.

## Section-board probe

Write the art-direction contract before generating boards:

```text
Design Read = page kind · audience · vibe · system/family
design variance = 1–10
motion intensity = 1–10
visual density = 1–10
```

The dials are independent. A visually bold page can remain low-density; a restrained product can
still use purposeful motion. Values describe intent and evaluation context, not guaranteed quality.

For art-directed benchmark variants, create one horizontal reference board per major section
before revising code. A board specifies composition, hierarchy, spacing logic, asset treatment,
and palette placement. It is not a source of invented product claims or navigation.

Declare the major section IDs first. For each board, retain its section ID, evidence reference,
selection rationale, accepted/rerolled decision, and composition anchor. The declared sections,
board entries, and board references must match exactly. Duplicate board references or generic
boards reused across sections are invalid evidence.

At implementation time, inspect each board again and record what the code preserved:

- text hierarchy and line behavior;
- spacing ratios and cadence;
- palette and image-grade logic;
- component and shape language;
- repeated motifs carrying the composition thesis.

The fidelity record cites typography, spacing, palette, component, motif, and rendered-output
evidence. Evaluator claims about fidelity must resolve to both a board and a rendered artifact.

When a detail is unclear, preserve visible language and spacing before choosing the easiest
implementation. Never collapse a distinctive board into a generic row.

### Topic-layout coupling probe

For each rendered section, ask:

1. What job does this section perform in the page narrative?
2. Which content property determined its layout?
3. Would the composition still make equal sense with another section's copy?
4. Is any repeated layout justified by the product or design system?

If the answer to question 3 is yes and question 4 has no evidence, record
`same-layout-different-copy`. It is a product-level failure, not a request for cosmetic polish.
Feed the failing case into the generation-contract regression suite before revising the sample.

Record six identity axes for every comparison artifact:

```text
palette family · type pairing · hero architecture
signature technique · CTA garment · shape language
```

These axes make convergence observable. Do not mechanically force difference: project evidence
and the brief still outrank novelty. Test anti-convergence as a candidate taste pattern before
promoting it.

Compare the axes with recent relevant cases. Repeated axes are acceptable only when the record
names them and cites a project or brand reason. Unexplained repetition is default convergence;
difference for its own sake is not the remedy.

## Asset-kit evidence

Record every production and rejected visual asset with:

```text
ID · role · source type/reference · local reference · status
palette/grade family · sections where used
```

Production assets need a local reference and at least one real use. Rejected attempts remain in
the evidence ledger but must not be shipped in the production asset set. This distinguishes
coherent selection from accidental first-output acceptance.

## Learning classes

- **hard-rule:** invariant safety or delivery constraint. Explicit user rules may be promoted
  with a durable approval reference.
- **taste-pattern:** a reusable visual preference that wins across categories.
- **contextual-recipe:** a pattern scoped to a product type, audience, or surface.

Statuses:

```text
hypothesis → candidate → promoted
                       ↘ rejected
```

One case can create a hypothesis. Repetition creates a candidate. Promotion requires either:

- explicit expert approval with a durable reference; or
- wins in at least three controlled cases across at least two categories, where every
  art-directed artifact has zero critical failures and outperforms its qualified predecessor on
  the declared ceiling rubric.

Do not promote a color, layout, animation, or typography choice merely because it matches one
reference. Record the context that made it work.

## Artifact

Write `learning-record.json` matching `schemas/learning-record.schema.json`, then validate:

```sh
ui delivery validate learning-record.json --json
```

The deterministic validator checks controlled comparison coverage and promotion eligibility. It
does not decide whether a design is beautiful or whether an evaluator is credible.

## Research provenance

The section-board, identity-axis, concept-linked signature technique, and board-to-code anti-drift
probes were adapted from the MIT-licensed
[Higgsfield Websites references](https://github.com/higgsfield-ai/skills/tree/main/higgsfield-websites/references),
especially `reference-boards.md`, `image-to-code.md`, and `wow-catalog.md`. ease-design does not
adopt their provider-specific commands or conflicting universal aesthetic rules.

## Memory update

Promoted hard rules update the relevant generation contract. Promoted taste patterns and
contextual recipes enter design memory with evidence case IDs, scope, counterexamples, and rubric
version. Rejected lessons remain visible so later runs do not rediscover the same false pattern.
