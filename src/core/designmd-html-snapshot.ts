/**
 * Static preview transform for `ui designmd snapshot`.
 *
 * Takes raw HTML + a list of linked CSS chunks and produces a single
 * self-contained HTML document that opens directly in a browser:
 *
 *   - <link rel="stylesheet" href="/_next/.../foo.css"> tags are
 *     replaced with <style data-source="foo.css">…</style> blocks
 *     using the supplied CSS body.
 *   - All <script> tags are stripped.
 *   - All <link rel="preload|prefetch|modulepreload|dns-prefetch|preconnect">
 *     tags are stripped.
 *   - Inline style="..." reveal-init declarations are sanitised: a
 *     near-zero opacity sentinel (< 0.01, e.g. Framer's opacity:0.001)
 *     and companion reveal transforms (translate, scale, perspective)
 *     are removed; the rest of the inline style is preserved.
 *   - Root-relative URLs (src="/...", href="/...", srcset="/..." and
 *     url(/...)) are absolutised against the supplied --origin.
 *
 * Pure transform — no network, no parsing libraries.
 */

export interface CssChunk {
  /** Short label, e.g. "main.css" or "/_next/static/chunks/abc.css". */
  name: string;
  /** Body of the stylesheet. */
  body: string;
}

export interface SnapshotResult {
  html: string;
  removed: {
    scripts: number;
    preloads: number;
    inlineOpacityHides: number;
    inlineTransformTranslates: number;
    cssInlined: number;
  };
}

/**
 * Apply all snapshot transforms.
 *
 * @param html      Raw HTML body (post-fetch).
 * @param css       CSS chunks already fetched by the caller; matched
 *                  against <link rel="stylesheet"> tags by suffix.
 * @param origin    Base origin used to absolutise root-relative URLs
 *                  (e.g. "https://www.traicaybentre.com").
 */
export function transformSnapshot(
  html: string,
  css: CssChunk[],
  origin: string,
): SnapshotResult {
  const removed = {
    scripts: 0,
    preloads: 0,
    inlineOpacityHides: 0,
    inlineTransformTranslates: 0,
    cssInlined: 0,
  };

  let out = html;

  // ── 1. Strip every root-relative <link rel="stylesheet"> and inject the
  //      supplied CSS chunks as inline <style> blocks before </head>.
  //      Root-relative href ("/...") means a same-origin stylesheet that the
  //      browser would have fetched live; we replace those with the bytes the
  //      caller already fetched. Cross-origin <link href="//cdn/..."> stays.
  out = out.replace(
    /<link\b[^>]*rel="stylesheet"[^>]*\/?>/gi,
    (match) => {
      // Keep cross-origin links (href starts with // or http)
      const hrefMatch = match.match(/href="([^"]+)"/);
      if (hrefMatch && /^(\/\/|https?:)/.test(hrefMatch[1]!)) {
        return match;
      }
      return "";
    },
  );

  if (css.length > 0) {
    const styleBlocks = css
      .map(chunk => `<style data-source="${chunk.name}">${chunk.body}</style>`)
      .join("\n");
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `${styleBlocks}</head>`);
    } else {
      // No </head> — fall back to prepending the styles to <body>, or to the start of the document.
      const bodyMatch = out.match(/<body\b[^>]*>/i);
      if (bodyMatch) {
        out = out.replace(bodyMatch[0], `${styleBlocks}${bodyMatch[0]}`);
      } else {
        out = styleBlocks + out;
      }
    }
    removed.cssInlined = css.length;
  }

  // ── 2. Strip every <script> tag ──────────────────────────────────────────────
  const scriptCountBefore = (out.match(/<script\b/gi) ?? []).length;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<script\b[^>]*\/>/gi, "");
  removed.scripts = scriptCountBefore;

  // ── 3. Strip preload/prefetch/modulepreload/dns-prefetch/preconnect ──────────
  const preloadCountBefore =
    (out.match(/<link\b[^>]*rel="(?:preload|prefetch|modulepreload|dns-prefetch|preconnect)"/gi) ?? []).length;
  out = out.replace(
    /<link\b[^>]*rel="(?:preload|prefetch|modulepreload|dns-prefetch|preconnect)"[^>]*\/?>/gi,
    "",
  );
  removed.preloads = preloadCountBefore;

  // ── 4. Sanitise inline style="..." reveal-init declarations ──────────────────
  //   Scroll-reveal libraries (Framer, GSAP, AOS) hide pre-animation content with
  //   a near-zero opacity sentinel — commonly `opacity:0.001`, sometimes paired
  //   with an offset/scale transform — then animate to the final state via JS.
  //   Because step 2 strips that JS, the init state would otherwise persist and
  //   leave the whole page invisible. We remove just the hiding declarations and
  //   preserve every other declaration in the inline style.
  out = out.replace(/style="([^"]*)"/g, (m, body) => {
    let s = body as string;
    let touched = false;

    // opacity: a near-zero value (< 0.01, e.g. Framer's 0.001) is an imperceptible
    // reveal sentinel — strip it. Perceptible opacities (0.05, 0.5, 0.8, …) stay.
    s = s.replace(
      /(?:^|;)\s*opacity\s*:\s*([0-9]*\.?[0-9]+)\s*(?=;|$)/gi,
      (whole, valueRaw) => {
        const v = parseFloat(valueRaw as string);
        if (Number.isFinite(v) && v < 0.01) {
          removed.inlineOpacityHides++;
          touched = true;
          return "";
        }
        return whole as string;
      },
    );

    // transform: reveal offsets — translate*, scale*, perspective(...). These are
    // the companion init transforms scroll-reveal applies before animating to none.
    if (/(?:^|;)\s*transform\s*:[^;]*(?:translate|scale|perspective)/i.test(s)) {
      s = s.replace(/(?:^|;)\s*transform\s*:[^;]*(?:translate|scale|perspective)[^;]*(?=;|$)/gi, "");
      removed.inlineTransformTranslates++;
      touched = true;
    }

    if (!touched) return m;

    // Clean up dangling separators and whitespace
    s = s.replace(/^\s*;\s*/, "").replace(/;\s*;/g, ";").trim();
    if (s.length === 0) return "";
    return `style="${s}"`;
  });

  // ── 5. Absolutise root-relative URLs ─────────────────────────────────────────
  const cleanOrigin = origin.replace(/\/$/, "");

  // src="/..." and href="/..." (but not href="//..." or full URL)
  out = out.replace(/(\s(?:src|href)=")\/(?!\/)/g, `$1${cleanOrigin}/`);

  // srcset and srcSet — comma-separated list, each entry's URL may be root-relative
  out = out.replace(/\b(srcset|srcSet)="([^"]+)"/g, (_m, attr, val) => {
    const fixed = (val as string)
      .split(",")
      .map(part => {
        const trimmed = part.trim();
        return trimmed.replace(/^\/(?!\/)/, `${cleanOrigin}/`);
      })
      .join(", ");
    return `${attr}="${fixed}"`;
  });

  // url(/...) inside inline style or remaining <style> blocks
  out = out.replace(/\burl\(\/(?!\/)/g, `url(${cleanOrigin}/`);

  return { html: out, removed };
}
