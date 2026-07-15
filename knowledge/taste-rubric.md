# Taste Rubric — The 6+1 Axis Model

This file is the design taste model the host model uses to **shape** a UI generation and
to **critique** it afterward. It is the product's quality floor: a generation that does
not clear the gate is not acceptable output.

Taste is decomposed into **six craft axes** plus a **seventh systems axis (Consistency)**.
Each axis is independently scorable 0–10. The critique gate (see end of file) decides
whether a generation passes.

## How to use this file

1. **Before generation** — read the target value for each axis (from the design brief,
   the project style guide, or the requested taste profile) and let the axis descriptors
   below shape the markup, CSS, and motion you produce.
2. **After generation** — score the result against the per-axis criteria. Any axis below
   the pass threshold means the generation must be revised, not shipped.

A taste axis is not a slider you set and forget — it is a **rubric you are graded against**.
Defaulting to a generic framework template scores low on most axes by construction.

---

## Axis 1 — Layout

**Controls:** grid vs. asymmetry, overall composition, focal hierarchy, whitespace
distribution, pacing between sections.

A layout is good when the eye knows where to go first, second, third — and when the
composition feels *authored*, not auto-arranged.

| Level | Descriptor |
|---|---|
| **Low** | Strict, predictable grids. Even columns, symmetrical splits, repeated card rows. Safe and legible; can read as a template. Right for dense data, admin tables, documentation. |
| **Mid** | Mostly grid-aligned with deliberate breaks — one feature row spans full-bleed, one section is offset. Clear hierarchy, comfortable rhythm. The default for most product UI. |
| **High** | Asymmetric, editorial composition. Fractional widths, overlapping elements, intentional negative space as a design element. Strong single focal point per viewport. Right for landing pages, portfolios, marketing. |

**Anti-patterns:** 50/50 hero splits with no reason; three identical cards as the only
composition idea; every section the same width and rhythm; no clear focal point.

### Scoring 0–10

| Score | Meaning |
|---|---|
| 0–3 | No hierarchy. Uniform blocks. Reads as an unstyled wireframe or a raw framework scaffold. |
| 4–6 | Functional hierarchy and alignment, but generic — could be any product. Whitespace is uniform, pacing is flat. |
| 7–8 | Clear focal hierarchy, deliberate whitespace, at least one composition choice that shows intent. Section pacing varies. |
| 9–10 | Authored composition. Asymmetry or grid used with evident purpose; negative space is active; the eye is led deliberately through the page. |

**Score against:** Is there a single clear focal point per viewport? Does whitespace vary
with intent? Does section pacing change, or is every band the same? Does the composition
match the layout target, or did it default to even columns?

---

## Axis 2 — Typography

**Controls:** type scale and its ratio, font pairing, weight contrast, tracking
(letter-spacing), leading (line-height), letter case.

Typography is the single highest-leverage axis: a UI with mediocre everything else but
excellent type still reads as competent. The reverse is not true.

| Level | Descriptor |
|---|---|
| **Low** | Tight scale (small ratio ~1.15–1.2), one family, minimal weight contrast. Calm, utilitarian, dense. Right for dashboards and tools. |
| **Mid** | Moderate scale (ratio ~1.25 / major third), one or two families, clear weight steps (e.g. 400 body / 600–700 headings). The dependable default. |
| **High** | Expressive scale (ratio ~1.333–1.5+), large display sizes, strong weight contrast, considered tracking on large and small sizes. Right for editorial and marketing surfaces. |

**Scale guidance:** pick one modular ratio and derive the scale from it; do not hand-pick
unrelated sizes. Tighten tracking on large display text (negative, ~−0.02em); leave body
near normal; widen tracking slightly on small uppercase labels. Body leading ~1.5–1.6;
display leading tight (~1.0–1.2). Body text never below 16px. Reserve all-caps for short
labels, never running text. Display type is roman — italic headings (or an italic emphasis
word inside a heading) read as generated, not designed. All-caps display keeps line-height
≥ 1.0; below that, cap-tops collide when the text wraps.

