# Brainstorm — Spec 009: The code road (E2)

**Stage**: brainstorm · **Sizing**: L · **Date**: 2026-07-17
**Constitution**: Art I (kernel deterministic, model at host), Art II (emitter+linter),
Art III (real data), Art IV (fix at shared layer), Art VIII (honesty floors), Art IX (YAGNI)

> Location note: `/es-brainstorm` specifies `plans/specs/{slug}/`. Art VII makes `plans/` the
> gitignored single-machine archive and `specs/NNN-slug/` the committed, resumable home.
> Constitution wins (Governance clause). Skill gap recorded, not patched mid-task.

---

## 1. Press Release

**DESIGN:OS now onboards a real codebase.**

Point `/ui:learn` at any project with UI — React, Vue, Svelte, plain CSS — and DESIGN:OS
compiles that product's *own* design system from its *own* evidence: the CSS custom
properties it already declares, the components it already ships, the themes it already
switches between. No hand-picked tokens, no "please export a Figma file first", no
representative-HTML-file requirement that a real app cannot satisfy.

Until today this road was drawn on the map and paved nowhere. `/ui:learn` — one of six core
verbs — routed a codebase into `/ui:extract`, a workflow whose own Inputs table reads *"A
single HTML artifact. Multi-file extraction is out of scope for v1."* A React app has no
representative HTML. The road had no valid input, and said so only after you walked it.

---

## 2. The root problem (first principles)

**DESIGN:OS emits a CSS custom-property token system and cannot read one back in.**

Across the 30 files of `knowledge/`, "custom properties" appears exactly once —
`token-taxonomy.md:186`, *"ready to emit as CSS custom properties"* — in the **output**
position. The most common brownfield shape in the world is the one shape DESIGN:OS
produces, and the only shape it cannot consume.

That is not a bug list. It is one absence with eleven symptoms.

### Why the absence existed

The on-ramp doctrine was written from the shape of the only projects DESIGN:OS had ever
onboarded — VSF-PCP and platform-design-system. Both are **design projects**: Figma-side,
no `package.json`, not git repos, HTML prototypes. `extract.md`'s "single HTML artifact"
rule is not careless; it is a **faithful description of a world with two inhabitants**.

Every symptom follows from the shape of that world, not from bad code.

---

## 3. Evidence

### The dogfood (`feedbacks/260717-dana-desktop-onboarding.md`)

dana-desktop — React 19 + Vite 6 + Tailwind 4, Electron, 1053 components, UI at
`src/desktop-ui/`, `dana-tokens.css` (443 ln, 2-tier, DTCG-shaped) + `index.css` (1364 ln,
`@theme` + 4 theme blocks). Result: DS sealed with 286 tokens — and **0 components**. The
path that worked (parse `:root`+`@theme` → flat literals → `ds import` → 102×
`change-token`) was **invented in-session**, not documented.

### The shape survey (measured 2026-07-17, not assumed)

The three most-different code projects on disk:

| | dana-desktop | traicaybentre | hvs |
|---|---|---|---|
| CVA / tailwind-variants | **0** | **0** | **0** |
| CSS custom-property decls | **429** | **61** | **1162** |
| `@theme` (Tailwind 4) | 1 | 14 | 4 |
| `:root` css | 2 | 50 | 13 |
| `data-theme` | **8** | **125** | **5** |
| Storybook | no | no | no |

Three conclusions, **measured**:

1. **CSS custom properties are universal (3/3).** The vocabulary source is settled by data.
2. **No variant library is standard (0/3 CVA).** There is no parser shortcut to buy.
3. **Multi-theme via `data-theme` is universal (3/3).** It is the norm, not dana's quirk.
   Storybook is 0/3 — a ladder rung with nothing on it.

This survey **killed two designs proposed earlier in the same session** (a new parser hand;
a CVA regex). Both were guesses about shape. Recording that here because it is the method,
not an anecdote: *measure the corpus before designing the ladder.*

### The corpus (why n=1 is not our constraint)

**Eight real code projects sit on this machine**, all under git — traicaybentre (999
components / 340 css), dana-desktop (491 / 6), dana-ui (376 / 15), hvs (295 / 129), sodeal
(145 / 17), spaflow (114 / 13), efe-website (96 / 17), gravityhive (77 / 24). Plus
**EaseUI** — 2464 components, 654 HTML, 1040 css-vars, **no root `package.json`** (62 of
them nested).

Four are the README gallery — the studio's own credential. **DESIGN:OS has never onboarded
one of them.** Art III is not expensive here; it is free and available 9×.

---

## 4. Root-caused findings (this session, live-reproduced)

