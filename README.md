# ease-design

**Describe what you want in plain words — get production-grade, on-system UI back.**

ease-design is a multi-runtime **design CLI**. You drive it through the agent CLI you
already use (Claude Code, Codex CLI, or Antigravity CLI) with plain-language `/ui:*`
commands. The host model writes the HTML; ease-design supplies the taste — personas, a
compiled design system, and a hard quality gate — so the output looks like a pro
designer made it. **No API keys, no design tokens to hand-edit, no taste vocabulary to learn.**

<sub>`v0.1.0` · Node ≥ 20 · MIT · zero runtime dependencies · 766 tests green</sub>

> Distilled from EaseUI's design engine. The binary and slash-command namespace are
> `ui` / `/ui:*`.

---

## Who it's for

One engine, two audiences:

- **Designers** — turn intent into polished, on-system UI without writing HTML/CSS. You
  work entirely through plain-language `/ui:*` commands: describe it, get production HTML
  out, quality enforced by a taste gate you never have to babysit.
- **Developers** — the same `/ui:*` commands, **plus** a deterministic `ui` binary you can
  script directly: token-bound output, a component registry, and a machine-checked quality
  floor. Not a black box.

Both talk to the same two sources of truth, so a designer's output and a developer's output
obey the identical design system.

## Requirements

