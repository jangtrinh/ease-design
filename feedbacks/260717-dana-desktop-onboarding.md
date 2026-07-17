# Dogfood — dana-desktop brownfield onboarding (2026-07-17)

**Product:** `aitomatic/dana-desktop` — React 19 + Vite 6 + Tailwind CSS 4, UI at `src/desktop-ui/` (499 ts/tsx, ~84k LoC).
**Existing DS:** `dana-tokens.css` (443 ln — tier1 primitives + tier2 semantic, DTCG-shaped) + `index.css` (1364 ln — `@theme` + per-theme override blocks).
**Attempted:** `ui init --runtime claude` → onboard journey → E2 (brownfield-code) → `/ui:learn` → learn-from-code.
**Toolchain:** ui 0.1.0, Node 22.23.1. Both doctors green; **all 5 optional hands present** (figma-agent, recall, pixelshot, a11y-audit, page-shot).

**Outcome:** DS sealed and healthy — 286 tokens, 102 semantic→primitive aliases, `ds status` OK, `ds context --strict --with-theme` exit 0. **0 components registered** — not for lack of evidence, but because registration is structurally blocked (F1). The learn.md quality gate ("when the source was code, ≥1 component is registered") is therefore **unsatisfiable today**.

---

## F1 · BLOCKER — `registry register` never reseals → every registration tampers the DS

`ui registry register` mutates `component-registry.json` but does not update the manifest hash. Any registration ⇒ `DS_TAMPERED`. Universal — **not** import-specific; reproduced from a clean `ds init`:

```sh
ui ds init testds --persona data-dense-observatory --intent "probe"
ui ds status                      # OK
printf '<button class="x">Hi</button>' > b.html
ui registry register "Button/Primary" --category button --markup b.html --states default --description "probe"
ui ds status                      # DS_TAMPERED
```
```
registry file hash mismatch — manifest has sha256-SSt6…, file hashes to sha256-xJKd….
The registry was modified outside a sanctioned command.
```

The message says "modified outside a sanctioned command" — but `registry register` **is** the sanctioned command. Doctrine collides head-on:

- `extract.md` step 8 = register every component → step 9/10 = `ds context --strict` must exit 0. **Cannot both hold.**
- `extract.md` step 10 calls `DS_TAMPERED` *terminal* ("surface it and stop") — so following the workflow ends in a documented dead-end.
- `learn.md` quality gate wants ≥1 component **and** a clean load.

`change-token` does **not** heal it (tested — reseal recomputes the tokens hash, not the registry hash):
```
after register       -> DS_TAMPERED
after 1 change-token -> DS_TAMPERED
```

**Fix:** `registry register` must reseal (bump generation + rewrite both hashes), exactly as `change-token` does for tokens.

## F2 · BLOCKER — `ds import` rejects the alias model it mandates

`ui ds import` accepts **literals only**. Every alias-valued token is dropped:

```
ui ds import dana-flat.json --dir . --name dana-web
→ imported: 176  skipped: 87
   skip: color.surface-content-alt | unmappable string value "{color.gray-25}"
   skip: color.surface-chrome      | unmappable string value "{color.gray-900}"
```

The 87 dropped **are exactly the tier2 semantic layer** — i.e. import survives only by destroying the two-tier structure. That contradicts design:os's own doctrine:

- `knowledge/token-taxonomy.md:110` — *"UI markup and components consume semantic tokens only."*
- `token-taxonomy.md:117-122` — one flat tier is the named anti-pattern.
- `ui tokens compile` **accepts** `{color.gray-25}` (exit 0) — so the alias syntax is valid everywhere except the one command documented to onboard an existing token set (`onboard.md` E5).

Compounded by F3: dropped paths can never be re-added.

**Workaround found (works, 102/102):** import **literals** so every path exists, then re-point the semantic tier with `change-token`:
```sh
ui ds import dana-literal.json --dir . --name dana-web     # 286 in, 13 skipped (composite shadows/durations)
ui ds change-token color.text-primary --value "{color.gray-900}"   # ×102 → all OK
```
Verified end-to-end: `color.text-primary = {color.gray-900}` → `@theme` emits `--color-text-primary: #181818`.

