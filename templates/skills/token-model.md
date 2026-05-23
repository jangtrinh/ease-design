# Skill: Token Model

Use when the host model is defining, aliasing, or changing design tokens.

## When to invoke
Inside `generate.md` (when no DS exists yet and the workflow compiles one), `extract.md` (extracting tokens from existing HTML), and any workflow step that calls `ui ds change-token`.

## What to read & run
- `knowledge/token-taxonomy.md` — the DTCG two-tier model (primitives vs. semantic), naming conventions, alias resolution rules, post-compile immutability semantics. Read this for the *contract*.
- `ui ds context --strict --format json` — emits the current resolved token tree so the model knows what's already defined before deciding to add or alias something.
- `ui ds change-token <path> --value <literal-or-alias>` — the only sanctioned mutation. Literals must match the slot's `$type`; composite-token aliases are rejected with `BAD_VALUE` (mutate individual members instead).

## What to produce
Either a concrete `ui ds change-token` invocation or, for the up-front compile path in `generate.md`, a complete `design.tokens.json` body to pass to `ui ds init`.
