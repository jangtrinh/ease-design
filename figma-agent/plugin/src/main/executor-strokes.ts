// Stroke application — ONE writer for every node type that can carry a stroke.
//
// Extracted from executor-frame/executor-shapes, which had drifted into two copies
// of `strokeWeight = spec.strokeWeight || 1`. That line lost two things on the live
// P5 round-trip (25575:353653):
//
//   1. A node with INDIVIDUAL stroke weights (border-bottom-only dividers — the
//      shape shadcn layouts are built from) reports `strokeWeight === figma.mixed`,
//      so the scan emits no `strokeWeight` at all. `|| 1` then invented a uniform
//      1px border on all four sides where the original had one edge.
//   2. `|| 1` coerced a real `strokeWeight: 0` to 1 — falsy, not absent.
//
// Both are fixed here, once, for frames and shapes alike (Art: a missing-rule bug is
// fixed at the shared layer — ask which other consumer has the blind spot).

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { rgbToFigma } from './executor-styles';

/** The stroke surface we touch — structural, so FrameNode and RectangleNode both fit
 * without a cast at each call site. Individual weights are optional: not every
 * strokeable node type carries IndividualStrokesMixin. */
type StrokeTarget = {
  strokes: readonly Paint[];
  // `number | figma.mixed` in Figma's own typings — the READ is mixed on a node with
  // individual side weights. Point 1 in the header, stated by the API itself.
  strokeWeight: number | typeof figma.mixed;
  strokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER';
};

const SIDE_FIELDS = {
  top: 'strokeTopWeight',
  right: 'strokeRightWeight',
  bottom: 'strokeBottomWeight',
  left: 'strokeLeftWeight',
} as const;

/**
 * Apply `spec`'s strokes to `node`. A no-op when the spec carries no strokes — an
 * absent stroke stays absent, never a defaulted 1px.
 */
export function applyStrokes(node: StrokeTarget, spec: Partial<FigmaExportNode>): void {
  if (!spec.strokes || spec.strokes.length === 0) return;

  node.strokes = spec.strokes.filter((s) => s.color).map((s) => ({
    type: 'SOLID' as const,
    color: rgbToFigma(s.color!),
    opacity: s.color!.a,
  }));

  // Per-side weights win — and must be written INSTEAD of the uniform weight, which
  // resets all four sides on assignment.
  if (spec.strokeWeights) {
    const target = node as unknown as Record<string, number>;
    for (const [side, field] of Object.entries(SIDE_FIELDS)) {
      const w = spec.strokeWeights[side as keyof typeof SIDE_FIELDS];
      try { target[field] = w; } catch { /* node type without individual strokes */ }
    }
  } else if (spec.strokeWeight !== undefined) {
    // `??`, never `||`: a 0 weight is a value, not an absence.
    node.strokeWeight = spec.strokeWeight;
  } else {
    node.strokeWeight = 1;
  }

  if (spec.strokeAlign) node.strokeAlign = spec.strokeAlign;
}
