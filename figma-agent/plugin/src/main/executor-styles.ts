// Shared color utils + local style creation (paint/text/effect styles).
// Ported from EaseUI figma-plugin/code.ts:122-221 (createColorStyles,
// createTextStyles, createEffectStyles) + rgbToFigma (124-126) +
// figmaColorToHex (858-864). Also hosts the cross-executor helpers:
// error-code tagging and the per-import warnings collector.

import type {
  FigmaColor, FigmaExportEffect, FigmaExportFill, FigmaExportNode, FigmaExportTokens,
} from '../../../shared/figma-payload-types';
import { loadBestFont } from './executor-fonts';

// Folder prefix for generated local styles (EaseUI original used 'EaseUI/').
export const STYLE_FOLDER = 'EaseDesign';

/**
 * The name to give a node built from `spec` — NEVER undefined or empty.
 *
 * `name` is a required Figma property: `node.name = undefined` throws
 * `in set_name: Property "name" failed validation: Required value missing`, and
 * since every create-node path assigns the name FIRST, that one throw aborts the
 * ENTIRE import — a whole tree lost to one malformed node. A rebuild must degrade,
 * not die, so the name is coerced here, at the layer every executor shares, rather
 * than guarded at each of the six assignment sites.
 */
export function specNodeName(spec: FigmaExportNode): string {
  for (const candidate of [spec.name, spec.componentName, spec.type]) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return 'Node';
}

// ── Error tagging (read by main.ts reply envelope) ──────────────────
export function withCode(err: Error, code: string): Error {
  (err as Error & { code: string }).code = code;
  return err;
}

// ── Per-import warnings collector (IMPORT_PAYLOAD result.warnings) ──
let warnings: string[] = [];
export function resetImportWarnings(): void { warnings = []; }
export function pushImportWarning(w: string): void { warnings.push(w); }
export function getImportWarnings(): string[] { return warnings.slice(); }

// ── Color helpers ────────────────────────────────────────────────────
export function rgbToFigma(c: FigmaColor): RGB {
  return { r: c.r, g: c.g, b: c.b };
}

export function figmaColorToHex(c: FigmaColor | undefined): string {
  if (!c) return '#000000';
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Parse '#rgb' / '#rrggbb' / '#rrggbbaa' into a FigmaColor (0..1 channels). */
export function hexToFigmaColor(hex: string): FigmaColor {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
  const int = parseInt(full.slice(0, 6), 16) || 0;
  const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255, a };
}

/**
 * One payload fill → one Figma Paint. The SHARED conversion behind every fill
 * writer (frame build, instance overrides): a gradient with stops+transform maps
 * to a GradientPaint, anything else carrying a colour maps to SOLID (alpha lives
 * in paint.opacity, the convention the reverse-walker reads back).
 */
export function exportFillToPaint(fill: FigmaExportFill): Paint | null {
  if ((fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL' || fill.type === 'GRADIENT_ANGULAR')
    && fill.gradientStops && fill.gradientTransform) {
    return {
      type: fill.type,
      gradientStops: fill.gradientStops.map((stop) => ({
        color: { ...rgbToFigma(stop.color), a: stop.color.a },
        position: stop.position,
      })),
      gradientTransform: fill.gradientTransform as Transform,
    } as GradientPaint;
  }
  if (fill.color) {
    return { type: 'SOLID', color: rgbToFigma(fill.color), opacity: fill.color.a };
  }
  return null;
}

/** Map payload effects → Figma effects (shared by rect + frame executors). */
export function mapExportEffects(effects: FigmaExportEffect[]): Effect[] {
  return effects.map((e) => {
    if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
      return { type: e.type, radius: e.radius, visible: true } as unknown as Effect;
    }
    const color = e.color || { r: 0, g: 0, b: 0, a: 0.25 };
    return {
      type: e.type,
      color: { ...rgbToFigma(color), a: color.a },
      offset: e.offset || { x: 0, y: 0 },
      radius: e.radius,
      spread: e.spread || 0,
      visible: true,
      blendMode: 'NORMAL' as const,
    } as unknown as Effect;
  });
}

// ── Local style creation (one per token; keyed for node reuse) ──────
export async function createColorStyles(colors: FigmaExportTokens['colors']): Promise<Map<string, PaintStyle>> {
  const styleMap = new Map<string, PaintStyle>();
  for (const token of colors) {
    const style = figma.createPaintStyle();
    style.name = `${STYLE_FOLDER}/${token.name}`;
    style.paints = [{
      type: 'SOLID',
      color: rgbToFigma(token.color),
      opacity: token.color.a,
    }];
    styleMap.set(token.hex, style); // keyed by hex so nodes can look up by fill color
  }
  return styleMap;
}

export async function createTextStyles(typography: FigmaExportTokens['typography']): Promise<Map<string, TextStyle>> {
  const styleMap = new Map<string, TextStyle>();
  for (const token of typography) {
    const loadedFont = await loadBestFont(token.family, token.weight);

    const style = figma.createTextStyle();
    style.name = `${STYLE_FOLDER}/${token.name}`;
    style.fontName = loadedFont;
    style.fontSize = token.size;
    if (token.lineHeight) {
      style.lineHeight = { value: token.lineHeight, unit: 'PIXELS' };
    }
    if (token.letterSpacing) {
      style.letterSpacing = { value: token.letterSpacing, unit: 'PIXELS' };
    }
    styleMap.set(token.name, style);
  }
  return styleMap;
}

export async function createEffectStyles(shadows: FigmaExportTokens['shadows']): Promise<Map<string, EffectStyle>> {
  const styleMap = new Map<string, EffectStyle>();
  for (const token of shadows) {
    const style = figma.createEffectStyle();
    style.name = `${STYLE_FOLDER}/${token.name}`;
    style.effects = mapExportEffects([token.effect]);
    styleMap.set(token.name, style);
  }
  return styleMap;
}
