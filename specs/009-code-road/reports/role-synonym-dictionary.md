# The role-synonym dictionary — counted from 13 real design systems

**Date**: 2026-07-17 · **Method**: 4 parallel research agents, each grounded in the systems'
**real token source** (repo JSON5/DTCG/TS where docs were JS-rendered), every token name cited to
a URL, none filled from memory · **Status**: 13 systems complete — shadcn(target), Carbon, Ant,
Base Web, Primer, Polaris, Atlassian, SLDS, Radix, USWDS, Open Props, Material 3, Fluent 2, Spectrum

**Why this exists**: `color-roles.ts` `ROLE_KEYWORDS` is one of the repo's uncounted lists — the
map from a project's own token name (`surface-content`) to a canonical role (`background`). The
prior-art research (`token-mapping-prior-art.md`) proved **nobody has built the extract→infer-role
→map join**. This dictionary is the counted input for it. The corpus is the studio's own directive:
learn the real standards, then map any project onto one.

## The three structural findings — these reshape the architecture, not the dictionary

The synonym dictionary below is real and usable. But grounding surfaced three facts that a
name-only dictionary (what I set out to build) would have gotten wrong:

### 1. Design systems encode "role" THREE different ways. A name dictionary handles one.

| Kind | Systems | How role is encoded | What maps it |
|---|---|---|---|
| **Name-carrying** | shadcn, Carbon, Ant, Primer, Polaris, Atlassian, USWDS, SLDS2, Base Web | in the token NAME (`colorBgContainer`, `bgColor-default`) | the synonym dictionary |
| **Position-carrying** | **Radix** | the STEP NUMBER (step 9 = primary, 11-12 = text); the name is only the hue | a step→role table, not names |
| **No role signal** | **Open Props**, raw Tailwind palette | only primitives (`--gray-5`, `--blue-600`) — no role ships | **usage inference only** |

**The third kind is the MAJORITY case, not an edge case.** Measured across the 9-project corpus,
**22–100% of colours actually USED are stock Tailwind primitives** — no role in the name at all.
For those, the name carries zero signal and role must come from *which colour renders the primary
button*, not from the token. A name-only mapper would silently fail on the most common real shape.

*This is exactly what grounding caught and guessing would not have. roles-D read the Open Props
source and confirmed it ships zero role names; I would have assumed a role vocabulary that does not
exist.*

### 2. shadcn's `card` / `popover` split is not universal — and "overlay" is a trap.

- **Ant** is the one clean 3-tier match: `colorBgLayout` → background, `colorBgContainer` → card,
  `colorBgElevated` → popover.
- **Polaris** merges card and popover into ONE token (`--p-color-bg-surface`).
- **Carbon** has no fixed card — relative `layer-01/02/03`; popover reuses the next layer.
- **Atlassian** splits by elevation namespace: `elevation.surface.raised` vs `.overlay`.
- Material's `surface-container-low/default/high/highest` is the most principled ladder: card =
  `surface-container-low`, popover/dialog = `surface-container-highest`. Fluent is the only one
  with a literally-named card: `colorNeutralCardBackground`.
- **THE SCRIM TRAP — confirmed in 5 of 13 systems**: the token named `overlay` / `scrim` /
  `backgroundOverlay` / `overlay-color` is the **modal dimmer (black)**, NOT the popover surface —
  Carbon, Base Web, Material (`scrim`), Fluent (`colorBackgroundOverlay`), Spectrum (`overlay-color`
  = black). A name-match on "overlay" → popover maps a dimmer onto a surface. Encode as a negative
  rule.

### 3. "accent" is the most dangerous name — it means THREE different things.

- In **shadcn** `accent` is a distinct low-emphasis role, separate from `primary`.
- In **Spectrum and SLDS2**, `accent` **IS** the primary/brand colour (`accent-background-color`,
  `accent-1`).
- In **Material**, the shadcn-accent role is called `tertiary`; in **Fluent** it is
  `colorCompoundBrandBackground`.
- Meanwhile **"brand"** = primary consistently (Fluent, Polaris, Atlassian, Base Web).

So a raw name-match on `accent` could map to `primary` (Spectrum/SLDS), to shadcn-`accent`
(shadcn), or be absent (Carbon/Ant). **`accent` and `brand` cannot be mapped by name alone** —
usage (is it the main CTA colour?) has to disambiguate.

### 4. shadcn's `ring` splits the corpus by system TYPE, not idiosyncrasy.

