// spec-005 P9 — the mirror's ONE concession, and the rules that keep it honest.
//
// THE PROBLEM: the live footer text 25575:354192 carries a real
// `boundVariables.maxWidth`, authored through Figma's UI. `setBoundVariable` on a
// TEXT node refuses that field outright (proven live — see
// shared/figma-unbindable-fields), so no rebuild can ever carry it. Left alone, the
// gate reported two diffs (`figmaScanBindings.maxWidth`, `keyedBindings.maxWidth`)
// that NO change to this repo could close: a permanently red gate, which is a gate
// nobody reads.
//
// THE RULE: the diff ignores a binding ONLY where the SCAN ITSELF declared Figma
// refused it — `figmaScanUnbindable`, emitted by the walker that saw the node. The
// CLI hardcodes no field list of its own: if the walker did not name the refusal,
// the diff stands. So this can never quietly grow into "ignore the fields that are
// failing today".
//
// AND IT IS SAID OUT LOUD: every dropped field is reported in the gate's
// `normalized` list, by path. `equal: true` with a normalized entry means "reversible
// as far as Figma's API allows, and here is exactly what it would not allow" — never
// a silent pass.

/** A scanned spec, walked as plain JSON (same stance as structural-diff). */
type Spec = Record<string, unknown>;

const asSpec = (v: unknown): Spec | undefined =>
  (typeof v === 'object' && v !== null && !Array.isArray(v)) ? (v as Spec) : undefined;

const childrenOf = (spec: Spec): Spec[] =>
  Array.isArray(spec.children) ? spec.children.map(asSpec).filter((c): c is Spec => !!c) : [];

const refusedBy = (spec: Spec): string[] =>
  Array.isArray(spec.figmaScanUnbindable)
    ? spec.figmaScanUnbindable.filter((f): f is string => typeof f === 'string')
    : [];

/** `path` + a key, honouring the root case (no leading dot) — mirrors structural-diff. */
const joinPath = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/**
 * Drop every binding the walker recorded as refused by Figma, on both specs.
 *
 * Removes the `figmaScanUnbindable` marker itself AND the matching raw ids from
 * `figmaScanBindings`. Both must go: the ORIGINAL carries them and the rebuild
 * cannot, so leaving either behind reproduces the very diff this closes.
 *
 * Applied to BOTH sides symmetrically — never "make left look like right". A rebuild
 * that somehow DID carry the binding would keep its own `figmaScanBindings` entry
 * (no marker of its own to strip it), and the diff would fire. Pure: the input spec
 * is copied, never mutated.
 */
export function stripUnbindableBindings<T>(spec: T): T {
  const node = asSpec(spec);
  if (!node) return spec;
  const out: Spec = { ...node };

  const refused = refusedBy(out);
  if (refused.length) {
    delete out.figmaScanUnbindable;
    const bindings = asSpec(out.figmaScanBindings);
    if (bindings) {
      const kept = { ...bindings };
      for (const field of refused) delete kept[field];
      if (Object.keys(kept).length) out.figmaScanBindings = kept;
      else delete out.figmaScanBindings;
    }
  }

  if (Array.isArray(out.children)) {
    out.children = out.children.map((child) => stripUnbindableBindings(child));
  }
  return out as T;
}

/**
 * What stripUnbindableBindings removed, as gate-readable lines — one per refused
 * field, addressed by the same JSON path convention the diffs use, so a reader can
 * line them up against `diffs` without a decoder ring.
 */
export function unbindableNotes(spec: unknown, path = ''): string[] {
  const node = asSpec(spec);
  if (!node) return [];
  const out: string[] = [];
  for (const field of refusedBy(node)) {
    const where = joinPath(path, `figmaScanBindings.${field}`);
    out.push(`${where} — Figma's Plugin API refuses to bind '${field}' on a ${String(node.type)} node; no rebuild can carry it`);
  }
  childrenOf(node).forEach((child, i) => {
    out.push(...unbindableNotes(child, `${joinPath(path, 'children')}[${i}]`));
  });
  return out;
}