**Fix:** teach `ds import` the alias form, or document the import→re-alias two-phase dance in `onboard.md` §4.

## F3 · BLOCKER — `ds import --force` silently wipes the registry and resets generation

The only escape from F1 is `ds import --force` — which destroys the work it's recovering:

```
(before) tokens 286 · components 3 · generation 103
ui ds import v2-literal.json --dir . --name dana-web --force
(after)  tokens 286 · components 0 · generation 1      ← registry wiped, all 102 change-tokens lost
```

No warning, no prompt, no mention in `--help`. `onboard.md` §4 actively recommends this command for the stale-seal case ("`--force` to reseal, THEN `ui agents init --force`") without noting it nukes the registry.

Net: **no sanctioned sequence produces a sealed DS containing both extracted tokens and registered components.**

**Fix:** `--force` should reseal without touching `component-registry.json`, or refuse when the registry is non-empty.

## F4 · SILENT — `designmd extract-tokens --css` honours only the LAST occurrence

Signature advertises repeatable (`[--css <path>...]`). Only the last is read; earlier ones vanish with no warning:

| invocation | colors | customProps |
|---|---|---|
| `--css dana-tokens.css` | 122 | 330 |
| `--css index.css` | 66 | 249 |
| `--css dana-tokens.css --css index.css` | **66** | **249** | ← first file dropped
| `--css index.css --css dana-tokens.css` | **122** | **330** | ← first file dropped

Caught only by cross-checking counts; a real session would have compiled a DS missing half its evidence and never known. Workaround: `cat a.css b.css > combined.css`.

**Fix:** accumulate, or hard-error on a repeated single-value flag.

## F5 · SILENT — `registry register --tokens` validates then discards

The flag parses and validates (it emits `BAD_TOKEN` for a bad path — proof it is read), then is not persisted:

```sh
ui registry register "Button/Primary" … --tokens "color.accent-strong,color.on-accent,radius.sm"   # ok: true
python3 -c "import json;print(json.load(open('design/component-registry.json'))['components'][0].get('tokens'))"
# → None      (--states persisted fine: ['default','hover','focus','disabled'])
```

`extract.md` step 10 check 2 demands *"every record … declare at least one entry under `tokens`"*. That gate cannot pass even if F1 were fixed.

## F6 · CONTRADICTION — `ds import` writes camelCase categories the registry validator forbids

`registry register --tokens` enforces `^[a-z][a-z0-9.-]*$`. `ds import` creates camelCase groups. Result on dana — **28 of 286 tokens permanently unreferencable from any component**:

```
✓ referencable    color      (237)
✗ UNREFERENCABLE  fontSize   (12)      ← includes text-body/control/caption/micro,
✗ UNREFERENCABLE  fontWeight (4)          the sizes dana's components use 241/173/156×
✗ UNREFERENCABLE  lineHeight (6)
✗ UNREFERENCABLE  zIndex     (6)
✓ referencable    radius (8) · space (13)
```
```
BAD_TOKEN: invalid token path 'fontSize.caption' — must match ^[a-z][a-z0-9.-]*$
```

**Fix:** one casing convention across writer and validator (`font-size` / `z-index`), or relax the validator.

## F7 · CONTRADICTION — persona is unreachable on the import path

`ds import` has no `--persona`; manifest lands `persona: imported / imported`. `extract.md` step 5 *mandates* synthesizing a best-fit slug (scored against `persona-index.md` §2). Impossible via import. dana's DS therefore carries a non-persona label.

## F8 · GAP — persona slugs are not the persona filenames; the error doesn't say so

```sh
ui ds init testds --persona editorial-minimal   # ← a real filename in knowledge/personas/
→ PERSONA_NOT_FOUND
ui ds init testds --persona data-dense-observatory   # ← slug from the persona-index.md table
→ ok
```
`knowledge/personas/*.md` are **families**; slugs live only in the `persona-index.md` table. `PERSONA_NOT_FOUND` should name the lookup source.

## F9 · GAP — learn→extract routing has no valid input for a component codebase

