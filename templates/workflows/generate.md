---
description: "Generate an evidence-qualified marketing or landing-page design. Use when the user asks to create UI from a plain-language request or visual reference."
---

# Workflow: generate

`/ui:generate "<intent>"` compiles weak intent into typed contracts, generates one deliberate
candidate, and delivers it by qualification status. Read `knowledge/qualified-delivery.md` first.

## Inputs

- `<intent>` required; preserve it verbatim.
- `--mode` optional. Spec 014 P0 qualifies `desktop` marketing/landing surfaces only.
- `--brand-hex`, `--industry`, and `--persona` remain optional DS/style constraints.
- `--count` is accepted for compatibility, but delivery count is subordinate to qualification.

## 1. Compile intent

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

## 3. Choose a direction

Create three direction cards in scratch. Each must differ in product thesis, structure, focal
mechanism, and signature device. Reject cosmetic-only variants. Select one direction using brief
fit and risk; do not ask the user to discover obvious quality failures by eye.

Write `generation-contract.json` matching `schemas/generation-contract.schema.json`, including:

- selected direction;
- content sections and required states;
- canonical `1440`, `768`, and `390` viewports;
- all six required static gates;
- `html` output.

```sh
ui delivery validate generation-contract.json --json
```

Do not generate while the contract has errors.

## 4. Generate one candidate

Read:

- the selected persona family only;
- `knowledge/mode-constraints.md` universal guide + desktop section;
- `knowledge/taste-rubric.md`;
- relevant page structure and signature-device entries.

Generate one self-contained HTML candidate from the brief, selected direction, DS context, memory
prior, mode floor, and output contract. Use realistic content without unsupported claims.

Normalize:

```sh
ui strip-fences candidate.raw.html > candidate.html
ui autofix candidate.html --write
```

## 5. Run correctness gates

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

## 6. Render evidence

When available:

```sh
page-shot candidate.html --out evidence/1440 --width 1440
page-shot candidate.html --out evidence/768 --width 768
page-shot candidate.html --out evidence/390 --width 390
a11y-audit candidate.html --tags wcag2a,wcag2aa,wcag21aa --json
```

Record screenshots, viewports, gate envelopes, artifact fingerprint, and declared states. If
rendered hands are unavailable, status cannot be `QUALIFIED`.

## 7. Independent qualification

Give the curator the brief, contract, rendered evidence, criteria coverage, benchmark traits, and
gate results. Do not include the maker's private rationale.

Judge:

1. Must acceptance-criteria coverage;
2. craft against `knowledge/taste-rubric.md`;
3. product specificity and signature;
4. responsive evidence;
5. unsupported content.

Write `qualification-record.json` matching `schemas/qualification-record.schema.json`, then:

```sh
ui delivery validate qualification-record.json --json
```

## 8. Targeted repair

For `DRAFT_WITH_CONCERNS`, return only the worst evidence-backed finding. Make one targeted repair,
rerun all affected gates and all canonical renders, and create the next immutable qualification
record. Maximum three attempts. Stop earlier when the same failure repeats twice, repair violates
a higher constraint, or evidence blocks a responsible decision.

## 9. Deliver by status

- `QUALIFIED`: present as delivery-grade with evidence and manual residue.
- `DRAFT_WITH_CONCERNS`: show named unresolved failures; never label complete.
- `BLOCKED_BY_EVIDENCE`: ask for the missing product truth or decision.

After qualified HTML is integrated into real source, Spec 013 code intake is the downstream gate.
