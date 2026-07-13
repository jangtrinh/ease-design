# Token Taxonomy — The Two-Tier DTCG Model

This file is the **reasoning** the host model uses when working with design tokens:
what a token is, the two tiers, how naming works, how aliasing resolves, and what is
immutable after compilation. The machine-readable JSON Schema and the deterministic
compiler are built later in the binary — this file does not reproduce them; it explains
the *concepts* those tools enforce so the model produces token-correct output.

The token file format is **W3C DTCG** — the Design Tokens Community Group JSON spec.

## What a design token is

A design token is a named, single-purpose design decision stored as data, not code.
Instead of a raw `#3b82f6` scattered through markup, the decision is named once
(`blue-500`), given meaning once (`color-primary → blue-500`), and referenced everywhere.
Change the decision in one place; every consumer updates.

A token has, at minimum, a **name** (its path), a **`$value`**, and a **`$type`**. The
`$` prefix marks DTCG-reserved keys, separating them from a designer's own group names.

```json
{
  "blue-500": { "$value": "#3b82f6", "$type": "color" }
}
```

`$type` is one of the DTCG primitive types — the relevant ones here:

| `$type` | Holds | Example value |
|---|---|---|
| `color` | a color | `#3b82f6` |
| `dimension` | a length | `16px`, `1rem` |
| `fontFamily` | a font stack | `Inter, sans-serif` |
| `fontWeight` | a weight | `700` |
| `duration` | a time | `200ms` |
| `shadow` | a shadow (composite) | offset/blur/spread/color object |
| `typography` | a full text style (composite) | family + size + weight + leading + tracking |

A **composite** token's `$value` is an object whose members are themselves token-typed
(a `typography` token bundles a `fontFamily`, a `dimension`, a `fontWeight`, etc.).

---

## The two tiers

Every token belongs to one of two tiers. Keeping them separate is the core discipline of
the whole model.

### Tier 1 — Primitives (raw values)

Primitives are the **raw, context-free design values** — the full palette of decisions
available, named purely by what they *are*, never by what they are *for*.

- **Color primitives** — a complete scale per hue: `blue-50 … blue-950`, `gray-50 …
  gray-950`. Each step is a perceptually spaced lightness on one hue. The number is a
  lightness index, not a meaning.
- **Spacing primitives** — a scale on one base unit: `space-1: 4px`, `space-2: 8px`,
  `space-3: 12px`, `space-4: 16px`, `space-6: 24px`, `space-8: 32px`, … The number is a
  step index; the value is the step index times (or derived from) the base unit.
- **Type-scale primitives** — sizes from one modular ratio: `font-size-xs … font-size-6xl`
  (or `-100 … -900`). Plus raw `font-family-*` stacks and `font-weight-*` steps.
- **Radius primitives** — `radius-none`, `radius-sm`, `radius-md`, `radius-lg`,
  `radius-full`.
- **Shadow primitives** — raw elevation values: `shadow-1 … shadow-5`, soft to strong.

```json
{
  "blue":  { "500": { "$value": "#3b82f6", "$type": "color" } },
  "space": { "4":   { "$value": "16px",    "$type": "dimension" } }
}
```

A primitive **never refers to another token**. It is a literal. It is the bottom of the
graph. Primitives describe the *material*; they say nothing about *use*.

A well-formed primitive set is **complete and unopinionated** — it offers more values
than any one design will use. Pruning happens at the semantic tier, not here.

### Tier 2 — Semantic (meaning-mapped)

Semantic tokens name a **design decision in context** — what a value is *for* — and their
value is almost always an **alias** pointing at a primitive.

- `color-primary → blue-500` — "the brand action color is this blue."
- `color-text-body → gray-900`
- `color-surface → white`, `color-border → gray-200`
- `color-danger → red-500`, `color-success → green-500`
- `space-section → space-16` — "the gap between page sections is this step."
- `space-component → space-6`, `space-inline → space-2`
- `text-display`, `text-heading`, `text-body`, `text-caption` — composite `typography`
  tokens, each aliasing a `font-size-*`, a `font-weight-*`, a `font-family-*`, plus
  leading and tracking.
