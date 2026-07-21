# Generation Craft Defaults

Read this with `qualified-delivery.md` when generating code. These defaults raise the
implementation floor; they do not replace project evidence, accessibility, or judgment.

## Purpose

Turn preferred craft into evidence-backed delivery contracts: coherent assets, intentional
responsive transformations, purposeful motion, complete control states, and bold composition.

## Mental model

```text
accessibility and correctness
  > established project evidence and design system
  > explicit user requirement
  > these defaults
  > model preference
```

Every exception names the rule, reason, and evidence reference. Never silently ignore a default.

## When to use / when not

Use for generated code and new marketing or landing surfaces. In brownfield work, preserve an
established icon or brand system when project evidence supports it. Do not force scroll motion on
a non-scroll surface, generated imagery on an image-free concept, or custom behavior where a
native control already satisfies the interaction.

## Asset policy

Resolve assets in this order:

```text
project asset → approved source → generated asset → intentional no-image
```

- **Interface icons:** use the official Phosphor package for the target runtime in greenfield
  work. Keep one family and a deliberate weight. An evidenced brownfield icon system wins.
- **Never substitute text glyphs for icons:** arrows such as `↗`, `→`, and `↓` inside links or
  buttons violate the icon contract. Use the matching Phosphor component and mark it
  `aria-hidden="true"` when the adjacent text already names the action.
- **Third-party logos:** resolve supported marks from SVGL, cache the exact SVG locally, and
  record its source URL and theme variant. Supplied first-party brand assets always win.
- **Original imagery:** when an approved direction needs imagery and no suitable asset exists,
  use the host's Codex image-generation capability backed by GPT Image 2. Record the prompt,
  role, dimensions, focal-safe area, and output path. Keep essential copy and controls as live
  HTML; never bake them into generated pixels.
- Do not generate logos, fabricate brand marks, or add imagery merely to satisfy a quota.

The deterministic `ui` binary records and validates asset declarations. It never fetches or
generates assets.

## Responsive contract

Marketing deliveries render at `390`, `768`, and `1440` widths. Declare how at least one major
region transforms at each width. Responsive design is not proportional shrinkage:

- preserve semantic reading order;
- prevent accidental horizontal overflow;
- keep the primary action reachable;
- protect image focal points;
- use whitespace to clarify hierarchy at every width;
- test long content and zoom-sensitive layouts.

## Motion and loading

Use the lowest sufficient tier in `motion-craft.md`.

- Marketing heroes receive a smooth, gentle ambient background treatment unless the surface,
  persona, or evidence makes it inappropriate.
- Scrollable marketing pages receive purposeful section motion that reinforces reading order.
- Interactive elements receive clear state feedback.
- Loading-to-content transitions remain layout-stable.
- Content is visible when JavaScript fails; entrance animation must never be a visibility gate.
- `prefers-reduced-motion` produces a complete static experience.

Motion must serve hierarchy, causality, feedback, or atmosphere. Animation quantity is never a
quality metric.

## Custom controls

Custom appearance is the default. Custom behavior must be earned.

1. Start from the correct native semantic element.
2. Apply the design system's custom visual treatment.
3. Use an ARIA combobox/listbox/menu implementation only when native behavior cannot satisfy the
   interaction.
4. A custom behavioral control must support keyboard navigation, visible focus, Escape, pointer
   and touch, disabled/loading/error states, and predictable focus return.

Never ship a `div` pretending to be a select.

## Composition

Before code, name:

- one composition thesis;
- one signature spatial move;
- one whitespace strategy;
- the familiar template pattern being avoided.

Bold layout does not mean random overlap. Whitespace must express grouping, priority, rhythm, or
focus. The curator must be able to observe the declared idea in the rendered artifact.

### Section architecture

A page thesis is insufficient when every section uses the same generic composition. Before code,
give every declared section:

- a purpose and narrative role;
- a layout model derived from its actual content;
- a composition anchor that makes the section recognizable;
- a content dependency explaining why the layout fits this topic;
- a structural responsive transformation.

For pages with three or more sections, use at least two layout models. Repeating a layout model is
valid only when the contract records a content, interaction, or design-system reason. Changing
headings, colors, icons, or images does not make a repeated composition distinct.

The page should read as one narrative family, not a collage. Distinct section architecture means
different jobs expressed through related forms—not arbitrary novelty in every viewport.

## Qualification evidence

A craft-qualified delivery includes:

- asset provenance for every declared role;
- successful renders at all canonical widths;
- default, reduced-motion, loading, and JavaScript-failure results;
- keyboard and pointer evidence for custom behavioral controls;
- curator confirmation that thesis, signature move, and whitespace hierarchy are observable.
- rendered review of every section confirming topic fit, distinct composition, and
  content-layout coupling.

Missing evidence blocks `QUALIFIED`; it never becomes an implied pass.

## Failure modes

- **library-collage** — mixed icon families create inconsistent optical weight. Cure: one declared
  provider and weight, or an evidenced project-system exception.
- **logo-without-origin** — a brand mark cannot be verified or updated. Cure: cache the source SVG
  and record its URL.
- **text-in-pixels** — essential copy becomes blurry, inaccessible, and unresponsive. Cure: keep
  essential text live and generate artwork only.
- **desktop-shrink** — mobile is a squeezed desktop composition. Cure: declare structural
  adaptations for each canonical width.
- **animation-visibility-gate** — failed JavaScript leaves content hidden. Cure: author visible
  final CSS state and progressively enhance motion.
- **fake-select** — a custom-looking control loses keyboard or screen-reader behavior. Cure:
  preserve native semantics or implement and test the full interaction contract.
- **empty-boldness** — random overlap or excessive whitespace is labelled creative. Cure: name
  the hierarchy mechanism and verify it in the rendered artifact.
- **same-layout-different-copy** — unrelated topics or section jobs are poured into the same card
  grid, timeline, or centered band. Cure: derive section architecture from content and require
  rendered evidence that the layout would lose meaning if swapped with another section.
