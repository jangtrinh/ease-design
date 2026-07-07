// Ported from EaseUI app/src/lib/figma-export.ts:148-191 (hasExplicitDimension),
// 1711-2266 (buildFrameNode, getDirectTextFromRendered, deriveComputedNodeName).
// NEW vs source (docs/research/html-to-figma-quality-teardown.md §6):
//  - real grid track parser incl. repeat(N, unit) → layoutMode GRID +
//    gridColumnCount/gridRowCount/gridRowGap/gridColumnGap
//  - WRAP-fallback keeps gaps (itemSpacing = colGap, counterAxisSpacing = rowGap)

import type { FigmaColor, FigmaExportNode } from '../../../../shared/figma-payload-types';
import { parseCssColor } from './color-utils';
import { parseBoxShadow, parseCssGradient } from './parse-css';
import { buildChildNodes, hasExplicitDimension } from './build-frame-children';

/**
 * NEW: count tracks in a grid-template-columns/rows value.
 * Handles expanded computed lists ("240px 240px"), repeat(N, tracks) forms,
 * and function tracks like minmax(0, 1fr) via paren-aware tokenizing.
 * Returns 0 when not derivable (none / auto-fill / auto-fit).
 */
export function countGridTracks(template: string): number {
  if (!template || template === 'none') return 0;
  const tokens: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of template) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) tokens.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) tokens.push(cur);

  let count = 0;
  for (const tok of tokens) {
    if (tok.startsWith('[')) continue; // line names — not tracks
    if (/^repeat\(\s*(auto-fill|auto-fit)/.test(tok)) return 0; // content-dependent
    const rep = tok.match(/^repeat\((\d+)\s*,/);
    if (rep) {
      // repeat(N, tracks) may contain multiple tracks: repeat(2, 1fr 2fr) → 4
      const inner = tok.slice(tok.indexOf(',') + 1, tok.lastIndexOf(')')).trim();
      count += parseInt(rep[1], 10) * (countGridTracks(inner) || 1);
    } else {
      count += 1;
    }
  }
  return count;
}

/** Derive a node name from a rendered element (aria-label > id > tag > class). */
function deriveComputedNodeName(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const id = el.getAttribute('id');
  if (id) return id;

  const tagNames: Record<string, string> = {
    NAV: 'Navigation', HEADER: 'Header', FOOTER: 'Footer',
    MAIN: 'Main', ASIDE: 'Sidebar', SECTION: 'Section',
    ARTICLE: 'Article', FORM: 'Form', UL: 'List', OL: 'List',
    LI: 'List Item', TABLE: 'Table', BUTTON: 'Button',
  };
  if (tagNames[el.tagName]) return tagNames[el.tagName];

  // First meaningful (non-utility) class
  const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const meaningfulClass = classes.find((c) =>
    !c.startsWith('flex') && !c.startsWith('grid') && !c.startsWith('p-') &&
    !c.startsWith('m-') && !c.startsWith('w-') && !c.startsWith('h-') &&
    !c.startsWith('bg-') && !c.startsWith('text-') && !c.startsWith('rounded') &&
    !c.startsWith('border') && !c.startsWith('shadow') && !c.startsWith('gap') &&
    !c.startsWith('items-') && !c.startsWith('justify-') && !c.startsWith('space-') &&
    !c.startsWith('overflow') && !c.startsWith('relative') && !c.startsWith('absolute') &&
    !c.startsWith('min-') && !c.startsWith('max-') && c !== 'inline-flex');
  if (meaningfulClass) return meaningfulClass;

  return 'Frame';
}

/** Build a FRAME node from computed styles, recursively processing children. */
export function buildFrameNode(el: HTMLElement, cs: CSSStyleDeclaration, win: Window, depth: number): FigmaExportNode {
  const node: FigmaExportNode = { type: 'FRAME', name: deriveComputedNodeName(el) };

  // ─── Layout mode from computed display/flex-direction
  const display = cs.display;
  const flexDir = cs.flexDirection;

  if (display.includes('flex') || display === 'inline-flex') {
    node.layoutMode = (flexDir === 'column' || flexDir === 'column-reverse') ? 'VERTICAL' : 'HORIZONTAL';
    node.primaryAxisSizingMode = 'AUTO'; // hug content on primary axis
    node.counterAxisSizingMode = 'FIXED'; // fill available on counter axis

    if ((cs.flexWrap === 'wrap' || cs.flexWrap === 'wrap-reverse') && node.layoutMode === 'HORIZONTAL') {
      node.layoutWrap = 'WRAP';
    }

    const alignItems = cs.alignItems;
    if (alignItems === 'center') node.counterAxisAlignItems = 'CENTER';
    else if (alignItems === 'flex-end' || alignItems === 'end') node.counterAxisAlignItems = 'MAX';
    else if (alignItems === 'baseline') node.counterAxisAlignItems = 'BASELINE';
    else node.counterAxisAlignItems = 'MIN';

    const justifyContent = cs.justifyContent;
    if (justifyContent === 'center') node.primaryAxisAlignItems = 'CENTER';
    else if (justifyContent === 'flex-end' || justifyContent === 'end') node.primaryAxisAlignItems = 'MAX';
    else if (justifyContent === 'space-between') node.primaryAxisAlignItems = 'SPACE_BETWEEN';
    else node.primaryAxisAlignItems = 'MIN';
  } else if (display === 'grid' || display === 'inline-grid') {
    // NEW: native GRID emission when the column count is derivable;
    // otherwise fall back to source behavior (HORIZONTAL + WRAP).
    node.primaryAxisSizingMode = 'AUTO';
    node.counterAxisSizingMode = 'FIXED';
    const colCount = countGridTracks(cs.gridTemplateColumns);
    if (colCount > 0) {
      node.layoutMode = 'GRID';
      node.gridColumnCount = colCount;
      const rowCount = countGridTracks(cs.gridTemplateRows); // explicit rows only when derivable
      if (rowCount > 0) node.gridRowCount = rowCount;
      const gRowGap = Math.round(parseFloat(cs.rowGap) || 0);
      const gColGap = Math.round(parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0);
      if (gRowGap > 0) node.gridRowGap = gRowGap;
      if (gColGap > 0) node.gridColumnGap = gColGap;
    } else {
      node.layoutMode = 'HORIZONTAL';
    }
    // WRAP-fallback semantics: shared gap block below fills itemSpacing (colGap)
    // + counterAxisSpacing (rowGap) so a degraded WRAP layout keeps spacing.
    node.layoutWrap = 'WRAP';
  } else if (display === 'inline' || display === 'inline-block') {
    node.layoutMode = 'HORIZONTAL';
    node.primaryAxisSizingMode = 'AUTO';
    node.counterAxisSizingMode = 'AUTO';
  } else {
    // Block elements → vertical auto-layout, fill width
    node.layoutMode = 'VERTICAL';
    node.primaryAxisSizingMode = 'AUTO';
    node.counterAxisSizingMode = 'FIXED';
  }

  // ─── Gap (item spacing)
  const gap = parseFloat(cs.gap) || parseFloat(cs.rowGap) || parseFloat(cs.columnGap) || 0;
  if (gap > 0) node.itemSpacing = Math.round(gap);

  // For WRAP layouts (flex-wrap AND grid fallback), capture separate row-gap
  if (node.layoutWrap === 'WRAP') {
    const rowGap = parseFloat(cs.rowGap) || 0;
    const colGap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
    if (colGap > 0) node.itemSpacing = Math.round(colGap);
    if (rowGap > 0 && rowGap !== colGap) node.counterAxisSpacing = Math.round(rowGap);
  }

  // ─── Margin-to-itemSpacing fallback: CSS margins between children → gap
  if (!node.itemSpacing || node.itemSpacing === 0) {
    const childEls = Array.from(el.children).filter((c) => c.nodeType === 1) as HTMLElement[];
    if (childEls.length >= 2) {
      const isVertical = node.layoutMode === 'VERTICAL';
      const margins: number[] = [];
      for (let i = 0; i < Math.min(childEls.length, 5); i++) {
        const childCs = win.getComputedStyle(childEls[i]);
        if (isVertical) {
          // CSS margin collapsing: the larger of bottom/top wins
          margins.push(Math.max(parseFloat(childCs.marginBottom) || 0, parseFloat(childCs.marginTop) || 0));
        } else {
          margins.push(Math.max(parseFloat(childCs.marginRight) || 0, parseFloat(childCs.marginLeft) || 0));
        }
      }
      // Use the most common non-zero margin (mode) as itemSpacing
      const freq: Record<number, number> = {};
      for (const m of margins) {
        if (m > 0) {
          const rounded = Math.round(m);
          freq[rounded] = (freq[rounded] || 0) + 1;
        }
      }
      let bestMargin = 0;
      let bestCount = 0;
      for (const [val, count] of Object.entries(freq)) {
        if (count > bestCount || (count === bestCount && Number(val) > bestMargin)) {
          bestMargin = Number(val);
          bestCount = count;
        }
      }
      if (bestMargin > 0) node.itemSpacing = bestMargin;
    }
  }

  // ─── Padding
  const pt = parseFloat(cs.paddingTop) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const pl = parseFloat(cs.paddingLeft) || 0;
  if (pt > 0) node.paddingTop = Math.round(pt);
  if (pr > 0) node.paddingRight = Math.round(pr);
  if (pb > 0) node.paddingBottom = Math.round(pb);
  if (pl > 0) node.paddingLeft = Math.round(pl);

  // ─── Clip content (overflow: hidden/clip/scroll/auto)
  const overflow = cs.overflow || cs.overflowX || cs.overflowY;
  if (overflow === 'hidden' || overflow === 'clip' || overflow === 'scroll' || overflow === 'auto') {
    node.clipsContent = true;
  }

  // ─── Dimensions (getBoundingClientRect for sub-pixel accuracy)
  const rect = el.getBoundingClientRect();
  const width = rect.width || el.offsetWidth;
  const height = rect.height || el.offsetHeight;
  if (width > 0) node.width = Math.round(width);
  if (height > 0) node.height = Math.round(height);

  // ─── Absolute/fixed positioning (right/bottom handled via rect deltas)
  if (cs.position === 'absolute' || cs.position === 'fixed') {
    node.absolutePosition = true;
    const parentRect = el.parentElement?.getBoundingClientRect();
    if (parentRect) {
      node.x = Math.round(rect.left - parentRect.left);
      node.y = Math.round(rect.top - parentRect.top);
    } else {
      node.x = el.offsetLeft;
      node.y = el.offsetTop;
    }
  }

  // ─── margin: 0 auto → horizontally centered, keep FIXED width
  if (cs.marginLeft === 'auto' && cs.marginRight === 'auto') {
    node.layoutSizingHorizontal = 'FIXED';
  }

  // ─── Background: gradient, image, or solid color
  const bgImage = cs.backgroundImage;
  if (bgImage && bgImage !== 'none' && bgImage.includes('gradient')) {
    const gradientFill = parseCssGradient(bgImage);
    if (gradientFill) {
      const bgColor = parseCssColor(cs.backgroundColor);
      // Solid color behind the gradient → multiple fills
      node.fills = bgColor && bgColor.a > 0 ? [{ type: 'SOLID', color: bgColor }, gradientFill] : [gradientFill];
    }
  } else if (bgImage && bgImage !== 'none') {
    // background-image: url(...) → extract image URL + size/position
    const urlMatch = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
    if (urlMatch && urlMatch[1]) {
      node.backgroundImageUrl = urlMatch[1];
      if (cs.backgroundSize && cs.backgroundSize !== 'auto') node.backgroundSize = cs.backgroundSize;
      if (cs.backgroundPosition && cs.backgroundPosition !== '0% 0%') node.backgroundPosition = cs.backgroundPosition;
    }
    const bgColor = parseCssColor(cs.backgroundColor);
    if (bgColor && bgColor.a > 0) node.fills = [{ type: 'SOLID', color: bgColor }];
  } else {
    const bgColor = parseCssColor(cs.backgroundColor);
    if (bgColor && bgColor.a > 0) node.fills = [{ type: 'SOLID', color: bgColor }];
  }

  // ─── Border radius (per-corner)
  const tl = parseFloat(cs.borderTopLeftRadius) || 0;
  const tr = parseFloat(cs.borderTopRightRadius) || 0;
  const br = parseFloat(cs.borderBottomRightRadius) || 0;
  const bl = parseFloat(cs.borderBottomLeftRadius) || 0;
  if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
    if (tl === tr && tr === br && br === bl) {
      if (tl < 9999) node.cornerRadius = Math.round(tl);
    } else {
      node.cornerRadii = { tl: Math.round(tl), tr: Math.round(tr), br: Math.round(br), bl: Math.round(bl) };
    }
  }

  // ─── Border / stroke — dominant (thickest visible) side wins
  const bTopW = parseFloat(cs.borderTopWidth) || 0;
  const bRightW = parseFloat(cs.borderRightWidth) || 0;
  const bBottomW = parseFloat(cs.borderBottomWidth) || 0;
  const bLeftW = parseFloat(cs.borderLeftWidth) || 0;
  const maxBorderW = Math.max(bTopW, bRightW, bBottomW, bLeftW);
  if (maxBorderW > 0) {
    let dominantColor: FigmaColor | null = null;
    if (bTopW === maxBorderW) dominantColor = parseCssColor(cs.borderTopColor);
    else if (bRightW === maxBorderW) dominantColor = parseCssColor(cs.borderRightColor);
    else if (bBottomW === maxBorderW) dominantColor = parseCssColor(cs.borderBottomColor);
    else if (bLeftW === maxBorderW) dominantColor = parseCssColor(cs.borderLeftColor);
    if (!dominantColor) dominantColor = parseCssColor(cs.borderTopColor);

    if (dominantColor && dominantColor.a > 0) {
      node.strokes = [{ type: 'SOLID', color: dominantColor }];
      node.strokeWeight = Math.round(maxBorderW);
      node.strokeAlign = 'INSIDE';
    }
  }

  // ─── Max/min constraints
  const maxW = parseFloat(cs.maxWidth) || 0;
  const minW = parseFloat(cs.minWidth) || 0;
  const maxH = parseFloat(cs.maxHeight) || 0;
  const minH = parseFloat(cs.minHeight) || 0;
  if (maxW > 0 && maxW < 10000) node.maxWidth = Math.round(maxW);
  if (minW > 0) node.minWidth = Math.round(minW);
  if (maxH > 0 && maxH < 10000) node.maxHeight = Math.round(maxH);
  if (minH > 0) node.minHeight = Math.round(minH);

  // ─── Box shadow → effects (multi-shadow support)
  const boxShadow = cs.boxShadow;
  if (boxShadow && boxShadow !== 'none') {
    const shadowParts = boxShadow.split(/,(?![^(]*\))/); // commas outside rgba()
    const effects: FigmaExportNode['effects'] = [];
    for (const part of shadowParts) {
      const effect = parseBoxShadow(part.trim());
      if (effect) effects.push(effect);
    }
    if (effects.length > 0) node.effects = effects;
  }

  // ─── Opacity (skip near-zero animation artifacts)
  const opacity = parseFloat(cs.opacity);
  if (opacity < 1 && opacity > 0.01) node.opacity = opacity;

  // ─── backdrop-filter: blur() → BACKGROUND_BLUR
  type ExtendedCS = CSSStyleDeclaration & { backdropFilter?: string; webkitBackdropFilter?: string };
  const extCs = cs as ExtendedCS;
  const backdropFilter = extCs.backdropFilter || extCs.webkitBackdropFilter || '';
  if (backdropFilter && backdropFilter !== 'none') {
    const blurMatch = backdropFilter.match(/blur\(([\d.]+)px\)/);
    if (blurMatch) {
      node.effects = [...(node.effects || []), { type: 'BACKGROUND_BLUR', radius: parseFloat(blurMatch[1]) }];
    }
  }

  // ─── filter: blur() / drop-shadow()
  const filter = cs.filter;
  if (filter && filter !== 'none') {
    const effects = node.effects || [];
    const blurMatch = filter.match(/blur\(([\d.]+)px\)/);
    if (blurMatch) effects.push({ type: 'LAYER_BLUR', radius: parseFloat(blurMatch[1]) });
    const dsMatch = filter.match(/drop-shadow\(([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s+(.*?)\)/);
    if (dsMatch) {
      const dsColor = parseCssColor(dsMatch[4].trim());
      if (dsColor) {
        effects.push({
          type: 'DROP_SHADOW',
          offset: { x: parseFloat(dsMatch[1]), y: parseFloat(dsMatch[2]) },
          radius: parseFloat(dsMatch[3]),
          spread: 0,
          color: dsColor,
        });
      }
    }
    if (effects.length > 0) node.effects = effects;
  }

  // ─── mix-blend-mode
  const blendMode = cs.mixBlendMode;
  if (blendMode && blendMode !== 'normal') {
    const blendMap: Record<string, string> = {
      'multiply': 'MULTIPLY', 'screen': 'SCREEN', 'overlay': 'OVERLAY',
      'darken': 'DARKEN', 'lighten': 'LIGHTEN', 'color-dodge': 'COLOR_DODGE',
      'color-burn': 'COLOR_BURN', 'hard-light': 'HARD_LIGHT', 'soft-light': 'SOFT_LIGHT',
      'difference': 'DIFFERENCE', 'exclusion': 'EXCLUSION', 'hue': 'HUE',
      'saturation': 'SATURATION', 'color': 'COLOR', 'luminosity': 'LUMINOSITY',
    };
    node.blendMode = blendMap[blendMode] || undefined;
  }

  // ─── transform: rotate() (from matrix or explicit rotate())
  const transform = cs.transform;
  if (transform && transform !== 'none') {
    const matrixMatch = transform.match(/matrix\(([-\d.]+),\s*([-\d.]+)/);
    if (matrixMatch) {
      const degrees = Math.atan2(parseFloat(matrixMatch[2]), parseFloat(matrixMatch[1])) * (180 / Math.PI);
      if (Math.abs(degrees) > 0.1) node.rotation = -degrees; // Figma is counterclockwise
    }
    const rotateMatch = transform.match(/rotate\(([-\d.]+)deg\)/);
    if (rotateMatch) node.rotation = -parseFloat(rotateMatch[1]);
  }

  // ─── align-content → counterAxisAlignContent
  if (cs.alignContent === 'space-between') node.counterAxisAlignContent = 'SPACE_BETWEEN';

  // ─── outline (separate from border) → zero-blur spread shadow
  const outlineWidth = parseFloat(cs.outlineWidth) || 0;
  if (outlineWidth > 0 && cs.outlineStyle !== 'none') {
    const outlineColor = parseCssColor(cs.outlineColor);
    if (outlineColor && outlineColor.a > 0) {
      node.effects = [...(node.effects || []), {
        type: 'DROP_SHADOW', offset: { x: 0, y: 0 }, radius: 0, spread: outlineWidth, color: outlineColor,
      }];
    }
  }

  // ─── Children: ::before + DOM-ordered text/element interleave + ::after
  // (CD3 fix + sizing hints live in build-frame-children.ts)
  const children = buildChildNodes(el, cs, node, win, depth);

  // ─── HUG for text-only containers (pills/badges/buttons — live lesson 2:
  // counter-axis stretch turned pills into full-width bars). Square tiles with
  // equal rendered w/h (40x40 step numbers) must stay FIXED instead.
  const textOnlyChildren = children.length > 0 && children.every((c) => c.type === 'TEXT');
  if (textOnlyChildren) {
    const flexLike = display.includes('flex');
    const pillShape = (node.cornerRadius !== undefined || node.cornerRadii !== undefined)
      && ((node.paddingLeft || 0) > 0 || (node.paddingRight || 0) > 0);
    if (flexLike || pillShape || el.tagName === 'BUTTON') {
      const squareTile = node.width !== undefined && node.width > 0 && node.width === node.height;
      if (squareTile) {
        node.layoutSizingHorizontal = 'FIXED';
        node.layoutSizingVertical = 'FIXED';
      } else if (!hasExplicitDimension(el, 'width', win)) {
        node.layoutSizingHorizontal = 'HUG';
        node.layoutSizingVertical = 'HUG';
        node.primaryAxisSizingMode = 'AUTO';
        node.counterAxisSizingMode = 'AUTO';
      }
    }
  }

  if (children.length > 0) node.children = children;

  return node;
}
