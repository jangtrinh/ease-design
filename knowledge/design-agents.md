# Design Agents — soul-bound, task-scoped identities

A design agent is a **soul-bound identity with a task scope**, generated as a real
subagent of the host runtime (Claude Code: `.claude/agents/<name>.md`). Soul-bound:
its identity descends from the genealogy of souls — the studio soul
(`$EASE_DESIGN_HOME/studio-soul.md`) above the project soul (`design/soul.md`).
Task-scoped: each role owns one kind of work and explicitly hands the rest to its
siblings. `ui agents init|list|check` is the toolchain.

## §1 Naming — the genealogy

`studio × project × role`. The studio soul's frontmatter `name:` (e.g. `name: JANG`)
crossed with the project's manifest name (e.g. `vsf-pcp`):

- **designer** (flagship) → `jang-vsf-pcp` — carries the bare genealogy name.
- **curator** → `jang-vsf-pcp-curator`; **figma-hand** → `jang-vsf-pcp-figma`.
- No studio soul → `vsf-pcp-designer` / `vsf-pcp-curator` / `vsf-pcp-figma`, and
  `init` hints at `ui ds soul init --studio`.

Names are sanitized to `^[a-z][a-z0-9-]*$`, capped at 64 chars.

## §2 The first three roles — and their boundaries

- **designer** — generation, iteration, refinement on the project DS; runs the four
  machine gates before every handback. The designer **never scores its own output**.
- **curator** — critique, scoring, audits (taste rubric + curator facets +
  `design-os audit` / `ui ds a11y`); verdict + punch list, report-only. The curator
  **never edits or generates an artifact**.
- **figma-hand** — canvas operations through the `figma-agent` CLI, verify-by-export
  after every write. The figma hand **never simulates** — plugin down means BLOCKED,
  not pretend-results.

The boundaries are the point: maker and judge stay separate hands, and canvas truth
comes only from the canvas. The roster registry grows only after these three live in
real projects.

## §3 Identity is runtime-read, never baked

A generated agent body does NOT contain soul text. Its standing first action is
`ui ds context`, which already carries the project soul and the studio soul beneath
it — so editing a soul updates every agent's behaviour instantly, with zero drift
and nothing to regenerate. Only the **name** is baked at generate time; renaming the
studio or project means `ui agents init --force`.

## §4 Roster is opt-in

`ui init` never generates agents — it only prints a hint. A user runs
`ui agents init` (optionally `--roster designer,curator`) to get one or as many
agents as they want; a project with zero agents is a fully supported state
(`agents check` reports it as a warning, never an error).

## §5 Runtime scope

Claude Code only for now (`.claude/agents/`). codex and antigravity have no stable
subagent format yet; when they do, the same templates + genealogy naming will emit
their trees. Until then nothing is written for them.

## §6 Drift check — the emitter/linter pair

`templates/agents/<role>.md` is the source of truth. Every generated file carries a
stamp comment (`design-os agents · roster-role: <role> · template-hash: <fnv1a-8>`),
and `ui agents check` re-renders the live templates against the project + studio
names: any file that no longer matches — template updated, file hand-edited, or a
name moved — is `agent-stale` (error, exit 1; fix: `ui agents init --force`). A
stamped role no longer in the roster is `agent-unknown-role` (warning).
