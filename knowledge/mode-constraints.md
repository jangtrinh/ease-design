# Mode Constraints

This file defines the **hard structural rules** for UI generation. Every design output
must satisfy the universal style guide **plus** exactly one of the eight UI-mode
constraint sets.

A "mode" is the kind of artifact being designed. Pick the mode first, then apply its
constraint set on top of the universal rules below. Constraint sets are **non-negotiable
floors** — they define minimum acceptable structure, spacing, and behavior, not stylistic
suggestions.

See also: `component-catalog.md` (reusable building blocks), `prompt-modes.md`
(replicate / enhance / adapt strategy modifiers applied on top of any mode).

---

## How a mode is chosen

There are three explicit modes and five that derive from the UI's *type*:

| Mode | Selected when | Constraint set |
|------|---------------|----------------|
| `component` | Designing an isolated component specimen | Component |
| `slide` | Designing a presentation slide / deck | Slide |
| `mobile` | Target is a mobile screen | Mobile |
| `dashboard` | UI type is an analytics dashboard | Dashboard |
| `admin` | UI type is an admin / back-office panel | Admin |
| `ecommerce` | UI type is a storefront | Ecommerce |
| `app` | UI type is a web application | App |
| `desktop` | Default for any web page (landing, portfolio, documentation, marketing, social) | Desktop |

`component`, `slide`, and `mobile` always win over the UI type. Otherwise the UI type
selects the set; anything not matching a named type falls through to **Desktop**.

---

## Breakpoints — the counted scale (spec 010 P1)

`@media (min-width: …)` breakpoints a component reflows across. **Layout constants, NOT
design tokens** — `@media (min-width: var(--x))` is invalid CSS (a media-query condition
cannot read a custom property), so the value must be a literal. This is the one deliberate
exception to token-only: colour, space and typography still resolve through `var(--…)`;
only the breakpoint boundary itself is a raw number. Do not add a `breakpoint` token
category and do not invent `@custom-media` — the literal lives directly in each
component's `@media` rule.

Counted, not guessed: measured across nine real code projects, 684 of 717
`@media (min-width: …)` occurrences (95%) are exactly Tailwind's default scale, expressed
in `rem`:

| Name | Value | px equivalent |
|------|-------|---------------|
| `sm`  | `40rem` | 640px |
| `md`  | `48rem` | 768px |
| `lg`  | `64rem` | 1024px |
| `xl`  | `80rem` | 1280px |
| `2xl` | `96rem` | 1536px |

`rem`, not `px` — the corpus is unanimous, and it is the accessible choice: a `rem`
breakpoint respects the user's font-size zoom; a `px` one overrides it (Art X puts
accessibility above layout). Mobile-first: write the base (no-media) rule for the
narrowest layout, then layer `sm`/`md`/`lg`/`xl`/`2xl` upward — matching the Desktop mode's
own "mobile-first, then layer `sm:` `md:` `lg:`" rule below.

A kit component either reflows through one of these five breakpoints, or carries an
explicit, reasoned exemption (`<!-- responsive-exempt: <reason> -->` in its markup) — see
`src/core/component-kit/responsive-lint.ts`. An exemption with no reason is a lint failure,
not a pass (Art VIII: say exactly what was checked).

---

## Universal Style Guide (applies to EVERY mode)

These rules hold regardless of which constraint set is active.

### Tech stack
- **CSS:** Tailwind via CDN. Use **standard utility classes only** — no custom CSS, no
  arbitrary stylesheet rules. Arbitrary-*value* utilities (`bg-[#1A1614]`, `mt-[3px]`)
  *are* standard Tailwind and allowed — so an exact hex from a persona's color DNA is
  reproduced as `bg-[#hex]`, or mapped to the nearest theme class, never as a custom rule.
- **Icons:** Lucide icon library. Initialize icons once at the end of the document body.
- **Charts:** Chart.js. Always wrap a `<canvas>` in a `position: relative; width: 100%`
  container to prevent infinite resize loops.
- **Images:** Use `picsum.photos/seed/{seed}/{w}/{h}` or `images.unsplash.com/photo-{id}`.
  Never use `source.unsplash.com`.
- **Image fallback (critical):** Every `<img>` must carry an `onerror` handler that clears
  itself and swaps to a fallback placeholder, so a broken source never leaves an empty box:
  ```html
  onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/800/600';"
  ```
- **Forms:** Apply `appearance-none` to checkboxes and toggles so they can be styled.
- **Materiality:** Achieve depth and texture with Tailwind utilities only
  (`backdrop-blur`, blend modes). No custom CSS.

### Context
- Treat the current year as the present. Never reference past years as if current.

### Token efficiency
- Minimize redundant wrapper elements. Use semantic HTML: `<section>`, `<article>`,
  `<nav>`, `<header>`, `<footer>`.
- For repeated patterns (cards, list items): establish **one** consistent markup
  structure and vary only the content data, never the markup.
