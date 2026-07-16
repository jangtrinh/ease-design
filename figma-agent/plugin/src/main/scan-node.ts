// Reverse-walker (spec 005): live SceneNode subtree → FigmaExportNode.
// The SYMMETRIC inverse of the build path — where build-frame.ts walks DOM+CSS
// into a FigmaExportNode and executor-frame.createFigmaNode replays that spec onto
// the canvas, `nodeToSpec` reads the ACTUAL node fields the executor writes back
// into a FigmaExportNode, so `node → spec → node` can be proven a fixed point.
//
// Sub-walkers live in scan-node-{layout,text,paint,instance,utils}.ts (Art IX);
// this module owns only the type mapping and the recursion. Everything stays pure
// and sync so the CLI `scan-node` command can esbuild-bundle it into an EXEC_JS
// script. Runs in the Figma plugin sandbox (browser platform, no node APIs) and
// never throws on a missing field.
//
// SCOPE — reversible since spec-005 P1: variable bindings (`nodeToSpec` takes the
// file's id→name token map, see readTokenNameMap, and rebuilds `tokenRefs`, which
// the build path reattaches by name). Reversible since P2: INSTANCE nodes, as
// ref + overrides (see scan-node-instance.ts). Reversible since P7/P8: every OTHER
// binding — a PUBLISHED library variable, and any variable (local included) on a
// field tokenRefs has no slot for — as publish keys (see scan-keyed-vars.ts). Still
// captured as extensions only, with no reversible slot: COMPONENT / COMPONENT_SET
// definitions and an instance's INNER (per-child) overrides.

import type { FigmaExportEffect, FigmaExportNode, FigmaKeyedBinding } from '../../../shared/figma-payload-types';
import type { ScannedNode } from './scan-node-types';
import { readExtensions, readInstance, type MainComponentRef } from './scan-node-instance';
import { readLayout, readSelfSizing } from './scan-node-layout';
import { asFills, effectToExport, readIndividualStrokeWeights } from './scan-node-paint';
import { readText } from './scan-node-text';
import { r2, safe } from './scan-node-utils';

export type { ScanExtensions, ScannedNode } from './scan-node-types';
export type { MainComponentRef } from './scan-node-instance';
// Re-exported so the bundled walker (`__scan.*`, see cli/src/commands/scan-node.ts)
// can run the THIRD async pre-pass alongside the other two.
export { readKeyedVariableMap } from './scan-keyed-vars';

/** Figma node.type → FigmaExportNode.type (the only ones the schema models). */
function mapType(t: string): FigmaExportNode['type'] {
  if (t === 'TEXT') return 'TEXT';
  if (t === 'GROUP') return 'GROUP';
  if (t === 'INSTANCE') return 'INSTANCE';
  if (t === 'RECTANGLE' || t === 'ELLIPSE' || t === 'VECTOR'
    || t === 'LINE' || t === 'STAR' || t === 'POLYGON') return 'RECTANGLE';
  return 'FRAME'; // FRAME / COMPONENT / COMPONENT_SET / SECTION
}

/**
 * The file's variable id → name map — the join source that makes bindings
 * reversible. Same source as serializeDesignSystem's `tokens` (local variables
 * only; library/remote variables are NOT listed → documented edge). Async, so it
 * runs ONCE per scan and keeps `nodeToSpec` synchronous; never throws.
 */
export async function readTokenNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const vars = await figma.variables.getLocalVariablesAsync();
    for (const v of vars) map.set(v.id, v.name);
  } catch {
    // Variables API unavailable (older Figma / restricted plan) → no tokenRefs.
  }
  return map;
}

/**
 * Resolve the mains of the inner children Figma named in `instance.overrides`.
 *
 * TARGETED on purpose: an instance's inner tree runs to hundreds of nodes (196 on the
 * live P5 gate) and each resolve is an async round-trip, but only an OVERRIDDEN inner
 * child can carry a swap. Figma hands us those ids directly, so this asks about those
 * and nothing else.
 *
 * The compound inner id (`I<instanceId>;<mainChildId>`) resolves through
 * getNodeByIdAsync — probed live, not assumed. A failure just yields no entry, and
 * the swap then stays a visible loss instead of a wrong write.
 */
