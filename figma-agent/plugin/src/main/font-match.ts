// Pure CSS font-stack normalization + matching against Figma's available fonts.
// DOM-free / figma-free so the matching logic is unit-testable without a live
// canvas. Track 5 Commit 2, COPY #9 (Builder getMatchingFont pattern).

// CSS generic family keywords + common system aliases that never correspond to
// a concrete installed Figma font family — dropped when walking a stack.
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji',
  'fangsong', '-apple-system', 'blinkmacsystemfont',
]);

/** Lowercase, strip quotes, collapse whitespace — for case-insensitive compares. */
export function normalizeFamily(name: string): string {
  return name.toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ').trim();
}

/** Split a CSS font-family stack into concrete family names (generics dropped). */
export function parseFontStack(raw: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const fam = part.replace(/["']/g, '').trim();
    if (!fam) continue;
    if (GENERIC_FAMILIES.has(normalizeFamily(fam))) continue;
    out.push(fam);
  }
  return out;
}

/** Find the available family that matches `requested` (exact-ci → word-prefix). */
export function matchFamily(requested: string, available: string[]): string | null {
  const want = normalizeFamily(requested);
  if (!want) return null;
  for (const a of available) if (normalizeFamily(a) === want) return a; // exact (ci)
  for (const a of available) {
    const na = normalizeFamily(a);
    // Word-boundary prefix so "Roboto" matches "Roboto" but not "Robotica",
    // and "Helvetica Neue" ↔ "Helvetica" both resolve.
    if (na.startsWith(`${want} `) || want.startsWith(`${na} `)) return a;
  }
  return null;
}

/** Walk a font stack, returning the first family present in `available`. */
export function matchFamilyStack(stack: string[], available: string[]): string | null {
  for (const fam of stack) {
    const hit = matchFamily(fam, available);
    if (hit) return hit;
  }
  return null;
}

/** Pick the available style whose normalized form matches one of `variants`. */
export function pickStyle(variants: string[], availableStyles: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const byNorm = new Map<string, string>();
  for (const s of availableStyles) byNorm.set(norm(s), s);
  for (const v of variants) {
    const hit = byNorm.get(norm(v));
    if (hit) return hit;
  }
  return null;
}
