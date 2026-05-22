# Persona Index & Auto-Selection Rules

The persona library is **curated design taste** — 23 personas grouped into 7 families.
Each persona is a fixed point in taste-space carrying a full aesthetic DNA
(typography, color, spacing, depth, borders, texture, interactions, layout,
anti-patterns).

This file is what the host model reads to **auto-select** the right personas for a
given design intent. It contains:

1. A compact lookup table across all 23 personas.
2. The keyword-scoring algorithm.
3. The industry-affinity mapping.
4. The diverse top-K selection logic.

Full per-persona DNA lives in `personas/<family>.md`. Read the family file once a
persona is selected.

---

## 1. Lookup Table — All 23 Personas

| Slug | Family | UI types | Density | Color mode | Trending | Keywords |
|---|---|---|---|---|---|---|
| `spatial-bento-geometry` | functional-saas | landing, dashboard, admin, app | compact | light | — | bento, grid, modular, spatial, dense, compartment, dashboard |
| `saas-aurora-minimal` | functional-saas | landing, dashboard, app, admin | comfortable | light | — | saas, clean, aurora, professional, modern, gradient, minimal |
| `data-dense-observatory` | functional-saas | dashboard, admin, app | compact | dark | — | data, dense, charts, metrics, numbers, dashboard, observatory |
| `industrial-blueprint` | editorial-minimal | dashboard, admin, documentation, app | compact | dark | — | blueprint, technical, precision, engineering, grid, mono, data |
| `quiet-luxury-editorial` | editorial-minimal | landing, portfolio, ecommerce | spacious | light | — | luxury, editorial, serif, whitespace, quiet, refined, minimal |
| `velvet-noir` | material-surface | landing, app, ecommerce, portfolio | comfortable | dark | — | dark, luxury, velvet, warm, gold, premium, elegant |
| `prismatic-glass` | material-surface | landing, app, portfolio | comfortable | light | — | glass, rainbow, prism, light, prismatic, spectrum, refraction |
| `haptic-claymorphism` | material-surface | landing, app, social | comfortable | light | — | clay, soft, tactile, rounded, pastel, friendly, playful |
| `liquid-glass` | material-surface | landing, app, dashboard, portfolio | comfortable | both | **yes** | glass, translucent, blur, apple, liquid, refraction, modern, premium |
| `semi-flat-depth` | material-surface | dashboard, admin, app, landing, documentation | comfortable | both | — | clean, professional, material, elevation, structured, system, functional |
| `modern-skeuomorphism` | material-surface | app, dashboard | comfortable | light | — | tactile, physical, material, warm, realistic, depth, premium |
| `dopamine-maximalism` | material-surface | landing, app, social, ecommerce | comfortable | light | **yes** | bold, colorful, fun, dopamine, vibrant, playful, energetic, squishy |
| `abyssal-void-tech` | immersive-cinematic | landing, dashboard, app | comfortable | dark | — | dark, void, glow, neon, bioluminescent, futuristic, space |
| `particle-atmosphere` | immersive-cinematic | landing, dashboard, app | comfortable | dark | **yes** | particle, dark, glow, futuristic, ai, developer, space, atmosphere |
| `motion-led-storytelling` | immersive-cinematic | landing, portfolio | spacious | both | — | cinematic, story, scroll, animation, dramatic, immersive, narrative |
| `kinetic-swiss-punk` | graphic-modernist | landing, portfolio | comfortable | both | — | swiss, typography, grid, punk, bold, primary, modernist |
| `kinetic-type-studio` | graphic-modernist | landing, portfolio | spacious | both | **yes** | typography, type, bold, minimal, editorial, poster, display, variable |
| `neo-frutiger-aero` | retro-digital | landing, app | comfortable | light | — | aero, glossy, aqua, nostalgic, vista, retro, optimistic |
| `iridescent-chrome` | retro-digital | landing, portfolio, ecommerce | comfortable | both | — | iridescent, holographic, chrome, metallic, reflective, y2k, glossy |
| `modular-system-layout` | product-marketing | landing, documentation, app, ecommerce | comfortable | both | — | modular, system, feature, grid, product, organized, scalable |
| `inclusive-clarity` | product-marketing | dashboard, admin, app, documentation, landing | spacious | both | — | accessible, readable, clear, contrast, inclusive, calm, reliable |
| `organic-mesh-gradients` | product-marketing | landing, app, portfolio | spacious | both | — | gradient, organic, mesh, flowing, startup, modern, colorful, fresh |
| `floating-composition` | product-marketing | landing, portfolio | spacious | both | — | floating, launch, startup, mockup, device, innovation, space, modern |

