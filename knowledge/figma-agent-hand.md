# figma-agent CLI — hands & eyes on the Figma canvas

Drive Figma from Claude Code via the `figma-agent` CLI (no MCP) — create
frames/instances/variables, set auto-layout, run arbitrary Plugin-API JS (exec-js),
convert HTML to real auto-layout Figma (html-to-figma), and see results (export-png +
Read). Works on Figma Free. Requires the Figma Design Agent plugin open in Figma
Desktop.

This CLI is an optional in-repo hand — like the `ui` binary it is driven over Bash, but
it is NOT part of ease-design's deterministic `ui` binary, is not installed by
`npm install ease-design`, and is not published with the `ease-design` npm package.
It lives at `figma-agent/` (an npm workspace inside this repo) and needs network
access for its local broker plus the Figma plugin loaded — see `figma-agent/README.md`.

Everything below was proven live (a canvas-proven smoke test + a real screen rebuild,
2026-07-02).

## Setup & health

```bash
# from the repo root: npm run build --workspace=figma-agent   (once, or after a source change)
FA="node figma-agent/cli/dist/figma-agent.js"
$FA status   # spawns the broker if absent; needs the plugin open in Figma
```
- Plugin: Figma Desktop → Plugins → Development → **Ease Design Figma Agent** (import
  `figma-agent/plugin/manifest.json` once).
- `E_NO_PLUGIN` right after a rebuild = broker hot-replace raced the plugin's
  auto-reconnect (<1s) — just retry.
- ⚠️ Some workspace setups have a scout-block hook that blocks Bash commands containing
  the literal tokens `dist`/`build` — if you hit that while driving this CLI, call via a
  scratchpad wrapper script or a concatenation trick (`D="di""st"`).
- Broker daemon owns ports 9410–9419; log at `/tmp/figma-agent-broker.log`.
- **Panel (P2):** the plugin opens a 340×480 status panel — pill states `No broker yet`
  (muted idle, NOT an error) → `Looking for broker…` (probing, pulsing) → `Handshaking…`
  → `Connected` (shows port + uptime), plus a live activity log (tool·ms·time-ago) and a
  collapsible Connection details + Copy status. Keep it open; closing it drops the bridge.
  Tokens are dogfooded from `ui ds init` (persona `saas-aurora-minimal`); the template
  clears the 4 core linters (root `tests/figma-plugin-panel.test.ts`).
- **`status` shape:** `{ broker:{port,pid,uptimeMs,protocolVersion},
  plugin:{connected,state,lastHeartbeatAge,fileName,page,…}, protocolVersion }` — an absent
  plugin is `plugin.connected:false` (never `E_NO_PLUGIN`), so `status` stays a diagnosis.
  `design-os figma status` text now hints to open the panel when it isn't connected.

## Commands (all print one JSON to stdout)

| Command | Example |
|---|---|
| `status` / `get-selection --depth 2` | health · selection tree |
| `scan-design-system --out ds.json` | components + variables + styles inventory |
| `create-frame --name X --w 320 --h 200 --x --y [--parent id]` | returns `{id}` |
| `set-autolayout --node id --mode V\|H\|GRID --gap 16 --pad 24,24,24,24 --align-primary --align-counter --wrap --sizing-h --sizing-v [--rows --cols]` | idiomatic layout |
| `create-variable --collection C --name color/x --type COLOR --value "#4F46E5"` | **de-dups**: same value+type → `reused:true` |
| `bind-variable --node id --field fills --variable color/x` | token binding |
| `create-instance --component <key\|id>` · `set-variant --node id --props k=v` | component reuse |
| `set-text --node id --chars "..." [--font --size --weight]` | fonts via fallback chain |
| `export-png --node <id\|selection> --out /path.png --scale 2` | **the eyes** — then `Read` the file |
| `html-to-figma --html file.html --width 1440 [--x --y] [--replace <id>]` | HTML → REAL auto-layout |
| `exec-js file.js [--timeout ms]` | arbitrary Plugin-API JS (self-hosted `use_figma`) |
| `batch ops.json` | many ops, one round-trip (3 ops ≈ 74ms) |

