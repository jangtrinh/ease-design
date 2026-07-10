/**
 * `recall query` — retrieve. Embed the question, run dense KNN and BM25 over the same
 * index, fuse the two RANKS with RRF, weight by half-life decay, and demote superseded
 * knowledge. Emits a rank file the deterministic binary can splice back into its prior.
 *
 * Only LEDGER ids reach the rank file: `ui memory context --rank-file` resolves ids
 * against the ledger corpus, and knowledge chunks (`k:…`) / cross-project hits (`p:…`)
 * have no ledger event to resolve to. Those are surfaced to the model through `--text`
 * instead — retrieval is wider than the splice, on purpose.
 */
import { writeFileSync } from "node:fs";

import { embedOne, DIMS, MODEL_ID } from "./embed.ts";
import { RecallStore } from "./store.ts";
import type { RecallItem } from "./store.ts";
import { decayWeights } from "./decay.ts";
import { fuse, topK, toRankFile } from "./rank.ts";
import type { RankedItem } from "./rank.ts";
import { isLedgerId } from "./knowledge.ts";
import { homeScope, projectScope } from "./scope.ts";

/** Retrieve this many candidates per retriever before fusing down to k. */
const CANDIDATE_FACTOR = 4;

export interface QueryOptions {
  project?: string;
  home: boolean;
  k: number;
  json: boolean;
  text: boolean;
  out?: string;
  /** Clock for decay; pinned by tests. */
  now?: string;
}

export interface QueryHit extends RankedItem {
  tier: RecallItem["tier"];
  source: RecallItem["source"];
  text: string;
  t: string;
}

export interface QueryResult {
  query: string;
  k: number;
  dbPath: string;
  hits: QueryHit[];
  /** The `[{id,score}]` payload for `ui memory context --rank-file` (ledger ids only). */
  rankFile: { id: string; score: number }[];
}

export async function runQuery(query: string, opts: QueryOptions): Promise<QueryResult> {
  const scope = opts.home ? homeScope() : projectScope(opts.project);
  const store = RecallStore.open(scope.dbPath, DIMS, MODEL_ID);
  try {
    const nowIso = opts.now ?? new Date().toISOString();
    const candidates = Math.max(opts.k * CANDIDATE_FACTOR, opts.k);

    const qv = await embedOne(query);
    const dense = store.knn(qv, candidates);
    const lexical = store.bm25(query, candidates);

    const seen = [...new Set([...dense, ...lexical])];
    const items = store.getItems(seen);

    const ranked = fuse({
      dense,
      lexical,
      decay: decayWeights([...items.values()], nowIso),
      invalidated: store.invalidatedIds(),
    });

    const hits: QueryHit[] = topK(ranked, opts.k).flatMap((r) => {
      const item = items.get(r.id);
      return item === undefined ? [] : [{ ...r, tier: item.tier, source: item.source, text: item.text, t: item.t }];
    });

    return {
      query,
      k: opts.k,
      dbPath: scope.dbPath,
      hits,
      rankFile: toRankFile(hits.filter((h) => isLedgerId(h.id))),
    };
  } finally {
    store.close();
  }
}

/** Human-readable listing (`--text`): everything recalled, knowledge included. */
export function formatText(r: QueryResult): string {
  if (r.hits.length === 0) return `recall: no matches for "${r.query}"\n`;
  const lines = [`recall — top ${r.hits.length} for "${r.query}"`, ""];
  for (const h of r.hits) {
    const flags = [h.source, h.tier, ...(h.superseded ? ["superseded"] : [])].join("/");
    lines.push(`- [${h.id}] (${flags}) score ${h.score.toFixed(5)}`);
    lines.push(`    ${h.text.replace(/\s+/g, " ").slice(0, 240)}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Emit the result per the caller's chosen shape; returns what to print to stdout. */
export function emit(r: QueryResult, opts: QueryOptions): string {
  if (opts.out !== undefined) {
    writeFileSync(opts.out, JSON.stringify(r.rankFile, null, 2) + "\n", "utf8");
    return `recall: wrote ${r.rankFile.length} ranked id(s) to ${opts.out}\n`;
  }
  if (opts.json) return JSON.stringify({ model: MODEL_ID, ...r }, null, 2) + "\n";
  if (opts.text) return formatText(r);
  // Default: the rank file itself, on stdout, ready to redirect into ids.json.
  return JSON.stringify(r.rankFile, null, 2) + "\n";
}
