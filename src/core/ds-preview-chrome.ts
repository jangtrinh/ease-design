/**
 * Specimen-page chrome CSS — the page's own layout/typography styling (NOT the DS).
 * Every colour, space, radius and font here resolves through the compiled semantic
 * token tier (var(--color-*), var(--space-*), …) so the specimen is dogfood: the page
 * that shows the design system is itself built from it. Kept as a data constant
 * (configuration-like) rather than assembled in code.
 */
export const SPECIMEN_CHROME_CSS = `
/* ── Specimen chrome — every value resolves through the compiled semantic tier ── */
* { box-sizing: border-box; margin: 0; }
body {
  background: var(--color-background); color: var(--color-foreground);
  font-family: var(--font-family-body); font-size: var(--font-size-sm);
  line-height: 1.55; padding: 56px 24px 96px;
}
main { max-width: 1040px; margin: 0 auto; }
:focus-visible { outline: 2px solid var(--color-ring, var(--color-primary)); outline-offset: 2px; }
h1 { font-family: var(--font-family-display); font-size: var(--font-size-4xl); font-weight: var(--font-weight-bold); letter-spacing: -0.02em; }
.meta { color: var(--color-muted-foreground); font-size: var(--font-size-xs); }
.muted { color: var(--color-muted-foreground); }
.lead { max-width: 660px; margin-top: 14px; }
.badge-aa {
  display: inline-block; padding: 2px 10px; border-radius: var(--radius-full);
  background: var(--color-success); color: var(--color-success-foreground);
  font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold);
}
section { margin-top: 64px; }
.kicker {
  font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold);
  text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-muted-foreground);
  border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: 20px;
}
.section-note { color: var(--color-muted-foreground); font-size: var(--font-size-xs); margin: 18px 0 10px; }

/* Color pairs */
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.swatch { border: 1px solid var(--color-border); border-radius: var(--radius-card); overflow: hidden; background: var(--color-card); }
.swatch .chip { height: 76px; display: flex; align-items: center; justify-content: center; font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); }
.swatch .info { padding: 8px 12px; font-size: var(--font-size-xs); color: var(--color-card-foreground); }
.swatch .info code { color: var(--color-muted-foreground); font-family: ui-monospace, Menlo, monospace; }

/* Typography ramp */
.type-row { display: flex; align-items: baseline; gap: 20px; padding: 10px 0; border-bottom: 1px dashed var(--color-border); }
.type-row .tag { width: 150px; flex: none; }

/* Shape, depth, motion */
.chips { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; }
.rchip { background: var(--color-card); border: 1px solid var(--color-border); padding: 18px 22px; font-size: var(--font-size-xs); color: var(--color-card-foreground); }
.echip { background: var(--color-card); border-radius: var(--radius-card); padding: 18px 22px; font-size: var(--font-size-xs); color: var(--color-card-foreground); }
.dchip { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 10px 14px; font-size: var(--font-size-xs); color: var(--color-card-foreground); font-family: ui-monospace, Menlo, monospace; }

/* Components */
.comp { margin-top: 36px; }
.comp-kicker {
  font-size: var(--font-size-md); font-weight: var(--font-weight-semibold);
  color: var(--color-foreground); border-bottom: 1px solid var(--color-border);
  padding-bottom: 8px; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;
}
.comp-variants { margin-bottom: 16px; }
.status-tag {
  font-size: var(--font-size-xs); font-weight: var(--font-weight-medium);
  padding: 1px 8px; border-radius: var(--radius-full);
  background: var(--color-muted); color: var(--color-muted-foreground);
}
.ui-specimen__frame { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: var(--space-6); }

/* Motion floor (taste-rubric): every animated fragment stops under reduced-motion. */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }

/* Footer */
.foot { margin-top: 72px; border-top: 1px solid var(--color-border); padding-top: 16px; }
.foot code { font-family: ui-monospace, Menlo, monospace; }
`;
