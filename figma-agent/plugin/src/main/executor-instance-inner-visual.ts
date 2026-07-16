// spec-005 P15 — the forward twin of instance-inner-visual.readInnerVisual: replay
// an inner child's overridden VISUAL layer (paints, effects, style link, visibility).
//
// Everything here obeys the two rules the earlier phases paid for:
//
//   - COMPARE THROUGH THE SCAN'S OWN LENS BEFORE WRITING (P14). A fresh instance
//     already carries the main's visuals, and most of them are variable-bound. A write
//     that lands the same value the main already gives is not harmless: it replaces a
//     BOUND paint with a literal one and mints a spurious override, silently. So every
//     literal write is gated on `asFills`/`effectToExport` — the very functions the
//     walker scans with, so the two sides cannot drift.
//
//   - NO CASCADE (P9). Each field is its own try/catch: a locked fill must not take
//     the shadow down with it, and a refusal is warned, never thrown.
//
// ORDER: style link → effects → paints. The style is first because it REWRITES the
// effects as a side-effect, and it is what makes the effects comparison land on
// "already equal" for the common case (a child pointing at `shadow/2xl`): the style
// carries the shadow AND its variable bindings, so replaying the link reproduces both
// and the literal effects below correctly decline to write.

import type {
  FigmaExportFill, FigmaInnerVisual, FigmaKeyedBinding,
} from '../../../shared/figma-payload-types';
import { exportFillToPaint, mapExportEffects, pushImportWarning } from './executor-styles';
import { resolveKeyedVariable } from './executor-keyed-vars';
import { bindVariableToField } from './executor-variables';
import { asFills, effectToExport } from './scan-node-paint';
import { safe } from './scan-node-utils';

type Child = Record<string, unknown>;

/** True when the child's live paints differ from the spec's, through the scan's lens. */
function paintsDiffer(current: unknown, wanted: FigmaExportFill[]): boolean {
  if (!Array.isArray(current)) return true; // figma.mixed / no such field → cannot compare
  return JSON.stringify(asFills(current as Paint[]) ?? []) !== JSON.stringify(wanted);
}

/**
 * Replay the effect-style link.
 *
 * `setEffectStyleIdAsync`, not the sync setter: under the plugin's
 * `documentAccess: "dynamic-page"` manifest the setter refuses, the same class of
 * refusal as the `mainComponent` getter (spec-005 P2). `''` is a legitimate argument —
 * it is the override that REMOVED the main's style.
 *
 * Returns true when a style now OWNS the child's effects — i.e. a real link landed,
 * and a literal write over them would both downgrade them to unbound values and
 * detach the link that had just been replayed.
 *
 * UNLINKING (`''`) returns FALSE, and the distinction is the whole of the clear case:
 * detaching a style LEAVES its effects behind as literals, so a child whose shadow the
 * user deleted still needs the `effects: []` write below. Conflating the two rebuilt
 * the very shadow the override had removed — caught by the mock, which models the
 * detach the way the canvas does.
 */
async function applyEffectStyle(child: Child, wanted: string, name: string, key: string): Promise<boolean> {
  if (safe(() => child.effectStyleId) === wanted) return false; // the main already agrees
  const set = child.setEffectStyleIdAsync as ((id: string) => Promise<void>) | undefined;
  if (typeof set !== 'function') return false; // a node type with no effect style
  try {
    await set.call(child, wanted);
    return wanted !== '';
  } catch (err) {
    // An unresolvable style id — the ordinary cross-file case, since the id is
    // same-file only (see FigmaInnerVisual.effectStyleId). The literal `effects` the
    // scan captured alongside it are the fallback, and they are written below.
    pushImportWarning(
      `instance "${name}": inner override effectStyleId "${wanted}" on "${key}" failed `
      + `(${String(err)}) — falling back to the literal effects`,
    );
    return false;
  }
}

/** Rebind a bound paint field by publish key; true when the binding was reattached. */
async function applyPaintBinding(
  child: Child, field: string, ref: FigmaKeyedBinding, name: string, key: string,
): Promise<boolean> {
  const variable = await resolveKeyedVariable(ref.key);
  if (!variable) {
    pushImportWarning(
      `instance "${name}": inner override ${field} on "${key}" is bound to `
      + `${ref.name ?? ref.key}, which cannot be resolved — literal paint written instead`,
    );
    return false;
  }
  try {
    bindVariableToField(child as unknown as SceneNode, field, variable);
    return true;
  } catch (err) {
    pushImportWarning(`instance "${name}": inner override ${field} rebind on "${key}" failed (${String(err)})`);
    return false;
  }
}

/**
 * Replay one paint field (fills / strokes).
 *
 * A BOUND field takes the key road and stops there: `bindVariableToField` writes the
 * variable's own colour into the paint, so the literal captured beside it would only
 * overwrite the binding it just reattached. One field, one reversible path — the same
 * bargain bindingsToKeyedBindings strikes for the node-level join.
 */
async function applyPaintField(
  child: Child, field: 'fills' | 'strokes', visual: FigmaInnerVisual, name: string, key: string,
): Promise<void> {
  const wanted = visual[field];
  if (!wanted) return;
  const ref = visual.keyedBindings?.[field];
  if (ref && await applyPaintBinding(child, field, ref, name, key)) return;
  if (!paintsDiffer(safe(() => child[field]), wanted)) return; // the main already agrees
  // Empty stays empty: `[]` is the override that CLEARED the main's paints.
  const paints = wanted.map(exportFillToPaint).filter((p): p is Paint => p !== null);
  try {
    child[field] = paints;
  } catch (err) {
    pushImportWarning(`instance "${name}": inner override ${field} on "${key}" failed (${String(err)})`);
  }
}

/**
 * Apply one child's visual overrides. Never throws — a refusal costs its own field.
 */
export async function applyChildVisual(
  child: Child, visual: FigmaInnerVisual | undefined, name: string, key: string,
): Promise<void> {
  if (!visual) return; // the pre-P15 path, byte for byte

  for (const field of ['visible', 'opacity'] as const) {
    const wanted = visual[field];
    if (wanted === undefined || safe(() => child[field]) === wanted) continue;
    try {
      child[field] = wanted;
    } catch (err) {
      pushImportWarning(`instance "${name}": inner override ${field} on "${key}" failed (${String(err)})`);
    }
  }

  const styled = visual.effectStyleId !== undefined
    && await applyEffectStyle(child, visual.effectStyleId, name, key);

  if (visual.effects && !styled) {
    const current = safe(() => child.effects as Effect[]);
    const live = Array.isArray(current)
      ? JSON.stringify(current.map(effectToExport).filter((e) => e !== null))
      : null;
    // Only when the lens says they genuinely differ. The style link above usually
    // makes this a no-op, which is the point: an effect the main gives is bound to
    // its own variables, and rewriting it as a literal would freeze the shadow.
    if (live !== JSON.stringify(visual.effects)) {
      try {
        child.effects = mapExportEffects(visual.effects);
      } catch (err) {
        pushImportWarning(`instance "${name}": inner override effects on "${key}" failed (${String(err)})`);
      }
    }
  }

  await applyPaintField(child, 'fills', visual, name, key);
  await applyPaintField(child, 'strokes', visual, name, key);
}
