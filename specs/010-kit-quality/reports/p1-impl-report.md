# Spec 010 Phase 1 — implementation report (the responsive tracer bullet)

Branch: `spec010/p1-responsive-tracer` (off `main`). Scope: `knowledge/mode-constraints.md`,
`src/core/component-kit/table.ts`, new `src/core/component-kit/responsive-lint.ts`,
`tests/component-kit.test.ts`. No file on the spec-009 NEVER-TOUCH list was touched.

## The four gates + `ui knowledge check`

All green, run in this order after each change:

```
npm run typecheck   → clean, no errors
npm run lint        → clean (eslint src tests)
npm run build       → tsup ESM build success (dist/cli.js 798.38 KB)
npm test            → 1967 passed | 20 skipped, 4 pre-existing failures (see note)
ui knowledge check  → { errorCount: 0, warningCount: 0 }
```

**Pre-existing, unrelated failures**: `tests/adapters-wrapper-shapes.test.ts` has 4 failing
assertions ("must not contain plan/phase/finding references") on this branch's base commit
(`cda5aae`, spec 010 plan.md) — confirmed via `git stash` + re-run on the unmodified tree
before touching anything. Unrelated to component-kit / adapter wrappers I didn't touch;
flagging per Art VIII rather than silently absorbing into "test passes."

`tests/component-kit.test.ts` (the seam): **16/16 pass** — 3 structural + 4 markup-hygiene
(pre-existing) + 4 full-linter-set + 3 responsive-lint + 2 token-boundary (new, this phase).

## Where the linter lives, and why

`src/core/component-kit/responsive-lint.ts` — **not** `src/core/*-lint.ts` alongside
a11y/layout/taste/content. Reasons (per the task's explicit ask to justify):

1. **Different kind of check.** The four existing floors scan arbitrary HTML for a
   *hazard* (a mistake). This scans a *kit component* for a *missing dimension* — closer
   in kind to `ds specimen`'s "reliably-modelled gap" check (component-design.md's
   specimen contract) than to a hazard scanner.
2. **No CLI subcommand.** A standalone `ui responsive-lint` would need wiring into
   `src/commands/registry.ts` — on spec 009's NEVER-TOUCH list, and out of scope for a
   Phase-1 tracer bullet. The pure function is exercised directly at the seam
   (`tests/component-kit.test.ts`), exactly like the kit's own pre-existing markup-hygiene
   checks (hex/rgb regex, var-resolution) which also have no CLI surface.
3. **Findings-linter shape kept** (Art II): `{checkId, severity, message} → {findings,
   errorCount, warningCount}`, exit-1-on-error semantics preserved even without a CLI exit
   code — `component` replaces `line` (a per-component check has no line number).

Rule: markup contains `@media (min-width: …)` → passes. Else, an
`<!-- responsive-exempt: <reason> --> ` comment with a non-empty reason → passes. Anything
else (nothing, or `<!-- responsive-exempt -->` with no reason) → fails, with two distinct
`checkId`s (`responsive-missing` vs `responsive-exempt-no-reason`) so a malformed exemption
is never silently indistinguishable from an absent one (Art VIII).

## The scale

Declared in `knowledge/mode-constraints.md` (new "## Breakpoints" section, right after "How
a mode is chosen") — layout constants, not tokens, exactly as `plan.md` specifies:
`sm=40rem(640px) / md=48rem(768px) / lg=64rem(1024px) / xl=80rem(1280px) / 2xl=96rem(1536px)`.
No `breakpoint` token category added, no `@custom-media` invented — the literal lives
directly in Table's `@media` rule.

## The 26 components the linter fails (on purpose)

Exact, pinned list (`RESPONSIVE_EXEMPT_NONE` in `tests/component-kit.test.ts`) — every kit
component except `Data/Table`, all failing with `checkId: "responsive-missing"` (none has
attempted an exemption yet):

```
Control/Button, Control/Checkbox, Control/Combobox, Control/Input, Control/Radio,
Control/Select, Control/Switch, Control/Textarea,
Display/Alert, Display/Avatar, Display/Badge, Display/Card, Display/Kbd, Display/Progress,
Display/Separator, Display/Skeleton, Display/Toast,
Form/Field,
Overlay/Dialog, Overlay/DropdownMenu, Overlay/Popover, Overlay/Tooltip,
Structure/Accordion, Structure/Breadcrumb, Structure/Pagination, Structure/Tabs
```

`lintResponsive(COMPONENT_KIT)` → `errorCount: 26`. Phase 2's job is to shrink this array to
`[]` by changing the kit (adding `@media` or a reasoned exemption to each), never by
softening `responsive-lint.ts`. The test pins the exact LIST, not just the count, so a
future accidental rename or a check regression is caught, not just a number drifting.

## Table's before/after (markup diff, condensed — full diff via `git diff`)

Before: one fixed rendering — a real `<table>` at every width, `th`/`td` always
`display: table-cell` (browser default), no `@media` anywhere.

After — mobile-first:
- **Base (< 40rem)**: `.ui-table__t`/`tbody`/`tr` → `display: block`; each `<tr>` becomes a
  bordered card (`border`, `border-radius: var(--radius-button)`, `padding`); each `<td>` →
  `display: flex; justify-content: space-between` with a `::before { content: attr(data-th) }`
  label, so every cell renders as a label:value row. `<thead>` is **visually hidden** (the
  standard `position:absolute; width:1px; height:1px; clip:rect(0,0,0,0)` sr-only technique —
  never `display:none`, which would drop it from the accessibility tree). Every `<tr>`/`<td>`/
  `<th>`/`<thead>`/`<tbody>` also gained explicit `role="row"/"cell"/"columnheader"/
  "rowgroup"` so the table's ARIA semantics survive the `display` change (some browsers infer
  implicit table roles only from table-family `display` values). Each data `<td>` gained a
  `data-th="…"` attribute matching its column header text.
