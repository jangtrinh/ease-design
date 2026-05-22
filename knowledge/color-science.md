# Color Science

How to reason about color for UI design: which color space to think in, how
accessible contrast is judged, how a full color scale is built from one base
hue, and how raw scale stops get mapped to semantic roles.

This file is **reasoning only**. The actual color math (hex ↔ OKLCH conversion,
gamut clamping, contrast ratio, scale generation, semantic classification) is
implemented in a deterministic binary subcommand. Your job as the host model is
to know *what to ask the binary for* and *how to interpret what it returns* —
not to do the arithmetic yourself.

---

## 1. Think in OKLCH, not HSL or RGB

A UI palette is a set of related colors — different lightnesses of the same
hue, plus semantic accents that should feel like siblings. To build that well,
you reason in a color space where *equal numeric steps look like equal visual
steps*. That space is **OKLCH**.

OKLCH describes a color with three intuitive axes:

| Axis | Meaning | Range |
|------|---------|-------|
| **L** — Lightness | Perceived brightness | 0 (black) → 1 (white) |
| **C** — Chroma | Colorfulness / saturation | 0 (gray) → ~0.4 (vivid) |
| **H** — Hue | The hue angle on the color wheel | 0–360° |

It is the polar (cylindrical) form of the Oklab color space, which was built
specifically to match human perception.

### Why OKLCH beats HSL and RGB for palettes

- **HSL lies about lightness.** In HSL, yellow at `L=50%` and blue at `L=50%`
  have wildly different *perceived* brightness — yellow looks far lighter. Build
  a scale by stepping HSL lightness evenly and the steps look uneven, with the
  mid-tones muddy and the lights washed out. OKLCH's L axis is perceptually
  uniform: `L=0.6` looks equally bright regardless of hue.
- **RGB has no lightness or hue axis at all.** You cannot "make this 10%
  darker" or "keep the hue, drop the saturation" in RGB without leaving the
  perceptual rails. Every adjustment is a guess.
- **Hue stays stable in OKLCH.** Darkening a color in HSL/RGB often drifts the
  hue (blues shift purple, oranges shift brown). In OKLCH you hold H constant
  and only move L and C — the color stays recognizably the same hue across the
  whole scale.
- **Predictable, reproducible math.** Because the axes are independent and
  perceptual, generating a scale becomes a clean curve over L and C rather than
  hand-tuned hex values.

**Practical rule:** when you describe a color decision — "lighter", "more
muted", "same hue but darker for the border" — you are describing a move along
one OKLCH axis. Express it that way, and ask the binary to do the conversion.

---

## 2. Contrast and WCAG targets

Color is not just aesthetics — text and UI must be *legible*. Legibility is
measured by **contrast ratio**: a number from 1:1 (no contrast) to 21:1
(pure black on pure white).

Contrast ratio is computed from the **relative luminance** of two colors —
the same WCAG 2.x formula the binary implements. You do not compute it; you
*request it* and reason about the result against these targets.

### Required contrast targets

| Use case | Minimum ratio | WCAG level |
|----------|---------------|------------|
| **Body text** (normal size) | **4.5:1** | AA |
| **Large text** (≥24px, or ≥18.66px bold) | **3:1** | AA |
| **UI components & graphics** (icons, borders of inputs, focus rings, chart elements that carry meaning) | **3:1** | AA |
| Body text — enhanced | 7:1 | AAA |
| Large text — enhanced | 4.5:1 | AAA |

Conformance bands the binary reports back:

- **AAA** — ratio ≥ 7
- **AA** — ratio ≥ 4.5
- **AA-large** — ratio ≥ 3 (passes for large text and UI components only)
- **fail** — ratio < 3

### How to reason with contrast

- **Default to AA.** 4.5:1 for body copy, 3:1 for large text and interactive
  graphics. Treat AAA as a bonus, not a baseline, unless the product demands it.
- **Decorative elements are exempt.** Pure decoration, disabled-state controls,
  and logos have no contrast minimum. Do not over-constrain them.
