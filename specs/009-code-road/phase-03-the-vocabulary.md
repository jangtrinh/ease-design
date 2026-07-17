# Phase 03 — The vocabulary

> **Executor: Sonnet.** The road's C0 step: a project's CSS custom properties become its DTCG
> token tier, themes become modes. **Measured before designed** — every claim below was run
> against dana's real CSS, not imagined. Phase 3 is ~80% glue over machinery that already
> exists; the new code is one additive field and one mapper.

## Context Links

- Spec `spec.md` §Acceptance 4-5 · Plan `plan.md` Phase 3 · Tasks `tasks.md` T3
- `usecases.md` UC-03 (Gherkin — use verbatim) · `brainstorm.md` §2, R4 · `CONTEXT.md` (Mode)
- Dogfood F2/F4/F6 + the workaround they invented (`feedbacks/260717-dana-desktop-onboarding.md`)
- **Prior art to copy, not re-invent**: `src/core/figma-ds-tokens.ts` — the Figma road's C0.
  Its literal-vs-alias tier split and its mode encoding are exactly what this phase needs.
- Constitution: Art I, Art II (emitter+linter), Art IV (shared layer), Art IX

## Overview

- **Priority**: after Phases 1-2. **Depends**: Phase 2 (`cssFiles` cannot be trusted until the
  router is honest), Phase 1 (the seal must survive a write).
- **Status**: not started.
- **Description**: `cssFiles` → DTCG two-tier + modes → `ds import` → a sealed store.

## Key Insights (measured 2026-07-17 against dana's real CSS — not assumed)

1. **`ui designmd extract-tokens --css` ALREADY does the hard half.** On the real
   `dana-tokens.css` (443 ln) it returns **324 `customProperties`**, each
   `{name, value, sources: ["file:Lnn", …]}`, plus `hex` on literals. **140/324 carry alias
   values (`var(--error-700)`).** Provenance is per-line and already SOURCE-grade.
   **Do not write a CSS parser.**
2. **It does NOT collapse multi-theme values** (my first hypothesis; it was wrong — verify
   before believing). Entries are keyed by **(name, value)**; `sources[]` gathers every line
   with that pair. On `index.css`:
   ```
   --color-gray-900  value=var(--gray-900)  → index.css:L31
   --color-gray-900  value=#0c1220          → index.css:L321
   --color-gray-900  value=#FBFBFB          → index.css:L358
   --color-gray-900  value=#0F0F0F          → index.css:L399
   ```
   **All four theme values survive, each with its line.** Nothing is lost today.
3. **The ONLY thing missing is the selector.** Those four lines map exactly:
   ```
   L31  ← @theme                   → base mode → $value
   L321 ← [data-theme="classic"]   → $extensions["mode.classic"]
   L358 ← [data-theme="light"]     → $extensions["mode.light"]
   L399 ← [data-theme="dark"]      → $extensions["mode.dark"]
   ```
   Add the selector to the extractor's provenance and the mode mapping is **mechanical**.
4. **The tier split is derivable from `value`, and the Figma road already proves the rule.**
   `figma-ds-tokens.ts:6-11`: literal → PRIMITIVE, alias → SEMANTIC — *"That literal-vs-alias
   split IS the primitive/semantic tier distinction"*. CSS is the same shape: `#0c1220` →
   primitive; `var(--gray-900)` → semantic `{color.gray-900}`.
5. **The category comes from the VALUE, not the name** — `token-import.ts:37-46` (`inferToken`:
   `COLOR_RE`, `DIM_RE`, `FAMILY_RE`, `DURATION_CAT_RE`). That is why `--badge-danger-bg:
   #FFFFFF` lands under `color` without a name convention. **Reuse it** (Art IV); it is also
   the function that emits F2's `unmappable string value` skip at `:45`.
6. **F4 is a hard dependency, not a nice-to-have.** dana needs `dana-tokens.css` **and**
   `index.css`. `--css` is last-wins (`cli-args.ts:11` is a scalar flag map) — so today the
   second file silently erases the first. Phase 3 cannot work without this fixed.
7. **`extract-tokens` requires an `<html-path>` positional** even when only `--css` matters —
   a code project has no such file. Passing a dummy empty HTML works (verified). That is the
   HTML-first assumption showing through the seam; see D4.

## Decisions (RESOLVED)

### D1 — add `selector` to the extractor's provenance (additive)