### R1 — `ui scan` gives up silently, alphabetically (was filed as F10)

`project-scan.ts:44-45` — `MAX_DEPTH = 6`, `MAX_ENTRIES = 4000`; `:113` returns on budget
exhaustion **with no signal**; `:108` sorts entries **alphabetically**; the walk is
**depth-first**.

dana's `src/`: `agent-servers · backend · config · dana-ontologist(415 files) · desktop-ui`.
The budget dies four directories before the UI. Live:

```
ui scan --cwd /Users/jang/Products/dana-desktop --json
→ ok: true · framework: react · styling: [tailwind]
  cssFiles: 0 · componentDirs: 0 · htmlFiles: 0 · truncation field: NONE
```

`dana-tokens.css` is sitting right there. The envelope says `ok`.

**This is not "scan cannot see below root"** (the filed diagnosis) — `SKIP_DIRS`
(`:40-42`) is already correct and already excludes `node_modules/.next/.claude/…`. The walk
works. **The budget runs out, in the least useful order, and lies about it.**

Violates Art VIII (*"say exactly what they checked"*) and Art II (the cap shipped without
its linter). Art IV: EaseUI (2464 components) and traicaybentre (999) blow the same budget —
**class-wide, not dana-specific**.

### R2 — `registry register` never reseals (F1) — CONFIRMED, cause located

Reproduced live twice from a clean `ds init`. `registryHash` is written by exactly two call
sites — `ds-init-impl.ts:200`, `ds-import-impl.ts:80` — i.e. **only at whole-DS birth**.
`registry.ts` (319 ln) contains no `hash`/`manifest`/`reseal` reference at all.

The scaffolding is **already built and unused**: `ds-manifest.ts:16-19` declares changelog
`kind: "register"` with `by: "… | ui registry register"`, and `:97` admits `"register"` into
`CHANGELOG_KINDS`. **No code path ever emits it.** Nobody wired the last connector.

Root premise: **the registry was modelled as a birth-time artifact, not a living one.** F1
(register breaks the seal) and F3 (`import --force` wipes the registry, resets generation to
1) are the same premise seen from two sides.

Makes `learn.md`'s own quality gate unsatisfiable: *"when the source was code, ≥1 component
is registered"* + *"`ds status` must exit 0 … DS_TAMPERED is terminal — surface it and
stop."* Both cannot hold today.

**R2 is not a code-road blocker. It is a flagship blocker.** `registry register` has **five**
callers in `templates/`: `learn.md`, `redesign.md`, `extract.md`, `check-consistency.md`, and
**`generate.md`** — whose Step 7 is titled *"Final deterministic pass + register new
components"* and shells out to it directly.

`/ui:generate` is the first verb in the README's opening line. **Every time it registers a new
component, it tampers the design system it just wrote into.** The Art IV question — "which
other consumer has this blind spot?" — answers itself: *all five*. The reseal is therefore not
this spec's feature; it is a **shared-layer repair with five callers**, and spec 009 is merely
the first road that cannot open without it.

Why it survived unnoticed: the two projects DESIGN:OS had onboarded are Figma-side. Their
registry is written **wholesale** by `ingest-figma-ds` / `figma reconcile` — paths that reseal
because they rebuild the whole store. The incremental writer is the one nobody's world
exercised.

### R3 — F5 is a MISDIAGNOSIS (and it fooled us too)

The filed finding says `--tokens` "validates then discards". It does not. The value persists
as **`tokensUsed`** (`registry.ts:140` → `registry-store.ts:242`); the probe read `.get('tokens')`
and found `None`.

Verified live — `Button/Second` carries `tokensUsed: ["color.accent-strong"]`.

**The real defect underneath is worse than the filed one**: one concept wears three names —
doctrine says `tokens` (`extract.md` step 10), the flag is `--tokens`, the key is
`tokensUsed`. It fooled the reporter *and* a reader holding the full source. That is a
CONTRADICTION, not a discard.

*Method note: 1 of 11 filed findings dissolved on contact with the source. Field reports are
symptoms, not diagnoses. Triage before spec'ing — always.*

### R4 — the mode convention is about to get a second emitter, and has no shared definition

`figma-ds-tokens.ts:13-16`, verbatim: modes map to base → `$value`, every other mode →
`$extensions["mode.<name>"]`; *"`ui tokens compile` resolves `$value` and ignores
`$extensions`, so the compiled output stays valid while the dark layer is preserved and
documented."*

Verified live — `tokens compile` on a leaf carrying `$extensions["mode.dark"]` emits
`--color-bg: #ffffff` and drops `#111111`. **That is declared, deliberate behaviour, not a
bug**: the mode layer is *preserved* in the token file and *rendered* in DESIGN.md
(`figma-ds-designdoc.ts:22`); only the CSS emit is single-mode.

