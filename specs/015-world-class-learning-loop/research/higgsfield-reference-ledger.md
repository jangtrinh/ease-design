# Higgsfield Reference Research Ledger

## Disposition key

- **A — adopt:** portable mechanism with a clear quality or safety benefit.
- **E — experiment:** plausible taste improvement; requires controlled blind evaluation.
- **C — contextual:** valid only for a specific stack, product, or brief.
- **R — reject:** conflicts with ease-design rules or is too brittle to generalize.
- **V — verify:** factual claim, threshold, or dependency that must be checked at use time.

This ledger summarizes every file in the pinned corpus. Source links resolve to the exact reviewed
commit; line-oriented claims should be rechecked if that commit changes.

## Visual direction and implementation

### `design-recipe.md` — A/E/C

Compact craft baseline covering typography, color, hero, page-wide layout, copy, motion, states,
forms, images, and icons. Adopt hierarchy, contrast, responsive composition, real content,
reduced-motion, complete states, and semantic icon use. Experiment with anti-default constraints
such as limiting repeated layout families and decorative motifs. Keep palette, serif, centered
layout, and punctuation bans contextual; they diagnose convergence but are not universal taste.

### `design-taste-frontend.md` — A/E/C/R/V

The broad anti-convergence playbook. Its strongest portable mechanisms are:

- infer a one-line Design Read before generation;
- configure design variance, motion intensity, and visual density independently;
- distinguish official design-system briefs from aesthetic briefs;
- verify dependencies before choosing components;
- enforce responsive mechanics, overflow safety, focus, reduced motion, performance, and complete
  states;
- use named pattern vocabulary and preserve behavior during redesign;
- audit before redesign and explicitly choose targeted evolution or full redesign;
- store reusable blocks with provenance, dependencies, accessibility, responsive behavior, and
  usage constraints;
- run a preflight that checks visual intent and production fitness.

Experiment with the three-dial presets, layout diversification, sticky-stack, horizontal-pan,
scroll-reveal, reference vocabulary, and AI-tell detection. Reject mandatory dark mode, universal
em-dash and typography bans, fixed aesthetic prohibitions, and any rule that mistakes novelty for
fitness. Verify package commands, external component sources, performance thresholds, and Apple
Liquid Glass claims at use time. The long appendices are a routing catalog, not timeless API truth.

### `reference-boards.md` — A/E/R

Designs each section as an image before code. Adopt the combinatorial commitment to theme,
background, typography, hero architecture, section system, signature components, narrative spine,
and a second-read moment. Adopt one coherent board per section and mandatory visual inspection.
Experiment with anchor variety and reroll criteria. Reject universal palette bans and any
provider-specific generation command.

### `image-to-code.md` — A/E/R

Adopt pre-code extraction of text, type ratios, spacing, palette logic, components, asset roles,
and rhythm; reread boards during implementation; resolve ambiguity by board evidence, system
coherence, then accessibility. Adopt board-to-code anti-drift and structural hygiene. Experiment
with bespoke CTA “garments” as a visual-quality variable. Reject the prohibition on shared CTA
components because reusable semantics and bespoke presentation can coexist.

### `asset-system.md` — A/E/C

Adopt coherent asset kits, a personalization ladder, palette and grade consistency, user-asset
precedence, explicit gap generation, provenance, public-path validation, and rejection separation.
Experiment with tiered asset budgets. Keep exact asset counts, provider commands, and a requirement
to generate media contextual.

### `wow-catalog.md` — E/C

Catalogs film scrub, layered depth, canvas/pixel, and spatial-layout families. Adopt the idea of
selecting a signature family from the concept and recording anti-convergence axes. Experiment with
individual techniques under screenshot safety, mobile fallback, reduced motion, and performance
budgets. Never make spectacle mandatory.

### `wow-maker.md` — E/C/V/R

Useful technique and component-source index. Adopt concept-linked signature effects, restrained
secondary motion, SSR boundaries, fallbacks, and dependency accounting. Experiment with individual
effects only when they strengthen the narrative. Verify every library, package, license, and API
at use time. Reject “wow on every site,” generated icons, and blind copy-paste from registries.

