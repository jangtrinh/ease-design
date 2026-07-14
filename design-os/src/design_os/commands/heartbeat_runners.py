"""Task runners + lock helpers for ``design-os heartbeat`` (split out of
commands/heartbeat.py per the <200-line rule; heartbeat_render.py keeps the rendering).

Each runner takes ``(project_dir, params)`` and returns ``{"status": "ok"|"error"|
"skipped", "summary": {…numeric…}, "detail": str, "skipReason"?}`` — summaries are
numeric-only so heartbeat_core.compare_summary stays generic (phase-02 §Bước 3). Every
subprocess catch includes ``OSError``: a dead/non-executable resolved bin path becomes a
task "error" naming the bin, never a traceback (Opus P2 finding #4).
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from design_os.commands.audit import build_audit
from design_os.kernel import KernelNotFound

_SUBPROCESS_TIMEOUT = 120.0
_FIGMA_PROBE_TIMEOUT = 10.0
_FIGMA_AUDIT_TIMEOUT = 300.0
_FIGMA_RETRY_BACKOFFS = (1.0, 2.0)  # phase-02 §Bước 3: figma-audit ONLY, max 2 retries
# Deliberately excludes `unused`/`misfiled` (day-to-day noise per phase-02 §Bước 3) and
# `total`/`deadVariants`/`redundantFamilies` (not in the spec's tracked-metric list).
_FIGMA_SUMMARY_KEYS = ("junk", "deprecated", "duplicateName", "duplicateStructure", "emptySets", "tokenViolations")


def _parse_one_json(stdout: str) -> Any:
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return None


def _resolve_bin(name: str, env_var: str) -> str | None:
    """Resolve a hand binary THROUGH the command module's namespace: tests monkeypatch
    ``commands.heartbeat.resolve_bin`` (the documented seam) to simulate a missing hand, so
    runners read it late via that module instead of capturing ``kernel.resolve_bin`` at
    import time. The deferred import cannot cycle (heartbeat imports this module at load)."""
    from design_os.commands import heartbeat as heartbeat_cmd
    return heartbeat_cmd.resolve_bin(name, env_var)


# ─── task runners ──────────────────────────────────────────────────────────────


def _run_ui_json(argv_tail: list[str], label: str, data_key: str, summary_key: str) -> dict[str, Any]:
    """Shared `ui … --json` runner for the two kernel-backed task types: resolve the bin,
    run one subprocess, parse ONE envelope, count ``data[data_key]`` into ``{summary_key: n}``."""
    ui_bin = _resolve_bin("ui", "DESIGN_OS_UI_BIN")
    if ui_bin is None:
        return {"status": "error", "summary": {}, "detail": "the `ui` kernel binary was not found"}
    try:
        proc = subprocess.run(  # noqa: S603
            [ui_bin, *argv_tail], capture_output=True, text=True, timeout=_SUBPROCESS_TIMEOUT
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "summary": {}, "detail": f"`{label}` exceeded {_SUBPROCESS_TIMEOUT:.0f}s"}
    except OSError as e:
        return {"status": "error", "summary": {}, "detail": f"`{ui_bin}` could not be executed: {e}"}
    env = _parse_one_json(proc.stdout)
    if not isinstance(env, dict) or not isinstance(env.get("data"), dict):
        return {"status": "error", "summary": {}, "detail": f"`{label}` printed no valid envelope (exit {proc.returncode})"}
    items = env["data"].get(data_key)
    return {"status": "ok", "summary": {summary_key: len(items) if isinstance(items, list) else 0}, "detail": ""}


def _run_ds_a11y(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    return _run_ui_json(["ds", "a11y", "--dir", str(project_dir), "--json"], "ui ds a11y", "failures", "failures")


def _run_specimen(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    return _run_ui_json(["ds", "specimen", "--dir", str(project_dir), "--strict", "--json"], "ui ds specimen", "findings", "gaps")


def _run_audit_pages(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Static page audit via a direct :func:`build_audit` import (no subprocess).

    Point ``params.dir`` at a page directory (e.g. ``design/preview``), not the project
    root — a project-root target re-runs the DS/flow sections the separate ds-a11y/specimen
    tasks already cover (double-count; hardening deferred to P3, Opus P2 finding #2).
    A missing dir skips with reason ``pages-dir-missing`` instead of reporting a
    silently-green empty audit (no-silent-caps, Opus P2 finding #3).
    """
    raw_dir = params.get("dir") if isinstance(params, dict) else None
    target = Path(raw_dir) if raw_dir else project_dir
    if raw_dir and not target.is_absolute():
        target = project_dir / target
    if not target.exists():
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "pages-dir-missing"}
    try:
        _sections, summary, _exit_code, _n_files = build_audit(target, None)
    except KernelNotFound as e:
        return {"status": "error", "summary": {}, "detail": f"`audit {target}`: {e}"}
    return {"status": "ok", "summary": {"errors": summary["errors"], "warnings": summary["warnings"]}, "detail": ""}


