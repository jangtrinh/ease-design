# Controlled three-way comparison

## Status

Provisional maker-scored evidence. This is not blind evaluation and cannot by itself promote the
orchestrator to the default workflow.

## Controlled variables

- Same three cases and approved content.
- Same design lab runtime and component foundations.
- Workflows: raw, prompt enhancement only, full orchestration.
- Canonical widths: 390 and 1440 pixels.
- Reduced motion during full-page capture so every region is visible.
- Screenshots: `renders/controlled-comparison/`.

The first full-page capture attempt left below-fold reveal elements hidden because the page was
not scrolled. Those images were rejected and replaced with reduced-motion captures plus a
visibility override. They are not used as evidence.

## Provisional result

| Case | Raw average | Enhanced average | Orchestrated average | Lift vs raw |
|---|---:|---:|---:|---:|
| D01 Architecture | 5.04 | 5.54 | 8.34 | +3.30 |
| D02 Nutrition | 5.50 | 6.04 | 8.26 | +2.76 |
| D03 Planning | 4.78 | 5.46 | 8.32 | +3.54 |

The full region scores live in `controlled-three-way-scorecard.json`.

## What changed

Raw and enhanced outputs improve the top section but reuse generic section shells, leave large
areas without meaningful visual evidence, and collapse toward a low-investment conclusion.

Full orchestration changes the page architecture:

- every region has a narrative job and distinct composition;
- image prompts are planned from aspect ratio and focal-safe requirements;
- generated imagery supplies material, food, human, or environmental evidence;
- product state remains live HTML rather than a generated fake screenshot;
- the hero demonstration must contain enough hierarchy and consequence to earn its area;
- the conclusion receives its own conversion composition and visual investment.

## Current conclusion

The test supports the orchestration hypothesis across architecture, consumer product, and B2B
SaaS. Prompt enhancement alone does not prevent depth-quality decay. The largest measured lift
comes from region architecture plus planned visual evidence, not from longer hero copy.

## Promotion boundary

Next, provide the raw brief, acceptance criteria, screenshots, and rubric to an independent blind
curator without workflow labels. Repeat each workflow at least three times per case. Promote only
if orchestration wins consistently by the agreed margin without raising critical accessibility,
responsive, performance, or truthfulness failures.

## Independent blind curation

Completed after the provisional maker pass. The curator received only anonymous A/B/C renders at
390 and 1440 pixels, the case briefs, and a fixed ten-axis rubric. Workflow identities were
revealed only after the report and JSON scorecard existed.

| Case | Blind winner | Revealed workflow | Mean | Runner-up mean |
|---|---|---|---:|---:|
| D01 Architecture | B | Orchestrated | 8.9 | 7.4 |
| D02 Nutrition | B | Orchestrated | 8.8 | 7.4 |
| D03 Planning | A | Orchestrated | 9.0 | 6.6 |

The orchestrated workflow won all three categories with no critical visual failures. Curator
confidence was 0.91-0.97 per case. The mean blind lift over the non-orchestrated candidates was
1.77 points.

This passed the first independent-category gate. The later orchestrated-only repeatability study
completed three fresh generations per case and scored 8.96/10 with 0.25 population standard
deviation. It passed the blind visual thresholds but did not earn an unguarded production-default
verdict because deterministic audit found two mobile overflow failures and repeated binary-rule
misses. See `repeatability-study/result.md`.
