# Brainstorm — Spec 010: The kit's quality

**Stage**: brainstorm · **Sizing**: L · **Date**: 2026-07-17 · **Origin**: owner, mid-spec-009 —
*"27 cái kit này outdate quá rồi. Nếu là component mà build thì phải học hỏi
Platform-Design-System mà build theo. Phải chi tiết và chất lượng như vậy mới được."*

**Constitution**: Art II (emitter+linter), Art III (real data), Art VIII (honesty), Art IX (YAGNI)

---

## 0. The use case — asked by the owner, and it is the whole justification

**E1: a user with no Figma file and no codebase.** They run `ui ds init`, and the kit **is their
design system.** Not a starter, not a sample — the whole thing they have.

That is the only case the kit serves. E2 (code) and E4 (Figma) compile a DS from the project's
own evidence and never touch it. So spec 010 is worth exactly what a greenfield user's day-0
design system is worth — which, since distribution is the destination, is the product's first
impression.

**What the kit is NOT** (measured, and it corrects this brainstorm's first draft):

`ui ds context` — what every agent reads and what `/ui:generate` step 4 loads — emits
**name + category + token list, and no markup at all** (9,400 chars, zero markup occurrences):

```
- **Control/Button** (action) — tokens: color.primary, color.primary-foreground, …
```

So the model **never sees a component's shape**. It writes fresh HTML from tokens + persona +
`page-structures.md`. **The kit's 1,971 lines of markup do not reach generated output.** They are
read by `ds-preview.ts` / `ds-preview-sections.ts` (the specimen/preview surface) and `ds-diff.ts`
(visual-breaking-change detection), and gate `curator.md`'s "specimen clean" check.

The first draft of this brainstorm claimed the kit's blindness made generated output
non-responsive. **That was false, and the owner caught it with a question rather than a
measurement.** What follows is scoped to what the kit actually is.

---

## 1. Press release

**The design system a greenfield user is handed grows up.**

`ui ds init` compiles a kit from the chosen persona, and for a user with nothing else, that kit
**is** their design system: its inventory is what their system claims to have, its specimen is
what their system looks like, and its `ds diff` baseline is how their system's changes get
judged.

Today it is 27 components rendering exactly one way — two of them offer a size choice, none
knows a phone exists. Measured against a production design system the studio itself audited, the
gap is not polish. It is a missing dimension.

---

## 2. The root problem

**A greenfield user's whole design system has no responsive story, and no floor can see that —
because an absence has no bugs.**

- `@media` occurrences across the kit's 1,971 lines: **5 — every one `prefers-reduced-motion`.**
- `@media (min-width: …)` breakpoints: **0.**
- Meanwhile spec 003 shipped the **mobile floor** (M2–M6) and `knowledge/mode-constraints.md`
  defines **8 UI modes, one of them mobile**.

**But the kit passes all four linters cleanly — verified, 0/27 errors on every one** (taste,
layout, content, a11y, each component wrapped in a valid document). *First measurement said 27/27
failed a11y; the cause was `<html>` with no `lang` in my own test harness. Checked before
believing — the seventh time this session that a "finding" was the measurer's error.*

That green result **is** the problem, stated precisely:

The mobile floor checks for **hazards** — fixed-width overflow, `100vw` traps, tap targets. A
component with **no breakpoints has no breakpoint bugs**. It passes by having nothing to get
wrong. The floor cannot distinguish *"reflows correctly"* from *"never reflows"*.

So the standard *"a component has a responsive story"* has **neither an emitter nor a linter** —
Art II's failure mode in its purest form: not a rule that drifted, a rule that was never written
because everything the system could measure already looked green.

---

## 3. Evidence (measured 2026-07-17)

`ui ds init`'s kit vs `platform-design-system` — the studio's own production DS, 129-component
Figma library per the README, **536 records** in the registry, hygiene-audited, contrast-proven,
VR-baselined:

| | kit (`ds init`) | platform-design-system |
|---|---|---|
| components | **27** | **536** (20×) |
| median variants / component | 4 | 3 |
| max variants | 11 | **463** |
| `State` axis | 27/27 | 86 |
| `Size` axis | **2**/27 | 18 |
| **`Breakpoint` axis** | **0** | **52** |
| **`Mobile` axis** | **0** | **10** |
| **`Type` axis** | **0** | 54 |
| `@media (min-width)` in source | **0 / 1,971 lines** | (Figma-native) |

Three measured gaps, not opinions:

1. **No responsive dimension at all.** A real DS models breakpoints as a variant axis on 52
   components. The kit has zero, in 1,971 lines.
2. **Size lives on 2 of 27 components** — 25 have no size choice whatsoever. The real DS: 18.
3. **No semantic `Type` axis** (54 in the real DS).

The kit's median depth (4) is actually *higher* than the real DS's (3) — so this is **not** "the
kit is shallow everywhere". It is deep on the one axis it knows (`State`, 27/27) and blind on the
axes a shipping product needs.

### What platform-design-system is NOT

Its 537 registry records carry **0 markup and 0 tokensUsed** — it is a Figma **inventory** (name
+ category + variant axes), which is exactly what `ingest-figma-ds` can honestly produce from a
Figma scan. Its DESIGN.md Components section is a one-row-per-component table. **The detail lives
in the Figma file and in its 830 lines of token definitions — not in its records.**

So it is the reference for **what a component library should cover and how deep its axes go**. It
is **not** a template for a record's contents. The kit remains the only complete-record precedent
in the system. (Spec 009 Phase 4 copies the kit's record *structure* for exactly this reason.)

---

## 4. Why the gap exists

Same mechanism as spec 009's, one layer up. The kit was written for the world DESIGN:OS knew:
**Figma-side design projects and single-page HTML generation**, where one rendering is the
deliverable. Nothing in that world ever asked a component to reflow.

`mode-constraints.md` names a mobile mode. `taste-lint`/`validate-layout` enforce a mobile floor.
The kit predates both and nobody re-opened it — because no project had ever taken the kit to a
phone and complained.

---

## 5. User stories

- As a **greenfield user (E1)** — no Figma, no codebase — I want the DS `ds init` hands me to be
  a system I could ship on, because it is the only one I have.
- As a **greenfield user**, I want my specimen page to show components that reflow, because that
  page IS my design system's face — to me, to my team, and to `ds diff`'s judgement of every
  later change.
- As a **greenfield user**, I want an inventory rich enough to compose with, because
  `ui ds context` hands the model **names and token lists** — so the inventory *is* the
  vocabulary, and 27 thin entries is the whole vocabulary it gets.
- As a **maintainer**, I want a floor that can SEE a missing responsive story, so the kit's clean
  four-linter pass stops meaning "fine" when it only means "nothing to get wrong".
- As an **open-source adopter** (post-distribution), I want day-0 quality to be a credential, not
  a placeholder — the kit *is* the product's first impression.

---

## 6. MoSCoW

| Priority | Item | Rationale |
|---|---|---|
| **Must** | A responsive dimension — breakpoint-aware components | 0/1,971 lines today vs 52 components in the real DS. The one missing *dimension*. Scope note: this fixes the **specimen/preview** and `ds diff`, not generated output — the model never sees markup (§0). |
| **Must** | A **linter for the absence** — a check that fails a component with no responsive story | The four floors already pass 0/27 (verified). Passing is not the goal; the goal is a floor that can *see* the gap. Art II: the emitter (breakpoint-aware components) ships with the check that fails without it. |
| **Must** | `Size` where a real product has it (18/536, not 2/27) | Measured. |
| **Should** | A semantic `Type` axis where the real DS carries one (54) | Measured, but composition-level — it can follow. |
| **Must** | Fill the advanced surfaces — 27 → ~95 (owner, appetite) | **Measured: the real gap is 3.5×, not 20×.** 536 − `_Screens`(26)/`Page content`(75)/`Blocks`(93)/`Charts`(16)/`Sidebar`(16)/`Typography`(16) = 294, of which **95 are COMPONENT_SETs**. The kit covers the basics well; what it lacks is Calendar · DatePicker · Command palette · ContextMenu · Menubar · NavigationMenu · HoverCard · Carousel · Drawer/Sheet · ScrollArea · Resizable · Slider · InputOTP · Empty. |
| **Could** | Density / elevation axes | Present in neither at scale. No evidence yet. |
| **Won't** | Chasing 536 components | The number is inflated by page/screen entries. Measured: **95** is the target, not 536. No-Go 1 paid for itself. |
| **Won't** | `Breakpoint` as a variant axis | **RESOLVED (owner): responsive is CSS — `@media` inside the component.** platform-DS models it as a variant *because Figma has no media queries* — that evidence teaches a Figma constraint, not a universal truth. A variant axis would multiply every component's matrix for something CSS does free. |
| **Won't** | Changing the record *structure* | Spec 009 Phase 4 owns that, from the kit's own precedent. This spec changes what the components *are*, not how they are recorded. |

---

## 7. Appetite & No-Gos

**Appetite (owner, 2026-07-17): the responsive dimension + the advanced coverage.** Two halves:

1. **The dimension** — every component reflows, via `@media` inside its own markup, and a linter
   that can *see* a component with no responsive story. The kit already passes every floor we have
   (0/27, verified) — so the work is not "make it pass", it is "build the floor that would have
   failed it".
2. **The coverage** — 27 → ~95, the measured gap. The basics are covered; the absences are the
   advanced surfaces a real product needs.

Both must survive No-Go 4: the kit is *compiled* from a persona. Whatever lands stays a compile,
or 26 personas × ~95 components becomes a maintenance cliff.

### No-Gos

1. ~~No targeting 536.~~ **Measured: 95.** The 20× headline was inflated by page/screen entries;
   the real gap is **3.5×**. This No-Go paid for itself before the spec was written — keep it as
   the pattern, not as an open item. (Session precedent: a `.venv` of 8,187 files looked like a
   source tree until it was measured.)
2. **No copying platform-design-system's records.** They are empty shells — 0 markup, 0 tokens.
   Copying the *reference* means copying its coverage and axis depth, from the Figma file.
3. **No new axis without a count.** `Breakpoint` earns its place at 52/536; `Type` at 54. An axis
   at 0/536 does not ship — the same rule that killed ten guessed `SKIP_DIRS` entries this week.
4. ~~No hand-written per-persona components — the kit is compiled from a persona.~~ **FALSE, and
   the correction makes this spec tractable.** Measured: `COMPONENT_KIT` is a **static array**
   (`ds-init-impl.ts:154-156` registers it verbatim); **no kit file takes a persona.** Each
   component is a template literal referencing `var(--color-primary)` / `var(--space-3)` — the
   persona only changes the **values** those CSS vars resolve to. **There is no 26× multiplier.**
   Write a component once and every persona gets it.
   The real No-Go that replaces it: **components stay token-only.** A literal colour or a raw px
   in kit markup breaks the persona-agnosticism that makes the whole design work.
5. **No scope into spec 009.** The record shape, the code road and the seal are settled there.

---

## 8. Research protocol

| Step | Finding |
|---|---|
| **Benchmark** | `platform-design-system` — the studio's own audited production DS. Not the average, and not a public library: something we shipped and VR-baselined. Its Breakpoint(52)/Type(54)/Size(18) axis counts are the target's evidence. |
| **First principles** | DESIGN:OS lints for a mobile floor its own kit has never rendered. One missing dimension, three symptoms. |
| **Proven frameworks** | The house idiom already exists: `mode-constraints.md` defines 8 UI modes; the mobile floor (M2–M6, spec 003) is already deterministic code. The kit does not need a new concept — it needs to **consume the ones already shipped**. |
| **Cross-domain** | The 20× coverage gap is probably 3–4× once `_Screens`/`Page content`/`Blocks` are excluded. **The headline number is inflated; measure the real one before it becomes a goal.** |
| **Trade-offs** | Breakpoint-aware components make every kit component bigger and every persona compile heavier. Accepted: a library that cannot render a phone is not a library in 2026. |
| **Executability** | The kit is 1,971 lines across 29 files — **static markup, persona-independent** (measured). Cost is linear: `@media` into 27 existing template literals, plus ~68 new files at ~90 lines ≈ 6k lines. Big, mechanical, no multiplier, no external dependency. The blast radius is one array. |

---

## 9. Open questions

1. **What is the real coverage gap?** 536 minus `_Screens`(26) / `Page content`(75) / `Blocks`(93)
   ≈ 342 — still 12×. But how many of those 342 are variant-set members rather than distinct
   components? **Measure before this becomes a target.**
2. ~~Does the kit pass its own linters?~~ **RESOLVED — yes, 0/27 errors on all four.** Measured.
   And that is the finding, not the reassurance: the floors check for hazards, and an absence has
   no hazards. See §2.
3. **[BLOCKS DESIGN] Is `Breakpoint` a variant axis or a CSS concern?** platform-design-system is Figma, where
   responsive *must* be a variant (Figma has no media queries). In HTML it can be a media query
   inside one component. **The Figma reference may be teaching a Figma constraint, not a
   universal truth.** Resolve before designing.
4. Does this block distribution? The kit is the day-0 first impression, and distribution is the
   stated destination — but that is a sequencing call, not a scoping one.