- **Node.js ≥ 20**
- **An agent CLI** — [Claude Code](https://claude.ai/code), Codex CLI, or Antigravity.
  This *is* the interface: ease-design is CLI-native by design. There is no separate GUI.

---

## Install

```sh
git clone https://github.com/jangtrinh/ease-design.git
cd ease-design
npm install
npm run build
npm link          # exposes the `ui` binary on your PATH
```

Verify the install is healthy:

```sh
ui doctor
```

`ui doctor` checks Node ≥ 20 and that the bundled `knowledge/`, `schemas/`, and
`templates/` all resolve with their key files — so you catch a broken setup immediately
instead of mid-design.

> Once published to npm, `npx ease-design` (or a global install) replaces the
> clone-and-link step.

---

## Quick start

### 1. Wire ease-design into your project

From the root of the project you want to design for:

```sh
ui init --runtime claude       # or: --runtime codex | --runtime antigravity
ui doctor --cwd .              # confirm the project wired up correctly
```

`ui init` writes a per-runtime adapter tree. For **Claude Code** that is
**10 `/ui:*` workflow commands** (`.claude/commands/ui/`) + **7 supporting skills**
(`.claude/skills/ease-design-*/`). Codex gets an `AGENTS.md` block; Antigravity gets the
equivalent workflow tree. Every generated wrapper anchors the absolute `knowledge/` path,
so the workflows resolve no matter where the project lives.

### 2. Design, entirely in plain words

Open your agent CLI in the project and type a `/ui:*` command:

```
/ui:generate a pricing page for a developer-tools SaaS — 3 tiers, dark theme
```

ease-design picks personas, compiles a project-scoped design system (semantic tokens →
Tailwind `@theme`), generates variants, and scores each through the critique gate before
you see it. Failing variants regenerate automatically. **You pick the winner by eye.**

### 3. Refine, still in plain words

```
/ui:iterate make the middle tier the visual hero; warm up the accent
/ui:refine
```

`iterate` translates your request into token/layout edits and applies them surgically;
`refine` runs the full critique→refine polish loop. The design-system hash-seal stays
intact throughout, so refinements can't silently drift off-system.

That's the whole loop: **describe → pick → refine.** No keys, no config, no CSS.

---

## The `/ui:*` workflows

These surface as slash-commands in your agent CLI (Claude Code namespace shown).

| Command | What it does |
|---|---|
| `/ui:generate <intent>` | Start a fresh design from a plain-language description. Produces token-bound variants across diverse personas. |
| `/ui:iterate <change>`  | Tweak the current design in plain words; applied as a surgical line-diff, re-scored by the gate. |
| `/ui:refine`            | Run the full critique→refine polish loop on the current design. |
| `/ui:redesign <intent>` | Reimagine an existing page in a different persona/direction. |
| `/ui:from-url <url>`    | Extract a **live site's** design system into a self-contained `./<slug>/` folder (spec + tokens + audit). |
| `/ui:from-ref <path>`   | Generate from a reference (image/markup), matching its look on your design system. |
| `/ui:figma`             | Reproduce a Figma source 1:1 (keeps source colors intentionally). |
| `/ui:extract`           | Inverse direction — pull a design system **out of** existing HTML. |
| `/ui:slides <intent>`   | Generate a token-bound slide deck. |

All HTML-emitting workflows defer to an internal **critique gate** (10th workflow): the
model scores 6 craft axes + 1 consistency axis, and a deterministic `ui taste-lint` floor
enforces the machine-checkable rules underneath — so an axis with a real rule breach
*cannot* pass. Quality is enforced, not merely suggested.

### `/ui:from-url` output

`/ui:from-url <url>` writes a portable folder under `./<slug>/`:

```
<slug>/
├── DESIGN.md              # the extracted design spec
├── DESIGN.preview.html    # rendered preview
├── source.html/.css       # raw audit trail
├── tokens.json            # frequency-ranked source tokens with provenance
├── run-summary.md
└── audit.md               # exit code GATES the workflow (5 audit families)
```

Flags: `--name <slug>`, `--out-dir <path>`, `--force`.

---

## The `ui` binary (for developers & scripting)

Every non-LLM task is a deterministic `ui` subcommand — pure transforms, no network, no
model calls, same bytes for the same input. Run `ui guide` for the plain-language map, or
`ui <command> --help` for details. Add `--json` to any command for a machine-readable
envelope.

| Command | Summary |
|---|---|
| `ui guide` | Plain-language map of the `/ui:*` workflow (**start here if you're new**) |
| `ui doctor` | Verify an ease-design install (and, with `--cwd`, a project) is healthy |
| `ui init` | Write the ease-design manifest and per-runtime adapter tree |
| `ui ds` | Compile, inspect, and mutate the project's design system (`init`/`context`/`change-token`/`status`) |
| `ui tokens` | Compile a DTCG token file to CSS / Tailwind / Figma variables |
| `ui color` | OKLCH color math: convert, scale, contrast, semantic palette |
| `ui taste-lint` | Deterministic taste-rubric floor for generated HTML (6 machine-checkable axes) |
| `ui validate-layout` | Static HTML structural/overflow linter (10 heuristic checks) |
| `ui autofix` | Apply 5 deterministic HTML fix rules (viewport, imgs, Lucide, CDN, dup-ids) |
| `ui registry` | Component registry store: register, lookup, list |
| `ui edit-strategy` | Select edit strategy, number HTML lines, apply ln-diff patch |
| `ui designmd` | Extract tokens, snapshot, and audit `DESIGN.md` folders |
| `ui export` | Export HTML as a standalone self-contained file |
| `ui strip-fences` | Remove ` ```html / ``` ` fences from LLM HTML output |
| `ui parse-json-stream` | Extract concatenated JSON objects from a file or stdin |

---

## How it works

ease-design ships two runtime-neutral **sources of truth** and a thin per-runtime adapter:

- **`knowledge/`** — a plain-Markdown knowledge core (taste rubric, persona library,
  generation rules, component catalog, color science, prompt modes) the host model reads
  directly. Never duplicated into code.
- **`ui` binary** — the deterministic Node CLI above for all non-LLM work.
- **Adapters** — `ui init` generates the config a given agent CLI needs to know *when* to
  read the knowledge core and *when* to shell out to `ui`. **The host CLI's own model
  generates the HTML — no API keys to manage.**

The happy path, mechanically:

1. **You describe intent** → `/ui:generate landing page for a new gym`.
2. **ease-design picks personas + compiles a DS.** The model scores your intent against 23
   curated personas and selects a diverse top-K; `ui ds init` compiles project-scoped
   semantic tokens + a component registry + a hash-sealed manifest, and emits a Tailwind
   `@theme` block the HTML consumes as utilities — so "use the design system" is mechanical,
   not retyped hex.
3. **Variants come back**, each from a different persona; the critique gate scores them
   before you see them; failures regenerate.
4. **You refine in plain words**; edits apply surgically; the gate re-scores; the DS
   hash-seal stays intact.

---

## Repo layout

| Path | Purpose |
|---|---|
| `knowledge/` | Markdown knowledge core — taste rubric, personas, components, color science, token taxonomy, prompt modes |
| `src/cli.ts` | `ui` binary entrypoint + subcommand router |
| `src/commands/` | one file per `ui` subcommand |
| `src/core/` | shared deterministic logic — color math, tokens, registry, autofix, layout + taste linting |
| `src/adapters/` | per-runtime adapter generation for `ui init` |
| `schemas/` | JSON Schemas — design tokens, component registry, DS manifest |
| `templates/` | workflow + skill Markdown templates (source of truth for adapter generation) |
| `examples/` | synthetic walkthrough + generation outputs |
| `docs/` | audit-gate report, journals |

---

## Status

**v0.1.0 — deterministic surface fully tested; publish-ready.**

- **`knowledge/` core:** a 6+1-axis taste rubric, 23 personas across 7 families, 32
  components across 8 categories, color science, token taxonomy, prompt modes.
- **`ui` binary:** 15 deterministic commands (see table above).
- **Workflows:** 10 host-model workflows + 7 skills, adapter-generated per runtime by `ui init`.
- **Critique gate:** a hard pass/fail loop — model-scored subjective axes + a deterministic
  `ui taste-lint` floor (body ≥ 16px, on-grid spacing, one icon family, tinted shadows,
  non-linear easing, token-bound colors).
- **766 tests passing**; zero runtime dependencies; four CI gates green (typecheck, lint,
  build, test).

**Known boundaries (honest):**

- **Live dogfood** is partial — a token-bound `/ui:generate` proof exists at
  `examples/generated/live-2026-05-30/`; a fuller multi-workflow sweep is pending.
- **Taste-rubric threshold calibration** — the ≥7 per-axis pass cutoff is a reasoned
  default; tuning it against a labeled corpus is future work. The deterministic `taste-lint`
  floor already removes the worst failure mode.

---

## Contributing

Four gates must stay green (`typecheck`, `lint`, `build`, `test`) and the `ui` binary stays
zero-runtime-dependency and deterministic. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
