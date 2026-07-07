// Ported from EaseUI app/src/lib/figma-export.ts:1474-1706 + 2172-2213 —
// buildTextNode (with inline segment extraction), extractPseudoElement,
// and buildDirectTextNode (direct text mixed among element children).

import type { FigmaExportNode, FigmaTextSegment } from '../../../../shared/figma-payload-types';
import { parseCssColor } from './color-utils';
import { parseBoxShadow } from './parse-css';

function mapTextAlign(cssAlign: string): FigmaExportNode['textAlignHorizontal'] {
  if (cssAlign === 'center') return 'CENTER';
  if (cssAlign === 'right') return 'RIGHT';
  if (cssAlign === 'justify') return 'JUSTIFIED';
  return 'LEFT';
}

/**
 * Build a TEXT node from computed styles.
 * Extracts inline text segments for mixed formatting (bold, italic, links).
 */
export function buildTextNode(el: HTMLElement, cs: CSSStyleDeclaration, win: Window): FigmaExportNode {
  const tag = el.tagName;
  const isHeading = /^H[1-6]$/.test(tag);

  const fontSize = parseFloat(cs.fontSize) || 16;
  const fontWeight = parseInt(cs.fontWeight) || 400;
  const fontFamily = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Inter';
  const lineHeight = cs.lineHeight !== 'normal' ? parseFloat(cs.lineHeight) : undefined;
  // Normalize relative line-height ('1.5') to pixels; '24px' stays as-is
  let normalizedLineHeight = lineHeight;
  if (lineHeight && lineHeight < 5) {
    normalizedLineHeight = Math.round(fontSize * lineHeight * 10) / 10;
  }
  const letterSpacing = cs.letterSpacing !== 'normal' ? parseFloat(cs.letterSpacing) : undefined;
  const textColor = parseCssColor(cs.color);
  const textAlignHorizontal = mapTextAlign(cs.textAlign);

  // Use getBoundingClientRect for accurate dimensions
  const rect = el.getBoundingClientRect();

  // Extract inline text segments for mixed formatting
  const segments: FigmaTextSegment[] = [];
  let fullText = '';

  if (el.children.length > 0) {
    // Walk child nodes to extract per-segment styling
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        // Text node
        const text = (child.textContent || '').replace(/\s+/g, ' ');
        if (text.trim()) {
          segments.push({
            characters: text,
            fontFamily, fontSize, fontWeight, lineHeight, letterSpacing,
            textColor: textColor || undefined,
          });
          fullText += text;
        } else if (text === ' ') {
          fullText += ' '; // whitespace-only node → preserve as word separator
        }
      } else if (child.nodeType === 1) {
        // Element node (span, strong, em, a, etc.)
        const childEl = child as HTMLElement;
        const childCs = win.getComputedStyle(childEl);
        const childText = (childEl.innerText || childEl.textContent || '').replace(/\s+/g, ' ');
        if (childText.trim()) {
          const seg: FigmaTextSegment = {
            characters: childText,
            fontFamily: childCs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || fontFamily,
            fontSize: parseFloat(childCs.fontSize) || fontSize,
            fontWeight: parseInt(childCs.fontWeight) || fontWeight,
            fontStyle: childCs.fontStyle === 'italic' ? 'italic' : undefined,
            lineHeight: childCs.lineHeight !== 'normal' ? parseFloat(childCs.lineHeight) : lineHeight,
            letterSpacing: childCs.letterSpacing !== 'normal' ? parseFloat(childCs.letterSpacing) : letterSpacing,
            textColor: parseCssColor(childCs.color) || textColor || undefined,
          };
          const dec = childCs.textDecorationLine;
          if (dec === 'underline') seg.textDecoration = 'UNDERLINE';
          else if (dec === 'line-through') seg.textDecoration = 'STRIKETHROUGH';
          const tt = childCs.textTransform;
          if (tt === 'uppercase') seg.textCase = 'UPPER';
          else if (tt === 'lowercase') seg.textCase = 'LOWER';
          else if (tt === 'capitalize') seg.textCase = 'TITLE';

          segments.push(seg);
          fullText += childText;
        }
      }
    }
  }

  // Fallback: if no segments extracted, use the full text
  if (segments.length === 0) {
    fullText = (el.innerText || el.textContent || '').trim();
  }

  // ─── Text auto-resize (CD1, live lesson 1): single-line text MUST be
  // WIDTH_AND_HEIGHT or font-metric drift truncates it in a fixed box.
  // Wrapped paragraphs keep fixed width + auto height (HEIGHT).
  const trimmedText = fullText.trim() || (el.innerText || el.textContent || '').trim();
  const lineHeightPx = normalizedLineHeight || Math.round(fontSize * 1.4);
  const renderedSingleLine = rect.height > 0 && rect.height < lineHeightPx * 1.5;
  const noWrap = cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre';
  const shortContent = trimmedText.length <= 40;

  const node: FigmaExportNode = {
    type: 'TEXT',
    name: isHeading ? `Heading ${tag[1]}` : (tag === 'P' ? 'Paragraph' : tag === 'BUTTON' ? 'Button' : 'Text'),
    characters: fullText.trim(),
    fontSize,
    fontWeight,
    fontFamily,
    fontStyle: cs.fontStyle === 'italic' ? 'italic' : undefined,
    lineHeight: normalizedLineHeight,
    letterSpacing,
    wordSpacing: cs.wordSpacing !== 'normal' ? parseFloat(cs.wordSpacing) : undefined,
    textColor: textColor || undefined,
    textAlignHorizontal,
    textAutoResize: (renderedSingleLine || noWrap || shortContent) ? 'WIDTH_AND_HEIGHT' : 'HEIGHT',
    width: Math.round(rect.width) || undefined,
    height: Math.round(rect.height) || undefined,
  };

  // text-overflow: ellipsis / line-clamp → truncation. Guard carefully:
  // - unset -webkit-line-clamp computes to the STRING 'none' (truthy!) — the
  //   old check stamped TRUNCATE on every text and silently destroyed the
  //   W&H/HEIGHT decision above (masked pre-P3 by the FILL coercion).
  // - textOverflow:ellipsis only truncates when the line can't wrap.
  const clampRaw = (cs as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp;
  const hasLineClamp = !!clampRaw && clampRaw !== 'none' && parseInt(clampRaw, 10) > 0;
  const hasEllipsis = cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap';
  if (hasEllipsis || hasLineClamp) {
    node.textTruncation = 'ENDING'; // keep W&H/HEIGHT — TRUNCATE autoResize is deprecated
  }

  // Attach segments only if multiple with different styles exist
  if (segments.length > 1) node.textSegments = segments;

  // Text decoration (on whole element)
  const decoration = cs.textDecorationLine;
  if (decoration === 'underline') node.textDecoration = 'UNDERLINE';
  else if (decoration === 'line-through') node.textDecoration = 'STRIKETHROUGH';

  // Text case (CSS text-transform)
  const textTransform = cs.textTransform;
  if (textTransform === 'uppercase') node.textCase = 'UPPER';
  else if (textTransform === 'lowercase') node.textCase = 'LOWER';
  else if (textTransform === 'capitalize') node.textCase = 'TITLE';

  // text-shadow → simulate via DROP_SHADOW effect
  const textShadow = cs.textShadow;
  if (textShadow && textShadow !== 'none') {
    const tsEffect = parseBoxShadow(textShadow);
    if (tsEffect) node.effects = [tsEffect];
  }

  return node;
}

