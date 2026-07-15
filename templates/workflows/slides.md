---
description: "Generate a full presentation slide deck from a topic. Use when the user asks for slides, a deck, or a presentation."
---

# `/ui:slides` — Generate a slide deck

Generate a full presentation deck from a topic string. The workflow plans an outline,
generates a shared chrome that every slide carries, then generates each slide's
content zone one at a time under the **slide** mode constraints. The final deck is
collated into a single navigable artifact.

A slide deck is **not** a long web page chopped into pieces. Each slide is a
self-contained 1920 × 1080 viewport with its own background, one main idea, and
display-scale typography. Speaker notes are required.

## Inputs

- `<deck topic>` — one quoted string describing what the deck is about
  (e.g. *"investor pitch for a developer-tools startup"*).
- *(optional)* `--slides <N>` — explicit slide count, `3 ≤ N ≤ 15`. If omitted, the
  outline planner picks a count (typically 6–8). A count embedded in the topic
  itself (*"10-slide pitch"*) also wins over the default but is overridden by
  `--slides`.
- *(optional)* `--persona <slug>` — pin the deck's persona. Otherwise inferred from
  the topic via `knowledge/persona-index.md`.
- *(optional)* `--ds <path>` — point at an existing design system. Defaults to the
  project's `ds.manifest.json`.

## Steps

### 1. Read the relevant knowledge files

Open and keep in context:

- `knowledge/mode-constraints.md` — specifically the **Slide** section. Every
  rule in that section is non-negotiable.
- `knowledge/taste-rubric.md` — the 6+1 axes the deck will be scored on.
- `knowledge/persona-index.md` — for persona selection when `--persona` is not set.

**Soul gate.** If `design/soul.md` exists, read it FIRST (it also appears as the
`soul` section of `ui ds context`). It is the project's declared stance. Precedence:
**brief > soul (project > studio > factory) > memory prior > knowledge floors** — the soul biases every choice
below it and never overrides the explicit brief. Never propose choices that violate
a `## Never` clause; prefer choices that express `## Always`.

### 2. Ensure a design system exists

Same gate as every generation workflow:

```sh
ui ds context --format markdown --max-bytes 4096 --strict --with-theme
```

If the call fails because no design system is initialised, compile one:

```sh
ui ds init <deck-slug> --persona <chosen-persona-slug> --intent "<deck topic>"
```

Pick the persona either from `--persona` or by feeding the topic through
`knowledge/persona-index.md`'s keyword-scoring + industry-affinity rules and
applying the diverse top-K rule (pick the single best fit — the deck must be
visually consistent, so no variant fan-out at the deck level).

The one call returns both blocks the workflow needs:

- Capture the design-system context block as `design_system_context` for the
  rest of the workflow.
- Capture the appended Tailwind `@theme` fenced section as
  `design_system_theme` — `--with-theme` compiles it from the full resolved
  token map (it discovers the tokens path itself and is immune to
  `--max-bytes` truncation). Step 4 inlines it once into the deck's shared
  chrome `<style>`, so `--color-primary` → `bg-primary`, `--space-4` → `p-4`,
  etc. This is what makes the "stay inside the DS palette" rule in step 5
  verifiable — every slide consumes the palette **mechanically**
  (token-bound utilities) rather than by re-typing hex.

### 3. Plan the outline

Acting as a presentation strategist and information architect, produce a JSON
outline. If the user's topic already mentions a count (e.g. *"10 slides"*),
clamp it to `3..15`. Otherwise pick 6–8 slides.

Rules:

1. Always open with a **title** slide and close with a **cta** slide.
2. Each slide has a clear, distinct purpose. No two slides repeat the same beat.
3. Pick the best **role** for each slide's content type from the table below.
4. The role is purely a content/structure tag — the slide-mode constraints from
   `mode-constraints.md` always apply on top of it.

Available roles:

