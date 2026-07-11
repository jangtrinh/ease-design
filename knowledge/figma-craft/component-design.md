# Component design — what to think when designing a component

The **design brain** for a single component (a button, badge, input, card, row, avatar…),
separate from the *construction* mechanics (`components-variables-styles.md`) and the
*interaction/cost* brain (`workflow-experience.md`). Read this when the job is scoped to ONE
component — designing a new one from a requirement, or deciding which variant/state a request
needs. `/ui:design` (component scope) walks this file top to bottom.

A component is not a picture — it is a **small design system of its own**: a stable role, a
set of variation axes, a set of states, and a set of edge cases it must survive. Designing one
means deciding all four deliberately, then building the SET (not a single frame). Skip a state
or an edge case and the component silently breaks the first time real data hits it.

The discipline is **CONSIDER each, include the applicable** — you weigh every axis / state /
edge case listed here, and ship the ones the component's role actually needs. Not every button
needs a `loading` state; a submit button does. The thinking is exhaustive; the output is scoped.

---

## ① Anatomy — the parts

Name the component's **slots** before drawing anything. Most components decompose to:

- **container** — the bounding auto-layout frame (padding, radius, fill, border, the sizing
  contract HUG/FILL/FIXED).
- **leading** — an optional icon / avatar / control before the label.
- **label** — the primary text (and often a secondary/support line).
- **trailing** — an optional icon / count / control / chevron after the label.

Not every component has all four — a badge may be `container + label`; an input is
`container + leading? + field + trailing?`. Decide which slots exist and which are **optional**
(they become `INSTANCE_SWAP` / boolean-visibility props, `components-variables-styles.md` §1.4,
B5–B6), never a separate variant per slot combination. Naming the anatomy first is what lets
the variant matrix stay small: a slot is a *prop*, not an axis.

---

## ② Variants — the axes

A **variant axis** is a dimension along which the component legitimately varies while staying
the same component. Consider each; keep only the ones the role needs; cap the matrix at ~30
combinations (B5 — `Size × Tone × State` multiplies fast):

- **size** — `sm / md / lg` (drives padding, type size, control height, icon size on the grid).
- **tone / intent** — `primary / secondary / ghost / danger` (drives fill + text + border
  role bindings; danger/destructive is a distinct tone, not just a color).
- **density** — `compact / comfortable` (drives padding + gap; a table row vs a settings row).
- **icon** — `none / leading / trailing / icon-only` (icon-only demands an accessible label).
- **orientation** — `horizontal / vertical` where it applies (a segmented control, a stat card).

Each real axis becomes a variant property on the SET (`combineAsVariants`, §1.3); each
optional slot becomes a prop, NOT an axis. If an "axis" has one value, it is not an axis —
drop it. If two axes never combine meaningfully, split into two components instead of a sparse
matrix.

---

## ③ States — the interaction lifecycle

States are **not** axes you multiply blindly — they are the component's response to
interaction and data. Consider each; include the ones the component can actually enter:

- **default** — the resting state (always).
- **hover** — pointer over (pointer devices only; never the sole affordance).
- **focus / focus-visible** — keyboard focus ring (**mandatory** for any interactive
  component — the keyboard-only path, `ux-psychology.md` accessibility floor).
- **active / pressed** — the moment of interaction (the depress).
- **disabled** — non-interactive; reduced contrast BUT still legible; not focusable.
- **loading** — an in-flight action (spinner / progress; label often held, control locked).
- **selected / checked** — a persistent chosen/toggled state (tabs, chips, checkboxes, rows).
- **error / invalid** — failed validation (inputs, forms) — a distinct role binding + message slot.
- **success / valid** — confirmed-good (inputs, steps) where the role needs positive feedback.
- **read-only** — value shown, not editable (distinct from disabled: legible, focusable, copyable).
- **empty** — for data-bearing components (a list, a table, a select) with no data yet.
- **skeleton** — the pre-load placeholder shape — **distinct from `loading`**: skeleton is the
  first-paint shimmer before any data exists; loading is an action in flight over existing UI.

A control-type component (button, toggle) lives mostly in the interaction states
(default→hover→focus→pressed→disabled→loading). A data-type component (list, table, select)
adds the data states (empty, skeleton, error). Build the applicable set as a **states board**
(Recipe 17 / C2) so the grammar is visible and stays linked to the component.