`learn.md` step 3 routes **Code** → `extract.md`. But `extract.md`'s own Inputs say: *"A single HTML artifact. Multi-file extraction is out of scope for v1."* A React/Tailwind app has no representative HTML — dana's only `.html` files are SPA shells (splash markup). Nothing in the doctrine bridges **CSS-custom-property token systems → the DS**, which is the single most common brownfield shape.

The path that actually worked (parse `:root` + `@theme` → flat literals → import → re-alias) is invented, not documented.

## F10 · GAP — `ui scan` cannot see a UI that isn't at the repo root

dana's UI lives at `src/desktop-ui/`. Neither vantage point sees the whole product:

| `--cwd` | framework | styling | cssFiles | componentDirs |
|---|---|---|---|---|
| repo root | `react` | `tailwind` | **[]** | **[]** |
| `src/desktop-ui` | **null** | `css` | 3 ✓ | ✓ |

`learn.md` step 3a ("using the scan's `componentDirs`, `htmlFiles`, `cssFiles`, select 3–5 files") therefore has **nothing to sample** — and the scan reports `ok: true`, so nothing signals the miss. `verdict: brownfield-code` is right for the wrong reason (it saw `package.json`, not the UI).

**Fix:** `--ui-root`, or walk for `index.css`/component dirs below root.

## F11 · NOISE — `ds a11y` cartesian default buries its own signal

```
ds a11y: 1432 text×surface pair(s) checked (roles inferred from token names — cartesian;
prefer -foreground pairing or --pairs), 948 below AA (4.5:1).
  ✗ color.badge-danger-text on color.badge-neutral-bg — 1:1 (fail)
  ✗ color.badge-danger-text on color.elevated — 1:1 (fail)
```
948 "failures" on a palette that is largely fine — pairs like `badge-danger-text` on `elevated` are combinations that never render. The tool flags its own inference in the banner, then reports anyway. A first-time user reads "948 below AA" as a verdict on their product. **Default to declared/`-foreground` pairs; make cartesian opt-in.**

---

## What worked — and earned its keep

- **`knowledge/token-taxonomy.md:121` independently diagnosed dana's central disease.** Its DON'T column — *"Dark mode = a parallel hardcoded set"* vs the DO — *"a second semantic layer over the same primitives"* — is **exactly** what dana's `index.css` does (4 themes × 12 hardcoded `--color-gray-*` each). It resolved an open architectural question from our own audit with an external principle. The knowledge base is the strongest part of design:os.
- **`onboard.md`'s `--name` STOP-gate** (default `imported-ds` poisons agent identity) — precisely the class of gotcha docs usually omit. Followed it; correct.
- **"Two doctors, not one"** — `design-os doctor --versions` is the only way to know a hand exists. Worth its section.
- **`designmd extract-tokens` provenance** — every value carries `file:Lnn`. This is what makes SOURCE-grade discipline enforceable rather than aspirational.
- **`change-token` alias round-trip** — 102/102, each atomic, generation + changelog per call. Solid.

## Unresolved questions

1. F1 is total — was `registry register` resealing lost in a regression, or never implemented? Any green E2E covering `init → register → ds context --strict` would have caught it, which suggests none exists.
2. Is `ds import` intended as a first-class on-ramp (`onboard.md` E5) or a fixture-loader? F2/F3/F6/F7 all cluster on it — it behaves like the latter while documented as the former.
3. `ds import`'s `intent` embeds the input file's **absolute path** (`imported from /private/tmp/.../v2-literal.json`) into the sealed manifest — leaks a scratchpad path. Intentional provenance, or should it record a digest?
4. Should the DS represent a **theme-resolved slice** or the theme-agnostic system? DTCG here has no modes; dana has 4 themes that invert the gray ramp. We imported the theme-agnostic primitives + semantics and excluded the per-theme override blocks — correct per `token-taxonomy.md:121`, but it means `ds a11y` audits a palette no single theme actually renders.
5. Component registration for dana is parked pending F1/F5. Evidence is ready (Button.tsx 8 variants × 3 sizes, real `hover/focus/disabled` states, Badge/Input/Tabs/Tooltip) — ~15 min once registration seals.
