---
description: "Evaluate a generated design against the 6+1-axis taste rubric. Use when a workflow gate asks to score a variant, run the taste gate, or judge whether a design clears the ship bar."
---

# Skill: Score Taste

Use when the host model needs to evaluate a generated design against the 6+1-axis taste rubric.

## When to invoke
At the **quality gate** step of every generation workflow (`generate.md`, `redesign.md`, `from-ref.md`, `figma.md`, `slides.md`) and during the `refine.md` self-correction loop. The `critique.md` workflow drives the gate; this skill is the rubric it grades against.

## What to read
- `knowledge/taste-rubric.md` — the six craft axes (Layout, Typography, Spacing, Motion, Iconography, Depth/Surface) plus the seventh **Consistency** axis. Each axis carries low/mid/high descriptors and per-axis 0–10 scoring criteria. Default pass threshold: each axis must score ≥ 7/10.

## What to produce
Per-axis scores + a short justification per axis + the lowest-scoring axis name (used by `refine.md` to target the next refinement pass).