---

## ④ Edge cases — what real content does to it

The states a component *enters on its own* when reality is messier than the happy path.
Consider each; design the component so it survives them (truncate, wrap, fall back, reflow):

- **text** — long text → truncate (ellipsis) or wrap? · empty text · one-very-long-word
  (no break opportunity — must not overflow the container).
- **numbers** — `0` · negative · huge (thousands separators / abbreviation) · decimals /
  currency precision.
- **counts** — `0` (→ the empty state) · `1` (singular copy) · many (overflow → "+N",
  pagination, scroll) · at max.
- **media** — missing image → a fallback (initials, a placeholder, a neutral fill), never a
  broken box.
- **i18n** — a long-language render (German compounds ~1.6× English) must not clip; the
  layout HUGs/wraps, not FIXED-clips.
- **RTL** — leading/trailing mirror; the anatomy is direction-aware, not left-hardcoded.
- **width** — at min width (does it collapse gracefully?) and max width (does it stop growing?).
- **data** — null / partial / missing fields → a graceful default, never a blank or a crash.
- **input** — keyboard-only (full operability + visible focus) vs touch (≥44px target,
  `ux-psychology.md` Fitts' floor).

Edge cases are where components earn their keep — a button that overflows on a long German
label, or a row that breaks on a null avatar, is a component that wasn't finished. Encode the
survival in the sizing contract (HUG/FILL, wrap) and the slot fallbacks, not in a per-case variant.

---

## ⑤ Create-new vs extend-existing — registry-first

Before authoring anything, **look the component up by NAME in the onboarded registry** (C0 —
`ui registry list --json` / `design/component-registry.json`; ids drift, names don't,
`canvas-operations.md` R2). Three outcomes:

- **Not found → CREATE NEW.** Walk ①→④ above, then build the SET: author each variant as a
  `COMPONENT`, `figma.combineAsVariants([...])` into a `COMPONENT_SET` (§1.3), add props for
  the optional slots (B1–B6), **bind tokens** (fills/text/radius/spacing to the semantic
  variables — §3.4, never raw hex), lay out a **states board** (Recipe 17) to prove the
  grammar, critique (the C5 gate), then **register a new row** so the next screen can reuse it.
- **Found but a needed variant / state / case is missing → EXTEND.** Add ONLY the missing
  variant to the existing set (`combineAsVariants` the new child in, or add the prop) — **do
  not rebuild** the component. Then **update** its registry row (new axis value / state).
- **Found and it already covers the case → not a design job.** It's screen-scope **reuse**:
  instantiate the existing component (Recipe 18 / C6) with the right variant. No new design.

The registry is the fact cache that keeps this cheap — reconcile by NAME with a diff, never a
whole-file re-read (`workflow-experience.md` cost §4). Registering / updating the row is the
LAND step: the component is only "done" when the system knows about it.

---

## The specimen contract — `ui ds specimen`

A shadcn component page lays out every variant × size × state as a visible **specimen grid**; that
grid is the machine-readable answer to "does this component cover its applicable states?".
`ui ingest-figma-ds` captures it as `variants: ["State=Hover", "Size=lg", …]`, and `ui ds specimen`
reads it back: it reports each component's variant dimensions + declared states, and flags the
*reliably-modelled* gaps only — a form **control** (button/input/select/…) that models an
interaction state but no `disabled`, and a **data container** (table/list/select/combobox/…) with
no `empty`. Role is read from the component's **leaf name** (the last `/` segment), so a `Button`
nested under a `DatePicker` is judged a button, not a data component.

Deliberately NOT required: `focus` — it is almost always a runtime `:focus-visible`, not a Figma
variant, so demanding it would over-fire (the same discipline as the taste/a11y linters: precision
over recall — flag only what is unambiguous). Informational by default; `--strict` gates a release.
This makes the states-board discipline above **checkable**, not just aspirational.

## Companions

`components-variables-styles.md` (the construction mechanics — combineAsVariants, props,
variable binding B1–B7) · `intent-recipes.md` Recipe 17 (states board) + Recipe 18 (compose a
screen from real instances) · `ux-psychology.md` (the accessibility + interaction floors a
state/edge-case must honor) · `workflow-experience.md` (the lifecycle + cost contract the
`/ui:design` component flow parameterizes) · `taste-rubric.md` (the critique gate).
