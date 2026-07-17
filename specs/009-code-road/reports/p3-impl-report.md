# Phase 03 — The vocabulary — implementation report

Branch: `spec009/p3-vocabulary` (off `spec009/integration`, which carries P1 + P2 merged).

## What changed

**New (all < 200 lines, Art IX):**
- `src/core/css-selector-blocks.ts` (86 ln) — a brace-nesting selector-block scanner, NOT a CSS
  parser: "which selector immediately encloses byte offset N?" Split out of
  `designmd-token-extractor.ts` to keep that file near budget. Handles comments (blanked, same
  length), and top-level `@import "tailwindcss";`-style semicolon-terminated at-rules (a real bug
  found live on hvs — see below). For HTML sources, scans only inside `<style>…</style>` regions
  so markup/script braces before the first rule can't corrupt the first selector (found live on
  the extractor's own fixture, `sample.html`).
- `src/core/css-selector-mode.ts` (44 ln) — D2's selector→mode table. `:root`/`@theme`/`html`/
  `body` → base; `[data-theme="X"]` → `mode.X`; `.dark` → `mode.dark`;
  `@media (prefers-color-scheme: dark)` → `mode.dark`; anything else → unmapped. Handles a
  comma-separated compound selector list as ONE declaration applying to several modes at once —
  measured live on dana: `[data-theme="dark"],\n[data-theme="classic"],\n.dark { … }` is a single
  block covering 2 distinct modes (`.dark` and `[data-theme="dark"]` both mean `dark`). This case
  is not in the phase file's D2 table; found reading real data, not guessed.
