// Child collection for buildFrameNode, split out of build-frame.ts (>250L).
// Responsibilities:
//  - CD3 fix: walk el.childNodes (NOT el.children) so bare text runs interleave
//    with element children IN DOM ORDER (icon/label pairs no longer flip).
//  - Parent-context-aware layout sizing (FILL/FIXED/HUG) incl. flex-basis:
//    computed `flex: 0 0 Npx` → FIXED at N on the parent's primary axis.
// Note: circular import with computed-walk.ts/build-frame.ts is intentional and
// safe — esbuild resolves function references at call time (see computed-walk.ts).

import type { FigmaExportNode } from '../../../../shared/figma-payload-types';
import { buildDirectTextNode, extractPseudoElement } from './build-text';
import { computedElementToNode } from './computed-walk';

/**
 * Heuristic: does this element have an explicitly authored width/height
 * (vs auto/fill-parent)? Ported from figma-export.ts:148-191, win injected.
 */
export function hasExplicitDimension(el: HTMLElement, prop: 'width' | 'height', win: Window): boolean {
  const inlineVal = el.style[prop];
  if (inlineVal && inlineVal !== 'auto' && inlineVal !== '') return true;

  const cs = win.getComputedStyle(el);
  if (cs[prop] === 'auto') return false;

  // flex-basis set implies explicit sizing
  if (cs.flexBasis && cs.flexBasis !== 'auto' && cs.flexBasis !== '0px') return true;

  if (el.getAttribute('style')?.includes(prop)) return true;
  if (el.getAttribute(prop)) return true;

  // Block-level elements fill parent width by default — NOT explicit
  const display = cs.display;
  if (prop === 'width' && (display === 'block' || display === 'flex' || display === 'grid')) return false;

  // Flex/grid children without flex-grow usually have auto width
  const parentEl = el.parentElement;
  if (parentEl) {
    const parentDisplay = win.getComputedStyle(parentEl).display;
    if (parentDisplay.includes('flex') || parentDisplay === 'grid') {
      if (prop === 'width' && (parseFloat(cs.flexGrow) || 0) === 0 && cs.flexBasis === 'auto') return false;
    }
  }
  return false;
}

type ChildEntry = { kind: 'text'; text: string } | { kind: 'el'; el: HTMLElement };

/** DOM-ordered entries: bare text runs interleaved with element children (CD3). */
function collectOrderedEntries(el: HTMLElement): ChildEntry[] {
  const entries: ChildEntry[] = [];

  if (el.children.length === 0 && (el.innerText || '').trim()) {
    // Text-only container: innerText applies text-transform (source behavior)
    entries.push({ kind: 'text', text: el.innerText.trim() });
    return entries;
  }

  let textRun = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      textRun += child.textContent || '';
    } else if (child.nodeType === 1) {
      if (textRun.trim()) entries.push({ kind: 'text', text: textRun.trim() });
      textRun = '';
      entries.push({ kind: 'el', el: child as HTMLElement });
    }
  }
  if (textRun.trim()) entries.push({ kind: 'text', text: textRun.trim() });

  // Shadow DOM children (appended after regular DOM, styles excluded)
  if (el.shadowRoot) {
    for (const shadowChild of Array.from(el.shadowRoot.children)) {
      if (shadowChild.nodeType === 1 && shadowChild.tagName !== 'STYLE') {
        entries.push({ kind: 'el', el: shadowChild as HTMLElement });
      }
    }
  }
  return entries;
}

/**
 * Build ordered child nodes for a frame: ::before, DOM-ordered text/element
 * interleave with parent-context sizing, ::after.
 */
