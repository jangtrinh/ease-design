// FRAME creation + auto-layout mapping (incl. native GRID with fallback) and
// the recursive payload-tree dispatcher. Ported from EaseUI
// figma-plugin/code.ts:312-330 (createFigmaNode) and 599-854 (createFrameNode).
// NEW vs port: native GRID per teardown §6 (gridRow/ColumnCount + gaps, wrapped
// in try/catch → HORIZONTAL+WRAP fallback preserving gaps) and applyAutoLayout
// extracted so the SET_AUTOLAYOUT op reuses the exact same mapping.

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { createTextNode } from './executor-text';
import { createRectangleNode, createImageNode, createSvgNode, createImageNodeWithFetch, resolveImagePaint } from './executor-shapes';
import { figmaColorToHex, exportFillToPaint, mapExportEffects, pushImportWarning, specNodeName } from './executor-styles';
import { applyStrokes } from './executor-strokes';
import { createInstanceNode } from './executor-instance';
import { applyKeyedBindings } from './executor-keyed-vars';
import { applyTokenRefs } from './executor-variables';
import { backgroundSizeToScaleMode } from './background-fill';
import { applyMotionTracks } from './executor-motion';

/** Recursive dispatcher: payload node → Figma SceneNode. `tokenVars` = token-name → Variable (P3 leg B). */
export async function createFigmaNode(
  exportNode: FigmaExportNode,
  colorStyles: Map<string, PaintStyle>,
  tokenVars?: Map<string, Variable>,
): Promise<SceneNode | null> {
  let node: SceneNode | null;
  switch (exportNode.type) {
    case 'TEXT':
      node = await createTextNode(exportNode, tokenVars); break;
    case 'IMAGE':
      node = exportNode.svgContent ? createSvgNode(exportNode)
        : exportNode.imageUrl ? await createImageNodeWithFetch(exportNode)
          : createImageNode(exportNode);
      break;
    case 'RECTANGLE':
      node = await createRectangleNode(exportNode, colorStyles, tokenVars); break;
    case 'INSTANCE':
      // spec-005 P2: rebuild from the main component + overrides; an unresolvable
      // main degrades to the pre-P2 behaviour (a plain frame) with a warning.
      node = await createInstanceNode(exportNode, (spec) => createFrameNode(spec, colorStyles, tokenVars));
      break;
    case 'FRAME':
    case 'GROUP':
    default:
      node = await createFrameNode(exportNode, colorStyles, tokenVars); break;
  }
  // spec-005 P7: reattach bindings to PUBLISHED library variables (import by key).
  // ONE call site for every node type on purpose — unlike tokenRefs, which each
  // builder applies itself, this is async, and the per-type builders' visuals are
  // all written by the time they return here, which is exactly when a paint-copy
  // binding must run.
  if (node && exportNode.keyedBindings) {
    await applyKeyedBindings(node, exportNode.keyedBindings);
  }
  // Track 5 Commit-4 wiring: apply captured Motion keyframes to the built node.
  // applyMotionTracks is metronome-gated + per-field try/catch — a no-op when the
  // Motion API is unavailable or the node carries no animatable fields.
  if (node && exportNode.motion && exportNode.motion.steps && exportNode.motion.steps.length >= 2) {
    applyMotionTracks(node, exportNode.motion.steps, exportNode.motion.durationSec, exportNode.motion.easing);
  }
  return node;
}

/** Native GRID (Figma May-2025 API); falls back to HORIZONTAL+WRAP preserving gaps. */
function applyGridLayout(frame: FrameNode, spec: Partial<FigmaExportNode>, applied: Record<string, unknown>): void {
  const f = frame as unknown as Record<string, unknown>; // grid props may be missing in older typings
  try {
    f.layoutMode = 'GRID';
    if (f.layoutMode !== 'GRID') throw new Error('GRID layoutMode not supported by this Figma version');
    // Counts before gaps — gridAutoTracks quirk locks count setters (teardown §6)
    if (spec.gridRowCount) f.gridRowCount = spec.gridRowCount;
    if (spec.gridColumnCount) f.gridColumnCount = spec.gridColumnCount;
    if (spec.gridRowGap !== undefined) f.gridRowGap = spec.gridRowGap;
    if (spec.gridColumnGap !== undefined) f.gridColumnGap = spec.gridColumnGap;
    applied.layoutMode = 'GRID';
    applied.gridRowCount = f.gridRowCount;
    applied.gridColumnCount = f.gridColumnCount;
  } catch (err) {
    frame.layoutMode = 'HORIZONTAL';
    frame.layoutWrap = 'WRAP';
    frame.itemSpacing = spec.gridColumnGap ?? spec.itemSpacing ?? 0; // column gap → main-axis gap
    try { frame.counterAxisSpacing = spec.gridRowGap ?? spec.counterAxisSpacing ?? 0; } catch { /* older Figma */ }
    pushImportWarning(`native GRID unavailable on "${frame.name}" — fell back to HORIZONTAL+WRAP (${String(err)})`);
    applied.layoutMode = 'HORIZONTAL_WRAP_FALLBACK';
  }
}

