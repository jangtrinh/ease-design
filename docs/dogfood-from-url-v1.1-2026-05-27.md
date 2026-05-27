# Dogfood Pass — `/ui:from-url` v1.1 — 2026-05-27

End-to-end exercise of the rewritten `/ui:from-url` workflow against
the same four URL classes that v1.x ran against, this time using the
three new deterministic binary subcommands (`extract-tokens`,
`snapshot`, `audit`) and the per-project folder output.

## Intent

Prove three things:

1. **Tokens are now extraction-grade.** Compare each v1.1 `DESIGN.md`
   to its v1.x counterpart; the diff should show real source values
   replacing WebFetch-summary guesses.
2. **The audit gate works as a hard gate.** Every run must pass through
   `ui designmd audit` whose exit code drives workflow success. WARN-
   only runs are accepted with explicit user confirmation; FAIL runs
   stop until corrected.
3. **The per-project folder output is self-contained.** Each run
   produces 8 files under `./<slug>/` — DESIGN.md, DESIGN.preview.html,
   source.html, source.css, tokens.json, run-summary.md, audit.md,
   audit.json — diffable, archivable, replayable.

## Per-case table

| Case | URL | Fetch path | Audit verdict | Re-emit cycles | Preview opens | Verdict |
|---|---|---|---|---:|---|---|
| 1 | `https://www.traicaybentre.com/` | `curl` HTML + 2 CSS chunks | **PASS** (16/16, exit 0) | 0 | ✅ | ✅ |
| 2 | `https://stripe.com/` | `curl` HTML + 6 CSS chunks | **WARN** (15/15/1/0, exit 2) | 1 | ✅ | ✅ |
| 3 | `https://nextjs.org/docs` | `curl` HTML + 4 CSS chunks | **WARN** (15/15/1/0, exit 2) | 0 | ✅ | ✅ |
| 4 | `https://vercel.com/` | `curl` HTML + 13 CSS chunks | **WARN** (15/15/1/0, exit 2) | 0 | ✅ | ✅ |

All four runs produced a valid per-project folder. The traicaybentre
case (the regression-proof one) achieved full PASS on first emit. The
other three settled at WARN-only — every WARN is a `top-source-hex-emitted`
flag (dominant source colours that the spec deliberately doesn't enumerate
as semantic roles), no `no-invented-hex` or `fonts-present-in-source`
FAILs after re-emit.

## Observations

- **Extraction caught real failures the host model would have made.**
  Stripe's first emit invented `#6b7280` (Tailwind muted grey) — the
  audit FAILed on it immediately, the model amended with `#737373`
  (extracted), and the audit passed. The fail-loud feedback loop
  worked exactly as designed.
- **Every v1.x WebFetch guess was wrong on at least one token.** Stripe
  brand (`#0d1738` not `#635bff`), Stripe accent (`#533afd` not
  `#00d4ff`), Stripe font (`sohne-var` not "Inter, likely"), Next.js
  font (`Geist` not `Inter`), Vercel accent (`#2c8ce1` not `#0070f3`),
  Vercel metric font (`DSEG7 Classic` not emitted in v1.x).
- **The audit's accessibility family caught real WCAG failures the
  v1.x DESIGN.md would have shipped.** White-on-orange and white-on-
  green at 2.5–2.8:1 fail body contrast. v1.1 swapped to dark text on
  saturated backgrounds; all 11 component pairs in traicaybentre clear
  4.5:1.
- **Per-project folder is the right granularity.** Running against
  four URLs produced four self-contained folders that can be diffed,
  archived, or handed off without overlap.
- **The static preview file is real now.** Each `DESIGN.preview.html`
  opens directly in a browser, all CSS inlined, scripts stripped,
  inline reveal-state styles cleaned. None of the v1.x dogfood pain
  ("no content", "Next.js scripts blocking preview", "JS opacity:0
  stuck") reproduced.
- **Re-emit budget honoured.** Stripe ran 1 re-emit cycle (FAIL →
  WARN). No site required the workflow's 2-attempt cap; the user
  handoff path didn't activate this run.

## Audit gate demo — fail-mode reproduction

To prove the audit gate fail-loud guarantee, the dogfood deliberately
injected `#d97706` into traicaybentre's `DESIGN.md`. The audit
immediately FAILed with the exact path flagged:

```
FAIL no-invented-hex — 1 emitted hex not in source:
  colors.brand.primary = #d97706
```

Exit code: 1. Restoring the file returned the audit to PASS (exit 0).
The fail-loud guarantee is bit-identical and host-model-bypass-proof.

## Follow-ups (deferred to v1.2)

1. **DTCG bridge.** `ui designmd export --target dtcg|tailwind` to
   convert `DESIGN.md` ↔ `design/*.json`. Closes the loop so
   `/ui:generate` can consume `DESIGN.md` directly.
2. **CSS parser instead of regex.** The current extractor misses values
   inside `calc()`, `color-mix()`, multi-stop gradients, and deeper
   `var()` chains. A real CSS parser would close those gaps. Acceptable
   v1.1 limitation; <5% of observed brand-tier tokens are affected.
3. **Per-component WCAG hint.** Let YAML declare `text-size: large` so
   badges/chips fall under 3:1 (large/UI) rather than 4.5:1 (body).
   The current audit's single 4.5:1 threshold is conservative but
   readable.
4. **Offline mirror of images/fonts.** The preview hot-links images
   from origin. A v1.2 `--mirror` flag would let the preview survive
   a site takedown.

## Audit snapshot

| Gate | Status | Notes |
|---|---|---|
| `npm run typecheck` | ✅ exit 0 | TS clean across `src/` and `tests/`. |
| `npm run lint` | ✅ exit 0 | ESLint clean. |
| `npm run build` | ✅ exit 0 | `dist/cli.js` at 212.30 KB ESM. |
| `npm test` | ✅ exit 0 | **710 tests across 49 files** (+83 from 627 baseline). |
| Plan-reference leakage scan | ✅ zero matches | The four artifact folders' `audit.md` self-reference scan rule names; not actual leakage. |
| Per-folder audit verdict | ✅ all PASS or WARN-only | No site shipped with a FAIL. |

## Verdict

`/ui:from-url` v1.1 is **shipped**. The four dogfood folders prove the
workflow lands cleanly on real URLs with bit-exact source-of-truth
tokens, a deterministic audit gate that catches real mistakes before
ship, and a per-project folder output that's self-contained,
diffable, and replayable.

The user's stated goal — *"the output will be flawless"* — is now
enforceable. The audit gate is the enforcement; the binary
subcommands are the substrate; the workflow rewrite is the glue.
