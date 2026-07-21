"""`design-os evolution [--dir] [--json]` — CliRunner tests + the LIVE paired assertion
(Art III): dana-desktop (real, dogfooded all session) must read DEAD-LOOP, VSF-PCP (real,
spec 006 P5's hand-wired loop) must read ALIVE. The live tests are skipped when this
machine's `/Users/jang/Products` checkouts aren't present (e.g. CI) — they are read-only,
never write into either project.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app
from design_os.report_style import rule_header

_DANA = Path("/Users/jang/Products/dana-desktop")
_VSF = Path("/Users/jang/Products/VSF-PCP")
_PLATFORM_DS = Path("/Users/jang/Products/platform-design-system")


def test_no_ledger_json_envelope(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["evolution", "--dir", str(tmp_path), "--json"])

    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "evolution"
    assert env["data"]["verdict"] == "NO-LOOP"


def test_dead_loop_text_and_exit_zero(runner: CliRunner, tmp_path: Path) -> None:
    design_dir = tmp_path / "design"
    design_dir.mkdir()
    (design_dir / "memory.events.jsonl").write_text(
        json.dumps({"v": 1, "id": "e1", "t": "2026-07-17T12:00:00Z", "type": "token_change",
                     "data": {"path": "color.accent", "from": "#000", "to": "#111"}}) + "\n",
        encoding="utf-8",
    )

    res = runner.invoke(app, ["evolution", "--dir", str(tmp_path)])

    assert res.exit_code == 0  # a health report, not a gate — always exits 0
    # Phase 2 (spec 019): the verdict line now wraps in report_style.rule_header
    # ("evolution ──…── DEAD-LOOP") instead of the plain "evolution: DEAD-LOOP".
    assert rule_header("evolution", "DEAD-LOOP") in res.stdout


def test_wired_project_json_and_text(runner: CliRunner, tmp_path: Path) -> None:
    """spec 012 P2: a project fresh out of `ds init`/`ds import`'s wireFuelLine —
    heartbeat.json present, no ledger yet — reads WIRED, and the text report still
    names the heartbeat state (Art VIII) even with no ledger to report on."""
    design_dir = tmp_path / "design"
    design_dir.mkdir()
    (design_dir / "heartbeat.json").write_text(json.dumps({
        "version": 1,
        "tasks": [
            {"id": "a11y", "type": "ds-a11y", "interval": "1d"},
            {"id": "specimen", "type": "specimen", "interval": "1d"},
            {"id": "harvest", "type": "harvest", "interval": "12h"},
            {"id": "reflect", "type": "reflect", "interval": "24h", "params": {"minEvents": 5}},
        ],
    }), encoding="utf-8")
    (design_dir / "soul.md").write_text(
        "---\nstatus: draft\n---\n\n## Never\n\n## Always\n\n## Voice\n", encoding="utf-8",
    )

    res_json = runner.invoke(app, ["evolution", "--dir", str(tmp_path), "--json"])
    assert res_json.exit_code == 0
    env = json.loads(res_json.stdout)
    assert env["data"]["verdict"] == "WIRED"

    res_text = runner.invoke(app, ["evolution", "--dir", str(tmp_path)])
    assert res_text.exit_code == 0
    # Phase 2 (spec 019): verdict line now wraps in report_style.rule_header; every
    # other dimension line (Art VIII) is untouched, including this heartbeat line.
    assert rule_header("evolution", "WIRED") in res_text.stdout
    assert "heartbeat: wired (4 task(s)), wired but never fired" in res_text.stdout


@pytest.mark.skipif(not _DANA.is_dir(), reason="dana-desktop checkout not present on this machine")
def test_live_dana_is_dead_loop(runner: CliRunner) -> None:
    res = runner.invoke(app, ["evolution", "--dir", str(_DANA), "--json"])

    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["data"]["verdict"] == "DEAD-LOOP"
    assert env["data"]["ledger"]["insight_events"] == 0
    assert env["data"]["soul"]["ratified"] is False
    assert env["data"]["heartbeat"]["fired"] is False


@pytest.mark.skipif(not _VSF.is_dir(), reason="VSF-PCP checkout not present on this machine")
def test_live_vsf_is_alive(runner: CliRunner) -> None:
    res = runner.invoke(app, ["evolution", "--dir", str(_VSF), "--json"])

    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["data"]["verdict"] == "ALIVE"
    assert env["data"]["ledger"]["insight_events"] > 0
    assert env["data"]["soul"]["ratified"] is True
    assert env["data"]["heartbeat"]["wired"] is True
    assert env["data"]["heartbeat"]["task_count"] == 5


@pytest.mark.skipif(not _PLATFORM_DS.is_dir(), reason="platform-design-system checkout not present")
def test_live_platform_ds_names_nested_store_and_stale_heartbeat(runner: CliRunner) -> None:
    res = runner.invoke(app, ["evolution", "--dir", str(_PLATFORM_DS), "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    codes = {item["code"] for item in env["data"]["proofDiagnostics"]}
    assert "nested-memory-store" in codes
    assert "heartbeat-never-recorded" in codes
