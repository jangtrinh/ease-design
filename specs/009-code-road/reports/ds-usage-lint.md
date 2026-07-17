# The ENFORCEMENT linter — `ui ds-usage-lint`

Executor: Sonnet. Branch `feat/ds-usage-lint` off `main` (isolated worktree).

`ds context`'s ENFORCEMENT clause tells every host model: style exclusively with the
semantic tokens below — never hardcode colour/spacing/radius/shadow when a token covers
it. Nothing checked that. A hand-built probe (a page with `var(--totally-undeclared-token)`
plus hardcoded hex) passed all four existing floors (taste-lint, validate-layout,
content-lint, a11y-lint) with zero errors. This is that gate.

---

## 1. What shipped

- `src/core/ds-usage-lint.ts` (166 lines) — the pure checker. `lintDsUsage(html, {
  declaredVars })` → `{findings, errorCount, warningCount, hardcodedColorCount,
  offSystemTokenCount, undeclaredTokenCount}`, findings shape `{checkId, severity,
  message, line}` (Art II contract, matches taste-lint.ts exactly).
- `src/commands/ds-usage-lint.ts` — `ui ds-usage-lint <file.html> --dir <project>
  [--json]`. Loads `<dir>/design/design.tokens.json` the same way `ds a11y` does
  (`resolveTokens(parseTokenFile(...))`), then derives the DS's declared CSS var
  names via a new `declaredCssVarNames()` export added to `src/core/token-emit.ts`
  (reuses the SAME composite-expansion logic `emitCss`/`emitTailwind` already use —
  no new naming convention, no drift risk).
- Registered in `src/cli.ts` (COMMANDS map) and `src/core/command-signatures.ts`
  (`ds-usage-lint` entry, flags `--dir`, error codes `BAD_ARG/FILE_NOT_FOUND/
  READ_ERROR/DS_NOT_FOUND/BAD_JSON`) — the shared collision files, touched with
  one clean addition each.
- Tests: `tests/ds-usage-lint.test.ts` (pure-function, 10 cases) +
  `tests/cmd-ds-usage-lint.test.ts` (CLI E2E, 10 cases, including the four
  error paths and `--help`).

### The algorithm (as specced, verified against real data — see §3)

1. **Strip token-declaration blocks** before checking. Reused, not reinvented:
   `css-selector-blocks.ts`'s `computeSelectorBlocks` (brace-nesting scan, already
   restricts to `<style>` regions on HTML input) + `css-selector-mode.ts`'s
   `classifySelector` (the SAME base/mode table `css-token-ingest.ts` already uses
   for `:root`/`@theme`/`[data-theme=...]`/`.dark`). A block classifies as a
   declaration block iff `classifySelector(selector).kind !== "unmapped"`. Their
   custom-property NAMES are still harvested into a `pageDeclaredVars` set (for
   the off-system check); their bodies are excluded from both remaining checks.
2. **`undeclared-token`** (error) — `var(--x)` where `--x` is neither a DS token
   nor declared anywhere on the page. Broken reference.
3. **`off-system-token`** (warning) — `var(--x)` the page declares itself
   (in a decl block) but the DS lacks. Never fails the build.
4. **`hardcoded-color`** (error) — hex (`#rgb`/`#rrggbb`/`#rrggbbaa`), `rgb()`/
   `rgba()`, or `hsl()`/`hsla()` literal in one of the 10 colour-bearing
   properties, outside a decl block.