| Role         | Use for |
|--------------|---------|
| `title`      | Big centred title + subtitle. Opening slide. |
| `content`    | Heading + bullets or body. The default workhorse. |
| `two_column` | Left text, right image / visual. Features, comparisons. |
| `image_text` | Full-bleed visual with overlaid text. Impactful moments. |
| `quote`      | Large centred quote or testimonial. |
| `stats`      | 3–4 stat cards in a row. Metrics, data points. |
| `section`    | Single large word/phrase, no body — divider between acts. |
| `cta`        | Closing call-to-action slide. |

Output schema (return JSON only, no fences):

```json
{
  "deckTitle": "The deck's main title",
  "slides": [
    { "title": "Slide title", "contentBrief": "1–2 sentences describing what this slide should contain", "role": "title" },
    { "title": "...",         "contentBrief": "...",                                                       "role": "content" }
  ]
}
```

If the outline call fails or returns invalid JSON, fall back to this generic
six-slide skeleton and continue:

| # | title          | role        | contentBrief |
|---|----------------|-------------|--------------|
| 1 | Introduction   | title       | Opening title slide with the main topic. |
| 2 | The Challenge  | content     | Define the problem or opportunity being addressed. |
| 3 | Our Approach   | two_column  | Present the solution or methodology with key details. |
| 4 | Key Results    | stats       | Show metrics, data points, or outcomes. |
| 5 | What People Say | quote      | A compelling quote or testimonial. |
| 6 | Next Steps     | cta         | Clear call-to-action and contact information. |

### 4. Generate shared chrome

Once per deck. The chrome is the **header bar + footer bar + background** every
slide carries — a single, consistent visual signature.

Acting as a presentation template designer, extract the visual identity from
`design_system_context` and return a JSON object with these three fields:

- `headerHtml` — a short HTML snippet (~3–5 lines) for the **top** of every slide:
  - A thin brand accent bar (2–4 px coloured strip at the top, using the primary
    colour from the DS).
  - Brand name or logo placeholder in the DS heading font, small size (14–16 px),
    positioned top-left.
  - Keep minimal — total height ≤ 60 px.
- `footerHtml` — a short HTML snippet (~3–5 lines) for the **bottom** of every slide:
  - Brand name on the left (12–14 px, muted colour).
  - Slide number placeholder `{{SLIDE_NUM}} / {{SLIDE_TOTAL}}` on the right.
  - Keep minimal — total height ≤ 40 px.
- `bgCss` — a CSS background property value, e.g.
  `linear-gradient(135deg, #0F172A, #1E293B)` or `#FFFFFF`.

There is also a fourth, non-generated chrome element: `themeStyle` — the
`design_system_theme` (`@theme` block) captured in step 2, wrapped in a
`<style>…</style>` tag. It is inserted verbatim into the `<head>` of **every**
slide (step 5) so all slides share token-bound Tailwind utilities. Do not
regenerate or edit it per slide.

Chrome constraints:

- Use **only** colours found in the provided design system — prefer the
  token-bound utilities from `themeStyle` (`bg-surface`, `text-primary`, …)
  over hardcoded hex wherever a token covers the value.
- Use **only** fonts found in the provided design system.
- Keep the chrome **minimal** — it must not compete with the slide's content.
- Slide/transition motion defaults to **T1/T2** per `knowledge/motion-craft.md`
  (CSS transitions or the View Transitions API); reserve T5 (GSAP) only for an
  explicitly cinematic brief.
- Tailwind utility classes inside the snippets. Inline styles are acceptable for
  colours and fonts.
- Header and footer both use `position: absolute` so they overlay the slide.
  Header: `top: 0; left: 0; right: 0;`. Footer: `bottom: 0; left: 0; right: 0;`.

Return JSON only — no markdown fences, no explanation.

Fallback chrome (use if the generation call or JSON parse fails):

