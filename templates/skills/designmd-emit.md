---
description: "Compose a DESIGN.md file from harvested tokens, observed components, and a chosen persona family. Use inside the from-url workflow when writing the 8-section Google-Labs-spec DESIGN.md."
---

# Skill: DESIGN.md Emit

Use when the host model is composing a `DESIGN.md` file at project root from
already-harvested tokens, observed components, and a chosen persona family.
This skill keeps the YAML + 8-section emit aligned with the Google-Labs alpha
spec without restating it.

## When to invoke

Inside `templates/workflows/from-url.md` — specifically step 7 ("Compose the
8 sections") and step 8 ("Write `./DESIGN.md`"). Do not invoke for any
workflow that produces `design/*.json` (those use `token-model` instead).

## What to read

- `knowledge/designmd-format.md` — the authoritative format contract: YAML
  schema, token value shapes, the 8 required sections and their order, **and
  the Token-precision sidebar** that defines raw CSS as source-of-truth and
  WebFetch summaries as inference-only. This skill is the *recipe*; that
  file is the *contract*. If they disagree, the contract wins.
- `<slug>/tokens.json` — produced by `ui designmd extract-tokens` from raw
  HTML + CSS. The canonical source-of-truth for hex values, font families,
  and custom-property declarations. Always re-read this before emitting any
  token value; never paraphrase from a WebFetch prose summary.

## Source-of-truth precedence

Before emitting any token, walk this precedence:

1. **Hex values** — pulled from `tokens.json` `colors[]` first. Pick the
   highest-frequency hex per semantic role. If you have to override (because
   vision identified a brand colour that lives inside an `<img>` or unresolved
   `var()`), record the override as an inline YAML comment
   (`# screenshot override: <reason>`). Never write a hex that isn't in
   `tokens.json` or `tokens.json.customProperties[].hex`.
2. **Font families** — pulled from `tokens.json` `fonts[]` verbatim. No
   inference, no "Inter, likely". If `fonts[]` is empty, fall back to the
   system font stack and document it.
3. **Component refs** — map to the highest-frequency hex per semantic role
   so the system reflects the source's actual visual weight, not the
   reviewer's preference.

The downstream `ui designmd audit` runs the same comparison: emitted hex
absent from `tokens.json` is a FAIL (invented value), emitted font family
absent from `tokens.json` is a FAIL (wrong font). The audit is the
deterministic enforcement of this precedence; this skill keeps the host
model aligned in advance so the audit doesn't have to FAIL.

## What to produce

A single file at `./<slug>/DESIGN.md` (per-project folder; see
`from-url.md` step 8 for the slug derivation), containing:

1. A YAML front-matter block delimited by `---` on its own line.
2. The 8 Markdown sections, in order, each with a `##` heading.

## Section order checklist

Walk this checklist in order before writing. Missing or out-of-order
sections fail the closure self-check (workflow step 9).

1. `## Overview` (or `## Brand & Style` — pick one)
2. `## Colors`
3. `## Typography`
4. `## Layout` (or `## Layout & Spacing`)
5. `## Elevation & Depth` (or `## Elevation`)
6. `## Shapes`
7. `## Components`
8. `## Do's and Don'ts`

## Format rules (actionable)

- **Colors** must be six-digit hex strings: `"#0F172A"`. Convert anything
  else (`rgb()`, `hsl()`, `oklch()`, three-digit hex) before writing.
- **Dimensions** must be `"<n>px"`, `"<n>em"`, or `"<n>rem"` — a number
  and a unit in a single quoted string.
- **Typography** values are *objects*, not strings: `fontFamily`,
  `fontSize`, `fontWeight`, `lineHeight`, optional `letterSpacing` /
  `fontFeature` / `fontVariation`.
- **References** use `"{group.name}"` exactly. No spaces inside braces,
  no leading dot, no array indexing. Every reference must resolve
  against a token defined above it in the same YAML block.
- **Headings** match the spec text exactly, including capitalisation
  and apostrophes (`Do's and Don'ts`, not `Dos and Donts`). Each `##`
  heading is unique within the file.
- **Version**: emit `version: "alpha"` only when explicitly requested;
  omit otherwise. Never emit a speculative version string.

## Self-check before write

Before writing the file, walk these checks. Any failure → fix in place
and re-check.

1. YAML parses as a single document.
2. All 8 section headings present, in order, no duplicates.
3. Every `"{group.name}"` reference points at a token defined in the
   same YAML block.
4. Every colour value matches `/^#[0-9a-fA-F]{6}$/`.
5. Every dimension value matches `/^[0-9]*\.?[0-9]+(px|em|rem)$/`.
6. `version` if present equals `"alpha"`.

Surface the first failing check to the user with the suggested fix and
stop the workflow if any check fails — a partial DESIGN.md is worse
than no DESIGN.md.
