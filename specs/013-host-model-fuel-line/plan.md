# Spec 013 — Host-model fuel line: auto-wire the learning loop's model at init

**Owner directive (2026-07-18):** *"khi user init design:os vào project thì tuỳ thuộc vào OS model
của họ đang xài thì chúng ta setup giúp họ — codex, claude code, opencode… whatever it is, we
should prepare."* · **Domain**: COMPLEX (2-language, net-new) · **Scope (owner)**: the 3 runtimes
design:os already models — claude, codex, antigravity — persisted in the per-runtime manifest.

## Why (the measured blocker this removes)

Spec 012 proved the loop reaches ALIVE only when a model adapter distills insights, but
`DESIGN_OS_MODEL_CMD` is UNSET on every real project (census 2026-07-18) → harvest/reflect skip →
no project self-evolves. The model adapter is the last manual step between "wired" and "learning".
This wires it automatically at init, per the host the user already runs.

## Verified adapter table (probed live 2026-07-18 — NOT guessed; each ran and returned "PONG")

| Runtime | Invocation | Prompt mode | Notes |
|---|---|---|---|
| claude | `claude -p` | **stdin** | returns text on stdout ✓ |
| codex | `codex exec` | **stdin** | 9.9s, stdout clean; a session ERROR prints to stderr (ignored) ✓ |
| antigravity | `agy --dangerously-skip-permissions -p "<prompt>"` | **arg** | 7.8s ✓ (memory's headless hook-hang did NOT reproduce in arg `-p` form) |

**Key finding**: invocations are not inferable and the prompt channel differs (stdin vs arg). So this
must be a VERIFIED registry, and arg-mode hosts need a wrapper to meet `harvest_model.py`'s stdin
contract (packet on stdin, argv is fixed config). A guessed invocation = a silently dead loop.

## Design (plugs into the existing seam)

`ui init --runtime <r>` already writes a per-runtime manifest (`.claude/ease-design.json`,
`.agent/ease-design.json`, `AGENTS.ease-design.json`) + adapter tree. Add a model-adapter layer:

1. **Registry** (TS, `src/adapters/`): `runtime → { argv, mode: "stdin"|"arg", flags }`. One entry per
   runtime, transcribed from the verified table above (cite this plan — counted, not guessed).
2. **A wrapper per runtime** written by `ui init`: a tiny POSIX script normalizing every host to the
   stdin contract, so `harvest_model.extract` (packet on stdin) is unchanged:
   - stdin host: `exec claude -p` / `exec codex exec` (stdin passes through).
   - arg host: `prompt="$(cat)"; exec agy --dangerously-skip-permissions -p "$prompt"`.
   Written to the runtime's own dir (`.claude/design-os-model.sh`, `.agent/…`, codex alongside
   `AGENTS.ease-design.json`), `chmod +x`.
3. **Manifest record**: `ui init` adds `"modelAdapter": { "runtime": r, "wrapper": "<rel path>",
   "mode": "stdin"|"arg", "verifiedAt": "<plan date>" }` to the per-runtime manifest.
4. **Conductor resolution** (Python, `harvest_model.resolve_model_cmd`): resolution order —
   (a) env `DESIGN_OS_MODEL_CMD` wins (explicit override, unchanged); else
   (b) read the project's runtime manifest(s) under `--dir`; if one, use its `modelAdapter.wrapper`;
       if several (`--all`), pick the one matching the host detected from env markers
       (`CLAUDECODE`/`CLAUDE_*`, `CODEX_*`, `ANTIGRAVITY_*`/agy), else the first by a stable order;
   (c) none → `None` (skip `no-model-adapter`, unchanged — honest).
   The wrapper path resolves relative to the manifest's project dir.

## Phases (vertical slices)

- **P1 (this branch)** — TS: the registry + `ui init` writes the wrapper + records `modelAdapter` in
  the manifest, for all 3 runtimes. **Delivers**: after `ui init --runtime claude`, a working
  `.claude/design-os-model.sh` exists and the manifest names it. **Tests** (paired, Art II): registry
  has all 3; `init --runtime {claude,codex,antigravity}` writes an executable wrapper + manifest
  `modelAdapter`; the arg-mode wrapper (agy) contains the stdin→arg normalization, the stdin ones
  don't; `--all` writes all three. A wrapper-shape lint (like the existing adapter-wrapper-lint) if cheap.
- **P2 (DONE)** — Python: `resolve_model_cmd(project_dir)` reads the manifest (env still wins); all
  three call sites (harvest, heartbeat harvest, heartbeat reflect) pass `project_dir`. 6 new tests
  (manifest wrapper resolved; env override wins; no manifest → None; missing wrapper file → None;
  running host marker wins; declared order breaks the tie). Full design-os suite 263 green.
- **P3 (DONE, Art III)** — LIVE end-to-end proved: `ui init --runtime claude` → `ds init` store →
  a real report → `design-os harvest` with **NO `DESIGN_OS_MODEL_CMD` in env** → the wrapper
  (`exec claude -p`) was auto-used, 1 real insight landed, `design-os evolution` → **ALIVE**. A
  freshly-injected project reaches ALIVE with zero manual model config. The whole point, proven.

## Constraints & risks
- Art I: the kernel writing a static wrapper + manifest field is deterministic (like the existing
  soul/heartbeat scaffold) — no model call in the kernel. Art IX: keep new files < 200 lines.
- **Never run the host model at init** — init only WRITES the wrapper; it never invokes it. (No network,
  no model call in `ui init` — Art I.)
- Security: the wrapper is operator config (like `DESIGN_OS_MODEL_CMD` today); the packet still goes on
  stdin, never argv-interpolated in a shell — the arg-mode wrapper uses `"$prompt"` quoted from `$(cat)`,
  not eval. Note in `harvest_model.py`'s existing untrusted-input caveat.
- Risk: a host's CLI flags change → the wrapper breaks silently. Mitigation: `modelAdapter.verifiedAt`
  records when the invocation was last verified; a `design-os doctor` check (follow-up) can smoke it.
- Won't (this spec): opencode/gemini/cursor (arg-mode, unverified) — the registry is extensible; add
  each only with its own live probe. Auto-detect-by-PATH (init already declares `--runtime`).
