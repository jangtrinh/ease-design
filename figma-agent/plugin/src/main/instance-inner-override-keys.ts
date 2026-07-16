// The addressing layer for an instance's INNER (per-child) overrides — the one
// thing both halves of the round-trip must agree on (spec-005 P11).
//
// THE KEY. An instance's inner nodes carry a COMPOUND id: `I<instanceId>;<rest>`,
// where `<rest>` is the node's own id inside the MAIN component (and, for a node
// under a nested instance, the chain of them, `4:5;6:7`). Two instances of the SAME
// main therefore differ only in the `I<instanceId>;` prefix — strip it and what
// remains is a key that names the same inner node in both. That is what lets a scan
// record "child <rest> overrides layoutGrow" and a rebuild find the twin child.
//
// PREMISE, NOT PROBED (offline work — the live run arbitrates): the compound-id
// shape above is Figma's documented editor/REST convention, but @figma/plugin-typings
// types `InstanceNode.overrides[].id` as a bare `string` and says nothing about its
// composition. So this module NEVER CONSTRUCTS an id: both sides DERIVE keys by
// stripping the prefix off ids Figma itself handed them (`keyInnerChildren` walks
// the live children). If the premise is wrong the keys simply fail to match, the
// rebuild reapplies nothing, and `figmaScanInnerOverrides` still reports the loss —
// a fail-safe, not a silent mis-write onto the wrong node.
//
// WHY NOT a child-index path: it would need no id knowledge, but it mis-maps
// SILENTLY when the two subtrees differ (a variant swap, a nested instance) — it
// always finds *a* node. Fail-safe beats format-independence here.

import { safe } from './scan-node-utils';

/**
 * The inner-override fields that survive a rebuild — i.e. the ones this codebase can
 * both READ off a live child and WRITE back onto its twin.
 *
 * Names are Figma's `NodeChangeProperty` values (what `overrides[].overriddenFields`
 * reports), NOT payload field names — an inner override is replayed field-for-field.
 * Anything outside this list (characters, fontName, fills, effects…) is left to
 * `figmaScanInnerOverrides`: recorded as a visible loss, never faked closed.
 */
export const INNER_OVERRIDE_FIELDS = [
  'name',
  'width',
  'height',
  'layoutGrow',
  'textAutoResize',
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
] as const;

export type InnerOverrideField = (typeof INNER_OVERRIDE_FIELDS)[number];

const FIELD_SET: ReadonlySet<string> = new Set(INNER_OVERRIDE_FIELDS);

/** True when `field` is one of the reapplyable inner-override fields. */
export function isInnerOverrideField(field: string): field is InnerOverrideField {
  return FIELD_SET.has(field);
}

/**
 * The prefix every inner descendant of `instanceId` carries.
 *
 * PROBED on the live canvas (spec-005 P13) — the `I` is a marker on the OUTERMOST
 * instance id only, never re-added per level:
 *   - a top-level instance `25579:376847` → children `I25579:376847;<chain>`
 *   - a NESTED instance, whose own id is already compound
 *     (`I25579:377511;21174:14662`) → children `I25579:377511;21174:14662;<child>`,
 *     i.e. `<selfId>;<child>` with NO second `I`.
 * Blindly writing `I${id};` therefore produced `II25579:377511;…` and matched
 * nothing whenever the scan root was itself a nested instance.
 */
function innerChildPrefix(instanceId: string): string {
  return instanceId.startsWith('I') ? `${instanceId};` : `I${instanceId};`;
}

/**
 * `I<instanceId>;<rest>` → `<rest>`; anything else → undefined.
 * Undefined is the honest answer, not an error: an id that does not carry the
 * prefix cannot be addressed in a rebuilt twin, so it must not be reapplied.
 */
export function innerChildKey(instanceId: string, nodeId: string): string | undefined {
  const prefix = innerChildPrefix(instanceId);
  return nodeId.startsWith(prefix) && nodeId.length > prefix.length
    ? nodeId.slice(prefix.length)
    : undefined;
}

/**
 * Every inner descendant of `instance`, keyed by its main-relative key.
 *
 * Sync on purpose — the scan walker must stay bundleable. PREMISE, NOT PROBED:
 * `.children` on an instance is a plain sync read under the plugin's
 * `documentAccess: "dynamic-page"` manifest (unlike `.mainComponent`, which throws
 * there). Every read is `safe()`-wrapped, so a getter that turns out to refuse
 * yields an empty map — the fail-safe again, never a throw mid-scan.
 */
export function keyInnerChildren(
  instance: Record<string, unknown>,
  instanceId: string,
  maxNodes = 2000,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const visit = (node: Record<string, unknown>): void => {
    if (map.size >= maxNodes) return;
    const kids = safe(() => node.children as Array<Record<string, unknown>>);
    if (!Array.isArray(kids)) return;
    for (const kid of kids) {
      const id = safe(() => kid.id as string);
      if (typeof id === 'string') {
        const key = innerChildKey(instanceId, id);
        if (key !== undefined) map.set(key, kid);
      }
      visit(kid);
    }
  };
  visit(instance);
  return map;
}
