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

---

## Generation Contract (RODES)

The three prompt modes above tune *fidelity to an input*. This section governs the
**structure of the generation prompt itself** — how the host model turns an intent (with or
without a reference) into a build instruction. The `ui` binary makes no model calls, so this
contract lives entirely on the host-model side: it is the shape the model gives its own
reasoning before it emits a design.

The frame is a fixed 7-layer skeleton — **RODES**. Only the middle layers change per job;
the order never does.

### The 7 layers (fixed order)

1. **Role** — who is generating: a senior product designer building ship-grade UI, held to
   the quality floors in `taste-rubric.md`. Set once, unchanging.
2. **Context** — the *classified* situation: the resolved UI type (landing / dashboard / app
   / admin / …) and the industry, if given. This is the output of the classify stage below.
3. **Task** — the concrete thing to build, in one line ("a pricing page for a fintech SaaS").
4. **Constraints** — the UI type's constraint block from `mode-constraints.md` plus
   `TECHNICAL_RULES`. Type-specific: a dashboard's constraints are not a landing page's.
5. **Art-direction** — the selected persona(s), emitted as named axes (see
   *persona-replaces-generic* below), optionally with one hero device from
   `signature-devices.md`.
6. **Anti-patterns** — the two-layer anti-slop list (see below). Always appended, never
   skipped.
7. **Output** — the exact output format required (a single self-contained HTML file, a
   component, a token set) with any structural must-haves named.

The frame is stable so it is *checkable*: a reviewer can point at each layer and ask "is it
present, is it filled?" A prompt missing its Anti-patterns layer or its Constraints layer is
malformed, independent of how good the prose reads.

### Classify-then-dress (two stages, in order)

Resolve the design in two separate passes, never one:

1. **Classify** — first decide the UI *type* (landing / dashboard / app / admin / ecommerce
   / …) and inject its constraint block (layer 4). This is the *task* — what the thing must
   structurally be — and it is style-blind.
2. **Dress** — *then* art-direct: select persona(s) and devices (layer 5).

WHY the split: separating task from style lets **one builder serve every UI type**. Fusing
them ("a brutalist dashboard") bakes the style into the structure and the model loses the
type's hard constraints to the vibe — the dashboard forgets it needs a data-density floor
because it is busy being brutalist. Classify sets the floor; dress decorates above it.

### Persona-replaces-generic (named axes)

The persona in layer 5 is emitted as the **named axes** of its DNA — Philosophy, Typography,
Color, Spacing, Depth, Borders, Texture, Interactions, Layout — one line each, matching the
shape in `personas/<family>.md`. Each axis is then separately checkable against the output.

The load-bearing stance: **the persona REPLACES the generic rules, it does not decorate
them.** A generic default ("use a clean sans, a comfortable scale, subtle shadows") is
*overwritten* by the persona's axis, not appended after it. NOT ALLOWED: keeping the generic
baseline and adding the persona as flavor on top — that yields a design that is 80% default
with a persona costume, the exact templated-sameness the persona exists to break. ALLOWED:
the persona axis is the only instruction for that dimension; where the persona is silent, the
UI-type constraint governs, not a generic default.

### Two-layer anti-slop (always appended)

Layer 6 is **two lists, both always present**:

- **Global negative list** — the machine-default tells forbidden on every generation
  regardless of persona: no generic evenly-weighted 3-column feature grid, no indigo/violet
  "AI glow" gradient, no blanket Title Case on prose (use sentence case), no placeholder
  lorem/dated framing.
- **Persona avoid-list** — the selected persona's own `Avoid list:` from its DNA block.

WHY both: the global list catches the tells shared across all machine output; the persona
list catches the ones specific to *this* taste (a brutalist persona forbidding soft blurred
shadows). Dropping either leaves a class of slop unguarded — the global list alone lets a
persona-specific tell through; the persona list alone lets the universal AI-glow gradient
through.

### Freedom / constraint split (what-required, how-free)

Specify *what* structural elements a section MUST contain (required / optional / variant
slots) but leave the model free on *how* to render them. A hero must contain a headline, a
subhead, and a primary CTA — that is required; whether the CTA is a pill or a bordered block
is free.

WHY: pinning only *what* kills the **missing-element** failure (the model drops the CTA);
leaving *how* free kills the **templated-sameness** failure (every hero renders identically).
Constrain the structure, free the expression — pinning both produces clones, pinning neither
produces incomplete pages.

### Context-pinning

Pin the **current year** in the Context layer and forbid placeholder or dated framing —
no "© 2021", no "Lorem ipsum", no "Coming soon" stand-ins presented as final. WHY: an
unpinned model defaults to stale years and placeholder copy from its training distribution,
and a design shipped with last-decade dates reads as unmaintained. The current date is a fact
the host supplies; the model must not invent or omit it.

> **Temperature coupling** (informational — the `ui` binary cannot set it). The prompt
> modes above already carry a creativity setting: Replicate = low (pixel-faithful),
> Enhance / Adapt = medium-to-high. A host that exposes a temperature knob should couple it
> to the active mode; a host that does not still obeys the mode's *intent* through the
> constraint wording.

### Prompt-plan boundary

Replicate, Enhance, and Adapt modify evidence fidelity inside the prompt plan. They do not bypass
product truth, structural direction divergence, region production briefs, proportion comparison,
or preflight. ALLOWED: Replicate pins reference-observable structure more tightly than Adapt.
NOT ALLOWED: treating Enhance as prose beautification only, because eloquent ambiguity still
leaves the builder to invent product and layout decisions.

Compile and validate the prompt plan before emitting the seven-layer builder frame. The frame is
the compact execution packet; the prompt plan is the inspectable source of its decisions.

### Failure Modes

Where this contract goes wrong:

- **Fused classify-and-dress.** Style baked into the task ("a brutalist dashboard") so the UI
  type's hard constraints get lost to the aesthetic. Observable: the output misses a
  type-level floor (data density, touch targets) that the style crowded out.
- **Persona as decoration.** The generic baseline kept and the persona appended as flavor, so
  the output is a default with a costume. Observable: axes the persona overrides (its color,
  its depth) still show the generic default.
- **One-layer anti-slop.** Only the global list or only the persona list appended. Observable:
  a persona-specific tell (soft shadow on a brutalist page) or a universal one (AI-glow
  gradient) survives into the output.
- **Both-pinned or neither-pinned structure.** Pinning *how* as well as *what* yields clones;
  pinning neither yields pages missing required elements. Observable: identical section
  renders across generations, or a dropped CTA/headline.