**Anti-patterns:** five+ font sizes with no ratio relationship; headings and body at the
same weight; uppercase paragraphs; default-tracked huge display text; pairing two fonts
that occupy the same role; italic display headings; all-caps display with line-height below 1.0.
*Machine floor:* `taste-lint`'s `font-scale-sprawl` counts the distinct hand-picked font
sizes (arbitrary `text-[..px]` utilities and raw `font-size` literals — named Tailwind steps
and `var(--…)` token sizes do not count) and warns past 7, errors past 10 — the signal that
the scale was never derived from one ratio.

### Scoring 0–10

| Score | Meaning |
|---|---|
| 0–3 | Random sizes, no scale. No weight contrast. Body below 16px or all-caps body. |
| 4–6 | Consistent sizes and a usable hierarchy, but the scale is flat or unconsidered; tracking and leading left at defaults. |
| 7–8 | A coherent modular scale, clear weight contrast, leading tuned per role, tracking corrected on display and label sizes. |
| 9–10 | Type carries the design. Deliberate ratio, confident weight contrast, optical tracking, pairing (if any) with distinct roles. Reads as typeset, not styled. |

**Score against:** Is there one ratio behind the scale? Is there real weight contrast
between body and headings? Is leading tuned (tight display, open body)? Is tracking
corrected on large and small extremes? Is body ≥16px?

---

## Axis 3 — Spacing

**Controls:** base spacing unit, vertical and horizontal rhythm, content density,
padding scale, the relationship between nested paddings.

Spacing is rhythm. A UI that respects one base unit feels engineered; one that uses
arbitrary gaps feels improvised.

| Level | Descriptor |
|---|---|
| **Low (dense)** | Tight padding, compact rhythm, minimal section gaps. "Cockpit mode" — maximize information per screen. Right for admin, data tools, terminals. |
| **Mid** | Comfortable, even rhythm on a consistent base. Padding scales predictably with element importance. The default for most product UI. |
| **High (airy)** | Generous whitespace, large section gaps, padding scaled up substantially. "Gallery mode" — content breathes. Right for landing pages and premium/editorial surfaces. |

**Rules of rhythm:** choose one base unit (commonly 4px or 8px) and make every gap and
pad a multiple of it. Inner padding of a container should be ≥ its outer margin so nesting
reads correctly. Spacing steps should progress on a recognizable scale (e.g. 4, 8, 12,
16, 24, 32, 48, 64), not ad-hoc values. Section gaps grow with the airiness target.

**Anti-patterns:** off-grid values (`13px`, `27px`); inconsistent gaps between sibling
elements; padding that doesn't scale with element role; cramped touch targets (interactive
hit area below ~44px on touch surfaces). *Machine floor:* `taste-lint`'s
`tap-target-undersized` (warning) flags an interactive control with a fixed height below
44px, a min-height floor below 44px with no compensating padding, or an icon-only control
with too little padding — the WCAG 2.5.5 / HIG / Material touch minimum.

### Scoring 0–10

| Score | Meaning |
|---|---|
| 0–3 | Arbitrary, off-grid spacing. No rhythm. Crowded or randomly gapped. |
| 4–6 | Mostly consistent spacing, but with off-base exceptions or flat rhythm that ignores the density target. |
| 7–8 | One base unit honored throughout; padding scales with role; section gaps match the density target. |
| 9–10 | Spacing is invisible because it is right. Every gap is on-system, nesting relationships hold, rhythm matches intent exactly. |

**Score against:** Is every gap a multiple of one base unit? Does inner padding ≥ outer
margin hold? Does density match the target (dense vs. airy)? Are touch targets adequate?

---

## Axis 4 — Motion

**Controls:** easing curves and springs, transition duration, stagger/orchestration,
the overall restraint vs. expressiveness of animation.

Motion communicates causality and state. Good motion is felt, not noticed; bad motion is
noticed because it is slow, linear, or gratuitous.

| Level | Descriptor |
|---|---|
| **Low (restrained)** | Minimal or no animation. Near-instant state changes, at most a short opacity/color fade. Right for data tools and accessibility-first contexts. |
| **Mid** | Standard interactive feedback — hover and focus transitions ~150–250ms on a natural easing curve, simple enter transitions. The dependable default. |
| **High (expressive)** | Orchestrated motion — staggered entrance cascades, spring-based physics, custom cubic-bezier curves, transform-rich hover states. Right for marketing and showcase surfaces. |

