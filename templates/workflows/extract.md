# Workflow — `/ui:extract`

## Title

`/ui:extract <file.html>` — **extract a design system from existing HTML**. Read
a single HTML artifact, infer its underlying design language (tokens + reusable
components), and write that language back into the project's design-system
store as a real, enforceable SSOT.

This workflow is the **inverse of `/ui:generate`**: generate produces HTML
*from* a design system; extract produces a design system *from* HTML. The output
is a populated `design/` directory (`design.tokens.json`,
`component-registry.json`, `ds.manifest.json`), not new HTML.

Use `/ui:extract` when:

- The user has a hand-coded or imported HTML page and wants ease-design to
  enforce its design language on every subsequent generation.
- The user is starting from a competitor, dribbble shot, or in-house mockup
  rendered to HTML and wants to capture the system for reuse.
- The project has no DS yet — `/ui:extract` will compile a brand-new one.
- The project has a DS but the user wants to *replace* it with one derived
  from the supplied HTML (explicit `--force` on `ui ds init` step 4).

---

## Inputs

| Input | Source | Required | Notes |
|---|---|---|---|
| `<file.html>` | path argument | yes | A single HTML artifact. Multi-file extraction is out of scope for v1; if the user has multiple HTML files, ask them to pick the most representative one. |
| Project DS state | `design/ds.manifest.json` (via `ui ds status`) | yes | Determines whether step 4 calls `ui ds init` fresh or `ui ds init --force` to replace an existing system. |
| Token taxonomy | `knowledge/token-taxonomy.md` | yes | Defines the DTCG primitive / semantic two-tier model the extracted tokens must conform to. |
| Color science | `knowledge/color-science.md` | yes | Defines how to bucket observed hex values into the 11-stop OKLCH scale and how to map them to semantic roles. |
| Component catalog | `knowledge/component-catalog.md` | yes | Defines the canonical category + variant naming (`Button/Primary`, `Card/Pricing`, etc.) that the extraction must use. |
| Persona index | `knowledge/persona-index.md`, `knowledge/personas/*.md` | yes | Used to synthesize a "best-fit" persona slug when the DS is being initialized from scratch. |

---

## Steps

### 1. Read the source HTML

Load `<file.html>` from disk. Hold the full markup in working memory. If the
file exceeds ~80k characters, strip runs of base64 image data before analysis
(they tell you nothing about tokens or components). Do not strip CSS, classes,
or inline style attributes — those are the extraction signal.

### 2. Discover candidate components

A "component" here is **any markup pattern that repeats** or **any markup
pattern that visibly carries a distinct, reusable role** (e.g. a hero shows
once but is unmistakably a hero). Walk the document and list candidates:

- **Repetition signal.** Identify class strings or wrapper structures that
  appear two or more times — pricing tiers, feature cards, nav items, list
  rows, form fields, badge chips, icon buttons.
- **Role signal.** Identify singletons whose role is unambiguous from
  structure or className — `<nav>`, `<header>`, `<footer>`, `<form>`, an
  obvious hero `<section>`, a pricing block, a testimonial block.
- **Granularity rule.** Capture both **layout-level** patterns (hero, pricing
  grid, footer) and **atom-level** patterns (primary button, secondary button,
  badge, input). De-duplicate by visual identity, not by exact class string —
  three slight variants of the same button are one `Button/Primary`, not three.

For each candidate, record:

- A short lowercase-hyphenated working name (e.g. `pricing-card`,
  `primary-button`, `feature-grid`, `bottom-nav`).
- The outermost containing element + its class list.
- The minimal complete markup fragment (the outer container and its full
  child tree).
- The states visible in the source (default, hover, active, focus, disabled
  where present — usually only default is observable in static HTML; record
  the others as gaps).

Aim for **5–30** candidates per artifact, weighted toward what the user
actually reuses. Throw away one-off decorative blobs.

### 3. Map each candidate to a canonical name + category

Open `knowledge/component-catalog.md`. The catalog defines 32 components
across 8 categories. For every candidate from step 2:

