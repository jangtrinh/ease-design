# Family: Immersive Cinematic

Personas that build **atmosphere and narrative** — deep darkness, glowing accents,
particle fields, parallax, and scroll-driven storytelling. The interface aims to feel
like an environment or a film, not a document. Pick this family for product launches,
AI/developer tools, and landing pages meant to feel dramatic and immersive.

**Personas in this family:** Abyssal Void-Tech · Particle Atmosphere ·
Motion-led Storytelling

See `persona-index.md` for the cross-family lookup table and auto-selection rules.

---

## Abyssal Void-Tech

- **Slug:** `abyssal-void-tech`
- **Family:** immersive-cinematic
- **UI types:** landing, dashboard, app
- **Density:** comfortable
- **Color mode:** dark
- **Keywords:** dark, void, glow, neon, bioluminescent, futuristic, space

**Philosophy** — OLED darkness: bioluminescent organisms in the deep ocean of digital
space.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Clean geometric sans (Inter, Geist) at regular weight. Body text in dim white (#B0B0B0). Headings in pure white or accent-colored. Moderate sizes. |
| **Color philosophy** | TRUE black (#000000) base. Bioluminescent accents: electric cyan (#00F0FF), deep magenta (#FF00AA), acid green (#39FF14). Only ONE accent per section. Colors glow against the void. |
| **Spacing** | Moderate to generous. Dark space feels expansive. Elements float in the void. 32–48px section padding. Comfortable reading distance. |
| **Depth** | Glowing edges (box-shadow with accent color, e.g. 0 0 20px rgba(0,240,255,0.3)). No traditional shadows. Light radiates FROM elements into darkness. |
| **Borders** | Thin glowing borders (1px with accent-color glow). Border-radius 8–12px. Some elements as floating rectangles in the void. |
| **Texture** | Star-field or particle backgrounds at very low density. Subtle gradient fog. Noise grain at 2–3% on dark surfaces. Deep-space atmosphere. |

**Interactions** — Glow intensification on hover (brighter box-shadow). Pulse
animations on key elements. Fade-in reveals from darkness. Trail effects.

**Layout** — Spacious dark canvas. Floating card clusters. Centered hero content.
Elements emerge from darkness.

**Anti-patterns** — NO white backgrounds. NO warm colors (oranges, yellows). NO heavy
shadows (darkness IS the shadow). NO playful/cute aesthetics. NO serif fonts.
**Avoid list:** white backgrounds; warm colors; heavy shadows; playful cute
aesthetics; serif fonts.

---

## Particle Atmosphere

- **Slug:** `particle-atmosphere`
- **Family:** immersive-cinematic
- **UI types:** landing, dashboard, app
- **Density:** comfortable
- **Color mode:** dark
- **Trending:** yes
- **Keywords:** particle, dark, glow, futuristic, ai, developer, space, atmosphere

**Philosophy** — Data as starfield: ambient particle systems that create depth and
atmosphere. The kind of background that makes developer tools feel like mission
control.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Technical sans (Inter, JetBrains Mono for code). Light/Regular body (14–16px). Bold headings (32–48px). Monospace accents for technical terms. |
| **Color philosophy** | Deep dark base: navy (#0a0f1e) or near-black (#050510). Glowing accent particles: cyan (#06b6d4), emerald (#10b981), violet (#8b5cf6). Text white/90 for readability. |
| **Spacing** | Comfortable technical spacing: 16–24px padding. 40–64px section gaps. Dense but readable. Dashboard-appropriate density. |
| **Depth** | Particle layers create natural depth. Foreground content sharp, particles blurred in background. Glow effects (box-shadow with color) on interactive elements. |
| **Borders** | Subtle glowing borders (1px with colored shadow). 8–12px border-radius. Semi-transparent backgrounds (bg-white/5) for panels. |
| **Texture** | CSS particle backgrounds (radial gradients as dots). Star-field effect with varying opacity. Subtle noise grain. Animated gradient nebula effects. |

**Interactions** — Particle movement on mouse interaction. Glow intensify on hover.
Smooth 200–400ms transitions. Elements that "activate" with pulse animations.

**Layout** — Full-screen dark backgrounds with content zones. Dashboard-friendly
grids. Floating panels over particle fields. Wide sidebar + content layouts.

**Anti-patterns** — NO white backgrounds. NO flat/bright styling. NO heavy borders. NO
light-mode support (dark-only aesthetic). NO cluttered particle density.
**Avoid list:** light backgrounds; pastel colors; heavy borders; traditional
corporate look; flat design.

---

## Motion-led Storytelling

- **Slug:** `motion-led-storytelling`
- **Family:** immersive-cinematic
- **UI types:** landing, portfolio
- **Density:** spacious
- **Color mode:** both
- **Keywords:** cinematic, story, scroll, animation, dramatic, immersive, narrative

**Philosophy** — Scroll as narrative: every section is a scene, every transition is a
story beat. Cinematic web experiences that unfold like a film.

### Aesthetic DNA

| Field | Direction |
|---|---|
| **Typography** | Dramatic serif + sans pairing (Playfair Display + Inter). Large display 48–80px serif. Body 16–18px sans. High contrast between heading and body styles. |
| **Color philosophy** | Cinematic palette: deep darks (#0c0c0c) with warm accents (amber #d97706, warm white #faf5ef). Scene-by-scene color shifts. Dramatic lighting effects. |
| **Spacing** | Full-viewport sections (100vh). Generous internal padding (48–64px). Content centered with max-width constraints. Each "scene" is self-contained. |
| **Depth** | Parallax layering. Foreground/midground/background separation. Blur transitions between z-layers. Sticky elements with scroll-linked opacity. |
| **Borders** | Minimal borders. Large border-radius (16–24px) for cards. Borders used sparingly — rely on space and shadow for separation. |
| **Texture** | Cinematic grain (film noise 3–5%). Atmospheric haze effects. Gradient vignettes. Background video/image support. |

**Interactions** — Scroll-triggered animations (IntersectionObserver). Section
fade-in/scale reveals. Sticky text with parallax images. Progress indicators.

**Layout** — Full-width, full-height sections. Alternating layout rhythms.
Split-screen narratives. Image-dominant with text overlays. Single-scroll story flow.

**Anti-patterns** — NO static, non-animated sections. NO dense grids. NO multi-column
body text. NO abrupt content jumps. NO generic card layouts.
**Avoid list:** dense data layouts; multi-column grids; static content; corporate
templates; standard navigation.
