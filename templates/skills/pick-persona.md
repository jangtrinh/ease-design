# Skill: Pick Persona

Use when the host model needs to choose one or more design personas for a generation, redesign, or extraction task.

## When to invoke
Whenever a workflow step says "select N personas from intent" or "choose a contrasting persona", or whenever the user names a persona by family/keyword and the model needs to resolve a concrete slug.

## What to read
1. `knowledge/persona-index.md` — the lookup table of all 23 personas + the keyword-scoring and `diverseTopK` selection algorithm. Read this first.
2. Once a persona is shortlisted, `knowledge/personas/<family>.md` — the full aesthetic DNA for that family. Read only the chosen family's file, not all seven.

## What to produce
A concrete persona `slug` (or list of slugs) that downstream steps can pass to `ui ds init --persona <slug>` or load into the model's working context.