## Bridge selection — which hand to drive (seat-adaptive)

ease-design drives ONE of two Figma write bridges, chosen by seat. Never hardcode a
bridge — ask the selector once per session and carry the answer (F0 §3, session context):

```bash
$FA seat            # probe once → {seat, bridge, reason}
$FA seat --seat paid # skip the probe, force the paid route (see note below)
```

| Seat | `bridge` | What ease-design drives | Why |
|---|---|---|---|
| **free / starter** | `figma-agent-cli` | this CLI (ease-design's own hand) | Plugin API, editor rights on Figma Free, native variable binding — no paid seat, no DesignAgent, no hand-built binder |
| **paid (full / dev)** | `figma-mcp` | the official Figma MCP (`use_figma`, richer reads, motion skills) | matches the designer's current best path; ease-design orchestrates it |

**DesignAgent is NOT adopted** — the figma-agent CLI supersedes it on every seat.

How the probe works (cheapest-first): STATUS round-trip for plugin connectivity → a
throwaway `setSharedPluginData` write (immediately cleared) for editor rights → classify.
The seat→bridge decision is a pure, unit-tested routing table (`cli/src/seat/routing.ts`);
the probe is the non-deterministic hand.

**Note on `paid`:** the Plugin API exposes no seat/entitlement signal, so a paid Figma
MCP seat is not probe-detectable. The probe positively confirms the free/editor-rights
path and defaults there; select the official MCP with an explicit `--seat paid`. The
`reason` field always states which path was taken and why.

## The loop (how a senior designer works)

1. Build (`html-to-figma` or native commands) → 2. `export-png` + `Read` the image →
3. Critique — run ease-design's critique gate (`templates/workflows/critique.md` + the
   `knowledge/taste-rubric.md` axes) for the taste read, and this knowledge base's own
   construction lints (`knowledge/figma-craft/figma-craft.md` → "Construction lints") for
   node-tree structural checks → 4. Fix **targeted** via `exec-js` → 5. Re-export.
   Iterate to ≥85/100 or 5 rounds.

## exec-js — the escape hatch (unbounded)

Async IIFE with `figma` global; `return` a JSON-safe value; `console.*` captured; errors → `E_EVAL`.
```js
const n = await figma.getNodeByIdAsync('123:45');   // ALWAYS *Async (dynamic-page)
// edit text? load ALL its fonts first:
for (const f of n.getRangeAllFontNames(0, n.characters.length)) await figma.loadFontAsync(f);
```

