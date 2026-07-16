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

// spec-005 P12 — the last INSTANCE diff of the P5 live run, and the one P11's model
// could not express: an inner slot the user SWAPPED to a different component.
//
// Live shape (node 25575:353516, "Shell / Template — Demo (slot swapped)"), read off
// the canvas rather than reasoned about:
//   main's own child 25575:353404  → name "Slot / Page content", 928x836, main = "Slot"
//   the instance's twin            → the SAME name + size, main = "_Shell / Page content demo"
// Every field equal, one component different. P11 replayed the four fields, Figma
// registered no override (they already equalled the main's), and the rebuild came back
// with `innerOverrides: null` — pointing at the wrong component, byte-identical.
describe('inner overrides — a SWAPPED inner slot (spec-005 P12)', () => {
  let main: FakeNode;
  let demo: FakeNode;

  /** A main whose inner child is itself an INSTANCE — the slot the user can swap. */
  function mainWithSlot(): FakeNode {
    const slotComp = new FakeNode('COMPONENT');
    slotComp.name = 'Slot';
    slotComp.key = 'KEY-SLOT';
    slotComp.width = 256;
    slotComp.height = 68;
    const filler = new FakeNode('RECTANGLE');
    filler.name = 'Slot';
    slotComp.appendChild(filler);

    const shell = new FakeNode('COMPONENT');
    shell.name = 'Shell/Template';
    shell.key = 'KEY-SHELL';
    shell.width = 1440;
    shell.height = 900;
    shell.layoutMode = 'VERTICAL';
    const slot = slotComp.createInstance();
    slot.name = 'Slot / Page content'; // the main's own override on its slot…
    slot.width = 928;
    slot.height = 836;
    shell.appendChild(slot);
    return shell;
  }

  /** The component the live file swapped INTO the slot — a different size on purpose. */
  function demoComponent(): FakeNode {
    const c = new FakeNode('COMPONENT');
    c.name = '_Shell / Page content demo';
    c.key = 'KEY-DEMO';
    c.width = 1104;
    c.height = 836;
    c.layoutMode = 'VERTICAL';
    const title = new FakeNode('TEXT');
    title.name = 'Title';
    title.characters = 'Title';
    c.appendChild(title);
    return c;
  }

  beforeEach(() => {
    main = mainWithSlot();
    demo = demoComponent();
    setMockComponents([main, demo]);
    resetImportWarnings();
  });

  it('round-trips a swap whose every FIELD already equals the main\'s (the live diff)', async () => {
    const inst = main.createInstance();
    const slot = inst.children[0];
    slot.swapComponent(demo); // …the ONLY difference from the main: the component

    const spec1 = await scan(inst);
    // The fields say nothing — this is precisely why P11 could not see it.
    expect(spec1.innerOverrides).toEqual([
      { childKey: main.children[0].id, fields: {}, componentKey: 'KEY-DEMO', componentId: demo.id },
    ]);

    const spec2 = await build(spec1);
    expect(spec2.innerOverrides).toEqual(spec1.innerOverrides);
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
    expect(getImportWarnings()).toEqual([]);
  });

  it('replays the swap onto the twin — the rebuilt slot points at the swapped main', async () => {
    const inst = main.createInstance();
    inst.children[0].swapComponent(demo);
    const spec1 = await scan(inst);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rebuilt = await createFigmaNode(spec1 as any, new Map()) as unknown as FakeNode;
    const slot = rebuilt.children[0];
    expect((await slot.getMainComponentAsync())?.key).toBe('KEY-DEMO');
    // …and it carries the swapped main's TREE, not the default slot's filler.
    expect(slot.children.map((c) => c.name)).toEqual(['Title']);
  });

  it('leaves an UNswapped inner instance alone (no churn on the main\'s own child)', async () => {
    const inst = main.createInstance();
    inst.children[0].layoutGrow = 1; // an ordinary field override, no swap

    const spec1 = await scan(inst);
    // The ref is still recorded — the rebuild decides by comparing, not by guessing…
    expect(spec1.innerOverrides?.[0]?.componentKey).toBe('KEY-SLOT');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rebuilt = await createFigmaNode(spec1 as any, new Map()) as unknown as FakeNode;
    // …and finding it already correct, it swaps nothing: the slot keeps its own tree.
    expect((await rebuilt.children[0].getMainComponentAsync())?.key).toBe('KEY-SLOT');
    expect(structuralDiff(spec1, await scan(rebuilt)).diffs).toEqual([]);
    expect(getImportWarnings()).toEqual([]);
  });

  it('reports an unresolvable swap target instead of faking the diff closed', async () => {
    const spec: FigmaExportNode = {
      type: 'INSTANCE', name: 'Shell/Template', componentKey: 'KEY-SHELL',
      innerOverrides: [{
        childKey: main.children[0].id,
        fields: {},
        componentKey: 'KEY-VANISHED', // a library that is not reachable from this file
      }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rebuilt = await createFigmaNode(spec as any, new Map()) as unknown as FakeNode;
    expect(rebuilt).toBeTruthy(); // the instance still builds…
    // …on the main's default, and the loss is named rather than swallowed.
    expect((await rebuilt.children[0].getMainComponentAsync())?.key).toBe('KEY-SLOT');
    expect(getImportWarnings().join('\n')).toContain('swap lost');
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
