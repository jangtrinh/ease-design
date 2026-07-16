// spec-005 P7 — the LIBRARY half of the binding join.
//
// THE GAP THIS CLOSES: spec-005 P1 made a binding reversible by joining its
// variable id to a NAME through the file's local variable map, and P6 made the
// rebuild look that name back up. Both legs die on a library variable: the design
// system the owner actually uses ("Platform - Design System") binds to PUBLISHED
// variables, which `getLocalVariablesAsync` does not list — so the id resolved to
// no name, no tokenRef was emitted, the raw id sat in `figmaScanBindings`, and the
// rebuild reattached nothing. The first live mirror-verify put a number on it: 15
// of 24 diffs were exactly this.
//
// The fix is the variable twin of the P2 instance model: address the thing by its
// PUBLISH KEY, not by a name only its home file can resolve. `getVariableByIdAsync`
// answers for remote variables where the local list does not, and hands back the
// `.key` that `importVariableByKeyAsync` links back on the rebuild side.
//
// Same async-pre-pass shape as readTokenNameMap / readMainComponentMap, for the
// same reason: the walker stays SYNC and bundleable, so all the async lives here.
// The PURE half of this join (id→key map + bindings → libraryBindings) lives with
// its token twin in scan-token-refs.ts, which keeps this module free of any import
// back from the walker — no cycle.

import type { FigmaLibraryBinding } from '../../../shared/figma-payload-types';
import { readBindings } from './scan-node-instance';

/** Every bound variable id in the subtree, minus the ones the local map already
 * names. Sync + mirrors nodeToSpec's recursion: it does NOT descend into an
 * INSTANCE, whose inner tree the spec never captures. */
function collectForeignBindingIds(root: SceneNode, localIds?: ReadonlyMap<string, string>): Set<string> {
  const ids = new Set<string>();
  const visit = (node: SceneNode): void => {
    for (const id of Object.values(readBindings(node as unknown as Record<string, unknown>))) {
      if (!localIds?.has(id)) ids.add(id);
    }
    if (node.type !== 'INSTANCE' && 'children' in node) {
      for (const child of (node as SceneNode & ChildrenMixin).children) visit(child as SceneNode);
    }
  };
  visit(root);
  return ids;
}

/**
 * variable id → its publish key, for every LIBRARY variable bound in the subtree.
 *
 * `localIds` is readTokenNameMap's id→name map: an id it already names is local and
 * travels as a tokenRef, so it is never asked about here. What remains is asked of
 * `getVariableByIdAsync` — the one call that answers for a remote variable — and
 * kept ONLY when Figma confirms `remote === true` with a key. An id that resolves to
 * nothing (deleted variable, library unsubscribed) contributes no entry and stays
 * visible as a raw id in `figmaScanBindings`, exactly as before.
 *
 * Never throws: a Variables API that refuses simply yields an empty map, and the
 * scan degrades to the pre-P7 behaviour.
 */
export async function readLibraryVariableMap(
  root: SceneNode,
  localIds?: ReadonlyMap<string, string>,
): Promise<Map<string, FigmaLibraryBinding>> {
  const map = new Map<string, FigmaLibraryBinding>();
  for (const id of collectForeignBindingIds(root, localIds)) {
    try {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (!v || v.remote !== true || typeof v.key !== 'string' || !v.key) continue;
      const ref: FigmaLibraryBinding = { key: v.key };
      if (typeof v.name === 'string' && v.name) ref.name = v.name;
      map.set(id, ref);
    } catch {
      // Unreachable variable → no ref; the raw id still shows in figmaScanBindings.
    }
  }
  return map;
}
