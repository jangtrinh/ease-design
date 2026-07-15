---
description: "Onboard a project onto design:os end to end: pick the right entry point for what already exists (nothing yet, a codebase, a URL, a Figma file, a token set, or reference shots), verify the toolchain with ui doctor / design-os doctor, compile or import the design system, declare the soul, wire agents + heartbeat, and open the Figma plugin. Use when the user says 'onboard', 'set up design:os', 'install this', 'wire up my project', 'get started with design:os', or right after ui init."
---

# Journey: Onboard

Use this the moment a project needs to go from zero to a working design:os setup — whether
`ui init` just ran or is about to. It covers picking the right entry point for whatever
already exists, verifying the toolchain is healthy, compiling or importing the design
system, declaring the soul, wiring agents + heartbeat, and opening the Figma plugin if the
project uses one. Every command below was checked against its own `--help` (or run
directly) before being written here — none of this is guessed.

This journey does not re-explain what a persona is, what a token means, or design taste —
that lives in `knowledge/`. It only teaches sequencing, disambiguation, and the gotchas
that cost a real dogfood session each.

## 1. Entry-point router — which of the six roads in

The fork below lives in exactly one other place today (the README's "journeys" mermaid
diagram) and nowhere else — if you jump straight to a single workflow file because the user
said "onboard this," you will never see the other five roads or the criteria between them.
Run `ui scan --cwd <project> --json` first whenever it's unclear which situation applies —
its `verdict` field (`greenfield` / `brownfield-code` / `brownfield-html` / `ds-present`)
disambiguates E1 vs E2 for you.

| # | Situation | Path | Lands in |
|---|---|---|---|
| E1 | Nothing yet — just an intent | `ui ds init <name> --persona <slug> --intent "<text>"` | sealed `design/` store |
| E2 | An existing codebase | `ui scan --cwd .` (verdict) → `/ui:learn` | sealed `design/` store |
| E3 | A live URL you admire | `/ui:from-url <url>` | self-contained `./<slug>/` folder (spec + tokens + audit) |
| E4 | A Figma file | `design-os figma scan --out ds.json` → `ui ingest-figma-ds ds.json --out <dir> --name <slug>` | portable, **unsealed** bundle — see the hygiene STOP-gate below before it reaches the store |
| E5 | A shadcn / DTCG token set (or a flat Figma-reconciled `tokens.json`) | `ui ds import <tokens.json> --dir <project> --name <slug>` | sealed `design/` store |
| E6 | Reference shots / brand mood | `design-os reference add <url-or-file>...` → DNA doc → persona seed → `ui ds init` | sealed `design/` store |

E4 and E6 both touch a Figma file or images and can run before or after E1–E3; a team can
legitimately enter at E4 (clean up a messy Figma library first), exit with a specimen page,
then re-enter at E2 on the app repo — the store is the meeting point, not a single path.

### Already onboarded? Run the verify pass, not an entry road

- **Trigger:** `ui scan` verdict `ds-present` — the table above is entry-only; do NOT pick
  an entry road for a project that already has a sealed store.
- **The verify pass** is a checklist over the numbered sections below: §2 both doctors → §3
  git → §5 `ui ds soul check` (and `--studio`) → §6 `ui agents check` + one
  `design-os heartbeat` run → the staleness check in §4.
- **Discipline:** flag findings as recommendations; re-init/`--force` fixes are the owner's
  call, not the verifier's.

Before running `design-os figma audit` (E4's optional cleanup pass) on a file you have not
scanned this session, run `design-os figma scan` first — the audit reads the same live
document, not a cached copy.

## 2. Install → doctor — two different health checks, not one

There are two doctor commands and they check different things. Running only one leaves a
real gap unverified:

- `ui doctor --cwd <project> --json` — kernel + adapter integrity only: Node version,
  `templates/`/`knowledge/` resolve, the project's manifest is well-formed, and (the two
  checks added later) `template-drift` / `adapter-wrappers` — whether the installed
  `.claude`/`.agent`/`AGENTS.md` wrappers still match the live templates. It does **not**
  check any optional hand.
