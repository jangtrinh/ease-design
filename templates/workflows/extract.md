---
description: "Extract a design system from existing HTML. Use when the user provides HTML and wants its tokens and components harvested into a project design system."
---

# Workflow — `/ui:extract`

## Title

`/ui:extract <file.html>` — **extract a design system from existing HTML or
source code**. Read a single HTML artifact — or the 3–5 representative source
files a code project supplies (component files + stylesheets, sampled per
`learn.md` §3a) — infer its underlying design language (tokens + reusable
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
- The project is a **code repo** (React/Vue/Svelte/etc.) with no representative
  HTML file — `/ui:learn`'s code route (`learn.md` step 3) samples 3–5 source
  files and hands them here directly (spec 009 P4, D5).

---

## Inputs

| Input | Source | Required | Notes |
|---|---|---|---|
| `<file.html>` **or** 3–5 source files | path argument(s) | yes | **Either** a single HTML artifact **or** the 3–5 representative source files `learn.md` §3a already samples for a code project (component files + their paired stylesheets). Everything from step 1 on reads the input as one or more files to walk together — there is no HTML-only restriction downstream (spec 009 P4, D5: this row was the sentence that closed the road to every code project). |
| Project DS state | `design/ds.manifest.json` (via `ui ds status`) | yes | Determines whether step 4 calls `ui ds init` fresh or `ui ds init --force` to replace an existing system. |
| Token taxonomy | `knowledge/token-taxonomy.md` | yes | Defines the DTCG primitive / semantic two-tier model the extracted tokens must conform to. |
| Color science | `knowledge/color-science.md` | yes | Defines how to bucket observed hex values into the 11-stop OKLCH scale and how to map them to semantic roles. |
| Component catalog | `knowledge/component-catalog.md` | yes | Defines the canonical category + variant naming (`Button/Primary`, `Card/Pricing`, etc.) that the extraction must use. |
| Persona index | `knowledge/persona-index.md`, `knowledge/personas/*.md` | yes | Used to synthesize a "best-fit" persona slug when the DS is being initialized from scratch. |

---

## Steps

### 1. Read the source

**HTML input**: Load `<file.html>` from disk. Hold the full markup in working
memory. If the file exceeds ~80k characters, strip runs of base64 image data
before analysis (they tell you nothing about tokens or components). Do not
strip CSS, classes, or inline style attributes — those are the extraction
signal.

**Code input** (3–5 sampled source files, per `learn.md` §3a and its code-route
decisions D1/D2/D4): load every sampled file — component source
(`.tsx`/`.jsx`/`.vue`/`.svelte`) and its paired stylesheet — and hold them all
in working memory together. Steps 2–9 below treat "the document" as the union
of every sampled file; a class string or component export repeated across
files is the same repetition signal step 2 already looks for inside one HTML
page.

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

#### Interaction-state evidence

Static markup shows the *default* state, but the feel of a system lives in its
interaction states and motion. This is the **canonical** doctrine for state
harvesting — other workflows (e.g. `/ui:learn`) reference this section rather
than restating it. Scan the sampled CSS, `<style>` blocks, and any Tailwind
config for `:hover`, `:focus`, `:focus-visible`, and `:active` rules, plus every
`transition` and `animation` / `@keyframes` declaration. For each component you
register (step 8), pass the subset you *actually observed* to
`ui registry register … --states <observed>` — only states with evidence, never
a fabricated one. **The kernel folds each observed state into `variants` as
`State=<PascalCase>` (e.g. `State=Hover`); the record's separate `states` field
stays unset** (spec 009 D3 — measured 0/537 populated in platform-design-system
and 0/27 in the `ds init` kit, so the doctrine here now describes where states
actually live instead of a field no emitter ever wrote). Separately, distil the
motion signature into a one-line
**Motion identity** note in the summary (e.g. "150ms ease-out hovers, 2px lift
on cards, no entrance animation") — it is the interaction fingerprint later
generation must match. Where the source has no observable interaction states
(pure static HTML), say so: an absent hover is data, not a gap to invent.

#### Evidence grade

Every value that enters the DS must be **SOURCE-grade** — it traces to
deterministic extraction: real file contents, a computed style, or a `ui`
command output (`ui designmd extract-tokens`, `ui color convert`,
`ui color scale`). A value the model merely remembers, pattern-matches from a
framework's defaults, or infers to "fill a gap" is **GUESS-grade** and must
never enter the tokens or the registry. This is the **canonical** anti-
hallucination rule that `/ui:learn` and other extraction flows reference.
Exclude every GUESS-grade value and list it under an explicit **"unverified"**
heading in the summary, so the user sees exactly what was and was not learned.
When a token slot has no observed value, leave it unset rather than padding it
with a plausible default — a smaller true system beats a larger invented one.

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

If `ui ds init` exits non-zero, split by **argument provenance** (run with
`--json` for `error.code` + `error.message`). Recoverable — the failing
argument was model-derived; fix it and re-invoke ONCE (hard cap, one
retry): `BAD_NAME` → re-slugify the filename stem; `PERSONA_NOT_FOUND` →
re-run the step-5 synthesis and pick the next-nearest persona;
`BAD_INTENT` → trim to ≤ 512 chars. Terminal — surface `error.message`
and stop: `BAD_BRAND_HEX` (user-supplied — ask for a valid `#RRGGBB`),
`DS_TAMPERED`, `DS_EXISTS` without confirmed `--force`, and any
privacy/permission stop. If the single retry fails again, treat it as
terminal.

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

Mirror the change into memory with the same reason:

```sh
ui memory record token_change --data '{"path":"<token.path>","from":"<old>","to":"<new>","reason":"<same reason>"}'
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

Record the harvest as the provenance seed:

```sh
ui memory record harvested --data '{"source":"<url-or-path>","what":"<tokens/components summary>"}'
```

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
  what you see, don't fabricate. The flag still validates against this enum,
  but each value now lands in `variants` as `State=<PascalCase>` — not in the
  record's `states` field, which the kernel leaves unset (spec 009 D3).

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

### 10. Run the DS-validity gate

Extraction produces a Design System on disk, **not** rendered HTML. The
6+1-axis taste gate in `templates/workflows/critique.md` scores rendered
markup against a persona's craft targets — it has no input to grade here.
Extraction therefore does **not** hand off to `critique.md`. Instead, the
closure step is a DS-validity gate: a fixed set of checks that prove the
extracted artifact is internally consistent, accessibility-clean, and
mutable through the canonical mutation surface.

State explicitly to the user: *"extraction has no rendered HTML, so the
6+1-axis taste gate does not apply; this DS-validity gate is the closure
step."*

Run all four checks. Every one must pass — surface any failure to the
user with the suggested remediation and stop the workflow.

1. **Manifest + tokens + registry load cleanly.**

   ```sh
   ui ds context --strict --format json
   ```

   Must exit `0`. A non-zero exit — especially `DS_TAMPERED` — means
   the manifest hash does not match the tokens + registry on disk; the
   extraction left the DS internally inconsistent and must be re-run.
   Surface the exit code to the user and stop.

2. **Registry sanity.**

   ```sh
   ui registry list --json
   ```

   Inspect the JSON envelope. The component count should be plausible
   for the source (no silent drops between step 8 and now). Every
   record must use a canonical `Category/Variant` name and declare at
   least one entry under `tokensUsed` — a registry record with zero linked
   tokens means the component was registered without proving it
   consumes the token store, which fragments the system.

3. **Color-contrast spot check on semantic palette pairs.** For every
   semantic foreground/background pair in the extracted tokens
   (typically `color-text-body` over `color-surface`,
   `color-text-muted` over `color-surface`, primary action text over
   `color-primary`, danger text over `color-danger`), resolve each
   alias to its primitive and run:

   ```sh
   ui color contrast <foreground-hex> <background-hex>
   ```

   Body text pairs must clear **WCAG 4.5 : 1**; large-text and
   non-text UI pairs must clear **3 : 1**. Any pair below threshold
   gets reported to the user with the suggested remediation — pick a
   different primitive stop for the failing semantic role and re-run
   `ui ds change-token` on that path (covered in check 4).

4. **Token-graph round-trip via the sanctioned mutation surface.**
   Confirm a known semantic alias can be repointed and resolves
   correctly:

   ```sh
   ui ds change-token color.primary --value "{blue.600}"
   ui ds context --strict --format json
   ui ds change-token color.primary --value "{<original-primitive>}"
   ```

   The intermediate `ds context` must succeed (manifest re-seals
   cleanly, dependency graph stays acyclic). The final
   `change-token` restores the original alias so the round-trip is
   non-destructive. A failure here means the token graph the
   extractor produced cannot survive a normal rebrand operation —
   the DS is sealed but brittle.

When all four checks pass, the extracted DS is the project's source of
truth for every subsequent `/ui:generate`. Generated HTML *will* run
through `critique.md` per its own contract; the DS itself does not.

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
  contrast or scale issues surfaced by the DS-validity gate (step 10),
  and the path `ui ds context` will read from on subsequent calls.
- **No new HTML.** Extraction is a system-building workflow, not a
  generation workflow. Run `/ui:generate` next to produce HTML that lives
  inside the extracted system.

---

## Quality gate

Extraction does **not** defer to `templates/workflows/critique.md` — the
taste gate scores rendered HTML against persona targets, and extraction
has none. The closure step is the **DS-validity gate** defined in step
10: `ui ds context --strict --format json` exits clean, `ui registry
list --json` shows plausible counts and canonical names with linked
tokens, `ui color contrast` clears WCAG on every semantic
foreground/background pair, and a `change-token` round-trip leaves the
manifest re-sealed. The workflow is complete only when all four checks
pass. On persistent failure — usually a contrast pair that can't clear
threshold without changing the palette — surface the failing check and
the remediation to the user; the remediation is typically "pick a
different primitive stop for the failing semantic role and re-run
`ui ds change-token` on that path".

Generated HTML produced by subsequent `/ui:generate` runs against the
extracted DS *will* be scored by `critique.md`, including its 7th
Consistency axis (which is exactly what the registry + tokens populated
here exist to enforce). That is the right time for the taste gate, not
now.
