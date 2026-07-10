/**
 * `recall index` — ORGANIZE. No LLM, no ranking: pull the corpus the binary emits,
 * embed it locally, and upsert it into the rebuildable vector view.
 *
 * Incremental by construction: the index header stores the last ledger event folded
 * in (per project, for the home index), so a second run embeds only what is new.
 * Supersession is applied as we go — a later rationale for the same token demotes the
 * earlier one rather than deleting it.
 */
import { embedAll, DIMS, MODEL_ID } from "./embed.ts";
import { fetchCorpus, maxEventId, entityOf } from "./corpus.ts";
import type { CorpusPayload } from "./corpus.ts";
import { knowledgeItems } from "./knowledge.ts";
import { RecallStore } from "./store.ts";
import type { RecallItem } from "./store.ts";
import { homeScope, projectScope, loadRegistry, namespacedId, cursorKey } from "./scope.ts";

export interface IndexOptions {
  project?: string;
  home: boolean;
  /** Absolute path to a `knowledge/` root to fold into the same index. */
  knowledge?: string;
  json: boolean;
}

export interface IndexReport {
  scope: "project" | "home";
  dbPath: string;
  memoryIndexed: number;
  knowledgeIndexed: number;
  superseded: number;
  lastIndexedId: string | null;
  total: number;
}

/** Embed + upsert a batch, returning how many supersessions it triggered. */
async function upsertItems(store: RecallStore, items: readonly RecallItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const vectors = await embedAll(items.map((i) => i.text));
  let superseded = 0;
  items.forEach((item, i) => {
    store.upsert(item, vectors[i] as Float32Array);
    // A later item about the same entity demotes every earlier one.
    if (item.entity !== undefined && item.source === "memory") {
      superseded += store.supersedeEntity(item.entity, item.id);
    }
  });
  return superseded;
}

/** Shape ledger payloads into store items, optionally namespacing for the home index. */
function toItems(payloads: readonly CorpusPayload[], project?: string): RecallItem[] {
  return payloads.map((p) => {
    const entity = entityOf(p);
    const id = project !== undefined ? namespacedId(project, p.id) : p.id;
    const item: RecallItem = { id, tier: p.tier, text: p.text, refs: p.refs, t: p.t, source: "memory" };
    if (entity !== undefined) item.entity = project !== undefined ? `${project}/${entity}` : entity;
    return item;
  });
}

export async function runIndex(opts: IndexOptions): Promise<IndexReport> {
  const scope = opts.home ? homeScope() : projectScope(opts.project);
  const store = RecallStore.open(scope.dbPath, DIMS, MODEL_ID);
  try {
    let memoryIndexed = 0;
    let superseded = 0;
    let lastId: string | null = store.lastIndexedId;

    if (scope.kind === "project") {
      const payloads = fetchCorpus(scope.projectDir, lastId);
      const items = toItems(payloads);
      superseded += await upsertItems(store, items);
      memoryIndexed += items.length;
      const max = maxEventId(payloads);
      if (max !== null) {
        store.setMeta("lastIndexedId", max);
        lastId = max;
      }
    } else {
      // The cross-project index folds in every registered project, each with its
      // own cursor so re-indexing stays incremental per ledger.
      for (const entry of loadRegistry()) {
        const since = store.getMeta(cursorKey(entry.name));
        const payloads = fetchCorpus(entry.path, since);
        const items = toItems(payloads, entry.name);
        superseded += await upsertItems(store, items);
        memoryIndexed += items.length;
        const max = maxEventId(payloads);
        if (max !== null) store.setMeta(cursorKey(entry.name), max);
      }
      lastId = null; // meaningless for a multi-ledger index; per-project cursors rule
    }

    // Knowledge chunks share the index so one query surfaces a rule AND an insight.
    let knowledgeIndexed = 0;
    if (opts.knowledge !== undefined) {
      const items = knowledgeItems(opts.knowledge);
      // Purge each doc's old chunks first so a shrunk file leaves no orphans.
      for (const entity of new Set(items.map((i) => i.entity as string))) store.deleteByEntity(entity);
      await upsertItems(store, items);
      knowledgeIndexed = items.length;
    }

    return {
      scope: scope.kind,
      dbPath: scope.dbPath,
      memoryIndexed,
      knowledgeIndexed,
      superseded,
      lastIndexedId: lastId,
      total: store.count(),
    };
  } finally {
    store.close();
  }
}

export function formatIndexReport(r: IndexReport): string {
  return [
    `recall index — ${r.scope} scope`,
    `  db:          ${r.dbPath}`,
    `  memory:      +${r.memoryIndexed} item(s)`,
    `  knowledge:   +${r.knowledgeIndexed} chunk(s)`,
    `  superseded:  ${r.superseded}`,
    `  lastEventId: ${r.lastIndexedId ?? "(per-project cursors)"}`,
    `  total:       ${r.total} indexed item(s)`,
    "",
  ].join("\n");
}
