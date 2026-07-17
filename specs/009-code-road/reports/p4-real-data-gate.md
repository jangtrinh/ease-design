# P4 — The road: real-data gate (Art III)

Executor: Sonnet. Branch `spec009/p4-the-road` off `spec009/p3-vocabulary`.

This is the evidence artifact for spec 009 Phase 4. It reports what changed, then the
end-to-end run on three real projects chosen for spread, plus a non-gating EaseUI run.

---

## 1. What changed (the four edits)

1. **D5** — `templates/workflows/extract.md` Inputs now accept **either** a single HTML
   artifact **or** the 3–5 sampled source files `learn.md` §3a already mandates for a code
   project. Step 1 ("Read the source") now has an explicit "Code input" branch. This was the
   one sentence that made the road unreachable for every code project (Key Insight 1).
2. **D3** — `states` is confirmed dead in this session's own live data too (0/1 registered
   records across all three projects populate it — see §2). `src/core/registry-store.ts` adds
   `statesToVariants()`; `src/commands/registry.ts`'s `runRegister` now folds `--states` values
   into `--variants` as `State=<PascalCase>` instead of writing the record's own `states` field.
   The flag's enum validation (`BAD_STATE`) is unchanged — verified live (see §3, the invalid-state
   probe). `extract.md` and `learn.md` §3b say plainly that the doctrine described a field the
   system never adopted.
3. **D1/D2/D4** — `learn.md`'s Code route gained a real "Step 3d — Component record shape for a
   code source" section: one record per component (D1), axis names taken verbatim from the
   source's own prop names (D2), markup as an HTML specimen sheet traced to real source class
   strings, never rendered (D4). All three live registrations below follow it.