**Family counts:** material-surface 7 · product-marketing 4 · functional-saas 3 ·
immersive-cinematic 3 · editorial-minimal 2 · graphic-modernist 2 · retro-digital 2.
Total **23 personas / 7 families**.

**Legacy name:** "Ambient Glassmorphism" is a rename → resolves to `liquid-glass`.

**Field meanings:**
- **UI types** — one of: landing, dashboard, app, admin, ecommerce, portfolio,
  documentation, social. Used as the first-stage filter.
- **Density** — `compact` (maximize information per viewport), `comfortable`
  (balanced), `spacious` (whitespace-forward).
- **Color mode** — `light`, `dark`, or `both`. A `both` persona ships light + dark
  variants; a single-mode persona should not be forced into the other mode.
- **Trending** — flagged as 2026-hot; receives a small scoring bonus.

---

## 2. Auto-Selection Algorithm

Given a user prompt, a UI type, an optional industry, and a desired count, the system
selects a diverse set of personas. Reproduce this logic exactly when picking personas
without the binary.

### Stage 1 — Filter by UI type

Keep only personas whose `ui_types` includes the requested UI type. If the requested
UI type defaults and is `landing`, that is the default. **If the filter yields zero
personas, fall back to the full set of 23.**

### Stage 2 — Score each persona in the pool

For every persona in the filtered pool, compute a `score` (starts at 0):

| Rule | Condition | Points |
|---|---|---|
| **Direct keyword match** | A persona keyword appears as a substring of the lowercased prompt | **+3** per keyword |
| **Partial keyword match** | Keyword is longer than 4 chars and its stem (keyword minus last char) appears in the prompt — *only counted when the direct match failed for that keyword* | **+1** per keyword |
| **UI type match** | Persona `ui_types` includes the requested UI type | **+2** (once) |
| **Industry affinity — strong** | Persona keywords overlap the industry keyword list by **≥ 2** | **+5** |
| **Industry affinity — weak** | Persona keywords overlap the industry keyword list by **exactly 1** | **+2** (`floor(5/2)`) |
| **Trending bonus** | Persona is flagged `trending` | **+1** |

Notes:
- Matching is case-insensitive; the prompt is lowercased once up front.
- Partial match example: keyword `gradient` matches the prompt word `gradients`
  (stem `gradien` is a substring). Direct and partial are mutually exclusive per
  keyword — a keyword that matched directly does not also score a partial.
- Industry affinity is strong **or** weak, never both — `≥2` overlap gives +5,
  exactly `1` gives +2, `0` gives nothing.

### Stage 3 — Validity check

If **no** persona in the scored pool reaches the minimum threshold
(`score >= 3`), the keyword signal is too weak. Fall back to **family-diverse random
selection** (see §5) instead of returning low-confidence matches.

### Stage 4 — Diverse top-K

If at least one persona cleared the threshold, run `diverseTopK` (see §4) to pick the
final `count` personas, then return their full persona objects.

---

## 3. Industry → Keyword Affinity Mapping

When an industry is supplied, its keyword list is compared against each persona's
keywords to award the affinity bonus in Stage 2.

| Industry | Affinity keywords |
|---|---|
| `fintech` | dark, data, charts, premium, trust, numbers |
| `saas` | dashboard, metrics, clean, professional, grid |
| `healthcare` | accessible, calm, readable, trust, clarity |
| `ecommerce` | product, cart, conversion, grid, bright |
| `creative` | bold, expressive, dynamic, portfolio, visual |
| `education` | friendly, approachable, clear, colorful, warm |
| `ai-tech` | futuristic, dark, glow, particle, gradient |
| `social` | feed, card, engagement, vibrant, dynamic |
| `enterprise` | dense, data, professional, grid, reliable |
| `startup` | launch, modern, floating, gradient, fresh |

Overlap is measured against the persona's literal `keywords` array. Example:
`data-dense-observatory` has keywords `data, dense, charts, metrics, numbers, ...`;
for industry `fintech` (`dark, data, charts, premium, trust, numbers`) the overlap
is `{data, charts, numbers}` → 3 matches → **+5 strong affinity**.

An industry value not present in this table contributes **0** (no error).

---

## 4. `diverseTopK` — Family-Diverse Selection

Goal: return `maxK` personas that are both high-scoring **and** spread across
families, so the user sees genuinely different design directions rather than three
variations of one look.

1. Sort the scored personas by `score` **descending**.
2. **Pass 1 — diversity.** Walk the sorted list; add a persona only if its family has
   not been used yet. Stop when `maxK` is reached. This guarantees at most one
   persona per family until families run out.
