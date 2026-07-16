// The panel activity feed's pure model — what each row SAYS the plugin is doing.
// The contract under test: the CLI names the intent (RequestMsg.activity), the
// plugin derives the outcome from the reply it already has, and a reply lands on
// its own start-row by request id. Every claim here is one the panel makes to a
// human watching the plugin work, so a wrong one is a lie, not a cosmetic bug.
import { describe, it, expect } from 'vitest';
import {
  activityLabel, activityMeta, humanizeTool, formatClock, formatDuration, timeAgo,
  toActivityRecord, toActivityResult, pushActivity, resolveActivity,
  type ActivityRecord,
} from '../plugin/src/ui/activity-feed.ts';

const rec = (over: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: 'c_1', tool: 'EXEC_JS', pending: true, ok: true, ms: 0, at: 1_000, ...over,
});

describe('humanizeTool', () => {
  it('lowercases and de-snakes the wire command', () => {
    expect(humanizeTool('CREATE_FRAME')).toBe('create frame');
    expect(humanizeTool('HTML_TO_FIGMA')).toBe('html to figma');
    expect(humanizeTool('STATUS')).toBe('status');
  });
});

describe('activityLabel — the CLI names the intent, the cmd is only the fallback', () => {
  it('prefers the label the CLI sent', () => {
    expect(activityLabel(rec({ label: 'Mirror-verify · rebuild' }))).toBe('Mirror-verify · rebuild');
  });
  it('falls back to the humanized cmd when no label came (an older CLI)', () => {
    expect(activityLabel(rec({ tool: 'CREATE_FRAME' }))).toBe('create frame');
  });
  it('treats a blank/whitespace label as absent — never renders an empty row', () => {
    expect(activityLabel(rec({ tool: 'STATUS', label: '   ' }))).toBe('status');
  });
});

describe('formatClock / formatDuration / timeAgo', () => {
  it('formatClock is a zero-padded local HH:MM:SS', () => {
    const at = new Date(2026, 6, 16, 9, 5, 3).getTime();
    expect(formatClock(at)).toBe('09:05:03');
  });
  it('formatClock refuses to invent a time from a broken stamp', () => {
    expect(formatClock(Number.NaN)).toBe('--:--:--');
  });
  it('formatDuration is ms under a second, then 1-decimal seconds', () => {
    expect(formatDuration(12)).toBe('12ms');
    expect(formatDuration(1_250)).toBe('1.3s');
    expect(formatDuration(-1)).toBe('—');
  });
  it('timeAgo is relative to now', () => {
    const now = 1_000_000;
    expect(timeAgo(now, now)).toBe('just now');
    expect(timeAgo(now, now - 5_000)).toBe('5s ago');
    expect(timeAgo(now, now - 180_000)).toBe('3m ago');
    expect(timeAgo(now, now - 7_200_000)).toBe('2h ago');
  });
});

describe('activityMeta — the row FOOTNOTE: outcome + timing on one line, never the label', () => {
  it('folds outcome, duration and age into one sentence', () => {
    const r = rec({ at: 1_000, ms: 173, pending: false, result: '→ 42 nodes' });
    expect(activityMeta(r, 121_000)).toBe('→ 42 nodes · 173ms · 2m ago');
  });
  it('an in-flight row has no duration to report — it says so instead of "0ms"', () => {
    expect(activityMeta(rec({ at: 1_000 }), 1_000)).toBe('running… · just now');
  });
  it('a failure reads its own error, not a generic "failed"', () => {
    const r = rec({ at: 1_000, ms: 8, pending: false, ok: false, result: '✗ node not found' });
    expect(activityMeta(r, 4_000)).toBe('✗ node not found · 8ms · 3s ago');
  });
  it('a command with nothing countable to report still times itself', () => {
    expect(activityMeta(rec({ at: 1_000, ms: 40, pending: false }), 6_000)).toBe('40ms · 5s ago');
  });
  it('carries NO wall-clock stamp — the age already answers "when", and the stamp is what crowded out the label', () => {
    const meta = activityMeta(rec({ at: new Date(2026, 6, 16, 9, 5, 3).getTime(), ms: 5, pending: false }), Date.now());
    expect(meta).not.toContain('09:05:03');
  });
});

