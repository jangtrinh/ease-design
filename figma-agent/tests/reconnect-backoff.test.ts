// P1 stability — the plugin's persistent-reconnect backoff (shared pure fn).
// nextBackoff must grow deterministically min→max and add bounded jitter from an
// INJECTED rand, so a fleet of plugins never reconnect in lockstep yet the
// sequence is unit-testable without timers.
import { describe, it, expect } from 'vitest';
import {
  nextBackoff, RECONNECT_BACKOFF_MAX_MS, RECONNECT_BACKOFF_MIN_MS,
} from '../shared/protocol.ts';

const OPTS = { minMs: RECONNECT_BACKOFF_MIN_MS, maxMs: RECONNECT_BACKOFF_MAX_MS };

describe('nextBackoff — deterministic base growth', () => {
  it('climbs min→×2→cap and holds at the cap (rand=0 ⇒ no jitter)', () => {
    const zero = () => 0;
    const bases: number[] = [];
    let base = 0; // fresh disconnect
    for (let i = 0; i < 7; i++) {
      const step = nextBackoff(base, OPTS, zero);
      bases.push(step.base);
      expect(step.delay).toBe(step.base); // rand=0 ⇒ delay == base
      base = step.base;
    }
    expect(bases).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('resets to the minimum when prevBase is 0 (post-connect reset)', () => {
    expect(nextBackoff(0, OPTS, () => 0).base).toBe(RECONNECT_BACKOFF_MIN_MS);
  });
});

describe('nextBackoff — jitter is bounded by the injected rand', () => {
  it('adds up to jitter·base and never below base', () => {
    for (const base of [500, 1000, 8000]) {
      const lo = nextBackoff(base, OPTS, () => 0).delay;
      const hi = nextBackoff(base, OPTS, () => 1).delay;
      const next = Math.min(base * 2, RECONNECT_BACKOFF_MAX_MS);
      expect(lo).toBe(next); // no jitter
      expect(hi).toBe(Math.round(next * 1.25)); // full 25% jitter
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it('honours a custom jitter fraction', () => {
    const step = nextBackoff(1000, { ...OPTS, jitter: 0.5 }, () => 1);
    expect(step.delay).toBe(Math.round(2000 * 1.5)); // base 2000 + 50%
  });
});
