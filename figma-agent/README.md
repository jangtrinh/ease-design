# figma-agent

The optional, non-deterministic "hands" for ease-design's Figma authoring track
(`/ui:to-figma`, see `../knowledge/figma-craft/` and `../knowledge/figma-agent-hand.md`).

It is a thin CLI that drives a Figma plugin over a local WebSocket relay — no
MCP, no LLM keys baked in, and no paid official write API. It only talks to
Figma through the public Plugin API, so it works on **Figma Free**.

```
you / an agent CLI ⇄ figma-agent CLI ⇄ local WebSocket broker (ports 9410-9419)
                                              ⇄ Figma plugin (Plugin API) ⇄ canvas
```

This package is a separate npm workspace inside the ease-design repo. It is
**not** part of the deterministic `ui` binary, is not published with the
`ease-design` npm package, and is not installed by `npm install ease-design`.
It needs the Figma Desktop app, network access for its local broker, and the
plugin loaded manually (see below).

## Structure

```
cli/          figma-agent CLI: commands, the broker daemon + WS transport
plugin/       Figma plugin: main-thread executor + a hidden-iframe HTML→Figma converter
shared/       wire-protocol types shared by cli/ and plugin/
scripts/      esbuild build script + an optional probe/ suite (site recon, visual diff)
```

## Build

From the repo root (`ease-design/`):

```bash
npm install                        # installs figma-agent's deps too (npm workspaces)
npm run build --workspace=figma-agent
npm run typecheck --workspace=figma-agent
```

This produces `cli/dist/figma-agent.js` (the CLI) and rebuilds `plugin/code.js`
+ `plugin/ui.html` (the plugin bundle) from `plugin/src/`.

## Load the plugin

Figma Desktop → Plugins → Development → Import plugin from manifest → select
`plugin/manifest.json` in this folder. Keep it open while using the CLI; the
CLI's broker daemon auto-starts and the plugin auto-reconnects to it.

## Use the CLI

```bash
FA="node $(pwd)/cli/dist/figma-agent.js"
$FA status                          # spawns the broker if absent; needs the plugin open
$FA create-frame --name Card --w 320 --h 200
$FA html-to-figma --html page.html --width 1440
$FA export-png --node <id> --out out.png   # then Read the file to see the result
```

Every command prints one JSON object to stdout. See `cli/src/commands/` for
the full command list.

## The `probe/` suite (optional)

`scripts/probe/` holds a small set of Playwright/Puppeteer-based helpers for
reconnaissance and visual-diff work on external sites (recon, network
capture, screenshot diffing). These use heavier browser-automation
dependencies (`playwright`, `puppeteer-core`, `pixelmatch`, `pngjs`) that are
declared as `optionalDependencies` — they do not block installing or building
the core CLI/plugin if they fail to install in a given environment. Run
`npm install playwright` inside this workspace to enable them.

## Attribution

- Broker/relay design adapted from `southleft/figma-console-mcp`'s
  websocket-server pending-request correlation and heartbeat approach (MIT).
- The plugin's HTML→Figma converter and node executors are ported from an
  earlier EaseUI internal tool (`figma-export.ts` / `figma-plugin/code.ts`).
- `scripts/probe/` ideas draw on `Jane-xiaoer/claude-skill-web-clone`'s
  `visual-diff.mjs` approach to measurable pixel-diff scoring.
