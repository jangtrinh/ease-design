// RecallStore — schema, upsert/replace semantics, KNN, BM25, supersession,
// deletion, and the model/dims mismatch guard. Runs WITHOUT any embedding
// model: vectors are hand-made 4-dim Float32Arrays so KNN order is predictable.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RecallStore, type RecallItem } from '../cli/src/store.ts';

const DIMS = 4;
const MODEL = 'test-model';

// Orthogonal unit vectors so cosine/L2 KNN order is unambiguous.
const X: Float32Array = Float32Array.from([1, 0, 0, 0]);
const Y: Float32Array = Float32Array.from([0, 1, 0, 0]);
const Z: Float32Array = Float32Array.from([0, 0, 1, 0]);
// Close to X but not identical, so it should rank between X and Y for a query at X.
const NEAR_X: Float32Array = Float32Array.from([0.9, 0.1, 0, 0]);

function item(overrides: Partial<RecallItem> = {}): RecallItem {
  return {
    id: 'e1',
    tier: 'episodic',
    text: 'the quick brown fox',
    refs: [],
    t: '2026-01-01T00:00:00.000Z',
    source: 'memory',
    ...overrides,
  };
}

const tmpDirs: string[] = [];
function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'recall-store-test-'));
  tmpDirs.push(dir);
  return join(dir, 'memory.vec.db');
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('RecallStore.open', () => {
  it('creates the schema and starts empty', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    expect(store.count()).toBe(0);
    store.close();
  });

  it('throws when reopening the same file with a different modelId', () => {
    const dbPath = tmpDbPath();
    const first = RecallStore.open(dbPath, DIMS, MODEL);
    first.close();
    expect(() => RecallStore.open(dbPath, DIMS, 'other-model')).toThrow();
  });

  it('throws when reopening the same file with different dims', () => {
    const dbPath = tmpDbPath();
    const first = RecallStore.open(dbPath, DIMS, MODEL);
    first.close();
    expect(() => RecallStore.open(dbPath, DIMS + 1, MODEL)).toThrow();
  });

  it('reopening with the SAME modelId and dims succeeds and preserves data', () => {
    const dbPath = tmpDbPath();
    const first = RecallStore.open(dbPath, DIMS, MODEL);
    first.upsert(item({ id: 'e1' }), X);
    first.close();

    const second = RecallStore.open(dbPath, DIMS, MODEL);
    expect(second.count()).toBe(1);
    second.close();
  });
});

describe('upsert + getItems', () => {
  it('round-trips refs, entity, and invalidatedBy', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(
      item({ id: 'e1', refs: ['a', 'b'], entity: 'token:color.primary', invalidatedBy: 'e2' }),
      X,
    );
    const got = store.getItems(['e1']);
    const got1 = got.get('e1');
    expect(got1).toBeDefined();
    expect(got1!.refs).toEqual(['a', 'b']);
    expect(got1!.entity).toBe('token:color.primary');
    expect(got1!.invalidatedBy).toBe('e2');
    store.close();
  });

  it('omits entity and invalidatedBy from the round-tripped item when absent', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1' }), X);
    const got = store.getItems(['e1']).get('e1')!;
    expect('entity' in got).toBe(false);
    expect('invalidatedBy' in got).toBe(false);
    store.close();
  });

  it('getItems returns an empty map for an empty id list', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    expect(store.getItems([]).size).toBe(0);
    store.close();
  });

  it('getItems skips ids that do not exist', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1' }), X);
    const got = store.getItems(['e1', 'nope']);
    expect(got.size).toBe(1);
    expect(got.has('nope')).toBe(false);
    store.close();
  });

  it('upserting the same id REPLACES rather than duplicates (count stays 1)', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', text: 'first version' }), X);
    store.upsert(item({ id: 'e1', text: 'second version' }), Y);
    expect(store.count()).toBe(1);
    const got = store.getItems(['e1']).get('e1')!;
    expect(got.text).toBe('second version');
    store.close();
  });
});

describe('knn', () => {
  it('returns nearest-first for a query vector', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'x' }), X);
    store.upsert(item({ id: 'near-x' }), NEAR_X);
    store.upsert(item({ id: 'y' }), Y);
    store.upsert(item({ id: 'z' }), Z);

    const ranked = store.knn(X, 4);
    expect(ranked[0]).toBe('x');
    expect(ranked[1]).toBe('near-x');
    expect(ranked.slice(2)).toEqual(expect.arrayContaining(['y', 'z']));
    store.close();
  });

  it('respects k, truncating the result', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'x' }), X);
    store.upsert(item({ id: 'y' }), Y);
    store.upsert(item({ id: 'z' }), Z);
    expect(store.knn(X, 1)).toEqual(['x']);
    store.close();
  });
});

