// The mirror linter's ALIGNMENT layer (spec-005 P16) — how structural-diff decides
// that two arrays are two views of the SAME set, and pairs their members up by name
// instead of by position.
//
// THE BUG THIS CLOSES. `innerOverrides` and `figmaScanInnerOverrides` are SETS that
// happen to be serialised as sorted arrays: an instance's inner overrides, keyed by
// childKey, and the field names those overrides touch. Compared by INDEX, one missing
// member shifts every later member by one and each shift is reported as a diff —
// so the live gate on node 25579:749755 reported 43 diffs for 5 real ones, and the
// real ones were unreadable underneath a cascade of "[6].childKey: A vs B" noise
// that named two entirely different children.
//
// THE RULE — and it is what makes this safe to put in a schema-agnostic linter:
// alignment only changes HOW a difference is REPORTED, never WHETHER there is one.
// Both predicates below demand a STRICTLY ASCENDING key sequence on BOTH sides, and
// under that precondition:
//   - a sorted, duplicate-free array is the unique canonical form of its key set, so
//     `keys(a) === keys(b)` elementwise IFF `set(a) === set(b)`;
//   - therefore when the key sets match, keyed pairing IS index pairing, member for
//     member — the identical comparison;
//   - and when they do not, both schemes report unequal. Keyed just says WHICH member
//     is missing rather than smearing the shift across the tail.
// So `equal` is provably unchanged for every input. An array that is not strictly
// ascending (an ordered one — `children`, `fills`, `effects`) fails the guard and
// keeps positional comparison, which is the semantics it needs: for those, position
// IS the identity.

/** A plain object — same stance as structural-diff (walks JSON, not the type). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** True when `keys` is strictly ascending — which also proves it duplicate-free. */
function strictlyAscending(keys: string[]): boolean {
  for (let i = 1; i < keys.length; i++) if (!(keys[i - 1] < keys[i])) return false;
  return true;
}

/**
 * An array of `{childKey, …}` entries in strictly-ascending childKey order — the
 * shape `readInnerOverrides` emits (it builds from a Map and sorts by childKey, so a
 * real scan always qualifies).
 *
 * Recognised by SHAPE, not by field name at a known path: the linter stays
 * schema-agnostic, and any future keyed collection the walker adds is aligned the day
 * it appears.
 */
export function innerOverrideKeys(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const keys: string[] = [];
  for (const e of v) {
    if (!isPlainObject(e) || typeof e.childKey !== 'string') return undefined;
    keys.push(e.childKey);
  }
  return strictlyAscending(keys) ? keys : undefined;
}

/**
 * An array of strings in strictly-ascending order — a SET the walker serialised
 * sorted (`figmaScanInnerOverrides`, `figmaScanUnbindable`, …).
 *
 * A string array whose order is meaningful is not ascending in general, so it falls
 * through to positional comparison; and in the case where it happens to be, the proof
 * in the header says the verdict is the same either way.
 */
export function stringSetMembers(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  for (const e of v) if (typeof e !== 'string') return undefined;
  return strictlyAscending(v as string[]) ? (v as string[]) : undefined;
}

/** Every key present on either side, in one deterministic (sorted) order. */
export function unionKeys(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}
