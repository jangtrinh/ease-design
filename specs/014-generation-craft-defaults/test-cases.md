# Generation Craft Defaults — Test Cases

## Purpose

Test whether Qualified Delivery v2 produces materially stronger generated design than:

- **A — raw prompt:** user request passed directly to generation;
- **B — enhanced prompt:** one improved prose prompt, no typed contracts or evidence gate;
- **C — craft defaults:** Qualified Delivery v2 contract, implementation workflow, behavioral
  evidence, and independent qualification.

This is a controlled product-quality test, not a model benchmark. The goal is to decide whether
v2 should become the default generation path.

## Controls

Hold constant for A, B, and C:

- model and runtime version;
- reference images and project evidence;
- target framework;
- asset availability and network permissions;
- maximum generation time;
- maximum repair attempts;
- viewport capture tool;
- evaluator rubric.

Randomize artifact labels after generation. Evaluators must not know which workflow produced a
candidate. Preserve raw outputs and failed attempts.

## Case D01 — Architectural marketing landing page

### Intent

Stress bold composition, whitespace, original imagery, hero atmosphere, and responsive
transformation.

### Raw user prompt

```text
Build a premium landing page for a custom-home architecture studio.
The hero should feel cinematic and modern, with a strong call to start a project.
```

### Shared evidence

- one architectural reference screenshot;
- brand name: `Ranty`;
- primary action: `Start a project`;
- prohibited claims: invented customer counts, awards, testimonials, or supplier proof.

### B enhanced prompt

The prompt enhancer may add audience, hierarchy, responsive expectations, and art direction. It
must not create typed contracts, machine evidence, or a curator loop.

### C required contract traits

- Phosphor interface icons;
- purpose-fit GPT Image 2 architectural hero artwork or an explicit no-generation decision;
- one asymmetric composition thesis;
- one spatial signature crossing the hero boundary;
- gentle ambient hero background;
- section motion supporting the architecture narrative;
- `390`, `768`, and `1440` adaptations;
- stable loading and complete reduced-motion/JavaScript-failure paths.

### Failure seeds

- essential headline rendered inside generated artwork;
- desktop hero merely scaled down on mobile;
- CTA hidden behind artwork at `390`;
- ambient animation continues under reduced motion;
- large empty areas with no hierarchy purpose.

### Pass condition

C wins composition, responsive integrity, motion craft, and asset coherence without a P0
accessibility or performance failure.

## Case D02 — Mobile-first nutrition product

### Intent

Stress custom controls, loading states, dense content, image crops, and touch/keyboard behavior.

### Raw user prompt

```text
Build a nutrition app that scans food, tracks calories, and lets users browse healthy recipes.
Make it friendly, modern, and visual.
```

### Shared evidence

- mobile nutrition reference screenshot;
- primary action: scan food;
- secondary action: filter recipes;
- realistic placeholder nutrition values are allowed only when labelled demo data.

### B enhanced prompt

May describe three screens and polished mobile styling. It must not receive control-state
contracts, behavior evidence requirements, or v2 qualification rules.

### C required contract traits

- Phosphor icons with one declared weight;
- original food imagery generated with GPT Image 2 or evidenced project imagery;
- custom-styled recipe category selection;
- custom behavior only if filtering requirements exceed native semantics;
- default, open, selected, disabled, loading, empty, and error states;
- keyboard open/navigate/select/Escape behavior when custom;
- pointer/touch operation;
- skeleton-to-content transition without card-height jump;
- responsive evidence at mobile plus declared marketing canonical widths when delivered as a
  landing surface.

### Failure seeds

- emoji used as navigation icons;
- category control is a clickable `div` without semantics;
- software keyboard obscures the selection popup;
- loading skeleton and final recipe card have different geometry;
- food subject is cropped out at a narrow width.

### Pass condition

C has no custom-control behavioral failure, no loading instability, and scores higher than A/B
for interaction completeness and asset coherence.

## Case D03 — SaaS planning landing page

### Intent

Stress third-party logos, logo provenance, custom dropdowns, restrained motion, and template
avoidance.

### Raw user prompt

```text
Build a landing page for a task-planning SaaS.
Show reminders, integrations, and a free-demo CTA.
```

### Shared evidence

- SaaS planning reference screenshot;
- brand name: `ChronoTask`;
- integrations: Gmail, Slack, and Google Calendar;
- primary action: get a free demo.

### B enhanced prompt

May add page structure, visual tone, and responsive requirements. It must not include asset
provenance, typed state evidence, or qualification rules.

### C required contract traits

- Phosphor UI icons;
- Gmail, Slack, and Google Calendar logos resolved through SVGL when available, cached locally,
  and recorded;
- a custom-styled integration filter with correct semantic base;
- one bold whitespace/composition strategy avoiding a centered hero plus card grid;
- low-tier hero ambient and scroll motion;
- `390`, `768`, and `1440` evidence;
- reduced-motion and JavaScript-failure evidence.

### Failure seeds

- integration logos copied from search thumbnails;
- mixed icon weights;
- custom dropdown has no Escape behavior;
- mobile navigation overflows;
- white space pushes the primary CTA below an unjustified first viewport.