export function buildChildNodes(
  el: HTMLElement,
  cs: CSSStyleDeclaration,
  parentNode: FigmaExportNode,
  win: Window,
  depth: number,
): FigmaExportNode[] {
  const children: FigmaExportNode[] = [];
  const beforeNode = extractPseudoElement(el, win, '::before');
  if (beforeNode) children.push(beforeNode);

  const display = cs.display;
  // GRID children get flex-like sizing hints so a WRAP degrade still lays out
  const sizingDir = parentNode.layoutMode === 'GRID' ? 'HORIZONTAL' : parentNode.layoutMode;
  const parentAlignItems = cs.alignItems || 'stretch'; // CSS default is 'stretch'

  const entries = collectOrderedEntries(el);

  // Sort flex children by CSS order — only when no bare text runs interleave
  // (order among mixed text/element siblings is undefined; keep DOM order then).
  const hasTextRuns = entries.some((e) => e.kind === 'text');

  // T-P3.1 — inline flow: text runs mixed with inline elements ("text [badge]
  // text"). Flex items are blockified (computed display 'block'), so the
  // VERTICAL fallback stacked them; real inline content flows horizontally on
  // the text baseline with word-gap spacing.
  const hasElementEntries = entries.some((e) => e.kind === 'el');
  if (hasTextRuns && hasElementEntries) {
    const fontPx = parseFloat(cs.fontSize) || 16;
    parentNode.layoutMode = 'HORIZONTAL';
    parentNode.counterAxisAlignItems = 'BASELINE';
    if (parentNode.itemSpacing === undefined || parentNode.itemSpacing === 0) {
      parentNode.itemSpacing = Math.round(fontPx * 0.28); // ≈ one space width
    }
    parentNode.layoutSizingHorizontal = 'HUG';
    parentNode.layoutSizingVertical = 'HUG';
    parentNode.primaryAxisSizingMode = 'AUTO';
    parentNode.counterAxisSizingMode = 'AUTO';
  }
  if (!hasTextRuns && entries.length > 1 && (display === 'flex' || display === 'inline-flex')) {
    entries.sort((a, b) => {
      const orderOf = (e: ChildEntry) => e.kind === 'el' ? (parseInt(win.getComputedStyle(e.el).order) || 0) : 0;
      return orderOf(a) - orderOf(b);
    });
  }

  for (const entry of entries) {
    if (entry.kind === 'text') {
      children.push(buildDirectTextNode(el, win, entry.text));
      continue;
    }

    const childEl = entry.el;
    const childNode = computedElementToNode(childEl, win, depth + 1);
    if (!childNode) continue;

    // ─── Parent-context-aware layout sizing
    const childCs = win.getComputedStyle(childEl);
    const flexGrow = parseFloat(childCs.flexGrow) || 0;
    const childDisplay = childCs.display;
    const alignSelf = childCs.alignSelf;
    const effectiveAlign = (alignSelf && alignSelf !== 'auto') ? alignSelf : parentAlignItems;
    const hasExplicitW = hasExplicitDimension(childEl, 'width', win);
    const hasExplicitH = hasExplicitDimension(childEl, 'height', win);

    if (flexGrow > 0) childNode.layoutGrow = flexGrow; // proportional sizing

    // Out-of-flow children keep converter-emitted x/y; no auto-layout sizing
    if (childNode.absolutePosition) {
      children.push(childNode);
      continue;
    }

    // flex: 0 0 Npx → FIXED at N on the parent's primary axis
    const flexShrink = parseFloat(childCs.flexShrink) || 0;
    const basisPx = childCs.flexBasis && childCs.flexBasis.endsWith('px') ? parseFloat(childCs.flexBasis) : 0;
    const fixedBasis = flexGrow === 0 && flexShrink === 0 && basisPx > 0;

    // Respect sizing the child already decided for itself (HUG pills, margin-auto
    // FIXED, square tiles) — only fill in what's still undefined.
    if (sizingDir === 'VERTICAL') {
      // Primary axis = Y
      if (childNode.layoutSizingVertical === undefined) {
        if (flexGrow > 0) childNode.layoutSizingVertical = 'FILL';
        else if (fixedBasis) { childNode.layoutSizingVertical = 'FIXED'; childNode.height = Math.round(basisPx); }
        else if (hasExplicitH) childNode.layoutSizingVertical = 'FIXED';
        else childNode.layoutSizingVertical = 'HUG';
      }
      // Cross axis = X
      if (childNode.layoutSizingHorizontal === undefined) {
        if (hasExplicitW) childNode.layoutSizingHorizontal = 'FIXED';
        else if (effectiveAlign === 'stretch' || childDisplay === 'block' || childDisplay === 'flex' || childDisplay === 'grid') {
          childNode.layoutSizingHorizontal = 'FILL';
        } else childNode.layoutSizingHorizontal = 'HUG';
      }
    } else if (sizingDir === 'HORIZONTAL') {
      // Primary axis = X
      if (childNode.layoutSizingHorizontal === undefined) {
        if (flexGrow > 0) childNode.layoutSizingHorizontal = 'FILL';
        else if (fixedBasis) { childNode.layoutSizingHorizontal = 'FIXED'; childNode.width = Math.round(basisPx); }
        else if (hasExplicitW) childNode.layoutSizingHorizontal = 'FIXED';
        else childNode.layoutSizingHorizontal = 'HUG';
      }
      // Cross axis = Y
      if (childNode.layoutSizingVertical === undefined) {
        if (hasExplicitH) childNode.layoutSizingVertical = 'FIXED';
        else if (effectiveAlign === 'stretch') childNode.layoutSizingVertical = 'FILL';
        else childNode.layoutSizingVertical = 'HUG';
      }
    }

    // T-P3.2 — GRID children must FILL their track: a HUG cell collapses to
    // content width (53px cells) and breaks the grid rhythm.
    if (parentNode.layoutMode === 'GRID' && childNode.type !== 'TEXT' && !hasExplicitW) {
      childNode.layoutSizingHorizontal = 'FILL';
    }

    // T-P3.3/T-P3.4 — TEXT sizing derives from its auto-resize mode, NEVER from
    // the block/stretch rules above: setting FILL on a text layer makes Figma
    // coerce WIDTH_AND_HEIGHT → HEIGHT (root cause of every "title truncates/
    // stretches" case). Single-line hugs; wrapped keeps browser-measured width.
    if (childNode.type === 'TEXT') {
      childNode.layoutSizingHorizontal =
        childNode.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'HUG' : 'FIXED';
      childNode.layoutSizingVertical = 'HUG'; // height is auto in both modes
    }

    // T-P3.5 — small square icon tiles/chips (SVG-only content) keep their box:
    // the block-child FILL rule stretched 36×36 tiles into full-width bars.
    if (childNode.type === 'FRAME' && !hasExplicitW) {
      const tileRect = childEl.getBoundingClientRect();
      const tw = Math.round(tileRect.width);
      const th = Math.round(tileRect.height);
      const hasTextInside = (childNode.children ?? []).some((c) => c.type === 'TEXT');
      if (tw > 0 && tw === th && tw <= 80 && !hasTextInside) {
        childNode.layoutSizingHorizontal = 'FIXED';
        childNode.layoutSizingVertical = 'FIXED';
        childNode.width = tw;
        childNode.height = th;
      }
    }

    children.push(childNode);
  }

  const afterNode = extractPseudoElement(el, win, '::after');
  if (afterNode) children.push(afterNode);

  return children;
}
