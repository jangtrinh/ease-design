"""``design-os evolution [--dir] [--json]`` — spec 012 P1 (+ P2's WIRED state): reads a
project's `design/` directory and reports whether its LEARNING LOOP is ALIVE, WIRED,
DEAD-LOOP, or NO-LOOP, with a per-signal breakdown (Art VIII — the report always names
every dimension's state).

Read-only, deterministic, no model, no network (Art I). This INFORMS — it never fails a
build — so it always exits 0, unlike `doctor`/`heartbeat`'s health-gated exit codes.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

import typer

from design_os import evolution_core, evolution_proof
from design_os.envelope import JsonFlag, emit, ok_env
from design_os.report_style import rule_header

_COMMAND = "evolution"


def _render_text(
    signals: dict[str, Any],
    proof: dict[str, Any] | None = None,
    diagnostics: list[dict[str, str]] | None = None,
) -> str:
    # Every dimension is printed regardless of the ledger's existence (Art VIII) — a
    # WIRED project (spec 012 P2: heartbeat configured, never fired) has NO ledger yet,
    # and cutting the report short there would hide the very signal (heartbeat wired)
    # that explains why the verdict isn't NO-LOOP.
    proof = proof or {"level": "ALIVE", "counts": {}, "findings": []}
    diagnostics = diagnostics or []
    lines: list[str] = [rule_header("evolution", signals["verdict"])]
    lines.append(
        f"  living-agent proof: {proof['level']} "
        f"(sources={proof.get('counts', {}).get('sources', 0)}, "
        f"applications={proof.get('counts', {}).get('applications', 0)}, "
        f"defects={proof.get('counts', {}).get('defects', 0)}, "
        f"comparisons={proof.get('counts', {}).get('comparisons', 0)})"
    )
    for item in [*proof.get("findings", []), *diagnostics]:
        lines.append(f"  proof finding [{item['code']}]: {item['message']}")

    ledger = signals["ledger"]
    if not ledger["exists"]:
        lines.append("  ledger: no memory.events.jsonl — the loop has never run")
    else:
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
    proof_: Annotated[Path | None, typer.Option("--proof", help="Evolution proof JSON (default: design/evolution-proof.json)")] = None,
    json_: JsonFlag = False,
) -> None:
    """Read a project's `design/` directory and report ALIVE / DEAD-LOOP / NO-LOOP for its
    learning loop, plus every signal's raw state. Read-only; always exits 0."""
    signals = evolution_core.gather_signals(dir_)
    proof_path = proof_ or dir_ / "design" / "evolution-proof.json"
    proof = evolution_proof.read_and_validate(proof_path)
    diagnostics = evolution_proof.proof_diagnostics(dir_)
    data = {"project": str(dir_), **signals, "proof": proof, "proofDiagnostics": diagnostics}
    emit(ok_env(_COMMAND, data), json_mode=json_, text=_render_text(signals, proof, diagnostics), exit_code=0)
