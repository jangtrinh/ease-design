// spec-005 P11 — the forward twin of scan-node-instance.readInnerOverrides: replay
// the ad-hoc edits an instance carries on its INNER children.
//
// This does NOT widen the instance model. The composition still comes from the main
// via createInstance(); all that happens here is that a child the user had stretched
// or renamed inside the instance gets stretched or renamed again. Writing a field on
// an inner child does not detach it — recursing its STRUCTURE would, which is why P2
// refused that and this does not do it.
//
// The subtree-replacing writes (swap, variant set) live in
// executor-instance-inner-slot.ts; this module owns the plain field writes and the
// apply loop that sequences all three.
//
// Three rules, all bought with real bugs:
//   - No cascade (P9): every field is its own try/catch. One write Figma refuses must
//     not take the other six down with it.
//   - resize() eats AUTO (P10): resizing an auto-layout child forces both sizing
//     modes to FIXED, and resizing a TEXT child coerces textAutoResize. Those
//     side-effects would land as SPURIOUS overrides the original never had — the
//     rebuilt instance would then report MORE inner overrides than the source. So the
//     side-effect-prone fields are snapshotted off the fresh instance (i.e. the
//     main's own values) and restored afterwards unless the spec overrides them.
//   - A stale tree map mis-addresses SILENTLY (P13): a swap or a variant set replaces
//     every node under the slot, so the map must be re-walked before the next,
//     deeper override is looked up.

import type { FigmaExportNode, FigmaInnerOverride } from '../../../shared/figma-payload-types';
import { keyInnerChildren } from './instance-inner-override-keys';
import { applyChildComponentProperties, applyChildSwap } from './executor-instance-inner-slot';
import { pushImportWarning } from './executor-styles';
import { safe } from './scan-node-utils';

/**
 * Fields any `resize()` may rewrite as a side-effect. Restored to the main's value
 * after the writes when the spec does NOT name them — otherwise the rebuild invents
 * an override the source never had.
 */
const SIDE_EFFECT_FIELDS = ['primaryAxisSizingMode', 'counterAxisSizingMode', 'textAutoResize'] as const;

type Child = Record<string, unknown>;

/** Write one field, reporting a refusal instead of letting it abort the rest. */
function writeField(child: Child, name: string, field: string, value: unknown): void {
  try {
    child[field] = value;
  } catch (err) {
    pushImportWarning(`instance "${name}": inner override ${field} failed (${String(err)})`);
  }
}

/**
 * Apply one child's fields, in the order the Figma API forces:
 * name → resize → sizing modes → layoutGrow → textAutoResize (last, because the
 * sizing writes above can coerce it — the same belt executor-frame wears).
 */
function applyChildFields(child: Child, fields: Record<string, string | number>, name: string): void {
  // Snapshot BEFORE any write: on a fresh instance these still hold the main's own
  // values, which is what a field the spec does not override must go back to.
  const before: Record<string, unknown> = {};
  for (const f of SIDE_EFFECT_FIELDS) before[f] = safe(() => child[f]);

  if (typeof fields.name === 'string') writeField(child, name, 'name', fields.name);

  const w = fields.width;
  const h = fields.height;
  if (typeof w === 'number' || typeof h === 'number') {
    try {
      const resize = child.resize as ((width: number, height: number) => void) | undefined;
      const cw = typeof w === 'number' ? w : (child.width as number);
      const ch = typeof h === 'number' ? h : (child.height as number);
      if (typeof resize === 'function') resize.call(child, cw, ch);
      // resize() on a FILL-sized child is a SILENT no-op — auto-layout recomputes the
      // size and Figma registers no override at all. PROBED on the live rebuild
      // (spec-005 P13): resizing a FILL/FILL child to 900x700 left it at 1108x836 and
      // added no width/height to `overriddenFields`, with nothing thrown. It is a
      // refusal that looks like a success, so it is named here rather than left to
      // read as a bug in this code.
      if (Math.abs((child.width as number) - cw) > 0.01 || Math.abs((child.height as number) - ch) > 0.01) {
        pushImportWarning(
          `instance "${name}": inner override resize did not take (asked ${cw}x${ch}, got `
          + `${String(child.width)}x${String(child.height)}) — the child is sized by its `
          + `auto-layout parent (layoutSizing ${String(child.layoutSizingHorizontal)}/`
          + `${String(child.layoutSizingVertical)}), which overrides resize()`,
        );
      }
    } catch (err) {
      pushImportWarning(`instance "${name}": inner override resize failed (${String(err)})`);
    }
  }

  // Sizing modes AFTER the resize that would otherwise overwrite them; the ones the
  // spec does not carry go back to what the main gave this fresh instance.
  for (const f of SIDE_EFFECT_FIELDS) {
    const wanted = f in fields ? fields[f] : before[f];
    if (wanted === undefined) continue;
    try {
      if (child[f] !== wanted) child[f] = wanted;
    } catch {
      // Not applicable to this node type (textAutoResize off a frame, sizing modes
      // off a non-auto-layout child). Only worth a warning when the SPEC asked for
      // it — restoring the main's own value is housekeeping, not a loss.
      if (f in fields) pushImportWarning(`instance "${name}": inner override ${f} failed`);
    }
  }

  if (typeof fields.layoutGrow === 'number') writeField(child, name, 'layoutGrow', fields.layoutGrow);
}

