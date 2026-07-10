// Hybrid ranking (RRF fusion + decay + bi-temporal validity) — unit tests
// for the pure, zero-import module `recall/cli/src/rank.ts`.
import { describe, it, expect } from 'vitest';
import { RRF_K, rrfScores, fuse, topK, toRankFile, type RankedItem } from '../cli/src/rank.ts';

describe('rrfScores', () => {
  it('orders a single list by rank, best first', () => {
    const scores = rrfScores([['a', 'b', 'c']]);
    expect(scores.get('a')!).toBeGreaterThan(scores.get('b')!);
    expect(scores.get('b')!).toBeGreaterThan(scores.get('c')!);
  });

  it('gives the top hit of a list exactly 1/(k+1)', () => {
    const scores = rrfScores([['a', 'b']]);
    expect(scores.get('a')!).toBeCloseTo(1 / (RRF_K + 1), 12);
  });

  it('sums contributions for an id present in multiple lists, outranking a single-list top hit', () => {
    // b is rank-2 in dense, rank-1 in lexical -> its summed score beats a,
    // which is rank-1 in dense only (same raw top-of-list score as b's lexical contribution).
    const dense = ['a', 'b'];
    const lexical = ['b', 'c'];
    const scores = rrfScores([dense, lexical]);
    const a = scores.get('a')!;
    const b = scores.get('b')!;
    const c = scores.get('c')!;
    expect(b).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 12);
    expect(a).toBeCloseTo(1 / (RRF_K + 1), 12);
    expect(c).toBeCloseTo(1 / (RRF_K + 2), 12);
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(c);
  });

  it('returns an empty map for no lists', () => {
    const scores = rrfScores([]);
    expect(scores.size).toBe(0);
  });

  it('returns an empty map when all lists are empty', () => {
    const scores = rrfScores([[], []]);
    expect(scores.size).toBe(0);
  });

  it('respects a custom k, changing the resulting scores', () => {
    const defaultScores = rrfScores([['a']]);
    const customScores = rrfScores([['a']], 10);
    expect(defaultScores.get('a')!).toBeCloseTo(1 / (RRF_K + 1), 12);
    expect(customScores.get('a')!).toBeCloseTo(1 / 11, 12);
    expect(customScores.get('a')!).not.toBeCloseTo(defaultScores.get('a')!, 6);
  });

  it('k=0 collapses the top hit score to exactly 1', () => {
    const scores = rrfScores([['a']], 0);
    expect(scores.get('a')!).toBeCloseTo(1, 12);
  });

  it('accumulates a duplicate id occurring twice inside one list', () => {
    const scores = rrfScores([['a', 'a']]);
    expect(scores.get('a')!).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2), 12);
  });
});

