---
description: "Radical contra-persona redesign of an existing variant. Use when the user rejects the current direction and asks for something completely different."
---

# Workflow — `/ui:redesign`

## Title

`/ui:redesign "<directive>"` — radical **contra-persona redesign** of an existing
HTML artifact. The output preserves the *information architecture* of the source
(same regions, same content types, same navigation hierarchy) but moves the
**taste** to a deliberately different persona family. The result must feel like a
different studio re-imagined the page, not like a re-skin of the same layout.

This workflow is the inverse of "make small changes" — it is the *big swing*. Use
`/ui:iterate` for surgical edits, `/ui:refine` for self-correction, this one only
when the user wants a categorically different look.

The `<directive>` is optional. When provided, it biases persona selection (e.g.
"darker", "more editorial", "less playful") but never overrides the hard rule that
the new persona must come from a **different family** than the source.

---

## Inputs

| Input | Source | Required | Notes |
|---|---|---|---|
| `<source-html>` | path to the file being redesigned | yes | A single HTML artifact (artboard). Loaded verbatim. |
| `<directive>` | the quoted argument after the command | no | Free-text bias for persona selection. Empty = pure random-from-different-family. |
| Project DS | `design/ds.manifest.json` | yes | If absent, abort with a clear message — `/ui:redesign` operates on top of an existing design system. Run `/ui:extract` or `ui ds init` first. |
| Parent persona | `manifest.persona.slug` + `manifest.persona.family` (read via `ui ds status --json`) | yes | The current project's persona. Its **family** is the one we must avoid. |
| Persona library | `knowledge/persona-index.md`, `knowledge/personas/<family>.md` | yes | Source of taste DNA for the contra-persona. |
| Mode constraints | `knowledge/mode-constraints.md` | yes | Same mode as the source (component / mobile / slide / dashboard / app / admin / ecommerce / desktop). Infer from the source HTML's viewport + structure. |
| Component catalog | `knowledge/component-catalog.md` | optional | Consult when the source uses a recognizable catalog component and the redesigned variant should use a different visual treatment of the same component. |

---

## Steps

### 1. Load the source

Read `<source-html>` from disk. Keep the **full** markup in working memory — the
redesign step needs every section, every nav item, every CTA so the IA can be
preserved. If the file is larger than ~80k characters, drop runs of base64 image
data first (image data wastes tokens and tells you nothing about IA).

### 2. Analyze the information architecture

Before touching style, write a short IA inventory of the source. This is the
contract the redesign must respect:

- **Page-level regions** in document order — e.g. `nav · hero · feature-grid ·
  social-proof · pricing · faq · footer`.
- **Content types per region** — what the user reads or interacts with. A hero
  with "headline + subhead + 2 CTAs + product screenshot" must come back as
  "headline + subhead + 2 CTAs + product screenshot", not "headline + 1 CTA".
- **Navigation structure** — top-nav items, side-nav sections, breadcrumb depth.
- **Interactive surfaces** — forms, filters, tabs, modals, accordions.
- **Counts that matter** — number of feature cards, number of pricing tiers,
  number of testimonials. These are part of the IA, not the design.

Save this inventory as a `<!-- IA: ... -->` comment block; the generation step
will quote it back as the preservation contract.

**Soul gate.** If `design/soul.md` exists, read it FIRST (it also appears as the
`soul` section of `ui ds context`). It is the project's declared stance. Precedence:
**brief > soul (project > studio > factory) > memory prior > knowledge floors** — the soul biases every choice
below it and never overrides the explicit brief. Never propose choices that violate
a `## Never` clause; prefer choices that express `## Always`.

### 3. Identify the parent persona's family

Resolve the current persona's family from the manifest:

```bash
ui ds status --json
```

The JSON envelope contains `persona.slug` and `persona.family`. Read both. If
`ds status` returns `DS_NOT_FOUND`, abort the workflow with a message pointing
the user at `/ui:extract` (existing HTML) or `ui ds init` (fresh start).

