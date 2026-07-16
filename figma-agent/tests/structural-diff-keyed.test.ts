// spec-005 P16, Edge A — the mirror linter pairs SET-shaped arrays by NAME.
//
// The live gate on node 25579:749755 reported 43 diffs for 5 real ones: the rebuild
// was missing 4 of the original's 16 `innerOverrides`, and index-pairing smeared that
// shift across the whole tail — `innerOverrides[6].childKey: <childA> vs <childB>`,
// comparing two entirely different children and calling it a lost round-trip.
//
// The claim these tests defend is narrow and total: keyed pairing changes WHICH path
// a difference is reported at, and NEVER whether there is one. So every test here
// comes in a pair — one that the report got sharper, one that nothing got forgiven.
import { describe, it, expect } from 'vitest';
import { structuralDiff } from '../cli/src/util/structural-diff.ts';

const entry = (childKey: string, fields: Record<string, unknown> = {}) => ({ childKey, fields });

describe('spec-005 P16 — innerOverrides pair by childKey, not by index', () => {
  it('reports ONE diff per missing member instead of a cascade down the tail', () => {
    // The live shape, shrunk: the rebuild lost the FIRST member, so every later
    // member sits one index early. Index-pairing called all four of those a diff.
    const a = { innerOverrides: [entry('a:1'), entry('b:2'), entry('c:3'), entry('d:4')] };
    const b = { innerOverrides: [entry('b:2'), entry('c:3'), entry('d:4')] };
    const { equal, diffs } = structuralDiff(a, b);
    expect(equal).toBe(false);
    expect(diffs).toEqual([
      { path: 'innerOverrides[childKey=a:1]', left: entry('a:1'), right: undefined },
    ]);
  });

  it('names the member the REBUILD invented, too — the loss is not one-directional', () => {
    const a = { innerOverrides: [entry('b:2')] };
    const b = { innerOverrides: [entry('a:1'), entry('b:2')] };
    expect(structuralDiff(a, b).diffs).toEqual([
      { path: 'innerOverrides[childKey=a:1]', left: undefined, right: entry('a:1') },
    ]);
  });

  it('still descends INTO a member that is present on both sides but changed', () => {
    // The whole point of forgiving nothing: pairing by name must not skip the compare.
    const a = { innerOverrides: [entry('a:1'), entry('b:2', { name: 'Old' })] };
    const b = { innerOverrides: [entry('a:1'), entry('b:2', { name: 'New' })] };
    expect(structuralDiff(a, b).diffs).toEqual([
      { path: 'innerOverrides[childKey=b:2].fields.name', left: 'Old', right: 'New' },
    ]);
  });

  it('reports equal for the same members — and pairing is what makes that true', () => {
    const members = [entry('a:1', { width: 10 }), entry('b:2', { name: 'X' })];
    const res = structuralDiff({ innerOverrides: members }, { innerOverrides: structuredClone(members) });
    expect(res).toEqual({ equal: true, diffs: [] });
  });

  it('falls back to POSITIONAL when the keys are not strictly ascending', () => {
    // The guard that makes this provably verdict-preserving: an unsorted array is not
    // a set the walker serialised, so it keeps the semantics it had. Whatever the
    // paths, the verdict is the one index-pairing gives.
    const a = { innerOverrides: [entry('b:2'), entry('a:1')] };
    const b = { innerOverrides: [entry('a:1'), entry('b:2')] };
    const { equal, diffs } = structuralDiff(a, b);
    expect(equal).toBe(false);
    expect(diffs.every((d) => /innerOverrides\[\d+\]/.test(d.path))).toBe(true);
  });

  it('leaves an ORDERED array of objects alone — children keep comparing by position', () => {
    // No childKey → not a keyed set. `children` is the tree; index IS identity there,
    // and a reordered tree is a real loss the gate must keep reporting.
    const a = { children: [{ type: 'TEXT', name: 'A' }, { type: 'TEXT', name: 'B' }] };
    const b = { children: [{ type: 'TEXT', name: 'B' }, { type: 'TEXT', name: 'A' }] };
    const { equal, diffs } = structuralDiff(a, b);
    expect(equal).toBe(false);
    expect(diffs).toEqual([
      { path: 'children[0].name', left: 'A', right: 'B' },
      { path: 'children[1].name', left: 'B', right: 'A' },
    ]);
  });
});

describe('spec-005 P16 — a sorted string array is a SET, compared by membership', () => {
  it('names the ONE missing field name instead of shifting the tail', () => {
    // The live figmaScanInnerOverrides: the rebuild registered no `effects` override,
    // and index-pairing turned that single absence into 7 diffs.
    const a = { figmaScanInnerOverrides: ['effects', 'fills', 'name', 'visible'] };
    const b = { figmaScanInnerOverrides: ['fills', 'name', 'visible'] };
    const { equal, diffs } = structuralDiff(a, b);
    expect(equal).toBe(false);
    expect(diffs).toEqual([
      { path: 'figmaScanInnerOverrides[effects]', left: 'effects', right: undefined },
    ]);
  });

  it('reports a member the rebuild added that the original never had', () => {
    const a = { figmaScanInnerOverrides: ['fills'] };
    const b = { figmaScanInnerOverrides: ['fills', 'visible'] };
    expect(structuralDiff(a, b).diffs).toEqual([
      { path: 'figmaScanInnerOverrides[visible]', left: undefined, right: 'visible' },
    ]);
  });

  it('reports equal for identical sets', () => {
    const set = ['effects', 'fills', 'name'];
    expect(structuralDiff({ f: set }, { f: [...set] })).toEqual({ equal: true, diffs: [] });
  });

  it('keeps an ORDERED string array positional — a font stack is not a set', () => {
    const a = { fontStack: ['Inter', 'Arial'] };
    const b = { fontStack: ['Arial', 'Inter'] };
    const { equal, diffs } = structuralDiff(a, b);
    expect(equal).toBe(false);
    // Not ascending on the left → positional, so the reorder still reads as a diff.
    expect(diffs).toEqual([
      { path: 'fontStack[0]', left: 'Inter', right: 'Arial' },
      { path: 'fontStack[1]', left: 'Arial', right: 'Inter' },
    ]);
  });
});
