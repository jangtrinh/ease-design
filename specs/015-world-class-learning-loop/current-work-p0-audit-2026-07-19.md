# P0 Audit Against Current Benchmark Work

**Date:** 2026-07-19
**Artifacts:** historical D01 architecture, D02 nutrition, D03 SaaS planning
**Verdict:** not valid world-class learning evidence; fresh controlled runs required

## What passed

- All three historical applications compile as production builds.
- Each preserves a brief, one prose direction note, qualification notes, and prior desktop/mobile
  inspection claims.
- Product-specific content and composition are stronger than starter output.

## Contract coverage

| P0 requirement                              | D01               | D02           | D03           |
| ------------------------------------------- | ----------------- | ------------- | ------------- |
| Raw/enhanced/qualified/art-directed quartet | Missing           | Missing       | Missing       |
| Blind evaluator record                      | Missing           | Missing       | Missing       |
| Typed Design Read                           | Partial prose     | Partial prose | Partial prose |
| Three independent dials                     | Missing           | Missing       | Missing       |
| Declared major sections                     | Missing           | Missing       | Missing       |
| Visual board per major section              | Missing           | Missing       | Missing       |
| Board selection/reroll evidence             | Alternatives only | Minimal prose | Minimal prose |
| Board-to-code fidelity map                  | Missing           | Missing       | Missing       |
| Six-axis identity signature                 | Missing           | Missing       | Missing       |
| Recent-case convergence analysis            | Missing           | Missing       | Missing       |
| Production/rejected asset manifest          | Missing           | Missing       | Missing       |

The existing `direction-board.md` files are prose choices, not rendered horizontal section boards.
They cannot prove section composition, palette placement, type ratios, spatial cadence, or
board-to-code fidelity.

## Current implementation defects

| Finding                                           | Evidence                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Interface glyphs violate Phosphor rule            | D01 uses `↗`; D02 uses text glyphs throughout navigation and controls; D03 uses `↗`                                                    |
| Motion floor is not exercised                     | D02 and D03 contain no animation, transition, or reduced-motion source; D01 has hover transitions but no ambient/scroll/loading motion |
| Custom-control behavior is not exercised          | No select, combobox, listbox, menu, or equivalent stateful selection control in D01–D03                                                |
| Loading/default-state behavior is not exercised   | No content-loading state, stable skeleton transition, empty state, or error state                                                      |
| Test harness is stale                             | Each experiment runs two starter-era tests; both fail because `codex-preview` and `_sites-preview/SkeletonPreview.tsx` no longer exist |
| D03 navigation points to absent sections          | `#method`, `#teams`, `#pricing`, and `#login` are linked but not implemented as matching sections                                      |
| D02 is a static showcase, not an interaction test | Screen controls render as inert server markup and cannot demonstrate scan/filter behavior                                              |

## Test execution

- D01 build: pass; experiment tests: 0/2 pass.
- D02 build: pass; experiment tests: 0/2 pass.
- D03 build: pass; experiment tests: 0/2 pass.
- ease-design P0 validator fixture: pass.
- ease-design repository: typecheck, lint, build, and full tests pass.

The experiment failures are harness defects, not proof that the pages fail to render. They still
block trustworthy automated benchmark execution.

## Decision

Do not assign blind ceiling scores, compare winners, or promote a lesson. Historical artifacts
cannot be relabelled into missing variants. The next valid test must create fresh D01–D03
quartets under frozen controls.
