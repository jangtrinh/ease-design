# Use cases — Spec 009: The code road (E2)

**Stage**: brainstorm/phase-2 · **Prereq**: `brainstorm.md` (approved 2026-07-17)
**Scope**: Phase 1 (vocabulary) + Phase 2 (registry). Phase 3+ (`CONVENTIONS.md`, hygiene
detectors) is a later spec — see brainstorm §6 Won't.

> **Naming**: **Must/Should/Could** = priority. **Phase 1 / Phase 2** = delivery order.
> Never `P1`/`P2` — that shorthand already means a spec phase in this repo.

---

## 1. Use cases

### UC-01: Onboard a repo whose UI is not at the root — Phase 1 · Must

**Actor:** studio designer running `/ui:learn` on a client app repo
**Precondition:** a git repo with UI somewhere below root; no `design/` yet

**Happy path**
1. `ui scan --json` walks the repo **breadth-first**, skipping `SKIP_DIRS`.
2. The shallow layer (`src/*`) is visited before any deep subtree is entered.
3. The envelope carries `framework`, `styling`, `cssFiles`, `componentDirs`, `htmlFiles`,
   `verdict: brownfield-code`, and `truncated` — whose value is a **fact about the repo**, not a
   success condition. A big repo truncates; the win is that the UI was reached first.
4. `learn.md` §3a samples 3–5 representative files from the reported dirs.

**Edge cases**
- **The pathological case that motivated this** — dana: `src/{agent-servers, backend, config,
  dana-ontologist(415 files), desktop-ui}`. Depth-first + alphabetical exhausts the 4000-entry
  budget four directories before `desktop-ui`. BFS reaches it in the first `src/` sweep.
- Two legitimate UI roots (EaseUI: `app/src/components` + `frontpage/app/src/components`) —
  see UC-02 and Open Question 3.
- Monorepo with no root `package.json` (EaseUI) — `framework` is null at root while real UI
  exists below. `framework: null` must not imply "no UI".
- A repo that is genuinely UI-free — `componentDirs: []` **and** `truncated: false`. That
  pair is the only honest way to say "nothing here".
- **`SKIP_DIRS` was JS-shaped** (every entry JS or JS-tooling) because design:os had never
  scanned a polyglot repo. dana is Electron + React + **Python**: its `.venv` alone holds **8187
  files — 54% of the whole tree**, burning the budget on a directory that can never hold UI.
  Measured across all 9 code projects: `.venv` 8187 · `__pycache__` 19 · `.pytest_cache` 5 ·
  `.vercel` 7 · every other guess (`.tox`, `target`, `Pods`, `.gradle`, `.nuxt`, …) **0/9**.
  The list is ecosystem-scoped; entries earn their place by files-burned on a real repo.

---

### UC-02: Scan a repo bigger than the walk budget — Phase 1 · Must

**Actor:** studio designer running `/ui:learn` on EaseUI (2464 components, 654 HTML, 62 nested
`package.json`)
**Precondition:** repo exceeds `MAX_ENTRIES`

**Happy path**
1. The walk spends its budget breadth-first and stops at the cap.
2. The envelope reports `truncated: true` and `visited: <n>` alongside whatever was found.
3. `learn.md` surfaces the truncation in its one-paragraph summary — the user learns the map
   is partial **before** deciding, not after.

**Edge cases**
- Truncated **and** `componentDirs: []` → the summary must say "budget exhausted before any
  UI was found", never "this project has no components".
