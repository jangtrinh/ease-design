# Spec 009 — The code road (E2)

**Status**: draft-for-review · **Stage**: spec · **Tracking**: GitHub issues per phase
**Constitution**: Art I (kernel deterministic, model at host), Art II (emitter+linter),
Art III (real data), Art IV (fix at shared layer), Art V (three-tier pipeline), Art VIII
(honesty floors), Art IX (YAGNI)
**Inputs**: `brainstorm.md` (approved), `usecases.md` (approved),
`feedbacks/260717-dana-desktop-onboarding.md`

> **Naming**: **Must/Should/Could** = priority. **Phase 1…4** = delivery order. Never `P1`/`P2`
> as a priority — that shorthand already means a spec phase in this repo.

## What

Pave the **code road** (E2) — the journey `/ui:learn` advertises and cannot walk. Four
deliveries, each one PR:

1. **The living seal.** `ui registry register` reseals (recompute `registryHash`, bump
   `generation`, append the already-declared `kind: "register"` changelog entry) via a shared
   helper. `ds import --force` stops wiping the registry.
2. **The honest router.** `ui scan` walks **breadth-first** and reports `truncated`/`visited`
   instead of silently giving up.
3. **The vocabulary.** CSS custom properties → DTCG two-tier, themes as **modes**
   (`$extensions["mode.<name>"]` — the convention `ingest-figma-ds` already emits). `ds import`
   accepts aliases; `--css` accumulates; group names are emitted referencable.
4. **The road.** `learn.md`/`extract.md` accept a code project; the host model reads the
   sampled components and the kernel validates; the real-data gate runs on ≥3 of the 9 code
   projects on disk.

## Why

**DESIGN:OS emits a CSS custom-property token system and cannot read one back in.** Across the
30 files of `knowledge/`, "custom properties" appears once — `token-taxonomy.md:186`,
*"ready to emit as CSS custom properties"* — in the **output** position. The most common
brownfield shape in the world is the one shape DESIGN:OS produces and the only one it cannot
consume.

`/ui:learn` is one of six core verbs and E2 is a first-class journey on the workflow map. Its
code branch is one line — *"**Code** → follow `extract.md`"* — into a workflow whose own Inputs
table reads *"A single HTML artifact. Multi-file extraction is out of scope for v1."* A React
app has no representative HTML. **The road has no valid input.**

The absence is explicable, not careless: the on-ramp doctrine was written from the only two
projects DESIGN:OS had onboarded — VSF-PCP and platform-design-system — and **both are design
projects** (Figma-side, no `package.json`, not git repos). `extract.md`'s rule is a faithful
description of a world with two inhabitants. The dogfood
(`feedbacks/260717-dana-desktop-onboarding.md`) is the first time a real codebase met it: DS
sealed with 286 tokens and **0 components**; the path that worked was invented in-session.

**And the seal defect is bigger than this road.** `ui registry register` never reseals —
reproduced live twice from a clean `ds init`. It has **five** callers in `templates/`, including
**`generate.md` Step 7**, which registers and proceeds without a `ds status` check. `/ui:generate`
— the first verb in the README's opening line — **tampers the store it just wrote into, silently,
today.** It survived because the two onboarded projects write their registry *wholesale*
(`ingest-figma-ds`, `figma reconcile`), and those paths reseal. Nobody's world exercised the
incremental writer.

## Locked decisions (owner, 2026-07-17)

- **Auto-route.** The scan detects and routes; the user is asked only when nothing is found.
  North-star (`learn.md`): *the user supplies what; the system supplies how.* **No `--ui-root`.**
- **Eat both, vocabulary first.** CSS token file → tokens; component code → registry.
- **HTML is the design.** `/ui:generate` emits self-contained HTML and does not know frameworks
  exist (`generate.md:281`); developers port it. A product designer delivers designs, not
  production code. The registry's required `markup: HTML` is therefore correct for this class.
- **Modes are preserved and documented, not compiled.** Base mode → `$value`; others →
  `$extensions["mode.<name>"]`; `ui tokens compile` emits base only
  (`figma-ds-tokens.ts:14-16`, verified live). This settles the dogfood's open question 4.
