// Font loading with graceful fallback chain.
// Ported verbatim from EaseUI figma-plugin/code.ts:147-185 (tryLoadFont,
// loadBestFont) and code.ts:279-310 (getFontStyleVariants).

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

/**
 * Load the best available font: requested family → Inter → Inter Regular.
 */
export async function loadBestFont(family: string, weight: number, isItalic = false): Promise<FontName> {
  const variants = getFontStyleVariants(weight, isItalic);

  // 1. Try requested family with all style variants
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
