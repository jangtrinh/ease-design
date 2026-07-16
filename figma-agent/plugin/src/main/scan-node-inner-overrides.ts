// Reverse-walker: an INSTANCE's inner (per-child) overrides — the reading half of
// spec-005 P11. The writing half is executor-instance-inner-overrides.ts; the
// addressing both stand on is instance-inner-override-keys.ts.
//
// TWO readers, deliberately, over the ONE `InstanceNode.overrides` report:
//   - readInnerOverrideFields → the TOTAL, as field NAMES (`figmaScanInnerOverrides`,
//     shipped in P2). Every field overridden on an inner child, reapplyable or not.
//   - readInnerOverrides → the REVERSIBLE SUBSET, as childKey + field VALUES
//     (`innerOverrides`, P11). Only the fields this codebase can write back.
// Keeping both is the point: when they disagree, the difference is precisely the
// loss that remains, and it stays on the record instead of being normalised away.

import type { FigmaInnerOverride } from '../../../shared/figma-payload-types';
import { INNER_OVERRIDE_FIELDS, innerChildKey, keyInnerChildren } from './instance-inner-override-keys';
import type { MainComponentRef } from './scan-node-instance';
import { r2, safe } from './scan-node-utils';

/** One override entry as `InstanceNode.overrides` reports it. */
type OverrideEntry = { id?: string; overriddenFields?: string[] };

const overrideEntries = (n: Record<string, unknown>): OverrideEntry[] => {
  const o = safe(() => n.overrides as OverrideEntry[]);
  return Array.isArray(o) ? o : [];
};

/**
 * Fields overridden on the instance's INNER children (deduped + sorted).
 * `InstanceNode.overrides` reports one entry per overridden node; entries for the
 * instance node ITSELF are excluded — those are node-level overrides the payload
 * models and the builder re-applies.
 */
export function readInnerOverrideFields(n: Record<string, unknown>, selfId: string): string[] {
  const fields = new Set<string>();
  for (const o of overrideEntries(n)) {
    if (!o || o.id === selfId) continue;
    for (const f of o.overriddenFields ?? []) fields.add(f);
  }
  return [...fields].sort();
}

/**
 * An inner child's overridden field VALUES, read off the live child.
 * Only `INNER_OVERRIDE_FIELDS` are read — the fields a rebuild can write back — and
 * only when the value is the primitive the setter takes. Everything else is left to
 * `figmaScanInnerOverrides`; capturing a value we could not replay would just move
 * the loss somewhere less honest.
 */
function readOverriddenValues(
  child: Record<string, unknown>,
  fields: string[],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const wanted = new Set(fields);
  // Iterate the WHITELIST, not Figma's report: key order becomes deterministic, so
  // two scans of the same state serialise identically.
  for (const field of INNER_OVERRIDE_FIELDS) {
    if (!wanted.has(field)) continue;
    const v = safe(() => child[field]);
    if (typeof v === 'string' && v.length) out[field] = v;
    // Sub-pixel sizes get the same r2 the walker gives every other dimension, so a
    // rescan of the rebuilt child compares equal instead of drifting in the tail.
    else if (typeof v === 'number' && Number.isFinite(v)) {
      out[field] = field === 'width' || field === 'height' ? r2(v) : v;
    }
  }
  return out;
}

/**
 * An inner INSTANCE child's own component/variant property VALUES (spec-005 P13).
 *
 * The most common inner override on real files, and the one P11/P12 never carried:
 * `overrides[].overriddenFields` names the field `componentProperties`, but the
 * VALUES live on the child, exactly where `readInstance` reads the outer
 * instance's. Read only when Figma named the field — an instance always exposes
 * `componentProperties`, so reading it unconditionally would record the main's own
 * defaults as an override the source never had.
 *
 * `string | boolean` only, matching readInstance: an INSTANCE_SWAP value is a node
 * id (replayed by the swap ref, not here) and a variable-bound value is a
 * VariableAlias object — neither has a reversible slot, so both are left to
 * `figmaScanInnerOverrides`.
 */