```json
{
  "headerHtml": "<div style=\"position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#3B82F6,#8B5CF6)\"></div>",
  "footerHtml": "<div style=\"position:absolute;bottom:0;left:0;right:0;height:32px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;font-size:12px;color:#94A3B8\"><span></span><span>{{SLIDE_NUM}} / {{SLIDE_TOTAL}}</span></div>",
  "bgCss": "#FFFFFF"
}
```

### 5. Generate each slide's content zone

For each slide entry in the outline, generate **one standalone HTML page**. Iterate
sequentially — do not generate in parallel — so the model can keep the previous
slide's visual choices in working memory for consistency.

Per-slide prompt structure:

- **Role:** elite presentation designer.
- **Objective:** produce a single 1920 × 1080 slide for slide number *i* of *N*.
- **Context:**
  - `design_system_context` from step 2.
  - `deckTitle`, slide `title`, slide `contentBrief`, slide `role`.
  - The shared chrome (`themeStyle`, `headerHtml`, `footerHtml`, `bgCss`) from
    step 4 — these are **inserted into the slide markup verbatim**, not
    regenerated per slide. `themeStyle` goes in `<head>`; build the slide with
    the token-bound utilities it defines.
  - The previous slide's HTML (if any), passed for consistency anchoring. The model
    must match the typographic rhythm and visual language of prior slides; only the
    content zone changes.

Slide-mode constraints (apply on every slide — taken verbatim from the **Slide**
section of `knowledge/mode-constraints.md`):

- **Viewport (critical):** each slide is **exactly 1920 × 1080 px**. Root element
  `w-[1920px] h-[1080px] overflow-hidden relative`. The `<body>` must set
  `width:1920px; height:1080px; overflow:hidden; position:relative; margin:0;`.
  Nothing may extend beyond 1920 × 1080. No scrollbars. No clipped content.
- **Fill & fit (critical):** content must fill the **entire** viewport. Put
  `h-[1080px]` (or `min-h-[1080px]`) on the main wrapper and use
  `flex flex-col justify-between` or CSS Grid to distribute content vertically. No
  large empty regions — if content is sparse, scale up typography, increase
  spacing, or add visual elements.
- **Typography:** Display/Title 64–96 px / Bold, H1 48 px / Bold, H2 36 px /
  Semibold, Body 24–28 px, Caption 18 px. Headlines should be large; body text
  substantial.
- **Layout:** generous edge padding (60–120 px). Centre content within the padded
  area.
- **Colours:** high-contrast text on solid or gradient backgrounds. No low-contrast
  text. Use the `themeStyle` token utilities (`text-primary`, `bg-surface`, …);
  don't hardcode hex for values a DS token already covers.
- **Backgrounds:** each slide has a distinct full-bleed background — solid,
  gradient, or subtle pattern. The shared `bgCss` from chrome is the default; a
  slide may darken/tint it but must stay inside the DS palette.
- **Speaker notes:** include `<div data-speaker-notes="...">` as the **last child**
  of the slide body, hidden with `display:none`, holding 1–3 sentences the
  presenter would say. This element is **required** on every slide.
- **Hierarchy:** one main idea per slide. Bold headline, minimal body text — think
  keynote slide, not document.
- **Imagery:** large hero images where appropriate; images are decorative, not
  informational.
- **Consistency:** all slides in a deck share the same palette, font family, and
  design language.

Plus the universal style guide from `mode-constraints.md` — Tailwind utilities
only, Lucide icons initialised once, Chart.js canvases wrapped, every `<img>`
carries the `onerror` fallback, no `source.unsplash.com`, no lorem ipsum.

Role-specific notes for the content zone:

- **title** — large centred title (Display/Bold), short subtitle, no body copy.
- **content** — heading + 3–5 bullets or a short body paragraph. Avoid wall-of-text.
- **two_column** — left half text (heading + body), right half image or visual
  block. Generous gap between columns.
