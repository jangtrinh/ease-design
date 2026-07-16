// The mirror's LINTER (Art II): a deep, path-reporting comparison of two
// FigmaExportNode specs. `mirror-verify` asks "did scan → rebuild → scan land on
// the same spec?" — a boolean answer is useless when it says NO, so this reports
// exactly WHICH field lost the round-trip, as a JSON path (e.g.
// `children[0].fills[0].color.a`).
//
// Deliberately schema-agnostic: it walks the JSON, not the FigmaExportNode type.
// A field added to the walker is compared the day it appears, with no edit here.
//
// Conventions, all of them load-bearing for a HONEST verdict:
//  - Numbers compare with an epsilon (FLOAT_EPSILON) — the build path round-trips
//    colours through paint.opacity ↔ color.a and radii through float fields, so a
//    strict === would report noise as loss. Same tolerance the fixed-point test
//    asserts with toBeCloseTo(_, 5).
//  - `undefined` === absent. The walker `delete`s empty fields, so `{}` and
//    `{fills: undefined}` are the same spec.
//  - Object keys are visited SORTED, so the diff list is deterministic (the same
//    two specs always produce byte-identical output — Art VI).

/** One field that did not survive the round-trip. */
export interface StructuralDiffEntry {
  /** JSON path from the spec root, e.g. `children[0].fills[0].color.a`. */
  path: string;
  left: unknown;
  right: unknown;
}

export interface StructuralDiffResult {
  equal: boolean;
  diffs: StructuralDiffEntry[];
}

/** Float tolerance — matches the fixed-point test's `toBeCloseTo(x, 5)`. */
export const FLOAT_EPSILON = 1e-5;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `path` + a key, honouring the root case (no leading dot). */
function joinPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function numbersEqual(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return Math.abs(a - b) <= FLOAT_EPSILON;
}

function walk(a: unknown, b: unknown, path: string, out: StructuralDiffEntry[]): void {
  if (a === undefined && b === undefined) return;

  if (typeof a === 'number' && typeof b === 'number') {
    if (!numbersEqual(a, b)) out.push({ path, left: a, right: b });
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push({ path: joinPath(path, 'length'), left: a.length, right: b.length });
    }
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`, out);
    return;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) walk(a[key], b[key], joinPath(path, key), out);
    return;
  }

  // Primitives, null, and every type mismatch (array↔object, object↔primitive,
  // present↔absent) land here: one comparison, one entry.
  if (a !== b) out.push({ path, left: a, right: b });
}

/**
 * Deep-compare two specs. `equal` is true iff no field differs; `diffs` lists
 * every field that does, in a deterministic order.
 */
export function structuralDiff(a: unknown, b: unknown): StructuralDiffResult {
  const diffs: StructuralDiffEntry[] = [];
  walk(a, b, '', diffs);
  return { equal: diffs.length === 0, diffs };
}
