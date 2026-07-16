// spec-005 P13 — the two losses the DS-WIDE gate exposed once mirror-verify was run
// on instances beyond the P5 gate node (25575:353653, which had passed equal:true).
//
// Both were probed on the live canvas before a line was written here, because P12 had
// already guessed this addressing wrong three times. What the probe of `_Sheet`
// (25579:377511) actually reported:
//
//   key "21174:14662"            fields ["componentProperties", "name"]
//   key "21174:14662;112:1269"   fields ["boundVariables"]
//   → unmatchedKeys: []   (every key resolved AGAINST THE SOURCE)
//
// That last line reframed the whole task. The rebuild's warning — `inner override had
// no matching child (21174:14662;112:1269)` — was NOT a key the code failed to derive.
// Slot "21174:14662" carried a VARIANT selection (its main read
// "Variant=Default, State=Disabled"), P11/P12 never replayed componentProperties, so
// the rebuilt slot stayed on the main's DEFAULT variant — a different component, whose
// subtree never contained "112:1269" at all. Layer 2 was a SYMPTOM of layer 1, plus
// one compounding bug of its own: the inner-tree map was taken once, before the
// variant that rebuilds that tree was applied.
//
// So the suite drives both from the cause, never from a hand-written override array:
// the mock derives `overrides` by diffing against the main, and a VARIANT set rebuilds
// the subtree exactly as the canvas does.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installMockFigma, setMockComponents, setVariantMains, FakeNode } from './helpers/mock-figma.ts';
import { structuralDiff } from '../cli/src/util/structural-diff.ts';
import { getImportWarnings, resetImportWarnings } from '../plugin/src/main/executor-styles.ts';
import { innerChildKey } from '../plugin/src/main/instance-inner-override-keys.ts';
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

/** One variant body of the Button set — its own component, its own child ids. */
function buttonVariant(name: string, labelText: string): FakeNode {
  const v = new FakeNode('COMPONENT');
  v.name = name;
  v.key = `KEY-BTN-${name}`;
  v.width = 100;
  v.height = 32;
  const label = new FakeNode('TEXT');
  label.name = 'Label';
  label.characters = labelText;
  label.fontSize = 14;
  v.appendChild(label);
  return v;
}

/**
 * The live `_Sheet` shape: a main whose child is an INSTANCE of a variant set, so an
 * inner slot can carry a variant selection AND overrides underneath it.
 */
function sheetFixture(): { sheet: FakeNode; def: FakeNode; disabled: FakeNode; slotKey: string } {
  const def = buttonVariant('State=Default', 'Apply');
  const disabled = buttonVariant('State=Disabled', 'Apply');
  def.componentPropertyDefinitions = {
    State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Disabled'] },
    Loading: { type: 'BOOLEAN', defaultValue: false },
  };
  def.componentProperties = {
    State: { type: 'VARIANT', value: 'Default' },
    Loading: { type: 'BOOLEAN', value: false },
  };
  setVariantMains(def, { 'State=Default': def, 'State=Disabled': disabled });

  const sheet = new FakeNode('COMPONENT');
  sheet.name = 'Sheet';
  sheet.key = 'KEY-SHEET';
  sheet.layoutMode = 'VERTICAL';
  const slot = def.createInstance();
  sheet.appendChild(slot);
  setMockComponents([sheet, def, disabled]);
  return { sheet, def, disabled, slotKey: slot.id };
}

describe('inner INSTANCE componentProperties — the DS-wide gate, layer 1 (spec-005 P13)', () => {
  let fx: ReturnType<typeof sheetFixture>;
  beforeEach(() => { fx = sheetFixture(); resetImportWarnings(); });

  it('captures a BOOLEAN prop set inside an inner slot, and replays it', async () => {
    const inst = fx.sheet.createInstance();
    inst.children[0].setProperties({ Loading: true });

    const spec1 = await scan(inst);
    // Figma names ONE field for this whole class of edit — which is why P11's
    // field-value whitelist could never carry it.
    expect(spec1.figmaScanInnerOverrides).toContain('componentProperties');
    const entry = spec1.innerOverrides?.find((o) => o.childKey === fx.slotKey);
    expect(entry?.componentProperties).toEqual({ Loading: true, State: 'Default' });

    const spec2 = await build(spec1);
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
    expect(getImportWarnings()).toEqual([]);
  });

  it('does NOT invent an override when the slot sits on the main\'s own defaults', async () => {
    // An instance always exposes componentProperties, so reading them unconditionally
    // would record the main's defaults as an edit and make the rebuild report MORE
    // overrides than the source — the same spurious-override trap P10 hit with resize.
    const inst = fx.sheet.createInstance();
    const spec1 = await scan(inst);
    expect(spec1.figmaScanInnerOverrides).toBeUndefined();
    expect(spec1.innerOverrides).toBeUndefined();
  });

  it('reports a prop the main no longer exposes WITHOUT dropping its healthy neighbours', async () => {
    const inst = fx.sheet.createInstance();
    inst.children[0].setProperties({ Loading: true });
    const spec1 = await scan(inst);

    // The main changed since the scan: setProperties is all-or-nothing, so the stale
    // key would take the whole call — and every good prop with it — without the
    // per-key retry.
    const entry = spec1.innerOverrides?.find((o) => o.childKey === fx.slotKey);
    entry!.componentProperties = { ...entry!.componentProperties, Ghost: 'gone' };

    const spec2 = await build(spec1);
    expect(getImportWarnings().join('\n')).toMatch(/property "Ghost" failed/);
    // The loss is charged to the one prop that earned it, not to Loading.
    const rebuilt = spec2.innerOverrides?.find((o) => o.childKey === fx.slotKey);
    expect(rebuilt?.componentProperties).toMatchObject({ Loading: true });
  });
});