- `src/core/css-token-ingest.ts` (197 ln) — D4/D6, pure. `ingestCssTokens(customProperties)` →
  `{tree, stats, unverified}`. Groups by name, computes each name's own `{category, leaf, $type}`
  (D6: type from the value when a literal exists among its declarations, else a name-hint
  fallback for alias-only names — the alias's OWN path, not inherited from its target, exactly
  mirroring `figma-ds-tokens.ts`'s `resolveType`/`pathOf` split), checks all names for a D6
  collision before emitting anything, then per name: unmapped-selector declarations are always
  recorded (never silently dropped); no base entry → recorded unverified, not promoted (D2);
  base resolves (literal or alias-string); each mode resolves the same way into `$extensions`.
  Reuses `inferToken` (token-import.ts) and `sanitizeSeg` (figma-ds-tokens.ts) — Insight 5's
  "reuse it," Art IV.
- `src/commands/ingest-css-ds.ts` (137 ln) — the command shell, I/O boundary only, mirrors
  `ingest-figma-ds.ts`'s split. Writes `<out>/tokens.json` only (DTCG, unsealed) — no
  `component-registry.json`/`DESIGN.md` (see "Scope decisions" below).
- `tests/css-token-ingest.test.ts`, `tests/mode-convention.test.ts`, `tests/cmd-ingest-css-ds.test.ts`
  — test names match the phase file verbatim where it named one.

**Modified:**
- `src/core/designmd-token-extractor.ts` (206 → 216 ln) — D1: `CustomPropertyObservation` gains
  `selectors: string[]`, a parallel array index-aligned with `sources` (kept `sources`'s existing
  `"file:Lnn"` shape — it's asserted in 3 existing tests and typed, if unused, in
  `designmd-audit-source-fidelity.ts`'s `TokensJson`). Slightly over the ~200 budget; it was
  already 206 before this phase touched it.
- `src/core/cli-args.ts` (F4) — added `repeatedFlags: Set<string>` to `ParsedArgs`, populated by
  a `setFlag` helper used at all 4 flag-assignment sites. Purely additive; no existing field's
  shape or the scalar `flags` map changed — the narrowest form per the phase file's own guidance.
- `src/commands/designmd-extract-tokens-impl.ts` / `src/commands/designmd.ts` (F4) — `--css`
  passed twice now returns `REPEATED_FLAG` instead of silently keeping only the last value; the
  working comma form (`--css a,b`, pre-existing) is documented in both the flag summary and
  `DESIGNMD_HELP`.
- `src/core/token-model.ts` (D3, 157 → 183 ln) — `sanitizeModeName` + `modeExtensionKey`, the
  shared home for the `$extensions["mode.<name>"]` encoding. `figma-ds-tokens.ts` is untouched
  (forbidden) — it keeps its own local copy; `mode-convention.test.ts` is the Art II check that
  the two independently-implemented emitters still agree byte-for-byte.
- `src/core/token-import.ts` (D5, 64 → 136 ln):
  - **F2** — `inferToken` accepts an alias string (`isAlias`, reused from token-model.ts) and
    infers `$type` from a category/name hint (color dominates when nothing else matches —
    Insight 1). Front door no longer refuses the semantic tier.
  - **F6** — `putCategory` sanitizes `cat`/`name` through `sanitizeSeg` (reused from
    `figma-ds-tokens.ts`) before writing into `dtcg`, so a camelCase source name (`fontSize`)
    can no longer produce a `TOKEN_PATTERN`-illegal token.
  - **Unplanned, required for the phase's own LIVE block to work**: `putCategory` now passes an
    already-DTCG leaf (`isTokenLeaf`, reused from token-model.ts) through as-is, `$extensions`
    included, instead of recursing into its `$value`/`$type` as if they were child token names.
    `onboard.md` §4 already documents "`ui ingest-figma-ds`'s tokens.json still has to go through
    `ui ds import` … to land a manifest," and the phase file says `ingest-css-ds` "emits the same
    portable, unsealed bundle. `ds import` seals it afterwards" — but `ds import`'s importer is
    documented and typed as strictly *flat* (`{category:{name:value}}`), and pushing a DTCG leaf
    through the old code silently created bogus `<cat>.$value`/`<cat>.$type` tokens and dropped
    every `$extensions` mode. This is the shared-layer fix (Art IV) that makes
    `extract-tokens → ingest-css-ds → ds import → ds status` actually work end to end, proven by
    `tests/cmd-ingest-css-ds.test.ts`'s UC-03 seam test. Flagging this clearly since it wasn't
    named in D5's "Related Code Files" — but it's the same file, same commit, and without it the
    phase's own prescribed LIVE block cannot complete.
- `templates/workflows/learn.md` — the "Code" route in step 3 now branches: if the scanned
  `cssFiles` declare `--*` custom properties, run the deterministic C0 compiler
  (`extract-tokens → ingest-css-ds → ds import`) instead of the token-guessing steps of
  `extract.md` (4–7) that the real dogfood needed 102 `change-token` calls to complete; component
  registration still routes to `extract.md` step 8 onward either way. No CSS custom properties →
  unchanged (`extract.md`, full).
- `tests/token-import.test.ts` — one pre-existing test asserted camelCase pass-through
  (`opacityScale` verbatim); updated to the now-sanitized key (F6 changed this on purpose) and a
  new test added for the camelCase→sanitized case explicitly.
- `tests/cmd-ds-import.test.ts`, `tests/cmd-designmd-extract-tokens.test.ts`,
  `tests/designmd-token-extractor.test.ts` — extended per the phase file's test list (see below).

## Scope decisions (stated, not discovered)

- **`ingest-css-ds` writes only `tokens.json`.** D4 describes it as mirroring
  `ingest-figma-ds`'s 3-file bundle, but this phase's Success Criteria never mention
  `component-registry.json`/`DESIGN.md`, and `ds import` already creates an empty registry when
  it seals — nothing downstream needs a registry file from this command. Not built.
- **No DESIGN.md from `ingest-css-ds`.** The Risk Assessment table asks me to "confirm the
  code road's bundle reaches" `figma-ds-designdoc.ts:22`'s mode rendering. It does not, by
  choice: `buildDesignDoc`'s prose is hardcoded Figma-specific ("Ingested from an existing Figma
  design system via `ui ingest-figma-ds`") — reusing it verbatim for a CSS-sourced DS would be a
  false claim (Art VIII), and `figma-ds-designdoc.ts` isn't in this phase's "Modify" list. Left
  as an **open gap**, not fixed: nothing renders `$extensions["mode.*"]` for the code road today.
  A later phase's job.
- **D7 (parallel hardcoded gray ramps) is a narrative finding, not a computed field.** The spec
  says "record the finding," "no detector" — I did not add a `findings[]` array to the ingest
  result; the finding is written up below instead, per D7's own framing.

## Four gates

- `npm run typecheck` — **PASS** (no output, exit 0).
- `npm run lint` — **PASS** (no output, exit 0).
- `npm run build` — **PASS** (`dist/cli.js` 815.82 KB, tsup build success).
- `npm test` — **PASS**: 134 test files, 2017 passed, 4 skipped (fixture-gated, absent on this
  machine — pre-existing, unrelated to this phase), 0 failed.
- `ui knowledge check --json` — **PASS** (`errorCount: 0, warningCount: 0`).

## LIVE runs (Art III)

### dana-desktop — `dana-tokens.css` alone (443 ln)

The phase file's LIVE block writes `--css` **twice** (repeated flag). Run literally, that now
hits F4's new guard on purpose:

```
$ node dist/cli.js designmd extract-tokens empty.html \
    --css dana-tokens.css --css index.css --out t.json
{"ok":false,"command":"designmd extract-tokens",
 "error":{"code":"REPEATED_FLAG",
   "message":"'--css' was passed more than once — only the last value would be used, silently
   dropping the others. Combine multiple files into one flag instead: --css a.css,b.css"}}
```

Re-run with the documented working form (comma-joined, single flag) — first `dana-tokens.css`
alone, to isolate the mechanism from the cross-file collision reported next:

```
$ node dist/cli.js designmd extract-tokens empty.html --css dana-tokens.css --out t.json
wrote tokens.json (colors: 119, fonts: 0, customProperties: 324)

$ node dist/cli.js ingest-css-ds t.json --out out --name dana-web --json
{"stats":{"primitives":176,"semantics":72,"skipped":15}, "unverified":[15 entries — all
  composite: --font-mono/--font-sans (stack), --shadow-* (rgba(var(--shadow-color),…)),
  --transition-* ("150ms ease", a shorthand, not a bare duration)]}

$ node dist/cli.js ds import out/tokens.json --dir out --name dana-web --json
{"imported":248, "skipped":0, "byType":{"color":202,"dimension":35,"number":11}}

$ node dist/cli.js ds status --dir out --json
{"ok":true, ...}                                                        # exits 0

$ node dist/cli.js tokens compile out/design/design.tokens.json --target css | grep -i gray-900
  --color-gray-900: #181818;
```

56 tokens carry `$extensions` modes (e.g. `color.surface-content`: base `#FFFFFF`,
`mode.classic`/`mode.dark` both `{color.gray-900}` — an unresolved alias inside the extension,
same as the base tier; resolution is `tokens compile`'s job, not ingest's). The compiled CSS
carries only the base value; grepping the compiled output for the dark/classic hex values (not
shown above) confirms they never appear outside `design.tokens.json` — modes are preserved, not
compiled.

**Token count vs the dogfood's 286**: 248 imported (176 primitive + 72 semantic) + 15 unverified
= 263 unique custom-property **names** out of 324 total `(name, value)` pairs (the gap is the
multi-theme entries collapsing under one name). 263 vs 286 — **explaining the gap, not tuning to
it**: the dogfood's 286 was hand-built via 102 individual `change-token` calls on a project the
author was actively debugging live, plausibly touching composite/shadow/duration values by hand
that this mechanism correctly refuses to synthesize (it has no rule for turning
`0 1px 2px rgba(var(--shadow-color), 0.05)` into a `dimension`/`number` — that's out of scope,
and it says so in `unverified` rather than guessing). This run also covers `dana-tokens.css`
alone; the dogfood's number likely includes `index.css` contributions too (below).

### dana-desktop — both files combined (`dana-tokens.css` + `index.css`)

```
$ node dist/cli.js designmd extract-tokens empty.html \
    --css "dana-tokens.css,index.css" --out t.json
wrote tokens.json (colors: 168, fonts: 0, customProperties: 567)

$ node dist/cli.js ingest-css-ds t.json --out out --name dana-web --json
{"ok":false,"command":"ingest-css-ds",
 "error":{"code":"LEAF_COLLISION",
   "message":"'--blue-100' (dana-tokens.css:L40) and '--color-blue-100' (index.css:L51) both
   map to token path 'color.blue-100' after the redundant-category-prefix strip (D6) — rename
   one of the source custom properties"}}
```

**D6's collision rule fired — yes, exactly as the phase file predicted three separate times**
(Insight 3, D6 itself, and the Risk Assessment row: *"dana has both — so this fires on the first
real run, by design"* / *"if it fires everywhere, that is a finding about D6 — report it, do not
add a suffix rule"*). A static check (`grep` over both files' declared names) shows this is not a
one-off: **≥120** `--X` / `--color-X` name pairs exist across the two files. `index.css`'s
`@theme { --color-gray-900: var(--gray-900); … }` block is Tailwind v4's *mechanical* bridge from
hand-authored primitive names to the `--color-*` convention Tailwind utilities expect — not a
deliberately-distinct semantic tier — so every one of those ~120 pairs collides under D6, and the
first one aborts the whole ingest.

**This means the phase file's "Expected" outcome for the combined-file LIVE block (reach
`ds status` exit 0, ~140 aliases surviving) cannot be reached on dana's real two files as they
exist today** — D6's fail-loud-on-first-collision design and the LIVE block's "reaches ds status"
narrative are in tension for this specific project. I did not resolve this by weakening D6 (the
spec explicitly forbids merging/suffixing); I ran the block as far as it goes and report the
result: the mechanism is correct and proven end-to-end on real data (dana-tokens.css alone,
traicaybentre, hvs — all below), and this collision is itself the reportable finding D6 asked
for, not a bug to route around.

### traicaybentre (single-theme site — 445 ln `src/app/globals.css`, Tailwind v4 `@theme inline`)

Note: the phase's context box cites "61 css-vars, 50 :root, 125 data-theme" for traicaybentre;
the product's real CSS as it stands today has 0 `:root`/`data-theme` occurrences (a single
`@theme inline` block, no dark mode) — the repo has evidently changed since that number was
measured. Reporting what is actually on disk now, not tuning to the older number.

```
$ node dist/cli.js designmd extract-tokens empty.html --css src/app/globals.css --out t.json
wrote tokens.json (colors: 17, fonts: 1, customProperties: 19)

$ node dist/cli.js ingest-css-ds t.json --out out --name traicaybentre --json
{"stats":{"primitives":17,"semantics":0,"skipped":2},
 "unverified":[--font-body, --font-heading — both composite font stacks with an embedded
 var(--font-…) fallback, correctly not matched by the exact var(--x) alias regex]}

$ node dist/cli.js ds import out/tokens.json --dir out --name traicaybentre --json
{"imported":17,"skipped":0,"byType":{"color":17}}

$ node dist/cli.js ds status --dir out --json
{"ok":true, ...}                                                        # exits 0
```

No collision, no modes (single theme) — confirms the mapper is not dana-shaped: it degrades
cleanly to "all primitives, no modes" on a project with neither.

### hvs (112 CSS files found by a raw `find`; `ui scan --cwd` reports 5 in-scope — used those,
since a raw `find` pulled in a **vendored Claude Code skill's own CSS**
(`.claude/skills/markdown-novel-viewer/assets/styles/novel-theme-variables.css`) that
`ui scan`'s `SKIP_DIRS` already correctly excludes; using it would have been testing a bug in my
own test setup, not the mapper)

