# `/ui:figma` — Import a Figma frame and produce HTML

Import a Figma frame (file + node) and generate a 1:1 HTML/Tailwind reproduction. The
workflow pulls structured data from Figma, compiles or updates the project's design
system from the Figma tokens, then generates HTML constrained by both the structure
and the resulting design system.

## Important — what the binary does NOT do

The `ui` binary makes **no network calls** and never talks to the Figma API. The
deterministic part of this workflow is local-only: token compilation, autofix,
layout validation, registry checks.

The **host CLI / host model** is responsible for:

- Calling the Figma REST API to fetch the node tree, exporting a screenshot, and
  exporting any image fills as data URIs.
- Resolving the user's Figma personal access token. The user must have a token in
  their environment (typically `FIGMA_TOKEN` or `FIGMA_ACCESS_TOKEN`); if neither
  the host CLI nor the user can supply one, stop and ask.

If the host CLI cannot make outbound HTTPS calls and the user has not pre-exported
the Figma data, stop and tell the user how to export it manually (Figma's "Copy as
JSON" + a screenshot is a workable fallback).

## Inputs

- `<figma-url>` — any Figma frame URL of the form
  `https://www.figma.com/(file|design)/<fileKey>/<title>?node-id=<nodeId>`. Both
  `file/` and `design/` URLs are accepted; the `node-id` query parameter is
  required.
- *(optional)* `--mode <mobile|desktop>` — overrides the inferred mode. If omitted,
  infer from the frame's width: `<= 480 px` → mobile, otherwise desktop.
- *(optional)* `--no-tokens` — skip the design-system compile step (use the existing
  DS, do not derive new tokens from the Figma file). Defaults to off.
- *(optional)* `--ds-name <slug>` — name for the design system if one has to be
  initialised. Defaults to the Figma file's title slugified.

## Steps

### 1. Parse the Figma URL

Extract `fileKey` and `nodeId` from the URL. Reject malformed URLs early with a
clear error — never silently strip query parameters.

### 2. Fetch Figma data (host CLI)

The host model uses its tool/HTTP capability to call the Figma API with the user's
token:

- `GET /v1/files/<fileKey>/nodes?ids=<nodeId>&geometry=paths` — the node tree.
- `GET /v1/images/<fileKey>?ids=<nodeId>&format=png&scale=2` — a screenshot of the
  frame (used as a visual anchor).
- `GET /v1/images/<fileKey>?ids=<nodeIds-of-image-fills>&format=png&scale=2` — image
  fills, exported as PNG and base64-encoded into data URIs.
- *(optional)* `GET /v1/files/<fileKey>/styles` — published styles for cleaner token
  names.

Persist the raw payloads under `output/<slug>-figma/raw/` so a rerun can skip the
network round-trip.

### 3. Normalise the node tree

Walk the node tree and emit a compact representation the model can reason about
without paying the full payload cost. For each visible node emit, on one line:

```
<indent><Type> <NodeName> WxH  bg:#hex  pad:T R B L  r:N  border:Npx #hex  opacity:N
        <indent>  font:<Font> Npx wN lhNpx lsN <align>  text:"<verbatim text>"
```

Encoding rules (the same conventions `ui:figma` will reference downstream):

- `WxH` → bounding box in px.
- `bg:#hex` → fill. Layered fills are comma-separated (`bg:#hex1, #hex2`).
- `border:Npx #hex` for uniform strokes; `border:t:1 r:2 b:1 l:2` for per-side.
- `opacity:N` only when not 1.
- `clip:hidden` when the node clips its content.
- `rotate:Ndeg`, `blend:<mode>`, `blur(N)` only when present.
- Text nodes carry `font:<Family> <size>px w<weight> lh<line-height>px ls<letter-spacing> <align>`
  and the **verbatim** text content — never paraphrase.
- Layout direction: `row gap-N` / `col gap-N` for auto-layout frames.
- `pad:T R B L` only when any side is non-zero.
- `img:<assetId>` on nodes that have an image fill — `<assetId>` is the id of the
  exported asset from step 2.

Also compute a **structure quality score** in 0–100 from these signals:

| Signal | Contribution |
|--------|--------------|
| Auto-layout coverage | up to 30 |
| Sensible nesting depth (≤ 8) | up to 15 |
| Few single-child wrappers (`< 30 %`) | up to 15 |
| Few absolutely-positioned nodes (`< 20 %`) | up to 20 |
| Naming quality (human names, not "Frame 1234") | up to 20 |

This score decides how much to lean on the structure vs. the screenshot in step 6.

### 4. Derive design tokens from the file

Aggregate primitive design values across the node tree and any published styles:

- **Colors:** every distinct fill colour, deduped, sorted by frequency. Drop near-
  duplicates within ΔE < 2.
- **Typography:** distinct `<font-family, size, weight, line-height>` tuples.
- **Radii, spacing, shadows:** distinct values, deduped.

Emit a DTCG-shaped `design.tokens.json` with two tiers — primitive (raw values) and
semantic (role-based aliases). Use the rules in `knowledge/token-taxonomy.md` for
naming and the rules in `knowledge/color-science.md` for the 11-stop scale on the
dominant brand colour.

Write it to `output/<slug>-figma/design.tokens.json`.

### 5. Compile or update the project design system

If the current project has no design system:

```sh
ui ds init <ds-name> --persona <inferred-persona-slug> --intent "Imported from Figma frame <nodeId> in <fileKey>"
```

Pick the persona by feeding the Figma-derived signals (dominant colours, font
families, density signals) through `knowledge/persona-index.md`'s keyword-scoring +
industry-affinity rules.

Then merge the Figma-derived tokens into the design system, one value at a time, via
the only legal mutation path:

```sh
ui ds change-token <token-path> --value <value>
```

If the project already has a design system and `--no-tokens` is not set:

- Diff the Figma-derived tokens against `design.tokens.json` in the project.
- For each Figma token that does **not** collide with a project token, register it
  (same `ui ds change-token` call).
- For collisions, **do not** silently overwrite. Surface the diff to the user and
  ask whether to keep the Figma value, keep the project value, or alias one to the
  other. Tokens are immutable post-compile; a silent overwrite breaks the
  manifest's invariant.

Compile the tokens to Tailwind once for the generation step:

```sh
ui tokens compile output/<slug>-figma/design.tokens.json --target tailwind > output/<slug>-figma/theme.css
```

### 6. Produce a design brief

The model summarises the Figma frame as a short brief — one paragraph that names
the persona label, UI type, mode, and the dominant visual language. This is **not**
a substitute for the structural data; it is a sanity anchor the generator can read
in one pass.

### 7. Generate the HTML

Acting as an elite Figma-to-code engineer with the goal of a 1:1 reproduction
(no creative liberties), produce one HTML page using:

- The normalised node tree from step 3 as the **primary truth** when the structure
  quality score is ≥ 70.
- The screenshot from step 2 as the **primary truth** when the score is < 40; in
  that range the structural data is too noisy to trust.
- A **hybrid** approach in between: structure for layout, screenshot for exact
  colours and typography.

Apply these mapping rules verbatim — they keep arbitrary Tailwind values pinned to
the Figma source:

- `WxH` → see the layout constraint below for the active mode.
- `bg:#hex` → `bg-[#hex]`.
- `bg:#hex1, #hex2` → layered backgrounds via Tailwind utility composition.
- `border:Npx #hex` → `border-[Npx] border-[#hex]`.
- `border:t:1 r:2 b:1 l:2` → `border-t-[1px] border-r-[2px] border-b-[1px] border-l-[2px]`.
- `opacity:N` → `opacity-[N]`.
- `clip:hidden` → `overflow-hidden`.
- `rotate:Ndeg` → `rotate-[Ndeg]`.
- `blend:<mode>` → `mix-blend-<mode>`.
- `font:<Family> Npx wN lhNpx lsN <align>` →
  `font-[<Family>] text-[Npx] font-[N] leading-[Npx] tracking-[N] text-<align>`.
- `row gap-N` / `col gap-N` → `flex flex-row gap-[Npx]` / `flex flex-col gap-[Npx]`.
- `pad:T R B L` → `pt-[T] pr-[R] pb-[B] pl-[L]`.
- `r:N` → `rounded-[Npx]`.
- `shadow:...` → arbitrary shadow syntax (`shadow-[...]`).
- `blur(N)` → `blur-[Npx]`.

Execution constraints:

- Use **EXACT** arbitrary Tailwind values. No approximations like `bg-gray-900` or
  `text-sm` — always `bg-[#1E1E1E]` and `text-[15px]`.
- Reproduce text verbatim, including capitalization and punctuation. Never insert
  dummy text.
- Icons: prefer Lucide (`<i data-lucide="icon-name"></i>`) when a node's name
  obviously maps to an icon glyph.
- Images: for nodes marked `img:<assetId>`, render `<img src="{{<assetId>}}" ... />`.
  After generation, replace every `{{<assetId>}}` placeholder with the exported
  data URI from step 2 in a deterministic post-pass. Any `{{...}}` placeholder that
  does **not** match an exported asset falls back to
  `https://picsum.photos/seed/<assetId>/W/H`.
- Every `<img>` must carry the `onerror` fallback handler defined in
  `knowledge/mode-constraints.md`'s universal style guide.
- Do **not** add headers, footers, "Made by" credits, or watermarks that are not in
  the Figma frame.

Layout constraint (apply the matching mode block from
`knowledge/mode-constraints.md`):

- **mobile** — root `w-full min-h-screen`. Center on larger displays via
  `max-w-[<frame-width>px] mx-auto`. No device frames or bezels.
- **desktop** — root `w-full min-h-screen`. Never use a fixed width on the root.
  Content wrappers `max-w-[1200px] w-full mx-auto px-4 lg:px-[Npx]`. Grids
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Row flexes stack on mobile and use
  `sm:flex-row` on desktop.

Interaction constraint:

- **mobile** — `active:scale-95 active:opacity-80 transition-transform duration-150`,
  minimum 44 × 44 px touch targets.
- **desktop** — `hover:bg-opacity-90 hover:-translate-y-0.5 transition-all
  duration-200` on cards and buttons; `hover:opacity-80` on links;
  `focus:ring-2 focus:border-[brand] focus:outline-none` on inputs.

Before emitting, the model must self-check against the screenshot: layout matches,
colours match, typography matches, spacing matches, text is verbatim. Any "no"
triggers a revision before output.

### 8. Asset replacement (deterministic, local)

After the HTML is in hand, run a literal string-replace pass over the output:

- For every exported asset, replace `{{<assetId>}}` with its data URI.
- Any remaining `{{asset_<id>}}` placeholder is replaced with
  `https://picsum.photos/seed/<id>/800/600` so no `{{...}}` token leaks into the
  final HTML.

### 9. Deterministic post-pass

```sh
ui autofix output/<slug>-figma/index.html --write
ui validate-layout output/<slug>-figma/index.html
ui registry list                       # confirm the components used are registered
```

`ui autofix` fixes viewport-meta omissions, missing `onerror` handlers, missing
Lucide init, dirty CDN URLs, and duplicate ids. `ui validate-layout` runs the
structural-error + layout-smell checks. Both must come back clean.

## Outputs

- `output/<slug>-figma/index.html` — the generated HTML page.
- `output/<slug>-figma/design.tokens.json` — the Figma-derived token file.
- `output/<slug>-figma/theme.css` — compiled Tailwind theme from the token file.
- `output/<slug>-figma/raw/` — cached Figma API payloads for reruns.
- The project's `design.tokens.json`, `component-registry.json`, and
  `ds.manifest.json` are updated in place with any new tokens (per the immutability
  rule).

## Quality gate

Run `templates/workflows/critique.md` on the generated HTML.

- Score the 6 taste axes plus the consistency axis. Consistency is weighted heavily
  here: the import succeeded only if the design system was reused (no inline
  one-off colours that shadow an existing token).
- A **fidelity** check is added: spot-compare the rendered HTML against the
  screenshot. Deviations in colour (ΔE > 5), typography (size off by > 2 px), or
  layout (sections re-ordered, columns merged) count as a Layout/Typography
  failure and trigger the refine-the-failing-axis loop.
- Refine cap and surfacing behaviour follow `critique.md`.