describe('toActivityRecord — defensive coercion of the start-event detail', () => {
  it('opens a PENDING row carrying the id + label', () => {
    expect(toActivityRecord({ phase: 'start', id: 'c_7', tool: 'EXEC_JS', label: 'Scan · 1:23', at: 500 }))
      .toEqual({ id: 'c_7', tool: 'EXEC_JS', label: 'Scan · 1:23', pending: true, ok: true, ms: 0, at: 500 });
  });
  it('rejects a missing/blank tool', () => {
    expect(toActivityRecord({ ok: true })).toBeNull();
    expect(toActivityRecord({ tool: '' })).toBeNull();
    expect(toActivityRecord(null)).toBeNull();
    expect(toActivityRecord('nope')).toBeNull();
  });
  it('BACKWARD-COMPAT: a detail with no label still opens a row (the cmd carries it)', () => {
    const r = toActivityRecord({ id: 'c_1', tool: 'STATUS', at: 500 });
    expect(r?.label).toBeUndefined();
    expect(activityLabel(r as ActivityRecord)).toBe('status');
  });
  it('synthesises an id and defaults `at` rather than dropping the row', () => {
    const r = toActivityRecord({ tool: 'X' });
    expect(r?.id).not.toBe('');
    expect(typeof r?.at).toBe('number');
  });
});

describe('toActivityResult — coercion of the done-event detail', () => {
  it('accepts a well-formed patch', () => {
    expect(toActivityResult({ phase: 'done', id: 'c_2', ok: true, ms: 40, result: '→ 3 nodes' }))
      .toEqual({ id: 'c_2', ok: true, ms: 40, result: '→ 3 nodes' });
  });
  it('rejects a patch with no id — it could not be landed on any row', () => {
    expect(toActivityResult({ ok: true, ms: 5 })).toBeNull();
    expect(toActivityResult({ id: '', ok: true })).toBeNull();
    expect(toActivityResult(null)).toBeNull();
  });
  it('coerces a bad ms and treats a non-true ok as failure', () => {
    expect(toActivityResult({ id: 'c_3', ms: -3 })).toEqual({ id: 'c_3', ok: false, ms: 0 });
  });
});

describe('pushActivity — newest-first, capped at 50', () => {
  const at = (n: number): ActivityRecord => rec({ id: `c_${n}`, tool: `T${n}`, at: n });
  it('prepends newest', () => {
    const buf = pushActivity(pushActivity([], at(1)), at(2));
    expect(buf.map((r) => r.tool)).toEqual(['T2', 'T1']);
  });
  it('never exceeds the cap and drops the oldest', () => {
    let buf: ActivityRecord[] = [];
    for (let i = 0; i < 60; i++) buf = pushActivity(buf, at(i));
    expect(buf).toHaveLength(50);
    expect(buf[0].tool).toBe('T59'); // newest kept
    expect(buf.at(-1)?.tool).toBe('T10'); // oldest 10 dropped
  });
});

describe('resolveActivity — a reply lands on ITS OWN row, by id', () => {
  it('closes the pending row and attaches the outcome', () => {
    const buf = pushActivity([], rec({ id: 'c_1', label: 'Scan · 1:23' }));
    const [row] = resolveActivity(buf, { id: 'c_1', ok: true, ms: 42, result: '→ 3 nodes' });
    expect(row).toMatchObject({ pending: false, ok: true, ms: 42, result: '→ 3 nodes', label: 'Scan · 1:23' });
  });
  it('matches by id, NOT by position — two commands can be in flight at once', () => {
    // The panel is shared by every CLI caller, so the newest row is not necessarily
    // the row a reply belongs to. Landing on position would credit the wrong request.
    let buf = pushActivity([], rec({ id: 'first', tool: 'A', at: 1 }));
    buf = pushActivity(buf, rec({ id: 'second', tool: 'B', at: 2 })); // newest, still running
    const out = resolveActivity(buf, { id: 'first', ok: true, ms: 10, result: '→ done' });
    expect(out.find((r) => r.id === 'first')).toMatchObject({ pending: false, result: '→ done' });
    expect(out.find((r) => r.id === 'second')).toMatchObject({ pending: true });
  });
  it('drops a reply whose row is gone (evicted by the cap) rather than rewriting another', () => {
    const buf = pushActivity([], rec({ id: 'alive' }));
    expect(resolveActivity(buf, { id: 'evicted', ok: false, ms: 1 })).toEqual(buf);
  });
  it('marks a failure without pretending it succeeded', () => {
    const buf = pushActivity([], rec({ id: 'c_1' }));
    const [row] = resolveActivity(buf, { id: 'c_1', ok: false, ms: 8, result: '✗ node not found' });
    expect(row).toMatchObject({ pending: false, ok: false, result: '✗ node not found' });
  });
});