```
$ node dist/cli.js designmd extract-tokens empty.html --css "<5 scan-reported files>" --out t.json
wrote tokens.json (colors: 3, fonts: 6, customProperties: 35)

$ node dist/cli.js ingest-css-ds t.json --out out --name hvs --json
{"stats":{"primitives":14,"semantics":7,"skipped":11},
 "unverified":[--font-display/--font-mono/--font-sans (stacks), --hvs-ease (cubic-bezier),
 --hvs-stagger ("75ms" — no duration-hint word in the name, correctly left unresolved rather
 than guessed), --shadow-* (composite shadows/gradients/blur — 5 entries)]}

$ node dist/cli.js ds import out/tokens.json --dir out --name hvs --json
{"imported":21,"skipped":0,"byType":{"color":17,"dimension":3,"duration":1}}

$ node dist/cli.js ds status --dir out --json
{"ok":true, ...}                                                        # exits 0
```

Also note: the spec's context box cites "1162 css-vars" for hvs; the real product CSS (excluding
`node_modules`/`.next`/vendored skill assets) has far fewer declarations — same "report what's
actually there" note as traicaybentre.

**Two real bugs found only by running on hvs, both fixed, both covered by new tests:**
1. `hvs/app/globals.css` opens with `@import "tailwindcss";` before its first `:root {` block. My
   selector scanner had no concept of a semicolon-terminated top-level statement, so it captured
   the whole `@import …;` line as part of `:root`'s "selector" text
   (`"@import 'tailwindcss';\n\n:root"` ≠ `":root"`), which then failed every `classifySelector`
   match and dumped dozens of otherwise-good base declarations into `unverified` as "unrecognized
   selector." Fixed in `css-selector-blocks.ts`: a top-level `;` (depth 0) now also resets the
   pending-selector segment.