`sources` becomes `Array<{ path: string; line: number; selector: string }>` — or gains a parallel
`selectors` field if the flat `"file:Lnn"` string form is load-bearing elsewhere. **Check the
consumers before choosing** (`designmd-audit-source-fidelity.ts` reads these). `selector` is the
verbatim enclosing selector text (`@theme`, `:root`, `[data-theme="dark"]`, `.dark`,
`@media (prefers-color-scheme: dark)`).

### D2 — selector → mode, one shared table

| Selector | Mode |
|---|---|
| `:root`, `@theme`, `html`, `body` | **base** → `$value` |
| `[data-theme="X"]` | `mode.X` |
| `.dark`, `[data-theme="dark"]` | `mode.dark` |
| `@media (prefers-color-scheme: dark)` | `mode.dark` |
| anything else | **not a mode** — skip the declaration, list it under "unverified" |

Base is mandatory: a token whose only declaration sits under a theme selector has **no base
value**. Emit it under the mode and list it as unverified — do **not** promote a theme value to
base (that is inventing a value the source never declares; Art VIII).

### D3 — the mode convention gets one home and one linter, BEFORE the second emitter

Per `brainstorm.md` R4 / Art II. `token-model.ts` has **no** mode concept; the convention lives
only in `figma-ds-tokens.ts:13-16`, marked *"kept local to avoid a cycle"*. This phase makes the
code road **emitter #2**. Hoist the encoding + a `mode-convention` check into the shared token
model, **same commit**. A convention with two emitters and no check is what Art II exists to stop.

**Do not change the semantics**: `ui tokens compile` resolves `$value` and **ignores**
`$extensions` — declared, deliberate, verified live. Base compiles; modes are preserved and
documented (`figma-ds-designdoc.ts:22` already renders them). This is also the answer to the
dogfood's open question 4.

### D4 — the ingest is a new kernel command; the extractor stays as it is

`ui ingest-css-ds <extract-tokens.json> --out <dir> --name <slug>` — mirrors
`ui ingest-figma-ds <ds.json> --out <dir> --name <slug>` (`onboard.md` §1 E4) and emits the same
**portable, unsealed** bundle. `ds import` seals it afterwards. Same shape, same seam, same
sealing story — the Figma road already proved it.

*Rejected*: teaching `extract-tokens` to emit DTCG directly. It is a report command with three
consumers; widening it couples the report to the store.
*Rejected*: a `--css`-only mode on `extract-tokens` that drops the `<html-path>` positional
(Insight 7). It is a real wart, but it is `learn.md`'s to hide, not this phase's to fix. **Record
it; do not scope-creep.**

### D5 — F2 and F6 are inside this phase, not adjacent to it

- **F2** — `ds import` must accept aliases. `ALIAS_RE` exists (`token-model.ts:62`);
  `change-token` already accepts them (`ds-change-token-impl.ts:243-245`); only the front door
  refuses. Without this, **140/324 of dana's tokens — the entire semantic tier — are dropped**,
  which is exactly the flat-tier anti-pattern `token-taxonomy.md:117-122` names.
- **F6** — one casing convention across writer and validator. `ds init` writes kebab-case
  (`persona-expand.ts:613`); `token-import.ts:81` passes source names through verbatim;
  `TOKEN_PATTERN` (`registry-store.ts:74`) forbids uppercase. **The ingest emits kebab-case.**
  A token no component can reference is not a token.

### D6 — leaf naming: the name, verbatim. NO prefix strip.

**CORRECTED 2026-07-17 after the live run — the first draft of this rule was wrong, and the
guard it shipped with is what caught it.**

The leaf is the custom-property name minus `--`, **unchanged**. `inferToken` gives the category
from the value:
- `--gray-900: #181818` → `color.gray-900` (primitive)
- `--color-gray-900: var(--gray-900)` → **`color.color-gray-900`, `$value: "{color.gray-900}"`** —
  an alias, recorded exactly as declared
- `--badge-danger-bg: var(--error-700)` → `color.badge-danger-bg`, aliasing `{color.error-700}`

**Why the original "strip a redundant prefix" rule was wrong.** It merged `--gray-900` and
`--color-gray-900` into one path — **but they are two different declared properties on two
different tiers.** dana's own comment names the second one's job:
`@theme { /* --- Base palette registered as Tailwind colors --- */ --color-gray-900: var(--gray-900); }`
— it re-exports the primitive so Tailwind can emit `bg-gray-900`. The prefix is not redundant; it
is what makes it a different token. Stripping it collapses the two-tier structure
`token-taxonomy.md:110` mandates and dana's whole DS rests on. On the live run it collided **≥120
times** — the rule being wrong 120 times, not an edge case.

