// spec-005 P7/P8 — the OFFLINE proof that a binding tokenRefs CANNOT carry still
// survives the round trip, addressed by its variable's publish KEY.
//
// WHY THIS SUITE EXISTS: P6 proved a rebuild reattaches a binding by NAME, against
// the file's own local variables. Two live probes of 25575:353653 showed what that
// leaves on the table, and they are different gaps:
//   P7 — a variable published by a LIBRARY is never in getLocalVariablesAsync, so
//        the id resolved to no name and no tokenRef was emitted.
//   P8 — the 15 diffs that SURVIVED P7 were LOCAL variables (`remote: false` —
//        font/font-sans, text/lg/font-size, font-weight/normal) bound to FONT
//        fields. The name was findable; there was simply no tokenRefs SLOT for
//        fontFamily/fontSize/fontWeight to travel in, and P7's `remote === true`
//        gate had thrown their keys away.
//
// So the tests below bind both kinds — library-only variables AND local ones with a
// key on slotless fields — and assert the key, not the name, carries each home.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  installMockFigma, setMockLocalVariables, setMockLibraryVariables,
  setMockVariableCollections, makeMockVariable, makeMockLibraryVariable,
  makeMockKeyedLocalVariable, FakeNode,
} from './helpers/mock-figma.ts';
import type { FigmaExportNode, FigmaExportTokens } from '../shared/figma-payload-types.ts';

beforeAll(() => { installMockFigma(); });

const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { nodeToSpec, readTokenNameMap, readKeyedVariableMap } = await import('../plugin/src/main/scan-node.ts');
const { resolveTokenVars } = await import('../plugin/src/main/executor-token-var-resolve.ts');
const { resetKeyedVariableCache } = await import('../plugin/src/main/executor-keyed-vars.ts');
const { getImportWarnings, resetImportWarnings } = await import('../plugin/src/main/executor-styles.ts');

const NO_TOKENS: FigmaExportTokens = { colors: [], typography: [], spacing: [], radii: [], shadows: [] };

/** The alias a paint-copy binding stamps on the first paint's color. */
const paintAliasOf = (node: Record<string, unknown>, field: string): string | undefined => {
  const paints = node[field] as Array<{ boundVariables?: { color?: { id: string } } }> | undefined;
  return paints?.[0]?.boundVariables?.color?.id;
};
const aliasOf = (bound: unknown): string | undefined => (bound as { id?: string } | undefined)?.id;

/** Scan a live node the way the CLI does: the three async pre-passes, then the sync walker. */
async function scan(node: FakeNode): Promise<Record<string, unknown>> {
  const scene = node as unknown as SceneNode;
  const tokenNames = await readTokenNameMap();
  const keyedVars = await readKeyedVariableMap(scene);
  return nodeToSpec(scene, tokenNames, undefined, keyedVars) as unknown as Record<string, unknown>;
}

/** Rebuild through the REAL builder with tokens withheld, as the mirror does. */
async function rebuildFromSpecAlone(spec: FigmaExportNode): Promise<Record<string, unknown>> {
  const tokenVars = await resolveTokenVars(NO_TOKENS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map(), tokenVars as any);
  if (!node) throw new Error('builder returned null');
  return node as unknown as Record<string, unknown>;
}

/** A frame bound to a library variable on its fill — the DS node in miniature. */
function boundFrame(variableId: string): FakeNode {
  const frame = new FakeNode('FRAME');
  frame.name = 'Card';
  frame.width = 100;
  frame.height = 50;
  frame.fills = [{
    type: 'SOLID',
    color: { r: 0, g: 0, b: 0 },
    boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variableId } },
  }];
  return frame;
}

beforeEach(() => {
  resetImportWarnings();
  resetKeyedVariableCache();
  setMockLocalVariables([]);
  setMockLibraryVariables([]);
  setMockVariableCollections([]);
});

