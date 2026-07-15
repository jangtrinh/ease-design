"""``design-os librarian collect [--dir <project>]... [--json]`` — deterministic gap collector.

Phase P4 / WS-D (spec 002). The DETERMINISTIC half of the graduation loop: discover projects,
read their ledgers, find gaps no ``insight`` has resolved, pre-compute cross-project recurrence.
It calls NO model and makes NO judgement — assess/draft/judge live in the host-CLI procedure
``knowledge/librarian-loop.md``; merge is the human gate.

Discovery (spec chốt #5): repeated ``--dir`` is the PRIMARY source. With no ``--dir``, collect
falls back to the best-effort user registry (``$EASE_DESIGN_HOME/projects.json``) and the
envelope ALWAYS carries ``data.discovery`` + ``data.warnings`` so a thin registry is never a
silent blind spot.

Studio-gap home (spec chốt #7): studio-level gaps — belonging to no client project — are filed
into the ledger of this repo's own ``brand/`` DS store; pass it like any other project:
``design-os librarian collect --dir <repo>/brand``.
"""

from __future__ import annotations

from typing import Annotated, Any, Optional

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env

from .core import BadLedger, collect_data, discover_projects

_COMMAND = "librarian collect"


def _render_text(data: dict[str, Any]) -> str:
    """Human summary — the machine truth is the ``--json`` envelope."""
    lines = [
        f"librarian collect: {len(data['open_gaps'])} open gap(s) "
        f"across {len(data['projects'])} project(s)"
    ]
    for group in data["groups"]:
        mark = " [recurrent]" if group["recurrent"] else ""
        lines.append(
            f"  {group['target']}: {len(group['gap_ids'])} gap(s), "
            f"{group['distinct_project_count']} project(s){mark}"
        )
    for warning in data.get("warnings", []):
        lines.append(f"  ! {warning}")
    return "\n".join(lines) + "\n"


def collect(
    dirs: Annotated[
        Optional[list[str]],
        typer.Option(
            "--dir",
            help="Project root to scan (repeatable; PRIMARY source). "
            "Studio-level gaps live in <repo>/brand.",
        ),
    ] = None,
    json_: JsonFlag = False,
) -> None:
    """Collect open knowledge gaps across projects and group them by target for the loop."""
    projects, discovery, warnings = discover_projects(dirs or [])
    try:
        data = collect_data(projects)
    except BadLedger as exc:
        emit(
            err_env(_COMMAND, "BAD_LEDGER", str(exc)),
            json_mode=json_,
            text=f"librarian collect: {exc}\n",
            exit_code=1,
        )
        return

    if discovery is not None:
        data["discovery"] = discovery
    if warnings:
        data["warnings"] = warnings

    emit(
        ok_env(_COMMAND, data),
        json_mode=json_,
        text=_render_text(data),
        exit_code=0,
    )
