/**
 * Delivery-asset discipline check for the static HTML layout linter.
 *
 * avoidable-screenshot-crop (warning): an `<img src>` that points at a
 * screenshot-crop path (`.../crops/...`) when the same document ALSO references
 * a same-role original under a real-asset path (`.../real/...`). Cropping a page
 * capture where the source's own file is already in reach is the "noob" tell the
 * knowledge/delivery-assets.md ladder exists to prevent.
 *
 * Pure string/regex heuristic — no DOM parser, no filesystem. The linter proves
 * "a same-role real asset exists" ONLY from the HTML itself: the crop and the
 * real asset must share a normalized stem within the one document. This keeps
 * the check deterministic and precision-first — it fires only when the author
 * has demonstrably both on hand, never on a lone crop whose original the linter
 * cannot see.
 */
import type { LayoutFinding } from "./layout-lint.js";

/** Return 1-based line number for a match at byte offset `idx`. */
function lineOf(html: string, idx: number): number {
  return html.slice(0, idx).split("\n").length;
}

/**
 * Normalize an image src to a role stem: last path segment, minus query/hash,
 * minus extension, minus a trailing `-1234x567`/`_1234x567` dimension token and
 * a trailing `@2x`/`-2x` DPR token, lowercased. So `crops/hero-1560x1248.png`
 * and `real/hero.webp` both reduce to `hero` — a same-role match.
 */
function roleStem(src: string): string {
  const last = (src.split(/[?#]/)[0] ?? "").split("/").pop() ?? "";
  return last
    .replace(/\.[a-z0-9]+$/i, "")        // extension
    .replace(/[-_]\d{2,}x\d{2,}$/i, "")  // dimension token
    .replace(/[-_@](?:[23])x$/i, "")     // DPR token
    .toLowerCase();
}

/** True when a src sits under a path segment named `dir` (e.g. `crops`, `real`). */
function underDir(src: string, dir: string): boolean {
  return new RegExp(`(^|/)${dir}/`, "i").test(src.split(/[?#]/)[0] ?? "");
}

interface ImgRef {
  src: string;
  index: number;
}

/** Collect every `<img>`'s src attribute with its byte offset. */
function collectImgSrcs(html: string): ImgRef[] {
  const out: ImgRef[] = [];
  const imgRe = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const srcM = (m[1] ?? "").match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (srcM?.[1]) out.push({ src: srcM[1], index: m.index });
  }
  return out;
}

/**
 * avoidable-screenshot-crop: a crop-path `<img>` whose role stem also appears
 * under a real-asset path in the same document.
 */
export function checkAvoidableScreenshotCrop(html: string): LayoutFinding[] {
  const imgs = collectImgSrcs(html);
  if (imgs.length < 2) return []; // need a crop AND a real reference to be sure

  // Stems that the document serves from a real-asset path.
  const realStems = new Set<string>();
  for (const img of imgs) {
    if (underDir(img.src, "real")) realStems.add(roleStem(img.src));
  }
  if (realStems.size === 0) return [];

  const findings: LayoutFinding[] = [];
  for (const img of imgs) {
    if (!underDir(img.src, "crops")) continue;
    const stem = roleStem(img.src);
    if (stem === "" || !realStems.has(stem)) continue;
    findings.push({
      checkId: "avoidable-screenshot-crop",
      severity: "warning",
      message: `<img src="${img.src}"> is a screenshot crop, but a same-role original exists under real/ — use the original (see knowledge/delivery-assets.md)`,
      line: lineOf(html, img.index),
    });
  }
  return findings;
}