/**
 * Apply auto-layout fields to a frame. `useDefaults` = payload semantics
 * (unset spacing/padding → 0, as in the original port); false = op semantics
 * (only touch fields present in the spec).
 */
export function applyAutoLayout(frame: FrameNode, spec: Partial<FigmaExportNode>, useDefaults: boolean): Record<string, unknown> {
  const applied: Record<string, unknown> = {};
  const mode = spec.layoutMode;
  if (!mode) return applied;
  if (mode === 'NONE') {
    frame.layoutMode = 'NONE';
    applied.layoutMode = 'NONE';
    return applied;
  }

  if (mode === 'GRID') {
    applyGridLayout(frame, spec, applied);
  } else {
    frame.layoutMode = mode;
    applied.layoutMode = mode;
    if (useDefaults || spec.itemSpacing !== undefined) frame.itemSpacing = spec.itemSpacing ?? 0;
    if (spec.primaryAxisSizingMode) frame.primaryAxisSizingMode = spec.primaryAxisSizingMode === 'AUTO' ? 'AUTO' : 'FIXED';
    if (spec.counterAxisSizingMode) frame.counterAxisSizingMode = spec.counterAxisSizingMode === 'AUTO' ? 'AUTO' : 'FIXED';
    if (spec.primaryAxisAlignItems) frame.primaryAxisAlignItems = spec.primaryAxisAlignItems;
    if (spec.counterAxisAlignItems) frame.counterAxisAlignItems = spec.counterAxisAlignItems;
    // layoutWrap=WRAP is only allowed on HORIZONTAL layout mode in Figma
    if (spec.layoutWrap === 'WRAP' && frame.layoutMode === 'HORIZONTAL') frame.layoutWrap = 'WRAP';
    // Counter-axis spacing (separate row-gap for WRAP layouts)
    if (spec.counterAxisSpacing !== undefined && frame.layoutWrap === 'WRAP') {
      try { frame.counterAxisSpacing = spec.counterAxisSpacing; } catch { /* not supported */ }
    }
  }

  // Padding applies to flex AND grid auto-layout alike
  if (useDefaults || spec.paddingTop !== undefined) frame.paddingTop = spec.paddingTop ?? 0;
  if (useDefaults || spec.paddingRight !== undefined) frame.paddingRight = spec.paddingRight ?? 0;
  if (useDefaults || spec.paddingBottom !== undefined) frame.paddingBottom = spec.paddingBottom ?? 0;
  if (useDefaults || spec.paddingLeft !== undefined) frame.paddingLeft = spec.paddingLeft ?? 0;

  // Self sizing (op path only — payload path applies these via the parent's child loop)
  if (!useDefaults && spec.layoutSizingHorizontal) {
    try { frame.layoutSizingHorizontal = spec.layoutSizingHorizontal; applied.layoutSizingHorizontal = spec.layoutSizingHorizontal; } catch { /* needs auto-layout parent */ }
  }
  if (!useDefaults && spec.layoutSizingVertical) {
    try { frame.layoutSizingVertical = spec.layoutSizingVertical; applied.layoutSizingVertical = spec.layoutSizingVertical; } catch { /* needs auto-layout parent */ }
  }
  return applied;
}

/**
 * Re-assert the spec's axis sizing modes — the LAST word on a built frame.
 *
 * Two things overwrite them on the way up, and both are unavoidable:
 *   1. `resize()` on an auto-layout frame forces BOTH primaryAxisSizingMode and
 *      counterAxisSizingMode to FIXED. Since createFrameNode resizes AFTER
 *      applyAutoLayout, every AUTO frame in a payload rebuilt as FIXED.
 *   2. appending a child that FILLs an axis its parent HUGs coerces the parent to
 *      FIXED on that axis.
 *
 * This is what the live P5 gate saw on 25575:353653: the root's
 * `primaryAxisSizingMode AUTO→FIXED`, the nested frame's `counterAxisSizingMode
 * AUTO→FIXED` — and, as the same fact seen through the newer API, the root's
 * `layoutSizingVertical HUG→FIXED`. HUG is legal on a standalone frame (it needs
 * auto-layout on the node ITSELF, not on a parent — only FILL needs the parent), so
 * that third diff is not a context artifact: restoring the mode restores the HUG.
 */
