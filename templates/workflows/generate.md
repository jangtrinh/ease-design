---
description: "Generate three diverse UI variants from a plain-language intent. Use when the user asks to design, create, or mock up a screen, page, or app from a text description."
---

# Workflow: generate

`/ui:generate "<intent>"` — the central design-generation flow. Given a short
plain-language intent from a non-designer ("landing page for a new gym",
"analytics dashboard for fintech", "settings screen for a meditation app"),
this workflow classifies the UI type and industry, auto-selects three diverse
personas, ensures a project Design System exists, generates three HTML variants
— one per persona — runs the taste gate on each, applies deterministic
autofixes, and presents the three results for the user to pick by eye. The
user never touches a design parameter; the system supplies all of *how it
looks* while the user supplies *what* they want.

## Inputs

- **`<intent>`** *(required, string)* — the user's plain-language description.
  Pass it verbatim to step 1; do not paraphrase. Examples: `"landing page for
  a new gym"`, `"a dark analytics dashboard with charts and live metrics"`,
  `"settings screen for a meditation app"`.

- **`--mode <mode>`** *(optional)* — explicit UI mode override. One of
  `mobile`, `desktop`, `component`, `slide`, `dashboard`, `app`, `admin`,
  `ecommerce`. If omitted, the mode is derived from the classified UI type in
  step 1 (see `knowledge/mode-constraints.md` § "How a mode is chosen").

- **`--count <n>`** *(optional, default `3`)* — number of variants to
  generate. Each variant uses a different persona. Values outside `1..5`
  should be clamped and a note emitted to the user.

- **`--persona <slug>`** *(optional, repeatable)* — pin one or more personas
  instead of auto-selecting. When supplied, skip the scoring algorithm in
  step 2 and use the pinned slugs directly. If fewer slugs are pinned than
  `--count`, auto-select the remaining slots from the same filtered pool.

- **`--brand-hex <#rrggbb>`** *(optional)* — seed brand color used when
  compiling a new Design System in step 3. Ignored if a DS already exists in
  the project.

- **`--industry <slug>`** *(optional)* — explicit industry override (one of
  the keys in `knowledge/persona-index.md` § 3). When supplied, skip the
  industry classification in step 1.

## Steps

The host model performs the steps below in order. Each step is concrete: a
shell-quoted `ui` invocation, a `knowledge/` file to read, or a
narrowly-scoped prompt the model runs against itself. Do not skip steps.

### Step 1 — Classify UI type + industry from the intent

Internal prompt to the host model. Produce a compact, plain-text design
brief — no markdown fences, no commentary, no apology — using exactly this
structure:

```
UI_TYPE:   one of [landing, dashboard, app, admin, ecommerce, portfolio, documentation, social]
INDUSTRY:  one of [fintech, saas, healthcare, ecommerce, creative, education, ai-tech, social, enterprise, startup] or "general"
CONCEPT:   1-line summary of what to build
TARGET_USER: who uses it
SECTIONS:
  1) <Name> — 2-3 specific UI elements (buttons, cards, charts, tables, forms)
  2) <Name> — 2-3 specific UI elements
  3) <Name> — 2-3 specific UI elements
  4) <Name> — 2-3 specific UI elements
MOOD:      1-line atmosphere / visual direction
```

Rules:

- If `<intent>` is too vague to classify (a single noun, a feeling word, or
  empty), ask the user **one** clarifying question — "what kind of UI: a
  landing page, a dashboard, an app screen, an admin panel, a storefront, a
  portfolio, docs, or social?" — and stop until they answer.
- If `--mode component` or `--mode slide` is set, use the component / slide
  brief shape from `knowledge/mode-constraints.md` instead of the generic
  brief above. `UI_TYPE` may still be reported but it does not select the
  constraint set in step 4.
- Default `UI_TYPE` to `landing` if classification truly cannot pick one.
- Default `INDUSTRY` to `general` if no industry signal is present.
- Lower-case both values for downstream consumption.
- If `--industry <slug>` was provided, use it verbatim and skip industry
  classification.

Keep the brief in scratch state. It feeds steps 2 and 4.

### Step 2 — Select three personas

Read **`knowledge/persona-index.md`** and apply its auto-selection algorithm
exactly. Do not invent a persona; pick from the 23 personas in the lookup
table.

1. **Stage 1 — Filter by UI type.** Keep personas whose `ui_types` includes
   the `UI_TYPE` from step 1. If the filter yields zero personas, fall back
   to the full set of 23.
2. **Stage 2 — Score** each persona in the pool using the rule table in
   § 2 of the index: keyword direct (+3), keyword partial (+1, stems longer
   than 4 chars only, mutually exclusive with direct), UI-type bonus (+2,
   once), industry affinity strong (+5 when ≥2 keyword overlap), industry
   affinity weak (+2 when exactly 1 overlap), trending bonus (+1).
   Lower-case the entire prompt once up front for matching.
