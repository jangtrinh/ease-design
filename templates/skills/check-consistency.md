---
description: "Score the Consistency axis — design-system token and component reuse. Use when auditing whether generated HTML uses the project's DS tokens and registered components instead of ad-hoc values."
---

# Skill: Check Consistency

Use when the host model needs to score the seventh **Consistency** axis — did the generation reuse the project's design-system tokens and registered components, with correct canonical naming?

## When to invoke
Inside the quality gate (`critique.md`) for any generation that runs against an existing design system. The other six axes evaluate the craft of the design; this axis evaluates the discipline of the design-system reuse.

## What to read & run
- `knowledge/taste-rubric.md` — the Consistency-axis spec (last section).
- `knowledge/token-taxonomy.md` — for what counts as a primitive vs. semantic token and the naming conventions.
- `ui ds context --strict` — emits the current DS as the model's reference of "the only tokens and components allowed".
- `ui registry list --json` — the canonical components the generation is permitted to use.

## What to produce
A Consistency score (0–10) and a list of any token references or component names in the generation that are NOT in the DS / registry — those are violations the model must either fix (use the registered token/component) or escalate (`ui registry register` if the new component is genuinely needed).