- **Check the pairing, not the color.** Contrast is a property of *two* colors.
  When you pick a text color, always state its background and confirm the pair
  meets the target. A scale stop that fails on white may pass on black.
- **Audit both backgrounds.** For a color that may sit on light or dark
  surfaces, evaluate it against both `#FFFFFF` and `#000000` and use whichever
  pairing is intended — the binary's audit reports both.
- **Contrast ≠ chroma.** A very vivid color can still fail contrast. Legibility
  is driven mostly by the *lightness* gap between the two colors, not how
  colorful they are.

---

## 3. Generating an 11-stop color scale

A usable UI color is never one hex value — it is a **scale** of 11 stops, so
designers have a tint for every job (faint background fills through deep text).

### The stops

```
50 · 100 · 200 · 300 · 400 · 500 · 600 · 700 · 800 · 900 · 950
```

- **50–200** — near-white tints: subtle backgrounds, hover fills, soft surfaces.
- **300–400** — light mid-tones: borders, dividers, disabled text.
- **500–600** — the core, fully-saturated brand color: buttons, links, accents.
- **700–950** — deep shades: text on light backgrounds, pressed states, dark-mode surfaces.

This matches the Tailwind / Radix convention, so output is immediately familiar.

### The lightness progression

Each stop has a **target lightness** on the OKLCH L axis — a perceptually
uniform curve from very light to very dark:

| Stop | Target L | | Stop | Target L |
|------|----------|-|------|----------|
| 50   | 0.97     | | 600  | 0.45     |
| 100  | 0.93     | | 700  | 0.35     |
| 200  | 0.84     | | 800  | 0.25     |
| 300  | 0.74     | | 900  | 0.16     |
| 400  | 0.64     | | 950  | 0.10     |
| 500  | 0.55     | |      |          |

Because L is perceptual, these steps *look* evenly spaced — no muddy middle, no
washed-out top.

### Anchoring — the base color keeps its identity

The generator does not force the base color into stop 500. It finds the stop
whose target lightness is **closest to the base color's actual lightness** and
makes that the **anchor stop**. The base hex is locked exactly at that stop;
every other stop is interpolated outward from it.

- A pale brand color anchors high (e.g. at 200 or 300); a deep one anchors low.
- This guarantees the designer's exact chosen color appears verbatim somewhere
  in the scale — the scale is built *around* the brand color, not a guess at it.
- Stops far from the anchor relax toward the ideal target lightness; stops near
  the anchor stay close to the base's own lightness, so the transition is smooth.

### Chroma handling — a bell curve, not a constant

Chroma (colorfulness) is **not** held flat across the scale. It follows a
Gaussian (bell) curve centered on the anchor stop:

- **Peak chroma at the anchor**, then tapering toward both ends.
- **Very light stops (50–100) need low chroma** — a near-white tint with full
  saturation looks like a garish neon wash, not a calm background.
- **Very dark stops (900–950) also need low chroma** — deep shades with too
  much chroma look oversaturated and lose the "almost-black" quality good text
  shades need.
- Tapering chroma at the extremes keeps every stop looking like a refined member
  of one family.

### Hue stays constant

Across all 11 stops the **hue angle does not change**. This is exactly why
OKLCH is used: holding H fixed while L and C move produces a scale that reads as
one coherent hue — no purple-shifted darks, no brown-shifted lights.

### What you ask the binary for

Give it a single base hex. It returns the 11 stops as hex values, the anchor
stop, and the WCAG contrast of each stop against white. You then reason about
which stop fits which job and whether the contrast clears the target.

---

## 4. Gamut clamping

OKLCH is a *mathematical* space — it can describe colors that no sRGB screen can
actually display. When the scale generator pushes chroma up, especially in the
mid-tones, it can land on an OKLCH coordinate that is **out of the sRGB gamut**.

If such a color were converted to RGB naively, the channels would overflow
(values below 0 or above 1) and get hard-clipped — producing a wrong, often
hue-shifted, color.

