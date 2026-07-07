# Skill: Figma Craft

Use when the host model is building, editing, converting, or fixing anything on a Figma
canvas via the external `figma-agent` CLI — deciding *what* idiomatic construction the hands
should produce, and verifying it afterward.

## When to invoke
Whenever a workflow step authors or edits Figma (`/ui:to-figma`, or any task that drives the
figma-agent hand): laying out frames (auto-layout / GRID / sizing), creating components,
instances, variants, or variables, converting HTML → Figma, or running Plugin-API `exec-js`.
Invoke it **before** building (pick the right construction) and **after** building (run the
construction lints).

## What to read
1. `knowledge/figma-agent-hand.md` — the hands: how to drive the external figma-agent CLI
   (setup, `status`, the command table, the `export-png → Read` loop). This is an optional
   external tool, not ease-design's `ui` binary.
2. `knowledge/figma-craft/figma-craft.md` — the construction brain: craft philosophy, the
   decision ladder, build workflows, and the L1–L14 construction lints. Read this first.
3. Follow the decision ladder into one `knowledge/figma-craft/*` reference at a time
   (`layout-mastery`, `components-variables-styles`, `structure-hygiene`, `visual-craft`,
   `intent-recipes`) — only the one the current step needs, not all five.

## What to produce
Idiomatic Figma nodes — auto-layout structure, component instances over copies, token-bound
variables, senior-file layer names — that pass the L1–L14 construction lints and are ready
for the critique gate. Every fix applied as a narrow, targeted `exec-js`, never a page-wide
mutation.
