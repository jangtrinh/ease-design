// Ported from EaseUI app/src/lib/figma-export.ts:1222-1237 (prepareSvgContent),
// 1240-1468 (computedElementToNode dispatch + isRenderedTextNode).
// Computed-style path ONLY — the class-based extraction path was dropped.
// Note: circular import with build-frame.ts (frame recurses into the walk) is
// intentional and safe — esbuild resolves function references at call time.

import type { FigmaColor, FigmaExportNode } from '../../../../shared/figma-payload-types';
import { parseCssColor, rgbaToHex as figmaColorToHex } from './color-utils';
import { buildTextNode } from './build-text';
import { buildFrameNode } from './build-frame';

// Tags to skip in the rendered tree
const RENDERED_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'NOSCRIPT', 'BR']);

/**
 * Clean up SVG content for Figma import:
 * - stroke-width 2 → 1.5 for thinner icon lines
 * - resolve "currentColor" to the actual computed hex color
 */
export function prepareSvgContent(svg: string, computedColor: FigmaColor | null): string {
  let result = svg;
  result = result.replace(/stroke-width="2"/g, 'stroke-width="1.5"');
  result = result.replace(/stroke-width='2'/g, "stroke-width='1.5'");
  if (computedColor) {
    const hex = figmaColorToHex(computedColor);
    result = result.replace(/currentColor/g, hex);
    result = result.replace(/currentcolor/gi, hex);
  }
  return result;
}

/**
 * Convert a rendered HTML element into a FigmaExportNode using getComputedStyle.
 * Dispatches to IMAGE/RECTANGLE/TEXT/FRAME builders by tag + heuristics.
 */