- **`@media (min-width: 40rem)` block**: reverts every element back to
  `table/table-header-group/table-row-group/table-row/table-cell`, restores the header row,
  the zebra stripe, and the right-aligned numeric column — i.e. exactly the pre-P1
  rendering. This is the ONLY override block; the base rules ARE the mobile design, not a
  bolted-on afterthought.
- Also added `position: relative` on `.ui-table__t` (the sr-only `<thead>`'s positioning
  anchor — also needed to keep `layout-lint`'s `absolute-without-relative` heuristic from
  firing, since it checks the whole document for the word "relative" with no real nesting
  awareness).

`table.ts`: 65 → 119 lines. `tokensUsed` gained `space.1` and `radius.button` (both
pre-existing token paths, reused — no new token category).

## The token-only boundary (the named risk)

Plan.md's risk: *"a breakpoint literal opens the door to other literals."* Expressed as a
real, passing test (`component-kit — token-only boundary holds on Table`, 2 assertions):

1. Table's only `@media (min-width: …)` condition is exactly `40rem` — nothing else.
2. Every `padding`/`margin`/`gap`/`font-size`/`line-height`/`border-radius` declaration in
   Table's markup resolves to `var(--…)`, **except** an explicit 3-term allow-list:
   `-1px` / `1px` (the WCAG sr-only clip technique's offsets — accessibility boilerplate,
   not a design decision) and unitless `0` (a neutral reset). The breakpoint condition
   itself is excluded from this scan (media-query conditions, not declarations) and pinned
   separately by test 1 above.

This boundary is expressible as a check, so no STOP-AND-REPORT was needed — the owner's
narrowed token-only rule (colour/space/typography stay token-only; only the breakpoint
literal is exempt) holds and is now pinned, not just asserted in prose.

## Deviations from a literal reading of the task, and why

- No `ui`-level CLI command for the responsive linter (see "where it lives" above) —
  deliberate, to avoid `src/commands/registry.ts` (spec 009 NEVER-TOUCH).
- `ResponsiveFinding` uses `component: string` instead of `line?: number` (a per-component
  check has no line number) — the only deviation from the exact `{checkId, severity,
  message, line?}` shape Article II names; noted rather than silently forced to fit.
- Extended the existing a11y wrap-lint test's `wrap()` to include
  `<meta name="viewport" content="width=device-width, initial-scale=1">` for ALL 27
  components (not just Table) — needed because Table now genuinely reflows and
  `a11y-lint`'s `checkViewportMetaPresent` correctly flags a responsive document with no
  viewport meta. This is the same class of harness gap the brainstorm already caught once
  (missing `lang` → false "27/27 fail a11y"); fixing it in the shared `wrap()` rather than
  special-casing Table only.

## Unresolved questions

None blocking. One forward note for Phase 2: this phase's exemption convention
(`<!-- responsive-exempt: reason -->`) is untested against a REAL exempt component (e.g.
Tooltip/Switch) — Phase 1 deliberately left all 26 as `responsive-missing`, not
`-exempt`, since none of them has an owner-reviewed reason yet. Phase 2 should pick the
exemption wording per-component deliberately (per plan.md: "a rubber-stamp exemption is the
signal"), not default everything indecisive to `@media`.

**Status:** DONE
**Summary:** Breakpoint scale (sm/md/lg/xl/2xl, rem, counted) declared in
`knowledge/mode-constraints.md`; Table reflows mobile-first (stacked cards below 40rem,
full table at/above) with a11y-preserving markup; new `responsive-lint.ts` fails 26/27 kit
components on purpose (pinned list); token-only boundary pinned as a real test; all four
gates + `ui knowledge check` green; only failing tests are 4 pre-existing, unrelated
`adapters-wrapper-shapes` failures confirmed present before this phase's changes.
**Concerns/Blockers:** none.
