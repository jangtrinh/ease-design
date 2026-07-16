// spec-005 P1 — the id→name join that makes a variable binding REVERSIBLE.
//
// A scanned node reports its bindings as variable IDs (`boundVariables`), but the
// build path (executor-variables.applyTokenRefs) reattaches by token NAME. This
// module is the pure join between the two: given the raw field→id record the
// walker collected and the file's id→name token map, it rebuilds the
// `FigmaExportNode.tokenRefs` slots the builder consumes.
//
// Pure + sync on purpose: the async Figma call that produces the id→name map
// happens ONCE per scan (scan-node.readTokenNameMap), so the walker itself stays
// synchronous and unit-testable against a plain Map.
//
// KNOWN EDGE (documented, not faked): an id absent from the map — a library /
// remote variable, which `getLocalVariablesAsync` does not list — yields no
// tokenRef. The raw id stays in `figmaScanBindings`, so the loss is visible
// rather than silent, and such a node is NOT a round-trip fixed point.
// CLOSED since spec-005 P7 for the PUBLISHED case: those ids resolve to a publish
// key instead, through bindingsToLibraryBindings below (the same shape of join,
// against the id→key map scan-library-vars.readLibraryVariableMap builds).

import type { FigmaExportNode, FigmaLibraryBinding } from '../../../shared/figma-payload-types';

type TokenRefs = NonNullable<FigmaExportNode['tokenRefs']>;

const PADDING_FIELDS = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const;

/** Bound node field → the tokenRefs slot the builder binds it back from. */
function slotForField(field: string, nodeType: FigmaExportNode['type']): keyof TokenRefs | null {
  // TEXT colour lives in fills but is authored as textColor (build-path convention).
  if (field === 'fills') return nodeType === 'TEXT' ? 'textColor' : 'fill';
  if (field === 'strokes') return 'stroke';
  if (field === 'cornerRadius') return 'radius';
  if (field === 'itemSpacing') return 'gap';
  return null; // padding is handled as a group; anything else has no tokenRefs slot
}

/**
 * field→variable-id bindings + id→name token map → tokenRefs.
 * Returns undefined when nothing resolved (so the caller can leave the key off).
 * `padding` only resolves when ALL FOUR sides are bound to the SAME variable —
 * tokenRefs models uniform padding only; a per-side binding has no slot and is
 * left to `figmaScanBindings` (known edge, not reversible).
 */
export function bindingsToTokenRefs(
  bindings: Record<string, string>,
  nodeType: FigmaExportNode['type'],
  tokenNames: Map<string, string> | undefined,
): TokenRefs | undefined {
  if (!tokenNames || tokenNames.size === 0) return undefined;
  const refs: TokenRefs = {};

  for (const [field, id] of Object.entries(bindings)) {
    const slot = slotForField(field, nodeType);
    if (!slot) continue;
    const name = tokenNames.get(id);
    if (name) refs[slot] = name;
  }

  const padIds = PADDING_FIELDS.map((f) => bindings[f]);
  if (padIds.every((id) => id && id === padIds[0])) {
    const name = tokenNames.get(padIds[0]);
    if (name) refs.padding = name;
  }

  return Object.keys(refs).length > 0 ? refs : undefined;
}

/**
 * spec-005 P7 — the library twin of bindingsToTokenRefs: field→variable-id
 * bindings + the id→key map → `libraryBindings`.
 *
 * Deliberately field-for-field, where the token join maps through a slot
 * vocabulary: a library binding is replayed with the very field it was read from
 * (executor-library-vars → bindVariableToField), so there is nothing to squeeze —
 * per-side padding and width/height survive here, having no tokenRefs slot at all.
 * Returns undefined when nothing resolved, so the caller can leave the key off.
 */
export function bindingsToLibraryBindings(
  bindings: Record<string, string>,
  libraryVars: ReadonlyMap<string, FigmaLibraryBinding> | undefined,
): Record<string, FigmaLibraryBinding> | undefined {
  if (!libraryVars || libraryVars.size === 0) return undefined;
  const out: Record<string, FigmaLibraryBinding> = {};
  for (const [field, id] of Object.entries(bindings)) {
    const ref = libraryVars.get(id);
    if (ref) out[field] = ref;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
