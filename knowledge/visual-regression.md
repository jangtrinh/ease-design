# Visual regression — catching the pixels a diff review misses

A code diff shows *what the source changed*; it can't show that a token tweak three layers
away nudged every button 2px, or that a refactor silently deleted a shadow. Visual regression
(VR) is the deterministic floor for *rendered* output: screenshot now → compare to a committed
baseline → flag real changes. The whole discipline is **staying trusted** — a VR gate that
cries wolf gets muted, so every design choice below optimises for *low false-positives*.

## The division of labour (constitutional)
The `ui` binary is deterministic and has **no browser** — it never takes a screenshot. Rendering
is the host's job (`figma-agent` / the HTML preview). The binary only **compares** PNGs the host
already produced. That keeps VR zero-dependency and identical on every runtime: a vendored pure-TS
PNG codec (`node:zlib` for inflate/deflate — a builtin, not a dependency) + a pixelmatch port.

## The #1 flake source is *where you render*, not the diff algorithm
Same HTML renders **differently across font stacks** — macOS vs Linux-CI antialiasing alone
paints thousands of "changed" pixels on an identical UI. So the load-bearing rule:

> **Render the baseline and the comparison on the same environment.** Capture baselines with the
> same host/OS/browser that the gate will run on. If the gate runs in CI, capture baselines in CI
> (commit *those* PNGs), never from a local Mac.

With that pinned, flake is near-zero and the algorithm can stay simple. The diff still defends
with two mechanisms: **anti-aliasing detection** (pixelmatch's YIQ neighbourhood test — AA edge
pixels are painted yellow and *not counted*) and **masks** for genuinely dynamic regions.

## The `ui vr` contract
- **`ui vr diff <base.png> <head.png>`** — one comparison. Perceptual YIQ colour delta with a
  `--threshold` (0–1, default 0.1); a pixel counts only if its delta clears the threshold *and*
  isn't anti-aliasing. Exits 1 when the changed-pixel ratio exceeds `--max-ratio` (default 0 — any
  real diff fails). `--mask "x,y,w,h;…"` ignores dynamic rectangles (timestamps, avatars,
  carousels). `--out diff.png` writes a diff image: unchanged dimmed, AA yellow, real diffs red.
  A **size mismatch is a hard regression** (you can't diff different dimensions).
- **`ui vr gate <baseline-dir> <current-dir>`** — the CI/loop shape. Diffs every baseline PNG
  against the same-named current render. A baseline with **no matching current** is a regression
  (a screen stopped rendering). A current with **no baseline** is `new`, *not* a failure — it's
  waiting to be accepted. Exit 1 iff any real regression. `--out-dir` dumps per-file diffs.
- **`ui vr accept <current-dir> <baseline-dir>`** — promote current renders to baselines when a
  change is intended. This is the human-in-the-loop step: a VR gate never *auto-updates* baselines
  (that would launder every regression into the new truth); a person runs `accept` on purpose.

## The workflow (LAND-time gate)
1. Render the screens you care about to a `current/` dir (full-page PNGs — reuse the preview you
   already generate; per-component matrices are a later refinement once the DS is large).
2. `ui vr gate baseline/ current/`. Green → land. Red → look at the `--out-dir` diffs.
3. Intended change? `ui vr accept current/ baseline/`, commit the new baselines *with* the code
   change, so the baseline delta is reviewed alongside the diff that caused it.

## Honesty rules
- A green gate means "pixels match the committed baseline **on this render environment**" — not
  "looks correct". A wrong-but-stable design passes; VR guards *change*, not *quality* (taste-lint,
  the a11y floor and the curator own quality).
- Never auto-accept baselines in the same run that detected the change. Acceptance is deliberate.
- Report masked area honestly — a mask that swallows half the screen isn't "0 diffs", it's untested.