describe('bm25', () => {
  it('finds a lexical term', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', text: 'the quick brown fox jumps' }), X);
    store.upsert(item({ id: 'e2', text: 'a completely unrelated sentence' }), Y);
    const hits = store.bm25('fox', 5);
    expect(hits).toContain('e1');
    expect(hits).not.toContain('e2');
    store.close();
  });

  it('returns [] for a query with no usable terms (single char)', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', text: 'the quick brown fox' }), X);
    expect(store.bm25('a', 5)).toEqual([]);
    store.close();
  });

  it('returns [] for a query that is punctuation only', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', text: 'the quick brown fox' }), X);
    expect(store.bm25('-*()[]', 5)).toEqual([]);
    store.close();
  });
});

describe('supersedeEntity + invalidatedIds', () => {
  it('marks earlier same-entity items and returns the changed count', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', entity: 'token:color.primary' }), X);
    store.upsert(item({ id: 'e2', entity: 'token:color.primary' }), Y);
    store.upsert(item({ id: 'e3', entity: 'token:color.secondary' }), Z);

    const changed = store.supersedeEntity('token:color.primary', 'e2');
    expect(changed).toBe(1);

    const e1 = store.getItems(['e1']).get('e1')!;
    expect(e1.invalidatedBy).toBe('e2');
    const e2 = store.getItems(['e2']).get('e2')!;
    expect(e2.invalidatedBy).toBeUndefined();
    store.close();
  });

  it('invalidatedIds reflects the supersession', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', entity: 'token:color.primary' }), X);
    store.upsert(item({ id: 'e2', entity: 'token:color.primary' }), Y);
    store.supersedeEntity('token:color.primary', 'e2');

    const invalidated = store.invalidatedIds();
    expect(invalidated.has('e1')).toBe(true);
    expect(invalidated.has('e2')).toBe(false);
    store.close();
  });

  it('does not re-supersede an already-invalidated item (WHERE invalidatedBy IS NULL)', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', entity: 'token:color.primary' }), X);
    store.upsert(item({ id: 'e2', entity: 'token:color.primary' }), Y);
    store.upsert(item({ id: 'e3', entity: 'token:color.primary' }), Z);

    // First call: e1 and e2 both still NULL and both != 'e2'... wait 'e2' is the
    // superseder itself (excluded by id != byId), so only e1 and e3 are candidates.
    expect(store.supersedeEntity('token:color.primary', 'e2')).toBe(2);

    // Second call: e1 already has invalidatedBy set (excluded by IS NULL); e2 is
    // still NULL (it was excluded from the first call only because it was the
    // superseder, not because it got invalidated) and now becomes a candidate.
    expect(store.supersedeEntity('token:color.primary', 'e3')).toBe(1);

    const e1 = store.getItems(['e1']).get('e1')!;
    const e2 = store.getItems(['e2']).get('e2')!;
    const e3 = store.getItems(['e3']).get('e3')!;
    // e1 and e3 were both candidates in call 1 (both != 'e2', both NULL) -> both
    // pinned to 'e2'. Call 2 only picks up e2 (still NULL after call 1, since it
    // was excluded from call 1 only for being the superseder itself, not for
    // already being invalidated). e3 is untouched by call 2 (it IS the superseder
    // this time, excluded by id != byId) and stays pinned to its FIRST superseder.
    expect(e1.invalidatedBy).toBe('e2');
    expect(e2.invalidatedBy).toBe('e3');
    expect(e3.invalidatedBy).toBe('e2');
    store.close();
  });
});

describe('deleteByEntity', () => {
  it('removes matching items from all three tables', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', entity: 'doc:foo.md', text: 'foo chunk one' }), X);
    store.upsert(item({ id: 'e2', entity: 'doc:foo.md', text: 'foo chunk two' }), Y);
    store.upsert(item({ id: 'e3', entity: 'doc:bar.md', text: 'bar chunk' }), Z);

    store.deleteByEntity('doc:foo.md');

    expect(store.count()).toBe(1);
    expect(store.getItems(['e1', 'e2']).size).toBe(0);
    expect(store.knn(X, 5)).not.toContain('e1');
    expect(store.knn(X, 5)).not.toContain('e2');
    expect(store.bm25('foo', 5)).toEqual([]);
    store.close();
  });

  it('leaves unrelated entities untouched', () => {
    const store = RecallStore.open(':memory:', DIMS, MODEL);
    store.upsert(item({ id: 'e1', entity: 'doc:foo.md' }), X);
    store.upsert(item({ id: 'e3', entity: 'doc:bar.md' }), Z);
    store.deleteByEntity('doc:foo.md');
    expect(store.getItems(['e3']).size).toBe(1);
    store.close();
  });
});
