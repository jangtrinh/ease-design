# User evidence — grounding design in what users actually said

A design should be traceable to *evidence*, not assertion. "Users want a dashboard" is an
assumption until someone can point to the interview, the survey, the analytics row it came from.
T6 makes evidence a first-class, verifiable artifact and wires it into the coverage gate, so
"this criterion is evidenced" stops meaning "a string was present" and starts meaning "a real,
quoted user finding backs it." This is the traceability spine: **research → acceptance criterion
→ design decision**.

## The anti-fabrication gate (the whole point)
The failure mode of an AI designer is a *confident invented quote* — "users told us they loved
the flow." The binary's defence is deterministic and simple: a **`quote` finding must be a
verbatim substring of its ingested source text** (whitespace-normalised, never lower-cased, and
at least `MIN_QUOTE_CHARS` long so "the" can't match). If the quote isn't in the source, `ui
evidence add` rejects it and `ui evidence verify` fails. The model cannot launder a fabrication
through the ledger — the source text is committed alongside the claim and re-checkable by anyone.

The binary NEVER writes findings itself. Turning a raw transcript into a crisp finding is the
host model's judgment; the binary only **records and verifies**. Recording something is a claim
that a human/PM/researcher stands behind — provenance (`medium`, `locator`) is captured for them.

## The three support levels (quote-when-claimed)
- **`quote`** — a verbatim user utterance. Strongest. Gated: must match its source or be rejected.
- **`metric`** — a number from analytics/a survey (`value`/`unit`/`n`) plus a source reference.
  Accepted without a substring check (a figure isn't a quotation) — its honesty rests on the ref.
- **`observation`** — a designer/PM hunch with no source. Accepted, but permanently flagged
  **`unsupported`** — the same discipline as T0's *assumption*. Useful to record, never counted as
  grounding. Promote it to a `quote`/`metric` when real evidence arrives.

## The store (self-contained, git-committable)
A directory (default `design/`): `research.events.jsonl` (append-only ledger, one finding per
line, ids `ev1`, `ev2`, …) + `research-sources/<name>` (the verbatim source texts). Commit both,
so the anti-fabrication gate is reproducible on any clone. Sources are ingested by basename; two
different files with the same name collide loudly rather than silently overwriting evidence.

## The commands
- `ui evidence add --finding "…" [--kind quote|metric|observation] [--quote "…"] [--source FILE]
  [--medium interview|survey|analytics|…] [--locator "line 42"] [--metric V --unit U --n N]
  [--tags a,b]` — records one finding; ingests + verifies the source; assigns the next id.
- `ui evidence list` / `ui evidence show <id>` — read the ledger with support + verify status.
- `ui evidence verify` — re-check every quote against its stored source; **exit 1** on any
  fabricated or drifted quote. This is the integrity gate to run in CI.

## Intake — transcript → findings (host-model flow)
Turning a raw transcript, interview, or notes file into ledger findings is the **host model's**
job — it already is a model, so no new binary command exists (or is needed) for the extraction.
The `/ui:evidence <transcript-file>` workflow drives it. Per source file:

1. **Read the source** and extract a *proposed list* of findings. Each is `{ kind:
   quote|metric|observation, the exact text (a quote copied VERBATIM from the source — never
   paraphrased or tidied), the source ref, and an optional acceptance-criterion id it grounds }`.
2. **Show the list to the owner to confirm** before writing anything — recording a finding is a
   claim a human stands behind (see the anti-fabrication gate above). Drop or fix any they reject.
3. **Record each confirmed finding** with the real binary — one `add` per finding:
   `ui evidence add --finding "…" --kind quote --quote "<verbatim>" --source <file> [--medium
   interview] [--locator "line 42"] [--tags <criteria-id>]`.

**Why this flow is fabrication-safe:** the model does not get to *assert* a quote is real. `ui
evidence add` re-reads the ingested source and **rejects any `quote` that is not a verbatim
substring** of it (whitespace-normalised, never lower-cased, at least `MIN_QUOTE_CHARS` = 8). An
invented or "rounded" quote fails `add` (and later `verify`) deterministically — the ledger cannot
launder a hallucination even if the model tries. That rejection is the whole reason to do intake
*through* the binary instead of hand-writing JSONL.

**Honesty rules for the extractor:**
- Copy quotes byte-for-byte. If you cannot reproduce it exactly, it is not a `quote` — downgrade
  it to an `observation`, never a "close enough" paraphrase.
- Never derive or estimate a `metric`. Record the figure the source actually states, with its
  `--source` (and `--metric`/`--unit`/`--n`) — cite the export, not your arithmetic.
- An `observation` with no source is accepted but auto-flagged **`unsupported`** — context, never
  grounding. Promote it once a real quote/metric arrives.

**Loop closure with coverage (T0):** tag each finding with the criterion id it grounds
(`--tags <criteria-id>`) so you can find it, then cite its assigned ledger id (`ev1`, `ev2`, …) in
that criterion's `evidence: [...]`. `ui critique-coverage <spec> <manifest> --evidence-dir design
--require-evidence` then counts the criterion as *evidenced* only when a cited id exists **and**
verifies — closing the spine **finding → criterion evidence[] → coverage evidenced** (see below).

## Closing the loop with coverage (T0)
`ui critique-coverage <spec> <manifest> --evidence-dir design` resolves each acceptance
criterion's `evidence: ["ev1", …]` as **ledger ids**. A criterion counts as *evidenced* only if a
cited id exists AND verifies. A cited id that's missing or whose quote has drifted is reported as
**`unresolvedEvidence`** and **fails the gate (exit 1) even without `--require-evidence`** — a
broken citation is worse than a missing one. Without `--evidence-dir`, the legacy behaviour holds
(any non-empty `evidence[]` counts), so existing briefs keep working.

## Honesty rules
- The binary verifies *that a quote is real*, not *that the finding is a fair reading of it* —
  cherry-picking is a human/curator concern. Record the `locator` so a reviewer can check context.
- `observation` is never grounding. Don't let an unsupported hunch masquerade as coverage.
- A metric's honesty is only as good as its `source` ref — cite the export, not "analytics".
- Where research comes from (interviews, a research-agent, analytics dumps) is out of scope for
  the binary — that's the host/workspace layer. The binary is the deterministic floor beneath it.
