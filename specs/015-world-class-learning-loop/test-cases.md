# World-Class Learning Loop — Test Cases

| ID    | Mutation                                                    | Expected                                                |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------- |
| WL-01 | Controlled raw/enhanced/qualified/art-directed trial        | Pass                                                    |
| WL-02 | Art-directed variant absent                                 | `missing-comparison-variant`                            |
| WL-03 | Blind evaluation false                                      | `uncontrolled-learning-trial`                           |
| WL-04 | Evaluator evidence absent                                   | `uncontrolled-learning-trial`                           |
| WL-05 | Duplicate case IDs                                          | `duplicate-learning-case`                               |
| WL-06 | One-case lesson marked promoted                             | `premature-learning-promotion`                          |
| WL-07 | Expert-approved lesson with durable reference               | Pass                                                    |
| WL-08 | Three winning cases across two categories                   | Pass                                                    |
| WL-09 | Promoted evidence contains an art-directed critical failure | `premature-learning-promotion`                          |
| WL-10 | Art-directed variant lacks section boards                   | `missing-section-boards`                                |
| WL-11 | Variant lacks one or more identity axes                     | `missing-identity-signature`                            |
| WL-12 | Design Read or valid 1–10 dial absent                       | `missing-art-direction-contract`                        |
| WL-13 | Board omits rationale, decision, or anchor                  | `missing-section-board-evidence`                        |
| WL-14 | Section IDs or board references repeat                      | `duplicate-section-board`                               |
| WL-15 | Board-to-code fidelity evidence is incomplete               | `missing-board-fidelity-evidence`                       |
| WL-16 | Production asset omits local reference or usage             | `invalid-asset-manifest`                                |
| WL-17 | Repeated identity defaults lack justification               | `unjustified-default-convergence`                       |
| WL-18 | Repeated identity axes have project evidence                | Pass                                                    |
| WL-19 | Major sections, board entries, and board refs differ        | `section-board-coverage-mismatch`                       |
| WL-20 | Placeholder or duplicate production asset                   | `invalid-asset-manifest` / `duplicate-production-asset` |

## Manual benchmark gate

The automated contract is complete when WL-01–WL-20 pass. Product calibration remains open until
fresh D01–D03 runs produce four preserved variants, randomized labels, evaluator scorecards, and
at least one evidence-backed lesson. Each art-directed run also preserves its Design Read/dials,
board decisions, fidelity map, convergence analysis, and asset manifest. Historical Case 04 is
not blind and cannot satisfy this gate.
