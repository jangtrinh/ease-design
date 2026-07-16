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
// CLOSED since spec-005 P7 (published variables) and P8 (local ones, and every
// field with no slot at all): those ids resolve to a publish KEY instead, through
// bindingsToKeyedBindings below — the same shape of join, against the id→key map
// scan-keyed-vars.readKeyedVariableMap builds.

import type { FigmaExportNode, FigmaKeyedBinding } from '../../../shared/figma-payload-types';

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

/** One binding the token join CAN carry: the field it was read from, the slot it
 * travels in, and the token name that slot holds. */
interface TokenSlot {
  field: string;
  slot: keyof TokenRefs;
  name: string;
}

/**
 * The token join, resolved but not yet shaped — the single source of truth for
 * "which bindings does tokenRefs actually claim". bindingsToTokenRefs shapes it
 * into the payload slots; bindingsToKeyedBindings reads the FIELDS off it to stay
 * out of their way (one binding, one reversible path — never both, which would
 * bind the same field twice on the rebuild).
 *
 * `padding` only resolves when ALL FOUR sides are bound to the SAME variable —
 * tokenRefs models uniform padding only; a per-side binding has no slot here and
 * is left to the key join (P8), which is field-for-field and needs no slot.
 */
function resolveTokenSlots(
  bindings: Record<string, string>,
  nodeType: FigmaExportNode['type'],
  tokenNames: Map<string, string> | undefined,
): TokenSlot[] {
  if (!tokenNames || tokenNames.size === 0) return [];
  const out: TokenSlot[] = [];

  for (const [field, id] of Object.entries(bindings)) {
    const slot = slotForField(field, nodeType);
    if (!slot) continue;
    const name = tokenNames.get(id);
    if (name) out.push({ field, slot, name });
  }

  const padIds = PADDING_FIELDS.map((f) => bindings[f]);
  if (padIds.every((id) => id && id === padIds[0])) {
    const name = tokenNames.get(padIds[0]);
    // All four sides claimed together: applyTokenRefs replays `padding` onto each.
    if (name) for (const field of PADDING_FIELDS) out.push({ field, slot: 'padding', name });
  }

  return out;
}

/**
 * field→variable-id bindings + id→name token map → tokenRefs.
 * Returns undefined when nothing resolved (so the caller can leave the key off).
 */
export function bindingsToTokenRefs(
  bindings: Record<string, string>,
  nodeType: FigmaExportNode['type'],
  tokenNames: Map<string, string> | undefined,
): TokenRefs | undefined {
  const refs: TokenRefs = {};
  for (const { slot, name } of resolveTokenSlots(bindings, nodeType, tokenNames)) refs[slot] = name;
  return Object.keys(refs).length > 0 ? refs : undefined;
}

/**
 * spec-005 P7/P8 — the key twin of bindingsToTokenRefs: field→variable-id bindings
 * + the id→key map → `keyedBindings`.
 *
 * Deliberately field-for-field, where the token join maps through a slot
 * vocabulary: a keyed binding is replayed with the very field it was read from
 * (executor-keyed-vars → bindVariableToField), so there is nothing to squeeze —
 * fontFamily/fontSize/fontWeight/lineHeight, maxWidth, per-side padding and
 * width/height all survive here, having no tokenRefs slot at all. That is the
 * whole P8 gap: the live probe's 15 remaining diffs were LOCAL variables on font
 * fields, reachable by neither join before now.
 *
 * A field the token join already claimed is dropped: it is reattached by name on
 * the rebuild (applyTokenRefs), and binding it a second time by key would be a
 * redundant write of the same variable at best, a fight over the paint array at
 * worst. The raw id of every binding travels in `figmaScanBindings` regardless,
 * so nothing goes unrecorded either way.
 *
 * Returns undefined when nothing resolved, so the caller can leave the key off.
 */
export function bindingsToKeyedBindings(
  bindings: Record<string, string>,
  keyedVars: ReadonlyMap<string, FigmaKeyedBinding> | undefined,
  nodeType: FigmaExportNode['type'],
  tokenNames: Map<string, string> | undefined,
): Record<string, FigmaKeyedBinding> | undefined {
  if (!keyedVars || keyedVars.size === 0) return undefined;
  const claimedByTokenRefs = new Set(resolveTokenSlots(bindings, nodeType, tokenNames).map((s) => s.field));
  const out: Record<string, FigmaKeyedBinding> = {};
  for (const [field, id] of Object.entries(bindings)) {
    if (claimedByTokenRefs.has(field)) continue;
    const ref = keyedVars.get(id);
    if (ref) out[field] = ref;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
