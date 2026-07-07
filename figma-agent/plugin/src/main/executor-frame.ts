// FRAME creation + auto-layout mapping (incl. native GRID with fallback) and
// the recursive payload-tree dispatcher. Ported from EaseUI
// figma-plugin/code.ts:312-330 (createFigmaNode) and 599-854 (createFrameNode).
// NEW vs port: native GRID per teardown §6 (gridRow/ColumnCount + gaps, wrapped
// in try/catch → HORIZONTAL+WRAP fallback preserving gaps) and applyAutoLayout
// extracted so the SET_AUTOLAYOUT op reuses the exact same mapping.

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { createTextNode } from './executor-text';
import { createRectangleNode, createImageNode, createSvgNode, createImageNodeWithFetch } from './executor-shapes';
import { rgbToFigma, figmaColorToHex, mapExportEffects, pushImportWarning } from './executor-styles';
import { applyTokenRefs } from './executor-variables';

/** Recursive dispatcher: payload node → Figma SceneNode. `tokenVars` = token-name → Variable (P3 leg B). */
export async function createFigmaNode(
  exportNode: FigmaExportNode,
  colorStyles: Map<string, PaintStyle>,
  tokenVars?: Map<string, Variable>,
): Promise<SceneNode | null> {
  switch (exportNode.type) {
    case 'TEXT':
      return await createTextNode(exportNode, tokenVars);
    case 'IMAGE':
      if (exportNode.svgContent) return createSvgNode(exportNode);
      if (exportNode.imageUrl) return await createImageNodeWithFetch(exportNode);
      return createImageNode(exportNode);
    case 'RECTANGLE':
      return await createRectangleNode(exportNode, colorStyles, tokenVars);
    case 'FRAME':
    case 'GROUP':
    default:
      return await createFrameNode(exportNode, colorStyles, tokenVars);
  }
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
  frame.name = exportNode.name;

  // Auto-Layout (flex or native GRID)
  if (exportNode.layoutMode && exportNode.layoutMode !== 'NONE') {
    applyAutoLayout(frame, exportNode, true);
  }

  // Dimensions
  if (exportNode.width) {
    const h = exportNode.height || 100;
    frame.resize(exportNode.width, h);
    if (exportNode.counterAxisSizingMode === 'FIXED') {
      try { frame.layoutSizingHorizontal = 'FIXED'; } catch { /* no auto-layout context */ }
    }
  }

  // Fills — gradient (linear/radial/angular), solid (token style reuse), or transparent
  if (exportNode.fills && exportNode.fills.length > 0) {
    const figmaFills: Paint[] = [];
    for (const fill of exportNode.fills) {
      if ((fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL' || fill.type === 'GRADIENT_ANGULAR')
        && fill.gradientStops && fill.gradientTransform) {
        figmaFills.push({
          type: fill.type,
          gradientStops: fill.gradientStops.map((stop) => ({
            color: { ...rgbToFigma(stop.color), a: stop.color.a },
            position: stop.position,
          })),
          gradientTransform: fill.gradientTransform as Transform,
        } as GradientPaint);
      } else if (fill.color) {
        const hex = figmaColorToHex(fill.color);
        const paintStyle = colorStyles.get(hex);
        if (paintStyle) {
          await frame.setFillStyleIdAsync(paintStyle.id);
        } else {
          figmaFills.push({
            type: 'SOLID',
            color: rgbToFigma(fill.color),
            opacity: fill.color.a,
          });
        }
      }
    }
    if (figmaFills.length > 0) frame.fills = figmaFills;
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

  // Strokes
  if (exportNode.strokes && exportNode.strokes.length > 0) {
    frame.strokes = exportNode.strokes.filter((s) => s.color).map((s) => ({
      type: 'SOLID' as const,
      color: rgbToFigma(s.color!),
      opacity: s.color!.a,
    }));
    frame.strokeWeight = exportNode.strokeWeight || 1;
    if (exportNode.strokeAlign) frame.strokeAlign = exportNode.strokeAlign;
  }

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
  // are set so paint-copy binding rebinds the actual applied paints
  if (exportNode.tokenRefs && tokenVars && tokenVars.size > 0) {
    applyTokenRefs(frame, exportNode.tokenRefs, tokenVars);
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

  return frame;
}
