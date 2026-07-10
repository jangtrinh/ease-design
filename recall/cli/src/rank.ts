/**
 * Hybrid ranking — the pure half of recall (Track 9 · P3c).
 *
 * Three multiplicative signals, in this order:
 *
 *   1. RRF fusion of the dense-KNN rank and the FTS5/BM25 rank. Reciprocal Rank
 *      Fusion combines RANKS, never raw scores, so a cosine distance and a BM25
 *      score never have to be made commensurable:  score = Σ 1 / (k + rank_i).
 *   2. × the half-life decay weight the design-memory graph already computed
 *      (`memory-graph.ts`) — recent picks and insights outrank stale ones. We READ
 *      that weight; we never recompute it.
 *   3. × bi-temporal validity — a superseded item (a token rationale overwritten by
 *      a later change) is DEMOTED, never deleted, so it is only ever served when no
 *      current item matches.
 *
 * Zero imports, zero I/O: the whole file is a deterministic function of its inputs,
 * which is what makes it unit-testable without a model or a database.
 */

/** The RRF smoothing constant. 60 is the value from the original Cormack et al. paper. */
export const RRF_K = 60;

export interface RankInputs {
  /** Event ids ordered by dense-vector similarity, best first. */
  dense: readonly string[];
  /** Event ids ordered by BM25 relevance, best first. */
  lexical: readonly string[];
  /** id → decayed weight from the memory graph. Missing ids default to 1 (neutral). */
  decay?: ReadonlyMap<string, number>;
  /** ids whose knowledge has been superseded by a later event. */
  invalidated?: ReadonlySet<string>;
  /** RRF constant override (tests pin this). */
  k?: number;
}

export interface RankedItem {
  id: string;
  /** Fused score after decay. Higher is better. */
  score: number;
  /** True when the item is superseded — it sorts below every current item. */
  superseded: boolean;
}

/**
 * Reciprocal Rank Fusion over any number of ranked id lists.
 * An id absent from a list simply contributes nothing for that list.
 */
export function rrfScores(lists: readonly (readonly string[])[], k: number = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i] as string;
      // Ranks are 1-based: the best hit contributes 1/(k+1).
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    }
  }
  return scores;
}

/** Deterministic ordering: score desc, then id asc so equal scores never flap. */
function byScoreThenId(a: RankedItem, b: RankedItem): number {
  return b.score - a.score || a.id.localeCompare(b.id);
}

/**
 * Fuse the two retrieval lists into one ranking.
 *
 * Superseded items are returned, but always *after* every current item — so a caller
 * taking the top-k only ever sees stale knowledge when there is not enough current
 * knowledge to fill the window.
 */
export function fuse(input: RankInputs): RankedItem[] {
  const k = input.k ?? RRF_K;
  const decay = input.decay;
  const invalidated = input.invalidated;

  const fused = rrfScores([input.dense, input.lexical], k);

  const current: RankedItem[] = [];
  const superseded: RankedItem[] = [];
  for (const [id, rrf] of fused) {
    const weight = decay?.get(id) ?? 1;
    const item: RankedItem = { id, score: rrf * weight, superseded: invalidated?.has(id) === true };
    (item.superseded ? superseded : current).push(item);
  }

  current.sort(byScoreThenId);
  superseded.sort(byScoreThenId);
  return [...current, ...superseded];
}

/** Take the best `n` items (n <= 0 → empty). */
export function topK(items: readonly RankedItem[], n: number): RankedItem[] {
  return n > 0 ? items.slice(0, n) : [];
}

/** The rank-file payload `ui memory context --rank-file` consumes. */
export function toRankFile(items: readonly RankedItem[]): { id: string; score: number }[] {
  return items.map((i) => ({ id: i.id, score: i.score }));
}
