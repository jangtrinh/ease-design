// spec-005 P11 — the forward twin of scan-node-instance.readInnerOverrides: replay
// the ad-hoc edits an instance carries on its INNER children.
//
// This does NOT widen the instance model. The composition still comes from the main
// via createInstance(); all that happens here is that a child the user had stretched
// or renamed inside the instance gets stretched or renamed again. Writing a field on
// an inner child does not detach it — recursing its STRUCTURE would, which is why P2
// refused that and this does not do it.
//
// Two rules, both bought with real bugs:
//   - No cascade (P9): every field is its own try/catch. One write Figma refuses must
//     not take the other six down with it.
//   - resize() eats AUTO (P10): resizing an auto-layout child forces both sizing
//     modes to FIXED, and resizing a TEXT child coerces textAutoResize. Those
//     side-effects would land as SPURIOUS overrides the original never had — the
//     rebuilt instance would then report MORE inner overrides than the source. So the
//     side-effect-prone fields are snapshotted off the fresh instance (i.e. the
//     main's own values) and restored afterwards unless the spec overrides them.

import type { FigmaExportNode, FigmaInnerOverride } from '../../../shared/figma-payload-types';
import { keyInnerChildren } from './instance-inner-override-keys';
import { resolveMainComponent } from './resolve-main-component';
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
 * Replay a swapped inner slot (spec-005 P12).
 *
 * The live P5 gate's lesson, and the reason `fields` alone was not enough: a user can
 * SWAP the component behind an inner slot without detaching the outer instance, and
 * Figma reports that swap as overrides on the fields the swap MOVED (name, width,
 * height, sizing) — never as the swap itself. On the gate's own file every one of
 * those fields happened to EQUAL the main's, so replaying them rebuilt a child that
 * matched field-for-field and still pointed at the wrong component.
 *
 * Compares before writing: the recorded ref is captured for every overridden inner
 * instance, so the common case is "already correct" and must stay a no-op — swapping
 * a node to what it already is would churn the user's file for nothing.
 */
async function applyChildSwap(child: Child, o: FigmaInnerOverride, name: string): Promise<void> {
  if (!o.componentKey && !o.componentId) return;
  if (safe(() => child.type) !== 'INSTANCE') return;
  const node = child as unknown as InstanceNode;
  let current: ComponentNode | null = null;
  try {
    current = await node.getMainComponentAsync();
  } catch { /* unreadable main → fall through and let the swap decide */ }
  if (current && ((o.componentKey && current.key === o.componentKey)
    || (o.componentId && current.id === o.componentId))) {
    return; // already the right main — the main's own child, not a swap
  }
  const target = await resolveMainComponent(o);
  if (!target) {
    pushImportWarning(
      `instance "${name}": inner slot "${o.childKey}" was swapped to a component that `
      + `cannot be resolved (key=${o.componentKey ?? '—'}, id=${o.componentId ?? '—'}) — `
      + `left on the main's default, swap lost`,
    );
    return;
  }
  try {
    node.swapComponent(target);
  } catch (err) {
    pushImportWarning(`instance "${name}": inner slot "${o.childKey}" swap failed (${String(err)})`);
  }
}

/**
 * Re-apply `spec.innerOverrides` onto a freshly created instance.
 *
 * MUST run after setProperties: a variant swap rebuilds the inner tree and would
 * discard anything written before it. A childKey with no twin in this instance
 * (unresolvable id shape, a main that changed since the scan) is reported and
 * skipped — the scan's `figmaScanInnerOverrides` still names the loss.
 */
export async function applyInnerOverrides(instance: InstanceNode, spec: FigmaExportNode): Promise<void> {
  const overrides: FigmaInnerOverride[] | undefined = spec.innerOverrides;
  if (!overrides || !overrides.length) return; // the pre-P11 path, byte for byte
  const byKey = keyInnerChildren(instance as unknown as Record<string, unknown>, instance.id);
  const missed: string[] = [];
  for (const o of overrides) {
    const child = byKey.get(o.childKey);
    if (!child) { missed.push(o.childKey); continue; }
    // The swap FIRST: it replaces the child's whole inner tree, so any field written
    // before it would be thrown away with the node it was written on.
    await applyChildSwap(child, o, spec.name);
    applyChildFields(child, o.fields, spec.name);
  }
  if (missed.length) {
    pushImportWarning(
      `instance "${spec.name}": ${missed.length} inner override(s) had no matching child `
      + `(${missed.join(', ')}) — those inner edits are lost`,
    );
  }
}
