"""``design-os evolution [--dir] [--json]`` — spec 012 P1: reads a project's `design/`
directory and reports whether its LEARNING LOOP is ALIVE, DEAD-LOOP, or NO-LOOP, with a
per-signal breakdown (Art VIII — the report always names every dimension's state).

Read-only, deterministic, no model, no network (Art I). This INFORMS — it never fails a
build — so it always exits 0, unlike `doctor`/`heartbeat`'s health-gated exit codes.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

import typer

from design_os import evolution_core
from design_os.envelope import JsonFlag, emit, ok_env

_COMMAND = "evolution"


def _render_text(signals: dict[str, Any]) -> str:
    lines: list[str] = [f"evolution: {signals['verdict']}"]

    ledger = signals["ledger"]
    if not ledger["exists"]:
        lines.append("  ledger: no memory.events.jsonl — the loop has never run")
        return "\n".join(lines) + "\n"

    types_str = ", ".join(f"{k}={v}" for k, v in ledger["types"].items()) or "(none)"
    lines.append(
        f"  ledger diversity: {ledger['distinct']} distinct type(s) over "
        f"{ledger['total']} event(s) — {types_str}"
    )
    no_insights = "no insights" if ledger["insight_events"] == 0 else f"{ledger['insight_events']} insight(s)"
    no_gaps = "no gaps" if ledger["gap_events"] == 0 else f"{ledger['gap_events']} gap(s)"
    lines.append(f"  learning events: {no_insights}, {no_gaps}")

    graph = signals["graph"]
    if graph["exists"]:
        lines.append(
            f"  graph insights: {graph['insights_total']} total, "
            f"{graph['insights_recurrent']} recurrent (seen>1)"
        )
    else:
        lines.append("  graph insights: no memory.graph.json")

    soul = signals["soul"]
    if not soul["exists"]:
        lines.append("  soul: no soul.md")
    else:
        status = soul["status"] or "(no status — defaults to draft)"
        lines.append(
            f"  soul: status={status}, ratified={soul['ratified']}, "
            f"evidence citations={soul['evidence_count']}"
        )

    hb = signals["heartbeat"]
    if not hb["wired"]:
        lines.append("  heartbeat: not wired (no design/heartbeat.json with tasks)")
    else:
        fire_state = f"fired, last run at {hb['last_run_at']}" if hb["fired"] else "wired but never fired"
        lines.append(f"  heartbeat: wired ({hb['task_count']} task(s)), {fire_state}")

    tv = signals["taste_votes"]
    lines.append(f"  taste votes: {tv['count']}" if tv["exists"] else "  taste votes: no votes.jsonl found")

    roles = signals["roles"]
    lines.append(
        f"  DS role coverage: {roles['roled_tokens']}/{roles['total_tokens']} "
        f"tokens carry a design-os.role"
    )

    reg = signals["registry"]
    lines.append(
        f"  registry: {reg['component_count']} component(s) in component-registry.json, "
        f"{reg['component_registered_events']} component_registered event(s) in ledger"
    )

    return "\n".join(lines) + "\n"


def evolution(
    dir_: Annotated[Path, typer.Option("--dir", help="Project dir holding design/ (default: cwd)")] = Path("."),
    json_: JsonFlag = False,
) -> None:
    """Read a project's `design/` directory and report ALIVE / DEAD-LOOP / NO-LOOP for its
    learning loop, plus every signal's raw state. Read-only; always exits 0."""
    signals = evolution_core.gather_signals(dir_)
    data = {"project": str(dir_), **signals}
    emit(ok_env(_COMMAND, data), json_mode=json_, text=_render_text(signals), exit_code=0)
