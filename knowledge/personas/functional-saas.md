# Family: Functional SaaS

Personas built for software interfaces where **usability outranks expression**. They
favour structured grids, cool neutral palettes, hyper-legible type, and restrained
motion. Pick this family for dashboards, admin panels, data tools, and product apps
that must feel trustworthy and predictable.

**Personas in this family:** Spatial Bento Geometry · SaaS Aurora Minimal ·
Data-Dense Observatory

See `persona-index.md` for the cross-family lookup table and auto-selection rules.

---

## Spatial Bento Geometry

- **Slug:** `spatial-bento-geometry`
- **Family:** functional-saas
- **UI types:** landing, dashboard, admin, app
- **Density:** compact
- **Color mode:** light
- **Keywords:** bento, grid, modular, spatial, dense, compartment, dashboard

**Philosophy** — Compartmentalized information spaces: bento-box precision with
z-axis depth.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Geometric sans (Inter, Geist Sans). Regular-weight body, semibold headings. Micro-typography for labels (10–11px). Clean hierarchy. |
| **Color philosophy** | Cool neutral base: white (#FFFFFF) and light gray (#F1F5F9). Translucent panels (bg-white/80). ONE brand color for CTAs. Muted secondary tones. |
| **Spacing** | Tight grid gaps (12–16px). Dense within boxes, structured between them. Bento-box proportions: varied-size cells in an aligned grid. |
| **Depth** | Frosted translucent panels (backdrop-blur, bg-opacity). Subtle lift shadows (0 1px 3px rgba(0,0,0,0.1)). Z-axis layering with overlapping elements. |
| **Borders** | Semi-transparent borders (1px rgba(0,0,0,0.06)). Medium radius (12px). Rounded bento compartments. |
| **Texture** | Frosted glass. Subtle ambient gradient orbs behind panels. Clean, minimal grain. Dot-grid subtle patterns. |

**Interactions** — Lift on hover (translate-y-[-2px] + deeper shadow). Smooth scale
transitions. Panel expand/collapse. Content slide-ins.

**Layout** — Asymmetric bento grid: varied-size cells (1×1, 2×1, 1×2, 2×2). Dense
information layout. Dashboard-optimized. Sidebar + grid combos.

**Anti-patterns** — NO serif fonts. NO full-bleed sections (everything in boxes). NO
extreme whitespace. NO decorative elements outside boxes.
**Avoid list:** full-bleed hero sections; serif fonts; organic shapes; extreme whitespace.

---

## SaaS Aurora Minimal

- **Slug:** `saas-aurora-minimal`
- **Family:** functional-saas
- **UI types:** landing, dashboard, app, admin
- **Density:** comfortable
- **Color mode:** light
- **Keywords:** saas, clean, aurora, professional, modern, gradient, minimal

**Philosophy** — Software-as-art: ambient aurora backgrounds with hyper-legible
interfaces sitting on top.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Modern geometric sans (Inter, Geist). Regular weight for body, medium for headings. Hyper-legible at all sizes. Clean typographic hierarchy. |
| **Color philosophy** | White base with subtle ambient aurora orbs — large blurred gradients (violet→cyan, pink→amber) in backgrounds at 10–20% opacity. Clean UI colors on top. |
| **Spacing** | Generous, comfortable SaaS spacing. 24–32px component padding. 48–64px section gaps. Well-organized information hierarchy. |
| **Depth** | Subtle card elevation (0 1px 3px rgba(0,0,0,0.08)). Glass overlay panels. Floating navigation bar with blur. |
| **Borders** | Thin, subtle borders (1px #E5E7EB). Medium radius (8–12px). Semi-transparent borders on glass elements. |
| **Texture** | Large-scale ambient gradient blurs in backgrounds. Subtle noise at 3%. Clean surfaces for content areas. |

**Interactions** — Subtle bg-color shift on hover. Smooth border-color transitions.
Gentle scale (1.01) on cards. Professional, restrained.

**Layout** — Clean SaaS patterns: hero + features + pricing + CTA. Card grids.
Dashboard layouts. Sidebar + content. Predictable, usable.

**Anti-patterns** — NO extreme artistic expression. NO heavy textures. NO maximalist
decoration. UI must prioritize USABILITY over aesthetics.
**Avoid list:** heavy textures; maximalist decoration; extreme artistic expression;
unpredictable layouts.

---

## Data-Dense Observatory

- **Slug:** `data-dense-observatory`
- **Family:** functional-saas
- **UI types:** dashboard, admin, app
- **Density:** compact
- **Color mode:** dark
- **Keywords:** data, dense, charts, metrics, numbers, dashboard, observatory

**Philosophy** — Mission control for the information age: maximum data density
without sacrificing clarity.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Tabular-friendly sans (Inter, JetBrains Mono for data). Small sizes (12–14px body). Medium weight. Tabular figures for numbers. Color-coded data values. |
| **Color philosophy** | Dark dashboard: #0F172A base. Cards in #1E293B. Borders #334155. Semantic data colors — green (#22C55E) up, red (#EF4444) down, blue (#3B82F6) info, amber (#F59E0B) warning. |
| **Spacing** | COMPACT. 12–16px card padding. 8–12px gaps. Dense grid of metric cards, charts, and tables. Maximize information per viewport. |
| **Depth** | Minimal. 1px solid borders define containers. NO shadows — dark bg is depth. Subtle header/section differentiation via bg shade. |
| **Borders** | Precise 1px solid borders (#334155). Small radius (6–8px). Every container is bordered. Table lines visible. |
| **Texture** | None. Clean data surfaces. Charts and graphs as visual texture. Sparkline micro-charts in metric cards. |

**Interactions** — Row highlight on hover (bg shift). Tooltip data on hover.
Expandable cards. Drill-down patterns. Click to filter.

**Layout** — Dense multi-column grid (3–4 columns of metric cards). Data tables.
Chart panels. Sidebar filters. Header with global stats.

**Anti-patterns** — NO large whitespace. NO decorative images. NO serif fonts. NO
rounded pill buttons. NO playful aesthetics. Function over form.
**Avoid list:** decorative images; large whitespace; playful aesthetics; rounded pill
buttons; serif fonts.