### Pass condition

C has verified logo provenance, complete control behavior, and the highest combined specificity,
composition, and responsive score.

## Automated contract cases

| ID | Input mutation | Expected finding |
|---|---|---|
| AC-01 | Valid v1 generation contract | Pass as historical v1 |
| AC-02 | Valid v2 generation contract | Pass |
| AC-03 | v2 missing `assetPolicy` | `missing-craft-contract` |
| AC-04 | Greenfield icon provider is not Phosphor and has no exception | `unsupported-icon-exception` |
| AC-05 | Brownfield icon exception has reason and evidence | Pass |
| AC-05a | Link or button contains `↗`, `→`, or another Unicode arrow | `text-arrow-as-interface-icon` |
| AC-05b | Link uses a Phosphor arrow component with adjacent action text | Pass |
| AC-06 | Logo misses source URL or local path | `missing-asset-provenance` |
| AC-07 | Generated image contains essential text | `essential-text-in-image` |
| AC-08 | Nested responsive widths differ from top-level widths | `viewport-contract-mismatch` |
| AC-09 | No mobile/tablet/desktop adaptation | `missing-responsive-adaptation` |
| AC-10 | Marketing hero ambient disabled without evidence | `missing-motion-state` |
| AC-11 | Scroll is not applicable and description explains why | Pass |
| AC-12 | Loading is not layout-stable | `unsafe-animation-fallback` |
| AC-13 | Reduced-motion strategy is not static-complete | `unsafe-animation-fallback` |
| AC-14 | Content is hidden without JavaScript | `unsafe-animation-fallback` |
| AC-15 | Custom behavior misses Navigate or Escape | `incomplete-custom-control` |
| AC-16 | Native semantic select with custom appearance | Pass |
| AC-17 | Composition declaration misses signature move | `missing-composition-review` |
| AQ-01 | Valid v2 qualification with matching contract | Pass |
| AQ-02 | v2 qualification has no readable contract | `missing-contract-evidence` |
| AQ-03 | Asset evidence source differs from contract | `false-qualified-v2` |
| AQ-04 | Canonical viewport render fails or overflows | `false-qualified-v2` |
| AQ-05 | Reduced-motion or JavaScript-failure result fails | `false-qualified-v2` |
| AQ-06 | Custom control keyboard result fails | `missing-control-evidence` |
| AQ-07 | Composition signature is not observed | `false-qualified-v2` |
| AQ-08 | Any v1 machine gate fails under `QUALIFIED` | `false-qualified` |

## Browser behavior procedure

Run for each C candidate and record paths in the v2 qualification record.

### Responsive

1. Render at `1440 × 1000`, `768 × 1024`, and `390 × 844`.
2. Inspect document and major-region horizontal overflow.
3. Confirm primary action visibility and reachability.
4. Confirm image focal subject remains intentional.
5. Compare structural adaptation against the contract.

### Motion

1. Record initial load through content settlement.
2. Scroll from hero through at least two content regions.
3. Confirm motion uses hierarchy or causality rather than decorative repetition.
4. Emulate `prefers-reduced-motion: reduce` and repeat.
5. Confirm all content remains available and understandable.
6. Load with JavaScript disabled where the output format permits and verify essential content.

### Loading

1. Delay image/data completion.
2. Capture placeholder and final states at the same viewport.
3. Confirm the main content geometry remains stable.
4. Confirm loading indicators have an accessible name when they communicate status.

### Custom controls

1. Tab to the control and confirm visible focus.
2. Open using Enter or Space.
3. Navigate using arrow keys.
4. Select with Enter.
5. Reopen and close with Escape without unintended change.
6. Confirm focus return.
7. Repeat with pointer/touch-equivalent input.
8. Capture disabled, loading, empty, and error states when applicable.

## Blind scorecard

Score each axis from 0–10 with one evidence sentence.

| Axis | Question |
|---|---|
| Goal fit | Does the design make the intended user outcome and action obvious? |
| Composition | Is there a coherent spatial thesis rather than a familiar template? |
| Whitespace | Does space communicate hierarchy, grouping, and focus? |
| Specificity | Could this artifact belong only to this product/concept? |
| Asset coherence | Are icons, logos, and imagery consistent, sharp, and appropriate? |
| Responsive integrity | Does every viewport feel intentionally composed? |
| Interaction completeness | Are control behaviors and states complete and understandable? |
| Motion/loading craft | Does motion support hierarchy and remain stable and restrained? |
| Accessibility residue | What important manual or behavioral barriers remain? |
| Performance stability | Does motion/loading avoid visible jank or layout instability? |

## Release gate

Enable Qualified Delivery v2 by default only when:

- C has the highest median total across D01–D03;
- C wins at least two cases;
- C has no P0 accessibility, usability, overflow, unsupported-asset, or fabricated-claim failure;
- C has no broken reduced-motion or JavaScript-failure path;
- raw scores, evidence, evaluator disagreement, and rejected attempts are retained.

If the gate fails, keep v2 opt-in and send the worst recurrent failure through Spec 013's
evidence/librarian chain.
