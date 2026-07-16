// spec 005 P4 — the capture pass that feeds `ui figma reconcile --apply --mirror-file`.
//
// Only the PURE seams are unit-testable here: which components a delta asks us to scan,
// and how a scan-node child's stdout is read. Spawning the real child needs a live broker
// + an open Figma file — that is the P5 owner-in-the-loop gate, not a unit test.
import { describe, it, expect } from 'vitest';
import { captureMirror, targetsFromDelta } from '../cli/src/transport/figma-mirror-capture-run.ts';

describe('targetsFromDelta', () => {
  it('takes ADD + EDIT, never DELETE (a deleted node has nothing to scan)', () => {
    const targets = targetsFromDelta({
      delta: {
        added: [{ name: 'Card/Compact', nodeId: '2:9' }],
        updated: [{ name: 'Button/Primary', nodeId: '1:1' }],
        deprecated: [{ name: 'Old/Thing', nodeId: '9:9' }],
      },
    });
    expect(targets).toEqual([
      { nodeId: '2:9', name: 'Card/Compact' },
      { nodeId: '1:1', name: 'Button/Primary' },
    ]);
  });

  it('drops entries with no usable identity rather than scanning a guess', () => {
    const targets = targetsFromDelta({
      delta: { added: [{ name: '', nodeId: '1:1' }, { nodeId: '2:2' }, { name: 'A/B' }, 'junk'], updated: [] },
    });
    expect(targets).toEqual([]);
  });

  it('survives an envelope with no delta at all', () => {
    expect(targetsFromDelta(null)).toEqual([]);
    expect(targetsFromDelta({})).toEqual([]);
    expect(targetsFromDelta({ delta: { added: 'nope' } })).toEqual([]);
  });
});

describe('captureMirror', () => {
  it('no targets → no capture file (apply then runs mirror-less)', async () => {
    await expect(captureMirror([])).resolves.toEqual({ captured: 0, failed: 0, dropped: 0 });
  });
});