- Truncated **and** the found dirs are sufficient → proceed, but the report still states what
  was skipped (`learn.md` §3a already mandates "state which files you sampled and which you
  skipped, so the coverage is auditable").
- Cap raised or removed later → `truncated` must remain in the contract; it is the honesty
  surface, not a tuning artefact.

---

### UC-03: Compile the vocabulary from CSS custom properties — Phase 1 · Must

**Actor:** `/ui:learn`, code road, C0 step
**Precondition:** scan reported ≥1 `cssFiles` entry; the project declares `--*` custom
properties under `:root` and/or Tailwind 4 `@theme`

**Happy path**
1. Every declared custom property across **all** reported CSS files is harvested (not just the
   last one — see F4).
2. Literal values → **primitive** tokens. Values referencing another custom property →
   **semantic** tokens carrying the alias form `{category.name}`.
3. Each theme block (`[data-theme="x"]`, `.dark`, `prefers-color-scheme`) becomes a **mode**:
   base → `$value`, every other → `$extensions["mode.<name>"]` — the same convention
   `ingest-figma-ds` already emits.
4. `ui ds import` seals the store. `ui ds status` exits 0.
5. `ui tokens compile --target css` emits the **base mode**; other modes stay preserved in the
   token file and documented in `DESIGN.md`.

**Edge cases**
- **Alias-valued tokens** — today `ds import` skips them (`token-import.ts:45`,
  *"unmappable string value"*), which drops exactly the semantic tier the doctrine mandates
  (`token-taxonomy.md:110`). dana lost 87/263 this way.
- **Alias-only file** → `EMPTY_IMPORT` (`ds-import-impl.ts:64`) despite every token being valid.
- **Two tiers, two names, one token path** — `--gray-900` (primitive) and `--color-gray-900`
  (Tailwind's `@theme` re-export of it) are DIFFERENT declared properties. Any rule that
  normalises one onto the other collapses the two-tier structure. Verified live: a
  "strip the redundant prefix" rule collided ≥120 times on dana. **The leaf is the declared name,
  verbatim.** See phase-03 D6.
- **camelCase group names** — `ds import` passes source names through verbatim
  (`token-import.ts:81`), producing `fontSize`/`zIndex` that `TOKEN_PATTERN`
  (`registry-store.ts:74`) forbids. 28/286 dana tokens became unreferencable from any
  component.
- **Parallel hardcoded set** (dana: 4 themes × 12 hardcoded `--color-gray-*`) — the
  `token-taxonomy.md:121` anti-pattern. Phase 1 **ingests and records it as a finding**; the
  machine detector is a later phase. It must never be silently normalised away *or* silently
  swallowed.
- Composite values (shadows, durations) — 13 skipped on dana. Out of scope; must appear in the
  "unverified" list, not vanish.

---

### UC-04: Register a component without breaking the seal — Phase 2 · Must

**Actor:** `/ui:learn`, code road, component step
**Precondition:** a sealed DS exists (`ds status` exits 0)

**Happy path**
1. The host model reads the 3–5 sampled components and, per component, supplies `name`
   (`Category/Variant`), `category`, `markup`, `tokensUsed`, `states`, `description`.
2. The kernel **validates**: `tokensUsed` entries must resolve against the compiled token set
   (`BAD_TOKEN`); `states` must be observed, never invented (`learn.md` §3b).
3. `ui registry register` writes the record **and reseals** — recomputes `registryHash`, bumps
   `generation`, appends a `kind: "register"` changelog entry (the kind is already declared at
   `ds-manifest.ts:16-19` and admitted at `:97`; nothing emits it today).
4. `ui ds status` exits 0. `ui ds context --strict --with-theme` emits the context + `@theme`.

**Edge cases**
- **Today's behaviour**: any register ⇒ `DS_TAMPERED`, from a clean `ds init`, reproduced
  twice. The message reads *"The registry was modified outside a sanctioned command"* — while
  `registry register` **is** the sanctioned command. The error accuses the user of the tool's
  own omission.
- **Art IV audit first** — `registryHash` is written only by `ds-init-impl.ts:200` and
  `ds-import-impl.ts:80`. Before patching, enumerate every writer of a sealed artifact and ask
  which others skip the reseal. Fix at the shared layer; do not patch `registry.ts` alone.
- A partial write (record lands, manifest commit fails) must not leave a silently stale seal —
  `ds-change-token-impl.ts:336-342` already models the recover-or-explain path; reuse it.
- The model invents a token → `BAD_TOKEN`, register refuses, DS stays sealed. **The refusal is
  the feature**: it is what makes host-model-reads safe without a parser.
- Variant explosion — dana's Button is 8 variants × 3 sizes × 3 radii. `name` is
  `Category/Variant`; `variants` is an optional array. Which axis becomes the record and which
  becomes the array is a **planning decision**, and it must be stated, not discovered.

---

### UC-05: Re-import over an existing registry — Phase 2 · Should

**Actor:** studio designer re-learning after a redesign
**Precondition:** a sealed DS with ≥1 registered component

**Happy path**
1. `ui ds import <tokens> --force` reseals the **tokens**.
2. Registered components survive. `generation` continues; the changelog is not erased.

**Edge cases**
- **Today**: `--force` calls `createEmptyRegistry()` unconditionally
  (`ds-import-impl.ts:74`) → components wiped, `generation` reset to 1, changelog erased. No
  warning, no prompt, nothing in `--help`. dana lost 3 components and 102 `change-token`
  entries this way.
- `onboard.md` §4 **recommends** `--force` for the stale-seal case without noting it nukes the
  registry — the doctrine actively steers users into the trap.
- Same root premise as UC-04: the registry is modelled as a birth-time artifact. Fixing one
  side without the other leaves the destructive escape hatch as the only cure for the disease
  it causes.

---

### UC-06: The road, end to end — Phase 1 + 2 · Must (the gate)

**Actor:** studio designer, `/ui:learn` on dana-desktop
**Precondition:** clean checkout, no `design/`

**Happy path**
1. `ui scan` finds `src/desktop-ui` (UC-01), reports `truncated` honestly (UC-02).
2. The vocabulary compiles from `dana-tokens.css` + `index.css`, 4 themes as modes (UC-03).
3. ≥1 component registers and the DS stays sealed (UC-04).
4. `learn.md`'s own quality gate is satisfiable **for the first time**:
   *"when the source was code, ≥1 component is registered"* **and** *"`ds status` exits 0"*.

**Edge cases**
- The gate runs on **≥3 of the 9 real code projects**, not on dana alone (Art III; and n=1
  generalisation is the mechanism that produced the doctrine this spec is repairing).
- A project where the road fails is a **finding, not a failure** — report it. A gate that can
  only run where it passes is not a gate.

---

## 2. Acceptance criteria (Gherkin) — Must use cases

```gherkin
# UC-01
Scenario: The UI is buried under an alphabetically-earlier sibling
  Given a repo whose UI lives at "src/desktop-ui"
    And a sibling "src/dana-ontologist" holding 415 files sorts before it
  When I run "ui scan --json"
  Then componentDirs contains an entry under "src/desktop-ui"
   And cssFiles contains "src/desktop-ui/dana-tokens.css"
  # NOT "truncated is false" — corrected 2026-07-17 after the live run. dana's tree exceeds the
  # cap whatever the traversal order; BFS's win is REACHING desktop-ui before the budget dies,
  # not making the repo fit. Asserting truncated:false here would have been asserting a wish.

# UC-02
Scenario: The walk budget is exhausted
  Given a repo larger than MAX_ENTRIES
  When I run "ui scan --json"
  Then truncated is true
   And visited equals MAX_ENTRIES
   And the envelope still reports every signal found before the cap

Scenario: An empty result is never reported as a complete one
  Given a repo larger than MAX_ENTRIES whose UI was not reached
  When I run "ui scan --json"
  Then componentDirs is empty
   And truncated is true
   And ok is true
  # ok:true + empty + truncated:false is the ONLY honest way to say "no UI here"

# UC-03
Scenario: The semantic tier survives import
  Given a token file where "color.text-primary" has the value "{color.gray-900}"
  When I run "ui ds import <file> --dir <p> --name <slug>"
  Then the import does not skip "color.text-primary"
   And "ui ds status" exits 0
   And "ui tokens compile --target css" emits "--color-text-primary: #181818"

Scenario: A theme becomes a mode, and the base mode is what compiles
  Given a CSS file declaring "--color-bg: #ffffff" under ":root"
    And "--color-bg: #111111" under "[data-theme='dark']"
  When the vocabulary is compiled
  Then token "color.bg" has $value "#ffffff"
   And token "color.bg" has $extensions["mode.dark"].$value "#111111"
   And "ui tokens compile --target css" emits "#ffffff" and not "#111111"

Scenario: A group name the registry cannot reference is never written
  Given a source token group named "fontSize"
  When the vocabulary is compiled
  Then the emitted group name matches ^[a-z][a-z0-9.-]*$
   And "ui registry register X --tokens font-size.caption" succeeds

# UC-04
Scenario: Registering a component keeps the seal intact
  Given a sealed design system
  When I run "ui registry register 'Button/Primary' --category button --markup b.html --states default"
  Then "ui ds status" exits 0
   And the manifest generation increased by 1
   And the changelog gained an entry with kind "register" and by "ui registry register"

Scenario: An invented token is refused and the seal is untouched
  Given a sealed design system with no token "color.invented"
  When I run "ui registry register 'X/Y' --tokens color.invented ..."
  Then the command fails with BAD_TOKEN
   And "ui ds status" exits 0
   And the registry is unchanged

# UC-06
Scenario: learn.md's own gate is satisfiable on a real code project
  Given a clean checkout of a real code project with UI below root
  When I run the code road end to end
  Then at least one component is registered
   And "ui ds status --json" exits 0
   And "ui ds context --strict --with-theme" exits 0
```

---

## 3. Error states

| Condition | Behaviour | User-facing message |
|---|---|---|
| Walk budget exhausted | `ok: true`, `truncated: true`, `visited: n` | "scanned N entries (budget reached) — the map is partial; deepest unvisited: `<path>`" |
| No UI found, budget intact | `ok: true`, `truncated: false`, empty dirs | "no CSS or component directories found — this project has no UI evidence to learn from" |
| Alias target missing | `ds import` fails, nothing written | "`color.text-primary` aliases `{color.gray-900}`, which no token declares" |
| Group name not referencable | refuse at write time, not at register time | "group `fontSize` cannot be referenced from a component — emit `font-size`" |
| Invented token on register | `BAD_TOKEN`, exit 1, DS untouched | already correct (`registry-store.ts:171`) |
| Register mid-write failure | tokens/registry committed, manifest not | reuse `ds-change-token-impl.ts:336-342` recover-or-explain wording — never a silent stale seal |
| `--force` over a non-empty registry | refuse, or preserve — decided in planning | "`--force` would discard N registered components — pass `--reset-registry` to mean it" |

---

## 4. UX decisions

| Decision | Principle | Rationale |
|---|---|---|
| Auto-route from the scan; ask only when nothing is found | **Hick's Law** | Decision time scales with the number of choices. The evidence is on disk — making the user pick a source is asking them to do the machine's reading. `learn.md`'s north-star already says it: *"the user supplies what; the system supplies how."* |
| `truncated` + `visited` in every envelope | **Visibility of system status** (Nielsen #1) | The system knows it gave up; the user cannot know. An `ok: true` with `cssFiles: 0` is the system reporting a state it did not verify — Art VIII. |
| `register` reseals rather than the user re-init'ing | **Error prevention** (Nielsen #5) | The current design lets a sanctioned command put the DS in a state its own doctrine calls terminal. Prevention beats the recovery path (`--force`) that destroys the work it recovers. |
| One name per concept (`tokensUsed`) end to end | **Match between system and the real world** (Nielsen #2) | Three names for one field fooled the field reporter *and* a reader holding the full source. Naming is a correctness surface, not cosmetics. |
| `ds import` accepts alias **or** literal | **Postel's Law** | The alias form is valid in `tokens compile` and in `change-token`; only the command documented as the on-ramp rejects it. Be liberal in what you accept — especially at the front door. |
| No `--ui-root` flag | **Hick's Law** + the north-star | A flag hands the machine's job back to the user and adds a choice to every invocation to serve a minority of repos. Fix the walk. |

---

## 5. Design-system check

Spec 009 ships **no UI surface** — it is kernel + workflow-template work. The applicable
contract is not tokens but Art I/II's output shape:

- Every new/changed command re-emits a JSON envelope; `design-os` passes it through
  **verbatim** (Art I.3).
- `truncated`/`visited` are **additive** fields on the existing `ui scan` envelope — no
  breaking change to the shape.
- Any new check follows the findings-linter shape (Art II):
  `{checkId, severity, message, line?}` → `{findings, errorCount, warningCount}`, exit 1 on
  errors.
- New/changed modules stay under ~200 lines (Art IX). `registry.ts` is 319 today — resealing
  goes into a shared helper, not into that file.

**New convention introduced**: `mode.<name>` gets its second emitter. Per Art II it must ship
a shared definition and a check in the same commit — not prose in two module headers.

---

## 6. Appetite check

| UC | Effort | Value | Ship this cycle? |
|---|---|---|---|
| UC-01 BFS walk | Low — a traversal-order change, budget untouched | High — the router is the road's first gate | **Yes** |
| UC-02 truncation honesty | Low — two additive envelope fields | High — Art VIII; converts a silent lie into a fact | **Yes** |
| UC-03 vocabulary from CSS | Medium — the ingest + F2 aliases + F4 accumulate + F6 casing | High — 3/3 universal; this *is* the vocabulary | **Yes** |
| UC-04 register reseals | Medium — Art IV audit, then a shared reseal helper | High — unblocks `learn.md`'s own gate | **Yes** |
| UC-05 `--force` non-destructive | Low | Medium — same premise as UC-04; cheap alongside it | **Yes, with UC-04** |
| UC-06 the gate on ≥3 projects | Medium — real-data runs, findings written up | High — Art III; the only proof that isn't a fixture | **Yes** |
| `CONVENTIONS.md` for code (C7) | High | High — but makes generation *resemble* the product; not a condition of the road existing | **No — later spec** |
| Hygiene detectors (incl. `:121`) | High | High — designed *after* Phase 1+2 meet real data | **No — later spec** |
| F11 `ds a11y` pair default | Low | Low here — noise, not a blocker on this road | **No** |

---

## 7. Open questions

1. ~~What is `/ui:generate`'s deliverable for a React project?~~ **RESOLVED (owner,
   2026-07-17): HTML is the design; developers port it to TSX.** UC-04's `markup` contract is
   therefore HTML, unchanged. DESIGN:OS is a design tool, not a UI-code generator — a boundary
   worth stating because the whole code class rests on it.
2. **EaseUI has two legitimate UI roots** and no root `package.json`. BFS finds both. With
   `--ui-root` ruled out: largest wins, or the one question `learn.md` §2 already budgets for?
3. **UC-04 variant axes** — dana's Button is 8 × 3 × 3. `name` is `Category/Variant`;
   `variants` is optional. Which axis becomes the record? Undecided; must be stated in
   `plan.md`, not discovered by the implementer (Art V).
4. ~~Does anything else write a sealed artifact without resealing?~~ **PARTLY RESOLVED — and
   it is worse than the question assumed.** `registry register` has **five** callers in
   `templates/`: `learn.md`, `redesign.md`, `extract.md`, `check-consistency.md`, and
   **`generate.md`** (Step 7, *"register new components"*). So `/ui:generate` — the flagship
   verb — tampers the DS whenever it registers. The reseal is a **shared-layer repair with
   five callers**; spec 009 is just the first road that cannot open without it. **Still open**:
   whether any *other* writer of a sealed artifact (beyond `registry register`) also skips the
   reseal. That enumeration is UC-04's Art IV audit and must run before any patch.

5. ~~Does `/ui:generate` break every project it registers into?~~ **RESOLVED — yes, silently.**
   `generate.md` Step 7 shells out to `ui registry register` and proceeds directly to Step 8
   (present the variants). **No reseal, no `ds status` check.** So the flagship verb tampers
   the store and does not look. The damage surfaces in a later session, when something else
   loads the DS — the definition of a SILENT defect. **R2 is therefore a repair, not an
   extraction**: nothing anywhere reseals on the incremental path.