**Rules of motion:** use ease-out for elements entering or responding to user action;
ease-in for elements leaving; never linear for UI transitions (linear reads mechanical).
Keep functional transitions short (~150–250ms); reserve longer durations for large or
expressive movement. Stagger lists by a small per-item delay rather than animating all at
once. Animate `transform` and `opacity`, not layout properties. Respect a reduced-motion
preference — expressive motion must degrade to near-instant. Never overshoot/bounce curves
(cubic-bezier with y outside [0,1]) on UI state transitions — reserve overshoot for
deliberately physical moments. A focus ring appears instantly; never transition outline or
focus box-shadow into existence.

**Anti-patterns:** linear easing; durations over ~400ms on routine UI feedback; animating
width/height/top/left; everything animating at once with no stagger; motion with no
reduced-motion fallback; hover transforms so large they cause layout shift; bouncy overshoot
easing on buttons/inputs/menus; focus rings that fade in.

### Scoring 0–10

| Score | Meaning |
|---|---|
| 0–3 | No transitions at all where they're expected, or janky/linear motion, or gratuitous animation that distracts. |
| 4–6 | Basic transitions present but unconsidered — default easing, uniform duration, no orchestration. |
| 7–8 | Easing chosen per direction, durations role-appropriate, lists staggered, reduced-motion respected. |
| 9–10 | Motion expresses state and hierarchy. Curves are intentional, orchestration is deliberate, and it degrades gracefully. Matches the motion target precisely. |

**Score against:** Is easing directional (out for enter, in for exit) and never linear?
Are durations role-appropriate? Are lists staggered? Is only transform/opacity animated?
Is reduced-motion handled? Does the amount of motion match the target?

---

## Axis 5 — Iconography

**Controls:** icon style (line / solid / duotone), stroke weight, icon-to-text size
ratio, set consistency.

Icons are a small surface but a fast tell. A page mixing icon styles reads as assembled
from parts.

| Level | Descriptor |
|---|---|
| **Low** | Sparse, functional iconography. One style, default weight, used only where it aids comprehension. |
| **Mid** | Consistent single set used systematically — navigation, status, actions. Sizes follow a small fixed ramp. The default. |
| **High** | Iconography as part of the visual language — considered duotone or custom-weighted icons, deliberate sizing, icons reinforcing brand character. |

**Rules of iconography:** use exactly one icon family for the whole UI. Keep one stroke
weight across all line icons. Size icons on a small fixed ramp (e.g. 16 / 20 / 24px) and
keep the icon-to-text optical size consistent — an inline icon should match the cap height
of adjacent text, not tower over it. Don't mix line and solid styles arbitrarily; if both
appear, they must encode a meaning (e.g. solid = active state).

**Anti-patterns:** two or more icon sets in one UI; inconsistent stroke weights; icons
wildly out of scale with their text; emoji used as interface icons; decorative icons that
add noise without meaning.

### Scoring 0–10

| Score | Meaning |
|---|---|
| 0–3 | Mixed icon sets, inconsistent weights, or icons badly out of scale. Emoji as UI icons. |
| 4–6 | One set, but sizing or stroke weight is inconsistent, or icons are used decoratively without purpose. |
| 7–8 | One coherent set, consistent stroke weight, sizes on a fixed ramp, optically aligned with text. |
| 9–10 | Iconography is part of the design language — consistent, optically tuned, style choices (line/solid/duotone) carry meaning. |

**Score against:** Is there exactly one icon family? Is stroke weight uniform? Do sizes
follow a fixed ramp? Are icons optically aligned to text? Do style variations encode
meaning rather than appear by accident?

---

## Axis 6 — Depth / Surface

**Controls:** shadow and elevation system, borders, glass / blur, texture and material.

Depth tells the user what floats above what. A good elevation system is a small set of
consistent steps; a bad one is a different shadow on every card.

| Level | Descriptor |
|---|---|
| **Low (flat)** | Minimal elevation. Hairline borders or background-color shifts separate surfaces. Crisp, modern, fast. Right for dense UI and flat design languages. |
| **Mid** | A small, consistent elevation ramp — a few shadow steps mapped to surface roles (resting card, raised, overlay). Borders used sparingly. The default. |
| **High (rich)** | Layered depth — soft multi-layer shadows, glass/backdrop-blur surfaces, subtle texture or gradient on materials. Right for premium, immersive, or playful surfaces. |