def _run_figma_audit(
    project_dir: Path,
    params: dict[str, Any],
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    bin_ = _resolve_bin("figma-agent", "DESIGN_OS_FIGMA_AGENT_BIN")
    if bin_ is None:
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "figma-agent-missing"}
    env = os.environ.copy()
    file_param = params.get("file") if isinstance(params, dict) else None
    if file_param:
        env["FIGMA_AGENT_FILE"] = str(file_param)
    try:
        probe = subprocess.run(  # noqa: S603
            [bin_, "status"], capture_output=True, text=True, timeout=_FIGMA_PROBE_TIMEOUT, env=env
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "summary": {}, "detail": "`figma-agent status` exceeded 10s"}
    except OSError as e:
        return {"status": "error", "summary": {}, "detail": f"`{bin_}` could not be executed: {e}"}
    probe_data = _parse_one_json(probe.stdout)
    plugins = probe_data.get("plugins") if isinstance(probe_data, dict) else None
    if not isinstance(plugins, list) or len(plugins) == 0:
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "figma-plugin-down"}
    detail = "figma-agent audit-ds failed"
    for backoff in (0.0, *_FIGMA_RETRY_BACKOFFS):
        if backoff:
            sleep(backoff)
        try:
            proc = subprocess.run(  # noqa: S603
                [bin_, "audit-ds"], capture_output=True, text=True, timeout=_FIGMA_AUDIT_TIMEOUT, env=env
            )
        except subprocess.TimeoutExpired:
            detail = "`figma-agent audit-ds` exceeded 300s"
            continue
        except OSError as e:
            detail = f"`{bin_}` could not be executed: {e}"
            continue
        parsed = _parse_one_json(proc.stdout)
        if not isinstance(parsed, dict):
            detail = "`figma-agent audit-ds` did not print a single JSON object"
            continue
        if proc.returncode != 0:
            err = parsed.get("error")
            detail = str(err.get("message")) if isinstance(err, dict) and err.get("message") else detail
            continue
        summary = parsed.get("summary")
        if not isinstance(summary, dict):
            detail = "`figma-agent audit-ds` response missing 'summary'"
            continue
        picked = {k: summary.get(k, 0) for k in _FIGMA_SUMMARY_KEYS}
        return {"status": "ok", "summary": picked, "detail": ""}
    return {"status": "error", "summary": {}, "detail": detail}


TaskRunner = Callable[[Path, dict[str, Any]], dict[str, Any]]

# Dispatch table — tests monkeypatch entries via `monkeypatch.setitem(TASK_RUNNERS, "id", stub)`;
# commands/heartbeat.py re-imports THIS dict object, so `heartbeat_cmd.TASK_RUNNERS` patches land.
TASK_RUNNERS: dict[str, TaskRunner] = {
    "ds-a11y": _run_ds_a11y,
    "specimen": _run_specimen,
    "audit-pages": _run_audit_pages,
    "figma-audit": _run_figma_audit,
}

# ─── lock ──────────────────────────────────────────────────────────────────────

_LOCK_STALE_SECONDS = 600  # 10 minutes


def acquire_lock(lock_path: Path, now: datetime) -> bool:
    """True → lock acquired (absent, or stale >10min and overwritten) — caller MUST release
    it in a `finally`. False → held by a live run; caller must skip everything, exit 0."""
    if lock_path.exists():
        stale = True
        try:
            data = json.loads(lock_path.read_text())
            at = datetime.fromisoformat(data["at"])
            stale = (now - at).total_seconds() > _LOCK_STALE_SECONDS
        except (OSError, json.JSONDecodeError, KeyError, ValueError, TypeError):
            stale = True  # corrupt lock content — safest default is to treat it as stale
        if not stale:
            return False
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.write_text(json.dumps({"pid": os.getpid(), "at": now.isoformat()}))
    return True


def lock_busy_entries(tasks_cfg: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One all-skipped entry per configured task, for a run that never acquired the lock."""
    return [
        {"id": t["id"], "type": t["type"], "status": "skipped", "summary": {}, "prev": None, "skipReason": "lock-busy"}
        for t in tasks_cfg
    ]
