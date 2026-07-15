# Page Structures — shape before dress

A persona decides how a page *looks*; a macrostructure decides how it is *shaped*. Two
surfaces can share a persona and still be different pages — or share nothing and read as
the same generated template. This file is the shape layer that sits between persona
selection and code: pick the shape first, dress it second.

## §1 Macrostructure — choose the shape before you dress it

A **macrostructure** is a page's whole shape as one package: where the heading sits, how
the body composes, the divider language, the button voice, the image treatment, and how
content reveals on scroll. It is one named choice, not six knobs you set independently —
picking "Bento Grid" settles all six at once, coherently. Six loose axes drift into the
default attractor (centered hero, three cards, four-column footer); one committed shape
does not.

**State the pick as text before you write any code** — `Macrostructure: Stat-Led — the
brief leads with a measured result, so the number is the composition`. Choosing on paper
forces a reason; choosing in your head defaults to the template you have built most often.

### The catalog (21 shapes — one line each; pick one, then build it)

- **Bento Grid** — a mosaic of unequal tiles, each a self-contained proof; density without a table.
- **Long Document** — a single reading column, generous measure, headings as the only chrome.
- **Marquee Hero** — one oversized statement owns the fold; everything below is footnote.
- **Stat-Led** — a measured number is the composition; supporting copy orbits it.
- **Workbench** — a live control surface up top, results below; the page is a tool, not a pitch.
- **Conversational FAQ** — the page is a sequence of real questions answered plainly.
- **Manifesto** — declarative stance, large type, argument paced as one continuous scroll.
- **Photographic** — full-bleed imagery carries meaning; type is caption, not headline.
- **Quote-Led** — a single strong quote anchors the fold; attribution does the credibility work.
- **Specimen** — the artifact itself on display (a component board, a font, a palette), labelled.
- **Catalogue** — an ordered set of like items, each entry equal weight, scannable.
- **Letter** — addressed, signed, first-person; intimacy over polish.
- **Index-First** — a table of contents *is* the page; navigation is the content.
- **Narrative Workflow** — a before→during→after story that walks one path end to end.
- **Split Studio** — a persistent two-pane split (nav/detail, input/output) held across scroll.
- **Feature Stack** — alternating full-width feature bands, each a single idea, paced with air.
- **Type Specimen** — the typeface *is* the subject; the scale and pairing are the demo.
- **Portfolio Grid** — a grid of work, image-forward, each cell a door to a case.
- **Map-Diagram** — a spatial or schematic layout where position encodes relationship.
- **Ecosystem Index** — a hub that routes to many surfaces; the shape is the routing map.
- **Component Playground** — an interactive sandbox; the reader drives, the page responds.

### Reading the pick out of the brief

Let the brief's centre of gravity choose the shape. A measured result → Stat-Led. A single
strong claim → Marquee Hero or Manifesto. A tool the reader operates → Workbench or
Component Playground. A set of like things → Catalogue, Bento Grid, or Portfolio Grid. A
sequence to walk → Narrative Workflow. Reference material to navigate → Index-First or Long
Document. When two shapes both fit, prefer the one your last surface did *not* use (§2).

## §2 Diversification & memory — resist the default attractor

**Rule.** Two consecutive outputs for two *different* briefs must differ in **structural
fingerprint** — measured as structural distance, not a recolor. Swapping the persona is not
variety; a Bento in blue and a Bento in green are the same page.

The fingerprint is the tuple worth diffing: **macrostructure name · section order · number
of sections · focal placement (which viewport owns the eye) · reveal behaviour (static vs
scroll-driven) · nav+footer archetype**. Two surfaces that match on all six read as one
template even in different palettes; changing at least the macrostructure and the focal
placement is the floor for "a different page".

**Mechanism.** Stamp the chosen macrostructure into the artifact provenance (the generator
already writes stamps), and read the *previous* surface's stamp so the next pick can
exclude the last one. Memory is what turns "pick one" into "pick a *different* one".

**The variety↔conformance switch — the load-bearing decision here.**
- **No locked design system yet** → **variety mode**: every surface earns its own
  fingerprint. Sameness is the failure.
- **A design system exists** (a `design/` store, components at lifecycle `stable`) →
  **conformance mode**: the pages must *share* the system, and divergence is now the bug.
  The curator's DS-conformance gate already enforces this direction.

Switching modes is a deliberate call (a new marketing initiative *may* branch away from the
product DS on purpose), never accidental drift — say which mode you are in before you build.

## §3 Honest copy — never fabricate evidence

