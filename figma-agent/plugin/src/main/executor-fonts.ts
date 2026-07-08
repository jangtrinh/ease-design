// Font loading with graceful fallback chain.
// Ported from EaseUI figma-plugin/code.ts:147-185 (tryLoadFont, loadBestFont)
// and code.ts:279-310 (getFontStyleVariants). Track 5 Commit 2 COPY #9 adds a
// registry-driven match: a cached figma.listAvailableFontsAsync() pass + CSS
// font-stack walk so brand fonts (and their fallbacks) resolve before Inter.

import { matchFamily, matchFamilyStack, parseFontStack, pickStyle } from './font-match';

/**
 * Returns an array of possible font style names for a given weight.
 * Tries multiple naming conventions (e.g. 'SemiBold', 'Semi Bold', 'Semibold')
 * because fonts differ in how they name their styles in Figma.
 */
export function getFontStyleVariants(weight: number, isItalic = false): string[] {
  const regularMap: Record<number, string[]> = {
    100: ['Thin', 'Hairline'],
    200: ['ExtraLight', 'Extra Light', 'UltraLight', 'Ultra Light'],
    300: ['Light'],
    400: ['Regular', 'Normal', 'Book'],
    500: ['Medium'],
    600: ['SemiBold', 'Semi Bold', 'Semibold', 'DemiBold', 'Demi Bold'],
    700: ['Bold'],
    800: ['ExtraBold', 'Extra Bold', 'UltraBold', 'Ultra Bold'],
    900: ['Black', 'Heavy'],
  };
  const baseStyles = regularMap[weight] || ['Regular'];

  if (isItalic) {
    // Generate italic variants: 'Bold Italic', 'Italic', etc.
    const italicStyles: string[] = [];
    for (const style of baseStyles) {
      if (style === 'Regular' || style === 'Normal') {
        italicStyles.push('Italic');
      } else {
        italicStyles.push(`${style} Italic`);
        italicStyles.push(`${style}Italic`);
      }
    }
    // Also try just 'Italic' as a fallback
    italicStyles.push('Italic');
    return italicStyles;
  }

  return baseStyles;
}

/**
 * Try loading a font with multiple style name variants.
 * Returns the successfully loaded FontName, or null if all attempts fail.
 */
async function tryLoadFont(family: string, styleVariants: string[]): Promise<FontName | null> {
  for (const style of styleVariants) {
    try {
      await figma.loadFontAsync({ family, style });
      return { family, style };
    } catch {
      // Try next variant
    }
  }
  return null;
}

// Cached available-font registry (one listAvailableFontsAsync per session).
interface AvailableFonts { families: string[]; stylesByFamily: Map<string, string[]>; }
let availableFontsCache: AvailableFonts | null = null;

async function getAvailableFonts(): Promise<AvailableFonts> {
  if (availableFontsCache) return availableFontsCache;
  const stylesByFamily = new Map<string, string[]>();
  try {
    const list = await figma.listAvailableFontsAsync();
    for (const f of list) {
      const arr = stylesByFamily.get(f.fontName.family) ?? [];
      arr.push(f.fontName.style);
      stylesByFamily.set(f.fontName.family, arr);
    }
  } catch { /* registry unavailable → probe path below still works */ }
  availableFontsCache = { families: [...stylesByFamily.keys()], stylesByFamily };
  return availableFontsCache;
}

/** Test-only: clear the cached registry between runs. */
export function resetAvailableFontsCache(): void { availableFontsCache = null; }

/**
 * Load the best available font. Order:
 *   1. registry match — CSS stack (primary + fallbacks) → primary, matched
 *      against listAvailableFontsAsync with a weight/italic style pick
 *   2. probe requested family with style-name variants
 *   3. Inter (same weight) → Inter Regular
 * `stack` is the raw computed `font-family` (comma-separated) when available.
 */
export async function loadBestFont(family: string, weight: number, isItalic = false, stack?: string): Promise<FontName> {
  const variants = getFontStyleVariants(weight, isItalic);

  // 1. Registry-driven match against installed fonts (brand fonts + fallbacks).
  const { families, stylesByFamily } = await getAvailableFonts();
  if (families.length > 0) {
    const candidates = stack ? [...parseFontStack(stack), family] : [family];
    const matchedFamily = matchFamilyStack(candidates, families) ?? matchFamily(family, families);
    if (matchedFamily) {
      const styles = stylesByFamily.get(matchedFamily) ?? [];
      const style = pickStyle(variants, styles)
        ?? (isItalic ? pickStyle(getFontStyleVariants(weight, false), styles) : null)
        ?? pickStyle(['Regular', 'Normal', 'Book', 'Medium'], styles)
        ?? styles[0];
      if (style) {
        try {
          await figma.loadFontAsync({ family: matchedFamily, style });
          return { family: matchedFamily, style };
        } catch { /* fall through to probe path */ }
      }
    }
  }

  // 2. Try requested family with all style variants
  const requested = await tryLoadFont(family, variants);
  if (requested) return requested;

  // 2. If italic failed, fallback to non-italic
  if (isItalic) {
    const nonItalicFont = await tryLoadFont(family, getFontStyleVariants(weight, false));
    if (nonItalicFont) return nonItalicFont;
  }

  // 3. Fallback to Inter with same weight variants
  if (family !== 'Inter') {
    const inter = await tryLoadFont('Inter', getFontStyleVariants(weight, false));
    if (inter) return inter;
  }

  // 4. Final fallback to Inter Regular
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  return { family: 'Inter', style: 'Regular' };
}
