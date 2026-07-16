// The one way this codebase turns a component REF into a live ComponentNode.
//
// Extracted in spec-005 P12 for the reason the hard-won rules name: an inner child's
// SWAP target must resolve exactly as an instance's own main does, and patching a
// second copy into the inner-override path would be the "fix it where it surfaced"
// mistake. Two callers, one resolver — executor-instance (the instance's main) and
// executor-instance-inner-overrides (a swapped inner slot's main).
//
// Its own module rather than either caller's, because those two import each other:
// this is the shared leaf, so neither has to reach through the other for it.

/**
 * Resolve a main component: library/published key first, local id second.
 *
 * Both paths are needed and neither is redundant. `importComponentByKeyAsync` is the
 * portable one — it reaches a published library component from any file — but it
 * REFUSES an unpublished local component, which is precisely what a same-file slot
 * swap points at (live P5: `_Shell / Page content demo`, local, unpublished). The id
 * fallback answers there, and only there.
 *
 * Null is the honest answer for an unresolvable ref, never a throw: the caller
 * degrades and reports, and the loss stays visible.
 */
export async function resolveMainComponent(
  ref: { componentKey?: string; componentId?: string },
): Promise<ComponentNode | null> {
  if (ref.componentKey) {
    try {
      return await figma.importComponentByKeyAsync(ref.componentKey);
    } catch { /* not a published/reachable key → try the local id */ }
  }
  if (ref.componentId) {
    try {
      const local = await figma.getNodeByIdAsync(ref.componentId);
      if (local && local.type === 'COMPONENT') return local;
      if (local && local.type === 'COMPONENT_SET') return local.defaultVariant;
    } catch { /* id from another file / stale → unresolvable */ }
  }
  return null;
}
