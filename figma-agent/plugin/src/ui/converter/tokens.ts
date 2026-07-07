// Ported from EaseUI app/src/lib/figma-export.ts:788-871 — extractFigmaTokens.
// Walks the built payload node tree and collects unique design tokens
// (colors / typography / spacing / radii) with deterministic names.

import type { FigmaColor, FigmaExportNode, FigmaExportTokens } from '../../../../shared/figma-payload-types';
import { rgbaToHex as figmaColorToHex } from './color-utils';

/** Walk the Figma export node tree and collect unique design tokens. */
export function extractFigmaTokens(rootNode: FigmaExportNode): FigmaExportTokens {
  const colorSet = new Map<string, FigmaColor>();
  const fontSet = new Map<string, { family: string; size: number; weight: number; lineHeight?: number }>();
  const spacingSet = new Set<number>();
  const radiiSet = new Set<number>();

  function walk(node: FigmaExportNode) {
    // Colors from fills
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.color) colorSet.set(figmaColorToHex(fill.color), fill.color);
      }
    }
    // Colors from text
    if (node.textColor) {
      colorSet.set(figmaColorToHex(node.textColor), node.textColor);
    }
    // Colors from strokes
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.color) colorSet.set(figmaColorToHex(stroke.color), stroke.color);
      }
    }

    // Typography
    if (node.type === 'TEXT' && node.fontSize) {
      const key = `${node.fontFamily || 'Inter'}-${node.fontSize}-${node.fontWeight || 400}`;
      fontSet.set(key, {
        family: node.fontFamily || 'Inter',
        size: node.fontSize,
        weight: node.fontWeight || 400,
        lineHeight: node.lineHeight,
      });
    }

    // Spacing
    if (node.itemSpacing && node.itemSpacing > 0) spacingSet.add(node.itemSpacing);
    if (node.paddingTop && node.paddingTop > 0) spacingSet.add(node.paddingTop);
    if (node.paddingRight && node.paddingRight > 0) spacingSet.add(node.paddingRight);
    if (node.paddingBottom && node.paddingBottom > 0) spacingSet.add(node.paddingBottom);
    if (node.paddingLeft && node.paddingLeft > 0) spacingSet.add(node.paddingLeft);

    // Radii
    if (node.cornerRadius && node.cornerRadius > 0 && node.cornerRadius < 9999) {
      radiiSet.add(node.cornerRadius);
    }

    // Recurse
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }

  walk(rootNode);

  // Build named tokens
  const colors = Array.from(colorSet.entries())
    .map(([hex, color]) => ({ name: `color/${hex.replace('#', '')}`, hex, color }))
    .sort((a, b) => a.hex.localeCompare(b.hex));

  const typography = Array.from(fontSet.entries())
    .map(([, val]) => ({
      name: `type/${val.family.toLowerCase()}-${val.size}-${val.weight}`,
      ...val,
    }))
    .sort((a, b) => a.size - b.size);

  const spacing = Array.from(spacingSet)
    .sort((a, b) => a - b)
    .map((v) => ({ name: `spacing/${v}`, value: v }));

  const radii = Array.from(radiiSet)
    .sort((a, b) => a - b)
    .map((v) => ({ name: `radius/${v}`, value: v }));

  return { colors, typography, spacing, radii, shadows: [] };
}

/**
 * P3 leg B (token BINDING): annotate nodes with tokenRefs where a node's
 * resolved fill/textColor/stroke hex, cornerRadius, itemSpacing, or uniform
 * padding EXACTLY matches a collected token value. The executor resolves each
 * name to a variable (resolve-or-create, de-duped) and setBoundVariable-binds.
 */
export function annotateTokenRefs(rootNode: FigmaExportNode, tokens: FigmaExportTokens): void {
  const colorByHex = new Map(tokens.colors.map((t) => [t.hex, t.name]));
  const spacingByValue = new Map(tokens.spacing.map((t) => [t.value, t.name]));
  const radiusByValue = new Map(tokens.radii.map((t) => [t.value, t.name]));

  function walk(node: FigmaExportNode) {
    const refs: NonNullable<FigmaExportNode['tokenRefs']> = {};

    // First SOLID fill — the executor binds paints[0], which is the solid
    // (gradient stacks are emitted [solid, gradient])
    const fillColor = node.fills?.find((f) => f.type === 'SOLID' && f.color)?.color;
    if (fillColor) {
      const name = colorByHex.get(figmaColorToHex(fillColor));
      if (name) refs.fill = name;
    }
    if (node.textColor) {
      const name = colorByHex.get(figmaColorToHex(node.textColor));
      if (name) refs.textColor = name;
    }
    const strokeColor = node.strokes?.find((s) => s.color)?.color;
    if (strokeColor) {
      const name = colorByHex.get(figmaColorToHex(strokeColor));
      if (name) refs.stroke = name;
    }
    if (node.cornerRadius && node.cornerRadius > 0) {
      const name = radiusByValue.get(node.cornerRadius);
      if (name) refs.radius = name;
    }
    if (node.itemSpacing && node.itemSpacing > 0) {
      const name = spacingByValue.get(node.itemSpacing);
      if (name) refs.gap = name;
    }
    // Padding token only when all four sides are present and uniform (contract)
    const pt = node.paddingTop;
    if (pt && pt > 0 && pt === node.paddingRight && pt === node.paddingBottom && pt === node.paddingLeft) {
      const name = spacingByValue.get(pt);
      if (name) refs.padding = name;
    }

    if (Object.keys(refs).length > 0) node.tokenRefs = refs;
    for (const child of node.children ?? []) walk(child);
  }

  walk(rootNode);
}
