// P2 panel view-model — the pure layer under the DOM controller (panel-ui.ts).
// Everything the panel decides (which pill/tone/sentence per state, how ages and
// durations format, the activity ring buffer, onboarding + troubleshoot gating)
// lives here so it is unit-testable without a DOM, mirroring the connection-state
// machine's own pure tests.
import { describe, it, expect } from 'vitest';
import {
  stateView, formatAge, formatDuration, timeAgo, humanizeTool,
  toActivityRecord, pushActivity, troubleshootHint, showOnboarding,
  togglePanelMode, detailsLabel, compactMeta, PANEL_WIDTH, PANEL_HEIGHT,
  syncPromptLabel, syncResultLabel,
  type ActivityRecord,
} from '../plugin/src/ui/panel-model.ts';
import type { ConnectionState } from '../shared/protocol.ts';

describe('stateView — the four P1 states each map to one view', () => {
  it('connected is a success pill with the ready sentence, no pulse', () => {
    const v = stateView('connected');
    expect(v).toEqual({ pill: 'Connected', tone: 'success', pulse: false, sentence: 'Ready — the CLI can drive this file.' });
  });
  it('probing is a warning pill that pulses (reduced-motion-guarded in CSS)', () => {
    const v = stateView('probing');
    expect(v.tone).toBe('warning');
    expect(v.pulse).toBe(true);
    expect(v.pill).toContain('Looking for broker');
  });
  it('handshake is an info pill, still', () => {
    expect(stateView('handshake')).toMatchObject({ tone: 'info', pulse: false });
  });
  it('disconnected is MUTED, not red — the normal wait — with the auto-start sentence', () => {
    const v = stateView('disconnected');
    expect(v.tone).toBe('muted');
    expect(v.sentence).toBe('The broker starts automatically on your first CLI command.');
  });
  it('covers every ConnectionState', () => {
    for (const s of ['connected', 'probing', 'handshake', 'disconnected'] as ConnectionState[]) {
      expect(stateView(s).pill.length).toBeGreaterThan(0);
    }
  });
});

