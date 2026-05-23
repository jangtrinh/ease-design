# Skill: Apply Prompt Mode

Use when the host model has a reference input (a screenshot, image, or existing design) and needs to decide how faithfully to track it.

## When to invoke
At the start of `from-ref.md` and `figma.md`, and any other workflow that takes a reference. The chosen mode then modulates the generation prompt downstream.

## What to read
- `knowledge/prompt-modes.md` — the three modes: **Replicate** (low creativity — match the reference exactly), **Enhance** (high creativity — improve while preserving intent), **Adapt** (medium — same content reshaped for a different platform). Includes a decision table.

## What to produce
One of `replicate` / `enhance` / `adapt`, plus a one-sentence justification grounded in the user's stated goal. Default to `replicate` when the user is silent — the safest, least-surprising choice.