3. **Stage 3 — Threshold.** If no persona reaches `score >= 3`, the signal
   is too weak: run the fallback **family-diverse random selection** from
   § 5 — round-robin one persona per family, then top up.
4. **Stage 4 — `diverseTopK(count)`.** Sort scored personas by score
   descending; **Pass 1** walks the list adding a persona only if its
   family has not been used yet; **Pass 2** fills any remaining slots from
   the same sorted list ignoring family. `count` defaults to 3.

Skip the scoring loop entirely when `--persona <slug>` is supplied; use
those slugs in input order, then top up via stage 4 if more are needed.

For each chosen persona, **read once** the family file
`knowledge/personas/<family>.md` — for example
`knowledge/personas/material-surface.md` for the `liquid-glass` persona —
to load the full aesthetic DNA (typography, color philosophy, spacing,
depth, borders, texture, interactions, layout, anti-patterns, keywords,
density). Cache the loaded DNA per persona for steps 3 and 4. Do not load
families you did not select.

**Precondition — empty-DNA self-STOP.** After reading a family file, verify
the DNA is substantive: it must contain at least the typography, color, and
layout sections. If the file is empty, unreadable, or missing those
sections, do NOT proceed with a hollow persona — an empty worldview
degrades to generic output, not a safe default. Treat it like a
workflow-level `BAD_ROUND`: drop that persona, substitute the next-highest
scorer from the stage-4 list, and emit one line telling the user which
persona was substituted and why. (This is a self-check, not
`PERSONA_NOT_FOUND` — that code is an unknown-slug lookup error from
`ui ds init`.)

Emit a one-line confirmation per chosen persona: `slug · family · score`.

### Step 3 — Ensure a project Design System exists

Check whether the project already has a Design System on disk by calling:

```sh
ui ds status --json
```

Branch on the result.

#### Branch A — No DS yet (`status` returns `DS_NOT_FOUND`)

1. Pick the **highest-scoring** persona from step 2 as the seed; its
   aesthetic DNA anchors the DS.
2. Build a single-line intent string for the DS — the `CONCEPT` line from
   step 1 is a good source. Strip newlines.
3. Compile the DS:

   ```sh
   ui ds init "<project-slug>" \
     --persona "<seed-persona-slug>" \
     --intent  "<concept-line>" \
     [--brand-hex "<#rrggbb>"]
   ```

   `<project-slug>` is a stable kebab-case name for this project (derive
   from the directory name if the user did not provide one). Append
   `--brand-hex <#rrggbb>` ONLY when the user passed `--brand-hex` to
   `/ui:generate`; otherwise omit the flag entirely (do not emit an empty
   value). The intent string must be ≤ 512 chars or `ui ds init` rejects
   it with `BAD_INTENT`.

4. If `ui ds init` exits non-zero, split by **argument provenance** before
   surfacing anything (run with `--json`; the envelope carries
   `error.code` + `error.message`):

   **Recoverable — the failing argument was model-derived. Fix it and
   re-invoke ONCE (hard cap: exactly one retry; `ds init` validates before
   any write, so the retry is safe):**
   - `BAD_NAME` → re-slugify `<project-slug>` (lower-case, kebab-case,
     strip non-alphanumerics) and retry.
   - `PERSONA_NOT_FOUND` → substitute the next-highest scorer from
     step 2's list and retry.
   - `BAD_INTENT` (over 512 chars) → trim the concept line and retry.

   **Terminal — surface `error.message` to the user and stop:**
   - `BAD_BRAND_HEX` — the hex is **user-supplied**: silently dropping it
     would discard stated brand intent, and a malformed hex cannot be
     re-derived. Ask the user for a valid `#RRGGBB`.
   - `DS_TAMPERED`, `DS_EXISTS` (without `--force`), and any
     privacy/permission stop.

   If the single retry fails again — for any reason — treat it as
   terminal. Never retry more than once.

5. Note for the user that a DS was just compiled and will be reused for all
   future generations in this project. Tokens are immutable past this
   point — changes go through `ui ds change-token`.

#### Branch B — DS already exists

Do not re-compile. Move on to step 4. The hash check in step 4 will detect
tampering.

### Step 4 — Load the DS into context (strict, with theme)

For every variant, load the Design System context block AND the compiled
Tailwind v4 `@theme` block in ONE read-only call:

```sh
ui ds context --strict --with-theme
```

