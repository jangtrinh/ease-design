"""``design-os doctor [--json]`` — verify the umbrella's runtime dependencies.

Deterministic composition check (no model/network): locates the ``ui`` kernel and
``node`` (required) plus the optional Node/Python hands (figma-agent, recall, pixelshot,
a11y-audit, page-shot).
The envelope always carries the full ``checks`` list; the top-level ``ok`` and the exit
code both mirror health (0 healthy / 1 a required dependency is missing).
"""

from __future__ import annotations

import shutil
import subprocess
from typing import Annotated, Any

import typer

from design_os.envelope import JsonFlag, emit, ok_env
from design_os.kernel import resolve_ui, run_ui

_COMMAND = "doctor"


def _probe_version(cmd: list[str], *, timeout: float = 10.0) -> str | None:
    """Run a ``--version``-style probe; return stripped stdout or ``None`` on any failure.

    Subprocess failures (missing binary, timeout, OS error, non-zero exit) degrade to
    ``None`` rather than crashing the doctor.
    """
    try:
        proc = subprocess.run(  # noqa: S603 - cmd built from a resolved absolute path
            cmd, capture_output=True, text=True, timeout=timeout
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip() or None


def _check_ui() -> dict[str, Any]:
    path = resolve_ui()
    if path is None:
        return {"name": "ui", "required": True, "found": False, "version": None, "path": None}
    version: str | None = None
    try:
        version = run_ui(["--version"], timeout=10.0).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        # Kernel present but the version probe failed — still counts as "found".
        version = None
    return {"name": "ui", "required": True, "found": True, "version": version, "path": path}


def _check_node() -> dict[str, Any]:
    path = shutil.which("node")
    if path is None:
        return {"name": "node", "required": True, "found": False, "version": None, "path": None}
    return {
        "name": "node",
        "required": True,
        "found": True,
        "version": _probe_version([path, "--version"]),
        "path": path,
    }


def _check_optional(name: str, probe: bool) -> dict[str, Any]:
    path = shutil.which(name)
    # T0: optional hands report presence only by default. T1: `--versions` opts into probing
    # each found hand's `--version` (degrades to None on any failure — see _probe_version).
    version = _probe_version([path, "--version"]) if (path is not None and probe) else None
    return {
        "name": name,
        "required": False,
        "found": path is not None,
        "version": version,
        "path": path,
    }


def _render_text(checks: list[dict[str, Any]], ok: bool) -> str:
    lines: list[str] = []
    for c in checks:
        if c["found"]:
            ver = f" {c['version']}" if c["version"] else ""
            loc = f" ({c['path']})" if c["path"] else ""
            lines.append(f"OK  {c['name']}{ver}{loc}")
        else:
            tag = "required" if c["required"] else "optional"
            lines.append(f"MISS {c['name']} — {tag}")
    present = sum(1 for c in checks if c["found"])
    lines.append(f"{'ok' if ok else 'FAIL'} — {present}/{len(checks)} present")
    return "\n".join(lines) + "\n"


def doctor(
    versions: Annotated[
        bool, typer.Option("--versions", help="Probe optional hands' versions too")
    ] = False,
    json_: JsonFlag = False,
) -> None:
    """Verify the design-os runtime: the `ui` kernel, node, and optional hands."""
    checks: list[dict[str, Any]] = [
        _check_ui(),
        _check_node(),
        _check_optional("figma-agent", versions),
        _check_optional("recall", versions),
        _check_optional("pixelshot", versions),
        _check_optional("a11y-audit", versions),
        _check_optional("page-shot", versions),
    ]
    ok = all(c["found"] for c in checks if c["required"])
    data = {"checks": checks, "ok": ok}
    # Kernel semantics (mirrors ui's okJsonWithExit): the COMMAND ran, so the envelope is
    # ok:true in both states; health lives in data.ok and the EXIT CODE carries the gate
    # (0 healthy / 1 required dep missing). Envelope ok:false is reserved for the command
    # itself failing (usage error, crash) — the strict union in proposal.md §3.
    emit(ok_env(_COMMAND, data), json_mode=json_, text=_render_text(checks, ok), exit_code=0 if ok else 1)
