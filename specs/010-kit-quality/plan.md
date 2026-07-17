# Plan — Spec 010: The kit's quality

**Brainstorm**: `brainstorm.md` (approved) · **Domain**: COMPLEX (`/es-feature-dev` Phase 0)
**Design brain**: `knowledge/figma-craft/component-design.md` — **in-repo, and it is exactly this
job's skill**: ① anatomy → ② variant axes → ③ states → ④ edge cases → ⑤ create-vs-extend
(registry-first) → the specimen contract → lifecycle draft→beta→stable. `/es-lazy`: the codebase's
own doctrine before any external skill.

## Classification (evidence, `/es-feature-dev` Phase 0)

| Signal | Value | Evidence |
|---|---|---|
| Scope | **wide** | 29 existing files + ~25 new + 1 new linter + tests |
| Novelty | **novel** | No linter checks for an **absence**. `a11y-lint.ts:7` checks "missing viewport meta on a **responsive doc**"; `layout-lint.ts:86` is the spec-003 mobile floor — both check **hazards on something already responsive**. |
| Clarity | **partial** | The breakpoint/token collision (resolved below) was ambiguous until measured. |

→ **COMPLEX**. Not EPIC: the decisions are phrased and the cost is measured (below).

## Owner decisions (2026-07-17)

1. **Breakpoint is a layout constant, not a design token.** `@media (min-width: var(--x))` is
   invalid CSS — a media query condition cannot read a custom property. So the value must be a
   literal, which collides head-on with the kit's token-only rule. Resolution: **the token-only
   rule governs colour, space and typography — not every number.** The kit already ships
   `max-width: 560px` (`alert.ts:15`) and `min-width: 2.25rem` (`pagination.ts:21`). A breakpoint
   carries no taste: changing persona does not move where a layout breaks.
2. **Do all of it** — the responsive dimension **and** the coverage.
3. **Use a designer skill** — `knowledge/figma-craft/component-design.md`, in-repo.

## The coverage number: ~25, not 68. Measured.

`platform-design-system` has 95 `COMPONENT_SET` records → **71 distinct base names**. The kit
covers **20** of them (alert, avatar, breadcrumb, button, checkbox, combobox, dialog,
dropdownmenu, field, input, kbd, popover, progress, select, separator, skeleton, switch, table,
textarea, tooltip). Of the 51 remaining, most are not a general component library:

| Bucket | Examples | Verdict |
|---|---|---|
| Page templates | `Charts-1.`, `Dashboard-1.`, `_Sidebar 07.`, `Sidebar template` | **not components** |
| That product's own assets | `Crypto Icon`, `Payment Method Icon`, `Social Media Icon`, `Flag`, `Store Badge`, `Cursor`, `Image view` | **not portable** |
| Variants of what the kit HAS | `Dialog-v2`, `Tabs - Default`, `Combobox - Multiple`, `_Avatar - Initials`, `RadioButton`(=Radio), `_SelectMenu`(=Select), `Sonner`(=Toast), `BadgeText/Number/Status`(=Badge) | **axes, not components** |
| Implementation details | `scrollbar-hoz`, `scrollbar-ver` | **not components** |

**Genuinely missing and general — 25:**
AlertDialog · AspectRatio · Calendar · Carousel · Collapsible · Command · ContextMenu ·
DatePicker · TimePicker · Drawer/Sheet · Empty · HoverCard · InputOTP · InputGroup · ButtonGroup ·
KbdGroup · Menubar · NavigationMenu · Resizable · ScrollArea · Slider · Spinner · Toggle ·
ToggleGroup · Item

**~25 × ~90 lines ≈ 2.2k, not 6k.** Third inflated headline this session caught by counting
(20×→3.5×; 68→25; ten guessed `SKIP_DIRS` entries→three). The brainstorm's No-Go — *"no target
without a count"* — has now paid for itself three times. It is the spec's most valuable rule.

## Seams under test (`/es-feature-dev` Phase 2)

One seam, the highest available: **`COMPONENT_KIT` + the four existing linters + the new
responsive linter**, driven exactly as `ds init` drives them. Tests observe a kit component the
way a user's DS does — through the registry record and the floors — never through a module's
internals. `ds-init-impl.ts:154-156` registers `COMPONENT_KIT` verbatim; that is the boundary.

## Phases — vertical slices, each demoable alone

