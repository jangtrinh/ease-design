# ease-design Knowledge Core

The `knowledge/` directory is one of ease-design's two sources of truth (the other is the
deterministic `ui` binary). These are **plain-Markdown files the host AI model reads
directly** while designing UI — curated design taste that sets the quality floor.

> **Selective reading.** Open only the file(s) a task needs — never load the whole core.
> Each file is self-contained; the task map below routes you to the right one.

## The files

| File | Covers |
|---|---|
| `taste-rubric.md` | The 6-axis taste model — Layout, Typography, Spacing, Motion, Iconography, Depth/Surface — plus the 7th Consistency axis. Per-axis 0–10 scoring and the critique-gate pass thresholds. |
| `personas/<family>.md` | The persona library — 23 curated personas across 7 families, one file per family. Each persona carries full aesthetic DNA (typography, color, spacing, depth, motion, anti-patterns, …). A persona is a fixed point in taste-space. |
| `persona-index.md` | Compact lookup table for all 23 personas + the auto-selection algorithm (keyword scoring, industry affinity, diverse-top-K) that picks personas from a user's intent. |
| `mode-constraints.md` | The 8 UI-mode constraint sets — mobile, desktop, component, slide, dashboard, app, admin, ecommerce — plus `TECHNICAL_RULES`, the universal hard style guide. |
| `component-catalog.md` | 32 reusable components across 8 categories — id, name, description, and generation spec for each. |
| `color-science.md` | OKLCH reasoning, WCAG contrast targets, 11-stop scale generation, semantic role mapping. The *reasoning* — the *math* is a `ui` binary subcommand. |
| `token-taxonomy.md` | The DTCG design-token model — primitive vs. semantic tiers, naming, alias resolution, post-compile immutability. |
| `prompt-modes.md` | The replicate / enhance / adapt strategy modifiers for reference-driven generation. |
| `figma-craft/figma-craft.md` | The senior-designer construction brain for **authoring idiomatic Figma** — craft philosophy, a decision ladder, build workflows, and the L1–L14 construction lints. Deep-dives live in `figma-craft/{layout-mastery,components-variables-styles,structure-hygiene,visual-craft,intent-recipes}.md`. Used by `/ui:to-figma`. |
| `figma-agent-hand.md` | How to drive the **external** `figma-agent` CLI (the Figma "hands"). This is an optional external tool — like the `ui` binary it runs over Bash, but it is NOT part of ease-design's binary and requires a local clone of the figma-design-agent repo with its Figma plugin loaded. |

## Task → files

**Generate a design from an intent**
1. `persona-index.md` — auto-select personas from the intent
2. `personas/<family>.md` — load the full DNA of each chosen persona
3. `mode-constraints.md` — apply the UI mode's constraints + `TECHNICAL_RULES`
4. `taste-rubric.md` — score the result; refine the failing axes

**Establish / compile a design system**
- `token-taxonomy.md` — token tiers and immutability rules
- `color-science.md` — palette generation and contrast

**Critique or score a generation** — `taste-rubric.md` (all 7 axes; the Consistency axis grades against `token-taxonomy.md`)

**Build a specific component** — `component-catalog.md`

**Generate from a reference (image or existing design)** — `prompt-modes.md` to pick
replicate / enhance / adapt, then the generate flow above

**Make a color decision** — `color-science.md`

**Author idiomatic Figma from intent** (`/ui:to-figma`)
1. `figma-agent-hand.md` — confirm the external hand is set up and live
2. `figma-craft/figma-craft.md` — the construction brain + decision ladder
3. `figma-craft/<reference>.md` — the one deep-dive the current step needs
4. `taste-rubric.md` — critique the exported PNG; refine the failing axes

## Relationship to the `ui` binary

These files hold *design knowledge and reasoning*. Deterministic work — color math, token
compilation, layout validation, autofix, the component registry — is the `ui` binary's job.
When a knowledge file says the binary computes something, shell out to `ui` rather than
doing the math in-context.