describe('scan — a published binding resolves to its publish KEY (the P7 join)', () => {
  it('captures keyedBindings for a fill bound to a library variable', async () => {
    const lib = makeMockLibraryVariable('color/primary', 'K1');
    setMockLibraryVariables([lib]);

    const spec = await scan(boundFrame(lib.id));

    expect(spec.keyedBindings).toEqual({ fills: { key: 'K1', name: 'color/primary' } });
    // The raw id still travels — the record of what was seen never shrinks.
    expect(spec.figmaScanBindings).toEqual({ fills: lib.id });
    // No tokenRef: a published variable has no local name to bind by (that IS the gap).
    expect(spec.tokenRefs).toBeUndefined();
  });

  it('captures scalar + per-side padding bindings field-for-field (no tokenRefs slot needed)', async () => {
    const radius = makeMockLibraryVariable('radius/lg', 'K2', 'FLOAT');
    const padTop = makeMockLibraryVariable('space/sm', 'K3', 'FLOAT');
    setMockLibraryVariables([radius, padTop]);

    const frame = new FakeNode('FRAME');
    frame.name = 'Card';
    frame.width = 100;
    frame.height = 50;
    frame.boundVariables = {
      cornerRadius: { type: 'VARIABLE_ALIAS', id: radius.id },
      paddingTop: { type: 'VARIABLE_ALIAS', id: padTop.id },
    };

    const spec = await scan(frame);

    expect(spec.keyedBindings).toEqual({
      cornerRadius: { key: 'K2', name: 'radius/lg' },
      // tokenRefs models uniform padding only — the key join carries one side fine.
      paddingTop: { key: 'K3', name: 'space/sm' },
    });
  });

  it('descends into children (the walker hands the map down)', async () => {
    const ink = makeMockLibraryVariable('color/ink', 'K4');
    setMockLibraryVariables([ink]);

    const frame = new FakeNode('FRAME');
    frame.name = 'Card';
    const text = new FakeNode('TEXT');
    text.name = 'Title';
    text.characters = 'Hello';
    text.fills = [{
      type: 'SOLID',
      color: { r: 0, g: 0, b: 0 },
      boundVariables: { color: { type: 'VARIABLE_ALIAS', id: ink.id } },
    }];
    frame.appendChild(text);

    const spec = await scan(frame);

    const child = (spec.children as Array<Record<string, unknown>>)[0];
    expect(child.keyedBindings).toEqual({ fills: { key: 'K4', name: 'color/ink' } });
  });

  it('leaves a LOCAL binding on the tokenRefs path, untouched (regression)', async () => {
    const local = makeMockVariable('color.primary');
    setMockLocalVariables([local]);
    setMockLibraryVariables([]);

    const spec = await scan(boundFrame(local.id));

    expect(spec.tokenRefs).toEqual({ fill: 'color.primary' });
    expect(spec.keyedBindings).toBeUndefined();
  });

  it('an id neither map names stays a raw id only (the honest remaining edge)', async () => {
    const spec = await scan(boundFrame('VariableID:9:999'));

    expect(spec.keyedBindings).toBeUndefined();
    expect(spec.tokenRefs).toBeUndefined();
    expect(spec.figmaScanBindings).toEqual({ fills: 'VariableID:9:999' });
  });
});

describe('rebuild — import by key REATTACHES the published binding (the P7 gap closed)', () => {
  it('binds a fill back to the same library variable, with NO local variable in the file', async () => {
    const lib = makeMockLibraryVariable('color/primary', 'K1');
    setMockLibraryVariables([lib]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      keyedBindings: { fills: { key: 'K1', name: 'color/primary' } },
    });

    expect(paintAliasOf(frame, 'fills')).toBe(lib.id);
    expect(getImportWarnings()).toEqual([]);
    // The import LINKS the published variable — it must never mint a local one.
    expect(await figma.variables.getLocalVariablesAsync()).toEqual([]);
    expect(await figma.variables.getLocalVariableCollectionsAsync()).toEqual([]);
  });

  it('binds scalar fields (cornerRadius, itemSpacing) by key', async () => {
    const radius = makeMockLibraryVariable('radius/lg', 'K2', 'FLOAT');
    const gap = makeMockLibraryVariable('space/md', 'K3', 'FLOAT');
    setMockLibraryVariables([radius, gap]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      layoutMode: 'VERTICAL', itemSpacing: 12, cornerRadius: 8,
      keyedBindings: {
        cornerRadius: { key: 'K2' },
        itemSpacing: { key: 'K3' },
      },
    });

    const bound = frame.boundVariables as Record<string, unknown>;
    expect(aliasOf(bound.cornerRadius)).toBe(radius.id);
    expect(aliasOf(bound.itemSpacing)).toBe(gap.id);
  });

  it('binds a TEXT child by key (the builder applies it at every node type)', async () => {
    const ink = makeMockLibraryVariable('color/ink', 'K4');
    setMockLibraryVariables([ink]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50, layoutMode: 'VERTICAL',
      children: [{
        type: 'TEXT', name: 'Title', characters: 'Hello', fontSize: 16,
        textColor: { r: 1, g: 1, b: 1, a: 1 },
        keyedBindings: { fills: { key: 'K4', name: 'color/ink' } },
      }],
    });

    const text = (frame.children as Array<Record<string, unknown>>)[0];
    expect(paintAliasOf(text, 'fills')).toBe(ink.id);
  });

  it('imports ONCE per key across a tree (the cache), not once per node', async () => {
    const lib = makeMockLibraryVariable('color/primary', 'K1');
    setMockLibraryVariables([lib]);
    let imports = 0;
    const real = figma.variables.importVariableByKeyAsync;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (figma.variables as any).importVariableByKeyAsync = async (key: string) => {
      imports += 1;
      return real(key);
    };

    const kid = (name: string): FigmaExportNode => ({
      type: 'RECTANGLE', name, width: 10, height: 10,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      keyedBindings: { fills: { key: 'K1' } },
    });
    await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50, layoutMode: 'VERTICAL',
      keyedBindings: { fills: { key: 'K1' } },
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      children: [kid('A'), kid('B')],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (figma.variables as any).importVariableByKeyAsync = real;
    expect(imports).toBe(1);
  });
});

