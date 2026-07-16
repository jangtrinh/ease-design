// spec-005 P7/P8 — the KEY half of the binding join.
//
// THE GAP THIS CLOSES: spec-005 P1 made a binding reversible by joining its
// variable id to a NAME through the file's local variable map, and P6 made the
// rebuild look that name back up. That join only ever fires for the five fields
// tokenRefs models (fill/textColor/stroke/radius/gap) — every OTHER bound field
// (fontFamily, fontSize, fontWeight, lineHeight, maxWidth, per-side padding…) has
// no slot to travel in, so it died on the rebuild no matter where its variable
// lived. P7 built the escape hatch for the published case; the live probe of
// 25575:353653 then showed the remaining 15 diffs were LOCAL variables
// (`remote: false` — font/font-sans, text/lg/font-size, font-weight/normal) bound
// to FONT fields, a case P7's `remote === true` gate threw away.
//
// So the gate is gone: a variable is addressed here by its publish KEY whether it
// is local or remote, because the key is the only handle that survives BOTH the
// tokenRefs slot vocabulary and the boundary between files.
// `getVariableByIdAsync` answers for either kind and hands back the `.key` the
// rebuild resolves — local-by-key against getLocalVariablesAsync first, then
// `importVariableByKeyAsync` for a published one (see executor-keyed-vars).
//
// Same async-pre-pass shape as readTokenNameMap / readMainComponentMap, for the
// same reason: the walker stays SYNC and bundleable, so all the async lives here.
// The PURE half of this join (id→key map + bindings → keyedBindings) lives with
// its token twin in scan-token-refs.ts, which keeps this module free of any import
// back from the walker — no cycle.

import type { FigmaKeyedBinding } from '../../../shared/figma-payload-types';
import { readBindings } from './scan-node-instance';

/** Every bound variable id in the subtree. Sync + mirrors nodeToSpec's recursion:
 * it does NOT descend into an INSTANCE, whose inner tree the spec never captures. */
function collectBoundVariableIds(root: SceneNode): Set<string> {
  const ids = new Set<string>();
  const visit = (node: SceneNode): void => {
    for (const id of Object.values(readBindings(node as unknown as Record<string, unknown>))) ids.add(id);
    if (node.type !== 'INSTANCE' && 'children' in node) {
      for (const child of (node as SceneNode & ChildrenMixin).children) visit(child as SceneNode);
    }
  };
  visit(root);
  return ids;
}

/**
 * variable id → its publish key, for EVERY variable bound in the subtree — local
 * and remote alike.
 *
 * No `remote` filter and no local-id exclusion, both deliberate: a local variable
 * carries a key too, and that key is the only way home for a field with no
 * tokenRefs slot. The two joins are kept from fighting over one field downstream,
 * in bindingsToKeyedBindings — which drops any field the token join already
 * claimed — not here, because only that pure function knows the slot vocabulary.
 *
 * An id that resolves to nothing (deleted variable, library unsubscribed) or to a
 * keyless variable contributes no entry and stays visible as a raw id in
 * `figmaScanBindings`, exactly as before.
 *
 * Never throws: a Variables API that refuses simply yields an empty map, and the
 * scan degrades to the pre-P7 behaviour.
 */
export async function readKeyedVariableMap(root: SceneNode): Promise<Map<string, FigmaKeyedBinding>> {
  const map = new Map<string, FigmaKeyedBinding>();
  for (const id of collectBoundVariableIds(root)) {
    try {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (!v || typeof v.key !== 'string' || !v.key) continue;
      const ref: FigmaKeyedBinding = { key: v.key };
      if (typeof v.name === 'string' && v.name) ref.name = v.name;
      map.set(id, ref);
    } catch {
      // Unreachable variable → no ref; the raw id still shows in figmaScanBindings.
    }
  }
  return map;
}
