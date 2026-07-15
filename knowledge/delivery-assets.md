# Delivery Assets — resolve to originals, never screenshot crops

## Purpose

When a delivery reproduces a real surface — a rebuild, a clone-adapt, a design→code
from a live site — its images MUST be the originals the source actually serves, not
rectangles cropped out of a page capture.

## Mental Model

A page capture is a photograph of glass; the assets behind it are the glass. Cropping the
photograph hands you a blurry, fixed-DPI, wrong-background rectangle. The source already
serves the real files — sharp vectors and high-DPR rasters — and after a probe mirror +
asset harvest they are almost always already sitting in your working tree. The job is not
to *make* an asset from a screenshot; it is to *resolve* to the original that already
exists.

## When to Use / When NOT

- **USE** for any rebuild / clone-adapt / design-from-URL where a probe mirror and an
  asset harvest exist — there is a real source whose files you can resolve to.
- **Do NOT** apply to a from-scratch generative design. With no source, there is no
  original to resolve; there you generate or commission, and this ladder does not apply.

## The resolution ladder (best → last resort)

Resolve every reproduced image to the highest rung it can reach. State both sides so the
rung is unambiguous.

1. **Inline SVG logo / icon.** ALLOWED — extract the `<svg …>` verbatim from the mirror
   HTML. Perfect vector, theme-able, infinite DPI; this is where partner wordmarks and
   product logos live. Rasterizing a vector logo is NOT ALLOWED — WHY: it throws away the
   resolution independence the source already gave you, and the wordmark goes soft on any
   Hi-DPI screen.
2. **Harvested raster the site serves.** ALLOWED — the CDN images already in the asset
   harvest (product-UI windows, photos, illustrations as PNG/WebP/AVIF). Use them at full
   resolution. Downscaling-then-upscaling or re-encoding a served raster is NOT ALLOWED —
   WHY: a re-encode compounds compression artifacts the original never had, and a full-res
   window always beats any crop of that same window.
3. **Sprite / spritesheet slice.** ALLOWED — when the source ships a sprite, slice the real
   sprite sheet. Screenshotting one icon out of a rendered sprite is NOT ALLOWED — WHY: the
   slice is pixel-exact and theme-stable; a screenshot bakes in the page background behind
   the icon's transparency.
4. **Screenshot crop — LAST RESORT ONLY.** ALLOWED *only* when the asset is a live
   DOM/canvas/WebGL composition the site never serves as a file (some hero illustrations,
   animated canvases). When you must crop, crop ARTWORK ONLY, and record it as a debt in
   `ASSET-MAP.json`. Cropping a region that contains baked-in headline or CTA text is NOT
   ALLOWED — WHY: the page re-renders that same text as live HTML on top of the crop, so
   the words double-render, misalign, and blur (see failure mode `crop-includes-text`).

Repeat at the point of use: a crop is the LAST rung, never the first reach. If a same-role
original is within reach, using the crop is the "noob" tell this file exists to kill.

## Machine floor

Two halves — one deterministic and shipped in the binary, one a host-model workflow.

- **Enforced (deterministic).** `ui validate-layout` runs `avoidable-screenshot-crop`
  (warning): an `<img src>` under a `crops/` path when the same document also references a
  same-role original under a `real/` path (matched by normalized stem — `crops/hero-1560x1248.png`
  and `real/hero.webp` both reduce to `hero`). It fires ONLY when both are demonstrably on
  hand in the one document, so it never nags a lone crop whose original the linter cannot
  see. This is the fence; the ladder above is the reason it exists.
- **Resolution workflow (host-model, not a `ui` subcommand).** From a probe mirror + asset
  harvest, resolve originals into `assets/real/`:
  1. Copy every site-served raster into `real/`, named by its pixel dimension (a
     `1560×1248` window beats any crop of it — the dimension in the name makes "use the
     largest variant" a glance, not a guess).
  2. Extract every labelled inline `<svg>` (by `aria-label` / `<title>`) as a real vector
     under `real/`, so partner wordmarks and product logos survive as vectors.
  3. Emit `ASSET-MAP.json` beside the delivery recording each real asset's origin URL. WHY
     this is not a `ui` command: correct type-sniffing and dimension-reading across
     PNG/JPEG/WebP/AVIF plus file copy is I/O orchestration over harvested bytes, not a
     pure in-memory transform — it stays a reference script + this workflow rather than
     bloating the deterministic binary with an image-codec surface. The *enforcement* half
     (the lint) is what ships deterministic; the *resolution* half is guidance the host
     model (or a small script) runs.

Provenance is delivered, not just resolved: harvested originals are proprietary to their
source and are for internal study/calibration only — never redistributed — and every real
asset carries its origin URL in `ASSET-MAP.json` so a later reader can re-verify it.

## Failure Modes

- **crop-includes-text** → double text on the page: an HTML heading renders over a crop
  that already contains that same headline, so the words overlap, misalign, and blur.
  Observable: two copies of one string in the rendered hero. Cure — crop art-only, or drop
  the crop for a CSS gradient when the "asset" was only a background wash.
- **screenshot-as-hero** → a blurry, fixed-DPI, wrong-theme window shipped as the hero
  while a sharp full-resolution original sat unused in the harvest. Observable: the hero
  image is visibly softer than the live crisp UI beside it. Cure — this ladder, rung 2.
- **missing-DPR** → a 1× crop shipped where the source serves a 2× file, so the image is
  soft on every Hi-DPI screen. Observable: the asset looks sharp at 100% zoom on a 1×
  display and soft on a Retina one. Cure — prefer the largest harvested variant (rung 2),
  which is why `real/` names carry the pixel dimension.
- **provenance-loss** → a real asset shipped with no record of where it came from, so no
  reader can re-verify it or honor its redistribution terms. Observable: an image in the
  delivery has no row in `ASSET-MAP.json`. Cure — emit `ASSET-MAP.json` (file ↔ source URL)
  as part of resolution, never after.
