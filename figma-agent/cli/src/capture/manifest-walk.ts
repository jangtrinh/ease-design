// SingleFile-style asset manifest walk. `inPageManifestWalk` runs INSIDE the
// page via Playwright page.evaluate (serialized by source — must stay
// self-contained, no module refs). One getComputedStyle pass collects used
// fonts, background-image boxes (+ ::before/::after), <img> boxes with
// currentSrc, canvases (toDataURL), videos (poster), and @font-face rules.
// Track 5 Commit 3 (Agent3 #1/#2/#3).

export interface BBox { x: number; y: number; w: number; h: number }
export interface UsedFont { family: string; weight: string; style: string }
export interface BgImageEntry { url: string; bbox: BBox; pseudo?: string }
export interface ImageEntry { currentSrc: string; alt: string; bbox: BBox }
export interface CanvasEntry { bbox: BBox; dataUrl: string }
export interface VideoEntry { poster: string; bbox: BBox }
export interface FontFaceEntry { family: string; src: string; weight: string; style: string }

export interface Manifest {
  version: 1;
  url: string;
  capturedAt: string;
  viewport: { w: number; h: number; scrollH: number };
  usedFonts: UsedFont[];
  backgroundImages: BgImageEntry[];
  images: ImageEntry[];
  canvases: CanvasEntry[];
  videos: VideoEntry[];
  fontFaces: FontFaceEntry[];
}

/** Runs in the browser. Returns the raw manifest payload (minus url/capturedAt). */
export function inPageManifestWalk(): Omit<Manifest, 'version' | 'url' | 'capturedAt'> {
  const abs = (u: string): string => {
    try { return new URL(u, location.href).href; } catch { return u; }
  };
  const boxOf = (el: Element): BBox => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  const usedFonts = new Map<string, UsedFont>();
  const backgroundImages: BgImageEntry[] = [];
  const images: ImageEntry[] = [];
  const canvases: CanvasEntry[] = [];
  const videos: VideoEntry[] = [];

  const all = document.querySelectorAll('*');
  for (const el of Array.from(all)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;

    // Used fonts — only where the element actually renders text.
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (fam && (el.textContent || '').trim()) {
      const key = `${fam}|${cs.fontWeight}|${cs.fontStyle}`;
      if (!usedFonts.has(key)) usedFonts.set(key, { family: fam, weight: cs.fontWeight, style: cs.fontStyle });
    }

    // Background images on the element + its ::before/::after.
    for (const pseudo of ['', '::before', '::after']) {
      const s = pseudo ? getComputedStyle(el, pseudo) : cs;
      const bg = s.backgroundImage;
      if (bg && bg !== 'none' && bg.indexOf('url(') >= 0) {
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (m && m[1] && !m[1].startsWith('data:')) {
          backgroundImages.push({ url: abs(m[1]), bbox: boxOf(el), pseudo: pseudo || undefined });
        }
      }
    }

    const tag = el.tagName;
    if (tag === 'IMG') {
      const img = el as HTMLImageElement;
      images.push({ currentSrc: img.currentSrc || img.src || '', alt: img.alt || '', bbox: boxOf(el) });
    } else if (tag === 'CANVAS') {
      let dataUrl = '';
      try { dataUrl = (el as HTMLCanvasElement).toDataURL('image/png'); } catch { dataUrl = ''; }
      canvases.push({ bbox: boxOf(el), dataUrl });
    } else if (tag === 'VIDEO') {
      const v = el as HTMLVideoElement;
      videos.push({ poster: v.poster || '', bbox: boxOf(el) });
    }
  }

  // @font-face declarations across same-origin stylesheets (CORS sheets skipped).
  const fontFaces: FontFaceEntry[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try { rules = sheet.cssRules; } catch { continue; }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      // CSSFontFaceRule.type === 5 (CSSRule.FONT_FACE_RULE).
      if ((rule as CSSRule).type !== 5) continue;
      const r = rule as CSSFontFaceRule;
      const family = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      const src = r.style.getPropertyValue('src');
      const m = src.match(/url\(["']?([^"')]+)["']?\)/);
      if (family && m && m[1]) {
        fontFaces.push({
          family,
          src: abs(m[1]),
          weight: r.style.getPropertyValue('font-weight') || '400',
          style: r.style.getPropertyValue('font-style') || 'normal',
        });
      }
    }
  }

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, scrollH: document.body.scrollHeight },
    usedFonts: Array.from(usedFonts.values()),
    backgroundImages,
    images,
    canvases,
    videos,
    fontFaces,
  };
}
