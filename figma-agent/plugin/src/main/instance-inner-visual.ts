// Reverse-walker: an inner child's overridden VISUAL layer (spec-005 P15) — the
// reading half; the writing half is executor-instance-inner-visual.ts.
//
// THE GAP THIS CLOSES. P11's `fields` whitelist is primitives only (name, width,
// sizing…) because it replays each one with `child[field] = value`. Every VISUAL
// override therefore had nowhere to travel, and the P15 live gate (25579:749755)
// measured the cost precisely: of the 16 inner overrides Figma reports on that node,
// the rebuild reproduced 7 — the four classes `fills`, `effects`, `effectStyleId` and
// `visible` were lost whole, on every instance, silently.
//
// TWO RULES, both bought on that gate's own evidence:
//
//   - EMPTY IS A VALUE. `overrides` names the field; the value is then whatever the
//     child holds, including `[]` and `''`. Node 25579:746648 overrides
//     `effectStyleId,effects` by CLEARING both — its main has a shadow, the user
//     removed it. `readOverriddenValues` drops empty strings (right for `name`,
//     which Figma refuses); here it would rebuild the shadow the user deleted.
//
//   - A BOUND PAINT TRAVELS BY KEY, NOT BY VALUE. All four `fills` overrides on the
//     gate are bound to variables. Capturing the resolved literal and writing it back
//     is the P14 clobber exactly — the binding dies and the node freezes at today's
//     colour. So a bound field is recorded as a keyed binding and the writer rebinds
//     it; the literal is kept as the record of what it resolved to, never as the
//     instruction.

import type {
  FigmaExportEffect, FigmaExportFill, FigmaInnerVisual, FigmaKeyedBinding,
} from '../../../shared/figma-payload-types';
import { effectToExport, paintToFill } from './scan-node-paint';
import { readBindings, safe } from './scan-node-utils';

/**
 * The visual fields this codebase can both READ off a live child and WRITE back onto
 * its twin. Figma's `NodeChangeProperty` names, like INNER_OVERRIDE_FIELDS — the two
 * lists are disjoint halves of one whitelist, split by the shape of the value rather
 * than by anything the domain cares about.
 *
 * `strokeWeight` is deliberately absent: it is a number, so its home is
 * INNER_OVERRIDE_FIELDS, and the P15 gate shows it already round-tripping (both sides
 * report it — it is inherited from the main's own inner override, not ours to replay).
 */
export const VISUAL_OVERRIDE_FIELDS = [
  'fills', 'strokes', 'effects', 'effectStyleId', 'visible', 'opacity',
] as const;

/** The paint fields, whose binding lives on the PAINT and travels by key. */
const PAINT_FIELDS = ['fills', 'strokes'] as const;

/**
 * A paint array → payload fills, EMPTY ARRAY INCLUDED.
 *
 * Not `asFills`: that answers undefined for an empty array (right for a node's own
 * fills, where "no paints" and "not modelled" are both simply absent). Here the
 * difference is the override — a child whose fills the user cleared reports `fills`
 * as overridden and holds `[]`.
 */
function readPaints(v: unknown): FigmaExportFill[] | undefined {
  if (!Array.isArray(v)) return undefined; // figma.mixed, or a node with no such field
  return (v as Paint[]).map(paintToFill).filter((f): f is FigmaExportFill => f !== null);
}

/** A live effects array → payload effects, empty array included (same reason). */
function readEffects(v: unknown): FigmaExportEffect[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return (v as Effect[]).map(effectToExport).filter((e): e is FigmaExportEffect => e !== null);
}

/**
 * The keyed bindings of the paint fields captured here.
 *
 * Reuses `readBindings` — the same reader the node-level join uses — so an inner
 * child's binding is seen exactly the way an ordinary node's is, and the two cannot
 * drift. Only the fields actually captured are offered: a binding on a field the
 * child never overrode is the main's own business.
 */
function readVisualBindings(
  child: Record<string, unknown>,
  captured: ReadonlySet<string>,
  keyedVars: ReadonlyMap<string, FigmaKeyedBinding> | undefined,
): Record<string, FigmaKeyedBinding> | undefined {
  if (!keyedVars || keyedVars.size === 0) return undefined;
  const bindings = readBindings(child);
  const out: Record<string, FigmaKeyedBinding> = {};
  for (const field of PAINT_FIELDS) {
    if (!captured.has(field)) continue;
    const id = bindings[field];
    const ref = id ? keyedVars.get(id) : undefined;
    if (ref) out[field] = ref;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * One inner child's overridden visual fields, read off the live child.
 *
 * `overridden` is Figma's own list for this child — the ONLY gate. Reading a visual
 * field the report does not name would record the main's own value as an override the
 * source never had (P10's spurious-override trap).
 *
 * Returns undefined when the child overrides no visual field, so the caller can leave
 * the key off entirely and a pre-P15 payload stays byte-identical.
 */
export function readInnerVisual(
  child: Record<string, unknown>,
  overridden: string[],
  keyedVars?: ReadonlyMap<string, FigmaKeyedBinding>,
): FigmaInnerVisual | undefined {
  const wanted = new Set(overridden);
  const out: FigmaInnerVisual = {};
  const captured = new Set<string>();
  // Iterate the WHITELIST, not Figma's report: key order becomes deterministic, so
  // two scans of the same state serialise identically (the mirror wants a fixed
  // point, not a set).
  for (const field of VISUAL_OVERRIDE_FIELDS) {
    if (!wanted.has(field)) continue;
    const v = safe(() => child[field]);
    if (field === 'fills' || field === 'strokes') {
      const paints = readPaints(v);
      if (paints) { out[field] = paints; captured.add(field); }
    } else if (field === 'effects') {
      const effects = readEffects(v);
      if (effects) { out.effects = effects; captured.add(field); }
    } else if (field === 'effectStyleId') {
      // '' included: it is the override that REMOVED the main's style.
      if (typeof v === 'string') { out.effectStyleId = v; captured.add(field); }
    } else if (field === 'visible') {
      if (typeof v === 'boolean') { out.visible = v; captured.add(field); }
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out.opacity = v; captured.add(field);
    }
  }
  if (!captured.size) return undefined;
  const bindings = readVisualBindings(child, captured, keyedVars);
  if (bindings) out.keyedBindings = bindings;
  return out;
}