describe('fuse', () => {
  it('ranks dense-only input by dense rank', () => {
    const result = fuse({ dense: ['a', 'b'], lexical: [] });
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.every((r) => !r.superseded)).toBe(true);
  });

  it('ranks lexical-only input by lexical rank', () => {
    const result = fuse({ dense: [], lexical: ['x', 'y'] });
    expect(result.map((r) => r.id)).toEqual(['x', 'y']);
    expect(result.every((r) => !r.superseded)).toBe(true);
  });

  it('fuses overlapping dense/lexical lists by summed RRF score', () => {
    // b: rank-2 dense + rank-1 lexical; a: rank-1 dense only; c: rank-2 lexical only.
    const result = fuse({ dense: ['a', 'b'], lexical: ['b', 'c'] });
    expect(result.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('multiplies score by decay: 0.5 decay falls below an equal-RRF id with decay 1', () => {
    // x and y are both rank-1 in their own single list -> equal raw RRF score.
    const result = fuse({
      dense: ['x'],
      lexical: ['y'],
      decay: new Map([['x', 0.5]]),
    });
    const x = result.find((r) => r.id === 'x')!;
    const y = result.find((r) => r.id === 'y')!;
    expect(x.score).toBeCloseTo((1 / (RRF_K + 1)) * 0.5, 12);
    expect(y.score).toBeCloseTo(1 / (RRF_K + 1), 12);
    expect(result.map((r) => r.id)).toEqual(['y', 'x']);
  });

  it('defaults missing decay to 1 (neutral, unaffected)', () => {
    const result = fuse({
      dense: ['x'],
      lexical: ['y'],
      decay: new Map([['x', 0.5]]),
    });
    const y = result.find((r) => r.id === 'y')!;
    expect(y.score).toBeCloseTo(1 / (RRF_K + 1), 12);
  });

  it('decay of 0 sinks an item to score 0 but it is still returned', () => {
    const result = fuse({ dense: ['x'], lexical: [], decay: new Map([['x', 0]]) });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('x');
    expect(result[0]!.score).toBeCloseTo(0, 12);
    expect(result[0]!.superseded).toBe(false);
  });

  it('breaks ties by ascending id when RRF scores are exactly equal', () => {
    // a and b are both rank-1 in disjoint single lists -> identical scores.
    const result = fuse({ dense: ['b'], lexical: ['a'] });
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result[0]!.score).toBeCloseTo(result[1]!.score, 12);
  });

  it('demotes a superseded item below every current item even with a huge score', () => {
    // s is rank-1 in BOTH lists (huge summed score); c is rank-2 dense only (tiny score).
    const result = fuse({
      dense: ['s', 'c'],
      lexical: ['s'],
      invalidated: new Set(['s']),
    });
    expect(result.map((r) => r.id)).toEqual(['c', 's']);
    const c = result.find((r) => r.id === 'c')!;
    const s = result.find((r) => r.id === 's')!;
    expect(s.score).toBeGreaterThan(c.score);
    expect(c.superseded).toBe(false);
    expect(s.superseded).toBe(true);
  });

  it('orders multiple superseded items among themselves by score desc', () => {
    const result = fuse({
      dense: ['s1', 's2', 'c'],
      lexical: [],
      invalidated: new Set(['s1', 's2']),
    });
    expect(result.map((r) => r.id)).toEqual(['c', 's1', 's2']);
    expect(result[1]!.superseded).toBe(true);
    expect(result[2]!.superseded).toBe(true);
  });

  it('still returns all items in score order when every item is superseded', () => {
    const result = fuse({
      dense: ['a', 'b'],
      lexical: [],
      invalidated: new Set(['a', 'b']),
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.every((r) => r.superseded)).toBe(true);
  });

  it('marks nothing superseded when invalidated is an empty set', () => {
    const result = fuse({ dense: ['a', 'b'], lexical: [], invalidated: new Set() });
    expect(result.every((r) => !r.superseded)).toBe(true);
  });

  it('marks nothing superseded when invalidated is omitted', () => {
    const result = fuse({ dense: ['a', 'b'], lexical: ['c'] });
    expect(result.every((r) => !r.superseded)).toBe(true);
  });

  it('is deterministic: calling fuse twice on the same input yields identical arrays', () => {
    const input = {
      dense: ['a', 'b', 'c'],
      lexical: ['b', 'd'],
      decay: new Map([['a', 0.5], ['d', 2]]),
      invalidated: new Set(['c']),
    };
    const first = fuse(input);
    const second = fuse(input);
    expect(second).toEqual(first);
  });
});

describe('topK', () => {
  const items: RankedItem[] = [
    { id: 'a', score: 3, superseded: false },
    { id: 'b', score: 2, superseded: false },
    { id: 'c', score: 1, superseded: false },
  ];

  it('returns all items when n is larger than the list length', () => {
    expect(topK(items, 10)).toEqual(items);
  });

  it('returns an empty array when n is 0', () => {
    expect(topK(items, 0)).toEqual([]);
  });

  it('returns an empty array when n is negative', () => {
    expect(topK(items, -5)).toEqual([]);
  });

  it('returns exactly the first n items in order', () => {
    expect(topK(items, 2).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('toRankFile', () => {
  it('preserves shape and order', () => {
    const items: RankedItem[] = [
      { id: 'b', score: 0.5, superseded: false },
      { id: 'a', score: 0.2, superseded: true },
    ];
    expect(toRankFile(items)).toEqual([
      { id: 'b', score: 0.5 },
      { id: 'a', score: 0.2 },
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(toRankFile([])).toEqual([]);
  });
});
