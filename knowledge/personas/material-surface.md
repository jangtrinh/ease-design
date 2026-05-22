# Family: Material Surface

Personas defined by **how surfaces look and feel** — glass, clay, velvet, chrome,
puffed plastic, simulated physical materials. Depth, tactility, and materiality carry
the identity here. Pick this family when the product should feel touchable, premium,
or playful through its surface treatment rather than through layout or typography.

This is the largest family — 7 personas spanning a wide tactile range from refined
(Liquid Glass, Velvet Noir) to exuberant (Dopamine Maximalism).

**Personas in this family:** Velvet Noir · Prismatic Glass · Haptic Claymorphism ·
Liquid Glass · Semi-flat Depth · Modern Skeuomorphism · Dopamine Maximalism

See `persona-index.md` for the cross-family lookup table and auto-selection rules.

---

## Velvet Noir

- **Slug:** `velvet-noir`
- **Family:** material-surface
- **UI types:** landing, app, ecommerce, portfolio
- **Density:** comfortable
- **Color mode:** dark
- **Keywords:** dark, luxury, velvet, warm, gold, premium, elegant

**Philosophy** — Rich, warm darkness: luxurious dark mode that feels like velvet, not
a developer terminal.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Elegant sans-serifs (Inter, Satoshi). Regular body weight, semibold headings. Comfortable spacing. Warm off-white text (#E8E0D4) on dark. |
| **Color philosophy** | Deep warm blacks (#1A1614, #231F1C) as backgrounds. Gold (#C9A55C) and copper (#B87333) accents. Muted rose (#9E6B6B) highlights. NEVER cold blue-blacks. |
| **Spacing** | Luxurious, ample spacing. 32–48px section padding. Elements feel precious and well-placed. Nothing crowded. |
| **Depth** | Rich, warm shadows with brown tint (rgba(30,20,10,0.6)). Subtle inner glow on cards (warm amber). Multi-layer depth for luxury feel. |
| **Borders** | Thin, warm-tinted borders (1px rgba(201,165,92,0.2)). Medium radius (12–16px). Gold accent borders for featured elements. |
| **Texture** | Subtle noise grain over dark backgrounds. Brushed metal accents. Muted fabric-like textures. No harsh patterns. |

**Interactions** — Golden glow on hover (box-shadow with warm color). Smooth fade-in
transitions (300ms). Subtle scale on interactive cards.

**Layout** — Centered, editorial layouts. Generous margins. Hero sections with
full-width dark backgrounds. Card-based content.

**Anti-patterns** — NO cold blue or gray dark themes. NO neon accents. NO stark white
elements. NO flat/harsh contrasts. NO playful/casual tone.
**Avoid list:** cold blue-black backgrounds; neon accents; stark white elements; flat
harsh contrasts; casual playful tone.

---

## Prismatic Glass

- **Slug:** `prismatic-glass`
- **Family:** material-surface
- **UI types:** landing, app, portfolio
- **Density:** comfortable
- **Color mode:** light
- **Keywords:** glass, rainbow, prism, light, prismatic, spectrum, refraction

**Philosophy** — Light refracted through crystal prisms: rainbow spectra on clean
white surfaces.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Clean geometric sans (Inter, Outfit). Light to regular weight for body (300–400). Subtle rainbow gradient text for headings. Clean, modern sizing. |
| **Color philosophy** | White (#FFFFFF) and light gray (#F8F9FA) base. Rainbow prismatic accents: smooth gradients cycling through spectrum. Subtle, elegant color use — not garish. |
| **Spacing** | Generous, airy spacing. 32–48px padding. Floating elements with breathing room. Clean, uncluttered. |
| **Depth** | Glassmorphism with prismatic twist: frosted glass panels (backdrop-blur-xl) with rainbow-tinted borders. Soft colored shadows. Light refraction effects. |
| **Borders** | Thin gradient borders (rainbow spectrum at low opacity). Medium radius (12–16px). Glass-panel framing. |
| **Texture** | Subtle light caustics. Rainbow bokeh blur in backgrounds. Prismatic light-leak overlays at edges. Clean glass surfaces. |

**Interactions** — Rainbow shift on hover (gradient angle change). Glass panels
brighten on hover. Prismatic shimmer effects. Light and elegant.

**Layout** — Clean card layouts with glass panels. Centered hero compositions.
Moderate grid density. Floating, elevated cards.

**Anti-patterns** — NO dark themes (prisms need light). NO heavy/bold aesthetics. NO
matte textures. NO industrial feel. NO monospace fonts.
**Avoid list:** dark backgrounds; heavy bold aesthetics; matte textures; industrial
elements; monospace fonts.

---

## Haptic Claymorphism

- **Slug:** `haptic-claymorphism`
- **Family:** material-surface
- **UI types:** landing, app, social
- **Density:** comfortable
- **Color mode:** light
- **Keywords:** clay, soft, tactile, rounded, pastel, friendly, playful

**Philosophy** — Soft-touch matte surfaces: hand-molded volumes that you want to
squeeze.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Rounded sans-serifs (Nunito, Quicksand). Medium to semibold weights. Generous letter-spacing. Friendly, approachable sizing (16–18px body). |
| **Color philosophy** | Warm pastels: peach (#FFDAB9), sage (#B2D8B2), lavender (#D4C5F9), soft clay (#E8C8A0). White (#ffffff) surface with colored inner shadows. NO pure black — use warm dark (#3d3229). |
| **Spacing** | Generous, comfortable spacing. 24–32px padding on all containers. Breathing room between elements. Nothing feels cramped. |
| **Depth** | HEAVY inner shadows (inset) to create a "pressed clay" effect. Outer shadows soft and diffused (0 8px 32px rgba(0,0,0,0.12)). Multi-layered shadow stacks for a pillow effect. |
| **Borders** | NO visible borders. Shape defined entirely by shadows and color differences. Large border-radius (16–24px). Pill shapes for buttons. |
| **Texture** | Matte, slightly textured surfaces. Subtle noise overlays. Soft-focus backgrounds. No glossy or reflective surfaces. |

**Interactions** — Elements "squish" on press (scale-95 + deeper inner shadow).
Springy hover animations (scale-[1.02]). Haptic feedback feel.

**Layout** — Rounded container clusters. Generous gaps between "clay blobs." Organic,
non-rigid arrangements. Centered compositions.

**Anti-patterns** — NO sharp corners. NO thin borders. NO flat/zero-shadow elements.
NO monospace fonts. NO high-contrast neon colors. NO angular shapes.
**Avoid list:** sharp corners; thin borders; monospace fonts; neon colors; angular
shapes.

---

## Liquid Glass

- **Slug:** `liquid-glass`
- **Family:** material-surface
- **UI types:** landing, app, dashboard, portfolio
- **Density:** comfortable
- **Color mode:** both
- **Trending:** yes
- **Keywords:** glass, translucent, blur, apple, liquid, refraction, modern, premium
- **Renamed from:** "Ambient Glassmorphism" (legacy name resolves to this persona).

**Philosophy** — Apple's Liquid Glass language: translucent panels that refract and
reflect their environment. Depth through transparency, not shadow. The 2026 design
standard.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | SF Pro Display / Inter. Light-to-Regular body (16px, weight 300–400). Semibold headings (24–40px). High legibility on translucent surfaces — use text-shadow for contrast. |
| **Color philosophy** | Translucent surfaces: bg-white/60 on light, bg-zinc-900/70 on dark. Backdrop-blur (12–20px). Colors bleed through from background content. Accent colors remain vivid. |
| **Spacing** | Apple-standard: 16–20px card padding. 12–16px element gaps. Comfortable density. Breathing room that lets the glass effect shine. |
| **Depth** | Multi-layer glass: each layer has a different blur intensity (8px, 16px, 24px). Refraction effect via subtle border-white/20 edges. Shadows are tinted with surface color. |
| **Borders** | Semi-transparent borders: border-white/20 on dark, border-black/5 on light. 16–20px border-radius (Apple-scale roundness). Soft, barely-visible edges. |
| **Texture** | The background IS the texture — visible through glass layers. Subtle noise grain (2–3%) on glass surfaces. No solid backgrounds — always translucent. |

**Interactions** — Glass panels shift blur on hover (blur increase). Smooth
250–350ms transitions. Elements slide like oil on glass. Focus states with brighter
glass borders.

**Layout** — Floating glass panels over rich backgrounds (gradients, images, or
colors). Sidebar/header as glass overlays. Cards float above the content layer.
Z-layered architecture.

**Anti-patterns** — NO opaque solid backgrounds on main panels. NO sharp borders. NO
heavy shadows (light tinted shadows only). NO small border-radius (<12px). NO flat
design without depth.
**Avoid list:** opaque backgrounds; hard shadows; sharp corners; flat surfaces; heavy
borders.

---

## Semi-flat Depth

- **Slug:** `semi-flat-depth`
- **Family:** material-surface
- **UI types:** dashboard, admin, app, landing, documentation
- **Density:** comfortable
- **Color mode:** both
- **Keywords:** clean, professional, material, elevation, structured, system, functional

**Philosophy** — Structured clarity through subtle elevation: Material Design evolved
for 2026. Functional depth without decorative excess.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | System UI stack (Inter, Roboto, SF Pro). Regular/Medium weights for body (16px). Semibold for headings (24–32px). 1.5 line-height. Letter-spacing -0.01em for headers. |
| **Color philosophy** | Neutral surface hierarchy: white (#ffffff) > light gray (#f5f5f5) > medium (#e0e0e0). Primary accent via a single brand hue (blue-600 default). Semantic colors for states. Dark mode: zinc-900 > zinc-800 > zinc-700. |
| **Spacing** | Consistent 4/8px grid. Padding 16–24px on cards. 24–32px section gaps. Generous but not wasteful — "comfortable" density. |
| **Depth** | Subtle elevation system: shadow-sm for cards, shadow-md for modals, shadow-lg for dropdowns. Each level adds 1–2px blur. No hard shadows. |
| **Borders** | 1px solid border-200 for containers. 8px border-radius standard, 12px for larger cards. Divider lines for list separation. |
| **Texture** | None. Clean, flat color fills. White/gray surface layers. Anti-decorative — the content IS the visual interest. |

**Interactions** — Subtle hover elevation (shadow increase). Smooth 200ms
transitions. Ripple effects on buttons. Focus rings for accessibility.

**Layout** — Standard responsive grid: sidebar (240px) + main content. Card-based
layouts with consistent gaps. Sticky headers and navigation.

**Anti-patterns** — NO heavy shadows (keep shadows subtle). NO rounded corners > 16px.
NO decorative backgrounds. NO unusual typography. NO gradient backgrounds.
**Avoid list:** heavy textures; gradient backgrounds; decorative borders; extreme
whitespace; experimental layouts.

---

## Modern Skeuomorphism

- **Slug:** `modern-skeuomorphism`
- **Family:** material-surface
- **UI types:** app, dashboard
- **Density:** comfortable
- **Color mode:** light
- **Keywords:** tactile, physical, material, warm, realistic, depth, premium

**Philosophy** — Digital interfaces that feel like real objects: subtle material
simulation that adds warmth and familiarity. Skeuomorphism 2.0 — refined, not kitschy.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Warm sans (SF Pro, Inter). Medium weight body (15–16px). Semibold headings (24–36px). Slightly tighter line-height (1.4) for UI density. |
| **Color philosophy** | Warm neutral base: cream (#f5f0eb), warm gray (#d4cdc5). Rich accent colors: wood brown (#8b6914), brushed gold (#c0a36e), deep teal (#0d6e6e). Simulated material colors. |
| **Spacing** | Realistic proportions: 12–20px padding (like physical button thickness). 8px component gaps. Dense but tactile. Material-appropriate gutters. |
| **Depth** | Multi-layer shadow system: inset shadows for pressed states, drop shadows for raised elements. Inner glow for active states. Emboss/deboss effects. |
| **Borders** | Subtle 1px borders matching material edges. 8–12px border-radius for buttons, 4px for small elements. Inset styling for input fields. |
| **Texture** | Subtle material textures: brushed metal (repeating linear-gradient), leather grain, soft fabric. Background textures at 10–15% opacity. Not overwhelming. |

**Interactions** — Button press animations (translateY + shadow reduction). Toggle
switches with physical snap. Dial/knob rotations. Satisfying click feedback.

**Layout** — Panel-based layouts reminiscent of physical dashboards. Grouped controls
in "hardware" clusters. Status indicators as LED-style dots.

**Anti-patterns** — NO flat design (must have physical depth). NO extreme minimalism.
NO neon colors. NO wireframe aesthetic. NO paper-thin borders.
**Avoid list:** flat design; neon colors; extreme minimalism; wireframe style; pure
white backgrounds.

---

## Dopamine Maximalism

- **Slug:** `dopamine-maximalism`
- **Family:** material-surface
- **UI types:** landing, app, social, ecommerce
- **Density:** comfortable
- **Color mode:** light
- **Trending:** yes
- **Keywords:** bold, colorful, fun, dopamine, vibrant, playful, energetic, squishy

**Philosophy** — More is more: inflatable geometry, dopamine-inducing colors, chrome
surfaces that demand attention. The antidote to boring minimalism.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Bold rounded sans (Plus Jakarta Sans, Nunito). Heavy weights (700–900). Large headings (40–64px). ALL-CAPS for labels. Playful, chunky letterforms. |
| **Color philosophy** | Hyper-saturated dopamine palette: electric chartreuse (#c2f542), hot pink (#ff2d78), electric blue (#3b82f6), sunny yellow (#fbbf24). Multiple accent colors per page. Gradient fills everywhere. |
| **Spacing** | Generous padding (24–32px) for an inflated feel. 16–24px gaps. Chunky proportions — everything feels thick and tactile. No tight spacing. |
| **Depth** | Inflatable depth: large border-radius (20–32px) + inner highlight (inset shadow white/30 at top) + outer shadow. Chrome reflections via linear-gradient overlays. 3D-like layering. |
| **Borders** | Thick rounded borders (3–4px). Matching or contrasting accent colors. 20–32px border-radius. Border + shadow combination for a "puffed up" effect. |
| **Texture** | Chrome/glossy gradient overlays. Jelly-like surface sheen. Subtle noise (5%) for tactile feel. Holographic shimmer effects. |

**Interactions** — Squishy press effects (scale(0.95) + shadow reduction on click).
Bouncy spring animations (cubic-bezier). Color shift on hover. Elements that "wobble"
with delight.

**Layout** — Asymmetric, energetic grid. Mixed-size cards. Hero sections with
oversized illustrations. Dense but not cluttered — every element is BIG and bold.

**Anti-patterns** — NO muted/pastel colors. NO thin fonts or borders. NO minimalist
whitespace. NO corporate neutrality. NO monochrome palettes.
**Avoid list:** muted colors; minimal design; corporate look; thin fonts; subtle
styling.