1. **Find the closest catalog entry** by role. A "pricing-card" maps to
   `Card/Pricing`; a "primary-button" maps to `Button/Primary`; a top nav with
   logo + links + CTA maps to `Navigation/TopNavBar`.
2. **Adopt the canonical PascalCase name** — `Category/Variant` per the
   registry naming rules in `knowledge/component-catalog.md` and the
   `ui registry` help. If no catalog entry matches, invent a new
   `Category/Variant` name that follows the same PascalCase pattern
   (e.g. `Card/StatTile`). Do not coin lowercase or hyphenated names — the
   registry schema rejects them.
3. **Record the category** explicitly — it is a required flag on
   `ui registry register`. Use the 8-category set from the component catalog
   when possible; introduce a new category only when none fits.

The output of this step is a working list of canonical components, each with
its markup fragment, category, and observed states.

### 4. Extract design system foundations (tokens)

Walk the same HTML again, this time for **token usage**. The goal is a DTCG
two-tier `design.tokens.json` per `knowledge/token-taxonomy.md`. Pull
**observed values only** — no guesses, no padding with defaults.

For each token family:

- **Colors.**
  - Collect every unique `#hex`, `rgb()`, `rgba()`, `hsl()`, and `oklch()`
    value from `style=`, `<style>` blocks, and Tailwind arbitrary values
    like `bg-[#1a1a2e]`. Standard Tailwind class names (`bg-slate-900`) are
    **not** raw values — they are signals; bucket them into roles in the
    semantic step below or resolve them to their CSS values if a Tailwind
    config is inlined.
  - Convert every collected color to OKLCH using `ui color convert` so the
    rest of the pipeline runs in OKLCH per `knowledge/color-science.md`.
  - Cluster the colors into role buckets: primary, neutral, success,
    warning, danger, info, background, foreground. Use perceptual distance
    (`ui color contrast`) to pick the strongest sample per role.
  - For each role, generate an 11-stop scale anchored at the chosen sample:
    `ui color scale <hex>` (the scale always returns 11 stops — 50, 100,
    200, …, 900, 950). These become the **primitive** color
    tokens (`color.primary.50` ... `color.primary.950`, etc.).
  - Map semantic roles (`color.bg`, `color.fg`, `color.accent`, `color.brand`,
    `color.success`, `color.warning`, `color.danger`, `color.muted`) onto
    specific primitive stops — these become the **semantic** color tokens
    whose `$value` is an alias (`{color.primary.500}`) per the DTCG model.
  - Run `ui color contrast` between every semantic foreground/background pair
    you intend to ship and verify WCAG 4.5:1 (text) / 3:1 (large text). If a
    pair fails, pick a different stop and re-check — do not ship a DS that
    fails its own contrast contract.
- **Typography.**
  - Collect every `font-family` value (inline, `<style>`, and Tailwind
    `font-[...]` arbitrary classes). Cluster into display vs body families.
  - Collect every distinct font-size used. Bucket into a t-shirt scale
    (`xs / sm / base / md / lg / xl / 2xl / 3xl / 4xl`) by sorting the
    observed sizes and assigning each cluster a slot.
  - Collect every distinct font-weight. Normalize to numeric (300, 400, 500,
    600, 700, 800) — Tailwind `font-bold` is `700`, etc.
  - Output as primitive `font.family.display / body`, `font.size.<slot>`,
    `font.weight.<slot>`, `font.lineHeight.<slot>` tokens.
- **Spacing.**
  - Collect every distinct padding, margin, and gap value (px, rem). Find the
    smallest non-zero value; treat it as the candidate base unit.
  - Verify the other values are integer (or half-step) multiples of the base
    unit. If they are, the source uses a real grid — ship that grid as the
    spacing scale (`space.0 ... space.16`). If they are noise, snap to the
    nearest multiple and document the snap in the manifest changelog.
- **Radii / borders / depth.**
  - Collect every distinct `border-radius`, `border-width`, and `box-shadow`
    value. Each becomes a primitive token (`radius.sm / md / lg / full`,
    `border.width.thin / regular / thick`, `shadow.sm / md / lg / xl`).
  - For shadows, capture whether they are brand-tinted (`rgba` of the brand
    hue) or neutral — that distinction belongs in the persona's depth
    description but the *values* live as tokens.

