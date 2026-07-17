/**
 * Half-life decay for recalled items (Track 9 · P3c, signal 2).
 *
 * DEVIATION FROM PLAN (recorded deliberately): the plan says "multiply by the graph's
 * existing decayed weight … read it, don't recompute". `memory.graph.json` stores
 * *aggregate* weights keyed by persona / axis / vibe / token — there is no per-event
 * weight to read. So a per-item weight is derived from the item's own timestamp using
 * the SAME half-life the graph uses (30 days), which keeps the two consistent without
 * the recall workspace importing anything from the binary.
 *
 * Pure: a function of (timestamp, now). No I/O.
 */

/** Same constant as `memory-graph.ts`. A 30-day-old item weighs half a fresh one. */
export const HALF_LIFE_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * `0.5 ^ (ageDays / halfLife)`, clamped to (0, 1].
 *
 * Timeless items (knowledge chunks carry an empty `t`) and unparseable timestamps
 * weigh 1 — they rank on relevance alone rather than being silently buried. A
 * timestamp in the future also weighs 1 rather than exceeding it.
 */
export function decayWeight(t: string, nowIso: string, halfLifeDays: number = HALF_LIFE_DAYS): number {
  if (t.length === 0) return 1;
  const then = Date.parse(t);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return 1;
  const ageDays = (now - then) / MS_PER_DAY;
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * The clock a lesson decays against: the last time it was SERVED, falling back to when
 * it was written (Oblivion — a lesson nobody re-queries fades even if freshly written;
 * one that is used stays sharp). A timeless item ("" — knowledge chunks, knowledge.ts:18)
 * stays timeless: decayWeight("") is 1 and must not start ticking on first retrieval.
 */
export function effectiveTimestamp(item: { t: string; lastRetrievedAt?: string }): string {
  if (item.t.length === 0) return "";
  return item.lastRetrievedAt ?? item.t;
}

/** Build the id → weight map the ranker multiplies by. */
export function decayWeights(
  items: readonly { id: string; t: string; lastRetrievedAt?: string }[],
  nowIso: string,
  halfLifeDays: number = HALF_LIFE_DAYS,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.id, decayWeight(effectiveTimestamp(it), nowIso, halfLifeDays));
  return m;
}
