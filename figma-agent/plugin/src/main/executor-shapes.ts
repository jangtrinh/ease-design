// RECTANGLE / IMAGE / SVG node creation.
// Ported from EaseUI figma-plugin/code.ts:462-597 (createRectangleNode,
// createImageNode, createSvgNode, createImageNodeWithFetch). Adapted for
// documentAccess:"dynamic-page": fillStyleId → setFillStyleIdAsync.

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { rgbToFigma, figmaColorToHex, mapExportEffects, pushImportWarning, specNodeName } from './executor-styles';
import { applyStrokes } from './executor-strokes';
import { applyTokenRefs } from './executor-variables';

const PLACEHOLDER_FILL: SolidPaint = { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 }, opacity: 1 };

export async function createRectangleNode(
  exportNode: FigmaExportNode,
  colorStyles: Map<string, PaintStyle>,
  tokenVars?: Map<string, Variable>,
): Promise<RectangleNode> {
  const rect = figma.createRectangle();
  rect.name = specNodeName(exportNode);

  if (exportNode.width) rect.resize(exportNode.width, exportNode.height || exportNode.width);

  // Fills — reuse a generated paint style when the color matches a token
  if (exportNode.fills && exportNode.fills.length > 0) {
    const fill = exportNode.fills[0];
    if (fill.color) {
      const hex = figmaColorToHex(fill.color);
      const paintStyle = colorStyles.get(hex);
      if (paintStyle) {
        await rect.setFillStyleIdAsync(paintStyle.id);
      } else {
        rect.fills = [{
          type: 'SOLID',
          color: rgbToFigma(fill.color),
          opacity: fill.color.a,
        }];
      }
    }
  }

  // Corner radius (uniform or per-corner)
  if (exportNode.cornerRadius !== undefined) {
    rect.cornerRadius = exportNode.cornerRadius;
  } else if (exportNode.cornerRadii) {
    rect.topLeftRadius = exportNode.cornerRadii.tl;
    rect.topRightRadius = exportNode.cornerRadii.tr;
    rect.bottomRightRadius = exportNode.cornerRadii.br;
    rect.bottomLeftRadius = exportNode.cornerRadii.bl;
  }

  // Effects (multi-type: DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR)
  if (exportNode.effects) {
    rect.effects = mapExportEffects(exportNode.effects);
  }

  applyStrokes(rect, exportNode);

  // Opacity — skip 0 values (CSS animation artifacts)
  if (exportNode.opacity !== undefined && exportNode.opacity > 0) {
    rect.opacity = exportNode.opacity;
  }

  // Token bindings (carried follow-up): fill/stroke/radius refs on decorations.
  // Gated on tokenRefs ALONE — see executor-frame's build (spec-005 P6).
  if (exportNode.tokenRefs) {
    applyTokenRefs(rect, exportNode.tokenRefs, tokenVars ?? new Map());
  }

  return rect;
}

/** Fallback: images represented as rectangles with a placeholder fill. */
export function createImageNode(exportNode: FigmaExportNode): RectangleNode {
  const rect = figma.createRectangle();
  rect.name = specNodeName(exportNode);
  rect.resize(exportNode.width || 200, exportNode.height || 200);
  rect.fills = [PLACEHOLDER_FILL];
  rect.cornerRadius = exportNode.cornerRadius || 0;
  return rect;
}

/** Create a vector node from SVG markup using figma.createNodeFromSvg(). */
export function createSvgNode(exportNode: FigmaExportNode): SceneNode {
  try {
    const frame = figma.createNodeFromSvg(exportNode.svgContent!);
    frame.name = specNodeName(exportNode);
    const w = exportNode.width || 24;
    const h = exportNode.height || 24;
    frame.resize(w, h);
    return frame;
  } catch (err) {
    pushImportWarning(`svg import failed for "${exportNode.name}": ${String(err)}`);
    // Fallback to colored rectangle
    return createImageNode(exportNode);
  }
}

/** Download an image from URL and apply it as an image fill. */
export async function createImageNodeWithFetch(exportNode: FigmaExportNode): Promise<RectangleNode> {
  const rect = figma.createRectangle();
  rect.name = specNodeName(exportNode);
  rect.resize(exportNode.width || 200, exportNode.height || 200);
  rect.cornerRadius = exportNode.cornerRadius || 0;

  const url = exportNode.imageUrl || '';
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
    // data: URLs are handled by figma.createImage below only for http(s);
    // blob:/empty can't be fetched from the main thread — placeholder.
    if (url.startsWith('data:')) {
      try {
        const image = figma.createImage(decodeDataUrl(url));
        rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
        return rect;
      } catch { /* fall through to placeholder */ }
    }
    rect.fills = [PLACEHOLDER_FILL];
    return rect;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const image = await createImageFromBytes(new Uint8Array(buffer), url);
    rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
  } catch (err) {
    pushImportWarning(`image fetch failed for "${exportNode.name}" (${url}): ${String(err)}`);
    rect.fills = [PLACEHOLDER_FILL];
  }

  return rect;
}

/** Decode a base64 data: URL into bytes (figma.base64Decode handles the b64 part). */
export function decodeDataUrl(url: string): Uint8Array {
  const comma = url.indexOf(',');
  const b64 = url.slice(comma + 1);
  return figma.base64Decode(b64);
}

/**
 * Create a Figma Image from raw bytes with a format fallback. `figma.createImage`
 * decodes PNG/JPG/GIF; when it rejects (e.g. WebP — see Track 5 COPY #4) fall
 * back to `figma.createImageAsync(url)` which routes decoding through Figma's
 * backend and accepts more formats. `url` is only used for the async fallback.
 */
export async function createImageFromBytes(bytes: Uint8Array, url?: string): Promise<Image> {
  try {
    return figma.createImage(bytes);
  } catch (err) {
    // WebP / unsupported byte format: Figma's async loader can decode it, but
    // needs a fetchable URL (not data:/blob:). Re-throw if we have none.
    if (url && /^https?:/i.test(url)) return await figma.createImageAsync(url);
    throw err;
  }
}

/**
 * Resolve a CSS background-image URL (data: or http(s)) into a Figma IMAGE Paint.
 * Returns null when the bytes can't be resolved (blob:/empty/CORS) so the caller
 * keeps the solid/gradient fill it already built. Track 5 COPY #1 + #2.
 */
export async function resolveImagePaint(
  url: string,
  scaleMode: 'FILL' | 'FIT' | 'TILE' = 'FILL',
): Promise<ImagePaint | null> {
  if (!url || url.startsWith('blob:')) return null;
  try {
    let image: Image;
    if (url.startsWith('data:')) {
      image = await createImageFromBytes(decodeDataUrl(url), undefined);
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      image = await createImageFromBytes(new Uint8Array(buffer), url);
    }
    return { type: 'IMAGE', imageHash: image.hash, scaleMode };
  } catch (err) {
    // Last resort for http(s): let Figma's backend fetch + decode.
    if (/^https?:/i.test(url)) {
      try {
        const image = await figma.createImageAsync(url);
        return { type: 'IMAGE', imageHash: image.hash, scaleMode };
      } catch { /* give up below */ }
    }
    pushImportWarning(`background image fetch failed (${url}): ${String(err)}`);
    return null;
  }
}
