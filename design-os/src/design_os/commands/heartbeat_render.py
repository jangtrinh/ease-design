"""Text/stats rendering for ``design-os heartbeat`` (split out of commands/heartbeat.py
per the <200-line module rule — that module keeps the Typer command + orchestration;
heartbeat_runners.py keeps the task runners + lock helpers). Pure presentation: every
function here formats already-computed entries/state, it never runs a task or touches I/O.
"""

from __future__ import annotations

from typing import Any

from design_os.envelope import ok_env

# Mirrors commands/heartbeat.py — both modules serve the one `heartbeat` command.
_COMMAND = "heartbeat"


def _delta_fragments(prev: dict[str, Any] | None, cur: dict[str, Any]) -> list[str]:
    prev = prev or {}
    return [f"{k} {prev.get(k, 0)}→{v}" for k, v in cur.items() if v != prev.get(k, 0)]


def delta_line(e: dict[str, Any]) -> str:
    tid, status = e["id"], e["status"]
    if status == "error":
        return f"{tid}: error — {e.get('detail') or 'unknown error'}"
    if status == "baseline":
        cur = e.get("summary") or {}
        body = ", ".join(f"{k}={v}" for k, v in cur.items())
        return f"{tid}: baseline — {body}" if body else f"{tid}: baseline"
    frags = _delta_fragments(e.get("prev"), e.get("summary") or {})
    body = ", ".join(frags) if frags else "no change"
    return f"{tid}: {status} — {body}"


def skip_reasons_summary(entries: list[dict[str, Any]]) -> str:
    seen: list[str] = []
    for e in entries:
        if e["status"] == "skipped":
            r = e.get("skipReason") or "unknown"
            if r not in seen:
                seen.append(r)
    return ", ".join(seen)


def render_outcome(entries: list[dict[str, Any]], checked: int, skipped: int) -> tuple[str, int]:
    """``(text, exit_code)`` for a completed beat: the worsened/error delta block (exit 1),
    or the one-line DESIGN_OK summary plus any baseline/improved lines (exit 0)."""
    bad = [e for e in entries if e["status"] in ("worsened", "error")]
    if bad:
        return "\n".join(delta_line(e) for e in bad) + "\n", 1
    reasons = skip_reasons_summary(entries)
    head = f"DESIGN_OK — {checked} checked, {skipped} skipped" + (f" ({reasons})" if reasons else "")
    extra = [delta_line(e) for e in entries if e["status"] in ("baseline", "improved")]
    return head + "\n" + ("\n".join(extra) + "\n" if extra else ""), 0


def render_stats(tasks_cfg: list[dict[str, Any]], state: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """``(envelope, text)`` for ``--stats`` — rendered purely from recorded state."""
    stats_rows: list[dict[str, Any]] = []
    lines: list[str] = []
    for t in tasks_cfg:
        tid = t["id"]
        ts = state.get("tasks", {}).get(tid)
        if ts is None:
            stats_rows.append({"id": tid, "runs": 0, "okRate": None, "last": None, "next": None})
            lines.append(f"{tid}  runs=0  ok-rate=n/a  last=never  next=n/a")
            continue
        runs = int(ts.get("runs", 0))
        suppress = int(ts.get("suppressCount", 0))
        ok_rate = round(suppress / runs * 100) if runs > 0 else None
        last = ts.get("lastStatus", "?")
        nxt = ts.get("nextRunAt", "?")
        stats_rows.append({"id": tid, "runs": runs, "okRate": ok_rate, "last": last, "next": nxt})
        ok_rate_txt = f"{ok_rate}%" if ok_rate is not None else "n/a"
        lines.append(f"{tid}  runs={runs}  ok-rate={ok_rate_txt}  last={last}  next={nxt}")
    data = {"stats": stats_rows}
    text = "\n".join(lines) + ("\n" if lines else "")
    return ok_env(_COMMAND, data), text
