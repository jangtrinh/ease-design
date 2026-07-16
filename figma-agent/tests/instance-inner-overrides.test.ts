// spec-005 P11 — the INSTANCE INNER-OVERRIDE edge, the last two diffs of the P5 live
// run on node 25575:353653 (scratchpad p5-live-diffs-10.json):
//
//   children[0].children[0]         figmaScanInnerOverrides ["layoutGrow","textAutoResize"] → null
//   children[0].children[1].children[2]  ["height","name","primaryAxisSizingMode","width"] → null
//
// Both say one thing: a child edited INSIDE an instance came back to a rebuild
// unedited. P2 recorded that loss on purpose (`figmaScanInnerOverrides`) because the
// instance model is ref + overrides and recursing the inner TREE would detach it.
// P11 closes the half of it that never needed the tree: an overridden FIELD can be
// written straight back onto the twin child, addressed by a main-relative childKey.
//
// The suite is built on the two live shapes above, each reproduced from its cause,
// not from a hand-written override array — the mock DERIVES `overrides` by diffing
// the instance against its main (see mock-figma.ts note 11), so what these tests
// assert is what Figma's own bookkeeping would report.
//
// STILL UNPROBED (offline work — the live re-run arbitrates; see the report):
//   - that Figma composes an inner node's id as `I<instanceId>;<idInTheMain>`;
//   - that a Plugin-API write onto an inner child registers an override at all.
// Both are fail-safe here: get them wrong and nothing is reapplied, and
// `figmaScanInnerOverrides` still reports the loss — never a faked-closed diff.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installMockFigma, setMockComponents, FakeNode } from './helpers/mock-figma.ts';
import { structuralDiff } from '../cli/src/util/structural-diff.ts';
import { getImportWarnings, resetImportWarnings } from '../plugin/src/main/executor-styles.ts';
import type { FigmaExportNode } from '../shared/figma-payload-types.ts';

beforeAll(() => { installMockFigma(); });

const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { nodeToSpec, readMainComponentMap } = await import('../plugin/src/main/scan-node.ts');

const scan = async (node: FakeNode) =>
  nodeToSpec(node as unknown as SceneNode, new Map(), await readMainComponentMap(node as unknown as SceneNode));

const build = async (spec: FigmaExportNode) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map());
  if (!node) throw new Error('builder returned null');
  return scan(node as unknown as FakeNode);
};

/**
 * A main whose composition mirrors the live node: a TEXT child (the diff-1 shape)
 * and a nested auto-layout ROW (the diff-2 shape). The row hugs on its primary axis
 * and is FIXED on the counter axis — exactly why the live diff-2 lists
 * primaryAxisSizingMode and not counterAxisSizingMode.
 */
function mainCard(): FakeNode {
  const comp = new FakeNode('COMPONENT');
  comp.name = 'Card/Base';
  comp.key = 'KEY-CARD';
  comp.width = 320;
  comp.height = 120;
  comp.layoutMode = 'VERTICAL';

  const label = new FakeNode('TEXT');
  label.name = 'Label';
  label.characters = 'Click';
  label.fontSize = 14;
  label.layoutGrow = 0;
  label.textAutoResize = 'WIDTH_AND_HEIGHT';
  comp.appendChild(label);

  const row = new FakeNode('FRAME');
  row.name = 'Row';
  row.width = 100;
  row.height = 24;
  row.layoutMode = 'HORIZONTAL';
  row.primaryAxisSizingMode = 'AUTO';
  row.counterAxisSizingMode = 'FIXED';
  comp.appendChild(row);
  return comp;
}

describe('instance INNER overrides — the P5 live diffs (spec-005 P11)', () => {
  let main: FakeNode;
  beforeEach(() => { main = mainCard(); setMockComponents([main]); resetImportWarnings(); });

  it('addresses an inner child by a key that is stable across two instances of one main', async () => {
    const a = main.createInstance();
    const b = main.createInstance();
    // The compound id differs (each instance owns its prefix)…
    expect(a.children[0].id).not.toBe(b.children[0].id);
    expect(a.children[0].id).toBe(`I${a.id};${main.children[0].id}`);
    // …but the main-relative remainder — the childKey — is the same in both. That
    // identity is the entire mechanism: without it a rebuild has no twin to write to.
    const keyOf = (inst: FakeNode) => inst.children[0].id.slice(`I${inst.id};`.length);
    expect(keyOf(a)).toBe(keyOf(b));
    expect(keyOf(a)).toBe(main.children[0].id);
  });

  // LIVE DIFF 1 — children[0].children[0]: ["layoutGrow","textAutoResize"] → null
  it('round-trips a TEXT child\'s layoutGrow + textAutoResize (live diff 1)', async () => {
    const inst = main.createInstance();
    const label = inst.children[0];
    label.layoutGrow = 1;
    label.textAutoResize = 'HEIGHT';

    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toEqual(['layoutGrow', 'textAutoResize']);
    expect(spec1.innerOverrides).toEqual([
      { childKey: main.children[0].id, fields: { layoutGrow: 1, textAutoResize: 'HEIGHT' } },
    ]);

    // The rebuild reapplies them, so the SCAN of the rebuild reports the same
    // overrides — which is what makes the live diff disappear rather than be hidden.
    const spec2 = await build(spec1);
    expect(spec2.figmaScanInnerOverrides).toEqual(['layoutGrow', 'textAutoResize']);
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
    expect(getImportWarnings()).toEqual([]);
  });

  // LIVE DIFF 2 — children[0].children[1].children[2]:
  // ["height","name","primaryAxisSizingMode","width"] → null
  it('round-trips a nested ROW\'s name + size + sizing mode (live diff 2)', async () => {
    const inst = main.createInstance();
    const row = inst.children[1];
    row.name = 'Row — edited';
    row.resize(220, 40); // the live edit: a resize, which also fixes the AUTO axis

    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toEqual(['height', 'name', 'primaryAxisSizingMode', 'width']);
    expect(spec1.innerOverrides).toEqual([{
      childKey: main.children[1].id,
      fields: { name: 'Row — edited', width: 220, height: 40, primaryAxisSizingMode: 'FIXED' },
    }]);

    const spec2 = await build(spec1);
    expect(spec2.figmaScanInnerOverrides).toEqual(['height', 'name', 'primaryAxisSizingMode', 'width']);
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
  });

  it('leaves an instance with NO inner overrides byte-identical (no regression on P2)', async () => {
    const spec1 = await scan(main.createInstance());
    expect(spec1.innerOverrides).toBeUndefined();
    expect(spec1.figmaScanInnerOverrides).toBeUndefined();
    const spec2 = await build(spec1);
    expect(spec2.innerOverrides).toBeUndefined();
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
  });
});