function reassertAxisSizing(frame: FrameNode, spec: Partial<FigmaExportNode>): void {
  if (!spec.layoutMode || spec.layoutMode === 'NONE' || spec.layoutMode === 'GRID') return;
  if (frame.layoutMode === 'NONE') return; // GRID fell back, or no auto-layout to speak of
  if (spec.primaryAxisSizingMode) {
    try { frame.primaryAxisSizingMode = spec.primaryAxisSizingMode; } catch { /* not auto-layout */ }
  }
  if (spec.counterAxisSizingMode) {
    try { frame.counterAxisSizingMode = spec.counterAxisSizingMode; } catch { /* same */ }
  }
}

/** Sizing hints for a child just appended to an auto-layout frame (port of code.ts:811-848). */
function applyChildSizingHints(frame: FrameNode, childNode: SceneNode, childExport: FigmaExportNode): void {
  if (frame.layoutMode === 'NONE') return;
  const child = childNode as unknown as Record<string, unknown>;
  // Per-axis try blocks: a failed horizontal set (node type without layoutSizing)
  // must not skip vertical/layoutGrow. HUG is set EXPLICITLY (live lesson 2:
  // children of auto-layout parents get counter-axis stretched unless sizing set).
  try {
    if (childExport.layoutSizingHorizontal) {
      child.layoutSizingHorizontal = childExport.layoutSizingHorizontal;
    } else if (frame.layoutMode === 'VERTICAL') {
      // Fallback: block-level elements fill width in VERTICAL parents.
      // NEVER for TEXT — setting FILL on a text layer makes Figma coerce
      // WIDTH_AND_HEIGHT → HEIGHT (the truncated/stretched-title root cause).
      if (childExport.type === 'FRAME' || childExport.type === 'GROUP'
        || childExport.type === 'RECTANGLE') {
        child.layoutSizingHorizontal = 'FILL';
      } else if (childExport.type === 'TEXT') {
        child.layoutSizingHorizontal =
          childExport.textAutoResize === 'HEIGHT' ? 'FIXED' : 'HUG';
      }
    }
  } catch { /* node type without layoutSizing, or HUG on non-auto-layout child */ }
  try {
    if (childExport.layoutSizingVertical) child.layoutSizingVertical = childExport.layoutSizingVertical;
  } catch { /* same */ }
  // Belt: sizing writes above may have coerced a text layer's auto-resize —
  // re-assert the payload's intent as the LAST word.
  try {
    if (childExport.type === 'TEXT' && childExport.textAutoResize
      && (childNode as TextNode).textAutoResize !== childExport.textAutoResize) {
      (childNode as TextNode).textAutoResize = childExport.textAutoResize;
    }
  } catch { /* not a text node */ }
  try {
    // layoutGrow for proportional sizing
    if (childExport.layoutGrow && childExport.layoutGrow > 0) child.layoutGrow = childExport.layoutGrow;
  } catch { /* same */ }
}