3. **Pass 2 — fill.** If fewer than `maxK` were selected, walk the sorted list again
   and add the next highest-scoring personas regardless of family (skipping ones
   already chosen), until `maxK` is reached.

Result: the top slots are family-unique; remaining slots go to raw score. Ties keep
the input order from the sort (a stable descending sort by score).

---

## 5. Fallback — Family-Diverse Random Selection

Used when Stage 3 finds no persona above threshold (weak/empty keyword signal). It
ignores scores entirely and aims only for family spread:

1. Optionally exclude personas by name (case-insensitive).
2. If the available pool is `<= count`, return it as-is.
3. Group personas by family.
4. **Phase 1 — round-robin.** Shuffle the family list; pick one random persona from
   each family in turn until `count` is reached. This yields maximum family
   diversity.
5. **Phase 2 — top-up.** If still short, shuffle the remaining personas and add them
   (same family allowed) until `count` is reached.

This is also the routine used for general "give me some style options" requests with
no specific intent.

---

## 6. Scoring Constants (reference)

| Constant | Value | Meaning |
|---|---|---|
| `SCORE_KEYWORD_DIRECT` | 3 | Points for a direct keyword substring match |
| `SCORE_KEYWORD_PARTIAL` | 1 | Points for a stem/partial match on a >4-char keyword |
| `SCORE_INDUSTRY_MATCH` | 5 | Points for strong industry affinity (≥2 keyword overlap) |
| `SCORE_UI_TYPE_BONUS` | 2 | Points when persona supports the requested UI type |
| `SCORE_TRENDING_BONUS` | 1 | Points for a `trending` persona |
| `MIN_SCORE_THRESHOLD` | 3 | Minimum score for a persona to count as a real match |

Weak industry affinity (exactly 1 keyword overlap) awards `floor(SCORE_INDUSTRY_MATCH
/ 2)` = **2** points.

---

## 7. Worked Example

**Prompt:** `"a dark analytics dashboard with charts and live metrics"`
**UI type:** `dashboard` · **Industry:** `fintech` · **count:** 3

1. **Filter** by `dashboard` → keeps `spatial-bento-geometry`, `saas-aurora-minimal`,
   `data-dense-observatory`, `industrial-blueprint`, `liquid-glass`,
   `semi-flat-depth`, `modern-skeuomorphism`, `abyssal-void-tech`,
   `particle-atmosphere`, `inclusive-clarity`.
2. **Score** the filtered pool (highest first):
   - `data-dense-observatory` — direct: `charts`, `metrics`, `dashboard` (+9) ·
     UI type (+2) · fintech overlap `{data, charts, numbers}` ≥2 (+5) = **16**.
   - `particle-atmosphere` — direct: `dark` (+3) · UI type (+2) · trending (+1) ·
     fintech overlap `{dark}` =1 (+2) = **8**.
   - `abyssal-void-tech` — direct: `dark` (+3) · UI type (+2) · fintech overlap
     `{dark}` =1 (+2) = **7**.
   - `spatial-bento-geometry` — direct: `dashboard` (+3) · UI type (+2) = **5**.
   - `liquid-glass` — UI type (+2) · trending (+1) · fintech overlap `{premium}`
     =1 (+2) = **5**.
   - `industrial-blueprint` — UI type (+2) · fintech overlap `{data}` =1 (+2) = **4**.
   - `modern-skeuomorphism` — UI type (+2) · fintech overlap `{premium}` =1 (+2) = **4**.
   - `saas-aurora-minimal`, `semi-flat-depth`, `inclusive-clarity` — UI type only = **2** each.

   Note: `data` and `dense` are keywords of `data-dense-observatory` but neither is
   a substring of the prompt, and both are too short for a partial match — so they
   score nothing; only `charts`, `metrics`, `dashboard` land as direct matches.
3. **Threshold** — several personas clear `score >= 3` → proceed (no fallback).
4. **diverseTopK(3)** — sort by score descending, then Pass 1 adds one persona per
   not-yet-used family:
   - `data-dense-observatory` (functional-saas, 16) → add.
   - `particle-atmosphere` (immersive-cinematic, 8) → add.
   - `abyssal-void-tech` (immersive-cinematic, 7) → family already used → skip.
   - `spatial-bento-geometry` (functional-saas, 5) → family already used → skip.
   - `liquid-glass` (material-surface, 5) → add.
   Three families filled → done. (`industrial-blueprint`, score 4, is never reached
   — a lower score in an unused family still loses to a higher score.)

**Result:** `data-dense-observatory`, `particle-atmosphere`, `liquid-glass` — three
on-brief but visually distinct dark dashboard directions.