Do not invent evidence to fill a shape. No made-up metrics (`10× faster`, `trusted by
50,000+ teams`), no fictional testimonials, no logo wall of companies that are not
customers, no case-study count you cannot source. When the real number is missing, either
render an explicit placeholder (`—` beside `metric to confirm`) or change the
macrostructure away from Stat-Led — a shape that needs a number you do not have is the
wrong shape.

**A number is never a hero's only headline.** A bare figure means nothing; it stands next
to the words that say what it measures and why it matters.

**Machine floor.** `ui content-lint` catches the crude fills — `lorem-ipsum`,
`placeholder-copy`, and the new `placeholder-name` (Jane Doe / Acme filler shipped as
copy). Whether a *present* number is actually true is judgment the linter cannot reach —
the model owns that honesty. See `content-design.md` § Honest copy for the microcopy rule.

## §4 Pre-emit self-critique — six axes before you hand back

Before returning any generated surface, self-score it 1–5 on **Philosophy · Hierarchy ·
Execution · Specificity · Restraint · Variety**. Any axis below 3 → fix it, then hand back.
Never hand back weak work wrapped in an apology; the fix is cheaper than the excuse.

This is a *judgment* layer, and it sits in a stack of three that do not substitute for each
other:
1. **Machine floor** — `taste-lint` / `a11y-lint` / `validate-layout` / `content-lint`.
   Binary, un-negotiable; you cannot talk past a failing check.
2. **Self-critique** — the six axes above, sitting on the floor, catching what no regex can.
3. **Curator facets** — the deep, evidence-cited scoring when there is time to run it.

*Example from this repo:* the figma-agent panel once repeated the connection-pill's
information into its meta line — a Restraint-below-3 duplication — and it was cut before
ship (commit `a6c90e3`). The floor was green the whole time; only self-critique caught it.

## §5 Chrome tells — nav, footer, hero

Some shapes are so over-produced they read as generated on sight. Use them only when the
page *genuinely* needs nothing else, and reach for a deliberate archetype otherwise.

- **The AI nav** (wordmark left · 4–5 links · button right · hairline bottom border) and
  **the AI footer** (four link columns · social row · copyright line) are the most-
  recognized fingerprints on the web. They are not wrong — they are *default*. Choose them
  on purpose, not by reflex.
- **Eyebrow / section-tag:** default OFF. When you do use one, stack the tag vertically
  **above** the heading in the same column. The tag-left / heading-right same-row layout is
  a banned tell.
- **Hero:** the core (headline + lede + primary CTA) must fit the 1280×800 fold. A hero
  never builds *fake* chrome to look substantial — no drawn browser bar, phone frame, or
  IDE window. Use a real screenshot or drop the chrome entirely.
- **The AI-glow gradient:** a large indigo/violet/magenta background gradient (radial glow
  behind the hero, `from-indigo-500 … to-purple-600` full-bleed) is the loudest
  machine-default surface tell. Reach for it only when the brand *is* that hue; otherwise
  recolor to the brand or drop the gradient for a flat/tinted surface.

**What the machine already catches (do not spend judgment re-inspecting these):**
`taste-lint` owns `italic-display-heading`, `uppercase-tight-line-height`,
`overshoot-easing`, `focus-ring-animates-in`, `z-index-inflation`, `z-index-off-ladder`
(a `z-index` off any base-10 ladder step), `ai-cliche-gradient` (large violet-band background
gradient), `mode-invisible-surface` (a low-alpha white surface on a light page, or black on a
dark page — a boundary that passes contrast but shows nothing), `font-scale-sprawl` (more than
7 hand-picked font sizes), and `tap-target-undersized` (interactive control under the 44px
touch minimum); `validate-layout` owns `css-100vw-width`, `root-overflow-x-hidden`,
`clickable-no-pointer` (a non-native clickable with no `cursor:pointer`), and
`font-display-missing` (a font with no `font-display` → FOIT + swap-in shift). If a tell is on
that list, the linter has it — spend your attention on the tells that are not.

## §6 When to read this file

Read this when you are shaping a **standalone page** — a landing / marketing / docs surface
(the Design-OS `brand/design` initiative), a customized `ds preview` chrome, or any page
that stands on its own. Do **not** apply the macrostructure catalog to a single component:
a component has eight states, not a hero, and `figma-craft/component-design.md` is its brain.

**Cross-refs:** `figma-craft/workflow-experience.md` (preview-first — lock the shape on the
cheapest medium before committing to it) · `content-design.md` (§ Honest copy) ·
`taste-rubric.md` (the axis definitions the machine floor enforces).