The `family` field is the one that drives contra-persona selection. The seven
families are: `functional-saas`, `editorial-minimal`, `material-surface`,
`immersive-cinematic`, `graphic-modernist`, `retro-digital`, `product-marketing`.

### 4. Select a contra-persona — different family

Open `knowledge/persona-index.md` for the full lookup table, then run this
selection routine:

1. **Build the candidate pool.** Start from the full set of 23 personas in
   `persona-index.md` §1.
2. **Filter by UI type.** Drop personas whose `ui_types` list does not include
   the source's UI type (the mode you inferred in step 1). If the filter empties
   the pool, fall back to the full set of 23 — same rule as `persona-index.md`
   §2 Stage 1.
3. **Exclude the parent family.** Remove every persona whose `family` equals the
   parent family from step 3. This is the hard contra-family rule.
4. **Exclude the parent slug.** Belt-and-braces — the parent's own slug is
   already excluded by step 3, but if the user re-ran `/ui:redesign` and the
   manifest got updated mid-flight, the explicit exclude prevents picking it.
5. **Score the pool against `<directive>`** using the keyword rules in
   `persona-index.md` §2 Stage 2. If `<directive>` is empty, every persona
   scores 0 from keywords; UI-type bonus and trending bonus still apply.
6. **Run `diverseTopK(pool, k = 1)`** as described in `persona-index.md` §4
   (sort by score desc; first pass picks the highest-scoring persona from an
   unused family — with `k = 1` this is just "pick the top of the sorted list").
7. **If no persona clears `MIN_SCORE_THRESHOLD = 3`**, run the family-diverse
   random fallback from `persona-index.md` §5 against the parent-family-excluded
   pool. With `count = 1` this is "pick a random persona from a random family in
   the pool".

Record the chosen persona slug, its family, and a one-line rationale (which
keyword or industry signal landed it, or "fallback — weak directive signal").

### 5. Load the contra-persona's DNA

Open `knowledge/personas/<family>.md` for the chosen persona's family file and
read the section for the chosen slug. Extract the full aesthetic DNA:

- Typography (font families, weights, scale)
- Color philosophy (palette intent, light/dark mode)
- Spacing rhythm (base unit, section gaps, density)
- Depth treatment (shadows, elevation methodology, glass, neumorphism, etc.)
- Border / corner treatment (radius scale, hairlines vs heavy strokes)
- Texture / surface (gradients, grain, materials)
- Interaction language (hover, active, transitions)
- Layout posture (grid type, asymmetry, content-driven vs system-driven)
- Anti-patterns (the explicit "do NOT do" list)

The persona DNA is the **mandatory** style contract for the redesign.

### 6. Generate the redesigned variant

Combine three contracts and produce a single complete HTML artifact:

1. **IA contract** — the `<!-- IA: ... -->` inventory from step 2. Quote it back
   verbatim and treat every bullet as a preservation requirement.
2. **Persona DNA contract** — the full DNA from step 5. Treat every section as a
   prescription.
3. **Mode contract** — the matching mode block from `knowledge/mode-constraints.md`
   plus the universal style guide.

The generation must:

- **Preserve** content hierarchy, navigation structure, region count, content
  type per region, and the meaningful counts (feature cards, pricing tiers,
  etc.) from the IA contract.
- **Replace** every visual axis — color, typography, spacing, depth, borders,
  texture, motion, layout grid. Do not reuse the source's class names, colors,
  border-radius values, font-family declarations, or shadow values. A redesign
  that shares any of those is a re-skin, not a redesign.
- **Match or exceed** the source's polish and complexity. A redesign that
  simplifies is a regression; a redesign that adds without taste is noise.
  Follow the persona's density (compact / comfortable / spacious) — that is the
  governing complexity dial.
- **Apply the persona's anti-patterns as hard prohibitions.** If the persona
  forbids drop-shadows, do not produce drop-shadows.

