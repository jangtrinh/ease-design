# Art IV audit — who writes a sealed artifact without resealing?

**Date**: 2026-07-17 · **Blocks**: Phase 1 (`plan.md` OQ3, `tasks.md` T1)
**Question** (Art IV): *"which other consumer has this blind spot?"* — asked **before** patching
`registry.ts`, because the answer decides patch-vs-extraction.

## Answer: TWO unsealed writers, not one. Phase 1 is an EXTRACTION.

The seal = `ds.manifest.json`'s `compiledHash` (over tokens) + `registryHash` (over the
registry) + `generation`. `design-system.ts:180` verifies both on every load;
`:109-115` throws `DS_TAMPERED`.

| Writer | Writes | Reseals? | Evidence |
|---|---|---|---|
| `ds-init-impl.ts:185` | sealed registry + tokens | **✓** | `registryHash` `:200`, `appendChangelog` `:217`, `saveManifest` `:231` |
| `ds-import-impl.ts:85` | sealed registry + tokens | **✓** | `registryHash` `:80` via `newManifest` |
| `ds-change-token-impl.ts:329` | sealed tokens | **✓** | `canonicalHash` `:301`, `appendChangelog` `:303` |
| **`registry.ts:189`** | **sealed registry** | **✗** | no `hash`/`manifest`/`reseal` token anywhere in the file (319 ln) |
| **`figma-reconcile-run.ts:167`** | **sealed registry** | **✗** | `REGISTRY_RELPATH = ["design","component-registry.json"]` (`:44`) — the exact path the seal covers (`design-system.ts:55`); zero `manifest` references in the file |
| `ingest-figma-ds.ts:172` | `<outDir>/component-registry.json` | n/a | Writes the **portable, unsealed bundle** by design (`onboard.md` §1 E4: *"portable, **unsealed** bundle"*); `ds import` seals it afterwards. **Not** a violation. Edge case worth a guard: `--out ./design` would write the sealed path. |

**`ui figma reconcile --apply` is the second unsealed writer** — the spec 004 live-sync loop,
whose entire purpose is to keep the registry a near-real-time reflection of the Figma canvas.
Every sync tampers the store.

### The method check passed

Per the scar in `brainstorm.md` R4 — *if it looks like a hole, first assume it is a decision and
go find the sentence that made it* — I looked:

- `figma-reconcile-run.ts:1-14` is a detailed 14-line header covering IO ownership, purity,
  `--dry-run`/`--apply`/`--mirror-file` semantics, and Art I.2. **It says nothing about the seal.**
- `specs/004-figma-live-sync/*` and `specs/005-figma-mirror/*` mention `manifest` twice, neither
  about resealing after a reconcile.

**No decision was made.** This is an omission, not a design.

## Live proof — it is broken in production, right now

Not a scratchpad repro. `platform-design-system` — one of the **two** projects DESIGN:OS has
ever onboarded, and one of the two legs of spec 006's P5 real-data gate:

```
$ ui ds status --dir /Users/jang/Products/platform-design-system
ui: registry file hash mismatch — manifest has sha256-SSt6U5_2txSLRWCLIhVJ2XMsW2WODUBMKGFj44qhvZI,
    file hashes to sha256-AnR0wc73wmAOAy21XUTjOoShCIR4PqHGeBK6t80M0zk.
    The registry was modified outside a sanctioned command.
```

Its `design/figma.changes.jsonl` holds **162** entries (VSF-PCP: **4335**) — reconcile ran, a
lot. Nobody noticed because **no loop that writes the registry ever loads the DS afterwards**:
`generate.md` Step 7 registers and goes straight to Step 8; reconcile applies and advances its
cursor. The check exists (`ds status`) and nothing calls it at the moment of damage.

## Why this was invisible

The two onboarded projects are Figma-side. Their registry is normally written **wholesale** by
`ingest-figma-ds` → `ds import` — paths that reseal because they rebuild the store. The
**incremental** writers (`registry register`, `figma reconcile --apply`) are the ones nobody's
world exercised end-to-end against a `ds status`.

## Consequence for Phase 1

1. **Extract, don't patch.** The reseal ceremony inlined at `ds-change-token-impl.ts:300-315`
   becomes a shared helper with **three** callers: `change-token` (proving the extraction),
   `registry register`, `figma reconcile --apply`.
2. `registry.ts` is 319 lines — the helper does not live there (Art IX).
3. **Art II**: the helper ships with the check that fails without it — a test that writes a
   sealed artifact through each caller and then loads the DS. The absence of exactly this test
   is why two writers drifted.
4. **Recovery is out of scope but must be named**: `platform-design-system` is tampered *today*.
   Fixing the writers does not un-tamper it. Either `ds import --force` (which destroys the
   registry — F3, same premise) or a reseal-in-place escape. **Flag to the owner; do not
   silently repair someone's store.**

## Bonus findings (recorded, not fixed here)

- `saveRegistry` (`registry-store.ts:336`) uses `JSON.stringify`, not `canonicalStringify` —
  contradicting the mandate at `ds-manifest.ts:4-7` (*"Every writer in this codebase must call
  canonicalStringify"*). Harmless today (`verifyHashes` hashes the **parsed** object), latent
  the moment anything hashes bytes.
- `ds-import-impl.ts:84-86` writes `canonicalStringify(x) + "\n"` while `canonicalStringify`
  already appends `"\n"` (`ds-manifest.ts:74`) — every imported file lands with a doubled
  trailing newline. Hashing is unaffected; `ds init` and `ds import` produce byte-different
  artifacts for the same content.
- **VSF-PCP's own DS is named `imported-ds`** — the exact default `onboard.md` §4 raises a
  STOP-gate against (*"the default `imported-ds` poisons agent identity"*), and which the dana
  dogfood praised the docs for warning about. The flagship dogfood project fell in the hole its
  own doctrine documents. Its `intent` also carries an absolute scratchpad path
  (`/private/tmp/.../flat-tokens.json`) — the leak dana filed as open question 3 — and it sits
  at `generation: 1`, meaning its history was reset by a `--force` at some point.
- **Spec 006's P5 gate declared PASS on 1 of the 2 projects `plan.md:39` requires**, and the
  report does not say why `platform-design-system` was omitted. Probable cause, found here:
  its DS is tampered and it has **no `memory.events.jsonl` at all**, so the gate's own step 1
  (`ui memory compile --dir <p>`) could not produce a baseline. phase-05's risk table
  anticipated exactly this: *"If a project is unreachable, the gate is incomplete — say so and
  stop."* Not spec 009's to fix; recorded in `tasks.md` §Debts.
