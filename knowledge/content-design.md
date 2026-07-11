# Content design — voice, tone, and the microcopy floor

Copy is half the interface. This is the *thinking* (voice + tone + patterns); the deterministic floor
is `ui content-lint`. The split mirrors taste: a `knowledge/` brain + a low-false-positive lint +
a curator judgment. What the linter can't decide — voice fit, wit, brand — stays a model call.

## Voice vs tone (every serious system agrees)
- **VOICE** = the brand's constant personality — *what* is said. Pinned per persona.
- **TONE** = how voice flexes by situation — *how* it's said. Varies by the user's emotional state.

### Voice dimensions (spectrums; the persona pins the value)
`formality` (formal↔casual) · `warmth` (objective↔friendly) · `humor` (serious↔playful) ·
`directness` (elaborate↔terse) · `authority` (deferential↔bold) · `enthusiasm` (measured↔energetic).

### Voice constants (NOT tunable — enforced as defaults)
Active voice · plain language, no jargon · positive framing · second person "you" ·
**start actionable copy with a verb** · sentence case. No persona turns these off.

## The tone-by-situation matrix (the load-bearing artefact)
Rows = situation + likely user state; the tone shifts per row. **The one hard, checkable law:
humour and enthusiasm track INVERSELY to user stress.**

| Situation | User state | Tone |
|---|---|---|
| Success / completion | satisfied | warm, short, celebrate once |
| Neutral task / form | focused | plain, direct, verb-first |
| Onboarding / first-run | unsure | teach the *why*, encouraging |
| Loading / waiting | impatient | honest about duration |
| Empty state | lost | orient + one CTA (verb) |
| Warning | cautious | calm, state the consequence |
| **Error (recoverable)** | frustrated | plain, blame-free — **identify + explain + fix** |
| **Destructive / data-loss / billing / security** | anxious | serious, precise — **humour = 0** |
| Permission request | wary | state the value exchange plainly |

## Error-message standard (NN/g + GOV.UK + WCAG 3.3.1/3.3.3)
Identify what went wrong · explain in human language (never a bare code) · say how to fix it ·
never blame the user · place it at the source. One good sentence usually satisfies 3.3.1 + 3.3.3.
Add an error-summary at the top of a failed form.

## i18n readiness (decide at design time)
Budget +35% for German expansion (fixed-width text that fits English may overflow) · no concatenated
strings · ICU MessageFormat for plurals, never `item(s)` · logical properties for RTL · locale-aware
date/number/currency · no text baked into images.

## The deterministic floor — `ui content-lint`
Ships ONLY low-FP rules (microcopy is short, imperative, fragmentary — full prose linters and
readability formulas misfire and are deliberately excluded):
- **errors:** `lorem-ipsum`, `placeholder-copy` (unfinished copy).
- **warnings:** `click-here-link` (WCAG 2.4.4) · `error-code-alone` · `exclamation-overload` ·
  `insensitive-terms` (whitelist/blacklist/master-slave only) · `plural-s-hack` (`item(s)`) ·
  `text-in-image` · `all-caps-shout` (text-content caps; taste-lint owns CSS-transform caps).

## How the curator scores content (without becoming a prose critic)
1. **Floor (deterministic):** `ui content-lint` = 0 errors.
2. **Coverage (deterministic):** every interactive/data component has copy for its `empty`/`error`/
   `loading` states (`component-design.md`'s state list).
3. **Excellence (model, bounded):** score **tone-cell conformance** with cited evidence — name the
   cell: *"this is a destructive-action confirmation → humour must be 0; the copy has a pun and a `!`
   → fail."* Anchor every score to a matrix row; never free-form copyediting.

Sources: Mailchimp Voice & Tone; Shopify Polaris; Atlassian; Salesforce Lightning; GOV.UK; NN/g
error-message guidelines; W3C WCAG 3.3.1/3.3.3; ICU MessageFormat.
