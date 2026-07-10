/**
 * The recall index — a REBUILDABLE VIEW over the design-memory ledger.
 *
 * One SQLite file holds three coupled tables: a `sqlite-vec` vec0 table for dense
 * KNN, an FTS5 table for BM25, and a plain `items` table with the metadata both
 * ranks join back to. A `meta` header pins the model id + dimensions + the last
 * indexed event, which is what makes the index reproducible and incremental.
 *
 * Boundary invariant #2: the JSONL ledger is truth. Delete this file and
 * `recall index` rebuilds it exactly. Nothing here is a second source of truth.
 */
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Tier = "semantic" | "episodic" | "procedural";
export type Source = "memory" | "knowledge";

export interface RecallItem {
  id: string;
  tier: Tier;
  text: string;
  refs: string[];
  t: string;
  source: Source;
  /** Entity key used for dedupe + supersession (a token path, or a knowledge file). */
  entity?: string;
  /** Set when a later event supersedes this item's knowledge; demoted, never deleted. */
  invalidatedBy?: string;
}

export const SCHEMA_VERSION = "1";

/** Pack a float embedding the way vec0 expects it. */
export function packVector(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

export class RecallStore {
  private constructor(private readonly db: DatabaseSync) {}

  /** Open (creating if needed) an index file with the given embedding width. */
  static open(dbPath: string, dims: number, modelId: string): RecallStore {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath, { allowExtension: true });
    db.enableLoadExtension(true);
    sqliteVec.load(db);
    db.enableLoadExtension(false);

    db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.exec(`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY, tier TEXT NOT NULL, text TEXT NOT NULL, refs TEXT NOT NULL,
      t TEXT NOT NULL, source TEXT NOT NULL, entity TEXT, invalidatedBy TEXT)`);
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(id UNINDEXED, text)`);
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(id TEXT PRIMARY KEY, embedding float[${dims}])`);

    const store = new RecallStore(db);
    // Pin the header on first open; refuse to mix embeddings of different shape.
    const existingModel = store.getMeta("modelId");
    const existingDims = store.getMeta("dims");
    if (existingModel === null) {
      store.setMeta("modelId", modelId);
      store.setMeta("dims", String(dims));
      store.setMeta("schemaVersion", SCHEMA_VERSION);
    } else if (existingModel !== modelId || existingDims !== String(dims)) {
      db.close();
      throw new Error(
        `index was built with model '${existingModel}' (${existingDims}d); refusing to mix with '${modelId}' (${dims}d). Delete the index and re-run 'recall index'.`,
      );
    }
    return store;
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare(`INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
  }

  /** The highest ledger event id folded into this index, or null on a cold index. */
  get lastIndexedId(): string | null {
    return this.getMeta("lastIndexedId");
  }

  /** Insert-or-replace one item across all three tables. */
  upsert(item: RecallItem, embedding: Float32Array): void {
    this.db.prepare(`DELETE FROM items WHERE id = ?`).run(item.id);
    this.db.prepare(`DELETE FROM fts WHERE id = ?`).run(item.id);
    this.db.prepare(`DELETE FROM vec_items WHERE id = ?`).run(item.id);

    this.db
      .prepare(`INSERT INTO items(id,tier,text,refs,t,source,entity,invalidatedBy) VALUES(?,?,?,?,?,?,?,?)`)
      .run(item.id, item.tier, item.text, JSON.stringify(item.refs), item.t, item.source,
        item.entity ?? null, item.invalidatedBy ?? null);
    this.db.prepare(`INSERT INTO fts(id,text) VALUES(?,?)`).run(item.id, item.text);
    this.db.prepare(`INSERT INTO vec_items(id,embedding) VALUES(?,?)`).run(item.id, packVector(embedding));
  }

  /** Hard-remove every item for an entity (used to purge a re-chunked knowledge doc). */
  deleteByEntity(entity: string): void {
    const rows = this.db.prepare(`SELECT id FROM items WHERE entity = ?`).all(entity) as { id: string }[];
    for (const { id } of rows) {
      this.db.prepare(`DELETE FROM items WHERE id = ?`).run(id);
      this.db.prepare(`DELETE FROM fts WHERE id = ?`).run(id);
      this.db.prepare(`DELETE FROM vec_items WHERE id = ?`).run(id);
    }
  }

  /** Demote every earlier item sharing this entity — supersession, not deletion. */
  supersedeEntity(entity: string, byId: string): number {
    const res = this.db
      .prepare(`UPDATE items SET invalidatedBy = ? WHERE entity = ? AND id != ? AND invalidatedBy IS NULL`)
      .run(byId, entity, byId);
    return Number(res.changes);
  }

  /** Dense KNN. Returns ids best-first. */
  knn(query: Float32Array, k: number): string[] {
    const rows = this.db
      .prepare(`SELECT id FROM vec_items WHERE embedding MATCH ? ORDER BY distance LIMIT ?`)
      .all(packVector(query), k) as { id: string }[];
    return rows.map((r) => r.id);
  }

  /** BM25 lexical search. Returns ids best-first ([] when the query has no usable terms). */
  bm25(query: string, k: number): string[] {
    const terms = query.replace(/["'*^:(){}[\]-]+/g, " ").split(/\s+/).filter((w) => w.length > 1);
    if (terms.length === 0) return [];
    const match = terms.join(" OR ");
    try {
      const rows = this.db
        .prepare(`SELECT id FROM fts WHERE fts MATCH ? ORDER BY bm25(fts) LIMIT ?`)
        .all(match, k) as { id: string }[];
      return rows.map((r) => r.id);
    } catch {
      return []; // a malformed FTS expression must never break retrieval
    }
  }

  getItems(ids: readonly string[]): Map<string, RecallItem> {
    const out = new Map<string, RecallItem>();
    if (ids.length === 0) return out;
    const stmt = this.db.prepare(`SELECT * FROM items WHERE id = ?`);
    for (const id of ids) {
      const r = stmt.get(id) as (Omit<RecallItem, "refs"> & { refs: string; invalidatedBy: string | null; entity: string | null }) | undefined;
      if (r === undefined) continue;
      out.set(id, {
        id: r.id, tier: r.tier, text: r.text, t: r.t, source: r.source,
        refs: JSON.parse(r.refs) as string[],
        ...(r.entity !== null ? { entity: r.entity } : {}),
        ...(r.invalidatedBy !== null ? { invalidatedBy: r.invalidatedBy } : {}),
      });
    }
    return out;
  }

  /** Every superseded id — the demotion set the ranker consumes. */
  invalidatedIds(): Set<string> {
    const rows = this.db.prepare(`SELECT id FROM items WHERE invalidatedBy IS NOT NULL`).all() as { id: string }[];
    return new Set(rows.map((r) => r.id));
  }

  count(): number {
    const row = this.db.prepare(`SELECT count(*) AS n FROM items`).get() as { n: number };
    return Number(row.n);
  }

  close(): void {
    this.db.close();
  }
}
