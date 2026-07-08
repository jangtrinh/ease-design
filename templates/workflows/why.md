---
description: "Answer why a design decision is the way it is — trace picks, edits, verdicts, and token changes with provenance from the project's design memory. Use when the user asks why a color/spacing/persona/component is the way it is, what was decided, or when something changed."
---

# Workflow: why

`/ui:why "<question>"` — the human-facing read side of **design memory**. When
someone asks *"why is the primary color this teal?"*, *"why did we drop the
liquid-glass variant?"*, or *"what changed the spacing scale?"*, this workflow
answers from the project's recorded history — the append-only event ledger the
rest of the pipeline writes as it works — **never** from guesswork. Every claim
cites the event(s) it came from.

## Inputs

- **`"<question>"`** *(required)* — a plain-language question about a past design
  decision. Examples: `"why is the accent warm?"`, `"why 3 tiers on pricing?"`,
  `"when did the hero change?"`.

## Steps

### Step 1 — Pull the relevant memory

Do **not** narrate from imagination. Read only what the ledger returns.

1. For a broad "why/what/when" question, load the compact prior:

   ```sh
   ui memory context --for why
   ```

   If it prints `memory: empty`, jump to Step 3 (the honest fallback).

2. When the question names a concrete entity, narrow with a raw query and cite
   exact events. Pick the filter that matches the question:

   ```sh
   ui memory query --type token_change            # "why is <token> …?" / "what changed?"
   ui memory query --type user_pick               # "why did we pick / drop …?"
   ui memory query --design "<design-id>"         # everything about one design
   ui memory query --persona "<slug>"             # everything about one persona
   ```

   Each row is `e<id>  <ISO-timestamp>  <type>  design=<id>  by=<actor>`. Use
   `--json` if you need the full `data` payload (e.g. a `token_change`'s
   `from`/`to`/`reason`, or a `taste_verdict`'s `lowestAxis`).

### Step 2 — Answer with provenance

Compose a short, direct answer that **traces the decision**:

- Cite the event id(s), the date, and the actor for every factual claim
  ("picked on 2026-07-08 (`e12`, by jang)…").
- For a token question, quote the `from → to` and the recorded `reason`.
- For a persona/variant question, use the `user_pick` (chosen vs rejected) and
  any `taste_verdict` that explains a rejection (its `lowestAxis`).
- Surface an `insight` event verbatim when one is on point (it already carries
  its own `refs` provenance).

Do **not** invent history, motivations, or dates. If the memory is silent on
part of the question, say so explicitly rather than filling the gap.

### Step 3 — Honest fallback (no memory)

If nothing relevant is recorded (cold start, or the topic was never captured),
answer plainly:

> I have no recorded memory of that. Design memory starts the first time you run
> `/ui:learn` or `/ui:generate` in this project, and grows as you pick variants,
> make vibe edits, and change tokens.

Then, if useful, offer to establish the decision now (e.g. run `/ui:generate` or
`ui ds change-token … --reason "…"`, which will record it for next time).

## Outputs

- A concise, plain-language answer grounded **only** in returned events, each
  claim tagged with its provenance (event id · date · actor), or the honest
  "no recorded memory" fallback. No files are written; `/ui:why` is read-only.