### `review-rubric.md` — A/E/C

Adopt mechanical checks for placeholders, token consistency, assets, document head, viewport traps,
SSR, reduced motion, screenshot safety, responsive behavior, and reference fidelity. Experiment
with anti-convergence and composition-ration checks. Provider- and template-specific checks remain
contextual.

## Scroll narrative system

### `scroll-scrub.md` — A/E/C

Defines a seam-locked, chapter-based camera journey. Adopt journey planning, boundary-frame
continuity, deterministic encoding, poster-first rendering, keyboard chapter navigation,
reduced-motion behavior, mobile alternatives, lazy loading, and explicit A4 QA. Experiment with
scroll-scrub only where the story benefits from temporal progression.

### `scroll-scrub-asset-css.md` — C

Reference implementation for sticky stage, layered posters/video, crossfades, route controls,
responsive chapter layout, fallback states, and reduced-motion CSS. Treat its values as one tested
implementation, not design tokens to copy globally.

### `scroll-scrub-asset-react.md` — C/V

Reference controller implements weighted scene/connector segments, linger easing, SSR-safe effects,
mobile source selection, Blob-backed video loading, abort and object-URL cleanup, near-viewport
prefetching, smoothed seeking, resize/orientation handling, chapter state, and cleanup. Valuable as
an implementation checklist. Verify browser behavior, memory, autoplay, fetch/CORS, and React API
compatibility before reuse.

### `scroll-scrub-asset-video.md` — C/V

Deterministic ffmpeg helper for exact boundary frames, desktop/mobile H.264 encodes, short GOPs,
posters, sharpening, `yuv420p`, and fast-start. Verify ffmpeg availability, codecs, dimensions,
quality targets, accessibility alternatives, and asset budgets per project.

## App/product UX

### `app-layouts.md` — A/C

Six product-surface archetypes plus reusable components. Adopt “start from the closest product
surface,” visible primary work, stable shells, responsive collapse, real states, and cross-template
acceptance outcomes. Do not copy Higgsfield chrome or fixed widths into independent products.

### `quanta-design.md` — A/C/R

Layer 1 provides portable UX craft: surface selection, interaction completion, keyboard/focus,
overlay layering, forms and feedback, responsive layouts, motion, data presentation, and
pre-delivery checks. Layer 2 is Quanta-specific: component priority, tokens, imports, dark theme,
button semantics, and layout recipes. Adopt Layer 1 concepts; keep Layer 2 contextual. Reject
Material Symbols for ease-design code delivery because the project rule requires Phosphor.

### `app-quickstart.md` — C

An operational critical path for Higgsfield auth, server-only SDK clients, confirmation,
submit/poll/result, React bindings, binary upload, bindings, and Quanta components. Transfer the
sequence and typed-state discipline, not APIs or packages.

### `app-flow.md` — A/C/R

Adopt plan/progress communication, choose a layout before coding, enumerate screens and states,
ship real copy, render real results, separate product state from generation state, and treat a
complete app as end-to-end. Keep Higgsfield auth, fnf, Quanta, Worker, D1, cover, publish, and
contest rules contextual. Reject always-dark, fixed icon family, mandatory generated imagery, and
automatic external publication as general ease-design rules.

## Media generation and state

### `fnf-sdk.md` — A/C/V

Portable lessons: server-only privileged calls; explicit upload contracts; typed job lifecycle;
confirmation before paid work; cost preview; declined confirmation as a first-class state; result
URL precedence; completed-without-preview handling; media/profile/workspace separation;
observability; retryable troubleshooting. Stateful editing and custom-reference training require
explicit session/style persistence. All endpoints, model catalogs, imports, adapters, and payload
shapes are Higgsfield-specific and must be verified.

### `fnf-react.md` — A/C

Portable lessons: one provider boundary, deliberate query keys and invalidation, polling only while
needed, optimistic state with reconciliation, real result rendering, request helpers, profile and
workspace separation, and a strict client/server boundary. Package APIs stay contextual.

