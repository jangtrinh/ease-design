// spec-005 P2 — the INSTANCE build-case: the forward twin of scan-node-instance.
//
// An instance is rebuilt as REF + OVERRIDES, never from a copied inner tree:
// resolve the main component (portable `componentKey` first, same-file
// `componentId` as fallback), `createInstance()` it, apply the component/variant
// properties, then re-apply ONLY the node-level fields whose value differs from
// what the main already gives — writing a field back that the main already
// produces would create a spurious override in the user's file.
//
// Nothing here throws: an unresolvable main degrades to the plain frame the build
// path would have produced before P2, with a warning (visible loss, not silent).

import type { FigmaExportEffect, FigmaExportFill, FigmaExportNode } from '../../../shared/figma-payload-types';
import { applyInnerOverrides } from './executor-instance-inner-overrides';
import { exportFillToPaint, mapExportEffects, pushImportWarning } from './executor-styles';
import { resolveMainComponent } from './resolve-main-component';
import { asFills, effectToExport } from './scan-node-paint';

/** Builds the degrade-to-frame placeholder — injected to avoid an import cycle. */
export type FrameFallback = (spec: FigmaExportNode) => Promise<SceneNode | null>;

/** Variant selection + component-property values (a no-op when the spec has none). */
function applyComponentProperties(instance: InstanceNode, spec: FigmaExportNode): void {
  if (!spec.componentProperties || Object.keys(spec.componentProperties).length === 0) return;
  try {
    instance.setProperties(spec.componentProperties);
  } catch (err) {
    // A property the main no longer exposes (renamed variant, deleted prop) —
    // the instance still builds, on the main's defaults.
    pushImportWarning(`instance "${spec.name}": setProperties failed — built with main defaults (${String(err)})`);
  }
}

/**
 * True when the spec's fills differ from the paints the main already produced.
 *
 * COMPARED THROUGH THE SCAN'S OWN LENS (spec-005 P14), and that is the whole fix. The
 * old comparison put a LIVE Paint next to a payload-derived one and asked
 * JSON.stringify to judge — but a live Paint carries `visible`, `blendMode` and, the
 * expensive one, `boundVariables`, none of which the payload models. So it answered
 * "differ" for EVERY instance, always, and the write below then stamped literal paints
 * over the main's — destroying an inherited variable binding and minting the spurious
 * override this file's header promises never to mint. Live proof: the DS Filter drawer
 * (25579:376846), whose `_Sheet` child has `overrides: []` and inherits its fill
 * binding straight from its main; the rebuild lost `tailwind colors/base/black`
 * without a single warning, because nothing ever failed — we simply overwrote it.
 *
 * `asFills` is the same function the walker scans with, so both sides of this
 * comparison speak the payload's vocabulary and CANNOT drift apart: whatever the scan
 * would have recorded off the main is what we test the spec against.
 */
function fillsDiffer(current: readonly Paint[] | symbol, wanted: FigmaExportFill[]): boolean {
  if (typeof current === 'symbol') return true; // figma.mixed → cannot compare
  return JSON.stringify(asFills(current as Paint[]) ?? []) !== JSON.stringify(wanted);
}

/**
 * The effects twin of fillsDiffer, and it exists for the same reason (spec-005 P15).
 *
 * `effects` was the ONE node-level visual written with no comparison at all — so an
 * instance whose main already gives the spec's shadow had that shadow overwritten with
 * literals on every single rebuild. It is the fills clobber P14 fixed, in the field
 * next door: a live Effect carries `boundVariables` (a DS shadow is bound five ways —
 * colour, radius, spread, offsetX, offsetY, live on the P15 gate), so writing literals
 * destroys those bindings AND mints a spurious override, silently, exactly as
 * JSON.stringify-ing a live Paint used to. `effectToExport` is the walker's own lens,
 * so both sides speak the payload's vocabulary and cannot drift.
 */
function effectsDiffer(current: readonly Effect[], wanted: FigmaExportEffect[]): boolean {
  if (!Array.isArray(current)) return true;
  const seen = current.map(effectToExport).filter((e): e is FigmaExportEffect => e !== null);
  return JSON.stringify(seen) !== JSON.stringify(wanted);
}

/**
 * Re-apply the node-level overrides the payload models — size, fills, corner
 * radius, opacity — each ONLY when it differs from the main's own value. Every
 * write is guarded: an instance field can be locked by its main component.
 */
function applyNodeOverrides(instance: InstanceNode, spec: FigmaExportNode): void {
  if (spec.name && instance.name !== spec.name) {
    try { instance.name = spec.name; } catch { /* name locked */ }
  }

  if (spec.width && spec.height
    && (Math.abs(instance.width - spec.width) > 0.01 || Math.abs(instance.height - spec.height) > 0.01)) {
    try { instance.resize(spec.width, spec.height); } catch (err) {
      pushImportWarning(`instance "${spec.name}": resize failed (${String(err)})`);
    }
  }

  if (spec.fills && spec.fills.length) {
    const paints = spec.fills.map(exportFillToPaint).filter((p): p is Paint => p !== null);
    if (paints.length && fillsDiffer(instance.fills, spec.fills)) {
      try { instance.fills = paints; } catch { /* fills locked by the main */ }
    }
  }

  if (spec.cornerRadius !== undefined && instance.cornerRadius !== spec.cornerRadius) {
    try { instance.cornerRadius = spec.cornerRadius; } catch { /* radius locked */ }
  } else if (spec.cornerRadii) {
    try {
      instance.topLeftRadius = spec.cornerRadii.tl;
      instance.topRightRadius = spec.cornerRadii.tr;
      instance.bottomRightRadius = spec.cornerRadii.br;
      instance.bottomLeftRadius = spec.cornerRadii.bl;
    } catch { /* radius locked */ }
  }

  if (spec.opacity !== undefined && spec.opacity > 0 && instance.opacity !== spec.opacity) {
    try { instance.opacity = spec.opacity; } catch { /* opacity locked */ }
  }

  if (spec.effects && spec.effects.length && effectsDiffer(instance.effects, spec.effects)) {
    try { instance.effects = mapExportEffects(spec.effects); } catch { /* effects locked */ }
  }
}

/**
 * Payload INSTANCE node → a live instance of its main component.
 * Falls back to `frameFallback` (a plain frame) when the main cannot be resolved —
 * the spec's own visuals still land, but the component link is lost and reported.
 */
export async function createInstanceNode(
  spec: FigmaExportNode,
  frameFallback: FrameFallback,
): Promise<SceneNode | null> {
  const main = await resolveMainComponent(spec);
  if (!main) {
    pushImportWarning(
      `instance "${spec.name}": main component not found (key=${spec.componentKey ?? '—'}, `
      + `id=${spec.componentId ?? '—'}) — rebuilt as a plain frame, component link lost`,
    );
    return frameFallback(spec);
  }

  let instance: InstanceNode;
  try {
    instance = main.createInstance();
  } catch (err) {
    pushImportWarning(`instance "${spec.name}": createInstance failed — rebuilt as a plain frame (${String(err)})`);
    return frameFallback(spec);
  }

  applyComponentProperties(instance, spec); // properties FIRST — a variant swap resets visuals
  applyNodeOverrides(instance, spec);
  await applyInnerOverrides(instance, spec); // …and the inner children LAST (spec-005 P11/P12)
  return instance;
}