The **design-tool** systems ship a real focus token — Fluent `colorStrokeFocus1/2` (dual-tone),
Spectrum `focus-indicator-color`, Radix `--focus-N` scale, Carbon `focus`. The **web-framework**
systems fold it into border — Primer `focus.outline-color`, Polaris `border-focus`, Atlassian
`border.focused`; Material has none (state-layer opacity over `primary`). So mapping onto `ring`
means: take an explicit focus token if present, else the border-focus variant, else state-layer.

## The dictionary — canonical shadcn role → real synonyms, per system

Confidence = how universal the role is across the 13 grounded systems.

| shadcn role | Confidence | Synonyms found (system: token) |
|---|---|---|
| **background** | HIGH | `background`(Carbon) · `colorBgLayout`(Ant) · `backgroundPrimary`(BaseWeb) · `bgColor-default`(Primer) · `bg`(Polaris) · `elevation.surface`(Atlassian) · `surface-1`(SLDS2) · `base-lightest`(USWDS) · step-1(Radix) · `background`(M3) · `colorNeutralBackground1`(Fluent) · `background-base-color`(Spectrum) |
| **foreground** | HIGH | `text.primary`(Carbon) · `colorText`(Ant) · `contentPrimary`(BaseWeb) · `fgColor-default`(Primer) · `text`(Polaris/Atlassian) · `on-surface-1`(SLDS2) · `base-ink`(USWDS) · step-12(Radix) · `on-surface`(M3) · `colorNeutralForeground1`(Fluent) · `neutral-content-color`(Spectrum) |
| **border** | HIGH | `border.subtle/strong/interactive`(Carbon) · `colorBorder`+`colorSplit`=divider(Ant) · `borderOpaque`(BaseWeb) · `borderColor-default`(Primer) · `border`+`border-secondary`=divider(Polaris) · `color.border`(Atlassian) · `border-1/2`(SLDS2) · step-6-8(Radix). Also: outline, divider, stroke, split, rule, separator · `outline`+`outline-variant`=divider(M3) · `colorNeutralStroke1/2`(Fluent) · per-component-only(Spectrum, no generic) |
| **muted** | HIGH | `text.secondary/helper/placeholder`(Carbon) · `colorFillTertiary`+`colorTextTertiary`(Ant) · `backgroundTertiary`+`contentSecondary`(BaseWeb) · `bgColor-muted`/`fgColor-muted`(Primer) · `subtle`/`subtlest`(Atlassian) · `on-surface-2/3`(SLDS2) · `base-light`(USWDS) · step-11/3(Radix). Also: subtle, tertiary, quaternary, helper, placeholder, faint, disabled · `surface-variant`/`on-surface-variant`(M3) · `colorSubtleBackground`+`colorNeutralForeground3/4`(Fluent) · `neutral-subdued-*`(Spectrum, literally 'subdued') |
| **destructive** | HIGH | `support.error`(Carbon) · `colorError`(Ant) · `backgroundNegative`(BaseWeb) · `fgColor-danger`(Primer) · `critical`(Polaris) · `danger`(Atlassian) · `error`(SLDS/USWDS) · red-scale(Radix). Synonyms: danger, error, critical, negative, support-error · `error`(M3) · `colorStatusDanger*`(Fluent) · `negative-*`(Spectrum) |
| **primary** | HIGH but **mismap risk** | `interactive`/`button.primary`(Carbon) · `colorPrimary`(Ant) · `brand`(Polaris/Atlassian) · `accent-1`(SLDS2 — calls it accent!) · `primary`(USWDS) · step-9(Radix). **TRAPS**: BaseWeb `brandBackgroundPrimary` is brand but the default primary *button* uses `backgroundInversePrimary`(neutral, NOT brand); Primer splits — button-primary is GREEN(`success.emphasis`), links/focus are BLUE(`accent`). Synonyms: brand, action, cta, interactive, accent(SLDS) |
| **input** | MEDIUM | `field.01/02/03`(Carbon) · `colorBgContainer`(Ant, no dedicated) · `inputFill`(BaseWeb) · `control.*`(Primer, reused) · `input-bg-surface`(Polaris) · `color.background.input`(Atlassian). Synonyms: input, field, control · `surface-container-highest`(M3, filled field) · unverified(Fluent/Spectrum) |
| **secondary** | MEDIUM | `button.secondary`(Carbon, button-only) · **ABSENT**(Ant) · `backgroundSecondary`(BaseWeb) · `bg-surface-secondary`(Polaris) · `neutral`(Atlassian, inferred) · `secondary`(USWDS). Synonyms: secondary, neutral · `secondary`/`on-secondary`(M3) · **ABSENT**(Fluent/Spectrum) |
| **card** | MEDIUM | `layer-01`(Carbon, relative) · `colorBgContainer`(Ant) · `backgroundSecondary`(BaseWeb, reused) · `card.bgColor`(Primer) · `bg-surface`(Polaris, =popover) · `surface.raised`(Atlassian) · `surface-container-1`(SLDS2) · step-2(Radix). Synonyms: layer, container, surface-container, elevated, panel, raised · `surface-container-low`(M3) · `colorNeutralCardBackground`(Fluent, only literal 'card') · `background-layer-1`(Spectrum) |
| **ring** | LOW (idiosyncratic) | `focus`/`focus-inset`(Carbon) · `controlOutline`(Ant) · `borderAccent`(BaseWeb, live-proven) · `focus.outline-color`(Primer) · `border-focus`(Polaris) · `border.focused`(Atlassian) · `--focus-N`(Radix, only one with a real focus scale). Map focus/outline-color/border-focus → ring · **absent**(M3, state-layer) · `colorStrokeFocus1/2`(Fluent, dual-tone) · `focus-indicator-color`(Spectrum) |
| **popover** | LOW | `colorBgElevated`(Ant, clean) · `surface.overlay`(Atlassian) · `overlay.bgColor`(Primer) · `bg-surface`(Polaris, =card) · reuses-next-layer(Carbon). **TRAP**: `overlay`/`backgroundOverlay` in Carbon+BaseWeb = the SCRIM, not the surface · `surface-container-highest`(M3, dialog) · `background-elevated`(Spectrum) |
| **accent** | LOW | `backgroundAccent`(BaseWeb) · accentColor-scale(Radix) · `accent-1`(SLDS2, =primary) · **ABSENT**(Carbon, Ant) · `accent.<hue>`(Atlassian, 10 categorical hues, not one role). Often absent or means something else · `tertiary`(M3!) · `colorCompoundBrandBackground`(Fluent) · =primary(Spectrum) |