**Measured, so the fix is not dana-shaped either**: the `@theme { --color-X: var(--Y) }`
re-export is **2/3** of the surveyed corpus — dana (12+), hvs (7); traicaybentre puts literals
straight in `@theme` (0). hvs never collided only because its primitives are prefixed
(`--hvs-brand`). The pattern is real; the strip rule is what broke on it.

`color.color-gray-900` is ugly. It is also **dana's name**. Recording a user's declared
vocabulary verbatim is SOURCE-grade (`learn.md` §3c); rewriting it to look nicer is the silent
interpretation this spec exists to stop.

**Keep the collision guard.** It should now never fire on dana. If it fires anywhere, it is real.

### D7 — record the disease, do not cure it

dana declares 4 parallel hardcoded gray ramps — `token-taxonomy.md:121`'s named DON'T
(*"Dark mode = a parallel hardcoded set"* vs the DO, *"a second semantic layer over the same
primitives"*). Phase 3 **ingests it faithfully and records the finding** in the readiness report.
**No detector, no auto-normalisation** — that is a later spec (`spec.md` §Non-goals). The
knowledge diagnosed this correctly with a human reading it; turning `:121` into a machine check
is worth its own design.

## Related Code Files

**Create**
- `src/core/css-token-ingest.ts` (<200) — extract-tokens JSON → DTCG tree + modes (pure)
- `src/commands/ingest-css-ds.ts` (<200) — the command shell (D4)
- `tests/css-token-ingest.test.ts`, `tests/cmd-ingest-css-ds.test.ts`, `tests/mode-convention.test.ts`

**Modify**
- `src/core/designmd-extract-tokens.ts` (find the real path) — D1 selector provenance
- `src/core/cli-args.ts` + `src/commands/designmd.ts` — F4: `--css` accumulates or hard-errors.
  **`cli-args.ts` is shared by every command** — an array-valued flag is an Art IV change. Prefer
  the narrowest form that fixes it; if that means a hard-error on repeat + documenting the comma
  form (`--css a,b`, which already works), **that is acceptable and lazier**.
- `src/core/token-import.ts` — D5 (F2 aliases, F6 casing)
- `src/core/token-model.ts` — D3 (the mode home)
- `src/core/command-signatures.ts` — the new command + error codes
- `templates/workflows/learn.md` — the code route's C0 step

**Never**: `ui tokens compile`'s `$extensions` behaviour (D3), `figma-ds-tokens.ts`'s semantics
(copy the rule, do not change the Figma road), `knowledge/token-taxonomy.md`.

## Implementation Steps

1. F4 first — without it every multi-file test is a lie.
2. D1 selector provenance + tests.
3. D3 the mode home + linter (**before** the ingest exists — Art II).
4. `css-token-ingest.ts` + tests (pure).
5. `ingest-css-ds` command shell.
6. D5 (F2, F6) in `token-import.ts`.
7. `learn.md` C0 step.
8. Four gates + `npm test` + `ui knowledge check`.

## Tests — file, name, assertion

### `tests/mode-convention.test.ts` (the Art II linter — D3)
- `test_both_emitters_encode_a_mode_identically` → drive `figma-ds-tokens` and
  `css-token-ingest` to the same logical input; assert byte-identical `$extensions` shape.
  *This is the check whose absence would let emitter #2 drift.*
- `test_a_mode_value_never_becomes_the_base_value` (D2)

### `tests/css-token-ingest.test.ts`
- `test_a_literal_becomes_a_primitive_and_an_alias_becomes_a_semantic` (Insight 4)
- `test_four_theme_values_of_one_name_become_base_plus_three_modes` → the exact
  `--color-gray-900` case from Insight 2/3.
- `test_a_token_declared_only_under_a_theme_has_no_base_and_is_listed_unverified` (D2)
- `test_a_redundant_category_prefix_is_stripped_once` (D6)
- `test_a_leaf_name_collision_fails_loudly_with_both_source_lines` (D6 — **dana has this**)
- `test_emitted_group_names_match_the_registry_token_pattern` (D5/F6)
- `test_an_unmappable_selector_is_skipped_and_listed_not_silently_dropped`

### `tests/cmd-ds-import.test.ts` (extend — D5/F2)
- `test_an_alias_valued_token_imports_and_resolves` → `{color.gray-900}` survives;
  `tokens compile --target css` emits the resolved literal.
- `test_an_alias_only_token_file_is_not_empty_import` (`ds-import-impl.ts:64`)

### `tests/cmd-designmd.test.ts` (extend)
- `test_two_css_files_both_contribute` (F4) — **or** `test_a_repeated_css_flag_hard_errors`,
  depending on the form chosen. Today the first file is silently dropped.
- `test_each_custom_property_source_carries_its_selector` (D1)

### LIVE (Art III) — run and paste into the report
```
ui designmd extract-tokens <empty.html> \
  --css /Users/jang/Products/dana-desktop/src/desktop-ui/dana-tokens.css \
  --css /Users/jang/Products/dana-desktop/src/desktop-ui/index.css --out t.json
ui ingest-css-ds t.json --out <tmp> --name dana-web
ui ds import <tmp>/tokens.json --dir <tmp> --name dana-web
ui ds status --dir <tmp>          # must exit 0
ui tokens compile <tmp>/design/design.tokens.json --target css | grep gray-900
```
Expected: the semantic tier survives (~140 aliases), `--color-gray-900` carries base +
`mode.classic` + `mode.light` + `mode.dark`, the base compiles and the modes do not. Compare the
token count against the dogfood's hand-built 286 and **explain any gap**.

## Success Criteria

1. dana's two CSS files compile to a sealed DS with the **semantic tier intact** — the thing
   their hand-built workaround needed 102 `change-token` calls to reconstruct.
2. Four themes → base + 3 modes, byte-identical in shape to what `ingest-figma-ds` emits.
3. `mode-convention.test.ts` fails if either emitter drifts (Art II).
4. Every emitted token path matches `^[a-z][a-z0-9.-]*$` (F6) — referencable from a component.
5. `--css` no longer silently drops a file (F4).
6. The `parallel hardcoded set` finding is **recorded** (D7); no detector shipped.
7. New files < 200 lines. Four gates + `npm test` + `ui knowledge check` green.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| **The ingest gets written dana-shaped** | Insights 1-5 are measured on dana **and** the rule is copied from the Figma road, which was built for a different world. Run the LIVE block on `traicaybentre` (61 css-vars, 50 `:root`, 125 `data-theme`) and `hvs` (1162 css-vars) too — if the mapper only fits dana, that shows up there, not in a fixture. |
| `cli-args.ts` array flags become an Art IV rewrite | Take the narrowest fix. A hard-error on repeat + documenting the working comma form is acceptable and lazier than typing the whole flag map as arrays. |
| D6's collision rule fires immediately on dana | **Intended.** dana declares both `--gray-900` and `--color-gray-900`. Failing loudly with both source lines beats silently merging two different tokens. If it fires everywhere, that is a finding about D6 — report it, do not add a suffix rule. |
| The token count differs from the dogfood's 286 | Expected — theirs was hand-built by a different route. **Explain the delta; do not tune to match a number a human produced under duress.** |
| Modes are ingested but nothing renders them | `figma-ds-designdoc.ts:22` already renders `$extensions["mode.*"]` in DESIGN.md. Confirm the code road's bundle reaches it; if not, that is the Art II pairing missing its consumer. |

## Security Considerations

None new. Read-only over the project's CSS; no network, no model, no code execution (a No-Go —
`brainstorm.md` §7).

## Deviations from `plan.md` (report at the gate)

1. **`plan.md` asked "is the ingest mostly glue?" — measured: YES.** `extract-tokens` already
   yields 324 props / 140 aliases with per-line provenance and does **not** collapse theme
   values. The new work is the selector field (D1) + the mapper (D4), not a parser.
2. **D6 (leaf naming + the collision rule) was not in the plan.** It surfaced only when mapping
   real names (`--color-gray-900` vs `--gray-900` both → `color.gray-900`).
3. **Insight 7** (`extract-tokens` demands an `<html-path>` even for a CSS-only run) is recorded,
   not fixed. It is the HTML-first assumption showing through a seam.

## Next Steps

- Phase 4 registers components against **these** token paths — `BAD_TOKEN` is only a guard if
  the paths are right (F6).
- The `parallel hardcoded set` finding (D7) is the seed of the hygiene-detector spec.
