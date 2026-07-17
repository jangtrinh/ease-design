/**
 * Insight recurrence (ExpeL): an insight restated is an insight strengthened.
 *
 * Split out of `memory-graph.ts` to keep that module under the ~200-line cap
 * (Article IX); `compileGraph` calls `applyRecurrence` as a post-pass over the
 * insight entries it has already built, in place, before it sorts them.
 */
import type { InsightEntry } from "./memory-graph.js";

/** Cluster key for recurrence: an insight said twice in different words is two insights. */
export function insightKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.+$/, "");
}

/**
 * Clusters are exact-after-normalisation (see insightKey): the kernel never judges
 * two differently-worded lessons to be the same one — that is a model's call.
 * Mutates each entry's seen/upvotes/downvotes/lastSeenAt in place.
 */
export function applyRecurrence(insights: InsightEntry[], votes: readonly ("up" | "down")[]): void {
  const clusters = new Map<string, { seen: number; up: number; down: number; lastSeenAt: string }>();
  for (let i = 0; i < insights.length; i++) {
    const entry = insights[i] as InsightEntry;
    const key = insightKey(entry.text);
    const c = clusters.get(key) ?? { seen: 0, up: 0, down: 0, lastSeenAt: entry.t };
    c.seen += 1;
    if (votes[i] === "down") c.down += 1; else c.up += 1;
    if (Date.parse(entry.t) > Date.parse(c.lastSeenAt)) c.lastSeenAt = entry.t;
    clusters.set(key, c);
  }
  for (const entry of insights) {
    const c = clusters.get(insightKey(entry.text));
    if (c === undefined) continue;
    entry.seen = c.seen;
    entry.upvotes = Math.max(0, c.up - 1);
    entry.downvotes = c.down;
    entry.lastSeenAt = c.lastSeenAt;
  }
}