- **image_text** — full-bleed image as the background of the content zone, with
  high-contrast headline text overlaid. Add a subtle dark scrim if needed for
  contrast.
- **quote** — large centred quote in display type, attribution below in caption
  size. Quotation marks treated as a typographic element.
- **stats** — 3–4 stat cards in a flex row. Each card: big number (Display/Bold) +
  short label (Body). No charts.
- **section** — a single short phrase, centred, set very large. No body text.
- **cta** — primary call to action prominently placed, contact / next-step info
  below. One primary action only.

After the model emits each slide, immediately:

```sh
ui autofix slides/<NN>-<role>.html --write
ui validate-layout slides/<NN>-<role>.html
```

Fix any structural-error findings before moving on to the next slide. If `ui
validate-layout` reports a slide whose root is not 1920 × 1080, regenerate that
slide — the constraint is non-negotiable.

### 6. Slide-by-slide critique

Run `templates/workflows/critique.md` on each slide **before** moving to the next.
This is the slide-level gate. A slide that cannot reach threshold within the
critique's cap is surfaced to the user; the workflow continues to the next slide so
the deck still collates, but the failing slide is marked in the manifest.

The critique pays extra attention to:

- **Layout** — viewport is exactly 1920 × 1080, content fills it, no clipped or
  overflowing nodes.
- **Typography** — display-scale headlines (≥ 48 px), no body text below 18 px.
- **Consistency** — the same palette and font family as prior slides in this deck.
  A slide that drifts from earlier slides' visual language fails Consistency.
- **Speaker notes presence** — a slide with no `data-speaker-notes` element fails
  the gate automatically (mode-constraint hard rule).

### 7. Collate the deck

After every slide has been generated and gated, replace placeholder tokens and
write the deck manifest:

- For every slide, replace `{{SLIDE_NUM}}` with the slide's 1-based index and
  `{{SLIDE_TOTAL}}` with `N`.
- Write a `slides/manifest.json` capturing `deckTitle`, the persona slug, the
  chrome (`headerHtml`, `footerHtml`, `bgCss`), and per-slide entries
  (`{ index, title, role, file, critiqueScores, status }`).
- Build a thin `index.html` that lists the slides in order with anchor links to
  each individual slide file. The `index.html` is **not** itself a slide; it is a
  table of contents.

Optional final pass: `ui export slides/<NN>-<role>.html --out dist/<NN>.html` to
produce minified per-slide artifacts ready for handoff.

## Outputs

- `slides/<NN>-<role>.html` — one file per slide, `NN` zero-padded, 1920 × 1080,
  containing the shared chrome + the role-specific content zone + the speaker-notes
  element.
- `slides/manifest.json` — the deck manifest from step 7.
- `slides/index.html` — table-of-contents page linking each slide.
- *(optional)* `dist/<NN>.html` — minified handoff copies.

## Quality gate

Two-level gate:

1. **Per-slide gate** (step 6) — every slide must pass `critique.md` on the 6+1
   axes, with the slide-specific emphases above. Slides that cannot reach
   threshold are marked `status: "needs-attention"` in the manifest and surfaced to
   the user.
2. **Deck-level gate** — after collation, run the consistency axis one more time
   across the deck as a whole. Sample three to five slides, including the title
   slide, a content slide, and the closing CTA. The deck fails Consistency if any
   of these are true:
   - Two slides use different primary font families.
   - Two slides use different background treatments outside the chrome's `bgCss`
     palette.
   - Two slides use noticeably different typographic rhythm (e.g. one with 48 px
     headlines, another with 96 px headlines, on similar-density content).
   - One or more slides are missing the shared chrome.

A deck-level Consistency failure rolls back to step 4 (regenerate chrome with
tighter constraints) **or** to step 5 for the drifting slides — never to step 3.
The outline does not get re-planned to fix a styling drift.

The deck is finished when every slide passes the per-slide gate and the deck-level
Consistency check passes.