async function readOverriddenInnerMains(
  instance: InstanceNode,
  resolve: (node: SceneNode) => Promise<void>,
): Promise<void> {
  let entries: readonly { id?: string }[] = [];
  try {
    entries = instance.overrides ?? [];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (typeof entry?.id !== 'string' || entry.id === instance.id) continue;
    try {
      const inner = await figma.getNodeByIdAsync(entry.id);
      if (inner && inner.type === 'INSTANCE') await resolve(inner as SceneNode);
    } catch {
      // Unresolvable inner id → no ref; readInnerOverrides records no swap.
    }
  }
}

/**
 * instance id → its MAIN component's identity, for every INSTANCE in the subtree.
 *
 * The second async pre-pass, and for the same reason as readTokenNameMap: the only
 * API that resolves a main under `documentAccess: "dynamic-page"` is the ASYNC
 * `getMainComponentAsync()` — the sync `mainComponent` getter throws outright, so a
 * sync walker alone can never see a component ref (proven on the live canvas: every
 * scanned INSTANCE came back with componentKey/Id/Name null). Runs ONCE per scan and
 * hands `nodeToSpec` a plain map, so the walker stays synchronous and bundleable.
 *
 * Does NOT descend into an instance's STRUCTURE — mirroring nodeToSpec, whose spec
 * stops there. It does resolve the mains of the inner children Figma itself named as
 * overridden (see readOverriddenInnerMains): those are refs, not structure.
 * Never throws: an unreachable main just contributes no entry.
 */
export async function readMainComponentMap(root: SceneNode): Promise<Map<string, MainComponentRef>> {
  const map = new Map<string, MainComponentRef>();
  const resolve = async (node: SceneNode): Promise<void> => {
    try {
      const main = await (node as InstanceNode).getMainComponentAsync();
      if (main) {
        const ref: MainComponentRef = {};
        if (typeof main.key === 'string' && main.key) ref.key = main.key;
        if (typeof main.id === 'string' && main.id) ref.id = main.id;
        if (typeof main.name === 'string' && main.name) ref.name = main.name;
        map.set(node.id, ref);
      }
    } catch {
      // Main in an unloaded library / deleted → no ref (the documented P2 edge).
    }
  };
  const visit = async (node: SceneNode): Promise<void> => {
    if (node.type === 'INSTANCE') {
      await resolve(node);
      await readOverriddenInnerMains(node as InstanceNode, resolve);
      return; // an instance's composition is the main's — nothing below to map
    }
    if ('children' in node) {
      for (const child of (node as SceneNode & ChildrenMixin).children) await visit(child as SceneNode);
    }
  };
  await visit(root);
  return map;
}

/** Fills, corner radius, strokes, constraints, clipping — the frame-ish visuals. */
function readFrameVisuals(n: Record<string, unknown>, out: ScannedNode): void {
  out.fills = asFills(n.fills);
  if (out.fills === undefined) delete out.fills;

  // Corner radius: uniform number, else per-corner (getter throws figma.mixed).
  const cr = safe(() => n.cornerRadius as number);
  if (typeof cr === 'number' && cr > 0) {
    out.cornerRadius = cr;
  } else {
    const tl = safe(() => n.topLeftRadius as number) ?? 0;
    const tr = safe(() => n.topRightRadius as number) ?? 0;
    const br = safe(() => n.bottomRightRadius as number) ?? 0;
    const bl = safe(() => n.bottomLeftRadius as number) ?? 0;
    if (tl || tr || br || bl) out.cornerRadii = { tl, tr, br, bl };
  }

  const strokes = asFills(n.strokes);
  if (strokes) {
    out.strokes = strokes;
    // strokeWeight answers figma.mixed (a symbol — safe() drops it) exactly when the
    // node carries INDIVIDUAL side weights. Reading only the uniform value is why
    // the live P5 divider scanned with no weight at all, and rebuilt as a 1px box.
    const w = safe(() => n.strokeWeight as number);
    if (typeof w === 'number') out.strokeWeight = w;
    else {
      const sides = readIndividualStrokeWeights(n);
      if (sides) out.strokeWeights = sides;
    }
    if (n.strokeAlign) out.strokeAlign = n.strokeAlign as FigmaExportNode['strokeAlign'];
  }

  for (const k of ['maxWidth', 'minWidth', 'maxHeight', 'minHeight'] as const) {
    if (typeof n[k] === 'number') out[k] = n[k] as number;
  }
  if (n.clipsContent === true) out.clipsContent = true;
  if (n.blendMode && n.blendMode !== 'PASS_THROUGH' && n.blendMode !== 'NORMAL') {
    out.blendMode = n.blendMode as string;
  }
}