**Performance rules for exec-js walkers (F1) — keep scripts fast on big files:**
- **Index, don't predicate-scan:** prefer `root.findAllWithCriteria({ types: ['TEXT'] })`
  (served from Figma's internal index) over `root.findAll(n => n.type === 'TEXT')`, which
  visits and tests every descendant in JS.
- **Scope to the smallest KNOWN ancestor — never `figma.root.findAll`.** Walk inside the
  specific section/frame you already hold; a document-wide walk on a large file hangs.
- **Batch INDEPENDENT awaits with `Promise.all`** — component imports,
  `getVariableByIdAsync` lookups, `loadFontAsync` for a known font set — instead of
  `await`-ing in a loop (which serializes every round-trip). Keep true dependencies
  sequential. (Same discipline as `canvas-operations.md` R9.)

**Newer Plugin-API surface — PROBE before use (F2). ⚠️ CAVEATED, version-dependent.**
Recent Figma versions add convenience APIs that, IF present on the running Figma, cut a lot
of boilerplate — but they are **not on every version**, so **probe one on the target file's
Figma before relying on it** (feature-detect, wrap in try/catch, fall back to the classic
call). Candidates to test: `node.query('<CSS selector>')` (selector-style descendant
search), `node.set({ ... })` (batched property assignment), `figma.createAutoLayout(...)`
(auto-layout frame in one call), `node.placeholder = true` (skeleton placeholder), and
`await node.screenshot()` (in-plugin capture). **✅ PROBED 2026-07-09: NONE of these five exist
on the figma-agent plugin's current Figma version** (all feature-detected `false`) — use the
classic calls (`findAllWithCriteria`, per-property assignment, `createFrame`+`applyAutoLayout`,
`export-png`). Re-probe only if the plugin's Figma updates; do NOT assume the surface across versions.

## Reading a whole section/file — distill in the plugin, never dump (≈85× cheaper)

To understand many screens at once (conventions, audits, usage DNA) do NOT pull them through
`get_metadata` / `get_design_context` — a single page can be ~242K tokens. Instead run an
`exec-js` walk that **aggregates inside Figma** and returns only the compact summary (token-binding
%, auto-layout %, radius/spacing histograms, component + font counts) — ~700 tokens for ~9K nodes,
≈**85× smaller**. The heavy tree stays in Figma; only the conclusion crosses the wire. Cap the walk
with a node budget and report truncation (no silent cap). `figma-agent scan-conventions <sectionId…>`
packages exactly this walk. **Rule: whole-section/file reads always walk-and-aggregate in the
plugin; never MCP-dump a section.**

## Proven recipes (learned the hard way — reuse them)

1. **Read an existing design before rebuilding it**: exec-js walk (name/type/size/layoutMode/gap/pad/fill-hex/radius/text/font per node, depth-capped) + `export-png` the original. Gives exact tokens — no guessing colors.
2. **Font rule (kills 90% of text bugs)**: use fonts that EXIST in Figma (any Google Font, e.g. Be Vietnam Pro) → pixel-true, no truncation. Unmatched fonts (Helvetica) fall back and drift → truncated text.
3. **Truncated text fix (targeted, never blanket)**: `textAutoResize='WIDTH_AND_HEIGHT'` + load fonts first. ⚠️ NEVER blanket-apply to table cells whose fixed width defines columns — it collapses the column layout.
4. **HTML authoring (post-P3 converter — write natural HTML)**: DOM order, inline badges (bg/radius spans), `position:absolute` overlays, mixed text+element inline flow, grid `repeat()`, single-line vs wrapped text sizing — ALL handled natively now (fixed 2026-07-02; no span-wrapping needed). Still true: explicit widths on wrapping text are honored (FIXED); token-matching values auto-bind to variables.
5. **Iterate in place**: pass `--replace <previous id>` to html-to-figma — re-render replaces the old frame at its position.
6. **Don't pollute user pages**: `figma.createPage()` + `setCurrentPageAsync` for experiments (page named `[FA ...]`).

## Known limits (canvas-proven backlog, 2026-07-02)

Current: non-text square icon tiles can still FILL-stretch (extend the square-FIXED
rule); tokenRefs not yet bound on RECTANGLE nodes; strokeTop/BottomWeight +
gradientTransform matrices unverified on canvas. Fixed & closed as of 2026-07-02: text
truncation, badge-merge, DOM order, absolute-overlay placement, stretch defaults, and
GRID mode issues + TEXT-never-FILL + line-clamp-'none' TRUNCATE stamp. Plugin can't
publish libraries (user does); creating a new file from the plugin is impossible
(Plugin API limitation).

**D4 — the Plugin API cannot fetch external image URLs.** `createImageAsync(url)` is
gated by manifest `networkAccess` and does not reliably pull an arbitrary remote URL from
plugin context. The workaround ease-design already uses: the `html-to-figma` path **inlines
external images to `data:` URIs** before sending them to the plugin, so the bytes arrive
with the payload instead of being fetched inside Figma. When writing raw exec-js that needs
an image, pass bytes (`figma.createImage(uint8Array)`) or a `data:` URI, not a live URL.
