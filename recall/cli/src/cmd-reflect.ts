/**
 * `recall reflect` — the REFLECT edge (Track 9 · P4).
 *
 * recall does NOT think. It assembles the material a reflection needs — the job's own
 * events plus their semantic neighbours from everything the project learned before —
 * and hands back the exact write-back command. The **host model running the job** is
 * the reflector: it has the brief, the curator verdict and the iterate rounds in
 * context, which is precisely what "what was LEARNED, not what was said" requires.
 *
 * Boundary invariant #3 holds: the lesson re-enters the ledger only through
 * `ui memory record insight --refs <provenance>`, never by writing the ledger here.
 *
 * Order matters: run `recall index` first (ORGANIZE) so the job's own events are
 * embedded; then `recall reflect` (REFLECT).
 */
import { readFileSync } from "node:fs";

import { embedOne, DIMS, MODEL_ID } from "./embed.ts";
import { RecallStore } from "./store.ts";
import type { RecallItem } from "./store.ts";
import { decayWeights } from "./decay.ts";
import { fuse, topK } from "./rank.ts";
import { projectScope } from "./scope.ts";

const CANDIDATE_FACTOR = 4;
/** Cap the synthetic query so one long insight cannot swamp the embedding. */
const QUERY_CHARS = 2000;

export interface ReflectOptions {
  project?: string;
  k: number;
  json: boolean;
  now?: string;
}

export interface ReflectNeighbor {
  id: string;
  score: number;
  superseded: boolean;
  tier: RecallItem["tier"];
  source: RecallItem["source"];
  text: string;
}

export interface ReflectPacket {
  jobEventIds: string[];
  /** Job events that are present in the index. */
  jobItems: { id: string; tier: RecallItem["tier"]; text: string; t: string }[];
  /** Job ids the index has never seen — run `recall index` first. */
  missing: string[];
  neighbors: ReflectNeighbor[];
  instruction: string;
  writeBack: string;
}

/**
 * Accept `["e1","e2"]`, `{"events":["e1"]}` or `[{"id":"e1"}]` — whatever the workflow
 * finds convenient to write. Anything else fails loud.
 */
export function parseJobEvents(raw: unknown): string[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)
      ? ((raw as { events: unknown[] }).events)
      : null;
  if (arr === null) throw new Error('job-events file must be a JSON array of event ids, or {"events":[…]}');

  const ids: string[] = [];
  for (const entry of arr) {
    if (typeof entry === "string") ids.push(entry);
    else if (entry !== null && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string") {
      ids.push((entry as { id: string }).id);
    } else throw new Error('job-events entries must be event ids ("e12") or objects with an "id" field');
  }
  if (ids.length === 0) throw new Error("job-events file lists no event ids");
  return ids;
}

/** The exact command the host model runs once it has written the lesson. */
export function buildWriteBack(jobEventIds: readonly string[], projectDir: string): string {
  return (
    `ui memory record insight --data '{"text":"<THE ONE DURABLE LESSON>"}' ` +
    `--refs ${jobEventIds.join(",")} --dir ${projectDir}`
  );
}

const INSTRUCTION = [
  "Extract exactly ONE durable lesson from this job — Reflexion style: what was LEARNED, not what was said.",
  "It must generalise beyond this job ('dense tables need a sticky header + zebra rows or scannability tanks'),",
  "not restate an event ('changed color.primary'). If the job taught nothing durable, record nothing.",
  "Then run the write-back command below, replacing the placeholder with your lesson.",
].join("\n");

export async function runReflect(jobEventsPath: string, opts: ReflectOptions): Promise<ReflectPacket> {
  const raw = readFileSync(jobEventsPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`job-events file '${jobEventsPath}' is not valid JSON`);
  }
  const jobEventIds = parseJobEvents(parsed);

  const scope = projectScope(opts.project);
  const store = RecallStore.open(scope.dbPath, DIMS, MODEL_ID);
  try {
    const nowIso = opts.now ?? new Date().toISOString();
    const jobMap = store.getItems(jobEventIds);
    const missing = jobEventIds.filter((id) => !jobMap.has(id));
    const jobItems = jobEventIds
      .flatMap((id) => {
        const it = jobMap.get(id);
        return it === undefined ? [] : [{ id: it.id, tier: it.tier, text: it.text, t: it.t }];
      });

    // The job itself is the query: what did we just do, and what does memory say about it?
    const query = jobItems.map((i) => i.text).join(" ").slice(0, QUERY_CHARS);
    let neighbors: ReflectNeighbor[] = [];
    if (query.length > 0) {
      const candidates = Math.max(opts.k * CANDIDATE_FACTOR, opts.k) + jobEventIds.length;
      const qv = await embedOne(query);
      const own = new Set(jobEventIds);
      const dense = store.knn(qv, candidates).filter((id) => !own.has(id));
      const lexical = store.bm25(query, candidates).filter((id) => !own.has(id));
      const items = store.getItems([...new Set([...dense, ...lexical])]);
      const ranked = fuse({
        dense,
        lexical,
        decay: decayWeights([...items.values()], nowIso),
        invalidated: store.invalidatedIds(),
      });
      neighbors = topK(ranked, opts.k).flatMap((r) => {
        const it = items.get(r.id);
        return it === undefined ? [] : [{ ...r, tier: it.tier, source: it.source, text: it.text }];
      });
    }

    return {
      jobEventIds,
      jobItems,
      missing,
      neighbors,
      instruction: INSTRUCTION,
      writeBack: buildWriteBack(jobEventIds, scope.projectDir as string),
    };
  } finally {
    store.close();
  }
}

export function formatReflect(p: ReflectPacket): string {
  const lines = ["[REFLECT PACKET]", ""];
  if (p.missing.length > 0) {
    lines.push(`! ${p.missing.length} job event(s) are not indexed (${p.missing.join(", ")}) — run 'recall index' first.`, "");
  }
  lines.push("This job's events:");
  if (p.jobItems.length === 0) lines.push("  (none indexed)");
  for (const i of p.jobItems) lines.push(`  - [${i.id}] (${i.tier}) ${i.text}`);

  lines.push("", "What memory already knows that is relevant:");
  if (p.neighbors.length === 0) lines.push("  (nothing yet — this project's memory is cold)");
  for (const n of p.neighbors) {
    const flags = [n.source, n.tier, ...(n.superseded ? ["superseded"] : [])].join("/");
    lines.push(`  - [${n.id}] (${flags}) ${n.text.replace(/\s+/g, " ").slice(0, 200)}`);
  }

  lines.push("", p.instruction, "", "Write-back:", `  ${p.writeBack}`, "");
  return lines.join("\n");
}
