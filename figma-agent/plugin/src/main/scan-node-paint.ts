// Reverse-walker: Figma Paint / Effect → the payload's fill & effect shapes.
// The symmetric inverse of executor-frame's fill mapping and
// executor-styles.mapExportEffects. Extracted from scan-node.ts (Art IX).

import type { FigmaExportEffect, FigmaExportFill } from '../../../shared/figma-payload-types';
import { safe } from './scan-node-utils';

/** One Figma Paint → FigmaExportFill (SOLID alpha lives in paint.opacity → color.a). */
export function paintToFill(p: Paint): FigmaExportFill | null {
  if (p.type === 'SOLID') {
    const a = typeof p.opacity === 'number' ? p.opacity : 1;
    return { type: 'SOLID', color: { r: p.color.r, g: p.color.g, b: p.color.b, a } };
  }
  if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR') {
    const g = p as GradientPaint;
    return {
      type: p.type,
      gradientStops: g.gradientStops.map((s) => ({
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
        position: s.position,
      })),
      gradientTransform: g.gradientTransform as unknown as [number, number, number][],
    };
  }
  return null; // IMAGE / VIDEO paints not modelled by this spike
}

/** Figma Effect → FigmaExportEffect (inverse of executor-styles.mapExportEffects). */
export function effectToExport(e: Effect): FigmaExportEffect | null {
  if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
    return { type: e.type, radius: e.radius };
  }
  const s = e as DropShadowEffect;
  const c = s.color;
  return {
    type: e.type as FigmaExportEffect['type'],
    offset: { x: s.offset.x, y: s.offset.y },
    radius: s.radius,
    spread: s.spread ?? 0,
    color: { r: c.r, g: c.g, b: c.b, a: c.a },
  };
}

/** A node's fills/strokes array → payload fills; undefined when nothing modelled. */
const SIDE_WEIGHT_FIELDS = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'] as const;

/**
 * The four individual stroke weights, or undefined when the node has none.
 *
 * The inverse of executor-strokes.applyStrokes: `node.strokeWeight` answers
 * figma.mixed exactly when these differ (a border-bottom-only divider), and a
 * mixed read is the ONLY reason to come here — see the caller.
 */
export function readIndividualStrokeWeights(
  n: Record<string, unknown>,
): { top: number; right: number; bottom: number; left: number } | undefined {
  const [top, right, bottom, left] = SIDE_WEIGHT_FIELDS.map((f) => safe(() => n[f] as number));
  if ([top, right, bottom, left].some((w) => typeof w !== 'number')) return undefined;
  return { top: top as number, right: right as number, bottom: bottom as number, left: left as number };
}

export const asFills =(v: unknown): FigmaExportFill[] | undefined => {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out = (v as Paint[]).map(paintToFill).filter((f): f is FigmaExportFill => f !== null);
  return out.length ? out : undefined;
};
