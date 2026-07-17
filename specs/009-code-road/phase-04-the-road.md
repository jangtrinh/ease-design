# Phase 04 — The road

> **Executor: Sonnet.** The last phase: `learn.md`/`extract.md` accept a code project, components
> register, and the Art III gate runs on real repos. Every decision below is **resolved from
> evidence measured this session** — none is left to the implementer.

## Context Links

- Spec `spec.md` §Acceptance 6-7 · Plan `plan.md` Phase 4 · Tasks `tasks.md` T4
- `usecases.md` UC-04, UC-06 (Gherkin — verbatim) · `brainstorm.md` §3 (the survey), R3
- `reports/art-iv-seal-audit.md` — why Phase 1 had to land first
- Constitution: Art I, Art III (real data), Art V, Art VIII, Art IX

## Overview

- **Priority**: last. **Depends**: Phase 1 (the seal must survive a register), Phase 2 (the
  router must find the UI), Phase 3 (the token paths must exist for `BAD_TOKEN` to be a guard).
- **Status**: not started.
- **Description**: open the road, then prove it on real repos — and report where it fails.

## Key Insights (measured, not assumed)

1. **The blocker is one sentence, not a missing machine.** `extract.md`'s Inputs table:
   *"A single HTML artifact. Multi-file extraction is out of scope for v1."* `learn.md` routes
   **Code → extract.md**. A React app has no representative HTML — dana's only `.html` files are
   SPA shells. **The road has no valid input, by rule.** Everything else in this spec is plumbing
   that rule made unreachable.
2. **`states` is a dead field.** Non-empty in **0/537** of platform-design-system's records and
   **0/27** of the `ds init` kit. The *only* place it lives is the doctrine (`learn.md` §3b,
   `extract.md` step 10) — and the only session that ever populated it was dana's. States travel
   as `State=X` inside `variants`. See D3.
3. **Axis names come from the SOURCE.** platform-design-system: `Variant=Default`, `Size=24`,
   `Color=Blue` — the Figma props' own names. The kit: `Tone=`, `Size=`, `State=`. dana's
   `Button.tsx` declares a prop literally named `variant` → `Variant=Primary`. **Do not
   interpret; do not map `variant`→`Tone`.**
4. **platform-design-system is NOT the record model.** Its 537 records carry **0 markup and 0
   tokensUsed** — it is a Figma *inventory* (name + category + variant axes), and that is correct
   for what `ingest-figma-ds` can honestly produce from a Figma scan. Its detail lives in the
   Figma file and in its 830 lines of DESIGN.md tokens. **The kit is the only complete-record
   precedent that exists.** (Its *design* quality is a separate concern — spec 010, not this
   phase.)
5. **No variant library to lean on.** CVA / tailwind-variants: **0/3** surveyed projects. dana
   declares variants as a TS union + `Record<Variant, string>`. There is no parser shortcut to
   buy, which is why the host model reads (Art I intact) and the kernel refuses invented tokens.
6. **`BAD_TOKEN` is the whole safety story.** `registry-store.ts:167-174` rejects any
   `tokensUsed` entry that is not a real token path. That refusal is what makes a
   non-deterministic reader safe — **it only works if Phase 3 emitted referencable paths (F6).**
7. **A test can enshrine a bug.** `ds-round-trip.test.ts` was literally named
   *"init → context → registry add → DS_TAMPERED"* and asserted the tamper as correct. Phase 1
   fixed it. **When a gate result surprises you here, suspect the assertion before the code.**

## Decisions (RESOLVED — do not re-derive)

### D1 — record shape: follow the kit, the only complete precedent

One record **per component**, not per variant. dana's Button (8 tones × 3 sizes × 3 radii) is
**one** record — not 72.

```
name:       Control/Button          (Category/Component — NAME_PATTERN, PascalCase)
category:   action                  (semantic, kit-style — not the name's first segment)
variants:   ["Variant=Primary", …, "Size=Xs", …, "Radius=Sm", …, "State=Hover", …]
tokensUsed: ["color.accent-strong", "color.on-accent", "font-size.caption", …]
markup:     <HTML — see D4>
description: one line
```

`NAME_PATTERN` (`registry-store.ts:73`) is `^[A-Z][A-Za-z]+\/[A-Z][A-Za-z]+$`. It applies here
**by design** — `figma-ds-registry.ts:13-14` says so in as many words: the pattern *"exists for
code-authored components, not scanned Figma inventory"*. Code-authored is exactly what this is.

### D2 — axis names are the source's own prop names, PascalCased

dana: `variant` → `Variant=`, `size` → `Size=`, `radius` → `Radius=`. Values PascalCased:
`accentSoft` → `Variant=AccentSoft`. **No interpretation** (Insight 3). If a prop name collides
with `State`, the source wins — record the collision in the report.