- `design-os doctor --versions --json` — the `ui` kernel + Node + every **optional hand**:
  `figma-agent`, `recall`, `pixelshot`, `a11y-audit`, `page-shot`. Each reports
  `"required": false, "found": true|false`. Run this one to know whether a hand is even
  installed before blaming a workflow for "not working."

Run both after `ui init`, not just the one that happens to be top of mind.

### Optional-hand degradation — what breaks, and how loudly

`design-os doctor` will tell you a hand is missing; it will not tell you what that means
for the workflow you are about to run. Nothing else does either (this table is that
missing surface):

| Hand missing | What it blocks | Degrades or hard-blocks |
|---|---|---|
| `figma-agent` | `/ui:to-figma`, `/ui:audit`'s canvas-normalize step, `design-os figma scan`/`design-os figma audit`/`design-os figma status` | **Hard-blocks** — the figma-hand agent role reports BLOCKED and tells the user to open the plugin, it never simulates a canvas edit |
| `figma-agent` (binary present, but the **plugin** isn't open in Figma Desktop) | Same as above | **Hard-blocks** the same way — heartbeat's `figma-audit` task instead **degrades gracefully**: it skips with `skipReason: figma-plugin-down` rather than failing the beat |
| `recall` | `recall query`/`recall reflect` job-start/job-end priming (daily journey) | **Degrades gracefully** — recall is optional everywhere; the job just runs without a memory prior |
| `pixelshot` | `design-os reference add` (E6, and daily reference capture) | **Hard-blocks** — there is no fallback capture path documented |
| `page-shot` | `ui vr diff`/`ui vr gate`, `design-os vr-matrix` (needs rendered PNGs) | **Hard-blocks** the rendered VR pipeline — there is nothing to diff without renders |
| `a11y-audit` | The rendered (tier-2) a11y check in the delivery journey | **Hard-blocks** only the rendered check — tier-1 static checks (`ui a11y-lint`, `ui ds a11y`) still run fine, just prove less |

## 3. Git prerequisite — STOP before anything else if this isn't a repo

Check `git rev-parse --is-inside-work-tree` (or just `.git` existing) before doing anything
else. A project that isn't a git repo has no history to diff a `registry hash mismatch`
against later — that failure becomes untraceable after the fact, and there is no command
that checks or prompts for this on your behalf. If it's missing, `git init` first.

## 4. Design-system entry: init vs import vs ingest, and the naming hygiene STOP-gate

Three different commands seal (or don't seal) a design system, and they are not
interchangeable:

- `ui ds init <name> --persona <slug> --intent "<text>"` — compiles a **fresh** DS from a
  persona + intent (E1). Seals `design/ds.manifest.json` immediately.
- `ui ds import <tokens.json> --dir <project> --name <slug>` — onboards an **existing flat**
  `{category:{name:value}}` token file (a shadcn export, or a Figma-reconciled flat
  `tokens.json`) into the sealed store (E5). This is the command that actually writes
  `design/ds.manifest.json` for an imported DS.
- `ui ingest-figma-ds <ds.json> --out <dir> --name <slug>` — richer Figma path (E4): takes a
  full `figma-agent scan-design-system` export and writes a **portable, unsealed** bundle
  (`tokens.json` + `component-registry.json` + `DESIGN.md`) into `<dir>` — no
  `design/ds.manifest.json`, so `ui ds a11y`/`ui ds status`/`ui agents init` cannot run
  against it yet. If the store needs to be sealed, its `tokens.json` still has to go
  through `ui ds import` (or `ds init --bare` + registry population) to land a manifest.

**STOP-gate — two different `--name` flags, two different effects, easy to conflate:**
`ui ingest-figma-ds --name <slug>` only sets the title string inside `DESIGN.md`; it does
not touch any manifest. `ui ds import --name <slug>` is the one that seals
`design/ds.manifest.json`'s `name` field — and if you omit it, the default is the **literal
string `imported-ds`**. That string then becomes the identity `ui agents init` names every
generated agent after (`designer-imported-ds` instead of `designer-vsf-pcp`). Always pass an
explicit, real `--name` on whichever command seals the manifest, before running
`ui agents init`.

**Stale-seal check:** nothing computes staleness for you. If the ingested Figma artifacts
(`tokens.json`, `component-registry.json`, `DESIGN.md`) carry mtimes NEWER than the sealed
store (`design.tokens.json` / `ds.manifest.json`), every `ds a11y`/`ds specimen`/
`agents init` answer is coming from the older seal — check mtimes by hand. Remedy order
matters: `ui ds import <tokens.json> --dir <project> --name <slug> --force` to reseal, THEN
`ui agents init --force` (a reseal writes a fresh manifest, and agent identity is keyed off
the manifest's `name` — regenerate agents after a reseal, never before).

## 5. Soul-layer selection — three files, one precedence chain

Three soul layers exist, and the binder only validates the *structure* of whichever file
you edit — it never tells you *which* layer a given change belongs in:

1. **Project** — `design/soul.md`. Scaffold with `ui ds soul init` (or let `/ui:learn`
   draft it from evidence). This project's own stance; edit this for anything specific to
   the current product.
2. **Studio** — `$EASE_DESIGN_HOME/studio-soul.md`. Scaffold with
   `ui ds soul init --studio` — once per **machine/studio**, not per project. Its
   frontmatter `name:` later names every agent this studio generates
   (`designer-<studio>-<project>`). Edit this for a stance that should hold across every
   project this studio touches.
3. **Factory** — compiled into the binary, not a file. Read it with `ui ds soul factory`.
   The shipped, world-class baseline every project gets on day 0 with zero setup. Never
   edited directly — override it with a project or studio soul instead.

**Precedence:** a more specific layer overrides a more general one clause-by-clause — the
full chain and its rules are owned by `knowledge/design-soul.md` §1, not repeated here.

**Sequencing in onboarding:** scaffold the studio soul first (`ui ds soul init --studio`,
once ever) so agent identities are correct from the start, then `ui ds init`/import/ingest.
`ui ds init` already scaffolds `design/soul.md` (`status: draft`) as part of its own
output — edit that file in place and do NOT re-run `ui ds soul init` after it (that hits
`EXISTS`). `ui ds import` does NOT scaffold a soul — run `ui ds soul init` after it (or let
`/ui:learn` draft it) to get one. Either way, finish with `ui ds soul check [--studio]` to
lint structure (fails on `soul-missing-section` / `soul-empty-section` /
`soul-placeholder-copy`; warns on `soul-draft-status` / `soul-scaffold-untouched` /
`soul-too-long`). Both souls start as `status: draft` — fill **Never / Always / Voice**,
then set `status: ratified` before treating either as final.

## 6. Agents roster + heartbeat setup

### Agents

`ui agents init [--roster designer,curator,figma-hand] [--force]` writes
`.claude/agents/<name>.md` — opt-in, never run automatically by `ui init`. Requires
`design/ds.manifest.json` to already exist (`DS_NOT_FOUND` otherwise) — run this **after**
step 4, not before. Names come from studio × project × role
(`designer-<studio>-<project>`, or bare `<project>-designer` with no studio soul yet).
`ui agents check` fails on `agent-stale` when a file no longer matches its template render
(hand-edited, or the studio/project name changed) — heal with `ui agents init --force`.
Claude Code only for now.

### Heartbeat — a recurring design-health check, config schema

`design-os heartbeat [--dir <project>] [--task <id>] [--force] [--stats] [--json]` runs
each **due** task in `design/heartbeat.json`, compares its numeric summary to the last
recorded reading, and gates the exit code on whether anything got worse. There is no
knowledge file that teaches this config format — it is only discoverable by reading the
Python source, so the schema below is the ground truth, verified against
`design-os/src/design_os/commands/heartbeat.py`, `heartbeat_runners.py`, and
`heartbeat_core.py` directly:

```json
{
  "tasks": [
    { "id": "nightly-a11y", "type": "ds-a11y", "interval": "1d" },
    { "id": "weekly-specimen", "type": "specimen", "interval": "7d" },
    { "id": "preview-pages", "type": "audit-pages", "interval": "1d",
      "params": { "dir": "design/preview" } },
    { "id": "figma-hygiene", "type": "figma-audit", "interval": "7d",
      "params": { "file": "VSF - PCP" } }
  ]
}
```

- **`interval`** must match `^(\d+)([mhd])$` — digits then one of `m` (minutes), `h`
  (hours), `d` (days); `"0m"` (zero magnitude) is invalid. A malformed interval, an unknown
  `type`, or a missing `id`/`type` fails config load with `BAD_CONFIG` (exit 2).
- **The 4 known task types and their `params`:**
  - `ds-a11y` — runs `ui ds a11y --dir <project> --json`. Always targets the project dir;
    `params` is unused.
  - `specimen` — runs `ui ds specimen --dir <project> --strict --json`. Also always
    targets the project dir; `params` is unused.
  - `audit-pages` — runs the static `ui audit`-style page sweep over `params.dir`. **STOP:
    point this at a page directory (e.g. `design/preview`), never the project root** — a
    root target double-counts the DS/flow sections the separate `ds-a11y`/`specimen`
    tasks already cover. **Omitting `params.dir` does not skip** — it silently falls back
    to the project root and runs, which is exactly that double-count; always set it. The
    `pages-dir-missing` skip fires only when a *supplied* `params.dir` resolves to a path
    that does not exist.
  - `figma-audit` — runs `figma-agent audit-ds` (with up to 2 retries). Optional
    `params.file` pins `FIGMA_AGENT_FILE` so it audits the right open file. Skips with
    `figma-agent-missing` (hand not installed) or `figma-plugin-down` (hand installed, but
    no plugin connected) — never fails the beat outright for either.
- **Exit contract:** 0 unless any task lands `worsened` or `error` (that's the
  notification — there's no separate alert channel). Success text starts with
  `DESIGN_OK — N checked, M skipped`. `--force`/`--task <id>` bypass due-checking;
  `--stats` renders history only and always exits 0, as does a missing config file.
  A run acquires a lock (`design/.heartbeat.lock`, stale after 10 minutes) — a concurrent
  run skips everything with `skipReason: lock-busy` rather than racing.
- A task's very first run gets a small deterministic jitter (`stagger_offset`, based on the
  project path) added to its next-run time, so many projects on the same interval don't all
  wake on the same second — every run after that is exactly `interval` apart.

## 7. Figma plugin prerequisites

The `design-os-figma` plugin ships by default — there is no separate install step to teach
here, only how to connect to it:

1. Open the Figma Design Agent plugin panel inside Figma Desktop (it starts compact,
   300×170).
2. Verify the connection with `figma-agent status` (or `design-os figma status`) — it
   reports `broker.port` (always `9410`), and one entry per connected file under
   `plugins[]` (`fileName`, `page`, `state`, `lastHeartbeatAge`), plus `activePlugin`.
3. **After every plugin rebuild, reload it manually inside Figma Desktop** — there is no
   hot-reload, and no version handshake stops a stale plugin from silently answering with
   old code. If a scan/audit result looks wrong right after a rebuild, reload the plugin
   before trusting it.
4. If several Figma files are open at once, pin the target explicitly with the
   `FIGMA_AGENT_FILE` env var — commands otherwise route to the most-recently-active file,
   which can silently be the wrong one. (The daily journey's Figma-preflight STOP-gate
   covers checking this before trusting a result — see `templates/journeys/daily.md`.)

## Handback discipline

**Status:** DONE | DONE_WITH_CONCERNS | BLOCKED · which entry point (E1–E6) was taken, and
what `ui doctor` / `design-os doctor --versions` reported · any hand still missing, any
soul left in `draft` status, or manifest name left un-renamed · open questions.