**Rules of depth:** define elevation as a fixed ramp of named steps, each mapped to a
role (e.g. flat → card → raised → overlay → modal) — never invent a one-off shadow per
component. Higher elevation = larger, softer, more diffuse shadow, not just darker.
Shadows should be tinted toward the background hue, not pure black. Use either a shadow
or a border to separate a surface, rarely both. Glass (backdrop-blur) needs sufficient
contrast behind it to keep foreground text legible. Stacking order is a designed scale
(e.g. 1/10/100), not an arms race — an all-nines z-index is an admission the scale was
never designed.

**Anti-patterns:** a unique shadow value on every element; pure-black harsh shadows;
shadow and heavy border stacked on the same surface; glass over busy content that kills
text contrast; elevation that doesn't correlate with actual stacking order; z-index 9999;
a large background gradient in the indigo→magenta band (the machine-default "AI glow" —
finance/enterprise surfaces read it as cheap); a low-alpha same-mode surface tint (a white
hairline/fill on a light page, or the black inverse on a dark page) that passes text-contrast
but draws no visible boundary. *Machine floor:* `taste-lint`'s `ai-cliche-gradient` (error)
converts each gradient stop to OKLCH and flags a large-surface linear/radial/conic gradient
dominated by stops in the ~270–330° hue band; `mode-invisible-surface` (error) reads the
document mode from its root and flags a sub-15%-alpha white surface on a light page (or black
on a dark page); `z-index-off-ladder` (warning) flags a `z-index` above single-digit local
stacking that is not a base-10 ladder step, and `z-index-inflation` (error) flags the
all-nines escalation. Recolor the gradient to the brand hue (or declare that hue as an in-doc
brand token), give the invisible boundary a visible tint, and snap stacking to a named z-scale.

### Scoring 0–10

| Score | Meaning |
|---|---|
| 0–3 | Ad-hoc shadows everywhere, or harsh black shadows, or elevation that contradicts stacking order. |
| 4–6 | Surfaces are separated, but the elevation set is inconsistent or shadows are unrefined (too dark, too hard). |
| 7–8 | A fixed elevation ramp mapped to roles; shadows soft and background-tinted; borders and shadows not doubled up. |
| 9–10 | Depth is a coherent system. Elevation steps are few and meaningful, material choices (flat/shadow/glass) are deliberate and legible. |

**Score against:** Is elevation a fixed named ramp mapped to roles? Do higher steps get
softer and more diffuse? Are shadows tinted, not pure black? Is glass legible? Does
elevation match real stacking order?

---

## Axis 7 — Consistency (the systems axis)

The six craft axes above grade a generation **on its own**. The Consistency axis grades a
generation **against the project it belongs to**. A page can be beautiful in isolation and
still fail here — because it ignored the design system it should have inherited.

**Controls:** reuse of the project's design-system tokens, reuse of registered components,
and use of correct canonical naming.

This axis only applies when the project *has* an established design system, token set, or
component registry. For a first generation in an empty project it is not yet scorable —
once tokens and components exist, every subsequent generation is held to it.

### What it scores

1. **Token reuse** — Did the generation use the project's existing design tokens
   (colors, type styles, spacing, radii, shadows) instead of hardcoding new raw values?
   A new `#3b82f6` literal when the project already defines `color-primary` is a failure.
   See `token-taxonomy.md` for the token model being referenced here.
2. **Component reuse** — Did the generation reuse components already registered in the
   project (a registered button, card, input) instead of re-implementing them inline with
   slightly different markup? Divergent re-implementations fragment the system.
3. **Canonical naming** — Did the generation use the project's established names for
   tokens, components, and variants? A button called `cta-btn` in one screen and
   `primary-button` in another describes the same thing twice and breaks the system's
   shared vocabulary.

### Scoring 0–10