export async function createFrameNode(
  exportNode: FigmaExportNode,
  colorStyles: Map<string, PaintStyle>,
  tokenVars?: Map<string, Variable>,
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = specNodeName(exportNode);

  // Auto-Layout (flex or native GRID)
  if (exportNode.layoutMode && exportNode.layoutMode !== 'NONE') {
    applyAutoLayout(frame, exportNode, true);
  }

  // Dimensions. resize() FIXES both axes on an auto-layout frame, so the spec's
  // modes are restored right after — an AUTO axis re-derives its size from the
  // children appended below, which is the point of AUTO.
  if (exportNode.width) {
    const h = exportNode.height || 100;
    frame.resize(exportNode.width, h);
    reassertAxisSizing(frame, exportNode);
  }

  // Fills — gradient (linear/radial/angular), solid (token style reuse),
  // CSS background-image (Track 5 COPY #1: IMAGE fill on top), or transparent.
  const hasBgImage = !!exportNode.backgroundImageUrl;
  if ((exportNode.fills && exportNode.fills.length > 0) || hasBgImage) {
    const figmaFills: Paint[] = [];
    let usedPaintStyle = false;
    for (const fill of exportNode.fills ?? []) {
      const paint = exportFillToPaint(fill);
      if (!paint) continue;
      const paintStyle = paint.type === 'SOLID' ? colorStyles.get(figmaColorToHex(fill.color)) : undefined;
      // Skip the paint-style shortcut when a bg-image must sit on top — the
      // image + solid have to coexist in the fills array (setFillStyleIdAsync
      // would replace them entirely).
      if (paintStyle && !hasBgImage) {
        await frame.setFillStyleIdAsync(paintStyle.id);
        usedPaintStyle = true;
      } else {
        figmaFills.push(paint);
      }
    }
    // CSS background-image paints ABOVE background-color (Figma: last fill on top).
    if (hasBgImage) {
      const scaleMode = backgroundSizeToScaleMode(exportNode.backgroundSize);
      const imgPaint = await resolveImagePaint(exportNode.backgroundImageUrl!, scaleMode);
      if (imgPaint) figmaFills.push(imgPaint);
    }
    if (figmaFills.length > 0) frame.fills = figmaFills;
    else if (!usedPaintStyle) frame.fills = [];
  } else {
    frame.fills = []; // transparent background for layout frames (like CSS)
  }

  // Corner radius (uniform or per-corner)
  if (exportNode.cornerRadius !== undefined) {
    frame.cornerRadius = exportNode.cornerRadius;
  } else if (exportNode.cornerRadii) {
    frame.topLeftRadius = exportNode.cornerRadii.tl;
    frame.topRightRadius = exportNode.cornerRadii.tr;
    frame.bottomRightRadius = exportNode.cornerRadii.br;
    frame.bottomLeftRadius = exportNode.cornerRadii.bl;
  }

  if (exportNode.effects) frame.effects = mapExportEffects(exportNode.effects);
  if (exportNode.rotation) frame.rotation = exportNode.rotation;
  if (exportNode.blendMode) {
    try { frame.blendMode = exportNode.blendMode as BlendMode; } catch { /* unsupported blend mode */ }
  }
  if (exportNode.counterAxisAlignContent) {
    try { frame.counterAxisAlignContent = exportNode.counterAxisAlignContent; } catch { /* not supported */ }
  }

  applyStrokes(frame, exportNode);

  // Opacity — skip 0 values which are CSS animation artifacts (reveal animations)
  if (exportNode.opacity !== undefined && exportNode.opacity > 0) {
    frame.opacity = exportNode.opacity;
  }

  // Max/Min width/height constraints
  try {
    if (exportNode.maxWidth) frame.maxWidth = exportNode.maxWidth;
    if (exportNode.minWidth) frame.minWidth = exportNode.minWidth;
    if (exportNode.maxHeight) frame.maxHeight = exportNode.maxHeight;
    if (exportNode.minHeight) frame.minHeight = exportNode.minHeight;
  } catch {
    // Constraints not supported on all node types
  }

  // Clip content (overflow: hidden)
  frame.clipsContent = !!exportNode.clipsContent;

  // Token bindings (P3 leg B) — after fills/strokes/radius/spacing/padding
  // are set so paint-copy binding rebinds the actual applied paints.
  // Gated on tokenRefs ALONE (spec-005 P6): an empty map must still reach
  // applyTokenRefs so an unresolvable ref warns instead of vanishing.
  if (exportNode.tokenRefs) {
    applyTokenRefs(frame, exportNode.tokenRefs, tokenVars ?? new Map());
  }

  // Children
  if (exportNode.children) {
    for (const childExport of exportNode.children) {
      const childNode = await createFigmaNode(childExport, colorStyles, tokenVars);
      if (!childNode) continue;
      frame.appendChild(childNode);

      // Absolute positioning (CD4): layoutPositioning FIRST (auto-layout parent
      // ignores x/y while the child is in flow), then x/y in parent space.
      if (childExport.absolutePosition && childExport.x !== undefined && childExport.y !== undefined) {
        try {
          if (frame.layoutMode !== 'NONE' && 'layoutPositioning' in childNode) {
            (childNode as FrameNode).layoutPositioning = 'ABSOLUTE';
          }
          childNode.x = childExport.x;
          childNode.y = childExport.y;
        } catch (err) {
          pushImportWarning(`absolute positioning failed on "${childNode.name}" — left in flow (${String(err)})`);
        }
        continue;
      }

      applyChildSizingHints(frame, childNode, childExport);
    }
  }

  // Belt, mirroring the textAutoResize one above: a child set to FILL an axis its
  // parent HUGs coerces the parent to FIXED, so the spec's modes get the last word
  // once every child is in place.
  reassertAxisSizing(frame, exportNode);

  return frame;
}
