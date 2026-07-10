// decay.ts is pure — no I/O, no model. Fixed reference instants so the tests
// never flake against the real clock.
import { describe, it, expect } from 'vitest';
import { HALF_LIFE_DAYS, decayWeight, decayWeights } from '../cli/src/decay.ts';

const NOW = '2026-07-10T00:00:00.000Z';

function daysBefore(nowIso: string, days: number): string {
  const ms = Date.parse(nowIso) - days * 86_400_000;
  return new Date(ms).toISOString();
}

describe('decayWeight', () => {
  it('empty t weighs 1 (timeless knowledge chunks)', () => {
    expect(decayWeight('', NOW)).toBe(1);
  });

  it('unparseable t weighs 1', () => {
    expect(decayWeight('not-a-date', NOW)).toBe(1);
  });

  it('a future timestamp weighs 1 rather than exceeding it', () => {
    const future = daysBefore(NOW, -10); // 10 days after NOW
    expect(decayWeight(future, NOW)).toBe(1);
  });

  it('exactly one half-life old weighs 0.5', () => {
    const t = daysBefore(NOW, HALF_LIFE_DAYS);
    expect(decayWeight(t, NOW)).toBeCloseTo(0.5, 10);
  });

  it('exactly two half-lives old weighs 0.25', () => {
    const t = daysBefore(NOW, HALF_LIFE_DAYS * 2);
    expect(decayWeight(t, NOW)).toBeCloseTo(0.25, 10);
  });

  it('an item exactly at NOW weighs 1 (ageDays <= 0 short-circuit)', () => {
    expect(decayWeight(NOW, NOW)).toBe(1);
  });

  it('respects a custom half-life', () => {
    const t = daysBefore(NOW, 10);
    expect(decayWeight(t, NOW, 10)).toBeCloseTo(0.5, 10);
  });

  it('also honours an unparseable nowIso by weighing 1', () => {
    expect(decayWeight('2026-01-01T00:00:00.000Z', 'not-a-date')).toBe(1);
  });
});

describe('decayWeights', () => {
  it('builds an id -> weight map, one entry per item', () => {
    const items = [
      { id: 'a', t: '' },
      { id: 'b', t: daysBefore(NOW, HALF_LIFE_DAYS) },
    ];
    const m = decayWeights(items, NOW);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBe(1);
    expect(m.get('b')).toBeCloseTo(0.5, 10);
  });

  it('returns an empty map for an empty item list', () => {
    expect(decayWeights([], NOW).size).toBe(0);
  });

  it('propagates a custom halfLifeDays to every entry', () => {
    const items = [{ id: 'a', t: daysBefore(NOW, 10) }];
    const m = decayWeights(items, NOW, 10);
    expect(m.get('a')).toBeCloseTo(0.5, 10);
  });
});
