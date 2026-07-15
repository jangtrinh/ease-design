---
description: "Run the day-to-day design:os loop well: know which of the four 'audit' surfaces to run and how to read its result, triage findings from any linter consistently (iterate, ship, or escalate), verify a flagged issue is real before fixing it, preflight the Figma connection before trusting a scan, prime with recall at job start, and run the taste-corpus vote loop. Use during /ui:generate, /ui:iterate, /ui:audit, /ui:design, taste voting, or any Figma canvas work — the day-to-day work between onboarding and shipping."
---

# Journey: Daily

Use this for the ordinary day-to-day work between onboarding and delivery: generating,
iterating, auditing, voting on taste, and operating the Figma canvas. It does not
re-explain what any one linter checks (`knowledge/` and each command's own `--help` already
do that) — it teaches which surface to reach for, how to read what comes back, and the
handful of STOP-gates that have each cost a real dogfood session when skipped.

## 1. The four "audit" surfaces — read this before running any of them

Four different things share the word "audit." Running the wrong one and reporting its
result with confidence is the single highest-risk mistake in the daily loop, because
nothing else disambiguates them:

| Surface | Operates on | Checks | Use when |
|---|---|---|---|
| `ui audit <nodes.json> --tokens <t> --registry <r> --json` | A **structured Figma node export** you already captured (JSON) | DS-violations only: `raw-hex-vs-token`, `detached-instance`, `raw-icon-vs-Icon`, `off-grid` spacing/radius, `deprecated-component` | You already have a node export and want just the violation report — this is the zero-token detection engine `/ui:audit` calls internally |
| `/ui:audit` | A **live Figma file/frame** via the figma-agent hand | Runs `ui audit` above, then **normalizes the canvas** (re-instances, icon swap, snap, remap) and re-audits until `total: 0` | The user says "audit this Figma frame," "fix DS violations," or "normalize to the DS" |
| `design-os audit <target> [--dir <project>]` | An **HTML file or a project dir** (generated pages, a build) | Composes the full deterministic `ui` linter chain (`validate-layout` + `a11y-lint` + `taste-lint` + `content-lint`, plus DS/flow checks when `--dir` is a project) into one sweep | A full-stack static audit of generated HTML — nothing Figma-specific |
| `ui ds a11y [--dir <project>] [--pairs "t:s,..."]` | The **compiled DS's tokens** (`design.tokens.json`) | Token-**pair** contrast only: every declared `text × surface` pair (incl. hover/active) ≥ AA | A narrow "is my palette accessible" question — no page or canvas involved |

If asked to "audit" something and it isn't obvious which of the four is meant, ask which
target it is (a Figma file, an HTML page, a project, or just the color tokens) — that alone
picks the row.

## 2. Finding-triage — one procedure for every linter's result

Every `ui`/`design-os` check that emits findings follows the same contract, so triage the
same way regardless of which one ran:

1. Always call it with `--json` and read the envelope, not just the exit code — exit `1`
   means either **real findings** or a **usage error** (bad path, bad flag), and only the
   envelope tells you which. An `error.code` like `BAD_ARG`/`FILE_NOT_FOUND`/`READ_ERROR`
   is a usage mistake in your own invocation, not a design problem — fix the call and
   re-run, don't touch any artifact.
2. If it's real findings: exit `0` means no **error-severity** finding exists (warnings are
   still allowed through) — that's ship, but only after you've actually looked at any
   warnings, not skipped them. Exit `1` means at least one error-severity finding — that's
   iterate.
3. Different commands nest the findings list under different keys (`data.violations` for
   `ui audit`, `data.findings` for `ui a11y-lint`/`validate-layout`/`content-lint`/`flow`,
   `data.checks` for `ui doctor`, per-task `status` for heartbeat) — read the specific
   command's own `--json`/`--help` for its shape rather than assuming one universal key.
4. For each individual finding, choose **iterate** (fix the flagged artifact and re-run the
   same check) or **escalate** (surface the conflict to the user/spec instead of silently
   patching or silently shipping) — see the verification discipline below before deciding
   which.

## 3. Verify before you fix — a flagged pair may be hypothetical

A linter flags what its model of the artifact says is wrong, not necessarily what actually
ships. Before editing anything a check flagged, confirm it is a **real, shipped** usage —
not an inferred pairing the check's model produced but that nothing on the page/canvas
actually renders. (A real case: a token was flagged at 2.07:1 contrast by the inferred
text×surface matrix, but that token was never actually used as text anywhere in the shipped
CSS — "fixing" it would have edited a token nobody needed changed. The paired-token mode
narrows this, but the discipline of checking real usage before editing is still yours, not
the binary's.)

**The one exception — a11y always wins over the style source.** If an accessibility gate
flags a token that the brief, a soul, or a provided style source explicitly specified, the
a11y finding still overrides it — surface the conflict to the user (the source token is
inaccessible as given) rather than silently shipping the inaccessible value **or** silently
overriding the brief without saying so.

## 4. Figma preflight — check the file before you trust the result

More than one Figma file can be connected to the broker at once (a shadcn reference file
plus the real project, for example), and a scan/audit call routes to whichever file was
**most recently active** unless pinned. Before trusting any figma-agent result:

```bash
figma-agent status
```

Read `plugins[].fileName` (and `activePlugin`) in the response — confirm it names the file
you meant, not some other open tab — **before** reading anything else in the result. If more
than one file might be open, set the `FIGMA_AGENT_FILE` env var to pin the target explicitly
rather than relying on recency. This is the single highest-recurrence mistake in Figma work
across dogfood sessions — check the header every time, not just the first time.

## 5. Recall at job start (and reflect at the end)

Priming a job with the project's own memory is optional but cheap, and today it is only
documented in the README's mermaid diagram — nowhere else prompts an agent to do it
unprompted:

```bash
recall query "<what this job is about>" --out ids.json   # before starting
ui memory context --rank-file ids.json --for generate     # fold it into the prior
```

At the end of the job, close the loop the same way every time:

```bash
recall index --project .                    # embed what just landed
recall reflect job-events.json --project .   # distill one durable lesson + print the write-back command
```

`recall` never calls a model itself — `reflect` only assembles the packet; the host model
writes the lesson. If `recall` isn't installed (`design-os doctor --versions`), skip this
section entirely — nothing else in the daily loop depends on it.

## 6. Taste corpus workflow

`ui taste` is a vote-driven corpus with zero knowledge-file coverage today — everything
below comes straight from `ui taste --help`:

```bash
ui taste ingest --dir <source-dir> --genre <g>       # pull images into the corpus (dedup by sha256+dHash)
ui taste next --mode pair --json                      # propose the next thing to vote on (read-only)
ui taste record --mode pair --a <id> --b <id> --winner a|b|tie|skip --json
ui taste status --json                                 # ledger counts, top-Elo per genre, self-consistency
```

`--mode study` is the parallel lane for a labeled-lesson verdict instead of a pairwise vote
(`--item <id> --verdict LEARN|PARTIAL|SKIP`, optionally `--blind-verdict` before revealing
the known lesson). The store is append-only JSONL under `<root>/taste/` (default
`DESIGN_OS_TASTE_ROOT` env, else `<cwd>/taste`) — Elo is always replayed from the ledger,
never itself stored.

## Handback discipline

**Status:** DONE | DONE_WITH_CONCERNS | BLOCKED · which audit surface(s) ran and their exit
codes · how each finding was triaged (iterate/ship/escalate) and why · open questions.
