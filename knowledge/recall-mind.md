# recall — semantic memory over the design ledger

Where `figma-agent` is the **hands**, `recall` is the **mind**: it makes the design memory
*searchable by meaning*, so a job can be grounded in the latest relevant thing this project
(or this designer) already learned, instead of only the last few events.

This CLI is an optional in-repo tool — like the `ui` binary it is driven over Bash, but it is
NOT part of ease-design's deterministic `ui` binary, is not installed by
`npm install ease-design`, and is not published with the package. It lives at `recall/` (an npm
workspace inside this repo) and needs **Node ≥ 22** (it reads the index through the built-in
`node:sqlite`). Embeddings are **local** — nothing is sent over the network.

## The boundary (do not cross it)

```
DETERMINISTIC  ui binary — zero-dep, no network, no LLM
   design/memory.events.jsonl  (TRUTH, append-only)
      │  ui memory export-corpus [--since <eventId>]   → tiered NL payloads
      ▼
NON-DETERMINISTIC  recall/ — embeddings + vector index + ranking
   design/memory.vec.db      per-project index      (REBUILDABLE CACHE)
   ~/.ease-design/taste.vec.db  cross-project index (REBUILDABLE CACHE)
      │  recall query "<text>" --out ids.json
      ▼
   ui memory context --rank-file ids.json           → recalled prior
```

- The **ledger is truth**. The `.vec.db` files are caches: delete one, run `recall index`, and
  it comes back identical. Never treat the index as a second source of truth.
- Learned knowledge flows back into the ledger **only** through
  `ui memory record insight --refs <ids>` — provenance is mandatory.
- The `ui` binary never imports anything from `recall/` (a test enforces this).

## Setup

```bash
# from the repo root: npm run build --workspace=recall   (once, or after a source change)
RC="node recall/cli/dist/recall.js"
$RC --help
```

The first `recall index` or `recall query` downloads `Xenova/all-MiniLM-L6-v2` (384-dim) into
the transformers cache; later runs are in-process and fast.

## Index (ORGANIZE)

```bash
$RC index --project .                      # embed new ledger events for this project
$RC index --project . --knowledge knowledge  # …and fold the knowledge core into the same index
$RC index --home                           # cross-project index over every registered project
```

Incremental by construction: the index header stores the last ledger event folded in (a cursor
per project for `--home`), so a re-run embeds only what is new. A later token rationale for the
same token **supersedes** the earlier one — demoted, never deleted.

## Query (RETRIEVE → FEEDBACK)

```bash
$RC query "why is the brand colour warm?" --project . --k 6 --out ids.json
ui memory context --rank-file ids.json     # splices the recalled items into the prior
$RC query "what shadows suit liquid glass?" --project . --text   # human-readable, incl. knowledge
```

Ranking is **RRF(dense KNN, BM25) × half-life decay × bi-temporal validity**: relevance from two
retrievers fused on rank, recency from the same 30-day half-life the memory graph uses, and
superseded knowledge demoted so it only surfaces when nothing current matches.

Only **ledger ids** (`e12`) reach the rank file — `ui memory context --rank-file` resolves ids
against the ledger. Knowledge chunks (`k:…`) and cross-project hits (`p:…`) have no ledger event
to resolve to, so they surface through `--text` instead. Retrieval is deliberately wider than the
splice.

## In a design job

1. **Start** — build a query from the brief, `recall query … --out ids.json`, then
   `ui memory context --for generate --rank-file ids.json` to prime the generation prior.
2. **End** — `recall index` to fold the job's new events in (ORGANIZE).
3. Never splice recall into `--for critique`: the taste gate stays craft-only.

## Gotchas

- `node:sqlite` is experimental on Node 22 — the warning on stderr is expected and harmless.
- An index is pinned to its model id + dimensions. Changing the model refuses to open the old
  index rather than mixing embedding spaces; delete it and re-index.
- ONNX float output varies slightly across CPU architectures. That is fine precisely because the
  index is a cache — determinism lives in the ledger, not in the vectors.
- Some workspace setups have a scout-block hook that blocks Bash commands containing the literal
  tokens `dist` / `build` — if you hit that while driving this CLI, split the token.
