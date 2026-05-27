# DESIGN.md format (Google Labs alpha)

Pinned on-disk reference for the open-source DESIGN.md spec authored by
Google Labs. Read this instead of refetching the upstream repo each run —
the file the host model writes at project root must conform exactly to
what is described here.

- **Upstream:** <https://github.com/google-labs-code/design.md>
- **Full schema:** <https://github.com/google-labs-code/design.md/blob/main/docs/spec.md>
- **Spec snapshot:** alpha (captured 2026-05-27). If the upstream repo has
  moved to `beta`, this file is the contract — bump it explicitly rather
  than letting the workflow drift.

A `DESIGN.md` file is **one document with two halves**:

1. A YAML front-matter block delimited by `---` on its own line, holding
   the structured token data.
2. A Markdown body of **exactly 8 sections in a fixed order**, holding the
   prose rationale a human (or another agent) reads.

Both halves are required. Either half alone is not a valid DESIGN.md.

---

## YAML front-matter schema

```yaml
---
name: "<brand or product name>"        # required
description: "<one-line brand line>"   # optional
version: "alpha"                       # optional; if present must be "alpha" at this snapshot

colors:                                # object of color tokens (group → name → value)
  brand:
    primary:   "#0F172A"
    accent:    "#22D3EE"
  neutral:
    bg:        "#FFFFFF"
    fg:        "#0F172A"
    muted:     "#64748B"

typography:                            # object of typography tokens (group → name → object)
  display:
    lg:
      fontFamily:    "Inter, sans-serif"
      fontSize:      "72px"
      fontWeight:    700
      lineHeight:    "1.1"
      letterSpacing: "-0.02em"
  body:
    md:
      fontFamily:    "Inter, sans-serif"
      fontSize:      "16px"
      fontWeight:    400
      lineHeight:    "1.55"

rounded:                               # object of radius tokens (name → dimension)
  sm:   "4px"
  md:   "8px"
  lg:   "16px"
  full: "9999px"

spacing:                               # object of spacing tokens (name → dimension)
  "0":  "0px"
  "1":  "4px"
  "2":  "8px"
  "4":  "16px"
  "8":  "32px"
  "16": "64px"

components:                            # object of component definitions
  button-primary:
    backgroundColor: "{colors.brand.primary}"
    textColor:       "{colors.neutral.bg}"
    typography:      "{typography.body.md}"
    rounded:         "{rounded.md}"
    padding:         "{spacing.2} {spacing.4}"
  card:
    backgroundColor: "{colors.neutral.bg}"
    textColor:       "{colors.neutral.fg}"
    rounded:         "{rounded.lg}"
    padding:         "{spacing.4}"
---
```

### Required fields

| Field | Required | Notes |
|---|---|---|
| `name` | yes | A short brand or product name. Free-form string. |
| `description` | no | A single line describing the brand voice or product. |
| `version` | no | If present at this snapshot, must be `"alpha"`. |
| `colors` | as observed | Group → name → hex string. Omit if the source has no colour signal at all (rare). |
| `typography` | as observed | Group → name → object of typography properties. |
| `rounded` | as observed | Name → dimension. |
| `spacing` | as observed | Name → dimension. |
| `components` | as observed | Name → object using `"{ref}"` strings against the tokens above. |

---

## Token value formats

These are the only legal value shapes. Drift from them invalidates the file.

- **Color value.** A six-digit hex string: `"#RRGGBB"`. Uppercase or
  lowercase hex digits both parse; prefer lowercase for consistency. No
  three-digit shorthand. No `rgb()`, `rgba()`, `hsl()`, or `oklch()`
  values in the YAML — convert to hex first.
- **Dimension value.** A number followed by a unit, written as a single
  string: `"<n>px"`, `"<n>em"`, or `"<n>rem"`. Numbers may be integer or
  decimal. Examples: `"16px"`, `"1.5rem"`, `"0.5em"`.
- **Typography value.** An object, not a string. Properties:
  - `fontFamily` (string, CSS font-family list)
  - `fontSize` (dimension string)
  - `fontWeight` (integer 100–900, or named-weight string like `"semibold"`)
  - `lineHeight` (unitless number as string, or dimension string)
  - `letterSpacing` (dimension string; optional)
  - `fontFeature` (string of OpenType feature settings; optional)
  - `fontVariation` (string of variable-font axis settings; optional)
- **Reference value.** A string of the form `"{group.name}"` that points
  at another token defined above. Example: `"{colors.brand.primary}"`,
  `"{typography.body.md}"`. References resolve at read time; circular
  references are rejected.

---

## Markdown body — 8 sections, fixed order

Section headings must be `##` level and must appear in this exact order.
Synonyms allowed by upstream are listed in parentheses; pick one per
document and use it consistently.

1. **Overview** (also accepted: *Brand & Style*) — one short paragraph of
   persona-style prose. Describes the brand voice and visual direction.
2. **Colors** — table or bulleted list of the semantic colour roles and
   the hex values they map to.
3. **Typography** — table of the type ramp: each named slot with its
   family, size, weight, and line height.