describe('formatAge / formatDuration / timeAgo', () => {
  it('formatAge steps just-now → seconds → minutes → hours', () => {
    expect(formatAge(0)).toBe('just now');
    expect(formatAge(8_000)).toBe('8s');
    expect(formatAge(125_000)).toBe('2m 05s');
    expect(formatAge(3_780_000)).toBe('1h 03m');
    expect(formatAge(-5)).toBe('—');
    expect(formatAge(Number.NaN)).toBe('—');
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

describe('humanizeTool', () => {
  it('lowercases and de-snakes the wire command', () => {
    expect(humanizeTool('CREATE_FRAME')).toBe('create frame');
    expect(humanizeTool('HTML_TO_FIGMA')).toBe('html to figma');
    expect(humanizeTool('STATUS')).toBe('status');
  });
});

describe('toActivityRecord — defensive coercion of the CustomEvent detail', () => {
  it('accepts a well-formed detail', () => {
    expect(toActivityRecord({ tool: 'STATUS', ok: true, ms: 12, at: 500 }))
      .toEqual({ tool: 'STATUS', ok: true, ms: 12, at: 500 });
  });
  it('rejects a missing/blank tool', () => {
    expect(toActivityRecord({ ok: true })).toBeNull();
    expect(toActivityRecord({ tool: '' })).toBeNull();
    expect(toActivityRecord(null)).toBeNull();
    expect(toActivityRecord('nope')).toBeNull();
  });
  it('coerces bad ms/ok and defaults at', () => {
    const r = toActivityRecord({ tool: 'X', ms: -3 });
    expect(r).not.toBeNull();
    expect(r?.ok).toBe(false);
    expect(r?.ms).toBe(0);
    expect(typeof r?.at).toBe('number');
  });
});

describe('pushActivity — newest-first, capped at 50', () => {
  const rec = (n: number): ActivityRecord => ({ tool: `T${n}`, ok: true, ms: n, at: n });
  it('prepends newest', () => {
    const buf = pushActivity(pushActivity([], rec(1)), rec(2));
    expect(buf.map((r) => r.tool)).toEqual(['T2', 'T1']);
  });
  it('never exceeds the cap and drops the oldest', () => {
    let buf: ActivityRecord[] = [];
    for (let i = 0; i < 60; i++) buf = pushActivity(buf, rec(i));
    expect(buf).toHaveLength(50);
    expect(buf[0].tool).toBe('T59'); // newest kept
    expect(buf.at(-1)?.tool).toBe('T10'); // oldest 10 dropped
  });
});

describe('troubleshootHint (spec §6)', () => {
  it('nudges toward `figma-agent status` after 10s of probing', () => {
    expect(troubleshootHint('probing', 9_000, false)).toBeNull();
    expect(troubleshootHint('probing', 10_000, false)).toContain('figma-agent status');
  });
  it('says "retrying" only after a real drop (was connected), not on first-run wait', () => {
    expect(troubleshootHint('disconnected', 0, false)).toBeNull();
    expect(troubleshootHint('disconnected', 0, true)).toContain('retrying');
  });
  it('is silent when connected', () => {
    expect(troubleshootHint('connected', 999_999, true)).toBeNull();
  });
});

describe('showOnboarding — first-run only', () => {
  it('shows while waiting and never connected', () => {
    expect(showOnboarding('disconnected', false)).toBe(true);
    expect(showOnboarding('probing', false)).toBe(true);
  });
  it('hides once connected, forever', () => {
    expect(showOnboarding('connected', true)).toBe(false);
    expect(showOnboarding('disconnected', true)).toBe(false); // a later drop still hides it
    expect(showOnboarding('handshake', false)).toBe(false);
  });
});

describe('panel mode (P5.1) — compact-first, expand on demand', () => {
  it('the iframe geometry is 300 wide, 170 compact / 460 expanded', () => {
    expect(PANEL_WIDTH).toBe(300);
    expect(PANEL_HEIGHT.compact).toBe(170);
    expect(PANEL_HEIGHT.expanded).toBe(460);
  });
  it('togglePanelMode flips and round-trips', () => {
    expect(togglePanelMode('compact')).toBe('expanded');
    expect(togglePanelMode('expanded')).toBe('compact');
    expect(togglePanelMode(togglePanelMode('compact'))).toBe('compact');
  });
  it('detailsLabel invites with ▾ and collapses with ▴', () => {
    expect(detailsLabel('compact')).toBe('Details ▾');
    expect(detailsLabel('expanded')).toBe('Details ▴');
  });
  it('compactMeta covers ONLY the disconnected wait — next-step copy, no pill echo', () => {
    expect(compactMeta('disconnected')).toBe('First CLI command starts it');
    expect(compactMeta('connected')).toBeNull();
    expect(compactMeta('probing')).toBeNull();
    expect(compactMeta('handshake')).toBeNull();
  });
});

describe('idle-commit prompt labels (spec 004 P4)', () => {
  it('syncPromptLabel pluralizes and floors count at 1', () => {
    expect(syncPromptLabel(1)).toBe('1 change ready');
    expect(syncPromptLabel(3)).toBe('3 changes ready');
    expect(syncPromptLabel(0)).toBe('1 change ready'); // never shows "0 changes"
    expect(syncPromptLabel(2.9)).toBe('2 changes ready'); // floored
    expect(syncPromptLabel(Number.NaN)).toBe('1 change ready');
  });
  it('syncResultLabel marks success with ✓ and surfaces the failure reason', () => {
    expect(syncResultLabel(true, 'synced — 2 updated, 1 deprecated, 0 pending'))
      .toBe('Synced ✓ — synced — 2 updated, 1 deprecated, 0 pending');
    expect(syncResultLabel(false, 'ui not runnable')).toBe('Sync failed — ui not runnable');
    expect(syncResultLabel(true, '')).toBe('Synced ✓ — done'); // empty summary → sane default
    expect(syncResultLabel(false, '   ')).toBe('Sync failed — failed');
  });
});
