// spec-005 P9 — the fields Figma's Plugin API REFUSES to bind, by node type.
//
// PROVEN on the live canvas, not assumed. `setBoundVariable('maxWidth', v)` on a
// TEXT node throws
//     Error: in setBoundVariable: invalid field for text node: 'maxWidth'
// while the SAME variable binds fine on a FRAME. Figma's own UI can nevertheless
// author that binding — the live footer text 25575:354192 carries a real
// `boundVariables.maxWidth` — so the scan sees a binding the rebuild PROVABLY
// cannot replay through the API we build on.
//
// That distinction is the whole point of this module: a binding we fail to carry is
// OUR loss and must keep failing the mirror gate; a binding Figma refuses to accept
// is a limitation of the tool, and reporting it as our loss would train the owner to
// ignore a red gate. Neither may be faked — the refusal is RECORDED
// (`figmaScanUnbindable`), never silently dropped.
//
// SHARED on purpose: the scan must not offer such a field to the key join, and the
// mirror's diff must not read its absence as a loss. One rule, both consumers —
// patching it into only the one where it surfaced is the L1→L4 mistake.
//
// ONLY provably-refused entries belong here. `maxWidth` on TEXT is what the live
// probe demonstrated. The sibling sizing fields (minWidth / maxHeight / minHeight)
// are deliberately NOT listed: no probe has shown Figma refusing them, and guessing
// would invent a limitation that silently drops a binding we could have carried.

/** node.type → the bindable-looking fields Figma rejects on it. */
const UNBINDABLE_FIELDS_BY_NODE_TYPE: Readonly<Record<string, readonly string[]>> = {
  TEXT: ['maxWidth'],
};

/** True when Figma's Plugin API provably refuses `field` on `nodeType`. */
export function isUnbindableField(nodeType: string, field: string): boolean {
  return UNBINDABLE_FIELDS_BY_NODE_TYPE[nodeType]?.includes(field) ?? false;
}

/** The subset of `fields` this node type provably cannot have replayed, sorted
 * (deterministic output — Art VI). */
export function unbindableFields(nodeType: string, fields: Iterable<string>): string[] {
  return [...fields].filter((f) => isUnbindableField(nodeType, f)).sort();
}
