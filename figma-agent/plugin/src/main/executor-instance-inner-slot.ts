// spec-005 P12/P13 — the two inner-child writes that REBUILD the child's subtree:
// a component swap, and a component/variant property set.
//
// They live together, apart from the plain field writes, because they share one
// consequence that drives the whole apply loop: either one REPLACES the nodes below
// the child. Every id under it is new afterwards, so any map of the inner tree taken
// before them is stale — see applyInnerOverrides, which re-walks because of this.

import type { FigmaInnerOverride } from '../../../shared/figma-payload-types';
import { resolveMainComponent } from './resolve-main-component';
import { pushImportWarning } from './executor-styles';
import { safe } from './scan-node-utils';

type Child = Record<string, unknown>;

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
 *
 * Returns true when the subtree was actually replaced.
 */
export async function applyChildSwap(child: Child, o: FigmaInnerOverride, name: string): Promise<boolean> {
  if (!o.componentKey && !o.componentId) return false;
  if (safe(() => child.type) !== 'INSTANCE') return false;
  const node = child as unknown as InstanceNode;
  let current: ComponentNode | null = null;
  try {
    current = await node.getMainComponentAsync();
  } catch { /* unreadable main → fall through and let the swap decide */ }
  if (current && ((o.componentKey && current.key === o.componentKey)
    || (o.componentId && current.id === o.componentId))) {
    return false; // already the right main — the main's own child, not a swap
  }
  const target = await resolveMainComponent(o);
  if (!target) {
    pushImportWarning(
      `instance "${name}": inner slot "${o.childKey}" was swapped to a component that `
      + `cannot be resolved (key=${o.componentKey ?? '—'}, id=${o.componentId ?? '—'}) — `
      + `left on the main's default, swap lost`,
    );
    return false;
  }
  try {
    node.swapComponent(target);
    return true;
  } catch (err) {
    pushImportWarning(`instance "${name}": inner slot "${o.childKey}" swap failed (${String(err)})`);
    return false;
  }
}

/**
 * Replay an inner instance's own component/variant properties (spec-005 P13).
 *
 * The commonest inner override on real files and the one P11/P12 dropped whole: on
 * the DS-wide gate, `_Sheet`'s slot "21174:14662" carried nothing but a variant
 * selection, so the rebuild left it on the main's default variant. That was not one
 * lost field — a variant IS a different component, so every node beneath the slot
 * came back wrong, which is also why the deeper overrides then failed to address.
 *
 * setProperties is all-or-nothing: one unknown key throws and takes the whole call
 * with it. So a refusal is retried key-by-key — a renamed prop should cost its own
 * value, not its six healthy neighbours (the no-cascade rule, P9).
 *
 * Returns true when a variant property changed, i.e. the subtree was replaced.
 */
export function applyChildComponentProperties(child: Child, o: FigmaInnerOverride, name: string): boolean {
  const props = o.componentProperties;
  if (!props || !Object.keys(props).length) return false;
  if (safe(() => child.type) !== 'INSTANCE') return false;
  const node = child as unknown as InstanceNode;
  // Snapshot first: only a VARIANT property rebuilds the subtree, and the honest way
  // to tell one apart is that the instance's own definition says so.
  const defs = safe(() => node.componentProperties as Record<string, { type?: string; value?: unknown }>);
  const changesVariant = Object.keys(props).some(
    (k) => safe(() => defs?.[k]?.type) === 'VARIANT' && safe(() => defs?.[k]?.value) !== props[k],
  );
  try {
    node.setProperties(props);
    return changesVariant;
  } catch {
    // Fall through to per-key, so the keys the main still exposes survive.
  }
  let any = false;
  for (const [k, v] of Object.entries(props)) {
    try {
      node.setProperties({ [k]: v });
      any = true;
    } catch (err) {
      pushImportWarning(
        `instance "${name}": inner slot "${o.childKey}" property "${k}" failed (${String(err)}) — `
        + `left on the main's default`,
      );
    }
  }
  return any && changesVariant;
}