- `radius-card → radius-md`, `elevation-overlay → shadow-4`.

```json
{
  "color": {
    "primary":   { "$value": "{blue.500}",  "$type": "color" },
    "text-body": { "$value": "{gray.900}",  "$type": "color" }
  },
  "space": {
    "section": { "$value": "{space.16}", "$type": "dimension" }
  }
}
```

`{blue.500}` is a DTCG **alias** — a reference written as the target token's dotted path
inside curly braces.

**The rule of separation:** UI markup and components consume **semantic tokens only**.
They should never reach past the semantic tier to a primitive. `color-primary` belongs in
a component; `blue-500` does not. This is what makes rebranding or theming a one-tier
edit: change the semantic aliases, leave the primitives, and the whole UI re-skins.

### Why two tiers, not one

| One flat tier | Two tiers |
|---|---|
| `brand-blue: #3b82f6` used directly everywhere | `blue-500` (primitive) ← `color-primary` (semantic) ← UI |
| Rebrand = find/replace every usage | Rebrand = repoint `color-primary` to a new primitive |
| Dark mode = a parallel hardcoded set | Dark mode = a second semantic layer over the same primitives |
| Name conflates *what* and *why* | *What* (primitive) and *why* (semantic) are separable |

The primitive tier is the **stable vocabulary of available values**. The semantic tier is
the **opinion** — the subset and the mapping that *this* design has chosen. Two products
can share a primitive set and differ entirely at the semantic tier.

---

## Naming conventions

Token names are paths. Two consistent path schemes:

- **Primitives** — `{category}-{scale-step}`: `blue-500`, `space-4`, `font-size-lg`,
  `radius-md`, `shadow-3`. The step is an objective index (a lightness index, a scale
  index), never a role.
- **Semantic** — `{category}-{role}[-{variant}]`: `color-primary`, `color-text-body`,
  `color-border-subtle`, `space-section`, `text-heading`, `elevation-overlay`. The role
  describes purpose; the optional variant refines it.

Rules that hold across both tiers:

1. **kebab-case**, lowercase, ASCII. Path segments map to nested JSON groups
   (`color.primary` ↔ `{ "color": { "primary": … } }`).
2. **One canonical name per concept.** `color-primary`, not also `brand-color` and
   `accent` for the same decision. Canonical naming is itself a graded quality concern —
   see the Consistency axis in `taste-rubric.md`.
3. **Primitive names carry no meaning.** Never `blue-brand` or `space-card` at the
   primitive tier — meaning lives only in the semantic tier.
4. **Semantic names carry no raw value.** Never `color-blue-primary` — the primary color
   being blue is a fact that lives in the alias target, and could change.
5. **Scale steps are predictable.** Color: the conventional `50, 100, 200 … 900, 950`.
   Spacing: a numeric step ladder on the base unit. Type: either a ratio-based numeric
   ladder or a t-shirt ladder (`xs, sm, md, lg, xl, 2xl …`) — pick one and keep it.
6. **Group by category first.** All colors under `color`, all spacing under `space`,
   etc., so the token tree is navigable and the `$type` of a group is predictable.

---

## How primitive → semantic aliasing resolves

An alias is a deferred lookup. Resolution flattens the reference graph to literal values.

1. **Parse.** A `$value` of the form `{path.to.token}` is an alias; anything else is a
   literal.
2. **Resolve.** Replace the alias with the `$value` of the token at that path. If that
   token is itself an alias, resolve again. Chains are allowed (`color-button-bg →
   color-primary → blue-500`) but should be shallow — typically one hop, occasionally two.