export function computedElementToNode(el: HTMLElement, win: Window, depth: number): FigmaExportNode | null {
  if (RENDERED_SKIP_TAGS.has(el.tagName)) return null;
  if (depth > 20) return null;

  const cs = win.getComputedStyle(el);
  const tag = el.tagName;

  // Skip invisible elements
  if (cs.display === 'none') return null;
  if (cs.visibility === 'hidden') return null;

  // ─── Image
  if (tag === 'IMG') {
    // currentSrc resolves the ACTUAL rendered source under srcset / <picture> /
    // lazy-loading; getAttribute('src') alone misses responsive + lazy images
    // (Track 5 COPY #6).
    const img = el as HTMLImageElement;
    return {
      type: 'IMAGE',
      name: img.getAttribute('alt') || 'Image',
      imageUrl: img.currentSrc || img.getAttribute('src') || '',
      width: el.offsetWidth || 200,
      height: el.offsetHeight || 200,
    };
  }

  // ─── Horizontal rule → thin divider rectangle
  if (tag === 'HR') {
    const hrColor = parseCssColor(cs.borderTopColor) || parseCssColor(cs.backgroundColor);
    return {
      type: 'RECTANGLE',
      name: 'Divider',
      width: el.offsetWidth || 200,
      height: Math.max(parseFloat(cs.borderTopWidth) || 1, el.offsetHeight || 1),
      fills: hrColor && hrColor.a > 0
        ? [{ type: 'SOLID', color: hrColor }]
        : [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
    };
  }

  // ─── Video → extract poster as image
  if (tag === 'VIDEO') {
    const videoEl = el as HTMLVideoElement;
    return {
      type: 'IMAGE',
      name: 'Video',
      imageUrl: videoEl.poster || videoEl.getAttribute('poster') || '',
      width: el.offsetWidth || 320,
      height: el.offsetHeight || 180,
    };
  }

  // ─── SVG → extract actual vector markup
  if (tag === 'svg' || tag === 'SVG') {
    const rawSvg = (el as unknown as SVGElement).outerHTML;
    const w = el.clientWidth || parseInt(el.getAttribute('width') || '24') || 24;
    const h = el.clientHeight || parseInt(el.getAttribute('height') || '24') || 24;
    const computedColor = parseCssColor(cs.color);
    return {
      type: 'IMAGE',
      name: el.closest('[data-lucide]')?.getAttribute('data-lucide') || 'Icon',
      svgContent: prepareSvgContent(rawSvg, computedColor),
      width: w,
      height: h,
      fills: computedColor ? [{ type: 'SOLID', color: computedColor }] : undefined,
    };
  }

  // ─── Icon element (<i data-lucide>) → rendered SVG child or placeholder
  if (tag === 'I' && el.hasAttribute('data-lucide')) {
    const svg = el.querySelector('svg');
    const iconColor = parseCssColor(cs.color);
    if (svg) {
      return {
        type: 'IMAGE',
        name: el.getAttribute('data-lucide') || 'Icon',
        svgContent: prepareSvgContent(svg.outerHTML, iconColor),
        width: svg.clientWidth || parseInt(svg.getAttribute('width') || '24') || 24,
        height: svg.clientHeight || parseInt(svg.getAttribute('height') || '24') || 24,
        fills: iconColor ? [{ type: 'SOLID', color: iconColor }] : undefined,
      };
    }
    // Fallback: Lucide hasn't rendered yet — placeholder box
    return {
      type: 'RECTANGLE',
      name: el.getAttribute('data-lucide') || 'Icon',
      width: parseInt(cs.width) || 16,
      height: parseInt(cs.height) || 16,
      fills: iconColor ? [{ type: 'SOLID', color: iconColor }] : [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4, a: 1 } }],
    };
  }

  // ─── Empty <i> tag → small icon placeholder
  if (tag === 'I' && el.children.length === 0) {
    const iconColor = parseCssColor(cs.color);
    return {
      type: 'RECTANGLE',
      name: 'Icon',
      width: parseInt(cs.width) || 16,
      height: parseInt(cs.height) || 16,
      fills: iconColor ? [{ type: 'SOLID', color: iconColor }] : [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4, a: 1 } }],
    };
  }

  // ─── Form elements → frame with placeholder text
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    const bgColor = parseCssColor(cs.backgroundColor);
    const borderColor = parseCssColor(cs.borderTopColor);
    const inputEl = el as HTMLInputElement;
    const placeholder = inputEl.placeholder || inputEl.value || '';
    const node: FigmaExportNode = {
      type: 'FRAME',
      name: placeholder || (tag === 'INPUT' ? 'Input' : tag === 'SELECT' ? 'Select' : 'Textarea'),
      width: el.offsetWidth || 200,
      height: el.offsetHeight || 36,
      layoutMode: 'HORIZONTAL',
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'FIXED',
      counterAxisAlignItems: 'CENTER',
      paddingLeft: Math.round(parseFloat(cs.paddingLeft) || 0),
      paddingRight: Math.round(parseFloat(cs.paddingRight) || 0),
    };
    if (bgColor && bgColor.a > 0) node.fills = [{ type: 'SOLID', color: bgColor }];
    if (borderColor && borderColor.a > 0) {
      node.strokes = [{ type: 'SOLID', color: borderColor }];
      node.strokeWeight = Math.round(parseFloat(cs.borderTopWidth) || 1);
      node.strokeAlign = 'INSIDE';
    }
    const cornerR = parseFloat(cs.borderRadius) || 0;
    if (cornerR > 0) node.cornerRadius = Math.round(cornerR);

    // Add placeholder text as child (dimmed when it's a true placeholder)
    if (placeholder) {
      const textColor = parseCssColor(cs.color);
      const isPlaceholder = !inputEl.value;
      node.children = [{
        type: 'TEXT',
        name: 'Placeholder',
        characters: placeholder.toUpperCase(),
        fontSize: parseFloat(cs.fontSize) || 14,
        fontWeight: parseInt(cs.fontWeight) || 400,
        fontFamily: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Inter',
        textColor: textColor || undefined,
        textAutoResize: 'WIDTH_AND_HEIGHT',
        opacity: isPlaceholder ? 0.4 : 1,
      }];
    }
    return attachMotion(el, node);
  }

  // ─── Text leaf vs container dispatch
  if (isRenderedTextNode(el, win)) {
    const textNode = buildTextNode(el, cs, win);
    // Absolute positioning for text nodes — x/y relative to the DIRECT parent
    // (its rect), which becomes the Figma parent frame; offsetLeft/Top were
    // relative to offsetParent and misplaced overlays (CD4).
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      textNode.absolutePosition = true;
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement?.getBoundingClientRect();
      if (parentRect) {
        textNode.x = Math.round(rect.left - parentRect.left);
        textNode.y = Math.round(rect.top - parentRect.top);
      } else {
        textNode.x = el.offsetLeft;
        textNode.y = el.offsetTop;
      }
    }
    return attachMotion(el, textNode);
  }

  // ─── Container (FRAME)
  return attachMotion(el, buildFrameNode(el, cs, win, depth));
}

