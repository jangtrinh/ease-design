# Family: Product Marketing

Personas for **persuasive product surfaces** — feature pages, marketing sites, and
launch pages that must communicate a product clearly and attractively. They balance
structure with appeal: modular systems, accessible clarity, organic gradients, or
floating compositions. Pick this family when the goal is to explain and sell a
product, not to run it.

**Personas in this family:** Modular System Layout · Inclusive Clarity ·
Organic Mesh Gradients · Floating Composition

See `persona-index.md` for the cross-family lookup table and auto-selection rules.

---

## Modular System Layout

- **Slug:** `modular-system-layout`
- **Family:** product-marketing
- **UI types:** landing, documentation, app, ecommerce
- **Density:** comfortable
- **Color mode:** both
- **Keywords:** modular, system, feature, grid, product, organized, scalable

**Philosophy** — Systematic modularity: every block is a self-contained unit that can
be rearranged without breaking the visual system. Feature pages, not just marketing.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Geometric sans (Inter, Plus Jakarta Sans). Medium weight body (15–16px). Bold headings (28–40px). Tight letter-spacing (-0.02em) for headlines. |
| **Color philosophy** | Light base (#fafafa) with strong accent colors per module. Each section can own a color identity. Dark variants supported. Limited to 3 accent colors per page. |
| **Spacing** | Modular scale: 16px base unit. Card padding 24–32px. Section gaps 48–64px. Inner component gaps 12–16px. Strict consistency across all modules. |
| **Depth** | Card-level elevation: shadow-sm default, shadow-md on hover. Colored borders (2px) as module identifiers. Subtle layering. |
| **Borders** | 2px colored borders for featured modules. 1px border-200 for standard containers. 12px border-radius. Accent-colored top borders on cards. |
| **Texture** | Minimal. Subtle dot grids or line patterns as section backgrounds. Mostly clean surfaces. Occasional gradient accents on CTAs. |

**Interactions** — Module cards scale slightly on hover (1.01). Staggered reveal on
scroll. Tab switching between module views. Smooth 250ms transitions.

**Layout** — Feature grid: 2–3 column modules with varying heights. Full-width hero
sections. Alternating layout rhythms (image-left, image-right). Sticky comparison
tables.

**Anti-patterns** — NO single-column-only layouts. NO freeform positioning. NO
inconsistent spacing between modules. NO modules without clear boundaries.
**Avoid list:** organic shapes; asymmetric layouts; extreme whitespace; hand-drawn
elements.

---

## Inclusive Clarity

- **Slug:** `inclusive-clarity`
- **Family:** product-marketing
- **UI types:** dashboard, admin, app, documentation, landing
- **Density:** spacious
- **Color mode:** both
- **Keywords:** accessible, readable, clear, contrast, inclusive, calm, reliable

**Philosophy** — Accessibility as identity, not afterthought. Maximum readability,
maximum contrast, maximum usability. Beautiful through function.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Highly readable sans-serif (Atkinson Hyperlegible, Inter). Minimum 16px body. Large labels (14px+). Generous line-height (1.6–1.75). Medium/Semibold weights only. |
| **Color philosophy** | WCAG AAA contrast ratios everywhere. Dark text (#1a1a2e) on white (#ffffff). Blue primary (#2563eb) passes 4.5:1 on white. Distinct semantic colors. No color-only indicators — always paired with icons or text. |
| **Spacing** | Generous touch targets: 44px minimum for interactive elements. Padding 16–24px. Clear visual separation between sections. 48px+ between logical groups. |
| **Depth** | Minimal depth. Focus on border contrast instead of shadows. Light shadow-sm on elevated cards. Heavy focus-visible rings (3px blue outline). |
| **Borders** | Clear, visible 2px borders on all interactive containers. 8–12px border-radius. Strong focus indicators. Distinct hover/active states. |
| **Texture** | None. Clean, high-contrast surfaces. Avoid patterns that reduce text readability. Solid color backgrounds only. |

**Interactions** — Large, clear hover states (background color change). Focus-visible
outlines on keyboard navigation. Skip-to-content links. Reduced-motion support.

**Layout** — Single-column or wide 2-column layouts. Generous margins. Logical
heading hierarchy. Landmark regions. Breadcrumbs for navigation.

**Anti-patterns** — NO thin font weights (< 400). NO text < 14px. NO low-contrast
text. NO color-only indicators. NO tiny click targets. NO animations without
prefers-reduced-motion.
**Avoid list:** decorative animations; thin fonts; low contrast colors; small text;
hover-only states.

---

## Organic Mesh Gradients

- **Slug:** `organic-mesh-gradients`
- **Family:** product-marketing
- **UI types:** landing, app, portfolio
- **Density:** spacious
- **Color mode:** both
- **Keywords:** gradient, organic, mesh, flowing, startup, modern, colorful, fresh

**Philosophy** — Fluid, organic color flows that feel alive: mesh gradients as
artistic identity. Nature-inspired tech aesthetics for modern startups.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Rounded sans-serif (Outfit, Nunito, Poppins). Light-to-Medium body (400–500, 16px). Semibold headings (32–48px). Relaxed tracking. |
| **Color philosophy** | Multi-point mesh gradients as hero backgrounds. Palette shifts: teal (#0d9488) → purple (#8b5cf6) → amber (#f59e0b). Soft, low-saturation versions for surfaces. Dark mode: gradients over zinc-950. |
| **Spacing** | Fluid spacing: 20–32px padding. 48–80px section gaps. Breathing room around text blocks. Anti-dense aesthetic. |
| **Depth** | Gradient-based depth. Lighter gradient = foreground, deeper = background. Soft blurred gradient orbs as decorative elements. No hard shadows. |
| **Borders** | Minimal borders. 16–20px border-radius for organic feel. Semi-transparent white borders (border-white/10) on dark mode. No sharp edges. |
| **Texture** | Mesh gradients as primary texture. Grain noise overlay (5–8%) for analog feel. Soft blurred color orbs floating in background. |

**Interactions** — Gradient shifts on hover (color lerp). Smooth 300ms transitions.
Parallax gradient backgrounds. Gentle pulse animations on CTAs.

**Layout** — Full-bleed gradient heroes. Floating cards on gradient backgrounds.
Asymmetric but balanced compositions. Wide gutters.

**Anti-patterns** — NO flat solid color backgrounds. NO sharp geometric borders. NO
dense grid layouts. NO monochrome palettes.
**Avoid list:** rigid grids; sharp corners; monochrome; dense layouts; corporate feel.

---

## Floating Composition

- **Slug:** `floating-composition`
- **Family:** product-marketing
- **UI types:** landing, portfolio
- **Density:** spacious
- **Color mode:** both
- **Keywords:** floating, launch, startup, mockup, device, innovation, space, modern

**Philosophy** — Elements that breathe in space: suspended screenshots, floating UI
mockups, and gravity-defying layouts that suggest weightlessness and innovation.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Modern geometric (Inter, General Sans). Medium body (16px). Bold headings (36–56px). Tight letter-spacing (-0.03em) for display. |
| **Color philosophy** | Clean white (#ffffff) or soft gray (#f8fafc) backgrounds. Single accent color (blue, violet, or emerald). Screenshots and mockups provide color. Dark mode with zinc-950. |
| **Spacing** | Generous — elements float in ample whitespace. 64–96px between floating groups. 24–32px card padding. Space IS the design. |
| **Depth** | Heavy shadow system for floating effect: shadow-2xl with color (shadow-blue-500/20). Rotated perspective transforms (rotateX/Y 2–5deg). Elements overlap with clear z-index. |
| **Borders** | 12–16px border-radius. Subtle 1px borders. No heavy outlines — let shadows define boundaries. |
| **Texture** | App screenshots and device mockups AS texture. Subtle dot-grid backgrounds. Clean surfaces otherwise. |

**Interactions** — Parallax depth on scroll. Elements float with subtle Y-axis
movement. Perspective shifts on mouse position. Springy hover effects.

**Layout** — Off-center compositions. Overlapping screenshots at angles. Staggered
feature cards. Hero sections with floating device mockups. Diagonal rhythm.

**Anti-patterns** — NO flat, grounded layouts. NO rigid grid alignment. NO elements
touching edges. NO crowded compositions. NO heavy textures.
**Avoid list:** dense grids; flat layouts; heavy borders; crowded sections; corporate
rigidity.
