"""`design-os doctor` — health envelope, exit codes, and text rendering.

Uses the PATH-isolated ``fake_bin`` sandbox so resolution is deterministic: the required
``ui``/``node`` are the stubs, and the optional hands are always absent.
"""

from __future__ import annotations

import json

from typer.testing import CliRunner

from design_os.cli import app


def test_doctor_healthy_json(runner: CliRunner, fake_bin) -> None:
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "doctor"
    checks = env["data"]["checks"]
    assert checks[0]["name"] == "ui"
    assert checks[0]["found"] is True
    assert checks[0]["version"] == "0.9.9"  # from the stub `ui --version`
    # Optional hands (figma-agent/recall/pixelshot/a11y-audit/page-shot) are absent but must not fail health.
    assert env["data"]["ok"] is True
    assert {c["name"] for c in checks} == {
        "ui", "node", "figma-agent", "recall", "pixelshot", "a11y-audit", "page-shot",
    }


def test_doctor_missing_required_node_exits_1(runner: CliRunner, fake_bin) -> None:
    fake_bin.remove("node")
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    # Envelope ok stays True (the command ran); health = data.ok + exit code, mirroring
    # the ui kernel's okJsonWithExit gating semantics. Envelope ok:false is reserved for
    # the command itself failing.
    assert env["ok"] is True
    assert env["data"]["ok"] is False
    node = next(c for c in env["data"]["checks"] if c["name"] == "node")
    assert node["found"] is False
    assert node["required"] is True


def test_doctor_missing_ui_exits_1(runner: CliRunner, fake_bin) -> None:
    fake_bin.remove("ui")
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["data"]["ok"] is False
    ui = next(c for c in env["data"]["checks"] if c["name"] == "ui")
    assert ui["found"] is False


def test_doctor_text_mode_mentions_ui(runner: CliRunner, fake_bin) -> None:
    res = runner.invoke(app, ["doctor"])
    assert res.exit_code == 0
    assert "ui" in res.stdout
    assert "OK" in res.stdout


def test_doctor_optional_hand_reports_present(runner: CliRunner, fake_bin) -> None:
    # An optional hand on PATH is reported found=True but health stays keyed on required.
    fake_bin.make_stub("figma-agent", 'echo "irrelevant"\nexit 0\n')
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    fa = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "figma-agent")
    assert fa["found"] is True
    assert fa["required"] is False
    assert fa["version"] is None  # T0: optional versions stay null


# Stub that answers `--version` like a real optional hand would; anything else is irrelevant.
_VERSIONED_STUB_BODY = 'if [ "$1" = "--version" ]; then\n  echo "1.2.3"\n  exit 0\nfi\necho "irrelevant"\nexit 0\n'


def test_doctor_versions_flag_probes_optional_hand_version(runner: CliRunner, fake_bin) -> None:
    # T1: `--versions` opts into probing each FOUND optional hand's `--version`.
    fake_bin.make_stub("figma-agent", _VERSIONED_STUB_BODY)
    res = runner.invoke(app, ["doctor", "--versions", "--json"])
    assert res.exit_code == 0
    fa = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "figma-agent")
    assert fa["found"] is True
    assert fa["version"] == "1.2.3"


def test_doctor_without_versions_flag_stays_null(runner: CliRunner, fake_bin) -> None:
    # Same stub, but WITHOUT --versions → behavior stays byte-identical to today: null.
    fake_bin.make_stub("figma-agent", _VERSIONED_STUB_BODY)
    res = runner.invoke(app, ["doctor", "--json"])
    assert res.exit_code == 0
    fa = next(c for c in json.loads(res.stdout)["data"]["checks"] if c["name"] == "figma-agent")
    assert fa["found"] is True
    assert fa["version"] is None
