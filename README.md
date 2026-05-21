# ease-design

A multi-runtime **design-cli**. Describe *what* you want; ease-design supplies all of
*how it looks*. A non-designer produces UI with the taste of a pro designer — by talking
to the agent CLI they already use (Claude Code, Codex CLI, Antigravity CLI).

> Distilled from [EaseUI](../EaseUI)'s design engine. Working name `ease-design`;
> the binary and slash-command namespace are `ui` / `/ui:*`.

## How it works

ease-design ships two runtime-neutral sources of truth and a thin per-runtime adapter:

- **`knowledge/`** — a plain-Markdown knowledge core (taste rubric, persona library,
  generation rules, component catalog, color science) the host model reads directly.
- **`ui` binary** — a deterministic Node CLI for non-LLM work (autofix, layout
  validation, token compilation, color math, component registry, export).
- **Adapters** — `ui init` generates the config a given agent CLI needs to know *when*
  to read the knowledge core and *when* to shell out to `ui`. The host CLI's own model
  generates HTML — no API keys.

A hard-gate critique→refine loop scores every generation across 6 taste axes + 1
consistency axis, so quality is enforced, not suggested.

## Install

No npm registry package — clone and build:

```sh
git clone <repo-url> ease-design
cd ease-design
npm install
npm run build
npm link          # exposes the `ui` binary on your PATH
```

Requires Node.js >= 20.

## Usage

```sh
ui --help
ui init --runtime claude     # wire ease-design into the current project (Phase 6)
```

In an agent CLI, the workflows surface as `/ui:generate`, `/ui:iterate`, `/ui:extract`,
`/ui:from-ref`, `/ui:figma`, `/ui:slides` (Claude Code namespace).

## Status

Early development — see the phased implementation plan and decision record:

- `plans/ease-design/brainstorm.md` (decision record)
- `plans/ease-design/implementation-plan.md` (8-phase plan)

both in the EaseUI repo. Phase 0 (repo scaffold) is complete.

## Repo layout

| Path | Purpose |
|---|---|
| `knowledge/` | Markdown knowledge core (Phase 1) |
| `src/cli.ts` | `ui` binary entrypoint + subcommand router |
| `src/commands/` | one file per `ui` subcommand (Phase 2) |
| `src/core/` | shared deterministic logic — color math, tokens, registry |
| `src/adapters/` | per-runtime adapter templates for `ui init` (Phase 6) |
| `schemas/` | JSON Schemas — `design.tokens.json`, component registry |
| `templates/` | workflow / skill Markdown templates (Phase 4) |
| `examples/` | dogfood outputs (Phase 7) |

## License

MIT