/**
 * Re-apply `spec.innerOverrides` onto a freshly created instance.
 *
 * MUST run after setProperties: a variant swap rebuilds the inner tree and would
 * discard anything written before it. A childKey with no twin in this instance
 * (unresolvable id shape, a main that changed since the scan) is reported and
 * skipped — the scan's `figmaScanInnerOverrides` still names the loss.
 *
 * THE MAP IS RE-WALKED, not taken once (spec-005 P13). A swap or a variant set on an
 * inner slot REPLACES every node beneath it, so a map taken before them points at
 * nodes that no longer exist — and a deeper override addressed against it silently
 * found nothing. That is exactly what the DS-wide gate reported as "inner override
 * had no matching child (21174:14662;112:1269)": not a key that could not be derived,
 * but a slot still sitting on the main's default variant, whose subtree therefore
 * never contained the node the key named. `overrides` arrives sorted by childKey, so
 * a parent slot is always applied BEFORE its descendants — re-walking after it has
 * rebuilt the subtree is what makes those descendants addressable at all.
 */
export async function applyInnerOverrides(instance: InstanceNode, spec: FigmaExportNode): Promise<void> {
  const overrides: FigmaInnerOverride[] | undefined = spec.innerOverrides;
  if (!overrides || !overrides.length) return; // the pre-P11 path, byte for byte
  const root = instance as unknown as Record<string, unknown>;
  let byKey = keyInnerChildren(root, instance.id);
  const missed: string[] = [];
  for (const o of overrides) {
    const child = byKey.get(o.childKey);
    // FAIL-SAFE: no twin under this key → write NOTHING. A near-miss must never be
    // resolved onto some other node; the record below keeps the loss visible instead.
    if (!child) { missed.push(o.childKey); continue; }
    // The subtree-replacing writes FIRST: any field written before them would be
    // thrown away with the node it was written on.
    //
    // PROPERTIES BEFORE THE SWAP, and the order is load-bearing. A variant is not a
    // swap — it is a property — but its main IS a different component, so the swap
    // ref recorded for a re-varianted slot points at the sibling variant. Setting the
    // property first moves the child onto exactly that main, and applyChildSwap's own
    // "already the right main" check then no-ops. Swap-first would instead replay a
    // property change as a swapComponent — the same answer by the wrong mechanism,
    // and a real swap layered on top of it would fight the property write.
    const revariant = applyChildComponentProperties(child, o, spec.name);
    const swapped = await applyChildSwap(child, o, spec.name);
    applyChildFields(child, o.fields, spec.name);
    // Only re-walk when the tree actually changed — the common case is a plain field
    // write, and re-walking a 600-node instance per override would be nonsense.
    if (swapped || revariant) byKey = keyInnerChildren(root, instance.id);
  }
  if (missed.length) {
    pushImportWarning(
      `instance "${spec.name}": ${missed.length} inner override(s) had no matching child `
      + `(${missed.join(', ')}) — those inner edits are lost`,
    );
  }
}
