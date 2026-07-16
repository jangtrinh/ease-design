// spec 005 P4 — panel honesty: the sync line may only claim what the kernel wrote.
//
// The bug this locks shut (the spec 004 gap event): a sync that landed NOTHING in the
// registry still read as "Synced ✓ — 21 changes". Every case below asks the same
// question — does the sentence count RECORDS CHANGED, or log events?
import { describe, it, expect } from 'vitest';
import {
  countsFromApplyReport,
  emptyCounts,
  landed,
  syncSummary,
  type AppliedCounts,
} from '../shared/figma-sync-summary.ts';
import { syncResultLabel } from '../plugin/src/ui/panel-model.ts';
import { applyResult } from '../cli/src/transport/figma-sync-apply.ts';

function counts(over: Partial<AppliedCounts> = {}): AppliedCounts {
  return { ...emptyCounts(), ...over };
}

describe('countsFromApplyReport', () => {
  it('reads the kernel report shape', () => {
    const c = countsFromApplyReport({
      added: ['Card/Compact'],
      updated: ['Button/Primary'],
      deprecated: [],
      mirrored: ['Card/Compact', 'Button/Primary'],
      pending: [{ name: 'X/Y', reason: 'r' }],
      skipped: [],
      mirrorSkipped: [{ name: 'A/B', reason: 'plugin down' }],
    });
    expect(c).toEqual({ added: 1, updated: 1, deprecated: 0, mirrored: 2, pending: 1, skipped: 0, mirrorSkipped: 1 });
  });

  it('survives any junk across the process boundary', () => {
    expect(countsFromApplyReport(undefined)).toEqual(emptyCounts());
    expect(countsFromApplyReport('nope')).toEqual(emptyCounts());
    expect(countsFromApplyReport({ added: 'three' })).toEqual(emptyCounts());
  });
});

describe('syncSummary', () => {
  it('names what landed', () => {
    expect(syncSummary(counts({ added: 1, mirrored: 3, deprecated: 1 }))).toBe('1 added, 1 deprecated, 3 mirrored');
  });

  it('refuses to call pending work synced work', () => {
    expect(syncSummary(counts({ pending: 21 }))).toBe('nothing landed — 21 pending re-ingest');
    expect(landed(counts({ pending: 21 }))).toBe(0);
  });

  it('always surfaces a degraded mirror', () => {
    expect(syncSummary(counts({ deprecated: 1, mirrorSkipped: 2 }))).toBe('1 deprecated (2 not mirrored)');
    expect(syncSummary(counts({ mirrorSkipped: 2 }))).toBe('nothing landed — 2 not mirrored');
  });

  it('an empty apply says so plainly', () => {
    expect(syncSummary(emptyCounts())).toBe('nothing to sync');
  });

  it('omits every zero — no "0 added" noise', () => {
    expect(syncSummary(counts({ updated: 2 }))).toBe('2 updated');
  });
});

describe('applyResult (broker → SYNC_RESULT)', () => {
  it('marks landed=false when the registry did not change', () => {
    const r = applyResult({ added: [], updated: [], deprecated: [], mirrored: [], pending: [{ name: 'A/B', reason: 'r' }], skipped: [], mirrorSkipped: [] });
    expect(r).toMatchObject({ ok: true, landed: false, summary: 'nothing landed — 1 pending re-ingest' });
  });

  it('marks landed=true and counts records, not events', () => {
    const r = applyResult({ added: ['C/D'], updated: [], deprecated: [], mirrored: ['C/D'], pending: [], skipped: [], mirrorSkipped: [] });
    expect(r).toMatchObject({ ok: true, landed: true, summary: '1 added, 1 mirrored' });
  });

  it('reports a batch-capped scan instead of hiding it', () => {
    const r = applyResult({ added: [], updated: ['A/B'], deprecated: [], mirrored: ['A/B'], pending: [], skipped: [], mirrorSkipped: [] }, 5);
    expect(r.summary).toBe('1 updated, 1 mirrored — 5 not scanned (batch cap)');
  });
});

describe('syncResultLabel (the panel line)', () => {
  it('says Synced only when something landed', () => {
    expect(syncResultLabel(true, '1 added, 1 mirrored', true)).toBe('Synced ✓ — 1 added, 1 mirrored');
  });

  it('does NOT say Synced when nothing landed — the 004 gap event', () => {
    expect(syncResultLabel(true, 'nothing landed — 21 pending re-ingest', false)).toBe(
      'Nothing synced — nothing landed — 21 pending re-ingest',
    );
  });

  it('a failure still reads as a failure', () => {
    expect(syncResultLabel(false, 'ui not runnable')).toBe('Sync failed — ui not runnable');
  });

  it('defaults to landed for an older broker that sends no flag', () => {
    expect(syncResultLabel(true, 'done')).toBe('Synced ✓ — done');
  });
});