// The P10 lesson, transplanted: `resize()` FIXES both axes of an auto-layout node.
// Replaying an inner width/height therefore threatens to invent sizing-mode overrides
// the source never had — the rebuild would then report MORE inner overrides than the
// original, which is the same class of wrongness as reporting fewer.
describe('inner overrides — a replayed resize must not invent sizing overrides', () => {
  let main: FakeNode;
  beforeEach(() => { main = mainCard(); setMockComponents([main]); resetImportWarnings(); });

  it('restores the sizing modes the spec does not carry back to the main\'s values', async () => {
    const inst = main.createInstance();
    const row = inst.children[1];
    row.counterAxisSizingMode = 'AUTO'; // the main's row is FIXED here…
    // …and this width came from layout, NOT from a resize — so Figma records `width`
    // WITHOUT touching primaryAxisSizingMode. The rebuild's resize() would.
    row.width = 220;

    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toEqual(['width', 'counterAxisSizingMode'].sort());
    expect(spec1.innerOverrides?.[0]?.fields).toEqual({ width: 220, counterAxisSizingMode: 'AUTO' });
    // primaryAxisSizingMode is NOT overridden on the source: it is the main's AUTO.
    expect(spec1.figmaScanInnerOverrides).not.toContain('primaryAxisSizingMode');

    const spec2 = await build(spec1);
    // Without the restore, resize() would have left primaryAxisSizingMode FIXED here.
    expect(spec2.figmaScanInnerOverrides).not.toContain('primaryAxisSizingMode');
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
  });
});

// What P11 does NOT close, kept explicit. `innerOverrides` carries the fields this
// codebase can read AND write; `figmaScanInnerOverrides` stays the TOTAL. When the
// two disagree, the difference IS the residual loss — reported, never normalised away.
describe('inner overrides — the fields that STILL do not survive', () => {
  let main: FakeNode;
  beforeEach(() => { main = mainCard(); setMockComponents([main]); resetImportWarnings(); });

  it('records a text edit as a loss instead of pretending to carry it', async () => {
    const inst = main.createInstance();
    const label = inst.children[0];
    label.characters = 'Edited inside the instance';
    label.fontSize = 22;
    label.layoutGrow = 1; // …one reapplyable field alongside the two that are not

    const spec1 = await scan(inst);
    // The TOTAL names all three — including what a rebuild cannot carry.
    expect(spec1.figmaScanInnerOverrides).toEqual(['characters', 'fontSize', 'layoutGrow']);
    // The reversible subset names only the one it can.
    expect(spec1.innerOverrides).toEqual([
      { childKey: main.children[0].id, fields: { layoutGrow: 1 } },
    ]);

    const spec2 = await build(spec1);
    expect(spec2.figmaScanInnerOverrides).toEqual(['layoutGrow']); // the text edit is gone
    // NOT a fixed point — and every path the diff names sits under
    // figmaScanInnerOverrides: the residual loss is the text edit, nothing more.
    const { equal, diffs } = structuralDiff(spec1, spec2);
    expect(equal).toBe(false);
    expect(diffs.every((d) => d.path.startsWith('figmaScanInnerOverrides'))).toBe(true);
    expect(diffs.map((d) => d.left)).toContain('characters');
    expect(diffs.map((d) => d.left)).toContain('fontSize');
  });

  it('skips — and reports — a childKey with no twin in the rebuilt instance', async () => {
    const spec: FigmaExportNode = {
      type: 'INSTANCE', name: 'Card/Base', componentKey: 'KEY-CARD',
      innerOverrides: [{ childKey: 'GONE:1', fields: { layoutGrow: 1 } }],
    };
    const spec1 = await build(spec);
    expect(spec1.type).toBe('INSTANCE');           // the instance still builds…
    expect(spec1.innerOverrides).toBeUndefined();  // …the orphan edit does not land…
    expect(getImportWarnings().join('\n')).toContain('no matching child'); // …and says so
  });

  it('does not reapply an override whose id has no addressable shape', async () => {
    const inst = main.createInstance();
    // A hand-set array in the shape a NON-compound id would take: nothing to strip,
    // so no key, so no reapply — the loss stays in figmaScanInnerOverrides.
    inst.overrides = [{ id: `${inst.id};child`, overriddenFields: ['layoutGrow'] }];
    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toEqual(['layoutGrow']);
    expect(spec1.innerOverrides).toBeUndefined();
  });
});