| Score | Meaning |
|---|---|
| 0–3 | Ignores the design system. New hardcoded values, re-implemented components, invented names. The generation is an island. |
| 4–6 | Partial reuse — some tokens and components reused, but with notable hardcoded values, one-off re-implementations, or naming drift. |
| 7–8 | Consistent reuse of tokens and registered components; canonical names used; only minor, justifiable new additions. |
| 9–10 | Fully systemic. Every value resolves to a token, every component is the registered one (or a deliberate, named extension), naming is exactly canonical. |

**Score against:** Does every color/spacing/type value resolve to an existing token?
Were registered components reused rather than re-built? Do all names match the project's
canonical vocabulary? Are new additions deliberate and named, or accidental drift?

---

## The Critique Gate

After every generation, score all applicable axes. The default **pass threshold is
≥ 7 / 10 on every axis**.

- **Any axis below 7** → the generation fails the gate. Identify the lowest-scoring axes,
  apply the specific "Score against" questions for those axes, revise, and re-score.
- **Consistency** is scored whenever the project has an established system; skip it only
  for the very first generation in an empty project.
- The threshold is a default. A brief may raise it (e.g. ≥ 8 for a flagship marketing
  page) or, rarely, note an axis as not-applicable (e.g. Iconography for a UI with no
  icons). It should not be lowered silently to let weak output through.

### Pass thresholds

Every axis must score **≥ 7 / 10** for the generation to pass the gate. The
critique workflow re-prompts the lowest-scoring axis when any axis falls below
7, and stops after at most three critique → refine rounds.

**Why 7, not 6 or 8.** The per-axis rubric describes 7–8 as *"coherent, intentional,
honoring the persona's target"* and 9–10 as *"the axis carries the design."* A 6
is *"functional but generic — could be any product"*. A floor of 6 lets generic,
template-ish output ship — exactly the failure mode the gate exists to catch. A
floor of 8 demands per-axis excellence on every generation, which inflates the
refine loop, slows iteration, and punishes axes the persona deliberately keeps
restrained (e.g. low Motion for a data tool, low Depth for a flat design language).
Seven is the lowest score at which the rubric language stops calling the result
generic, so it is the right gate height for *most personas, most modes* — strict
enough to reject template output, lenient enough not to over-fit on a single axis.
Briefs that want flagship-level output raise the threshold per axis (typically
Typography and Layout to 8); briefs targeting cockpit-style data tools sometimes
mark Motion not-applicable. The floor itself does not move below 7 — it only
moves up.

The gate's purpose is not perfectionism — it is to catch the failure mode where a model
produces a plausible-looking but generic, system-ignoring result and ships it.

---

## The Excellence Tier

The 7-axis gate is the *floor* — it rejects generic output. Briefs that demand
**ship-grade** output (a flagship marketing page, a public product surface, anything the
brief marks "excellence" or scores against named products) run three additional
protocols on top of the gate. They are opt-in per brief; routine generations stop at
the gate.

### 1. Correctness is a gate, not a score

Deterministic failures never trade off against beauty. Before any axis is scored:

- `ui validate-layout` must report **zero error-severity findings**;
- `ui taste-lint` must report **zero findings** (at the excellence tier the axis-cap
  rule tightens to fix-first);
- `ui autofix` re-run must be a no-op (idempotence proof);
- the Consistency work list (unresolved tokens, unregistered components) must be empty.

Any failure here means **NO SCORE** — fix, then score. A 9/10 design with an unbalanced
tag or an off-palette hex is not a 9; it is unshippable. This prevents the classic
failure where high craft scores launder correctness debt.

### 2. Adversarial judging — the maker never grades its own work

Self-scoring drifts lenient: the context that generated a variant "knows what it meant"
and scores the intention, not the artifact. At the excellence tier:

- Score in a **fresh context** that has the rubric, the persona DNA, the DS context, and
  the artifact — but none of the generation conversation. On runtimes with subagents,
  spawn a judge subagent; otherwise, adopt an explicit adversarial stance: for each
  axis, actively try to **refute** the pass ("what would a senior designer flag here?")
  and only award ≥ 7 when the refutation fails.
- The judge cites evidence for every score — a specific element, measured value, or
  rubric question — never "looks good".
- On a pass at this tier, run one more round anyway (**the excellence round**): take the
  weakest passing axis and push it toward 9 with a targeted refine. Ship-grade work is
  never "barely cleared the bar".