3. **Type-check.** An alias must point at a token of a compatible `$type`. A `color`
   semantic token may only alias a `color` primitive. Cross-type aliases are invalid.
4. **Terminate at a primitive.** Every resolution chain must end at a literal-valued
   primitive. A chain that never reaches a literal is unresolved and invalid.

**Two failure modes the model must never produce:**

- **Cycles** — `a → b → a`. A reference loop has no literal at the bottom; it cannot
  resolve. The dependency graph must be acyclic.
- **Dangling aliases** — `{color.acccent}` (typo) or a reference to a deleted token.
  The path resolves to nothing.

**Composite resolution:** for a `typography` or `shadow` token, each member of the
`$value` object resolves independently — `text-body` may alias `{font-size.md}` for its
size and `{font-family.sans}` for its family, and each is resolved on its own.

After resolution the token set is a flat map of name → literal value, ready to emit as
CSS custom properties, a Tailwind theme, platform constants, etc. The unresolved,
aliased form is what humans author and maintain; the resolved form is what machines
consume.

---

## What is immutable after compile, and why

"Compiling" a token set means: validate it, resolve every alias, and freeze the result
into the canonical artifact a project builds against. After that compile step, certain
things are **immutable** for the life of that compiled version.

**Immutable after compile:**

1. **Token names (the public contract).** Once `color-primary` is compiled and components
   reference it, the *name* is an API. Renaming it to `color-brand` silently breaks every
   consumer — the old name resolves to nothing. Names may be added; existing names must
   not be renamed or removed within a compiled version.
2. **The `$type` of an existing token.** A token published as `color` must stay `color`.
   Changing a type breaks every alias and every consumer that assumed the old type.
3. **The two-tier structure of an existing token.** A token published as a semantic alias
   must not be rewritten into a raw literal (or vice versa) within a compiled version —
   that changes how the whole graph resolves underneath consumers.
4. **The resolved output of a given compiled version.** A specific compiled version is a
   fixed snapshot. The same input compiled twice produces byte-identical output — the
   compile is deterministic. Reproducibility depends on the snapshot not shifting.

**Mutable — this is the point of the model:**

- A semantic token's **alias target**. Repointing `color-primary` from `{blue.500}` to
  `{indigo.600}` is exactly the supported rebrand/theming operation.
- A primitive's **literal value**. Adjusting `blue-500` cascades to every semantic token
  that aliases it — the intended ripple.
- **Adding** new tokens (primitive or semantic).

**Why the line is drawn at names and types:** a token's *name* and *type* are the
**interface** every consumer is coded against; its *value* is the **implementation**.
The model exists so values can move freely while the interface holds still. Renaming a
token is a breaking change and belongs to a new compiled version with an explicit
migration — never a silent edit. Changing a value is a normal, safe, intended operation.

This is the same distinction the Consistency axis in `taste-rubric.md` enforces from the
generation side: a generation must consume the **canonical, stable token names** and must
not invent new raw values that should have resolved through an existing semantic token.

## The paired semantic convention — `{role}` + `{role}-foreground` (Design-OS standard)

The Design-OS standard for the **semantic tier** is the shadcn model: every surface role ships with
its paired text colour — `background`/`foreground`, `card`/`card-foreground`, `popover`/`…`,
`primary`/`primary-foreground`, `secondary`/`…`, `muted`/`muted-foreground`, `accent`/`…`,
plus the unpaired `destructive`, `border`, `scrim` (the fixed neutral-dark overlay veil — a dimmer,
not a foreground, so it never flips with `colorMode`), `input`, `ring`, the `sidebar-*` set, `radius`,
and `chart-1…5`. A bare `foreground` pairs with `background` (the app default).

**Why the pairing is load-bearing, not cosmetic:** because a `-foreground` token names its ONE
intended background, **contrast becomes deterministic**. `ui ds a11y` checks `{role}-foreground`
against `{role}` — the *declared* pairs — instead of guessing every text×surface combination. That
guessing (the legacy "inferred" mode) mis-paired a light-surface text token against dark panels (the
VSF dogfood over-pairing). Adopt the pairing and the a11y audit is exact:

- **Name foregrounds by convention** (`X-foreground`) so `ui ds a11y` runs in `paired` mode.
- Legacy cartesian inference stays only as a fallback for un-paired DSs, and the report says so —
  it nudges you to add `-foreground` names or pin `--pairs`.
- `ui ds import` preserves `-foreground` names, so an imported DS inherits deterministic a11y.

This is the same discipline the whole taxonomy teaches: **encode intent in the name** so a
deterministic tool can act on it. A paired name is an interface contract a checker can trust.

The pairing is one pillar of the **Design-OS DS standard** — together with the exhaustive
state matrix and the per-component lifecycle status (`figma-craft/component-design.md`), it is
what makes a design system *auditable by deterministic tools* rather than by opinion: paired
names → exact contrast; declared states → checkable completeness; status → gate severity.

**The standard is enforced at birth, not just documented:** `ui ds init` COMPILES the full
paired vocabulary (background/card/muted/primary/secondary/accent/popover + the status quartet,
each `-foreground` picked contrast-aware ≥4.5:1; `ring` at the 3:1 non-text floor) — a fresh DS
audits at `mode: paired`, 14 pairs, 0 failures before a human touches it. A standard that lives
only in prose drifts; this one has an emitter (the compiler) and a gate (`ds a11y` + the
23-persona test) — that pairing of emitter+linter is the pattern for every future standard.

**State pairs are gated too — the former gap is closed.** Beyond the declared `{role}`/`{role}-foreground`
pair, `ui ds a11y` now also audits each role's INTERACTION surfaces — `{role}-foreground` on
`{role}-hover` and `{role}-active` — returned as `statePairs` (each carrying a `state` field) and
folded into `failures`, so they gate identically (`checkedPairs` stays the base count; `checkedStatePairs`
is separate). The compiler earns a clean audit by construction: `primary-hover` is picked
contrast-aware so the primary foreground still clears ≥4.5 on it — and for a light brand fill whose
foreground is black, the hover walks LIGHTER instead of the naive darker step (which once shipped at
~2.8:1). Same emitter+linter discipline as the base pairs; the 23-persona test gates ≥1 clean state pair
on every compiled DS. (This was the one-time "state-pair audit" gap; a `{role}` with no `-hover`/`-active`
surface simply contributes no state pair.)

## Onboarding an existing token file — `ui ds import`

Most real projects already have a flat token file (a Figma-reconciled `tokens.json`,
`{ category: { name: value } }`) rather than a compiled ease-design DS store. `ui ds import
<tokens.json> --dir <project>` bridges the two: it converts the flat file into the DTCG
two-tier store (`design/design.tokens.json` + a sealed manifest + an empty registry), so
the rest of `ui ds *` — a11y contrast audit, status, diff, docs — works on it immediately.

- `$type` is **inferred** per value: hex/rgb/hsl/oklch → `color`; a px/rem/em/% string, or a
  bare number in a dimension-ish group (spacing, radii, sizes, layout) → `dimension`; a number
  under a *weight* group → `fontWeight`; a `…ms` motion value → `duration`; a font-family → 
  `fontFamily`; other bare numbers → `number`.
- Nested groups (e.g. `typography.sizes`) are hoisted to their own `<category>-<sub>` category
  (DTCG is two levels deep).
- **Un-typeable values are skipped and reported, never guessed** — box-shadow strings and
  cubic-bezier easings have no clean DTCG type, so they're listed as skipped rather than
  emitted with a wrong `$type` that would corrupt a downstream check. Honesty over coverage.

This is the *deterministic on-ramp*: the highest-value first move after `ui init` on a project
that already has a design system — one import, then a full systemic contrast audit for free.