### D3 — states go in `variants` as `State=X`; fix the doctrine, not the data

Insight 2: the field is dead in 100% of real records. Emit `State=Default`, `State=Hover`, … in
`variants` (kit-identical) and leave `states` unset.

**Edit `learn.md` §3b and `extract.md` step 10** — they mandate `--states`, which no emitter has
ever used. Keep the `--states` flag working (it is in `command-signatures.ts` and someone may
script it) but have it write `State=X` into `variants`. **Say plainly in the PR that the doctrine
was describing a field the system never adopted.**

### D4 — markup: HTML, and only from class strings the source actually declares

**HTML is the design** (owner, 2026-07-17): `/ui:generate` emits self-contained HTML
(`generate.md:281`) and does not know frameworks exist; developers port it. A product designer
delivers designs, not production code. So `markup` stays HTML for a React project — that is the
contract, not a compromise.

A **specimen sheet** (kit-style: a wrapper + rows showing the matrix), with one hard rule:
**every cell must trace to a class string that exists in the source.** dana's
`variantClasses.primary` is right there in `Button.tsx` — copy it. A cell you cannot trace, you
do not draw; list it under "unverified" (`learn.md` §3c is already the law here, this phase just
obeys it).

*Rejected*: rendering the component (jsdom/testing-library/dev server). dana has the toolchain;
running a user's code to obtain markup is a No-Go (`brainstorm.md` §7).

### D5 — `extract.md` gets a code branch; `learn.md` stops lying about the route

The minimal honest fix: `extract.md`'s Inputs accept **either** a single HTML artifact **or** the
3–5 sampled source files `learn.md` §3a already mandates. Everything downstream of its step 1 is
already multi-source-tolerant — it is the input *rule* that closed the road (Insight 1).

### D6 — the Art III gate: 3 projects, chosen for spread, and it may fail

`dana-desktop` (Electron/React/TW4, 6 css, Python in-tree), `traicaybentre` (999 components,
340 css), `hvs` (1162 css-vars, 4 tailwind configs). **A project where the road fails is a
finding, reported** — not a quiet omission. Precedent to avoid: spec 006's P5 gate declared PASS
on 1 of the 2 projects its plan required and never said why.

## Related Code Files

**Modify**
- `templates/workflows/extract.md` — D5 (Inputs), D3 (step 10)
- `templates/workflows/learn.md` — the code route (step 3), D3 (§3b)
- `src/commands/registry.ts` / `src/core/command-signatures.ts` — D3's `--states` → `State=X`
  (small; `registry.ts` is at 329/330 after Phase 1 — **do not grow it**)

**Create**
- `specs/009-code-road/reports/p4-real-data-gate.md` — the evidence artifact

**Never**: `NAME_PATTERN`, `TOKEN_PATTERN`, `validateComponentRecord`'s strictness (it is the
safety story — Insight 6), `figma-ds-registry.ts` (Figma inventory is a different door, by design).

## Implementation Steps

1. D5 (`extract.md` Inputs) — **the one sentence**. Do this first and the road is technically open.
2. D3 (the doctrine edits + `--states` → `variants`).
3. `learn.md`'s code route.
4. The gate (D6) — dana first, then traicaybentre, then hvs.
5. Write the report. Four gates + `npm test` + `ui knowledge check`.

## Tests — file, name, assertion

### `tests/cmd-registry.test.ts` (extend)
- `test_states_flag_writes_state_axes_into_variants` (D3)
- `test_a_component_records_axes_from_its_own_prop_names` (D2)
- `test_registering_a_component_with_an_invented_token_is_refused` — already exists from Phase 1;
  **re-assert it here**: it is this phase's entire safety guarantee (Insight 6).

### `tests/knowledge-doctrine.test.ts` or the existing doc-lint (find it)
- `test_no_workflow_mandates_the_dead_states_field` (D3) — the Art II pairing: the doctrine edit
  ships with the check that keeps it edited.

### LIVE — the gate (Art III). This is the phase's real output.
Per project, in `reports/p4-real-data-gate.md`:

| | dana-desktop | traicaybentre | hvs |
|---|---|---|---|
| `ui scan` → UI found? truncated? | `src/desktop-ui/components` found (157 files); `truncated:true`, `visited:4000/4000` | `src/components` found (27 files); `truncated:true`, `visited:2967` | `components/ui` (3 files) + `docs/product/hvs-design-system/components` (23 files) found; `truncated:false`, `visited:464` |
| tokens compiled (primitive / semantic / modes) | 186 / 228 / 3 (dark, classic, light) — 15 unverified (fonts/shadows/transitions, composite) | 17 / 0 / 0 — 2 unverified | 13 / 7 / 0 — 7 unverified (fonts/easing/shadows, composite) |
| components registered | 1 (`Control/Button`) | 1 (`Social/ShareButtons`) | 1 (`Control/LocationSelector`) |
| `ds status` exit | 0 (generation 1→2) | 0 (generation 1→2) | 0 (generation 1→2) |
| `ds context --strict --with-theme` exit | 0 | 0 | 0 |
| **what the road got wrong** | see below — the `BAD_TOKEN` finding, **since fixed** (applies to all three) | most components are one-off marketing sections, not variant-prop primitives — D1/D2 only had one real candidate (`ShareButtons`'s `placement` prop) in 27 files | `docs/product/hvs-design-system/` is a stale demo/preview tree with its own `ButtonPrimary.css` etc. — flagged as a P2 `project-scan.ts` follow-up, not fixed here |

**The one thing the road got wrong (all three projects, same root cause) — FIXED in this phase:**
`ui registry register`'s `BAD_TOKEN` (`registry-store.ts`, `TOKEN_PATTERN`) validated only that a
`--tokens` value matched `^[a-z][a-z0-9.-]*$` — it did **not** check the value against the
project's compiled token set. `color.this-token-does-not-exist-anywhere` registered successfully
(verified live, isolated from all three project runs). The original phase briefing's Key Insight
6 and hard constraints described `BAD_TOKEN` as refusing "any invented token" — that was a
misread of the code (owner-confirmed), not what the code did. **Owner decision: fix it, reusing
P1's `loadDesignSystemForReseal` (Art IV)** — new small module `src/core/registry-token-check.ts`
(`assertTokensExist`) called once from `registry.ts`'s existing Save step: DS present → every
`tokensUsed` path must resolve in the compiled tree (two-level `category.name`, base-mode
resolution only — modes are `$extensions` on a token, not separate tokens); no DS (standalone
`--file` registry) → format-only, unchanged. `registry.ts` stays at 330/330. Re-ran the
three-project gate after the fix — **all three real components still pass**; the stricter check
changed nothing about them because every `tokensUsed` entry was genuinely traced, not invented.
See `reports/p4-real-data-gate.md` §3 addendum for the full reproduction, fix, and re-verification.

Plus, verbatim: **one component record the road produced**, and **one thing it got wrong** —
or "none", but look. Also run **EaseUI** (no root `package.json`, 2 UI roots, 4220 entries vs a
4000 cap) and report; not a gate condition. **Result**: `framework: null` (no root
`package.json` to detect one — confirmed), `truncated:true` at exactly `visited:4000`
(the cap), `componentDirs` surfaced `app/src/components/ui` (12 files) but not a second
root under `frontpage/` (that tree's `components/` dir has no `ui`/`widgets`/`components`-named
subfolder within the walk budget) — full detail in `reports/p4-real-data-gate.md`.

## Success Criteria

1. **`learn.md`'s own quality gate is satisfiable** on a real code project: *"when the source was
   code, ≥1 component is registered"* **and** *"`ds status` exits 0"*. Two sentences that could
   not both be true when this spec was written.
2. The gate ran on **3 projects chosen for spread**, and the report says what broke.
3. No workflow mandates `states` any more; `--states` writes `State=X` into `variants`.
4. `registry.ts` ≤ 330 lines. Four gates + `npm test` + `ui knowledge check` green.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The host model writes plausible-but-absent markup | D4's trace rule + `BAD_TOKEN` (Insight 6) + `learn.md` §3c's "unverified" list. A cell you cannot trace, you do not draw. |
| The road works on dana and breaks on traicaybentre/hvs | **That is the gate working.** Report it. dana is 1 of 9; the survey exists precisely because n=1 built the doctrine this spec repairs. |
| D3 contradicts a doctrine sentence somewhere I have not read | Then the doctrine described a field the system never adopted — **fix the sentence and say so**. Do not populate a dead field to keep a doc honest. |
| A gate result surprises you | Insight 7: suspect the assertion before the code. A test in this repo has already enshrined a bug once. |
| Scope creep into the kit's design quality | Out (Insight 4). The kit's quality is spec 010. This phase copies its record **structure** only. |

## Security Considerations

No code execution (D4 rejected rendering). Read-only over the project's source. The model reads;
the kernel writes and refuses.

## Deviations from `plan.md` (report at the gate)

1. **`plan.md` OQ2 ("which axis becomes the record?") is answered by D1 from the kit's
   precedent**, not by a decision: one record per component, all axes in `variants`.
2. **D3 (`states` is dead) was not in the plan.** It surfaced from measuring platform-design-system
   (0/537) and the kit (0/27) against the doctrine's mandate.
3. **platform-design-system was expected to be the quality reference; it is not** (Insight 4) —
   its records carry no markup and no tokens.