/**
 * Walk one live SceneNode subtree → FigmaExportNode (+ scan extensions).
 * `tokenNames` (from readTokenNameMap) turns variable ids into reversible
 * tokenRefs; omit it and bindings degrade to raw ids only.
 * `mainComps` (from readMainComponentMap) carries each INSTANCE's main-component
 * ref; omit it and the walker falls back to the sync getter, which resolves nothing
 * under a dynamic-page manifest.
 * `keyedVars` (from readKeyedVariableMap) turns every binding `tokenRefs` cannot
 * carry — a PUBLISHED library variable, or ANY variable (local included) on a field
 * with no tokenRefs slot (font*, maxWidth, per-side padding…) — into reversible
 * `keyedBindings`; omit it and those degrade to raw ids, as before spec-005 P7/P8.
 * INSTANCE composition is NOT recursed: an instance is captured as a reference to
 * its main component plus its overrides (spec-005 P2) — the inner tree is the
 * component's definition, and the builder rebuilds it via createInstance().
 */
export function nodeToSpec(
  node: SceneNode,
  tokenNames?: Map<string, string>,
  mainComps?: Map<string, MainComponentRef>,
  keyedVars?: ReadonlyMap<string, FigmaKeyedBinding>,
): ScannedNode {
  const n = node as unknown as Record<string, unknown>;
  const type = node.type;
  const out: ScannedNode = { type: mapType(type), name: node.name };

  const w = safe(() => node.width);
  const h = safe(() => node.height);
  if (typeof w === 'number' && w > 0) out.width = r2(w);
  if (typeof h === 'number' && h > 0) out.height = r2(h);

  readSelfSizing(n, out); // applies to text + frame children alike

  if (out.type === 'TEXT') {
    readText(n, out);
  } else {
    readLayout(n, out);
    readFrameVisuals(n, out);
  }

  // Shared visual fields (frame + text): effects, opacity, rotation.
  const effects = safe(() => n.effects as Effect[]);
  if (Array.isArray(effects) && effects.length) {
    const mapped = effects.map(effectToExport).filter((e): e is FigmaExportEffect => e !== null);
    if (mapped.length) out.effects = mapped;
  }
  if (typeof n.opacity === 'number' && n.opacity < 1 && n.opacity > 0) out.opacity = n.opacity;
  if (typeof n.rotation === 'number' && Math.abs(n.rotation) > 0.001) out.rotation = n.rotation;

  readExtensions(n, out, tokenNames, keyedVars);
  if (type === 'INSTANCE') readInstance(n, out, node.id, mainComps?.get(node.id), mainComps, keyedVars);

  // Children — recurse, EXCEPT into an instance (composition is the component's).
  if (type !== 'INSTANCE' && 'children' in node) {
    const kids = (node as SceneNode & ChildrenMixin).children;
    if (kids.length) out.children = kids.map((c) => nodeToSpec(c as SceneNode, tokenNames, mainComps, keyedVars));
  }

  return out;
}