describe('inner overrides UNDER a re-varianted slot — layer 2 (spec-005 P13)', () => {
  let fx: ReturnType<typeof sheetFixture>;
  beforeEach(() => { fx = sheetFixture(); resetImportWarnings(); });

  it('reproduces the gate\'s compound key: a variant picked, an override beneath it', async () => {
    const inst = fx.sheet.createInstance();
    const slot = inst.children[0];
    slot.setProperties({ State: 'Disabled' }); // rebuilds the slot's subtree, live-style
    slot.children[0].name = 'Retry'; // …and an edit on a node only that variant has

    const spec1 = await scan(inst);
    // The deep key is the live `21174:14662;112:1269` shape: a CHAIN, one segment per
    // level of nesting — probed on the canvas, not assumed.
    const deepKey = `${fx.slotKey};${fx.disabled.children[0].id}`;
    expect(spec1.innerOverrides?.map((o) => o.childKey)).toEqual([fx.slotKey, deepKey]);
    expect(spec1.innerOverrides?.find((o) => o.childKey === deepKey)?.fields).toEqual({ name: 'Retry' });

    // THE REGRESSION THIS FILE EXISTS FOR: with the tree map taken once, up front, the
    // rebuilt slot is still on Default when this key is looked up, and the override is
    // reported lost. It survives only because the map is re-walked after the variant.
    const spec2 = await build(spec1);
    expect(getImportWarnings()).toEqual([]);
    expect(structuralDiff(spec1, spec2).diffs).toEqual([]);
  });

  it('keeps a childKey with no twin FAIL-SAFE: records the loss, writes nothing', async () => {
    const inst = fx.sheet.createInstance();
    inst.children[0].setProperties({ Loading: true });
    const spec1 = await scan(inst);
    const before = inst.children[0].children[0].name;
    spec1.innerOverrides!.push({ childKey: '99:999;404:404', fields: { name: 'WRONG' } });

    const spec2 = await build(spec1);
    expect(getImportWarnings().join('\n')).toMatch(/no matching child \(99:999;404:404\)/);
    // The point of the fail-safe: an unmatched key must not land on SOME other node.
    expect(spec2.innerOverrides?.some((o) => o.fields.name === 'WRONG')).toBeFalsy();
    expect(inst.children[0].children[0].name).toBe(before);
  });
});

describe('inner override resize on a FILL child — the refusal that looks like a success', () => {
  beforeEach(() => { resetImportWarnings(); });

  it('names the loss when auto-layout owns the axis and resize() quietly does nothing', async () => {
    // The last residual diff of the B2 Typing gate node, and NOT a lost pixel: probed
    // live, source and rebuild both measured 1108x836 against a 1108x836 main. Figma
    // tracks width/height as "was SET", the source had set them, and a FILL child
    // cannot be set — resize() there returns without throwing and without moving.
    // Silence would read as an executor bug, so the executor says what happened.
    const main = new FakeNode('COMPONENT');
    main.name = 'Shell';
    main.key = 'KEY-SHELL';
    main.layoutMode = 'VERTICAL';
    const body = new FakeNode('FRAME');
    body.name = 'Body';
    body.width = 1108;
    body.height = 836;
    main.appendChild(body);
    body.layoutSizingHorizontal = 'FILL';
    body.layoutSizingVertical = 'FILL';
    setMockComponents([main]);

    await build({
      type: 'INSTANCE', name: 'Shell', componentKey: 'KEY-SHELL',
      innerOverrides: [{ childKey: body.id, fields: { width: 900, height: 700 } }],
    } as FigmaExportNode);

    expect(getImportWarnings().join('\n')).toMatch(/resize did not take \(asked 900x700, got 1108x836\)/);
  });
});

describe('inner childKey addressing — the probed compound-id rule (spec-005 P13)', () => {
  it('does not re-add the I marker for an instance that is itself nested', () => {
    // Probed live: a nested instance's own id is ALREADY compound
    // (`I25579:377511;21174:14662`) and its children read `<thatId>;<child>` — no
    // second `I`. Writing `I${id};` produced `II25579:377511;…`, which matched nothing.
    expect(innerChildKey('I25579:377511;21174:14662', 'I25579:377511;21174:14662;112:1269'))
      .toBe('112:1269');
    // A top-level instance still carries the marker.
    expect(innerChildKey('25579:376847', 'I25579:376847;25575:354724')).toBe('25575:354724');
    // And an id from a DIFFERENT instance stays unaddressable — undefined, never a guess.
    expect(innerChildKey('25579:376847', 'I25579:999999;25575:354724')).toBeUndefined();
  });
});