`--strict` adds the registered-components-only enforcement preamble.
`--with-theme` appends the compiled `@theme { --color-primary: …; … }`
block as a fenced section after the context — compiled from the full
resolved token map, it discovers the tokens path itself (no path to
adjust) and is immune to `--max-bytes` truncation. The binary verifies
the manifest hash against the on-disk tokens + registry; if tampering is
detected it exits `DS_TAMPERED` — that is **terminal**: surface it to the
user and stop.

Keep both blocks in scratch state:

- the **context block** fills `<design_system>` in step 5's skeleton, and
  the critique workflow in step 6 reads it to score the Consistency axis;
- the **@theme block** fills `<design_tokens>` in step 5 and is inlined
  into the page `<style>` so every token becomes a Tailwind utility
  (`--color-primary` → `bg-primary` / `text-primary`, `--space-4` → `p-4`,
  `--radius-md` → `rounded-md`). This is what makes "token reuse"
  verifiable rather than aspirational.

### Step 5 — Generate `<count>` variants (one per persona)

Decide the effective mode:

| `--mode` flag | Effective mode |
|---|---|
| `mobile`, `component`, or `slide` | use as-is (these always win) |
| `dashboard`, `admin`, `ecommerce`, `app` | use as-is |
| `desktop` | use as-is |
| *(not supplied)* | derived from `UI_TYPE` of step 1 per the table in `knowledge/mode-constraints.md` § "How a mode is chosen" |

Then read **`knowledge/mode-constraints.md`** and lift two blocks:

- The **Universal Style Guide** (always applied).
- The single mode section matching the effective mode (Mobile, Desktop,
  Component, Slide, Dashboard, App, Admin, or Ecommerce).

For each persona `P` in step 2's result list, produce one HTML variant by
generating a self-contained `index.html` from the prompt skeleton below.
Generate variants **sequentially**, not in parallel — each variant's
critique result (step 6) may inform subsequent variants. Save raw output
to scratch as `variant-<n>-<persona-slug>.raw.html`, then normalise it
deterministically before anything reads it:

```sh
ui strip-fences variant-<n>-<persona-slug>.raw.html \
  > variant-<n>-<persona-slug>.html
```

`strip-fences` removes markdown fences AND absorbs stray prose before
`<!doctype`/after `</html>` (full documents only — fragments pass through
untouched). Every later step (critique, autofix, registry) operates on the
stripped `.html` file, never the `.raw.html`.

Prompt skeleton (the host model fills `{…}` placeholders and emits HTML).
The XML tags separate instructions from the large pasted data blocks so
each block can be addressed by name — do not rename them:

```
<role>Elite UI designer + HTML engineer.</role>

<objective>
Build one self-contained HTML page for: "{intent}".
Adopt the visual language, typography, colors, spacing, depth, motion,
iconography, and layout described in <persona_dna> — exactly.
Resolve every ambiguity INSIDE this persona's DNA; do NOT regress to a
generic clean-modern-SaaS default when the DNA is silent — commit to the
persona's stated extremes instead.
</objective>

<brief>
{step-1 brief, verbatim}
</brief>

<persona_dna slug="{persona-slug}" family="{family}">
{full DNA loaded in step 2 from knowledge/personas/{family}.md}
</persona_dna>

<design_system>
{context block from `ui ds context --strict --with-theme` (step 4)}
</design_system>

<design_tokens format="tailwind-theme">
Paste this block verbatim inside a `<style>` tag in the page `<head>`. It
binds every design-system token to a Tailwind v4 utility. Build the entire
UI from these utilities.
{@theme block from step 4}
</design_tokens>

<universal_style_guide>
{Universal Style Guide block from knowledge/mode-constraints.md}
</universal_style_guide>

<mode_constraints mode="{effective-mode}">
{mode section from knowledge/mode-constraints.md}
</mode_constraints>

<constraints>
- Inline the `@theme` block from <design_tokens> inside a `<style>` tag in
  `<head>`, then style EVERY element with the token-bound utilities it
  defines (`bg-surface`, `text-primary`, `border-border`, `p-4`,
  `rounded-md`, …).
- Use only registered components from the DS where one fits; if a needed
  component is missing, design it, then register it (step 7).
- Color, spacing, typography, radius, and shadow MUST come from the `@theme`
  tokens. Arbitrary-value utilities for these (`bg-[#1a1614]`, `mt-[3px]`,
  `text-[#fff]`) are **forbidden** — if a value seems missing, pick the
  nearest token; never hardcode a hex/px. (Arbitrary values remain allowed
  only for genuinely one-off geometry a token cannot express, e.g.
  `w-[37%]`.) The critique Consistency axis fails a variant that hardcodes
  values a token already covers.
- On conflict, <universal_style_guide>, <mode_constraints>, and the a11y
  minimums they declare OVERRIDE persona latitude — the persona styles the
  page, it never voids a floor (the floors are declared non-negotiable in
  knowledge/mode-constraints.md; do not restate their numbers here).
