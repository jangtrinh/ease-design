# D01–D03 section-architecture findings

Date: 2026-07-19

## Why this exists

The benchmark initially changed palette, imagery, labels, and minor styling while preserving the
same hero, three-card system, decorative method line, and CTA structure. The pages passed static
floors but remained interchangeable. This exposed a missing Design:OS contract, not merely weak
sample execution.

## Case ledger

| Case | Topic property ignored | False composition | Required architecture |
|---|---|---|---|
| D01 Architecture | Site, material, section, orientation | Generic three-card feature row | Material field, measured annotation, spatial/elevation logic |
| D02 Nutrition | Scan, energy balance, daily sequence | Same feature cards and decorative timeline | Food focal object, balance/orbit signal, scan-to-choice progression |
| D03 Planning | Dependency, ownership, decision state | Same cards and decorative timeline | Connected nodes, explicit state, decision path with preserved context |

## Product lesson

`same-layout-different-copy` is a blocking generation failure. A section is topic-coupled only
when its spatial model follows a property of its content and would lose meaning if another
section's copy were substituted unchanged.

## Implemented controls

- `generation-contract` v2 now requires `sectionArchitecture`.
- Every declared section has purpose, narrative role, layout model, composition anchor, content
  dependency, and responsive transformation.
- Every section must be covered exactly once.
- Pages with three or more sections need at least two layout models.
- Repeated layout models require an explicit rationale.
- `qualification-record` v2 now requires per-section rendered review.
- `QUALIFIED` is blocked when topic fit, composition distinction, or content-layout coupling is
  not observed.

## Honest boundary

The deterministic validator can prove coverage, declared diversity, and evidence completeness.
It cannot determine whether a layout truly fits a topic. That judgment remains rendered curator
work, but the record can no longer omit or silently pass it.