/** Attach stashed data-fa-motion (motion producer, extract-motion.ts) onto the export node. */
function attachMotion(el: HTMLElement, node: FigmaExportNode): FigmaExportNode {
  const raw = el.getAttribute('data-fa-motion');
  if (raw) {
    try { node.motion = JSON.parse(raw) as FigmaExportNode['motion']; } catch { /* ignore malformed */ }
  }
  return node;
}

/**
 * Check if an element is a leaf text container (no block/flex children).
 * Elements with visible backgrounds, borders, or padding are NOT text nodes —
 * they are visual containers (FRAME) that contain text.
 */
export function isRenderedTextNode(el: HTMLElement, win: Window): boolean {
  const tag = el.tagName;

  const hasContainerStyling = (): boolean => {
    const cs = win.getComputedStyle(el);
    const bgColor = parseCssColor(cs.backgroundColor);
    const hasBg = !!(bgColor && bgColor.a > 0);
    const hasBorder = (parseFloat(cs.borderTopWidth) || 0) > 0
      && parseCssColor(cs.borderTopColor)?.a !== undefined
      && (parseCssColor(cs.borderTopColor)?.a || 0) > 0;
    const hasPadding = (parseFloat(cs.paddingTop) || 0) > 8 || (parseFloat(cs.paddingLeft) || 0) > 8;
    return hasBg || hasBorder || hasPadding;
  };

  // A div with only text content and no child elements
  if (el.children.length === 0 && (el.textContent || '').trim()) {
    // Significant visual styling → container, not flat text
    return !hasContainerStyling();
  }

  // Explicit text tags
  if (/^H[1-6]$/.test(tag) || tag === 'P' || tag === 'SPAN' || tag === 'LABEL' || tag === 'A' || tag === 'BUTTON') {
    // Visual container styling → FRAME containing text, not a flat text node
    if (hasContainerStyling()) return false;

    // Only if no element children or only inline children
    if (el.children.length === 0) return true;
    for (const child of Array.from(el.children)) {
      if (!['SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'SMALL', 'MARK', 'CODE', 'LABEL', 'BR', 'SVG', 'IMG'].includes(child.tagName)) {
        return false;
      }
      // CD2: styled inline spans (pills/badges) must NOT merge into parent text
      if (inlineChildBreaksMerge(child as HTMLElement, el, win)) return false;
    }
    return true;
  }

  return false;
}

/**
 * CD2 guard: an inline child with its own visual identity — background color
 * different from the parent's, border-radius, visible border, or a padded
 * inline-flex/inline-block — is a pill/badge. Merging it into the parent TEXT
 * node collapses it to bare text; keep the parent as a FRAME so the span
 * becomes its own node instead.
 */
function inlineChildBreaksMerge(childEl: HTMLElement, parentEl: HTMLElement, win: Window): boolean {
  const ccs = win.getComputedStyle(childEl);

  // Own background (≠ transparent, ≠ parent's background)
  const bg = parseCssColor(ccs.backgroundColor);
  if (bg && bg.a > 0) {
    const parentBg = parseCssColor(win.getComputedStyle(parentEl).backgroundColor);
    if (!parentBg || parentBg.a === 0 || figmaColorToHex(bg) !== figmaColorToHex(parentBg)) return true;
  }

  // Border radius > 0
  if ((parseFloat(ccs.borderTopLeftRadius) || 0) > 0 || (parseFloat(ccs.borderBottomRightRadius) || 0) > 0) return true;

  // Visible border
  if ((parseFloat(ccs.borderTopWidth) || 0) > 0 && (parseCssColor(ccs.borderTopColor)?.a || 0) > 0) return true;

  // Padded inline-flex / inline-block
  if ((ccs.display === 'inline-flex' || ccs.display === 'inline-block')
    && ((parseFloat(ccs.paddingLeft) || 0) > 0 || (parseFloat(ccs.paddingTop) || 0) > 0)) return true;

  return false;
}