- Every `<img>` carries an `onerror` fallback handler.
- Initialize Lucide icons once at the end of `<body>` via
  `lucide.createIcons()`.
- Realistic copy and data — no lorem ipsum.
</constraints>

<output_format>
Return RAW HTML only — a complete `<html>…</html>` document. A leading
HTML comment (e.g. an `<!-- AI_CRITIQUE_LOG -->` block from a refine
round) is permitted; markdown fences and commentary are not.
</output_format>
```

When a reference image, screenshot, or Figma URL is supplied alongside the
intent, layer the chosen prompt mode on top: read
`knowledge/prompt-modes.md` to pick replicate / enhance / adapt and prepend
its strategy modifier to the prompt. Default is replicate. Reference-driven
generation otherwise uses the same skeleton.

### Step 6 — Run the taste gate on each variant

Hand each variant off to the critique workflow:

> See `templates/workflows/critique.md`.

For each variant, invoke critique with the stripped HTML from step 5, the
active persona, the loaded DS context, and the effective mode. The critique workflow
scores the 6 taste axes (Layout, Typography, Spacing, Motion, Iconography,
Depth/Surface) plus the 7th Consistency axis (token reuse + registry reuse
+ correct naming), routes failing axes back through targeted refine
passes, applies `ui autofix` between passes, and returns one of:

- **PASS** — all axes meet threshold; refined HTML is the final output for
  that variant.
- **FAIL** — still under threshold after the hard cap (≤2–3 rounds);
  return the best-scoring revision plus the lowest-scoring axis name so
  the user can decide.

Do not loop indefinitely; the cap is enforced by the critique workflow.

### Step 7 — Final deterministic pass + register new components

For every variant the taste gate returned (PASS or FAIL):

1. Run autofix once more in write-mode against the final file:

   ```sh
   ui autofix variant-<n>-<persona-slug>.html --write
   ```

   This is idempotent if critique already applied autofix; the second
   call is cheap insurance.

2. If the variant introduced a **new** component shape (one not already in
   the registry — confirm against `ui registry list --json`), register it
   with a canonical `Category/Variant` name so the next generation can
   reuse it. The name is positional; `--category` is required; markup is
   read from a file (or stdin via `-`):

   ```sh
   ui registry register "<Category>/<Variant>" \
     --category <category> \
     --markup variant-<n>-<persona-slug>.html \
     [--tokens "color.primary,space.4,..."] \
     [--states default,hover,active] \
     [--description "<one-line>"]
   ```

   Skip registration for components that are clearly one-off page
   sections; register only genuinely reusable shapes (cards, buttons,
   tables, nav items, hero patterns).

### Step 8 — Present the variants

Show the user the `<count>` final HTML files side-by-side (open each in
the browser or emit file paths the host CLI can open). For each variant
emit a single status line:

```
variant <n> · persona <slug> · family <family> · taste <PASS|FAIL: lowest=<axis>>
```

The user picks one by eye (north-star UX: never by parameter). Their pick
becomes the starting point for `/ui:iterate` (vibe-word edits) or
`/ui:refine` (self-correction pass) or `/ui:redesign` (radical
contra-persona).

## Outputs

- `<count>` self-contained `.html` files at the project root (or under a
  user-supplied output directory), each one a complete `<html>…</html>`
  document with the compiled `@theme` block inlined in `<head>`, styled via
  the token-bound Tailwind utilities (not hardcoded hex/px), plus Lucide
  icons and Chart.js where applicable.
- Updated DS artifacts if step 3 Branch A ran: `design.tokens.json`,
  `component-registry.json`, `ds.manifest.json`.
- Updated `component-registry.json` if step 7 registered new shapes.
- A short summary line per variant with persona, family, and taste-gate
  verdict (see step 8).

No files are written outside the project directory. No network calls. No
API keys.

## Quality gate

Every variant must pass — or be capped against — the **6+1-axis taste
loop** defined in `templates/workflows/critique.md`. Step 6 above is the
hand-off point; critique owns scoring, threshold checks, refine routing,
the hard cap (≤2–3 rounds), and the autofix passes between rounds. The
Consistency axis specifically verifies that the variant reuses DS tokens
and registered components rather than inventing new ones — `ui registry
list` and the `ui ds context --strict` block from step 4 are the inputs
critique uses for that axis.

A variant returned with verdict `FAIL` is still emitted to the user, but
the lowest-scoring axis name is surfaced so the user can decide whether
to accept, re-roll with a different persona, or hand it to `/ui:iterate`
with a targeted vibe word ("warmer", "bigger text") that maps to the
failing axis.
