"""Pure decision core for `design-os heartbeat` (phase-02 spec §Bước 2).

Every function here is deterministic and free of wall-clock/process I/O: callers pass
`now: datetime` explicitly (never `datetime.now()` in this module) so the whole due/
compare/record decision tree is unit-testable with a fake clock. The ONLY I/O this module
performs is state-file load/save, both given an explicit `Path` by the caller.

`now` (and any `nextRunAt`/history timestamp this module reads back) MUST be timezone-aware
— the state schema stores offset-ISO timestamps (phase-02 §Bước 1) and this module never
guesses a timezone for a naive datetime.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# ─── parse_interval ────────────────────────────────────────────────────────────

_INTERVAL_RE = re.compile(r"^(\d+)([mhd])$")
_UNIT_SECONDS = {"m": 60, "h": 3600, "d": 86400}


def parse_interval(s: str) -> int:
    """Parse a `"30m"|"4h"|"1d"|"7d"`-style interval to seconds.

    Raises ``ValueError`` on anything not matching ``^(\\d+)([mhd])$``, and also on a
    ZERO magnitude (``"0m"`` etc.) — a zero-length interval is never a valid duration.
    """
    m = _INTERVAL_RE.match(s)
    if not m:
        raise ValueError(f"invalid interval '{s}' — expected e.g. '30m', '4h', '1d' (^(\\d+)([mhd])$)")
    n = int(m.group(1))
    if n == 0:
        raise ValueError(f"invalid interval '{s}' — 0 is not a valid duration")
    return n * _UNIT_SECONDS[m.group(2)]


# ─── fnv1a64 ───────────────────────────────────────────────────────────────────

_FNV_OFFSET_BASIS = 0xCBF29CE484222325
_FNV_PRIME = 0x100000001B3
_MASK64 = 0xFFFFFFFFFFFFFFFF


def fnv1a64(s: str) -> int:
    """Standard FNV-1a, 64-bit (UTF-8 bytes). Test vectors (verified against the reference
    algorithm): ``fnv1a64("") == 0xcbf29ce484222325``; ``fnv1a64("a") == 0xaf63dc4c8601ec8c``.
    """
    h = _FNV_OFFSET_BASIS
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * _FNV_PRIME) & _MASK64
    return h


# ─── stagger_offset ────────────────────────────────────────────────────────────


def stagger_offset(project_path: str, interval_sec: int) -> int:
    """A deterministic per-project jitter (seconds) so many projects sharing the same
    interval don't all wake on the exact same second (goclaw-style thundering-herd guard).

    ``fnv1a64(abspath) % max(1, interval_sec // 10)`` — pure string math, no filesystem
    access (``os.path.abspath`` never touches disk). Applied ONCE, by the caller, only when
    a task first enters state (phase-02 §Bước 2/4) — this function itself has no notion of
    "first time"; it just answers "what offset would this project/interval get".
    """
    divisor = max(1, interval_sec // 10)
    return fnv1a64(os.path.abspath(project_path)) % divisor


# ─── is_due / next_run_at ──────────────────────────────────────────────────────


def is_due(task_state: dict[str, Any] | None, now: datetime) -> bool:
    """No prior state at all → due (baseline). Otherwise due iff `now >= nextRunAt`
    (boundary equality counts as due). A malformed/missing `nextRunAt` degrades to due —
    the safe default (surface the task rather than silently never running it again)."""
    if task_state is None:
        return True
    next_run = task_state.get("nextRunAt")
    if not isinstance(next_run, str):
        return True
    try:
        parsed = datetime.fromisoformat(next_run)
    except ValueError:
        return True
    return now >= parsed


def next_run_at(now: datetime, interval_sec: int) -> str:
    """ISO timestamp for the next run — `now + interval`. NEVER includes stagger (stagger
    is a one-time, caller-applied nudge on a task's very first state entry; see
    :func:`stagger_offset`)."""
    return (now + timedelta(seconds=interval_sec)).isoformat()


# ─── compare_summary ───────────────────────────────────────────────────────────


def compare_summary(prev: dict[str, Any] | None, cur: dict[str, Any]) -> str:
    """Classify `cur` against `prev` (both flat numeric-value dicts):

    - `prev is None` → ``"baseline"`` (first-ever run for this task).
    - Any key where `cur[k] > prev.get(k, 0)` → ``"worsened"`` (this also covers a
      brand-new key appearing with a positive value — it is compared against an implicit
      0 baseline, so "worsened" fires exactly when spec calls for it).
    - Else, any key where `cur[k] < prev.get(k, 0)` → ``"improved"``.
    - Else → ``"ok"``.

    Iterates `cur`'s keys only — a key present in `prev` but absent from `cur` (metric
    retired) is silently ignored, never counted as an improvement.
    """
    if prev is None:
        return "baseline"
    worsened = False
    improved = False
    for k, cur_v in cur.items():
        if not isinstance(cur_v, (int, float)):
            continue
        prev_v = prev.get(k, 0)
        if not isinstance(prev_v, (int, float)):
            prev_v = 0
        if cur_v > prev_v:
            worsened = True
        elif cur_v < prev_v:
            improved = True
    if worsened:
        return "worsened"
    if improved:
        return "improved"
    return "ok"


# ─── state load/save (the only I/O in this module) ────────────────────────────


def load_state(path: Path) -> dict[str, Any]:
    """Read the heartbeat state file. Absent file → a fresh `{"version":1,"tasks":{}}`.
    Malformed JSON / non-object root → ``ValueError`` (the command layer maps this to a
    `BAD_STATE` error envelope)."""
    if not path.exists():
        return {"version": 1, "tasks": {}}
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        raise ValueError(f"corrupt heartbeat state at '{path}': {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"corrupt heartbeat state at '{path}': expected a JSON object")
    return data


def save_state(path: Path, state: dict[str, Any]) -> None:
    """Write `state` as pretty JSON, atomically (tmp file + `Path.replace`, same dir/fs —
    a reader never observes a half-written file)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(path)


def record_run(
    state: dict[str, Any],
    task_id: str,
    status: str,
    summary: dict[str, Any],
    now: datetime,
    interval_sec: int,
    cap: int = 20,
) -> None:
    """Mutate `state` in place with the outcome of one task run: bump `nextRunAt` (from
    `now` + `interval_sec`, NO stagger — see :func:`next_run_at`), set `lastStatus`/
    `lastSummary`, increment `runs`, unshift `history` (newest first, capped at `cap`), and
    increment `suppressCount` only when `status == "ok"` (the "nothing to tell you" tally
    that backs the `--stats` ok-rate)."""
    tasks = state.setdefault("tasks", {})
    prior = tasks.get(task_id, {})
    history: list[dict[str, Any]] = list(prior.get("history", []))
    history.insert(0, {"at": now.isoformat(), "status": status, "summary": summary})
    del history[cap:]
    runs = int(prior.get("runs", 0)) + 1
    suppress = int(prior.get("suppressCount", 0)) + (1 if status == "ok" else 0)
    tasks[task_id] = {
        "nextRunAt": next_run_at(now, interval_sec),
        "lastStatus": status,
        "lastSummary": summary,
        "suppressCount": suppress,
        "runs": runs,
        "history": history,
    }
