"""``design-os heartbeat [--dir] [--task <id>] [--force] [--stats] [--json]`` — the
deterministic design-health rhythm (phase-02 spec). Composes existing seams — it NEVER
reimplements a check (contract §1) — and heartbeat_core's pure compare/record logic turns
each fresh reading into ok/baseline/improved/worsened against the last one.

Exit is the notify mechanism (plan.md Constraints): 0 when every task lands in
{ok, baseline, improved, skipped}; 1 when any task is worsened or errored. `--stats` and a
missing config both always exit 0. Envelope `ok` stays `true` whenever the COMMAND itself
ran — health lives in the exit code and each task's `status` (okJsonWithExit semantics,
see commands/doctor.py).

Layout (<200-line rule): this module owns the Typer command, config validation, and run
orchestration; task runners + lock helpers live in heartbeat_runners.py, text rendering
in heartbeat_render.py.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated, Any

import typer

from design_os import heartbeat_core
from design_os.commands.heartbeat_render import render_outcome, render_stats
from design_os.commands.heartbeat_runners import TASK_RUNNERS, acquire_lock, lock_busy_entries
from design_os.envelope import JsonFlag, emit, err_env, ok_env

# Test seam: heartbeat_runners resolves hand binaries LATE through this module attribute,
# so a test can monkeypatch `heartbeat.resolve_bin` to simulate a missing hand.
from design_os.kernel import resolve_bin  # noqa: F401

_COMMAND = "heartbeat"

_CONFIG_REL = Path("design") / "heartbeat.json"
_STATE_REL = Path("design") / "heartbeat-state.json"
_LOCK_REL = Path("design") / ".heartbeat.lock"

_KNOWN_TYPES = {"ds-a11y", "specimen", "audit-pages", "figma-audit"}


class _BadConfig(Exception):
    """Malformed heartbeat.json / unknown task type / unknown `--task` id — usage-class (exit 2)."""


def _now() -> datetime:
    """The ONE wall-clock read in this module — every downstream call threads this value
    through. Tests monkeypatch this function to freeze time."""
    return datetime.now().astimezone()


def _load_config(path: Path) -> dict[str, Any] | None:
    """`None` → no config file at all. Raises :class:`_BadConfig` on malformed JSON/shape,
    an unknown task `type`, or a malformed `interval` — all usage-class (exit 2)."""
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        raise _BadConfig(f"malformed JSON in '{path}': {e}") from e
    if not isinstance(data, dict):
        raise _BadConfig(f"'{path}' must contain a JSON object")
    tasks = data.get("tasks")
    if tasks is None:
        return data
    if not isinstance(tasks, list):
        raise _BadConfig(f"'{path}': 'tasks' must be a list")
    for t in tasks:
        if not isinstance(t, dict) or "id" not in t or "type" not in t:
            raise _BadConfig(f"'{path}': every task needs an 'id' and a 'type'")
        if t["type"] not in _KNOWN_TYPES:
            raise _BadConfig(f"unknown task type '{t['type']}' for task '{t['id']}' — expected one of {sorted(_KNOWN_TYPES)}")
        try:
            heartbeat_core.parse_interval(str(t.get("interval", "")))
        except ValueError as e:
            raise _BadConfig(f"task '{t['id']}': {e}") from e
    return data


def _apply_first_run_stagger(state: dict[str, Any], task_id: str, project_dir: Path, interval_sec: int) -> None:
    """Nudge a brand-new task's `nextRunAt` by :func:`heartbeat_core.stagger_offset` — ONLY
    the run that first writes state for this `task_id` (phase-02 §Bước 2/4)."""
    task = state["tasks"][task_id]
    dt = datetime.fromisoformat(task["nextRunAt"])
    offset = heartbeat_core.stagger_offset(str(project_dir), interval_sec)
    task["nextRunAt"] = (dt + timedelta(seconds=offset)).isoformat()


def heartbeat(
    dir_: Annotated[Path, typer.Option("--dir", help="Project dir holding design/ (default: cwd)")] = Path("."),
    task: Annotated[str | None, typer.Option("--task", help="Run only this task id, ignoring its due time (wake)")] = None,
    force: Annotated[bool, typer.Option("--force", help="Ignore due time — run every configured task now")] = False,
    stats: Annotated[bool, typer.Option("--stats", help="Render task stats from state; runs nothing")] = False,
    json_: JsonFlag = False,
) -> None:
    """Run each due config task, compare it to its last reading, and gate the exit code on
    whether anything got worse or errored. `--force`/`--task` bypass due-checking; `--stats`
    renders recorded history and runs nothing."""
    try:
        config = _load_config(dir_ / _CONFIG_REL)
    except _BadConfig as e:
        emit(err_env(_COMMAND, "BAD_CONFIG", str(e)), json_mode=json_, text=f"heartbeat: {e}\n", exit_code=2)
        return

    tasks_cfg: list[dict[str, Any]] = (config or {}).get("tasks") or []
    if config is None or not tasks_cfg:
        data = {"status": "no-heartbeat-config", "tasks": []}
        text = "heartbeat: no config (design/heartbeat.json) — nothing to do\n"
        emit(ok_env(_COMMAND, data), json_mode=json_, text=text, exit_code=0)
        return

    if task is not None:
        matching = [t for t in tasks_cfg if t["id"] == task]
        if not matching:
            ids = [t["id"] for t in tasks_cfg]
            msg = f"unknown task id '{task}' — configured tasks: {ids}"
            emit(err_env(_COMMAND, "BAD_CONFIG", msg), json_mode=json_, text=f"heartbeat: {msg}\n", exit_code=2)
            return
        tasks_cfg = matching

    try:
        state = heartbeat_core.load_state(dir_ / _STATE_REL)
    except ValueError as e:
        emit(err_env(_COMMAND, "BAD_STATE", str(e)), json_mode=json_, text=f"heartbeat: {e}\n", exit_code=1)
        return

    if stats:
        stats_env, stats_text = render_stats(tasks_cfg, state)
        emit(stats_env, json_mode=json_, text=stats_text, exit_code=0)
        return

    now = _now()
    lock_path = dir_ / _LOCK_REL
    if not acquire_lock(lock_path, now):
        entries = lock_busy_entries(tasks_cfg)
        data = {"dir": str(dir_), "tasks": entries, "checked": 0, "skipped": len(entries)}
        text, _ = render_outcome(entries, 0, len(entries))
        emit(ok_env(_COMMAND, data), json_mode=json_, text=text, exit_code=0)
        return

    try:
        entries = _run_tasks(tasks_cfg, state, dir_, now, force=force, woken=task is not None)
        heartbeat_core.save_state(dir_ / _STATE_REL, state)
    finally:
        lock_path.unlink(missing_ok=True)

    checked = sum(1 for e in entries if e["status"] != "skipped")
    skipped = len(entries) - checked
    data = {"dir": str(dir_), "tasks": entries, "checked": checked, "skipped": skipped}
    text, exit_code = render_outcome(entries, checked, skipped)
    emit(ok_env(_COMMAND, data), json_mode=json_, text=text, exit_code=exit_code)


def _run_tasks(
    tasks_cfg: list[dict[str, Any]],
    state: dict[str, Any],
    project_dir: Path,
    now: datetime,
    *,
    force: bool,
    woken: bool,
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for t in tasks_cfg:
        tid, ttype = t["id"], t["type"]
        params = t.get("params") or {}
        prior = state.get("tasks", {}).get(tid)
        prev_summary = prior.get("lastSummary") if prior else None

        due = force or woken or heartbeat_core.is_due(prior, now)
        if not due:
            entries.append({"id": tid, "type": ttype, "status": "skipped", "summary": {}, "prev": prev_summary, "skipReason": "not-due"})
            continue

        try:
            result = TASK_RUNNERS[ttype](project_dir, params)
        except OSError as e:
            # Safety net (Opus P2 finding #4): a runner that RAISES on a dead bin path
            # (FileNotFoundError ⊂ OSError) becomes a task error, never a crashed beat.
            result = {"status": "error", "summary": {}, "detail": f"{ttype} runner raised {type(e).__name__}: {e}"}
        if result["status"] == "skipped":
            entries.append({"id": tid, "type": ttype, "status": "skipped", "summary": {}, "prev": prev_summary,
                            "skipReason": result.get("skipReason"), "detail": result.get("detail") or None})
            continue

        cur_summary = result.get("summary") or {}
        status = "error" if result["status"] == "error" else heartbeat_core.compare_summary(prev_summary, cur_summary)

        interval_sec = heartbeat_core.parse_interval(str(t["interval"]))
        is_first = prior is None
        heartbeat_core.record_run(state, tid, status, cur_summary, now, interval_sec)
        if is_first:
            _apply_first_run_stagger(state, tid, project_dir, interval_sec)

        entries.append({"id": tid, "type": ttype, "status": status, "summary": cur_summary, "prev": prev_summary,
                        "detail": result.get("detail") or None})
    return entries
