# Component Catalog

A curated library of **32 reusable UI components** organized into **8 categories**. Each
entry is a building block the host model can drop into a larger design or generate as a
standalone specimen.

Every component carries a **generation spec** — a precise description of what to produce
when that component is requested. Specs assume the universal style guide and the
appropriate mode constraints from `mode-constraints.md` already apply. When a component is
generated in isolation, use the **Component** mode constraints (white background, all
states stacked, specimen sheet).

Each entry lists: **id** (stable identifier), **name**, **description** (one line), and
**spec** (what to generate).

---

## Navigation (5 components)

### top-nav-bar — Top Nav Bar
Horizontal navigation bar with logo, links, and CTA button.
**Spec:** Top navigation bar with a logo placeholder, navigation links (Home, Features,
Pricing, About), and a primary CTA button. Responsive and sticky.

### side-navigation — Side Navigation
Vertical sidebar with icon + label links and sections.
**Spec:** Vertical sidebar navigation panel with a logo at the top, icon + label menu
items grouped by section (Dashboard, Analytics, Settings), collapsible, with an
active-state indicator.

### breadcrumb-bar — Breadcrumb Bar
Breadcrumb trail for hierarchical navigation.
**Spec:** Breadcrumb navigation bar showing page hierarchy
(Home > Category > Subcategory > Current Page) with chevron separators and clickable links.

### tab-navigation — Tab Navigation
Horizontal tabs with active indicator.
**Spec:** Horizontal tab navigation component with 4–5 tabs, the active tab marked by an
underline indicator, hover states, and a content transition area below.

### mobile-bottom-bar — Mobile Bottom Bar
Fixed bottom navigation for mobile with icons.
**Spec:** Mobile bottom navigation bar with 5 icon tabs (Home, Search, Add, Notifications,
Profile), active state shown via a color highlight, fixed position, with labels.

---

## Hero (4 components)

### hero-centered — Hero Centered
Centered headline, subtext, and CTA buttons.
**Spec:** Full-width hero section with a centered large headline, a supporting paragraph,
and two CTA buttons (primary and secondary). Clean, spacious layout with a subtle
background.

### hero-split — Hero Split
Text on left, image/visual on right.
**Spec:** Split hero section with headline, paragraph, and CTA on the left half; a large
image or illustration placeholder on the right half. Balanced layout.

### hero-with-video — Hero with Video
Hero section with embedded video player.
**Spec:** Hero section with headline text above a large embedded video player placeholder.
Play-button overlay, aspect-ratio container, with supporting text.

### hero-with-cards — Hero with Cards
Hero headline with feature cards below.
**Spec:** Hero section with a centered headline and subtext, followed by 3 feature cards
in a row below. Each card has an icon, title, and short description.

---

## Content (5 components)

### feature-grid — Feature Grid
2×3 or 3×2 grid of feature cards with icons.
**Spec:** Feature grid section with 6 feature cards in a 3×2 layout. Each card has an icon,
a bold title, and a description paragraph. The section has a main headline.

### feature-list — Feature List
Alternating rows of image + text feature blocks.
**Spec:** Feature showcase with an alternating left–right layout. Each row has an image on
one side and headline + paragraph + bullet points on the other. 3 rows, alternating sides.

### testimonial-carousel — Testimonials
Carousel of customer testimonials with avatars.
**Spec:** Testimonial carousel section with customer quotes, avatar photos, names, and
roles. Show 3 testimonial cards with navigation dots. Include star ratings.

### stats-counter — Stats Counter
Row of large stat numbers with labels.
**Spec:** Statistics counter section with 4 large numbers in a row (e.g. "10K+ Users",
"99.9% Uptime", "500+ Components", "24/7 Support"). Animated-counter style.

### timeline — Timeline
Vertical timeline with milestone events.
**Spec:** Vertical timeline section showing milestone events. Each node has a date, title,
description, and a connecting line. Alternating left–right or centered layout.

---

## Commerce (3 components)

### pricing-table — Pricing Table
Side-by-side pricing tiers with features.
**Spec:** Pricing table section with 3 tiers (Free, Pro, Enterprise). Each column has the
plan name, price, a feature list with checkmarks, and a CTA button. The middle tier is
highlighted as "Popular".