describe('unimportable key — honest, not fatal', () => {
  it('warns and keeps the literal fill when the key is unpublished', async () => {
    setMockLibraryVariables([]); // the key resolves to nothing → import throws

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      fills: [{ type: 'SOLID', color: { r: 0.5, g: 0, b: 0, a: 1 } }],
      keyedBindings: { fills: { key: 'K_GONE', name: 'color/primary' } },
    });

    expect(paintAliasOf(frame, 'fills')).toBeUndefined();
    expect((frame.fills as Array<{ color: unknown }>)[0].color).toEqual({ r: 0.5, g: 0, b: 0 });
    const warned = getImportWarnings().join('\n');
    expect(warned).toContain('K_GONE');
    expect(warned).toContain('literal value kept');
  });

  it('a failing key is imported once, then remembered (no retry storm)', async () => {
    setMockLibraryVariables([]);
    let attempts = 0;
    const real = figma.variables.importVariableByKeyAsync;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (figma.variables as any).importVariableByKeyAsync = async (key: string) => {
      attempts += 1;
      return real(key);
    };

    await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50, layoutMode: 'VERTICAL',
      keyedBindings: { fills: { key: 'K_GONE' } },
      children: [{
        type: 'RECTANGLE', name: 'Swatch', width: 10, height: 10,
        keyedBindings: { fills: { key: 'K_GONE' } },
      }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (figma.variables as any).importVariableByKeyAsync = real;
    expect(attempts).toBe(1);
  });
});