4. **`learn.md`'s code route** — was one line into `extract.md`; now states the three
   code-specific decisions extract.md's generic steps do not derive on their own (see step 3d
   text). The CSS-custom-properties branch (P3's C0 path) and the plain-extract branch both now
   point at it instead of a bare "register the component" instruction.

5. **BAD_TOKEN existence check** (owner-correction, added after the first pass of this report —
   see §3's addendum) — `src/core/registry-token-check.ts` (new, small module) + one call site
   in `registry.ts`'s Save step. `registry.ts`: **330/330 lines exactly** (a dedupe helper for
   the repeated `RegistryError`→`CommandResult` catch pattern paid for the states/variants merge
   *and* this addition without growing past budget). Four gates green, `npm test` 136 files /
   2056 tests passed, `ui knowledge check` clean — all confirmed before this report was written.

---

## 2. The gate — three real projects, chosen for spread

All three copied to a scratch dir first (`rsync -a --exclude node_modules --exclude .git
--exclude dist ...`); nothing was written into the originals. dana-desktop's copy had a
pre-existing `design/` from an earlier dogfood session (visible in
`~/.claude/.../memory/`'s own history) — deleted from the *copy only* so the gate ran against
UC-06's actual precondition ("clean checkout, no `design/`").

| | dana-desktop | traicaybentre | hvs |
|---|---|---|---|
| `ui scan` → UI found? truncated? | `src/desktop-ui/components` (157 files); `truncated:true`, `visited:4000/4000` | `src/components` (27 files); `truncated:true`, `visited:2967` | `components/ui` (3) + `docs/product/hvs-design-system/components` (23); `truncated:false`, `visited:464` |
| tokens compiled (primitive / semantic / modes) | 186 / 228 / 3 (`mode.dark`, `mode.classic`, `mode.light`) — 15 unverified | 17 / 0 / 0 — 2 unverified | 13 / 7 / 0 — 7 unverified |
| unverified examples | `--font-mono`, `--shadow-lg`, `--transition-fast` (composite/unmappable — correctly excluded, not GUESS-filled) | 2 composite values | `--font-display`, `--hvs-ease`, `--shadow-brand` (composite) |
| components registered | 1 — `Control/Button` | 1 — `Social/ShareButtons` | 1 — `Control/LocationSelector` |
| `ds status --json` exit | **0** (generation 1 → 2 after register) | **0** (generation 1 → 2) | **0** (generation 1 → 2) |
| `ds context --strict --with-theme` exit | **0** | **0** | **0** |
| what the road got wrong (project-specific) | see §3 — the `BAD_TOKEN` finding, discovered here, since fixed (addendum) | most of the 27 components are one-off marketing sections (`hero-section.tsx`, `footer.tsx`, …), not variant-prop primitives — only one real D1/D2 candidate (`ShareButtons`'s `placement` prop) surfaced in the whole sampled set | `docs/product/hvs-design-system/` is a stale demo/preview tree with its own component CSS (`ButtonPrimary.css`, forced `.state-hover`/`.state-active` classes) sitting right next to the real `app/globals.css` — a less careful read could learn the demo instead of the product. **Not this phase's fix** — flagged for P2's `project-scan.ts` (see below) |

**learn.md's own quality gate — the phase's success criterion — is satisfied on all three:**
*"when the source was code, ≥1 component is registered"* (true, ×3) **and** *"`ds status` must
exit 0"* (true, ×3). Per Key Insight/UC-06 this pair of sentences could not both be true on
`main` before this phase.

### Component discovery notes

- **dana-desktop**: `src/desktop-ui/components/Button.tsx` — a genuine variant-prop primitive
  (`variant`/`size`/`radius`, 8×3×3). This is the project the spec's own decisions (D1–D4) were
  derived from, so it is the closest to a confirming run rather than an independent test — the
  other two projects are the real test of generality.
- **traicaybentre**: mostly a Next.js marketing site — `src/components/` holds section
  components (`hero-section.tsx`, `faq-section.tsx`, `footer.tsx`, …) with no variant props at
  all. `share-buttons.tsx` was the one component with a real source-declared prop axis
  (`placement?: "top" | "bottom"`). This is itself informative: `extract.md` step 2's aim of
  "5–30 candidates... weighted toward what the user actually reuses" assumes a component-library
  style codebase; a marketing site's reusable surface is thin. The registry ends with 1 correct
  record rather than a strained one.
- **hvs**: `components/ui/pill-group.tsx` had an *interaction* state (selected/idle) but no
  named prop for it — D2 explicitly requires the axis name to come from the source's own prop,
  and there is no such prop here, so it was skipped in favor of `location-selector.tsx`, which
  declares a real `variant?: "default" | "compact"` prop.
  - **Follow-up flagged, NOT fixed here** (owner's call): `docs/product/hvs-design-system/` — a
    stale demo/preview tree, 7× bigger than the real `components/ui` — is real and valuable, but
    the owner counted the corpus before this report proposed a general "detect stale/demo trees"
    class and found no such class is warranted:
    ```
    docs      3/11 · 95 UI files → hvs(48) EaseUI(43) gravityhive(4)
    examples  1/11 ·  3 files    → VSF-PCP(3)
    demo · demos · preview · playground · sandbox · storybook · fixtures · .bak · -old · deprecated → 0
    ```
    Every plausible name pattern is zero except `docs/`. The honest, narrow rule is **"the
    product's UI does not live under `docs/`"** — one more `SKIP_DIRS` entry, the same shape as
    P2's `.venv` fix (`project-scan.ts:58-59`). `project-scan.ts` is P2's file and P2 is already
    in review (#78) — **not this phase's file to touch.** Recorded here as the follow-up per the
    owner's instruction, with the counts above; left undone.
- Both `traicaybentre` and `hvs` have `.claude/worktrees/*` subdirectories containing duplicate
  copies of the whole tree (13 in traicaybentre, 3 in hvs). `ui scan`'s `SKIP_DIRS` already
  excludes `.claude` (`project-scan.ts:58`), so this did **not** distort the live scan results
  above — but it likely explains why this phase's own project descriptions ("999 components,
  340 css" for traicaybentre; "4 tailwind configs" for hvs) look much larger than the single
  real tree (traicaybentre: 64 `.tsx`/`.jsx` files under `src/`, 1 real `globals.css`; hvs: 1
  real `tailwind.config.ts` outside `.claude/`). Not a defect in this phase's work — just a
  methodology note for whoever re-measures a real-project survey count in the future: exclude
  `.claude/worktrees/` or count will overstate genuine surface area.

---

## 3. One thing the road got wrong (verbatim reproduction)

**`ui registry register`'s `BAD_TOKEN` does not check that a `--tokens` value resolves against
the project's compiled token set — only that it matches the path-format regex.**

This phase's own spec (Key Insight 6, and the "HARD CONSTRAINTS" briefing this executor received)
states: *"`BAD_TOKEN` (`registry-store.ts:167`) refusing an invented token is this phase's entire
safety story... Do not weaken it."* The live run surprised this expectation (Key Insight 7:
"suspect the assertion before the code"):

```
$ ui registry register "Probe/Invented" --category action --markup control-button.html \
    --tokens "color.this-token-does-not-exist-anywhere" --file bad-token-probe-registry.json --json
{
  "ok": true,
  "data": { "component": { "name": "Probe/Invented", "tokensUsed": ["color.this-token-does-not-exist-anywhere"], ... } }
}
```

Exit 0. No refusal. Reading `src/core/registry-store.ts`'s `validateComponentRecord`:

```ts
for (const t of r["tokensUsed"] as unknown[]) {
    if (typeof t !== "string" || !TOKEN_PATTERN.test(t)) {
      throw new RegistryError("BAD_TOKEN", `invalid token path '${String(t)}' — must match ^[a-z][a-z0-9.-]*$ ...`);
    }
}
```

`TOKEN_PATTERN = /^[a-z][a-z0-9.-]*$/` is a **syntax** check — lowercase, dot/hyphen-separated —
with no knowledge of what the project actually compiled. `color.this-token-does-not-exist-anywhere`
satisfies the regex, so it is accepted. The existing test that was meant to cover this
(`tests/cmd-registry.test.ts`, *"refusing a bad token leaves the seal intact"*) only ever probed
`"NOT A VALID TOKEN"` — uppercase, with spaces — which fails the *regex*, not an existence check.
That test is real and still passes; it was simply never asked the question this phase's own
safety claim depends on. This is exactly the shape of Key Insight 7's warning: a green test can
certify the wrong property.

**Disposition (original)**: not fixed at first pass. The task's hard constraints as given said
never to touch `validateComponentRecord`'s strictness, so this was reported per Art V / this
spec's own "STOP AND REPORT" precedent (P1's line-budget lie, P2's Gherkin wish, P3's naming
rule) rather than patched.

### Addendum — owner-corrected and fixed in this phase

The owner re-verified the finding live, confirmed the misread was in the ORIGINAL phase
briefing (Key Insight 6 / the "never weaken it" constraint were both written believing
`BAD_TOKEN` already checked existence), and made the call: **P4 closes it**, reusing P1's
existing shape rather than inventing one (Art IV).

- **New module `src/core/registry-token-check.ts`** (kept out of `registry.ts` — the file was
  already at budget): `tokenExistsInTree(tokens, path)` — two-level `category.name` lookup,
  the same convention `ds-change-token-impl.ts` already enforces; `assertTokensExist(tokensUsed,
  tokens)` — no-op when `tokens` is `undefined` (the standalone-registry case, e.g.
  `ingest-figma-ds`'s `--file` target — format-only, unchanged), else throws `RegistryError`
  `BAD_TOKEN` on the first path that does not resolve, with a message that says **"does not
  exist"**, never "must match" — the two failures now read differently. Modes are `$extensions`
  ON a token, not tokens of their own, so resolving in the base tree is the whole test — the
  "which modes count?" question in the original disposition dissolves.
- **`registry.ts`** — `runRegister`'s existing Save step already calls
  `loadDesignSystemForReseal(dsPaths)` once (P1); it now also calls `assertTokensExist(record.
  tokensUsed, ds?.tokens)` there, before deciding reseal vs. plain save, so a refusal happens
  before any write. No second DS load, no growth beyond budget: **330/330 lines exactly.**
- **Verified live** (isolated probe, not touching a gate project): with a sealed DS present,
  `--tokens color.color-accent-strong,color.totally-invented-xyz` now refuses —

  ```
  {"ok": false, "error": {"code": "BAD_TOKEN",
    "message": "token 'color.totally-invented-xyz' does not exist in the compiled design
      system — the path is well-formed but unknown, not malformed. Check 'ui ds context
      --format json' for a real path."}}
  ```

  registry file byte-unchanged after the refusal. The original standalone-registry probe
  (`--file` with no manifest) still accepts the same invented path, unchanged — confirmed with
  a dedicated test (`tests/cmd-registry.test.ts`).
- **Re-ran the three-project gate against the fix** (owner's instruction: if a real component
  now fails, that is a finding to report, not a reason to relax the check). Re-registered all
  three components verbatim (`--force`) under the corrected binary:

  | | dana-desktop `Control/Button` | traicaybentre `Social/ShareButtons` | hvs `Control/LocationSelector` |
  |---|---|---|---|
  | register exit under the fix | **0** | **0** | **0** |
  | `ds status` exit after | **0** (generation 3) | **0** (generation 3) | **0** (generation 3) |
  | `ds context --strict --with-theme` exit | **0** | **0** | **0** |

  **All three real components still pass.** No relaxation was needed — every `tokensUsed` entry
  traced in §2/§4 was a genuinely real compiled path, so the stricter check changes nothing
  about the three gate results; it only closes the hole a fabricated path could have used.
- **Tests**: `tests/registry-token-check.test.ts` (new, pure unit tests over an in-memory
  `TokenTree`) pins `tokenExistsInTree`/`assertTokensExist`. `tests/cmd-registry.test.ts` gained
  three CLI-level cases in the "sealed DS integration" block: the invented-token refusal with
  the distinct message, a genuinely-resolving token being accepted, and the standalone-registry
  path still being format-only. `tests/registry-store.test.ts`'s test was reworded from
  "documents a known gap" to "pins that `validateComponentRecord` is format-only **by design**"
  — it was never the gap; `registry.ts` calling it plus the new module together are the fix.

**Current status**: closed. `registry register`'s existence check (DS present) + format check
(always) together are what P4's Key Insight 6 originally described.

---

## 4. Verbatim: one component record the road produced

`ui registry lookup "Control/Button" --file design/component-registry.json --json` on the
dana-desktop copy, after the live run in §2:

```json
{
  "name": "Control/Button",
  "category": "action",
  "tokensUsed": [
    "color.color-accent-strong",
    "color.color-on-accent",
    "color.color-danger-strong",
    "color.color-on-danger",
    "dimension.text-caption",
    "dimension.text-control"
  ],
  "variants": [
    "Variant=Primary", "Variant=Blue", "Variant=AccentSoft", "Variant=Secondary",
    "Variant=Outline", "Variant=Ghost", "Variant=Danger", "Variant=Link",
    "Size=Xs", "Size=Sm", "Size=Md",
    "Radius=Sm", "Radius=Lg", "Radius=None",
    "State=Hover", "State=Focus", "State=Disabled"
  ],
  "description": "Dana's primary button primitive: 8 variants x 3 sizes x 3 radii, plus loading/icon slots",
  "scope": "local"
}
```

(`markup` omitted here for length — 5,616 chars, the HTML specimen sheet built from
`Button.tsx`'s `variantClasses`/`sizeClasses`/`radiusClasses` maps verbatim; see
`templates/workflows/learn.md` step 3d for the rule that produced it.) Notes on this record
against the phase's own decisions:

- **D1 held**: one record, not 72 (8 variants × 3 sizes × 3 radii).
- **D2 held**: `Variant=`, `Size=`, `Radius=` are dana's own prop names (`variant`, `size`,
  `radius`), PascalCased — not renamed to a house term.
- **D3 held live**: `--states hover,focus,disabled` produced `State=Hover`, `State=Focus`,
  `State=Disabled` inside `variants`; the record has **no** `states` key at all (confirmed by
  its absence above — `validateComponentRecord` only emits the field when present in the raw
  input, and `runRegister` never sets it any more).
- **`color.color-accent-strong`** (not `color.accent-strong`) is **not** a bug — it is spec 009
  P3's own D6 (`css-token-ingest.ts:29-38`): dana's `index.css` declares `--color-accent-strong`
  literally (a Tailwind `@theme` re-export of the bare `--gray-*` scale), so the verbatim leaf
  keeps the source's own name. Checked this before treating it as a finding — it is expected P3
  behaviour, not a new defect.

---

## 5. EaseUI (not a gate condition — evidence for a later decision)

```
$ ui scan --cwd EaseUI --json
framework: null
tailwindConfig: "app/tailwind.config.js"
componentDirs: [{"path": "app/src/components/ui", "files": 12}]
dsStatus: "none"  verdict: "brownfield-code"
truncated: true   visited: 4000
```

- **`framework: null`** confirmed — no root `package.json` (`app/package.json`,
  `frontpage/app/package.json`, `figma-plugin/package.json`, `ebook/package.json` all exist as
  nested manifests; the scanner's framework detection reads only the root).
- **`truncated: true` at exactly `visited: 4000`** — the walk hit `MAX_ENTRIES` and reported it
  honestly (`ok:true`, non-empty `componentDirs`, `truncated:true` — the correct combination per
  UC-02, not the "empty + false" failure mode).
- **Only one of the two legitimate UI roots surfaced in `componentDirs`.** `cssFiles` shows BFS
  did reach both `app/src/app/globals.css` and `frontpage/app/src/app/globals.css`, so the
  `frontpage/` subtree was walked — but `frontpage/app/src/components/` contains only an
  `icons/` subfolder, not a `ui`/`widgets`/`components`-named directory with ≥3 code files
  (`project-scan.ts`'s `COMPONENT_DIR_NAMES` + `directCode >= 3` gate), so nothing under
  `frontpage/` qualified as a `componentDirs` entry within the budget. This is not a truncation
  artifact in this specific case — the directory shape genuinely does not match — but on a
  larger monorepo the same "found the CSS, missed the component root" split could recur from
  truncation alone. Worth a future decision (`usecases.md` §7 Q2 is exactly this open question);
  not resolved here per this phase's scope (D6/UC-06 names only the three gate projects).

---

## Status

**Status:** DONE
**Summary:** D5 (dual-input `extract.md`), D3 (`--states` → `variants` via `statesToVariants`),
D1/D2/D4 (learn.md's real code route), **and the BAD_TOKEN existence check** (owner-corrected
follow-up, `registry-token-check.ts`) all implemented; four gates + 2056 tests + `ui knowledge
check` green; `registry.ts` at 330/330 lines exactly. Gate ran end-to-end on dana-desktop,
traicaybentre, hvs (copies), **then re-ran after the BAD_TOKEN fix** — all three, both times:
≥1 component registered, `ds status` exit 0, `ds context --strict --with-theme` exit 0, and no
real component was relaxed-for by the stricter check. `learn.md`'s own quality gate is
satisfiable on real code for the first time. EaseUI run reported as evidence (not gating). The
`docs/`-as-demo-tree observation is recorded as a follow-up for P2's `project-scan.ts` (§2, with
the owner's corpus counts) and deliberately left undone — not this phase's file.
**Concerns/Blockers:** none outstanding for this phase. The BAD_TOKEN gap is closed (see §3
addendum) and re-verified live against all three gate projects with no regression. The
`docs/` `SKIP_DIRS` follow-up is explicitly deferred to P2 (#78), per the owner's instruction —
not a blocker on this phase, just an open item for whoever picks up P2 next.