function readChildComponentProperties(
  child: Record<string, unknown>,
  fields: string[],
): Record<string, string | boolean> | undefined {
  if (!fields.includes('componentProperties')) return undefined;
  if (safe(() => child.type) !== 'INSTANCE') return undefined;
  const props = safe(() => child.componentProperties as Record<string, { value?: unknown }>);
  if (!props || typeof props !== 'object') return undefined;
  const rec: Record<string, string | boolean> = {};
  // Sorted: the mirror wants a fixed point, so a rescan must serialise identically.
  for (const k of Object.keys(props).sort()) {
    const v = safe(() => props[k]?.value);
    if (typeof v === 'string' || typeof v === 'boolean') rec[k] = v;
  }
  return Object.keys(rec).length ? rec : undefined;
}

/**
 * The main-component ref of an inner child that is itself an INSTANCE.
 *
 * Recorded UNCONDITIONALLY for every overridden inner instance, not just the ones we
 * believe were swapped: telling a swap from the main's own child would mean reading
 * the main's inner tree (async, and a second source of truth to drift). The rebuild
 * compares against what it actually finds and no-ops when they agree — the decision
 * lands where the answer is free and certain.
 *
 * `mainComps` comes from the same async pre-pass that resolves the instance's own
 * main: under `documentAccess: "dynamic-page"` the sync getter throws, and this
 * walker must stay sync + bundleable.
 */
function readSwapRef(
  child: Record<string, unknown>,
  childId: string | undefined,
  mainComps?: ReadonlyMap<string, MainComponentRef>,
): { componentKey?: string; componentId?: string } | undefined {
  if (safe(() => child.type) !== 'INSTANCE' || !childId) return undefined;
  const ref = mainComps?.get(childId);
  if (!ref) return undefined;
  const out: { componentKey?: string; componentId?: string } = {};
  if (ref.key) out.componentKey = ref.key;
  if (ref.id) out.componentId = ref.id;
  return out.componentKey || out.componentId ? out : undefined;
}

/**
 * The instance's inner overrides, as (childKey → field values) pairs.
 * Sorted by childKey, fields in a stable order, so a rescan of a rebuild compares
 * equal to the original — the mirror asks for a fixed point, not a set.
 */
export function readInnerOverrides(
  n: Record<string, unknown>,
  selfId: string,
  mainComps?: ReadonlyMap<string, MainComponentRef>,
): FigmaInnerOverride[] {
  // NOT filtered on `overriddenFields.length`: a SWAPPED inner child can be listed
  // with no field names at all (the swap is the override, and Figma does not name it),
  // and dropping that entry is exactly how P11 rebuilt the wrong component in silence.
  const entries = overrideEntries(n).filter((o) => o && o.id !== selfId);
  if (!entries.length) return [];
  const byKey = keyInnerChildren(n, selfId);
  const out: FigmaInnerOverride[] = [];
  for (const entry of entries) {
    const key = typeof entry.id === 'string' ? innerChildKey(selfId, entry.id) : undefined;
    const child = key !== undefined ? byKey.get(key) : undefined;
    // No key (unexpected id shape) or no live child → not addressable in a rebuilt
    // twin. figmaScanInnerOverrides still names the fields: a loss, still visible.
    if (key === undefined || !child) continue;
    const overridden = entry.overriddenFields ?? [];
    const fields = readOverriddenValues(child, overridden);
    const swap = readSwapRef(child, entry.id, mainComps);
    const props = readChildComponentProperties(child, overridden);
    // An entry earns its place if ANY half is reversible: a swapped inner slot can
    // carry no replayable field at all (live P5: every field of the swapped child
    // equalled the main's, so the fields alone rebuilt a byte-identical WRONG node),
    // and a variant picked inside a slot carries ONLY componentProperties (live P13).
    if (Object.keys(fields).length || swap || props) {
      out.push({ childKey: key, fields, ...swap, ...(props ? { componentProperties: props } : {}) });
    }
  }
  return out.sort((a, b) => (a.childKey < b.childKey ? -1 : a.childKey > b.childKey ? 1 : 0));
}