4. **Layout** (also accepted: *Layout & Spacing*) — observed grid,
   density, section pacing, max widths.
5. **Elevation & Depth** (also accepted: *Elevation*) — shadow ladder,
   blur usage, whether shadows are neutral or brand-tinted.
6. **Shapes** — radius family. Sharp vs soft, where each radius applies.
7. **Components** — one short note per registered component: what it
   looks like, where it is used.
8. **Do's and Don'ts** — 3–5 bullets each, drawn from the cross-check
   between observed HTML and the screenshot.

### Section-ordering rules

- All 8 sections are required. An emitted DESIGN.md with a missing
  section is invalid.
- Duplicate headings reject the whole file. Each `##` heading must be
  unique.
- Unknown `##` headings inserted between the spec sections are preserved
  (the spec is extensible) but disrupt the canonical reading order — do
  not emit them from this workflow.
- Heading text matches the spec exactly. Capitalisation and apostrophes
  matter: `Do's and Don'ts`, not `Dos and Donts`.

---

## Versioning and extension rules

- The current spec version is **`alpha`**. `version: "alpha"` is optional
  in the YAML; if present it must be exactly `"alpha"`. Do not emit
  speculative version strings like `"beta"`, `"v1"`, or `"latest"`.
- Unknown YAML keys at the top level are preserved by lenient readers
  but cannot be referenced. Do not invent new top-level keys from this
  workflow.
- Unknown properties **inside** a component object are accepted with a
  warning by lenient readers. Stay within the declared property set
  (`backgroundColor`, `textColor`, `typography`, `rounded`, `padding`,
  plus equivalents the upstream spec adds in this snapshot).

---

## How this differs from our internal `design/*.json` SSOT

ease-design ships a separate, deterministic design-system store at
`design/design.tokens.json`, `design/component-registry.json`, and
`design/ds.manifest.json`. That store follows the **DTCG** model
(`knowledge/token-taxonomy.md`) and is mutated through `ui ds change-token`
and `ui registry register`. It is the source of truth for `/ui:generate`,
`/ui:extract`, and every other workflow that produces HTML.

`DESIGN.md` is **not** that store. The two formats differ on purpose:

| Property | `DESIGN.md` (this file) | `design/*.json` (DTCG SSOT) |
|---|---|---|
| Audience | Any coding agent, including ones outside ease-design | The `ui` binary + ease-design workflows |
| Mutation | Hand-edit or re-run `/ui:from-url` | `ui ds change-token`, `ui registry register` |
| Validation | Self-check at emit time (workflow step 9) | Schema-enforced by the binary at every mutation |
| Composite tokens | Inline objects (typography) + flat refs | Two-tier primitive/semantic alias graph |
| Manifest hash | None | Sealed `ds.manifest.json` with hash + changelog |

The two can coexist in the same project. `/ui:from-url` writes a
per-project folder `./<slug>/DESIGN.md` and leaves `design/*.json`
alone. Future bridge work (`v1.y`) may add a `ui designmd export
--target dtcg` to convert one into the other; this snapshot does not.

---

## Token precision — what counts as source-of-truth

When the `/ui:from-url` workflow harvests tokens for a DESIGN.md, the
**raw HTML and the linked CSS bytes are canonical**. Anything else is
inference and must defer to those bytes.

The hierarchy, top to bottom:

1. **Extraction grade** — values pulled by `ui designmd extract-tokens`
   from raw HTML + linked CSS. Hex values with frequency counts. Font
   families with provenance. Custom-property declarations with
   resolved hex. This is the source the audit gate enforces.
2. **Vision grade** — values pulled from a viewport screenshot via the
   host model's native vision. Used to *correct* extraction-grade
   tokens when a brand colour lives in an image, SVG, or unresolved
   CSS variable. Recorded as inline YAML comments
   (`# screenshot override: <reason>`). Subject to the audit; if a
   vision-derived value isn't in the source CSS at all, the audit's
   source-fidelity row FAILs and the workflow must reconcile.
3. **Summary grade** — values inferred from an LLM-summarised view of
   the page (e.g. a WebFetch prose summary that says "warm amber"
   when the CSS actually used `#f97316` orange). **Never canonical
   for hex values, font names, or dimension values.** Useful only
   for persona prose, component naming, and Overview rationale —
   things vision and extraction cannot decide.

The audit gate enforces this hierarchy. The `source-fidelity` family
FAILs any emitted hex with `count = 0` in `tokens.json` (an invented
value, regardless of how plausible) and any emitted `fontFamily`
first-name absent from `tokens.json` `fonts[]`.

When the host CLI cannot reach the linked CSS (CORS, auth wall,
edge-cache miss), the audit emits a WARN row "token confidence is
summary-grade only" instead of FAIL. The user is told explicitly
which fetch tier resolved the run, so any accepted summary-grade
output is a deliberate choice.

The reason this matters: WebFetch sanitises HTML through an LLM that
rewrites colour mentions as natural-language descriptions ("warm
amber", "tangerine accent"). Those descriptions are real signal for
persona prose but they are not bit-exact for token emission. Always
re-ground hex/font values in the bytes before emitting.
