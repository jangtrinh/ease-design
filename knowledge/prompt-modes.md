# Prompt Modes

When a design is being generated **from an input** — a screenshot, a Figma frame, or any
reference image — a *prompt mode* decides how faithfully the output tracks that input. It
is a strategy modifier layered **on top of** the active UI mode (see `mode-constraints.md`).

There are three prompt modes: **Replicate**, **Enhance**, **Adapt**. Exactly one applies
per generation. If none is specified, default to **Replicate** (the safest, least
surprising choice).

Each mode carries a recommended **creativity setting** — how much latitude the model
should take. Lower means stay literal; higher means be inventive.

---

## Replicate

> *Match the design as closely as possible.* — Creativity: low.

The number-one priority is **accuracy**. Reproduce the source design exactly:

- Match colors precisely — extract hex values directly from the image.
- Match spacing proportions precisely.
- Match the typography hierarchy: weights, sizes, line-heights.
- Match component structure and layout patterns.
- Do **not** add creative flourishes, animations, or improvements.
- When unsure about a detail, choose the **conservative** interpretation.

**Apply when:** the user wants a faithful rebuild — converting a screenshot or Figma frame
to code, recreating an existing screen, or any task where deviation from the source is a
defect.

## Enhance

> *Improve while preserving the design intent.* — Creativity: high.

Use the source design as **inspiration**, then improve upon it:

- Preserve the information architecture and content hierarchy.
- Upgrade visual polish — smoother gradients, better shadows, refined spacing.
- Add micro-interactions — hover states, transitions, subtle animation.
- Use modern CSS patterns (grid, subgrid, container queries).
- Fix any design anti-patterns you detect — poor contrast, inconsistent spacing.
- Make it look like a world-class design team polished it.

**Apply when:** the user likes the source's structure but wants a higher-quality result —
modernizing a dated design, fixing an amateur mockup, or elevating a rough draft while
keeping its intent.

## Adapt

> *Same content, optimized for a different context.* — Creativity: medium.

Analyze the source's **content and structure**, then **restructure** it for a different
target context:

- If the source is mobile → optimize for desktop: expand the layout, add a sidebar,
  introduce richer hover states.
- If the source is desktop → optimize for mobile: stack vertically, use thumb-friendly
  touch targets.
- Preserve **all** content and functionality — nothing is dropped.
- Apply platform-appropriate patterns: mobile uses bottom navigation and sheets; desktop
  uses sidebars and dropdown menus.

**Apply when:** the user wants the same product on a different platform or form factor —
porting a mobile screen to desktop (or vice versa). The content is fixed; only the
structure changes to fit the new context.

---

## Choosing a mode

| The user wants… | Prompt mode |
|-----------------|-------------|
| A faithful, pixel-accurate rebuild of the input | Replicate |
| The same design, but better / more polished | Enhance |
| The same content reshaped for a different platform | Adapt |
| (nothing specified) | Replicate — default |

The prompt mode never overrides the UI-mode constraint set: an Adapt-to-desktop request
still obeys every rule in the Desktop constraint set. Prompt modes govern *fidelity to the
input*; UI modes govern *structural correctness of the output*.