**This settles dana's own unresolved question #4** ("should the DS represent a theme-resolved
slice or the theme-agnostic system?"). The shipped answer: **base mode compiles; other modes
are carried as data and documented.** The code road adopts it; it does not invent a second
semantics.

The real Art II/Art IV finding is narrower: `token-model.ts` has **no mode concept** — the
convention lives only in `figma-ds-tokens.ts`, marked *"kept local to avoid a cycle"*. The
code road is about to become its **second emitter**. A convention with two emitters, no
shared definition, and no linter is precisely what Art II says will drift. Give it one home
and one check *before* the second writer exists — not after.

> **Method scar.** This finding began as "the compiler silently drops mode data" and was
> wrong. Reading the full comment killed it. Same error four times this session — deliberate
> design read as accidental gap (`plans/` vs `specs/`, npm-link, the librarian's ≥2-project
> firewall, this). **The prior should be: if it looks like a hole, first assume it is a
> decision and go find the sentence that made it.** Grep-sized reads manufacture false
> findings; the sentence next to the code usually says why.

---

## 5. User stories

- As a **studio designer**, I want `/ui:learn` on a real app repo to compile that product's
  DS from its own CSS + components, so my generated work passes Consistency against *their*
  system rather than a persona default.
- As a **studio designer**, I want the scan to tell me it truncated, so a silent `cssFiles: 0`
  never reads as "this project has no CSS".
- As a **studio designer**, I want to register a component without bricking the DS, so
  `learn.md`'s own gate can pass.
- As a **product owner (dana)**, I want the onboarding to *name* my DS's problems (4 parallel
  hardcoded theme sets) rather than silently ingest them, so onboarding is also a diagnosis.
- As an **open-source adopter** (post-distribution), I want `ui init` + `/ui:learn` on my repo
  to work without a Figma seat, so the on-ramp doesn't presuppose the studio's toolchain.
- As a **maintainer**, I want every rung of the ladder backed by a corpus count, so we stop
  shipping doctrine shaped like the last project we happened to open.

---

## 6. MoSCoW

| Priority | Item | Rationale |
|---|---|---|
| **Must** | R1 — BFS walk + `truncated`/`visited` in the envelope | Scan **is** the router. A lying router makes auto-routing structurally impossible. Art VIII. |
| **Must** | R2 — `registry register` reseals (audit first, per Art IV) | `learn.md`'s gate is unsatisfiable without it. Scaffolding already exists. |
| **Must** | CSS custom properties → DTCG two-tier, with `$extensions["mode.*"]` | 3/3 universal. The vocabulary. |
| **Must** | R4 — one home + one linter for the `mode.<name>` convention before the 2nd emitter | Art II/IV. 3/3 projects are multi-theme; the code road is emitter #2 of a convention with no shared definition. |
| **Must** | `ds import` accepts aliases (F2) | The 2-tier structure cannot survive import without it; doctrine mandates the tier (`token-taxonomy.md:110`). |
| **Must** | Component registration for a code project (host model reads → kernel validates) | 0/3 CVA ⇒ no parser shortcut exists to buy. |
| **Should** | F4 `--css` accumulate (or hard-error); F6 casing convention | Silent evidence loss; 28/286 dana tokens unreferencable. Both cheap. |
| **Should** | F3 — `--force` refuses (or preserves) a non-empty registry | Same premise as R2; fix together or the escape hatch stays destructive. |
| **Should** | R3 — one name for one concept (`tokens` / `--tokens` / `tokensUsed`) | Fooled two independent readers. Naming is a correctness surface. |
| **Could** | F11 — `ds a11y` defaults to declared/`-foreground` pairs | 948 "failures" on a fine palette is noise drowning signal. Not on the road's critical path. |
| **Won't (this spec)** | `CONVENTIONS.md` for code (C7 grammar) | Owner-scoped to a later spec (Phase 3+). Makes generation *resemble* the product; not a condition of the road existing. |
| **Won't (this spec)** | Code-DS hygiene detectors (incl. `token-taxonomy.md:121` as a machine check) | Same. Designed *after* Phase 1+2 meet real data — not before. |
| **Won't (this spec)** | F7 — persona on the import path | Cosmetic next to the road being closed. |

---

## 7. Appetite & No-Gos

> **Naming**: this doc uses **Must/Should/Could** for priority (§6) and **Phase 1 / Phase 2**
> for delivery order (below). Never `P1`/`P2` — in this repo that shorthand already means a
> spec phase (`specs/006-living-loop/phase-01-*`), and MoSCoW's `P1` would collide with it.

