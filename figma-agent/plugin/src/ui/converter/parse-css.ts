// Ported from EaseUI app/src/lib/figma-export.ts:193-326 —
// parseCssGradient (linear/radial/conic) + parseBoxShadow.
// Pure string → payload-fill/effect mapping, no DOM access.

import type { FigmaExportEffect, FigmaExportFill } from '../../../../shared/figma-payload-types';
import { parseCssColor } from './color-utils';

/**
 * Parse a CSS gradient string (linear/radial/conic) into a Figma fill.
 * Returns null when the string is not a parseable gradient.
 */
export function parseCssGradient(cssGradient: string): FigmaExportFill | null {
  try {
    const isRadial = cssGradient.includes('radial-gradient');
    const isConic = cssGradient.includes('conic-gradient');

    const inner = cssGradient.substring(
      cssGradient.indexOf('(') + 1,
      cssGradient.lastIndexOf(')'),
    );
    // Split on commas that are NOT inside parentheses (e.g., rgba())
    const parts = inner.split(/,(?![^(]*\))/);
    if (parts.length < 2) return null;

    if (isRadial) {
      // Skip shape/size/position part, just extract color stops
      let colorStartIndex = 0;
      const first = parts[0].trim().toLowerCase();
      if (first.includes('circle') || first.includes('ellipse') || first.includes('at ') || first.includes('closest') || first.includes('farthest')) {
        colorStartIndex = 1;
      }
      const colorParts = parts.slice(colorStartIndex).map((s) => s.trim());
      if (colorParts.length < 2) return null;
      const gradientStops = colorParts.map((stop, index) => {
        const color = parseCssColor(stop) || { r: 0, g: 0, b: 0, a: 1 };
        return { color, position: index / (colorParts.length - 1) };
      });
      return {
        type: 'GRADIENT_RADIAL',
        gradientStops,
        gradientTransform: [[0.5, 0, 0.25], [0, 0.5, 0.25]], // centered radial
      };
    }

    if (isConic) {
      let colorStartIndex = 0;
      const first = parts[0].trim().toLowerCase();
      if (first.includes('from') || first.includes('at ')) {
        colorStartIndex = 1;
      }
      const colorParts = parts.slice(colorStartIndex).map((s) => s.trim());
      if (colorParts.length < 2) return null;
      const gradientStops = colorParts.map((stop, index) => {
        const color = parseCssColor(stop) || { r: 0, g: 0, b: 0, a: 1 };
        return { color, position: index / (colorParts.length - 1) };
      });
      return {
        type: 'GRADIENT_ANGULAR',
        gradientStops,
        gradientTransform: [[0.5, 0, 0.25], [0, 0.5, 0.25]], // centered angular
      };
    }

    // ─── Linear gradient: determine direction/angle
    const first = parts[0].trim();
    let angleDeg = 180; // default: to bottom
    let colorStartIndex = 0;

    const directionMap: Record<string, number> = {
      'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270,
      'to top right': 45, 'to bottom right': 135,
      'to bottom left': 225, 'to top left': 315,
    };

    if (directionMap[first] !== undefined) {
      angleDeg = directionMap[first];
      colorStartIndex = 1;
    } else if (first.endsWith('deg')) {
      angleDeg = parseFloat(first);
      colorStartIndex = 1;
    }

    const colorParts = parts.slice(colorStartIndex).map((s) => s.trim());
    if (colorParts.length < 2) return null;

    const gradientStops = colorParts.map((stop, index) => {
      const color = parseCssColor(stop) || { r: 0, g: 0, b: 0, a: 1 };
      return { color, position: index / (colorParts.length - 1) };
    });

    // Convert CSS angle to Figma gradientTransform matrix
    const radians = ((angleDeg - 90) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const gradientTransform: [number, number, number][] = [
      [cos, sin, 0.5 - cos * 0.5 - sin * 0.5],
      [-sin, cos, 0.5 + sin * 0.5 - cos * 0.5],
    ];

    return { type: 'GRADIENT_LINEAR', gradientStops, gradientTransform };
  } catch {
    return null;
  }
}

/**
 * Parse a single CSS box-shadow (or text-shadow) into a FigmaExportEffect.
 * Supports: "[inset] 2px 4px 8px [0px] rgba(0,0,0,0.15)".
 */
export function parseBoxShadow(shadow: string): FigmaExportEffect | null {
  if (!shadow || shadow === 'none') return null;
  const isInset = shadow.trim().startsWith('inset');
  const cleanedShadow = shadow.replace(/^inset\s+/, '').trim();
  // Match: x y blur [spread] color
  const match = cleanedShadow.match(
    /([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?(?:\s+([-\d.]+)(?:px)?)?\s+(.*)/,
  );
  if (!match) return null;

  const color = parseCssColor(match[5].trim());
  if (!color) return null;

  return {
    type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
    offset: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    radius: parseFloat(match[3]),
    spread: match[4] ? parseFloat(match[4]) : 0,
    color,
  };
}
