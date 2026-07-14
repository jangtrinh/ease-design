"""`design-os heartbeat [--dir] [--task <id>] [--force] [--stats] [--json]` — CliRunner tests.

Task runners are monkeypatched via `TASK_RUNNERS` (never a real `ui`/`figma-agent` subprocess
here — that is exercised for real in the phase-02 dogfood transcript, not in this suite). The
clock is frozen via `heartbeat_cmd._now`, per heartbeat_core's fake-clock testing contract.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from design_os.cli import app
from design_os.commands import heartbeat as heartbeat_cmd

_NOW = datetime(2026, 1, 1, 9, 0, 0, tzinfo=timezone(timedelta(hours=7)))


def _freeze(monkeypatch: pytest.MonkeyPatch, now: datetime = _NOW) -> None:
    monkeypatch.setattr(heartbeat_cmd, "_now", lambda: now)


def _write_config(project: Path, tasks: list[dict[str, Any]]) -> None:
    design_dir = project / "design"
    design_dir.mkdir(parents=True, exist_ok=True)
    (design_dir / "heartbeat.json").write_text(json.dumps({"version": 1, "tasks": tasks}))


def _stub_from(summary_holder: dict[str, Any]):
    """A runner stub that always reports "ok" with whatever `summary_holder` currently holds
    — the test mutates the holder between CliRunner invokes to script a failures 0→2→0 arc."""

    def _run(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
        return {"status": "ok", "summary": dict(summary_holder), "detail": ""}

    return _run


# ── Case 1: no config at all → exit 0, no-heartbeat-config, zero-cost contract. ──
def test_no_config_exits_clean(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["data"]["status"] == "no-heartbeat-config"

    res_text = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path)])
    assert res_text.exit_code == 0
    assert "no config" in res_text.stdout


# ── Case 2: empty tasks list is ALSO no-heartbeat-config (not an empty-but-valid run). ──
def test_empty_tasks_list_is_also_no_config(runner: CliRunner, tmp_path: Path) -> None:
    _write_config(tmp_path, [])
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 0
    assert json.loads(res.stdout)["data"]["status"] == "no-heartbeat-config"


# ── Case 3: the 7-step plan.md scenario — baseline → not-due → force-ok → worsen → improve → stats. ──
def test_seven_step_baseline_to_stats_scenario(
    runner: CliRunner, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_config(
        tmp_path,
        [
            {"id": "a11y", "type": "ds-a11y", "interval": "1d"},
            {"id": "specimen", "type": "specimen", "interval": "1d"},
        ],
    )
    a11y_summary = {"failures": 0}
    specimen_summary = {"gaps": 0}
    monkeypatch.setitem(heartbeat_cmd.TASK_RUNNERS, "ds-a11y", _stub_from(a11y_summary))
    monkeypatch.setitem(heartbeat_cmd.TASK_RUNNERS, "specimen", _stub_from(specimen_summary))
    _freeze(monkeypatch)

    # 1. run 1 → baseline (no prior state for either task).
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert {e["status"] for e in data["tasks"]} == {"baseline"}
    assert data["checked"] == 2
    assert data["skipped"] == 0

    # 2. run 2, same clock, interval 1d → nothing due yet → all skipped, DESIGN_OK.
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path)])
    assert res.exit_code == 0
    assert res.stdout.startswith("DESIGN_OK")
    assert "2 skipped" in res.stdout
    assert "not-due" in res.stdout

    # 3. --force → due bypassed; summaries unchanged from baseline → "ok".
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--force", "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert {e["status"] for e in data["tasks"]} == {"ok"}

    # 4. break: a11y failures 0→2 → --force → exit 1, delta report names the exact metric move.
    a11y_summary["failures"] = 2
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--force"])
    assert res.exit_code == 1
    assert "failures 0→2" in res.stdout
    assert "a11y: worsened" in res.stdout

    # 5. fix: back to 0 → --force → improved, exit 0.
    a11y_summary["failures"] = 0
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--force", "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    a11y_entry = next(e for e in data["tasks"] if e["id"] == "a11y")
    assert a11y_entry["status"] == "improved"

    # 6. --stats renders the recorded ok-rate without running anything.
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--stats", "--json"])
    assert res.exit_code == 0
    stats = json.loads(res.stdout)["data"]["stats"]
    a11y_stats = next(s for s in stats if s["id"] == "a11y")
    # baseline, force-ok, force-break, force-fix = 4 recorded runs (the not-due run didn't count).
    assert a11y_stats["runs"] == 4
    assert a11y_stats["okRate"] is not None

    res_text = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--stats"])
    assert "runs=4" in res_text.stdout
    assert "ok-rate=" in res_text.stdout


# ── Case 4: lock-busy (fresh) skips the whole run; a stale (>10min) lock is overwritten. ──
def test_lock_busy_skips_all_then_stale_lock_runs_normally(
    runner: CliRunner, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_config(tmp_path, [{"id": "a11y", "type": "ds-a11y", "interval": "1d"}])
    monkeypatch.setitem(heartbeat_cmd.TASK_RUNNERS, "ds-a11y", _stub_from({"failures": 0}))
    _freeze(monkeypatch)
    lock_path = tmp_path / "design" / ".heartbeat.lock"

    # A fresh (5-minute-old) lock → total skip, exit 0, reason lock-busy, lock left untouched.
    fresh_at = _NOW - timedelta(minutes=5)
    lock_path.write_text(json.dumps({"pid": 999999, "at": fresh_at.isoformat()}))
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert all(e["status"] == "skipped" and e["skipReason"] == "lock-busy" for e in data["tasks"])
    assert lock_path.exists()
    assert json.loads(lock_path.read_text())["pid"] == 999999  # untouched — never acquired

    # A stale (11-minute-old) lock → overwritten, the run proceeds, lock cleaned up after.
    stale_at = _NOW - timedelta(minutes=11)
    lock_path.write_text(json.dumps({"pid": 999999, "at": stale_at.isoformat()}))
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["tasks"][0]["status"] == "baseline"
    assert not lock_path.exists()  # released in `finally`


# ── Case 5: figma-audit skips (agent unresolvable) without blocking other configured tasks. ──
def test_figma_audit_missing_agent_skips_but_other_tasks_still_run(
    runner: CliRunner, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(heartbeat_cmd, "resolve_bin", lambda name, env_var: None)
    _write_config(
        tmp_path,
        [
            {"id": "a11y", "type": "ds-a11y", "interval": "1d"},
            {"id": "figma", "type": "figma-audit", "interval": "7d", "params": {"file": "X"}},
        ],
    )
    monkeypatch.setitem(heartbeat_cmd.TASK_RUNNERS, "ds-a11y", _stub_from({"failures": 0}))
    _freeze(monkeypatch)

    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    figma_entry = next(e for e in data["tasks"] if e["id"] == "figma")
    assert figma_entry["status"] == "skipped"
    assert figma_entry["skipReason"] == "figma-agent-missing"
    a11y_entry = next(e for e in data["tasks"] if e["id"] == "a11y")
    assert a11y_entry["status"] == "baseline"
    assert data["checked"] == 1
    assert data["skipped"] == 1


# ── Case 6: --task wakes exactly one task (ignoring due); an unknown id is BAD_CONFIG. ──
def test_task_flag_wakes_one_task_and_rejects_unknown_id(
    runner: CliRunner, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_config(
        tmp_path,
        [
            {"id": "a11y", "type": "ds-a11y", "interval": "1d"},
            {"id": "specimen", "type": "specimen", "interval": "1d"},
        ],
    )
    monkeypatch.setitem(heartbeat_cmd.TASK_RUNNERS, "ds-a11y", _stub_from({"failures": 0}))
    monkeypatch.setitem(heartbeat_cmd.TASK_RUNNERS, "specimen", _stub_from({"gaps": 0}))
    _freeze(monkeypatch)

    runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])  # baseline both

    # Not due yet; --task a11y wakes JUST that one task.
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--task", "a11y", "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert [e["id"] for e in data["tasks"]] == ["a11y"]
    assert data["tasks"][0]["status"] == "ok"

    # An unknown --task id is a usage-class error: BAD_CONFIG, exit 2.
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--task", "nope", "--json"])
    assert res.exit_code == 2
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "BAD_CONFIG"


# ── Case 7: an unknown task TYPE in the config is also BAD_CONFIG (checked before any run). ──
def test_unknown_task_type_in_config_is_bad_config(runner: CliRunner, tmp_path: Path) -> None:
    _write_config(tmp_path, [{"id": "x", "type": "not-a-real-type", "interval": "1d"}])
    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 2
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "BAD_CONFIG"


# ── Case 8: a corrupt state file surfaces as BAD_STATE (design-os envelope convention: exit 1 — tool/data error, not a usage error). ──
def test_corrupt_state_file_is_bad_state(runner: CliRunner, tmp_path: Path) -> None:
    _write_config(tmp_path, [{"id": "a11y", "type": "ds-a11y", "interval": "1d"}])
    (tmp_path / "design" / "heartbeat-state.json").write_text("{not json")

    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "BAD_STATE"


# ── Case 9: audit-pages with a non-existent params.dir skips with a REASON (no-silent-caps,
# Opus P2 finding #3) instead of reporting a silently-green empty audit. Real runner, no stub:
# the missing-dir check fires before build_audit, so no `ui` kernel is needed. ──
def test_audit_pages_missing_dir_skips_with_reason(
    runner: CliRunner, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_config(
        tmp_path,
        [{"id": "pages", "type": "audit-pages", "interval": "7d", "params": {"dir": "design/preview"}}],
    )
    _freeze(monkeypatch)

    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 0  # a skip never changes the exit code
    data = json.loads(res.stdout)["data"]
    entry = data["tasks"][0]
    assert entry["status"] == "skipped"
    assert entry["skipReason"] == "pages-dir-missing"
    assert data["checked"] == 0
    assert data["skipped"] == 1

    res_text = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path)])
    assert res_text.exit_code == 0
    assert res_text.stdout.startswith("DESIGN_OK")
    assert "pages-dir-missing" in res_text.stdout


# ── Case 10: a runner RAISING FileNotFoundError (dead bin path — Opus P2 finding #4) becomes a
# task "error" (exit 1) with the exception in detail, never a crashed beat; lock still released. ──
def test_runner_raising_file_not_found_becomes_task_error(
    runner: CliRunner, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_config(tmp_path, [{"id": "a11y", "type": "ds-a11y", "interval": "1d"}])

    def _boom(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
        raise FileNotFoundError("ui binary vanished")

    monkeypatch.setitem(heartbeat_cmd.TASK_RUNNERS, "ds-a11y", _boom)
    _freeze(monkeypatch)

    res = runner.invoke(app, ["heartbeat", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 1  # error gates, per the OK-contract
    env = json.loads(res.stdout)  # a real envelope was printed — the exception did not escape
    assert env["ok"] is True
    entry = env["data"]["tasks"][0]
    assert entry["status"] == "error"
    assert "ui binary vanished" in entry["detail"]
    assert not (tmp_path / "design" / ".heartbeat.lock").exists()  # released in finally