/**
 * Extract a CSS pseudo-element (::before or ::after) as a FigmaExportNode.
 * These create decorative elements like status dots, gradient lines, glow effects.
 */
export function extractPseudoElement(el: HTMLElement, win: Window, pseudo: '::before' | '::after'): FigmaExportNode | null {
  try {
    const pcs = win.getComputedStyle(el, pseudo);

    // Pseudo-element must exist (content not 'none'/'normal') and be visible
    const content = pcs.content;
    if (!content || content === 'none' || content === 'normal') return null;
    if (pcs.display === 'none' || pcs.visibility === 'hidden') return null;
    if (pcs.opacity === '0') return null;

    const width = parseFloat(pcs.width) || 0;
    const height = parseFloat(pcs.height) || 0;

    const bgColor = parseCssColor(pcs.backgroundColor);
    const borderColor = parseCssColor(pcs.borderTopColor);
    const textColor = parseCssColor(pcs.color);

    // Strip quotes from content value ("text" → text)
    const textContent = content.replace(/^["']|["']$/g, '');
    const hasText = textContent && textContent !== '' && textContent !== '""' && textContent !== "''";

    // If it has text content, create a TEXT node
    if (hasText && textContent.length < 200) {
      return {
        type: 'TEXT',
        name: pseudo === '::before' ? 'Before' : 'After',
        characters: textContent,
        fontSize: parseFloat(pcs.fontSize) || 12,
        fontWeight: parseInt(pcs.fontWeight) || 400,
        fontFamily: pcs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Inter',
        textColor: textColor || undefined,
        width: width > 0 ? Math.round(width) : undefined,
        height: height > 0 ? Math.round(height) : undefined,
      };
    }

    // Decorative dots, lines, shapes → RECTANGLE
    const hasBg = bgColor && bgColor.a > 0;
    const hasBorder = borderColor && borderColor.a > 0;
    const hasSize = width > 0 || height > 0;

    if ((hasBg || hasBorder) && hasSize) {
      const node: FigmaExportNode = {
        type: 'RECTANGLE',
        name: pseudo === '::before' ? 'Decoration-Before' : 'Decoration-After',
        width: Math.round(width) || 1,
        height: Math.round(height) || 1,
      };
      if (hasBg) node.fills = [{ type: 'SOLID', color: bgColor! }];
      if (hasBorder) {
        node.strokes = [{ type: 'SOLID', color: borderColor! }];
        node.strokeWeight = Math.round(parseFloat(pcs.borderTopWidth) || 1);
      }
      const borderRadius = parseFloat(pcs.borderRadius) || 0;
      if (borderRadius > 0) node.cornerRadius = Math.round(borderRadius);
      const opacity = parseFloat(pcs.opacity);
      if (opacity < 1) node.opacity = opacity;
      return node;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Build a TEXT node for direct text content of a container element
 * (text mixed among element children). Ported from figma-export.ts:2172-2213.
 */
export function buildDirectTextNode(el: HTMLElement, win: Window, directText: string): FigmaExportNode {
  const textCs = win.getComputedStyle(el);
  const textColor = parseCssColor(textCs.color);

  const textNode: FigmaExportNode = {
    type: 'TEXT',
    name: 'Text',
    characters: directText,
    fontSize: parseFloat(textCs.fontSize) || 16,
    fontWeight: parseInt(textCs.fontWeight) || 400,
    fontFamily: textCs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Inter',
    lineHeight: textCs.lineHeight !== 'normal' ? parseFloat(textCs.lineHeight) : undefined,
    letterSpacing: textCs.letterSpacing !== 'normal' ? parseFloat(textCs.letterSpacing) : undefined,
    textColor: textColor || undefined,
    textAlignHorizontal: mapTextAlign(textCs.textAlign),
    textAutoResize: 'WIDTH_AND_HEIGHT',
  };

  const tt = textCs.textTransform;
  if (tt === 'uppercase') textNode.textCase = 'UPPER';
  else if (tt === 'lowercase') textNode.textCase = 'LOWER';
  else if (tt === 'capitalize') textNode.textCase = 'TITLE';

  const td = textCs.textDecorationLine;
  if (td === 'underline') textNode.textDecoration = 'UNDERLINE';
  else if (td === 'line-through') textNode.textDecoration = 'STRIKETHROUGH';

  return textNode;
}