- **Onboarding diagnoses.** A DS problem found at onboard is **recorded**, then normalised
  toward best practice — never silently ingested or silently normalised away. The machine
  detectors are a later spec; Phase 3 records.
- **No parser, no hand, no dependency.** 0/3 surveyed projects use CVA or any variant library;
  there is no determinism to buy. The host model reads; the kernel refuses invented tokens
  (`BAD_TOKEN`). Art I intact.
- **Measure before designing.** Every evidence-ladder rung ships with its count over the real
  corpus. A rung at 0/9 (Storybook) does not ship.

## Non-goals

- **`CONVENTIONS.md` for code** (the C7 grammar) — a later spec. It makes generation *resemble*
  the product; it is not a condition of the road existing.
- **Code-DS hygiene detectors**, including `token-taxonomy.md:121` (*"parallel hardcoded set"*)
  as a machine check — a later spec, designed *after* Phases 1–4 meet real data.
- **Rendering the project's components** (jsdom/testing-library/dev server). dana has the
  toolchain; running a user's code to obtain markup is a trust boundary this spec does not cross.
- **F7** (persona on the import path), **F11** (`ds a11y` cartesian default) — cosmetic or
  off-road next to a closed road.

## Acceptance criteria

1. **The seal survives a sanctioned write.** `registry register` on a sealed DS leaves
   `ds status` at exit 0, `generation` +1, and a `kind: "register"` changelog entry. A shared
   reseal helper does it once (Art IV); the five template callers are unchanged.
2. **`--force` no longer destroys.** `ds import --force` over a non-empty registry preserves the
   components or refuses with an explicit opt-in flag. Never silent.
3. **The router cannot lie.** `ui scan` reports `truncated` + `visited`. `componentDirs: []` with
   `truncated: false` is the only way to say "no UI here" (Art VIII). BFS finds
   `src/desktop-ui` on dana, where DFS+alphabetical dies four directories short.
4. **The semantic tier survives import.** An alias-valued token (`{color.gray-900}`) imports;
   `tokens compile` emits its resolved value. Group names are emitted referencable
   (`^[a-z][a-z0-9.-]*$`). `--css` accumulates or hard-errors.
5. **A theme is a mode.** `[data-theme="dark"]` → `$extensions["mode.dark"]`; base compiles;
   the mode convention gains one shared definition **and one linter** before its second emitter
   exists (Art II).
6. **`learn.md`'s own gate is satisfiable.** On a real code project: ≥1 component registered
   **and** `ds status` exits 0 — two sentences that cannot both be true today.
7. **Art III — real data.** The gate runs on **≥3 of the 9 code projects on disk**, chosen for
   spread (dana-desktop: Electron/TW4/6 css; traicaybentre: 999 components/340 css; hvs: 1162
   css-vars). A project where the road fails is a **finding, reported** — not a quiet omission.
8. Every phase = 1 PR, three-tier pipeline (Art V), human merge; four gates + `ui knowledge check`
   + `npm test` green. New modules < 200 lines (Art IX); `registry.ts` (319) does not grow.

## References

- Dogfood: `feedbacks/260717-dana-desktop-onboarding.md` (11 findings; **1 was a
  misdiagnosis** — see `brainstorm.md` R3. Field reports are symptoms; triage before spec'ing).
- Root-caused this session, live-reproduced: `brainstorm.md` §4 (R1 scan budget · R2 seal ·
  R3 naming · R4 mode convention).
- Shape survey (measured, not assumed): `brainstorm.md` §3 — killed two designs proposed in the
  same session. Method: measure the corpus before drawing the ladder.
- Prior art **in this repo**: the Figma road — `scan-design-system` → `ingest-figma-ds` (C0
  vocabulary), `scan-conventions` → `synthesize-conventions` (C7 grammar), `figma audit` → cleanup
  plan. The code road copies a proven shape and invents no pattern.
- Glossary: `CONTEXT.md` (road · code road · vocabulary · grammar · mode · evidence ladder ·
  parallel hardcoded set · seal).
