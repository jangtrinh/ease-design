# Tasks — Spec 009: The code road (E2)

**Spec**: `spec.md` · **Plan**: `plan.md` · **Stage**: spec → implement
Cross-machine state lives in **GitHub issues** (Art VII), labelled `stage:spec` →
`stage:implement` → `stage:audit` → `stage:final-gate`. One phase = one PR = one issue.

## Phases

- [ ] **T1 — Phase 1: The living seal** — `stage:spec` · no deps
  - [x] Art IV audit — **DONE**, see `reports/art-iv-seal-audit.md`. **Answer: TWO unsealed
        writers → EXTRACTION, not a patch.** `registry.ts:189` **and**
        `figma-reconcile-run.ts:167` (spec 004's live-sync loop) both write the sealed registry
        and never touch the manifest. Live proof: **`platform-design-system` is DS_TAMPERED
        right now** — a real project, not a fixture.
  - [ ] Extract the reseal ceremony (`ds-change-token-impl.ts:300-315`) into a shared helper with
        **three** callers: `change-token` (proves the extraction), `registry register`,
        `figma reconcile --apply`. Not in `registry.ts` (319 ln, Art IX).
  - [ ] `figma reconcile --apply` reseals (`figma-reconcile-run.ts:167`) — the second caller the
        audit surfaced. Was NOT in the original plan.
  - [ ] Guard: `ingest-figma-ds --out ./design` would write the sealed path with an unsealed
        bundle. Refuse, or reseal.
  - [ ] **Owner call**: `platform-design-system` is tampered today. Fixing the writers does not
        heal it; `--force` destroys its registry (F3). Do not silently repair someone's store.
  - [ ] `registry register` reseals + emits `kind: "register"` (declared `ds-manifest.ts:16-19`,
        admitted `:97`, never emitted).
  - [ ] `ds import --force` preserves the registry or refuses with an explicit opt-in
        (`ds-import-impl.ts:74`).
  - [ ] R3: one name for `tokens`/`--tokens`/`tokensUsed`.
  - [ ] Record or fix: `saveRegistry` uses `JSON.stringify`, not `canonicalStringify`
        (`registry-store.ts:336` vs the mandate at `ds-manifest.ts:4-7`).
  - [ ] Tests: register-then-load stays sealed · generation +1 · changelog kind `register` ·
        `--force` over a non-empty registry · **the test that would have caught this**:
        `ds init` → `registry register` → `ds status` exits 0.

- [ ] **T2 — Phase 2: The honest router** — `stage:spec` · no deps
  - [ ] BFS traversal in `project-scan.ts` (`:132`); keep `SKIP_DIRS` (`:40-42`) and the cap.
  - [ ] `truncated` + `visited` as additive envelope fields.
  - [ ] `learn.md` surfaces truncation in its step-1 summary.
  - [ ] Tests: dana-shaped fixture (UI behind an alphabetically-earlier 415-file sibling) →
        found · over-cap repo → `truncated: true` · UI-free repo → empty + `truncated: false` ·
        **live**: `ui scan --cwd <dana>` reports `src/desktop-ui` + `dana-tokens.css`.
  - [ ] Resolve OQ1 (EaseUI's two legitimate UI roots) before declaring done.

- [ ] **T3 — Phase 3: The vocabulary** — `stage:spec` · deps T1, T2
  - [ ] **Check reuse first**: `ui designmd extract-tokens --css` already harvests custom
        properties (122 colors / 330 props from `dana-tokens.css`). Glue, or new code?
  - [ ] F4 `--css` accumulates or hard-errors (`cli-args.ts:11` is a scalar map;
        `designmd.ts:21` advertises repeatable).
  - [ ] F2 `ds import` accepts aliases (`ALIAS_RE` exists at `token-model.ts:62`).
  - [ ] F6 one casing convention across writer and validator (`token-import.ts:81` vs
        `registry-store.ts:74`; `ds init` already writes kebab-case).
  - [ ] R4 (Art II): one home + one linter for `mode.<name>` **before** the second emitter ships.
  - [ ] Themes → modes (`data-theme` · `.dark` · `prefers-color-scheme`).
  - [ ] Record the `parallel hardcoded set` finding; do **not** build the detector (later spec).
  - [ ] Tests: alias round-trips · alias-only file is not `EMPTY_IMPORT` · `[data-theme=dark]` →
        `$extensions["mode.dark"]` · base mode compiles, dark does not · emitted group names
        match `^[a-z][a-z0-9.-]*$`.

- [ ] **T4 — Phase 4: The road + the Art III gate** — `stage:spec` · deps T1, T2, T3
  - [ ] `extract.md` Inputs — widen, or stop routing code into it. **This sentence is the
        blocker**; everything else is plumbing.
  - [ ] `learn.md` code branch: a real route, not one line.
  - [ ] Component registration: host model reads §3a's 3–5 files; kernel validates.
  - [ ] **State the variant-axis decision in the phase file** (dana's Button: 8 × 3 × 3) — Art V:
        the implementer must never guess.
  - [ ] Gate on ≥3 of 9 for spread: dana-desktop · traicaybentre · hvs. Before/after table per
        project + **one thing the road got wrong** (or "none" — but look).
  - [ ] Run EaseUI (no root `package.json`, 62 nested, two UI roots) and report. Not a gate
        condition.
  - [ ] `specs/009-code-road/reports/p4-real-data-gate.md` — the evidence artifact.

## Debts to clear alongside (owner: "E2 + dọn nợ đang treo")

- [ ] `CONTEXT.md` was an empty stub while `CLAUDE.md` mandates its canonical terms — **filled
      2026-07-17** (road · code road · vocabulary · grammar · mode · evidence ladder · parallel
      hardcoded set · seal). Keep it fed as terms land.
- [ ] Stale spec headers: `001/spec.md:3` says `ready · implement` (tasks say PASS/closed);
      `003/spec.md:3` says `draft-for-review · spec` (tasks say COMPLETE).
- [ ] `006/reports/p5-real-data-gate.md:3` says **"Status: NOT YET RUN"** while `:116` says
      **"GATE RUN — RESULT (PASS)"** and `e4f04da` confirms. Fix line 3.
- [ ] `006/plan.md:39` required the gate on **VSF-PCP + platform-design-system**; `e4f04da` names
      **VSF-PCP only**, and the report does not say why. **Probable cause found**: platform-DS's
      DS is DS_TAMPERED and it has **no `memory.events.jsonl`**, so the gate's step 1
      (`ui memory compile`) cannot produce a baseline. phase-05's risk table already ruled this
      case: *"If a project is unreachable, the gate is incomplete — say so and stop."*
- [ ] **VSF-PCP's DS is named `imported-ds`** — the exact default `onboard.md` §4 STOP-gates
      against ("poisons agent identity"). Its `intent` leaks an absolute scratchpad path; it sits
      at `generation: 1` (history reset by a `--force`). The flagship dogfood project fell in the
      hole its own doctrine documents.
- [ ] `004/tasks.md:10` leaves D3 unchecked while `004/spec.md:62-64` lists it RESOLVED.

## Findings NOT taken into this spec (from the dogfood, triaged)

- **F5 — misdiagnosis, closed.** `--tokens` is persisted as `tokensUsed`
  (`registry.ts:140` → `registry-store.ts:242`); the probe read the wrong key. The real defect
  (three names, one concept) is T1's R3. *1 of 11 filed findings dissolved on contact with the
  source — triage before spec'ing.*
- **F7** persona on the import path · **F11** `ds a11y` cartesian default → later, or never.
- **C7 `CONVENTIONS.md` for code** · **code-DS hygiene detectors** → later spec, designed after
  Phases 1–4 meet real data (spec §Non-goals).

## Open questions

1. **EaseUI's genuine tie** — two real UI roots, no `--ui-root`. Largest wins, or ask? *Blocks T2.*
2. **Variant axes** — which axis is the record, which is the array? *Blocks T4.*
3. ~~Other unsealed writers?~~ **RESOLVED — two.** `registry register` + `figma reconcile
   --apply`. Phase 1 is an extraction with three callers. See `reports/art-iv-seal-audit.md`.
4. **`/es-brainstorm` writes to `plans/specs/{slug}/`; Art VII makes `plans/` the gitignored
   archive and `specs/NNN-slug/` the committed home.** Constitution won here. Skill gap to record
   via `/es-librarian record` — **not** patched mid-task (CLAUDE.md).