- Prefer Tailwind utility classes over inline styles.
- Use CSS Grid and Flexbox efficiently; avoid unnecessary nesting.

---

## Mobile

Target: a single mobile screen.

- **Canvas:** 390 × 844 px. Root element:
  `w-full min-h-[844px] max-w-[390px] mx-auto relative overflow-hidden`.
- **Grid:** 4 columns. Outer margins 16–24 px. Gap 16 px.
- **Spacing (8-pt base):** Micro 4–8 px, Element 12–16 px, Component 24–32 px,
  Section 40–64 px. Inner padding must be **greater than or equal to** outer margin.
- **Typography:** Display 32 px/Bold, H1 24 px/Bold, H2 20 px/Semibold, H3 18 px/Medium,
  Body 16 px, Caption 12 px. Inputs must be **at least 16 px** to prevent mobile zoom.
- **Touch targets:** Minimum 44 × 44 px clickable area. Icons at 16 / 24 / 32 px.
- **Buttons:** Primary 48–56 px tall — **maximum one per view**, placed in the bottom
  third of the screen. Secondary 40–44 px. No hover states; use `active:scale-95` for
  press feedback.
- **Radius:** Inner radius = outer radius − padding (nested corners stay concentric).
- **Depth (elevation levels):** lvl0 flat background; lvl1 cards (subtle shadow);
  lvl2 nav (medium shadow); lvl3 modals (large shadow).
- **UX rules:** Place destructive actions top-left. No device frames or bezels.
- **Color:** Never pure `#000`. Contrast 4.5:1 for text, 3:1 for icons.
- **Navigation:** 3–5 destinations → bottom tab bar (49–80 px tall). More than 5 → drawer.
- **States:** Any data view requires a skeleton loading state (`animate-pulse`) **and** an
  empty state. Errors require a retry button.

**Machine floor (responsive-web mobile).** These reliability rules are enforced by
`ui validate-layout` / `ui a11y-lint` on ANY HTML — the mobile mode above is where they bite
hardest, but a responsive desktop page that reflows to a phone owes them too:

- **Tap spacing (`tap-spacing-cramped`):** adjacent tappables in a flex/grid row or stack need
  a gap of **at least 8 px** (`gap-2`). A `gap-0`/`gap-1` row of controls invites mis-taps —
  fingers are wider than a cursor. WHY: sub-8px spacing is the top touch-reliability failure.
- **Input font (`input-font-below-16`):** a text-entry `<input>`/`<textarea>`/`<select>` must
  render at **16 px or larger**. WHY: iOS Safari auto-zooms the page when a focused control is
  under 16 px and does not zoom back out — a `text-sm` field is the classic offender.
- **Safe area (`edge-bar-no-safe-area`):** a `fixed`/`sticky` bar anchored to the **bottom**
  viewport edge (a bottom tab bar, a sticky CTA) must pad the system inset with
  `env(safe-area-inset-bottom)`. WHY: without it the bar sits under the home indicator on
  modern phones, hiding its own controls. (A top-0 sticky header is not flagged — the top
  inset only bites in standalone/PWA mode, which static markup cannot prove.)
- **Viewport height (`dvh-over-100vh`):** a full-viewport container uses **`100dvh`**
  (`h-dvh` / `min-h-dvh`), never `100vh` / `h-screen`. WHY: the mobile URL bar resizes the
  visual viewport, so `100vh` clips content then jumps as the bar collapses; the dynamic unit
  tracks the real viewport.

## Desktop

Default for web pages — landing, portfolio, documentation, marketing, social.

- **Layout:** Use bold negative space. Hero is `min-h-[80vh]`. Pace the page by
  alternating full-width immersive sections with constrained `max-w-7xl mx-auto` sections.
- **Asymmetric layouts preferred.** Avoid 50/50 splits unless deliberate.
- **Content:** Realistic copy and data — **no lorem ipsum**. Use metric cards, sparklines,
  status badges to make content feel real.
- **Responsive:** Mobile-first, then layer `sm:` `md:` `lg:` breakpoints. A sidebar
  collapses into a drawer at small widths.
- **Interaction:** Hover states are **required on all interactive elements**, with
  `transition-all duration-200 ease-out`.
- **Images:** Use seeded picsum or Unsplash for every image; every `<img>` carries the
  `onerror` fallback.

## Component

Target: an isolated component specimen sheet.

- **Scope:** The isolated component **only**. No page layouts, headers, navigation,
  sidebars, or footers.
- **Background:** Pure white (`#FFFFFF`). Center the component group on the page with
  generous padding (64 px or more).
- **States:** Render **every relevant state** stacked vertically with a 32 px gap —
  Default, Hover, Active, Disabled, Focus, Loading, Error.
- **Labels:** Above each state rendering, place a small label styled
  `text-xs text-gray-400 font-mono uppercase tracking-wider mb-2`.
- **Size variants:** If the component has sizes, show `sm` / `md` / `lg` side by side in a
  flex row with `gap-6`.