| Phase | Delivers (user's view) | Blocked by |
|---|---|---|
| **1** | The breakpoint scale is declared doctrine, and **one** component (Table — the most reflow-hungry) reflows. The new linter fails the other 26. | — |
| **2** | All 27 reflow. The linter passes the kit. Every floor still green. | 1 |
| **3** | The 25 missing components exist, each designed through `component-design.md` ①–⑤. | 2 |

**Phase 1 is a tracer bullet, not a layer.** Scale + one real component + the linter + the tests,
end to end. If the shape is wrong, it is wrong once — not 27 times.

**Phase 1's linter fails 26 of 27 components on purpose.** That is Art II working: the emitter
(a reflowing component) and the check that fails without it ship together, and the check's first
run tells the truth about the other 26.

## Phase 1 — the scale, one component, the linter

- **The scale**: one shared breakpoint set, literal, declared in `knowledge/mode-constraints.md`
  (it already owns the 8 UI modes — this is its shared layer, Art IV). Do **not** invent a token
  category; do **not** add a `breakpoint` group to the taxonomy (owner decision 1).
- **The linter**: a new check — a kit component with no `@media (min-width: …)` and no declared
  exemption fails. **Exemption is explicit and reasoned**, per record: a Tooltip or a Switch may
  legitimately not reflow. An exemption with no reason is a failure (Art VIII: say exactly what
  you checked).
- **The component**: `Table` — 27/27 of the kit is fixed-render, and a table is the case that
  breaks first and worst on a phone.
- **Seam tests** only (above). Plus the repo's hard-won rule: **the kit runs the FULL linter set
  in its own tests** — the specimen page once shipped an unguarded animation because its gate ran
  3 of 4.

## Phase 2 — the other 26

Mechanical once Phase 1 fixes the shape. Every component either reflows or carries a reasoned
exemption. The linter goes green **because the kit changed**, never because the check softened.

## Phase 3 — the 25

Each one through `component-design.md`: ① anatomy → ② axes (**from evidence** — platform-DS's
own axis names, `Variant=`/`Size=`/`State=`, never invented) → ③ states → ④ edge cases → ⑤
registry-first (does the kit already have it under another name? `RadioButton` vs `Radio` says
this check is load-bearing).

Per-component gate: **token-only** (colour/space/type through `var(--…)`; a literal hex or a raw
spacing px is a build error), reflows or is exempt-with-reason, passes all five floors,
`variants` uses `Axis=Value`, `status: draft` until reviewed (`component-design.md`'s lifecycle).

## Risks

| Risk | Mitigation |
|---|---|
| **A breakpoint literal opens the door to other literals** | The token-only rule is *narrowed*, not dropped: colour/space/typography stay token-only, and the existing `no-literal` discipline is what a Phase-1 test must pin. If Phase 1 cannot express that boundary as a check, the owner's decision needs revisiting — **report, do not widen quietly**. |
| The linter's "exemption" becomes a rubber stamp | Exemption requires a reason string, and the report lists every exempt component with its reason. A list nobody can defend is the signal. |
| 25 components drift into 25 design opinions | `component-design.md` ①–⑤ is the brain; `taste-rubric.md` is the score; platform-design-system is the reference for coverage and axis depth — **not for record contents** (its 537 records carry 0 markup, 0 tokens). |
| Scope creeps back toward 536 | It is 25. Anything proposing more must bring its count. |
| Phase 3 collides with spec 009 | It cannot: 010 touches `src/core/component-kit/` only. 009 owns `registry.ts`, `ds-reseal.ts`, `project-scan.ts`, `token-import.ts`, `ds-import-impl.ts`, `command-signatures.ts`. |

## The breakpoint scale — RESOLVED by counting, 2026-07-17

Every `@media (min-width: …)` across the nine code projects, by value:

```
298 × 48rem  = 768px    ← sm→md
170 × 64rem  = 1024px   ← lg
167 × 40rem  = 640px    ← sm
 30 × 80rem  = 1280px   ← xl
 19 × 96rem  = 1536px   ← 2xl
  … 52em(8) · 64em(6) · 40em(6) · 1024px(8) · 768px(2) · 640px(2) · 1536px(1) — the same values
    in other units, plus noise
```

**684 of 717 occurrences — 95% — are exactly Tailwind's default scale, expressed in `rem`.**

```
sm   40rem   (640px)
md   48rem   (768px)
lg   64rem  (1024px)
xl   80rem  (1280px)
2xl  96rem  (1536px)
```

Two things this bought that a guess would not have:

1. **`rem`, not `px`.** The corpus is unanimous, and it is the accessible choice — a `rem`
   breakpoint respects the user's font size; a `px` one overrides it. The kit inherits a decision
   nine real products already made, and Art X puts accessibility above layout.
2. **The scale is counted, not assumed.** "Everyone uses Tailwind's default" was true — but this
   spec's own No-Go forbids shipping a rung without its count, and the count is what proved `rem`.

The scale lives in `knowledge/mode-constraints.md` (Art IV: it already owns the 8 UI modes),
declared as **layout constants, not tokens** (owner decision 1).