5. Both HTML `<!-- -->` and CSS `/* */` comments are blanked (same-length, offsets
   preserved — mirrors `taste-lint.ts`'s convention) before any scan, so a
   commented-out reference or a mention inside a doc-comment never trips a finding
   (verified live — see §3, the stray `var(--token-name)` in out-A's own comment).
6. v1 is colour-only by design; a hardcoded `50%` radius or `1px` border is never
   flagged (test: "v1 is colour-only" case).

### Honesty floor (Art VIII) — exact wording used

Module header and the command's `--help` both say: this proves *token usage in the
page's own CSS* only — it cannot prove computed/rendered colour, gradients, or
inline-SVG fills it never parsed. The report line is literally `"N hardcoded colour(s),
M off-system token(s), K undeclared reference(s)"` — never "on-system", never a
conformance claim.

### A scope decision made without asking (flagging it, not hiding it)

The nine other lint commands (`a11y-lint`, `taste-lint`, …) call `withOutcome` to
append a `lint_run` memory event, but that call site is gated by a **closed
registry** (`src/core/outcome-registry.ts`'s `OUTCOME_BEARING`) whose own paired
test (`tests/autorecord-wiring.test.ts`) hardcodes `toHaveLength(9)` and the literal
9-command list, captioned "spec 006 locked as outcome-bearing." Neither that file nor
that test was in the read-first list or named as a shared collision point (only
`command-signatures.ts` was). Wiring `ds-usage-lint` into it would mean editing a
test whose own docstring calls it "locked" — a call outside this task's scope per
Art V (stop and report, don't improvise). **`ds-usage-lint` does NOT call
`withOutcome` — it does not append a memory event.** Flagging as an open question
below.

---

## 2. Four gates + the probe test

```
npm run typecheck   → clean
npm run lint         → clean
npm run build        → dist/cli.js built, ds-usage-lint listed in `ui --help`
npm test              → 138 files / 2090 tests passed, 4 skipped (pre-existing skips)
node dist/cli.js knowledge check --json → 0 errors, 0 warnings
```

**The canonical probe** (`tests/ds-usage-lint.test.ts` + `tests/cmd-ds-usage-lint.test.ts`,
both pure and CLI layers):

```html
.card { color: var(--totally-undeclared-token); background: #ff0000; }
```

→ `undeclared-token` (error) + `hardcoded-color` (error), `errorCount: 2`, exit 1.
Both the mechanism (pure function) and the wiring (CLI, `--dir`/`--json`) are pinned.

Also pinned: the declaration-block strip (`:root` with the DS pasted in + component CSS
using only `var(--dsToken)` → 0 findings, exit 0 — the exact out-A.html shape) and the
off-system-token case (`--surface-card` declared in the page's own `:root`, DS lacks it
→ warning only, exit 0, message names the token and points at `ui ds change-token`).

---

## 3. Live numbers: out-A.html vs the claimed 2 hardcoded / 14 off-system

Ran against the real fixture:
`ui ds-usage-lint out-A.html --dir onboard-all/dana-desktop --json`

```
hardcodedColorCount: 2
offSystemTokenCount: 61   (14 DISTINCT token names, 61 total occurrences)
undeclaredTokenCount: 0
errorCount: 2   warningCount: 61
```

**Hardcoded colours: exactly 2, matches the claim exactly.** Both are `#FFFFFF` —
line 401 `.provider-badge { color: #FFFFFF; }` and line 532 `.switch input::before {
background: #FFFFFF; }`. Real, not template noise.

**Off-system tokens: 14 distinct names, matches the claim on distinct-name count —
but 61 total findings, not 14.** The 14 distinct names are exactly:
`--border-c`, `--border-strong-c`, `--border-subtle-c`, `--surface-card`,
`--surface-card-hover`, `--surface-input`, `--surface-nav-active`, `--surface-page`,
`--surface-sidebar`, `--text-body-c`, `--text-faint-c`, `--text-heading-c`,
`--text-muted-c`, `--text-placeholder-c` — a whole second semantic-alias layer the
page declares in its own `:root` (`--surface-card: var(--color-surface-elevated);`,
etc.) that never made it into the DS's own token file. This linter reports every
**usage site** as its own finding (same convention as every other lint command in
the repo — a11y-lint/taste-lint report one finding per occurrence, not per distinct
issue), so the same 14 names recur across their ~61 use sites in the page's CSS. If
"14" was meant as distinct-token count, both numbers agree; if it was meant as total
findings, mine is higher because it counts every site a fix touches, not just the
vocabulary of names. Reporting both rather than silently picking one (per this
task's own instruction not to tune the count to match a claimed number).

**Undeclared tokens: 0** — no ghost references in the real fixture (the ghost-token
case is a synthetic probe, not a defect the real page happens to have).

Bonus (not requested, cheap to run): `out-B.html` against the same DS →
`hardcodedColorCount: 0, offSystemTokenCount: 244, undeclaredTokenCount: 0`. Not
investigated further — out of this task's scope, noting only that it exists as a
second real data point if useful later.

---

## Unresolved questions

1. Should `ds-usage-lint` be wired into the memory auto-record registry
   (`outcome-registry.ts`)? It currently is not (see §1's scope decision) — the
   registry's own test calls itself "locked," and neither file was named in this
   task's read-first list or hard constraints.
2. Should `off-system-token` findings dedupe to one-per-distinct-name (closer to
   the owner's "~14" prior) instead of one-per-occurrence (current behaviour,
   consistent with every other lint command in the repo)? Occurrence-level seems
   more actionable (every fix site is visible) but the counts read very differently
   at a glance (61 vs 14) — flagging the tension rather than picking silently.
3. `html[data-theme="dark"]` (a compound tag+attribute selector, present in
   out-A.html's own semantic-alias layer) is NOT recognized as a declaration block
   by the shared `classifySelector` table (which only matches bare `[data-theme=...]`
   or `.dark`, not `html[data-theme=...]`) — this pre-existing gap in the shared
   convention did not cause a false finding in out-A.html (verified: the block only
   contains custom-property declarations and DS-var references, neither of which
   trips a check), but a page whose dark-mode override block used a raw hex or an
   undeclared var inside that specific selector shape would be scored, not skipped.
   Not fixed here per Art IV (fix at the shared layer, not where it surfaces) —
   flagging for `css-selector-mode.ts`'s owner rather than patching it inline.
