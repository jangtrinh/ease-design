# recall — the optional semantic "mind" over ease-design's design memory

`recall` makes the append-only design-memory ledger searchable **by meaning**, so a design job
can be grounded in the most relevant thing this project already learned — not just the most
recent events. It is the counterpart to `figma-agent` (the "hands").

Driving instructions live in [`knowledge/recall-mind.md`](../knowledge/recall-mind.md). This file
covers the workspace itself.

## Why it is a separate workspace

The `ui` binary is deterministic: zero runtime dependencies, no network, no model calls. Semantic
recall needs the exact opposite — an embedding model and a vector index. So the two never meet in
one process:

- `ui memory export-corpus` (pure, in the binary) emits tiered natural-language payloads.
- `recall` embeds and indexes them, and ranks a query against them.
- `ui memory context --rank-file` (pure, in the binary) splices the ranked result back.

A root test (`tests/recall-boundary.test.ts`) fails the build if anything under `src/` so much as
mentions `sqlite-vec`, `@huggingface/transformers`, `onnxruntime`, or `node:sqlite`.

## Requirements

- **Node ≥ 22** — the index is read through the built-in `node:sqlite` (experimental; the warning
  on stderr is expected). The `ui` binary keeps its Node 20 floor.
- `sqlite-vec` (vec0 KNN) + `@huggingface/transformers` (local ONNX embeddings). Both are
  workspace dependencies; neither is published with `ease-design`.

## Build & run

```bash
npm run build --workspace=recall
node recall/cli/dist/recall.js --help
```

## Layout

| Path | Purpose |
|---|---|
| `cli/src/recall.ts` | entry point — `index` \| `query` \| `reflect` |
| `cli/src/cmd-index.ts` | ORGANIZE: pull corpus → embed → upsert → supersede |
| `cli/src/cmd-query.ts` | RETRIEVE: embed → KNN + BM25 → fuse → rank file |
| `cli/src/cmd-reflect.ts` | REFLECT: job events + neighbours → packet + write-back (no LLM here) |
| `cli/src/rank.ts` | **pure**: RRF × decay × validity (no I/O, no deps) |
| `cli/src/decay.ts` | **pure**: 30-day half-life weight |
| `cli/src/store.ts` | `node:sqlite` + vec0 + FTS5 + pinned index header |
| `cli/src/embed.ts` | local ONNX embedder (`Xenova/all-MiniLM-L6-v2`, 384-dim) |
| `cli/src/corpus.ts` | shells out to `ui memory export-corpus` — never parses the ledger |
| `cli/src/knowledge.ts` | chunks `knowledge/*.md` into the same index |
| `cli/src/scope.ts` | per-project vs cross-project index resolution |

## Tests

```bash
npx vitest run --config recall/vitest.config.ts      # pure + store suites (no model)
RECALL_E2E=1 npx vitest run --config recall/vitest.config.ts   # + real embedder (downloads a model)
```

The store suite runs against `:memory:` with hand-made vectors, so the fast suites never touch
the network. Only the embed integration suite is gated behind `RECALL_E2E=1`; CI runs the fast
suites on every push.

## Invariants

1. `dist/cli.js` never imports this workspace or its dependencies.
2. `*.vec.db` is a **rebuildable cache** over the ledger — delete it and `recall index` restores it.
   Exception (spec 006 P3): `recall query` writes a `retrievals` row per served id, so decay
   can measure time since last *use*. That history is the one thing in the DB that is not
   rebuildable — deleting the DB resets decay to write-time (the pre-006 behaviour). The
   ledger remains truth for everything else.
3. Learned knowledge returns to the ledger only via `ui memory record insight --refs …`. `recall
   reflect` prints that command; it never runs a model and never writes the ledger itself.
4. Embeddings are local by default; there is deliberately no API-embedder path.
5. `recall/` is optional and never published with `ease-design`.