- **Interaction:** Include CSS-only hover / focus / active pseudo-states where applicable.
- **Content:** Realistic, concise placeholder text — no lorem ipsum.
- **Output:** Keep it compact — a single-scroll specimen sheet, not a full application.

## Slide

Target: a presentation slide (deck member).

- **Viewport (critical):** Each slide is **exactly 1920 × 1080 px**. Root element:
  `w-[1920px] h-[1080px] overflow-hidden relative`. The `<body>` must set
  `width:1920px; height:1080px; overflow:hidden; position:relative; margin:0;`.
  Nothing may extend beyond 1920 × 1080. No scrollbars. No clipped content.
- **Fill & fit (critical):** Content must fill the **entire** viewport. Put `h-[1080px]`
  (or `min-h-[1080px]`) on the main wrapper and use `flex flex-col justify-between` or CSS
  Grid to distribute content vertically. No large empty regions — if content is sparse,
  scale up typography, increase spacing, or add visual elements.
- **Typography:** Display/Title 64–96 px/Bold, H1 48 px/Bold, H2 36 px/Semibold,
  Body 24–28 px, Caption 18 px. Headlines should be large; body text substantial.
- **Layout:** Generous edge padding (60–120 px). Center content within the padded area.
- **Colors:** High-contrast text on solid or gradient backgrounds. No low-contrast text.
- **Backgrounds:** Each slide has a distinct full-bleed background — solid, gradient, or
  subtle pattern.
- **Speaker notes:** Include `<div data-speaker-notes="...">` as the **last child** of the
  slide body, hidden with `display:none`, holding 1–3 sentences the presenter would say.
- **Hierarchy:** One main idea per slide. Bold headline, minimal body text — think keynote
  slide, not document.
- **Imagery:** Large hero images where appropriate; images are decorative, not
  informational.
- **Consistency:** All slides in a deck share the same palette, font family, and design
  language.

## Dashboard

Target: an analytics / monitoring dashboard.

- **Layout:** Fixed sidebar (240–280 px) + main content area. Top bar with breadcrumbs
  and search.
- **Grid:** Dense card grid (2–4 columns). KPI cards at the top; charts and tables below.
- **Data display:** Use Chart.js for charts. Table rows with alternating background.
  Status badges in semantic colors.
- **Navigation:** Sidebar of icon + label items, collapsible sections, active-state
  highlight.
- **Density:** Comfortable-to-compact. 12–16 px card padding. 16–24 px section gaps.
- **States:** Skeleton loaders for async data. Empty states with illustration + CTA.
- **Interaction:** Hover states on all interactive elements
  (`transition-all duration-200 ease-out`).
- **Images:** Seeded picsum or Unsplash with `onerror` fallback. Include avatars, chart
  thumbnails, or product photos where contextually appropriate.

## App

Target: a general-purpose web application screen.

- **Layout:** Top navigation bar (56–64 px) + content area. Optional sidebar for settings
  or secondary navigation.
- **Navigation:** Tab bar or top nav with 3–7 items. Active state via accent underline or
  background.
- **Content:** Card-based layouts. List views with action buttons. Detail panels.
- **Forms:** Labeled inputs with validation states. Group related fields. Clear submit
  actions.
- **Interaction:** Hover states on all interactive elements. Smooth 200 ms ease-out
  transitions.
- **States:** Loading spinners or skeletons. Success/error toast notifications. Empty
  states.
- **Images:** Seeded picsum or Unsplash with `onerror` fallback.

## Admin

Target: an admin / back-office panel.

- **Layout:** Fixed sidebar (240–280 px) + header bar + content. Sidebar holds
  icon + label navigation grouped into sections.
- **Data:** CRUD tables with sort / filter / search. Pagination. A bulk-actions toolbar.
- **Forms:** Multi-section forms. Inline editing. Validation feedback. A Save / Cancel
  footer.
- **Density:** Compact. 8–12 px cell padding. Dense tables. Minimal whitespace.
- **Status badges:** green = active, red = error, yellow = pending, gray = inactive.
- **Access:** Show role / permission indicators. Breadcrumb navigation for nested views.
- **Images:** Seeded picsum or Unsplash for avatars and content images, with `onerror`
  fallback.

## Ecommerce

Target: a storefront / shopping experience.

- **Layout:** Top nav with a cart icon and search. Category sidebar or horizontal filters.
- **Product grid:** Responsive 3–4 column grid. Card = image + title + price + rating +
  CTA.
- **Product detail:** Hero image gallery + details panel. Prominent Add-to-Cart CTA.
- **Conversion:** Trust badges. Review stars. Price comparison. Limited-stock indicators.
- **Cart:** Slide-out panel or dedicated page. Line items with quantity controls. Order
  summary.
- **States:** Product images load with a skeleton. Out-of-stock overlay. Sale badge.
- **Images:** Seeded picsum or Unsplash for all product photos, hero banners, and category
  images, with `onerror` fallback.
