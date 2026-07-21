# Generation Craft Defaults — Execution Report

**Date:** 2026-07-19
**Verdict:** RELEASE GATE NOT PASSED
**Reason:** no preserved artifact is a valid Qualified Delivery v2 candidate

## What was executed

### Engine and contract suite

- repository typecheck: pass;
- repository lint: pass;
- repository build: pass;
- repository tests: 2,186 passed, 4 skipped;
- knowledge governance: zero findings;
- v1 and v2 JSON schema fixtures: pass;
- valid v2 qualification resolved and cross-checked against its relative contract: pass;
- false-green v2 fixtures: rejected as expected.

This proves the deterministic contract implementation. It does not prove generated-design quality.

### Preserved experiment builds

Production builds succeeded for:

- raw-prompt creator-commerce variant;
- enhanced-prompt creator-commerce variant;
- historical qualified creator-commerce reference;
- historical architectural reference;
- historical mobile-nutrition reference;
- historical SaaS-planning reference.

### Live browser pilot

The raw, enhanced, and historical qualified creator-commerce variants were loaded together in a
real browser at `1316 × 855`.

| Observation | Raw | Enhanced | Historical qualified |
|---|---:|---:|---:|
| Horizontal overflow | none | none | none |
| Page height | 2,028 | 3,474 | 4,257 |
| Active CSS animations | 0 | 0 | 0 |
| Active CSS transitions | 0 | 0 | 0 |
| Reduced-motion rule found | no | no | no |
| Selection/custom controls | 0 | 0 | 0 |
| Images have intrinsic dimensions | yes | yes | yes |

Manual browser inspection confirms the enhanced and historical-qualified variants have stronger
hierarchy, content depth, and composition than raw. However, the historical qualified artifact
predates v2 and cannot be relabelled as the v2 C variant.

## Blocking findings

### E01 — No valid v2 C artifact

The historical qualified references have prose qualification notes, not:

- a version 2 generation contract;
- asset-policy evidence;
- responsive adaptation evidence at all three canonical widths;
- motion/loading/reduced-motion/JavaScript-failure captures;
- custom-control behavioral evidence;
- version 2 composition review.

Expected result: `missing-contract-evidence` or missing v2 evidence.
Release impact: blocking.

### E02 — Required motion is absent

Live computed-style inspection found no active animation or transition in the complete preserved
creator-commerce trio. The historical architectural reference contains a reduced-motion media
rule, but the nutrition and SaaS references contain no corresponding motion source signal.

This fails the requested defaults for:

- gentle hero background animation;
- scroll animation;
- smooth loading/default transition;
- reduced-motion evidence paired with actual motion.

Release impact: blocking.

### E03 — Asset-source defaults are not exercised

Source inspection found no Phosphor package/use and no SVGL provenance in the preserved reference
apps. Existing imagery can remain useful historical evidence, but it does not test the newly
implemented source policy.

Release impact: blocking.

### E04 — Custom-control behavior is not exercised

The live creator-commerce trio contains no select, combobox, listbox, or menu control. It cannot
test the custom-control contract.

Release impact: blocking for D02/D03 coverage.

### E05 — Experiment test harness is stale

The raw, enhanced, and historical qualified creator-commerce projects build successfully, but
their local test command fails two starter-era assertions:

1. expects a removed `codex-preview` development metadata marker;
2. expects the deleted `app/_sites-preview/SkeletonPreview.tsx`.

These failures do not identify product defects; they show that the experiment harness was not
updated after replacing the starter.

Release impact: blocks trustworthy automated experiment execution until repaired.

## Controlled comparison result

The available historical trio supports only this directional conclusion:

```text
raw < enhanced prompt < historical Qualified Delivery
```

for content depth, product specificity, and composition.

It does **not** answer whether:

```text
Qualified Delivery v2 + Generation Craft Defaults
```

beats the other variants, because that artifact does not yet exist.

No blind score is published. Scoring a historical C artifact as v2 would be false evidence.

## Release-gate decision

The gate requires C to win across D01–D03 with no P0 asset, responsive, interaction, motion,
accessibility, or performance failure.

Current outcome:

- highest median: not computable;
- wins in two of three cases: not computable;
- P0 regressions absent: not proven;
- v2 evidence complete: no.

**Decision: keep v2 unproven; do not claim world-class improvement yet.**

## Required remediation and rerun

1. Repair the experiment harness so it tests the finished page rather than the deleted starter.
2. Generate fresh A/B/C artifacts for D01, D02, and D03 from the frozen prompts.
3. For each new C artifact, create and validate real v2 contract and qualification JSON.
4. Ensure C exercises:
   - Phosphor icons;
   - SVGL logo provenance where applicable;
   - GPT Image 2 imagery where applicable;
   - responsive `390`, `768`, and `1440` adaptation;
   - hero, scroll, loading, reduced-motion, and JavaScript-failure behavior;
   - a custom selection control in D02 or D03.
5. Capture browser evidence and run blind scoring.
6. Reapply the release threshold without substituting historical qualification notes.