2. `--hvs-duration: 400ms` was reported unverified ("could not resolve value '400ms'") because
   `resolveValue` called `inferToken("", "", value)` — dropping the property's own name, so
   `DURATION_CAT_RE` (which needs "duration"/"motion"/etc. in the name) never got a chance to
   match a duration STRING (only a bare *number* in a duration-hinted category gets the `ms`
   suffix added automatically). Fixed by threading the leaf name through `resolveValue`.

The HTML-preamble variant of finding 1 (markup before the first `<style>` block, e.g. this
repo's own `sample.html` fixture) was caught by my own unit test before the live run, and fixed
the same way (scan only inside `<style>…</style>` for HTML sources).

## Whether D6's collision rule fired

**Yes — on dana's two real files combined, immediately, exactly as predicted.** Did not fire on
dana-tokens.css alone, traicaybentre, or hvs. See the dedicated section above for the full
message and the ≥120-pair static count.

## D7 — the parallel-hardcoded-set finding (recorded, not detected)

dana-tokens.css's semantic-dark block (`[data-theme="dark"], [data-theme="classic"], .dark { … }`)
and index.css's three per-theme blocks both redeclare full 11-step gray/blue/error/etc. ramps as
literal hex per theme, rather than one semantic layer aliasing shared primitives —
`token-taxonomy.md:121`'s named DON'T. This phase ingests it faithfully (each theme's literal
value lands correctly in its own `$extensions["mode.<name>"]`) and records the observation here,
per D7 — no detector was built.

## Deviations from the phase file (stated, not discovered by a future reader)

1. **D1's `sources` shape choice**: added a parallel `selectors: string[]` field rather than
   changing `sources` to `Array<{path,line,selector}>` — `sources`'s flat string form is asserted
   in 3 existing tests. This was the phase file's own "or" alternative.
2. **F4's form choice**: hard-error on repeat + the comma form, not array-valued flags — the
   phase file's own "acceptable and lazier" option.
3. **The `isTokenLeaf` pass-through fix in `token-import.ts`** (unplanned, detailed above) — the
   phase's own LIVE block cannot complete without it.
4. **D6 blocks dana's combined-file LIVE run from reaching `ds status`** — reported above, not
   routed around.
5. **`ingest-css-ds` writes only `tokens.json`**, not the 3-file bundle `ingest-figma-ds` writes —
   stated in "Scope decisions" above.

## Unresolved questions

- Should `figma-ds-designdoc.ts`'s DESIGN.md prose be parameterized (source-agnostic wording) so
  a future phase can safely reuse `buildDesignDoc` for the code road, or does the code road get
  its own doc builder? Left open — no DESIGN.md ships from `ingest-css-ds` this phase.
- dana's ~120-pair D6 collision effectively blocks combining `dana-tokens.css` + `index.css` in
  one ingest run today. Is the intended remedy purely human (rename one file's convention), or is
  a later phase expected to add an explicit `--prefer <file>` override? Not decided here per D6's
  explicit "do not add a suffix rule" instruction — flagging the open question rather than
  guessing an answer.

**Status:** DONE
**Summary:** CSS custom properties now compile to a DTCG vocabulary with base+mode tiers via
`ui ingest-css-ds` + a `ds import` fix, proven end-to-end on 3 real projects (dana-tokens.css
alone, traicaybentre, hvs); dana's two files combined hit D6's collision guard by design, exactly
as the phase file predicted, and that is reported as the finding it was meant to surface, not
routed around. Two real bugs (semicolon-terminated at-rules, duration-string resolution) were
found and fixed via the hvs live run and are covered by tests. Four gates green.
**Concerns/Blockers:** None blocking. Two follow-ups worth a human decision are listed under
"Unresolved questions" above.
