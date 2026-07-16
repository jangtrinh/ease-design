// TEXT node creation incl. styled segments (mixed bold/italic runs).
// Ported verbatim from EaseUI figma-plugin/code.ts:332-460 (createTextNode).

import type { FigmaExportNode } from '../../../shared/figma-payload-types';
import { loadBestFont } from './executor-fonts';
import { rgbToFigma, specNodeName } from './executor-styles';
import { applyTokenRefs } from './executor-variables';

export async function createTextNode(exportNode: FigmaExportNode, tokenVars?: Map<string, Variable>): Promise<TextNode> {
  const textNode = figma.createText();
  textNode.name = specNodeName(exportNode);

  const family = exportNode.fontFamily || 'Inter';
  const weight = exportNode.fontWeight || 400;
  const isItalic = exportNode.fontStyle === 'italic';

  // Load the font with fallback chain (registry match + italic mapping).
  // Pass the full CSS stack so fallbacks in the stack resolve before Inter.
  const loadedFont = await loadBestFont(family, weight, isItalic, exportNode.fontStack);
  textNode.fontName = loadedFont;

  textNode.characters = exportNode.characters || '';
  textNode.fontSize = exportNode.fontSize || 16;

  if (exportNode.lineHeight) {
    textNode.lineHeight = { value: exportNode.lineHeight, unit: 'PIXELS' };
  }
  if (exportNode.letterSpacing) {
    textNode.letterSpacing = { value: exportNode.letterSpacing, unit: 'PIXELS' };
  }
  if (exportNode.textAlignHorizontal) {
    textNode.textAlignHorizontal = exportNode.textAlignHorizontal;
  }
  if (exportNode.textColor) {
    textNode.fills = [{
      type: 'SOLID',
      color: rgbToFigma(exportNode.textColor),
      opacity: exportNode.textColor.a,
    }];
  }

  // Opacity — skip 0 values (CSS animation artifacts)
  if (exportNode.opacity !== undefined && exportNode.opacity > 0) {
    textNode.opacity = exportNode.opacity;
  }

  if (exportNode.textAutoResize) {
    textNode.textAutoResize = exportNode.textAutoResize;
  }

  // Text truncation (newer API — guarded)
  if (exportNode.textTruncation === 'ENDING') {
    try { (textNode as unknown as { textTruncation: string }).textTruncation = 'ENDING'; } catch { /* not available */ }
  }

  if (exportNode.textDecoration) {
    textNode.textDecoration = exportNode.textDecoration;
  }

  // Text case (CSS text-transform)
  if (exportNode.textCase) {
    textNode.textCase = exportNode.textCase;
  }

  // Inline text segments (mixed bold/italic/links within a paragraph)
  if (exportNode.textSegments && exportNode.textSegments.length > 1) {
    let offset = 0;
    for (const seg of exportNode.textSegments) {
      const start = offset;
      const end = offset + seg.characters.length;
      if (start >= end || end > textNode.characters.length) {
        offset = end;
        continue;
      }

      try {
        // Load and apply segment font
        const segFamily = seg.fontFamily || family;
        const segWeight = seg.fontWeight || weight;
        const segFont = await loadBestFont(segFamily, segWeight, seg.fontStyle === 'italic');
        textNode.setRangeFontName(start, end, segFont);

        if (seg.fontSize && seg.fontSize !== (exportNode.fontSize || 16)) {
          textNode.setRangeFontSize(start, end, seg.fontSize);
        }
        if (seg.lineHeight) {
          textNode.setRangeLineHeight(start, end, { value: seg.lineHeight, unit: 'PIXELS' });
        }
        if (seg.letterSpacing) {
          textNode.setRangeLetterSpacing(start, end, { value: seg.letterSpacing, unit: 'PIXELS' });
        }
        if (seg.textColor) {
          textNode.setRangeFills(start, end, [{
            type: 'SOLID',
            color: rgbToFigma(seg.textColor),
            opacity: seg.textColor.a,
          }]);
        }
        if (seg.textDecoration) {
          textNode.setRangeTextDecoration(start, end, seg.textDecoration);
        }
        if (seg.textCase) {
          textNode.setRangeTextCase(start, end, seg.textCase);
        }
      } catch {
        // Silently skip segment styling failures
      }

      offset = end;
    }
  }

  // Set explicit dimensions if provided (from getBoundingClientRect).
  // CD1: WIDTH_AND_HEIGHT text must NOT be resized — an explicit resize would
  // re-fix the box and reintroduce truncation on font-metric drift.
  // HEIGHT mode fixes width only; height stays auto.
  if (exportNode.width && exportNode.height && exportNode.textAutoResize !== 'WIDTH_AND_HEIGHT') {
    try {
      if (exportNode.textAutoResize === 'HEIGHT') {
        textNode.resize(exportNode.width, textNode.height);
      } else {
        textNode.resize(exportNode.width, exportNode.height);
      }
    } catch {
      // Text resize can fail if dimensions conflict with auto-resize
    }
  }

  // Token bindings (P3 leg B): textColor → fills variable.
  // Gated on tokenRefs ALONE — see executor-frame's build (spec-005 P6).
  if (exportNode.tokenRefs) {
    applyTokenRefs(textNode, exportNode.tokenRefs, tokenVars ?? new Map());
  }

  return textNode;
}
