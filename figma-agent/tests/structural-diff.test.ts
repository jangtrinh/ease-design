// The mirror's linter, unit-tested (spec-005 P5). structuralDiff is what turns
// "the round-trip failed" into "children[0].fills[0].color.a failed" — so the
// tests here are mostly about the PATH being right, not just the boolean.
import { describe, it, expect } from 'vitest';
import { structuralDiff, FLOAT_EPSILON } from '../cli/src/util/structural-diff.ts';

describe('structuralDiff — equal specs', () => {
  it('reports equal for two deep-identical specs', () => {
    const spec = {
      type: 'FRAME', name: 'Card', width: 320, layoutMode: 'VERTICAL',
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12, a: 1 } }],
      children: [{ type: 'TEXT', name: 'Title', characters: 'Hello', fontSize: 20 }],
    };
    const res = structuralDiff(spec, structuredClone(spec));
    expect(res).toEqual({ equal: true, diffs: [] });
  });

  it('treats an explicitly-undefined field as absent (the walker deletes empties)', () => {
    expect(structuralDiff({ type: 'FRAME', fills: undefined }, { type: 'FRAME' }).equal).toBe(true);
  });

  it('is unaffected by key order', () => {
    expect(structuralDiff({ a: 1, b: 2 }, { b: 2, a: 1 }).equal).toBe(true);
  });
});

describe('structuralDiff — a single field that lost the round-trip', () => {
  it('names the exact path of a nested scalar diff', () => {
    const a = { type: 'FRAME', children: [{ type: 'TEXT', characters: 'Hello' }] };
    const b = { type: 'FRAME', children: [{ type: 'TEXT', characters: 'Hi' }] };
    expect(structuralDiff(a, b)).toEqual({
      equal: false,
      diffs: [{ path: 'children[0].characters', left: 'Hello', right: 'Hi' }],
    });
  });

  it('names a path THROUGH arrays of objects (the canonical fills case)', () => {
    const a = { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] };
    const b = { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 0.5 } }] };
    const res = structuralDiff(a, b);
    expect(res.equal).toBe(false);
    expect(res.diffs).toEqual([{ path: 'fills[0].color.a', left: 1, right: 0.5 }]);
  });

  it('reports a DROPPED field as left=value, right=undefined (the binding-loss shape)', () => {
    const a = { type: 'FRAME', tokenRefs: { fill: 'color/brand' }, cornerRadius: 8 };
    const b = { type: 'FRAME', cornerRadius: 8 };
    // A container that vanished WHOLE is reported once, at its own path, carrying
    // what was lost — not fanned out into one entry per leaf. Same convention as a
    // dropped `children` subtree below; this is the exact shape a token-bound node
    // produces when the rebuild drops its bindings (see mirror-verify's header).
    expect(structuralDiff(a, b).diffs).toEqual([
      { path: 'tokenRefs', left: { fill: 'color/brand' }, right: undefined },
    ]);
  });

  it('descends to the LEAF when the container survives but a binding inside it does not', () => {
    const a = { tokenRefs: { fill: 'color/brand', radius: 'radius/sm' } };
    const b = { tokenRefs: { fill: 'color/brand' } };
    expect(structuralDiff(a, b).diffs).toEqual([
      { path: 'tokenRefs.radius', left: 'radius/sm', right: undefined },
    ]);
  });

  it('reports a type mismatch at the path rather than descending into it', () => {
    expect(structuralDiff({ cornerRadius: 12 }, { cornerRadius: { tl: 12 } }).diffs).toEqual([
      { path: 'cornerRadius', left: 12, right: { tl: 12 } },
    ]);
  });

  it('lists every differing field, in a deterministic (sorted) order', () => {
    const res = structuralDiff({ width: 320, height: 200, name: 'A' }, { width: 321, height: 201, name: 'A' });
    expect(res.diffs.map((d) => d.path)).toEqual(['height', 'width']);
  });
});

describe('structuralDiff — float epsilon', () => {
  it('treats a sub-epsilon float delta as equal (paint.opacity ↔ color.a noise)', () => {
    const a = { strokes: [{ color: { a: 0.1 } }] };
    const b = { strokes: [{ color: { a: 0.1 + FLOAT_EPSILON / 2 } }] };
    expect(structuralDiff(a, b).equal).toBe(true);
  });

  it('reports a delta ABOVE epsilon', () => {
    const res = structuralDiff({ itemSpacing: 12 }, { itemSpacing: 12.001 });
    expect(res.equal).toBe(false);
    expect(res.diffs[0].path).toBe('itemSpacing');
  });

  it('does not let epsilon swallow a number ↔ string mismatch', () => {
    expect(structuralDiff({ fontSize: 20 }, { fontSize: '20' }).equal).toBe(false);
  });
});

describe('structuralDiff — nested children', () => {
  it('reports a child COUNT change plus the extra child, by path', () => {
    const a = { children: [{ name: 'One' }] };
    const b = { children: [{ name: 'One' }, { name: 'Two' }] };
    const res = structuralDiff(a, b);
    expect(res.equal).toBe(false);
    expect(res.diffs).toEqual([
      { path: 'children.length', left: 1, right: 2 },
      { path: 'children[1]', left: undefined, right: { name: 'Two' } },
    ]);
  });

  it('walks arbitrarily deep nesting', () => {
    const nest = (leaf: unknown) => ({ children: [{ children: [{ children: [leaf] }] }] });
    const res = structuralDiff(nest({ fontSize: 14 }), nest({ fontSize: 16 }));
    expect(res.diffs).toEqual([
      { path: 'children[0].children[0].children[0].fontSize', left: 14, right: 16 },
    ]);
  });

  it('reports a whole dropped subtree at its path', () => {
    const res = structuralDiff({ name: 'Card', children: [{ name: 'Kid' }] }, { name: 'Card' });
    expect(res.diffs).toEqual([{ path: 'children', left: [{ name: 'Kid' }], right: undefined }]);
  });
});
