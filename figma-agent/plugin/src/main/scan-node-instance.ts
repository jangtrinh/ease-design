// Reverse-walker: the non-visual material — variable bindings (spec-005 P1) and
// the instance/component reference (spec-005 P2, this module's reason to exist).
//
// INSTANCE MODEL — ref + overrides, NOT a copy of the inner tree:
// an instance's composition belongs to its MAIN component, so the reversible
// representation is (componentKey|componentId) + componentProperties, and the
// builder rebuilds it with `main.createInstance()`. Recursing the inner tree would
// capture the main's structure and rebuild it as a detached frame — exactly the
// degradation P2 exists to remove. What the ref+overrides model cannot carry is
// recorded in `figmaScanInnerOverrides` so the loss stays visible.

import type { FigmaExportNode, FigmaKeyedBinding } from '../../../shared/figma-payload-types';
import type { ScannedNode } from './scan-node-types';
import { aliasId, safe } from './scan-node-utils';
import { bindingsToKeyedBindings, bindingsToTokenRefs } from './scan-token-refs';

/**
 * field→variable-id for every bound field the walker can see (node + paints).
 * Exported since spec-005 P7: the publish-key pre-pass (scan-keyed-vars) must
 * collect the SAME ids the walker will later ask it about — one reader, no drift.
 */
export function readBindings(n: Record<string, unknown>): Record<string, string> {
  const rec: Record<string, string> = {};
  // Scalar fields (cornerRadius, itemSpacing, padding…) live on node.boundVariables.
  const bound = safe(() => n.boundVariables as Record<string, unknown>);
  if (bound && typeof bound === 'object') {
    for (const [field, val] of Object.entries(bound)) {
      const id = aliasId(val);
      if (id) rec[field] = id;
    }
  }
  // Paint fields (fills/strokes) record the alias on the PAINT, not the node.
  for (const field of ['fills', 'strokes'] as const) {
    const paints = safe(() => n[field] as Array<Record<string, unknown>>);
    if (!Array.isArray(paints)) continue;
    for (const p of paints) {
      const id = aliasId((p.boundVariables as { color?: unknown } | undefined)?.color);
      if (id) { rec[field] = id; break; }
    }
  }
  return rec;
}

/**
 * Fields overridden on the instance's INNER children (deduped + sorted).
 * `InstanceNode.overrides` reports one entry per overridden node; entries for the
 * instance node ITSELF are excluded — those are node-level overrides the payload
 * models and the builder re-applies. What remains is the un-survivable class.
 */
function readInnerOverrideFields(n: Record<string, unknown>, selfId: string): string[] {
  const overrides = safe(() => n.overrides as Array<{ id?: string; overriddenFields?: string[] }>);
  if (!Array.isArray(overrides)) return [];
  const fields = new Set<string>();
  for (const o of overrides) {
    if (!o || o.id === selfId) continue;
    for (const f of o.overriddenFields ?? []) fields.add(f);
  }
  return [...fields].sort();
}

/** A main component's identity, as the async pre-pass resolved it. */
export interface MainComponentRef { key?: string; id?: string; name?: string }

/**
 * The instance reference + property overrides — everything a rebuild needs.
 *
 * `mainRef` comes from scan-node.readMainComponentMap, an ASYNC pre-pass keyed by
 * instance id. It is the only reliable source: under the plugin's
 * `documentAccess: "dynamic-page"` manifest the sync `mainComponent` getter THROWS
 * ("Use node.getMainComponentAsync instead"), `safe()` swallows that into null, and
 * every component ref silently vanished — the same deprecated-sync-API class as
 * getNodeById→getNodeByIdAsync. The sync read stays as a fallback for callers that
 * pass no map (and for a non-dynamic-page manifest, where it still answers).
 */
export function readInstance(
  n: Record<string, unknown>,
  out: ScannedNode,
  selfId: string,
  mainRef?: MainComponentRef,
): void {
  const main = mainRef
    ?? safe(() => n.mainComponent as { id?: string; key?: string; name?: string } | null);
  if (main) {
    if (typeof main.key === 'string' && main.key) out.componentKey = main.key;
    if (typeof main.id === 'string' && main.id) out.componentId = main.id;
    if (typeof main.name === 'string' && main.name) out.componentName = main.name;
  }
  const props = safe(() => n.componentProperties as Record<string, { value?: unknown }>);
  if (props && typeof props === 'object') {
    const rec: Record<string, string | boolean> = {};
    for (const [k, entry] of Object.entries(props)) {
      const v = entry?.value;
      // string | boolean only — a variable-bound property value (VariableAlias)
      // has no reversible slot and is left out (documented edge, see the header).
      if (typeof v === 'string' || typeof v === 'boolean') rec[k] = v;
    }
    if (Object.keys(rec).length) out.componentProperties = rec;
  }
  const inner = readInnerOverrideFields(n, selfId);
  if (inner.length) out.figmaScanInnerOverrides = inner;
}

/**
 * Capture bindings + un-modelled component types.
 * A binding leaves here through ONE of two reversible paths, never both (the key
 * join drops any field the token join claimed): a LOCAL variable in one of the five
 * tokenRefs slots resolves to a name (`tokenRefs`, P1); everything else — a
 * PUBLISHED variable, or any variable on a field with no slot — resolves to a
 * publish key (`keyedBindings`, P7/P8). Anything neither map names stays a raw id
 * in `figmaScanBindings` — still the honest record of a loss, just a much rarer one.
 */
export function readExtensions(
  n: Record<string, unknown>,
  out: ScannedNode,
  tokenNames: Map<string, string> | undefined,
  keyedVars?: ReadonlyMap<string, FigmaKeyedBinding>,
): void {
  const rec = readBindings(n);
  if (Object.keys(rec).length) {
    out.figmaScanBindings = rec;
    const nodeType = out.type as FigmaExportNode['type'];
    const refs = bindingsToTokenRefs(rec, nodeType, tokenNames);
    if (refs) out.tokenRefs = refs;
    const keyed = bindingsToKeyedBindings(rec, keyedVars, nodeType, tokenNames);
    if (keyed) out.keyedBindings = keyed;
  }
  const type = n.type as string;
  // COMPONENT / COMPONENT_SET have no payload representation (they ARE definitions,
  // not instances of one) → they still degrade to FRAME; record the source type.
  if (type === 'COMPONENT' || type === 'COMPONENT_SET') out.figmaScanSourceType = type;
}