**Status roles design:os added beyond shadcn's base** (measured earlier: our persona has
success/warning/info; shadcn base does not):
- **success**: `support.success`(Carbon) · `colorSuccess`(Ant) · `backgroundPositive`(BaseWeb) · `success`(most). Synonyms: success, positive, ok, valid
- **warning**: `support.warning`(Carbon) · `colorWarning`(Ant) · **`attention`**(Primer!) · `warning`+`caution`(Polaris, split) · `caution-minor/major`(Carbon). Synonyms: warning, caution, attention, alert
- **info**: `support.info`(Carbon) · `colorInfo`(Ant) · `information`(Atlassian) · `info`(Polaris). **ABSENT** in Base Web, Primer, shadcn base. Synonyms: info, information, note

## Consequences for the mapping engine (the architecture this feeds)

1. **The engine is not one mechanism, it is three** — name-synonym (this dictionary), Radix
   step→role, and usage-inference for primitives-only projects (the majority case). A single
   name-lookup would silently fail on 22–100% of real colour usage.
2. **Usage-frequency beats the name.** For `--brand-600` / `--teal-600` (no role signal), the role
   comes from *which colour renders the primary button, the page background, the body text* — a
   rendered/computed-usage signal, not the token name. This is the unclaimed prior art the research
   found; it is also the harder half.
3. **Lossless via DTCG `$extensions`** (research finding): a token that maps onto a canonical role →
   map it; a token with no canonical role (dana's `citation-bg`, Atlassian's `discovery`, Base
   Web's `eatsGreen400`) → preserve under `$extensions`, verbatim. Every system carries such
   product-specific roles; dropping them is lossy, and the standard says don't.
4. **Three traps to encode as NEGATIVE rules**: `overlay`→scrim-not-popover; `primary`-name on a
   neutral/inverse button (Base Web); a split-brand system where button ≠ link colour (Primer).

## Caveats (per the agents' own "a wrong token is worse than a gap")

- **Material 3 / Fluent 2 / Adobe Spectrum pending** (roles-A still running) — the
  surface/on-surface/container tier from Material is the most principled elevated-surface model and
  will sharpen the `card`/`popover` rows.
- SLDS `--lwc-*` legacy hooks: **unverified**, excluded until confirmed against an official source.
- Carbon Sass casing (`$layer-01` vs DTCG `layer.01`): naming-convention diff, not byte-confirmed.
- Base Web + Ant docs pages are JS-rendered and never fetched; data is from repo source (what
  ships — arguably more authoritative — but the doc page wasn't independently cross-checked).