The output of this step is a complete `design.tokens.json` in the DTCG
two-tier shape defined by `schemas/design.tokens.schema.json`. Validate it
locally by running `ui tokens compile <draft.tokens.json> --target css` and
confirming the compile succeeds; alias cycles, dangling aliases, or type
mismatches surface as compile errors and must be fixed before step 5.

### 5. Synthesize a persona slug for the manifest

Every project DS needs a persona slug in the manifest. When extracting from
existing HTML, no human picked a slug — synthesize the closest match:

1. Build a keyword bag from the source: dominant color mode (light/dark),
   density (compact / comfortable / spacious based on observed spacing
   scale), typography character (serif / sans / mono / display), depth
   character (flat / shadow / glass / clay / neon).
2. Run the persona-index scoring routine from `knowledge/persona-index.md`
   §2 against the bag, with no UI-type filter (extraction is post-hoc, the
   artifact's UI type is observable but not authoritative).
3. Pick the top-scored persona. If no persona clears
   `MIN_SCORE_THRESHOLD = 3`, pick the closest by manual reading of
   `knowledge/personas/*.md` — the slug is a label for downstream context,
   not a generation directive, so a near-fit is acceptable.

Record the chosen slug for step 6. The fact that this is a synthesized
match — not a user choice — is captured by the `intent` field, which is
fixed at `"extracted from existing HTML"` (see step 6).

### 6. Initialize (or replace) the project design system

Decide between fresh init and forced re-init:

```bash
ui ds status --json
```

- **Exit code 0** → a DS already exists. Confirm with the user before
  destroying it. If confirmed, init with `--force`:
  ```bash
  ui ds init <name> --persona <synthesized-slug> \
      --intent "extracted from existing HTML" --force
  ```
  `--force` overwrites the artifacts but **preserves the prior changelog**
  per the `ui ds` help; the new init entry appends.
- **Error code `DS_NOT_FOUND`** → no DS exists. Fresh init:
  ```bash
  ui ds init <name> --persona <synthesized-slug> \
      --intent "extracted from existing HTML"
  ```

`<name>` is the project's design-system name — default to the artifact's
filename stem (`my-page.html` → `my-page`) if the user does not supply one.

`ui ds init` writes the three artifacts under `design/`:
`design.tokens.json`, `component-registry.json`, `ds.manifest.json`. The
tokens file it writes is the **persona's** default — that is not yet the
extracted system.

### 7. Replace the persona-default tokens with the extracted tokens

The DS at this point holds the synthesized persona's default tokens, not
the ones you extracted in step 4. Apply the extracted values one token at a
time using the only sanctioned mutation:

```bash
ui ds change-token <path> --value <v>
```

Walk the diff between the persona-default tokens and the extracted draft
from step 4. Read the persona-default tree by parsing `design/design.tokens.json`
directly from disk — do **not** use `ui ds context --format json` for the
diff source: `ds context` returns a *truncated semantic-only summary*
intended for the host model's working context, not a full token tree, so
diffing against it under-counts on any project with more than a handful
of tokens. For every path that differs, issue a `change-token`. Each call bumps
`generation`, rewrites the canonical hash, and appends a changelog entry —
this is by design; the changelog becomes the audit trail of "we replaced
the persona defaults with extracted values".

Token rules to respect (enforced by the command, listed here so the
workflow can avoid the errors):

- No cycles, no dangling aliases, no type mismatches across an alias.
- Composite tokens (e.g. shadow) cannot be aliased to a single primitive —
  the command rejects with `BAD_VALUE`.
- A no-op update is idempotent — running `change-token` with the current
  value will not bump generation.

If the count of changes is large enough that one-by-one is unwieldy
(common — a fresh extraction differs on dozens of tokens), the host model
may batch the calls in a single shell invocation; each call is still
atomic.

### 8. Register every extracted component

For every canonical component from step 3:

```bash
ui registry register <Category/Variant> \
    --category <category> \
    --markup <component-fragment.html> \
    --tokens <token-path-1>,<token-path-2>,... \
    --variants <v1>,<v2> \
    --states <s1>,<s2> \
    --description "<one-line description>"
```

Where:

- `<Category/Variant>` is the PascalCase canonical name from step 3.
- `--category` is the lowercase category slug.
- `--markup` is the minimal complete fragment from step 2 — either inline
  via `-` and stdin, or a temp file path.
- `--tokens` lists the design tokens this component visibly uses (color,
  spacing, typography, radius). Best-effort from the markup; missing
  entries can be added later with `--force`.
- `--variants` lists the variant subnames you observed (e.g. for
  `Button/Primary` you might also have `Button/Secondary`, `Button/Ghost`;
  each registers separately, the `--variants` flag describes *intra-name*
  variation if any).
- `--states` is the subset of `{default, hover, active, focus, disabled}`
  observed in the source. Static HTML usually only shows `default`; record
  what you see, don't fabricate.

The registry file is auto-created on the first `register` if it doesn't
already exist (step 6 created an empty one via `ui ds init`).

### 9. Validate the extracted artifact

The extracted tokens + components must round-trip cleanly:

```bash
ui validate-layout <file.html>
ui ds context --strict
ui registry list --json
```

- `validate-layout` re-runs the structural + heuristic layout checks against
  the source. Any structural errors are flagged for the user (the source
  HTML may genuinely have layout bugs the extraction inherits).
- `ds context --strict` confirms the manifest, tokens, and registry load
  cleanly and that the "registered-components-only" enforcement preamble
  emits without error — i.e. the DS is internally consistent.
- `registry list` confirms every component you intended to register made
  it in, with the canonical names you assigned.

### 10. Hand off to the quality gate

Pass the extracted DS to `templates/workflows/critique.md`. The critique
gate scores the 6 taste axes plus the 7th Consistency axis. Extraction has
no generated HTML to score the visual axes against directly — instead, the
gate runs `ui ds context` and inspects:

- **Layout / Spacing** — does the spacing scale form a real grid (integer
  multiples of a base unit), or is it noise?
- **Typography** — is the font-size scale monotonic, with sensible ratios
  between steps, and at most 2 font families?
- **Color** — do all semantic foreground/background pairs pass WCAG 4.5:1
  (text) and 3:1 (large text)? `ui color contrast` is the oracle.
- **Depth / Surface** — is the shadow scale ordered (sm < md < lg < xl by
  ambient + spread), or arbitrary?
- **Consistency** — does the component count look right for the source (no
  silent drops), and does every registered component declare at least one
  token from `--tokens` (i.e. the registry actually links back to the token
  store)?

Iconography and Motion are not usually observable in static extraction —
the gate records them as N/A unless icon font / SVG hints and CSS
transitions/animations are present in the source.

---

## Outputs

- A populated `design/` directory in the project:
  - `design.tokens.json` — extracted DTCG two-tier tokens.
  - `component-registry.json` — every canonical component registered with
    markup fragment + token usage + observed states.
  - `ds.manifest.json` — sealed manifest with `intent = "extracted from
    existing HTML"`, the synthesized persona slug, and a changelog showing
    the init plus every `change-token` applied during step 7.
- A summary printed to the host model surface: counts (tokens extracted,
  components registered), the synthesized persona slug + family, any
  contrast or scale issues surfaced by the quality gate, and the path
  `ui ds context` will read from on subsequent calls.
- **No new HTML.** Extraction is a system-building workflow, not a
  generation workflow. Run `/ui:generate` next to produce HTML that lives
  inside the extracted system.

---

## Quality gate

Run `templates/workflows/critique.md` against the populated `design/`
directory. The gate scores the same 6 + 1 axes as every other workflow,
but the inputs it inspects are the manifest, tokens, and registry rather
than rendered HTML — see step 10 for the axis-by-axis mapping. The
workflow is complete only when the gate passes. On persistent failure
(e.g. contrast can't be made to pass without changing the chosen palette),
surface the failing axis + the suggested remediation to the user; the
remediation is usually "pick a different stop for the failing semantic
role and re-run `ui ds change-token` on that path".