## Auth, runtime, persistence, and operations

### `auth.md` — A/C

Adopt explicit auth-mode selection, server-side rechecks before privileged work, honest signed-out
states, protected-download handling, Blob URL cleanup, and signed URLs for large files. Keep
platform-owned routes, proxy behavior, and fnf interaction contextual. App-local identity must not
silently replace platform identity.

### `runtime-and-infra.md` — A/C/V

Adopt SSR safety, server-only boundaries, binary upload routes, guarded per-request bindings,
live-data warnings, additive migrations, Durable Object consistency reasoning, SEO infrastructure,
and security headers. Keep TanStack/Cloudflare wiring contextual. Verify current container support:
this file implies limitations while `containers.md` documents an active container contract.

### `containers.md` — A/C/V

Adopt one stable container identity per logical worker, patient cold boot, status-aware monitoring,
nonblocking long jobs, keepalive, deadlines, persistent result storage, large-file streaming, and
credential isolation. Keep Docker, Durable Object, token, R2, and platform APIs contextual. Verify
platform availability against current runtime docs.

### `website-flow.md` — A/C/R

Adopt a phased evidence trail: batched intake, committed concept, boards, asset system,
section-by-section build, focused motion pass, mechanical gate, then delivery. Adopt real backend
and persistence when the product actually requires them, SSR safety, additive migrations, and
explicit infra opt-in. Reject no-post-deploy visual review; ease-design requires evidence-based
visual qualification. Mandatory backend, imagery, or fixed deployment behavior remain contextual.

### `contest.md` — C

Documents contest readiness, eligibility, social links, metadata, publish behavior, and submission.
No general design rule. Transfer only the idea that distribution requirements should be known
before building.

## Cover and launch media

### `app-cover.md` — A/E/C

Adopt one coherent artwork source, safe zones, text-image separation, reference selection,
full-bleed generation followed by deterministic code composition, exact output validation, and
metadata wiring. Experiment with a cover-system benchmark. Keep Higgsfield masks, typography,
dimensions, and commands contextual.

### `cover-animator.md` — A/E/C

Adopt permission before credit-consuming generation and end-frame reveal for continuity with the
static cover. Derive motion beats from actual cover content and keep the static image as fallback.
Model, duration, CLI, and metadata fields remain contextual.

## Security and discoverability

### `security.md` — A/C/V/R

Adopt entry-point inventory, trust boundaries, asset classification, attacker model, concrete
threat scenarios, OWASP-oriented review, secure defaults, secret isolation, per-request state,
CSPRNG, timing-safe secret comparison, input validation, authorization, safe headers, CORS/cookie
discipline, promise completion, streaming, and findings with evidence and severity.

Important source risks:

- Reject any implication that an unguessable UUID removes the need for authorization. UUIDs reduce
  discovery; they do not prevent IDOR. Other parts of the same file correctly require authorization.
- Treat broad CSP examples (`https:`, `unsafe-inline`) as platform compromises, not a strong
  general baseline.
- Verify framework and Worker APIs at use time.
- Never ship secrets, auth state, or bindings through client props.

### `seo.md` — A/C/V

Adopt per-route metadata, canonical consistency, robots and sitemap routes, structured data aligned
with visible content, schema type selection, entity clarity, `sameAs` strategy, consistent NAP,
multi-entity graphs, direct-answer content, factual density, citation-friendly headings, topical
authority, and a fix/recheck audit loop. Keep framework snippets contextual. Treat word counts,
title lengths, engagement statistics, and performance claims as heuristics pending verification.
Dynamic JSON-LD requires safe serialization; static trusted examples are not a universal pattern.

## Completeness notes

- All 27 files in the pinned inventory have a ledger entry.
- All 516 headings fall under one of those file entries.
- Exact code snippets are not duplicated into ease-design; their behavioral contracts are captured.
- “Adopt” means eligible for implementation, not silently promoted to a hard rule. Taste claims
  still pass the world-class learning loop.