### product-card-grid — Product Cards
Grid of product cards with images and prices.
**Spec:** Product card grid with 4 product cards in a 2×2 layout. Each card has a product
image, name, price, rating stars, and an Add-to-Cart button.

### shopping-cart — Shopping Cart
Cart summary with item list and checkout.
**Spec:** Shopping cart panel with a list of cart items (image thumbnail, name, quantity
selector, price), subtotal, a discount-code input, and a checkout button.

---

## Social Proof (3 components)

### logo-bar — Logo / Sponsor Bar
Row of partner or client logos.
**Spec:** Logo bar / sponsor section with a "Trusted by" heading above a row of 5–6
company logo placeholders. Grayscale logos with a hover color effect. Clean and minimal.

### review-cards — Review Cards
Grid of user review cards with star ratings.
**Spec:** Customer review section with 3 review cards in a row. Each card has a star
rating, a review-text quote, the reviewer's name, an avatar, and a company. Section
headline: "What our customers say".

### trust-badges — Trust Badges
Security and trust indicator badges.
**Spec:** Trust-badges section with icons and labels for security certifications
(SSL Secure, GDPR Compliant, 99.9% Uptime, Money-back Guarantee). Icon + text pairs in a
row.

---

## Forms & Auth (5 components)

### login-modal — Login Modal
Modal login form with social auth options.
**Spec:** Login modal dialog with email and password fields, a "Remember me" checkbox, a
"Forgot password" link, a login button, an "or continue with" divider, and social auth
buttons (Google, GitHub).

### signup-form — Sign-Up Form
Registration form with multiple fields.
**Spec:** Sign-up form with name, email, password, and confirm-password fields, a terms
checkbox, and a Create Account button. Clean card layout with an "Already have an
account?" link.

### contact-form — Contact Form
Contact-us form with message textarea.
**Spec:** Contact form section with name, email, and subject fields, a large message
textarea, and a Send button. Include a "Get in touch" section headline and an optional
contact-info sidebar.

### newsletter-signup — Newsletter Signup
Inline email signup with CTA.
**Spec:** Newsletter signup section with a "Stay in the loop" headline, supporting text,
and an inline email input with a Subscribe button. Clean, minimal design.

### search-bar — Search Bar
Prominent search input with filters.
**Spec:** Search bar component with a large search input, a search icon, filter-dropdown
buttons, and a search-suggestions dropdown area. Clean, prominent style.

---

## Data Display (3 components)

### data-table — Data Table
Sortable table with pagination.
**Spec:** Data table component with column headers (Name, Status, Date, Amount), sortable
columns, row hover, checkbox selection, pagination controls, and a search filter.

### dashboard-cards — Dashboard Cards
Metric cards with charts and KPIs.
**Spec:** Dashboard-cards section with 4 metric cards, each showing a KPI title, a large
number, a percentage-change indicator (up/down), and a small sparkline chart. Clean card
grid.

### chart-panel — Chart Panel
Chart with controls and legend.
**Spec:** Chart panel component with a line or bar chart visualization, a date-range
selector, a chart-type toggle, a legend, and data labels. Clean white card with a subtle
border.

---

## Layout (4 components)

### footer — Footer
Multi-column footer with links and social.
**Spec:** Full-width footer with a logo, 4 columns of links (Product, Company, Resources,
Legal), a row of social-media icons, and a copyright notice. Dark or light variant.

### cta-banner — CTA Banner
Full-width call-to-action banner.
**Spec:** Full-width CTA banner section with a bold headline, supporting subtext, and a
prominent CTA button. Gradient or colored background; may include a decorative pattern.

### faq-accordion — FAQ Accordion
Expandable FAQ question/answer list.
**Spec:** FAQ section with a "Frequently Asked Questions" headline and 5–6 expandable
accordion items. Each has a question title and an expand/collapse chevron. One item is
expanded, showing its answer.

### divider-section — Divider Section
Visual break with quote or callout.
**Spec:** Decorative divider section with a centered pull-quote or single-line callout
text, subtle decorative lines on either side, and ample vertical padding.