**Gamut clamping** prevents this. For an out-of-gamut color, the binary keeps
the lightness and hue fixed and **reduces chroma** by binary search until the
color just fits inside sRGB — the most saturated version of that exact hue and
lightness the screen can truly show.

### Why it matters for your reasoning

- **L and H are preserved; only C is sacrificed.** The clamped color stays the
  same hue and brightness — only slightly less colorful. Visually it is the
  closest honest match.
- **Every generated stop is guaranteed displayable.** You never have to
  second-guess whether a returned hex will render correctly.
- **Highly saturated brand colors will be gently de-saturated at some stops**,
  particularly the bright mid-tones. This is correct behavior, not a bug — the
  screen genuinely cannot show more. Do not try to "fix" it by pushing chroma.
- It is the reason a requested vivid color and its actual rendered scale may
  differ slightly in saturation. The trade-off is intentional: a real,
  consistent color over an impossible, broken one.

---

## 5. Semantic role mapping

A raw scale is just a hue ramp. A **design system** assigns each color a *job*.
ease-design works with eight semantic roles:

| Role | Job | Typical hue family |
|------|-----|--------------------|
| **primary** | Main brand color — primary buttons, key links, active nav | the brand hue |
| **secondary** | Supporting actions, less-emphasized UI | a muted or complementary hue |
| **accent** | Highlights, CTAs, things that must catch the eye | a vivid contrasting hue |
| **neutral** | Backgrounds, surfaces, borders, body text — the structural grays | near-achromatic gray/slate/zinc |
| **success** | Positive feedback, confirmations, valid states | green |
| **warning** | Caution, non-blocking problems | amber / orange / yellow |
| **danger** | Errors, destructive actions, critical alerts | red |
| **info** | Neutral notices, informational callouts, focus | blue |

### Classifying colors into roles

When colors arrive as named tokens (e.g. `brand-blue`, `error-red`,
`surface-gray`), the binary classifies each into a role using **name
heuristics** — keyword matching on the token name. The match is intuitive: a
token whose name contains `brand` or `main` resolves to **primary**, one
containing `error` / `red` / `critical` resolves to **danger**, one containing
`gray` / `surface` / `border` resolves to **neutral**, and likewise for the
other roles. The full keyword set is owned by the binary — request the
classification from it rather than re-deriving the list here.

**De-duplication:** only the *first* color matching each role is kept. One
primary, one danger, etc. — a clean, unambiguous system.

### Mapping roles to scale stops

Each role gets its own full 11-stop scale. The roles differ in *which stops*
get used for *which UI parts*. Reason about it this way:

- **Solid fill / button background** — stop **500 or 600**. This is the
  saturated identity of the role.
- **Text or icon on a light background** — stop **700–900**. Dark enough to
  clear the 4.5:1 body-text target on white.
- **Text/icon ON a colored fill** (e.g. white label on a primary button) —
  pick white or stop 50, and confirm the pair clears contrast against the
  500/600 fill.
- **Subtle background tint** (alert banners, hover states, selected rows) —
  stop **50–100**.
- **Borders and dividers** — stop **200–300**.
- **Hover state** — shift one stop darker (600 → 700); **pressed** — two stops
  (600 → 800).
- **Neutral role** carries the structural UI: page background near 50, card
  surfaces 50–100, borders 200–300, secondary text 500–600, body text 900–950.

### Reasoning checklist when building a system

1. Identify which roles the product actually needs. Not every product needs all
   eight — `secondary`, `accent`, and `info` are often optional. Apply YAGNI.
2. For each role, get its 11-stop scale from the binary.
3. For every text/background pairing you specify, confirm the contrast ratio
   meets the target in §2. Adjust the stop, not the hue.
4. Keep `success` / `warning` / `danger` hue-conventional — green/amber/red.
   Users read these by color; an unconventional danger color is a usability bug.
5. Ensure `primary` and `accent` are distinguishable from each other and from
   the status colors, so meaning never collides.