### 3. The reference duel — calibrate against measured reality

Model memory of what "Linear-quality" looks like is GUESS-grade. `knowledge/benchmarks/`
holds SOURCE-grade DNA captures (measured type ramps, surface recipes, shadow stacks,
gap scales) for eight ship-grade products. For an excellence brief:

1. Pick the 1–2 benchmarks nearest the brief's genre (see `benchmarks/README.md`).
2. Duel the variant against the DNA **on measurable traits**: type-ramp discipline,
   surface layering (low-alpha overlays vs flat hexes), shadow recipes (tinted
   multi-stop vs single black blur), gap-scale tightness, weight precision.
3. The verdict cites DNA values (`Linear body clusters 13–15px; this variant scatters
   12–19px across six sizes`) — evidence-anchored, not vibes.

The duel calibrates the **level of discipline**; it never copies a benchmark's palette
or layout into an unrelated brand. Losing the duel on a trait routes that trait's axis
back through refine with the DNA value as the target quality bar.

---

## Failure modes per axis

Per `authoring-standard.md`, a rubric must name how each axis goes wrong so a judge has
something to point at. These are the observable failure kinds — a reviewer can look at a
rendered instance and say "that one".

- **Layout** — every section the same width and rhythm (no pacing); three identical cards
  as the only composition idea; no single focal point per viewport (the eye has nowhere to
  land first).
- **Typography** — sizes with no ratio behind them (hand-picked, unrelated); body below
  16px or running text set in all-caps; headings and body at the same weight (no contrast).
- **Spacing** — off-grid values (`13px`, `27px`) among on-grid ones; inner padding smaller
  than outer margin so nesting reads inverted; touch targets under ~44px on a touch surface.
- **Motion** — linear easing on UI transitions (reads mechanical); `width`/`height`/`top`
  animated instead of `transform`/`opacity` (janky, layout-shifting); expressive motion with
  no reduced-motion fallback.
- **Iconography** — two or more icon families in one UI; inconsistent stroke weight across
  line icons; emoji standing in for interface icons.
- **Depth / Surface** — a unique one-off shadow per component (no ramp); pure-black harsh
  shadows instead of background-tinted; shadow and heavy border doubled on one surface; a
  `z-index: 9999` that admits the scale was never designed.
- **Consistency** — a raw `#3b82f6` literal where `color-primary` already exists; a
  registered component re-implemented inline with divergent markup; the same thing named two
  ways (`cta-btn` here, `primary-button` there).

## Mapping the legacy 3-dial model into the 6-axis model

Earlier versions of this taste system exposed only three dials — **variance**, **motion**,
and **density** — each 0–10. Those dials still map cleanly onto the richer model, so older
profiles and briefs remain interpretable:

| Legacy dial | Maps to axis | How it maps |
|---|---|---|
| **Variance** | **Layout** (primary) | Low variance → low Layout (strict grids, symmetry). High variance → high Layout (asymmetry, fractional widths, broken grids). Variance also lightly informs **Depth/Surface** — expressive layouts often carry richer depth. |
| **Motion** | **Motion** (direct) | Maps one-to-one. Low → restrained, Mid → standard feedback, High → orchestrated/expressive. |
| **Density** | **Spacing** (primary) | Low density → airy spacing (gallery). High density → tight spacing (cockpit). Density also informs **Typography** scale (dense UIs use tighter scales) and **Depth** (dense UIs trend flatter). |

What the 3-dial model could **not** express, and the 6-axis model adds:

- **Typography** as a first-class, independently graded axis (scale ratio, pairing,
  weight contrast, tracking, leading) — previously only an implicit side effect of density.
- **Iconography** — entirely absent from the dial model; now an explicit axis.
- **Depth / Surface** — previously folded vaguely into "variance"; now its own elevation
  and material system.
- **Consistency** — the dial model graded a generation only in isolation; the systems
  axis adds grading against the project's tokens, components, and naming.

When a brief provides only the three legacy dials, derive the missing axis targets:
Typography and Depth follow from density and variance per the table above; Iconography
defaults to **Mid** (one consistent set) unless the brief says otherwise; Consistency is
always graded against whatever system the project already has.