If the project DS is rich enough to express the contra-persona (registered
components exist that match the new visual language), reuse them via the
component catalog naming. If not, generate the redesigned components inline —
the **Consistency axis** in `templates/workflows/critique.md` will flag low
reuse so a follow-up `/ui:iterate` can register the new pieces.

**Consume the design tokens mechanically.** Get the compiled Tailwind `@theme`
block and inline it in the redesigned page's `<head>` (one read-only call also
re-verifies the manifest hash; the theme is compiled from the full resolved
token map, no tokens path to adjust):

```bash
ui ds context --strict --with-theme
```

Build the redesign with the token-bound utilities (`bg-surface`, `text-primary`,
`p-4`, …) rather than re-typing hex/px. The contra-persona changes *which* tokens
carry the look and the overall composition — but a value the DS already defines
must still resolve to its token, or the critique Consistency floor
(`ui taste-lint`) will flag the off-palette literal. If the contra-persona
genuinely needs a value no token expresses, that is the signal to add a token via
`ui ds change-token`, not to hardcode.

Open the file with a thought-process comment block, e.g.:

```html
<!-- AI_THOUGHT_PROCESS:
  1. Source persona: <parent-slug> (family <parent-family>)
  2. Contra-persona: <chosen-slug> (family <chosen-family>) — <rationale>
  3. IA preserved: <summary of regions + counts>
  4. Visual transformation: <which axes changed and how>
-->
```

Write the redesigned HTML to a sibling file next to `<source-html>` — for
example `<source>.redesign.html`, or whichever path the host adapter has chosen
for variant output.

### 7. Run autofix on the output

```bash
ui autofix <redesigned-html> --write
```

This applies the deterministic HTML fix rules (viewport meta, `<img onerror>`
fallbacks, lucide `createIcons()` injection, CDN URL normalization, duplicate
`id` deduplication). Capture the applied-findings JSON for the report.

### 8. Lint the layout

```bash
ui validate-layout <redesigned-html>
```

Inspect the report. Structural errors (3 hard checks) must be fixed in this
workflow before handing off to the quality gate; layout smells (7 heuristics)
should be noted and left for the gate to weigh.

### 9. Hand off to the quality gate

Pass the redesigned file to `templates/workflows/critique.md`. The critique
gate scores the 6 taste axes plus the 7th Consistency axis, and if any axis
fails its threshold the failing axis re-prompts up to the documented round cap.

The redesigned file is **complete** only when the critique gate passes.

---

## Outputs

- A new HTML file at the variant path — fully self-contained, autofix-clean,
  layout-lint-clean of structural errors.
- A leading `<!-- AI_THOUGHT_PROCESS: ... -->` block documenting the contra-
  persona selection, the IA preservation contract, and the visual transformation
  plan.
- A summary printed to the host model surface: parent persona + family,
  chosen contra-persona + family, the IA inventory, the autofix findings, the
  layout-lint findings, and the critique result.
- **No manifest changes.** `/ui:redesign` does not edit `ds.manifest.json` —
  the project's design system is unchanged. If the user wants the contra-
  persona to become the project's new persona, that is a separate explicit
  step (`ui ds init --force` with the new slug).

---

## Quality gate

Run `templates/workflows/critique.md` against the redesigned file. The gate
scores the 6 taste axes (Layout, Typography, Spacing, Motion, Iconography,
Depth/Surface) plus the 7th Consistency axis and applies the configured pass
thresholds with the documented round cap. The workflow is done only when the
gate passes; on persistent failure, surface the lowest-scoring axis to the
user with the critique's diagnosis.

Special attention on this workflow:

- **Layout, Typography, Depth/Surface** — these axes are where contra-persona
  redesigns most often fail (the model converges back toward the source).
- **Consistency** — a redesign that registers zero new components but invents
  many ad-hoc patterns will fail this axis. Either reuse the existing registry
  or extend it via `ui registry register` for the new pieces.
- **IA preservation** — not a critique axis but a hard contract. A redesign
  that drops a region or changes a count is a failed redesign regardless of
  taste scores; surface this to the user before the critique runs.
