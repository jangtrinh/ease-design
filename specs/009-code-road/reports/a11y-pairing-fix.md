# F11 fix — `ds a11y` foreground-role synonyms (dana over-pairing)

**Branch**: `fix/a11y-pairing-synonyms` (off `main` @ `29bb90f`)
**Files changed**: `src/core/token-pairs.ts` (65 lines), `tests/token-pairs.test.ts` (+8 tests)
**`ds-a11y.ts` untouched** — mode selection already branches purely on
`inferForegroundPairs(...).length > 0`, so extending the inference function alone flips the mode;
no change needed there.

## Root cause (confirmed against dana's real tokens)

dana declares 0 tokens named `-foreground`, so `inferForegroundPairs` found nothing and
`ds-a11y` fell back to the `inferred` cartesian mode (every color-typed "text-ish" token ×
every "surface-ish" token). But dana DOES declare the same paired-contrast intent under a
different suffix word: `badge-danger-text` + `badge-danger-bg`, `semantic-error-text` +
`semantic-error-bg`, `interactive-primary-text` + `interactive-primary`, etc. — 13 such pairs,
confirmed by reading `design/design.tokens.json` directly.

## The fix

`FOREGROUND_RE` in `src/core/token-pairs.ts` extended from matching only the literal
`-foreground` suffix to matching the counted synonym set from
`specs/009-code-road/reports/role-synonym-dictionary.md`'s foreground row: `foreground | text |
fg | content | ink`.

```
const FOREGROUND_RE = /^(.+?)[.\-/](?:foreground|text|fg|content|ink)$/i;
```

No other logic changed. The existing base-stripping + same-group-sibling lookup (unchanged)
already enforces the safety constraint by construction: for a match like `badge-danger-text`,
the base extracted is `badge-danger`, and the function only looks for `badge-danger-background /
-bg / -surface / -base` — never any other role's surface. A role with a foreground-shaped token
but no matching surface (`badge-light-text`, which only has `badge-light-border`) falls through
to no pair, per spec.

## Tests added (`tests/token-pairs.test.ts`)

8 new cases under `inferForegroundPairs — foreground synonyms`:
1. Real dana pair resolves: `badge-danger-text` ↔ `badge-danger-bg`.
2. **Safety test (explicit)**: `badge-danger-text` + `badge-neutral-bg` present together →
   asserts the pair list contains ONLY same-role pairs and explicitly
   `.not.toContainEqual(["badge-danger-text", "badge-neutral-bg"])`.
3. `badge-light-text` (no matching `-bg`, only `-border`) → no pair (real dana shape).
4. `-fg` synonym pairs correctly (`alert-fg` ↔ `alert-bg`).
5. `-ink` synonym pairs correctly (`panel-ink` ↔ `panel-bg`).
6. `-content` synonym: proves the real dana token `color.surface-content` (itself a surface,
   coincidentally ending in the synonym word) does NOT misfire into a stray pair when no
   `surface-content-bg` sibling exists, while a genuine `callout-content`/`callout-bg` pair still
   resolves — guards the specific false-positive risk this suffix introduces.
7. **Regression guard**: a DS mixing shadcn's real `{role}-foreground` convention (`color.primary`
   / `color.primary-foreground`) alongside a dana-style `-text`/`-bg` pair resolves both
   correctly in one call — proves the synonym extension didn't break shadcn-convention DSs.
8. Bare-token shape: `interactive-primary` + `interactive-primary-text` (base token itself is the
   surface, real dana shape) resolves via the existing branch-1 lookup.

All 8 new + all 14 pre-existing `token-pairs.test.ts` cases pass. Full suite: 136 files / 2080
tests pass (4 skipped, pre-existing).

## Live dana-desktop result (measured, not simulated)

```
node dist/cli.js ds a11y --dir <dana-desktop> --json
```

| | Before | After |
|---|---|---|
| mode | `inferred` (cartesian fallback) | `paired` |
| checked pairs | 1540 | 13 |
| checked state-pairs | 0 | 4 |
| "below AA" failures | 1011 | **1** |

The 13 declared pairs cover all of dana's real `{role}-text`/`{role}-bg` and
`{role}`/`{role}-text` roles: badge-danger/default/info/neutral/purple/success/warning (7),
semantic-error/info/success/warning (4), interactive-primary/secondary (2). `badge-light-text`
(no matching `-bg`) correctly emits nothing, matching the "fall through, don't cartesian-fill"
rule.

### True positive remaining — NOT suppressed, reported

```
color.badge-info-text on color.badge-info-bg — 4.1:1 (AA-large); fails normal-text AA
```

`badge-info-bg`/`badge-info-text` is a real declared pair that fails AA-normal (4.5:1 required,
measures 4.1:1 — passes only the AA-large 3:1 threshold). This is a genuine contrast bug in
dana's design system, not a false positive — it should be reported to dana's owner, not fixed or
hidden here.

## Gates (all green)

- `npm run typecheck` — clean
- `npm run lint` — clean (`eslint src tests`)
- `npm run build` — clean, `dist/cli.js` 820.09 KB
- `npm test` — 136 test files, 2080 tests passed, 4 skipped (pre-existing)
- `node dist/cli.js knowledge check` — `0 findings`

## Unresolved questions

None — root cause confirmed against real dana tokens, fix scoped to `token-pairs.ts` only, live
before/after measured on the exact fixture path given.
