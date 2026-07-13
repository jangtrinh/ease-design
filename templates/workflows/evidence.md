---
description: "Turn a transcript, interview, survey, or notes file into verified user-evidence findings and record them in the ledger the coverage gate cites. Use when the user says 'log evidence', 'add a finding', 'ingest this transcript/interview/survey', or wants an acceptance criterion backed by a real user quote or metric."
---

# Workflow — `/ui:evidence`

`/ui:evidence <transcript-file>` — the intake side of **user-evidence** (DESIGN-OS T6):
turn a raw source (a transcript, interview, survey export, analytics dump, or notes file)
into ledger findings that acceptance criteria can cite. Extraction is **your** job as the
host model — you already are one; there is no new binary command for it. The `ui` binary
only **records and verifies**; it never invents evidence.

Read `knowledge/user-evidence.md` first — the **"## Intake — transcript → findings
(host-model flow)"** section is the operating brain for this job: the extraction shape, the
verbatim-quote gate that makes it fabrication-safe, the honesty rules, and the coverage
loop-closure. Follow it exactly; the steps below are its checklist.

## Inputs

- **`<transcript-file>`** *(required)* — the source to mine: an interview/transcript, a survey
  or analytics export, or a notes file. Everything recorded is re-checked against this file, so
  it must be the real text, not a summary.

## Steps

### 1 — Extract (propose, don't assert)

Read the source and produce a **proposed list** of findings. Each is
`{ kind: quote|metric|observation, exact text (quotes copied VERBATIM — never paraphrased or
tidied), source ref, optional acceptance-criterion id it grounds }`.

### 2 — Confirm with the owner

Show the proposed list **before writing anything** — recording a finding is a claim a human
stands behind. Drop or fix whatever the owner rejects.

### 3 — Record each confirmed finding

One `add` per finding. The binary rejects any `quote` that is not a verbatim substring of the
source (whitespace-normalised, ≥8 chars), so a fabricated quote **cannot** enter the ledger:

```bash
ui evidence add --finding "…" --kind quote --quote "<verbatim>" --source <transcript-file> \
  --medium interview --locator "line 42" --tags <criteria-id>
```

Use `--kind metric --metric V --unit U --n N` for a figure (cite the export, never estimate),
or `--kind observation` for an unsourced hunch (auto-flagged `unsupported` — context, never
grounding). Run `ui evidence --help` for the full signature — do not invent flags.

### 4 — Verify + review

```bash
ui evidence list
ui evidence verify
```

`verify` exits **1** on any fabricated or drifted quote — treat a non-zero exit as a hard stop,
not a warning.

## Outputs

- New findings appended to the evidence store (default `design/`: `research.events.jsonl` +
  `research-sources/<file>`), each with an assigned id (`ev1`, `ev2`, …) and support level.
- A short summary: which findings landed, their ids, and the acceptance criteria they ground.
  Cite those ids in each criterion's `evidence: [...]` so
  `ui critique-coverage <spec> <manifest> --evidence-dir design --require-evidence` counts the
  criterion as *evidenced* — closing the spine **finding → criterion evidence[] → coverage**.
