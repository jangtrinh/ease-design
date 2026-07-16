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
 * The instance's inner overrides, as (childKey → field values) pairs.
 * Sorted by childKey, fields in a stable order, so a rescan of a rebuild compares
 * equal to the original — the mirror asks for a fixed point, not a set.
 */
export function readInnerOverrides(n: Record<string, unknown>, selfId: string): FigmaInnerOverride[] {
  const entries = overrideEntries(n).filter((o) => o && o.id !== selfId && o.overriddenFields?.length);
  if (!entries.length) return [];
  const byKey = keyInnerChildren(n, selfId);
  const out: FigmaInnerOverride[] = [];
  for (const entry of entries) {
    const key = typeof entry.id === 'string' ? innerChildKey(selfId, entry.id) : undefined;
    const child = key !== undefined ? byKey.get(key) : undefined;
    // No key (unexpected id shape) or no live child → not addressable in a rebuilt
    // twin. figmaScanInnerOverrides still names the fields: a loss, still visible.
    if (key === undefined || !child) continue;
    const fields = readOverriddenValues(child, entry.overriddenFields ?? []);
    if (Object.keys(fields).length) out.push({ childKey: key, fields });
  }
  return out.sort((a, b) => (a.childKey < b.childKey ? -1 : a.childKey > b.childKey ? 1 : 0));
}