// The P8 half: the variable is LOCAL (findable by name), but the FIELD has no
// tokenRefs slot — so the name join never fires and the key is the only way home.
// This is the exact shape of the 15 diffs the live probe found still open after P7.
describe('a LOCAL variable on a slotless FONT field — the P8 gap', () => {
  /** The live probe's three, in miniature: local, keyed, bound to font fields. */
  function fontVars() {
    const family = makeMockKeyedLocalVariable('font/font-sans', 'KL_FAMILY', 'STRING');
    const size = makeMockKeyedLocalVariable('text/lg/font-size', 'KL_SIZE', 'FLOAT');
    const weight = makeMockKeyedLocalVariable('font-weight/normal', 'KL_WEIGHT', 'FLOAT');
    setMockLocalVariables([family, size, weight]);
    return { family, size, weight };
  }

  function fontBoundText(ids: { family: string; size: string; weight: string }): FakeNode {
    const text = new FakeNode('TEXT');
    text.name = 'Title';
    text.characters = 'Hello';
    text.fontSize = 18;
    text.boundVariables = {
      fontFamily: { type: 'VARIABLE_ALIAS', id: ids.family },
      fontSize: { type: 'VARIABLE_ALIAS', id: ids.size },
      fontWeight: { type: 'VARIABLE_ALIAS', id: ids.weight },
    };
    return text;
  }

  it('scan captures a local font binding by KEY (P7 remote-gate would drop it)', async () => {
    const { family, size, weight } = fontVars();

    const spec = await scan(fontBoundText({ family: family.id, size: size.id, weight: weight.id }));

    expect(spec.keyedBindings).toEqual({
      fontFamily: { key: 'KL_FAMILY', name: 'font/font-sans' },
      fontSize: { key: 'KL_SIZE', name: 'text/lg/font-size' },
      fontWeight: { key: 'KL_WEIGHT', name: 'font-weight/normal' },
    });
    // No tokenRefs slot models a font field — that absence IS the gap.
    expect(spec.tokenRefs).toBeUndefined();
  });

  it('rebuild resolves the key against the LOCAL list — no import, no warning', async () => {
    const { family } = fontVars();
    let imports = 0;
    const real = figma.variables.importVariableByKeyAsync;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (figma.variables as any).importVariableByKeyAsync = async (key: string) => {
      imports += 1;
      return real(key);
    };

    const text = await rebuildFromSpecAlone({
      type: 'TEXT', name: 'Title', characters: 'Hello', fontSize: 18,
      keyedBindings: { fontFamily: { key: 'KL_FAMILY', name: 'font/font-sans' } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (figma.variables as any).importVariableByKeyAsync = real;
    expect(aliasOf((text.boundVariables as Record<string, unknown>).fontFamily)).toBe(family.id);
    // A local key is unpublished: importVariableByKeyAsync would THROW on it, so the
    // local road must be tried first — reaching the import at all is the bug.
    expect(imports).toBe(0);
    expect(getImportWarnings()).toEqual([]);
  });

  it('round-trips every font field: specB carries the SAME keyedBindings as specA', async () => {
    const { family, size, weight } = fontVars();

    const specA = await scan(fontBoundText({ family: family.id, size: size.id, weight: weight.id }));
    const rebuilt = await rebuildFromSpecAlone(specA as unknown as FigmaExportNode);
    const specB = await scan(rebuilt as unknown as FakeNode);

    expect(specB.keyedBindings).toEqual(specA.keyedBindings);
    expect(specB.figmaScanBindings).toEqual(specA.figmaScanBindings);
  });

  it('a local variable with NO key stays unreachable — honest, not invented', async () => {
    const keyless = makeMockVariable('font/legacy', 'STRING');
    setMockLocalVariables([keyless]);

    const text = new FakeNode('TEXT');
    text.name = 'Title';
    text.characters = 'Hello';
    text.boundVariables = { fontFamily: { type: 'VARIABLE_ALIAS', id: keyless.id } };

    const spec = await scan(text);

    expect(spec.keyedBindings).toBeUndefined();
    expect(spec.figmaScanBindings).toEqual({ fontFamily: keyless.id });
  });
});

describe('one binding, ONE reversible path — the key join never double-binds P6', () => {
  it('a LOCAL keyed variable in a tokenRefs slot travels as a tokenRef only', async () => {
    // The dangerous case: dropping P7's remote gate means this fill NOW resolves to a
    // key as well as a name. Only the name may claim it — applyTokenRefs rebinds it.
    const local = makeMockKeyedLocalVariable('color/primary', 'KL_FILL');
    setMockLocalVariables([local]);

    const spec = await scan(boundFrame(local.id));

    expect(spec.tokenRefs).toEqual({ fill: 'color/primary' });
    expect(spec.keyedBindings).toBeUndefined();
  });

  it('uniform padding travels as tokenRefs.padding; the key join leaves all four alone', async () => {
    const pad = makeMockKeyedLocalVariable('space/md', 'KL_PAD', 'FLOAT');
    setMockLocalVariables([pad]);

    const frame = new FakeNode('FRAME');
    frame.name = 'Card';
    frame.boundVariables = {
      paddingTop: { type: 'VARIABLE_ALIAS', id: pad.id },
      paddingRight: { type: 'VARIABLE_ALIAS', id: pad.id },
      paddingBottom: { type: 'VARIABLE_ALIAS', id: pad.id },
      paddingLeft: { type: 'VARIABLE_ALIAS', id: pad.id },
    };

    const spec = await scan(frame);

    expect(spec.tokenRefs).toEqual({ padding: 'space/md' });
    expect(spec.keyedBindings).toBeUndefined();
  });

  it('splits a mixed node: the slotted field by name, the slotless one by key', async () => {
    const fill = makeMockKeyedLocalVariable('color/primary', 'KL_FILL');
    const maxW = makeMockKeyedLocalVariable('size/container', 'KL_MAXW', 'FLOAT');
    setMockLocalVariables([fill, maxW]);

    const frame = boundFrame(fill.id);
    frame.boundVariables = { maxWidth: { type: 'VARIABLE_ALIAS', id: maxW.id } };

    const spec = await scan(frame);

    expect(spec.tokenRefs).toEqual({ fill: 'color/primary' });
    expect(spec.keyedBindings).toEqual({ maxWidth: { key: 'KL_MAXW', name: 'size/container' } });
  });
});

describe('the full round trip — scan → rebuild → scan is a fixed point on keyedBindings', () => {
  it('specB carries the SAME keyedBindings specA did', async () => {
    const lib = makeMockLibraryVariable('color/primary', 'K1');
    setMockLibraryVariables([lib]);

    const specA = await scan(boundFrame(lib.id));
    const rebuilt = await rebuildFromSpecAlone(specA as unknown as FigmaExportNode);
    const specB = await scan(rebuilt as unknown as FakeNode);

    expect(specB.keyedBindings).toEqual(specA.keyedBindings);
    // The id survives too: importVariableByKeyAsync links the SAME variable, so the
    // raw-id record round-trips as well.
    expect(specB.figmaScanBindings).toEqual(specA.figmaScanBindings);
  });
});