**Time budget: Phase 1 + Phase 2 only.** "Done" = the gate `learn.md` already wrote for itself is
satisfiable: *`≥1 component registered` **and** `ds status` exits 0*. Today those two
sentences cannot both be true. Making them both true **is** the closed loop. Everything
else is depth on an open road.

### No-Gos

1. **No new parser, no new hand, no TS/AST dependency.** Art I keeps the kernel
   zero-runtime-dependency — a promise printed on the README. 0/3 projects use a standard
   variant library, so a parser buys nothing measurable and costs the constitution.
2. **No executing the project's code** (jsdom/testing-library, dev server, build). dana
   *has* the toolchain, but for a tool aiming at open-source distribution, "onboarding runs
   your code" is a trust boundary we do not cross for markup we can obtain otherwise.
3. **No `--ui-root` flag.** North-star: *"the user supplies what; the system supplies how."*
   A flag hands the machine's job back to the user. Fix the walk instead.
4. **No CVA/`Record<>`-shaped regex.** It would work on dana today and encode dana's
   convention as doctrine — the exact mechanism that produced VSF-PCP-shaped doctrine.
5. **No new anything until the corpus is counted.** Every ladder rung ships with its count
   out of 9. A rung at 0/9 (Storybook) does not ship.

---

## 8. Research protocol

| Step | Finding |
|---|---|
| **Benchmark** | The peak is **in this repo**: the Figma road. `scan-design-system` → `ingest-figma-ds` (C0 vocabulary, deterministic, zero-token) and `scan-conventions` → `synthesize-conventions` (C7 grammar), with `figma audit`'s 10 hygiene detectors → cleanup plan *before* the store. The code road copies a proven shape; it invents no pattern. |
| **First principles** | DESIGN:OS emits a CSS custom-property token system and cannot read one back in. One absence, eleven symptoms. |
| **Proven frameworks** | The **evidence ladder** — already a house idiom, three times over: `delivery-assets.md` (inline-SVG → raster → sprite → crop LAST RESORT), `motion-craft.md` (T1 CSS → T6 WebGL), `extract.md` §3c (SOURCE-grade → GUESS-grade → "unverified"). The markup ladder is the fourth, and it is measured, not imagined. |
| **Cross-domain** | **Breadth-first search.** The walk's pathology is not its budget — it is spending the budget depth-first and alphabetically. UI directories are shallow; 415-file service subtrees are deep. BFS spends the same 4000 entries on the cheap, informative layer first. One word, no flag, no new concept. |
| **Trade-offs** | Host-model-reads is **not deterministic** — two runs may differ. Accepted, bounded three ways: the kernel refuses invented tokens (`BAD_TOKEN` + `registry-token-check.ts`) — **note: when this brainstorm was written that was false; `registry-store.ts:167` checked the path's FORMAT only, and Phase 4 found it live and closed it**; `learn.md` §3c already mandates SOURCE-grade with an "unverified" list; and 0/3 CVA means determinism is not purchasable at any honest price today. Revisit when the corpus shows a standard worth parsing. |
| **Executability** | 9 real code projects on disk, 4 of them the README gallery. Art III costs a `--cwd` per project. The gate is a table across ≥3 of them, and it can fail honestly. |

---

## 9. Open questions

1. ~~Does `ui tokens compile` resolve `$extensions["mode.*"]`?~~ **RESOLVED — no, by design.**
   Verified live; the behaviour is declared at `figma-ds-tokens.ts:14-16`. Base mode compiles;
   other modes are preserved + documented. The code road adopts the same semantics. See R4.
2. ~~What is `/ui:generate`'s deliverable for a React project?~~ **RESOLVED (owner,
   2026-07-17): HTML is the design; developers port it.** A product designer delivers designs,
   not production code — so the registry's required `markup: HTML` is the correct shape for the
   code class, and `generate.md`'s framework-blindness (`:281`, self-contained `index.html`;
   zero mentions of React/JSX) is a scope boundary, not an omission. **This is the assumption
   spec 009 rests on. It is now stated.**
3. **EaseUI has two legitimate UI roots** (`app/src/components`, `frontpage/app/src/components`)
   and no root `package.json`. BFS finds both. With `--ui-root` ruled out, what does the
   router do with a genuine tie — largest wins, or the one question `learn.md` §2 already
   budgets for?
4. **`CONTEXT.md` is an empty stub** while `CLAUDE.md` mandates its canonical terms. Every
   term this spec uses (code road · evidence ladder · mode · parallel hardcoded set) has no
   home. Fill it as terms land, or the next session re-derives them.
