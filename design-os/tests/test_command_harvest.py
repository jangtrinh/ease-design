"""`design-os harvest` — CliRunner + `fake_bin` (never a real model or `ui` process here).

The `ui` stub logs every invocation's raw argv to `UI_LOG` (one line per call, in order) so
tests can assert the harvested-before-child provenance chain and the `--actor`/`--refs`
flags without a real kernel. `UI_FAIL_ON` makes the stub return `ok:false` for any call
whose args contain that marker, to exercise the partial-write-never-advances-the-cursor
guarantee (Decision 4).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from design_os.cli import app
from design_os.commands import harvest as harvest_cmd

_REPORT_TEXT = (
    "# Report\n\nRan the checks, all green.\n\n"
    "Finding: widgets misalign under RTL layouts because negative padding does not "
    "mirror, a durable cross-project lesson worth remembering for every future RTL "
    "audit pass.\n\n"
    "Also: the taste rubric has no rule for RTL padding mirroring — a recipe-level "
    "gap in current guidance.\n"
)
_EVIDENCE = "widgets misalign under RTL layouts because negative padding does not mirror"
_GAP_EVIDENCE = "the taste rubric has no rule for RTL padding mirroring"
_INSIGHT_TEXT = (
    "Widgets misalign under RTL layouts because negative padding never mirrors "
    "automatically, so RTL audits must check padding direction explicitly."
)
_GAP_TEXT = (
    "The taste rubric has no rule for RTL padding mirroring, so RTL-locale audits "
    "silently miss this class of bug until a human notices it by eye."
)

# Shell builtins only (`echo`, `read`, `printf`, `[`) — `fake_bin` isolates PATH to the
# sandbox dir, so external tools like `cat`/`wc`/`touch` are NOT resolvable here.
_UI_STUB = """\
if [ "$1" = "memory" ] && [ "$2" = "record" ]; then
  echo "$@" >> "$UI_LOG"
  if [ -n "$UI_FAIL_ON" ]; then
    case "$*" in
      *"$UI_FAIL_ON"*)
        echo '{"ok": false, "command": "memory record", "error": {"code": "WRITE_ERROR", "message": "boom"}}'
        exit 0
        ;;
    esac
  fi
  n=0
  [ -f "$UI_COUNTER" ] && read -r n < "$UI_COUNTER"
  n=$((n + 1))
  printf '%s' "$n" > "$UI_COUNTER"
  echo "{\\"ok\\": true, \\"command\\": \\"memory record\\", \\"data\\": {\\"id\\": \\"e$n\\", \\"eventCount\\": $n}}"
  exit 0
fi
echo '{"ok": true, "command": "stub", "data": {"stub": true}}'
exit 0
"""


def _project(tmp_path: Path, *, with_report: bool = True) -> Path:
    # Nested under tmp_path (not tmp_path itself) so harness files (ui.log, ui.counter,
    # fake_bin's bin/) live OUTSIDE the project tree — otherwise they'd read back as
    # "harvest wrote outside design/" false positives.
    project = tmp_path / "project"
    (project / "design").mkdir(parents=True)
    if with_report:
        reports = project / "plans" / "p" / "reports"
        reports.mkdir(parents=True)
        (reports / "r.md").write_text(_REPORT_TEXT)
    return project


def _install_ui(fake_bin: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, *, fail_on: str | None = None) -> Path:
    log = tmp_path / "ui.log"
    monkeypatch.setenv("UI_LOG", str(log))
    monkeypatch.setenv("UI_COUNTER", str(tmp_path / "ui.counter"))
    monkeypatch.setenv("UI_FAIL_ON", fail_on or "")
    fake_bin.make_stub("ui", _UI_STUB)
    return log


def _install_model(fake_bin: Any, monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]], marker: Path | None = None) -> None:
    # subprocess.run's input= write is safe without the child draining stdin (it uses
    # communicate() under the hood) — no `cat > /dev/null` needed, and none is available.
    body = ""
    if marker is not None:
        body += f': > "{marker}"\n'
    payload = json.dumps({"v": 1, "candidates": candidates})  # single-line — no heredoc needed
    body += f"echo '{payload}'\n"
    fake_bin.make_stub("modelcmd", body)
    monkeypatch.setenv("DESIGN_OS_MODEL_CMD", "modelcmd")


def _insight_candidate(**overrides: Any) -> dict[str, Any]:
    base = {
        "kind": "insight", "text": _INSIGHT_TEXT, "evidence": _EVIDENCE,
        "source": "plans/p/reports/r.md", "durable": True, "actionable": True, "confidence": 0.9,
    }
    base.update(overrides)
    return base


def _gap_candidate(**overrides: Any) -> dict[str, Any]:
    base = {
        "kind": "gap", "text": _GAP_TEXT, "evidence": _GAP_EVIDENCE,
        "source": "plans/p/reports/r.md", "durable": True, "actionable": True, "confidence": 0.9,
        "target": "taste-rubric.md#rtl", "gapKind": "rubric-gap",
    }
    base.update(overrides)
    return base


def test_no_design_dir_errors_with_no_project(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["harvest", "--dir", str(tmp_path), "--json"])
    assert res.exit_code == 1
    assert json.loads(res.stdout)["error"]["code"] == "NO_PROJECT"


def test_no_new_reports_skips_cleanly_with_exit_zero(runner: CliRunner, tmp_path: Path) -> None:
    project = _project(tmp_path, with_report=False)
    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["status"] == "skipped"
    assert data["skipReason"] == "no-new-reports"


def test_unset_model_cmd_skips_and_writes_the_packet_to_the_inbox(
    runner: CliRunner, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)
    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["skipReason"] == "no-model-adapter"
    inbox = list((project / "design" / "harvest-inbox").glob("*.md"))
    assert len(inbox) == 1
    assert "widgets misalign under RTL" in inbox[0].read_text()


def test_emit_packet_writes_the_packet_and_never_calls_the_model(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    marker = tmp_path / "model-was-called"
    _install_model(fake_bin, monkeypatch, [_insight_candidate()], marker=marker)

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--emit-packet", "--json"])

    assert res.exit_code == 0
    assert not marker.exists()
    inbox = list((project / "design" / "harvest-inbox").glob("*.md"))
    assert len(inbox) == 1


def test_dry_run_gates_but_records_nothing_and_leaves_the_cursor(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    log = _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate()])

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--dry-run", "--json"])

    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["candidates"] == 1
    assert not log.exists()
    assert not (project / "design" / "harvest-state.json").exists()


def test_a_successful_harvest_records_harvested_first_then_the_insight_refs_it(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    log = _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate()])

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])

    assert res.exit_code == 0, res.stdout
    lines = log.read_text().strip("\n").split("\n")
    assert len(lines) == 2
    assert lines[0].split()[2] == "harvested"
    assert lines[1].split()[2] == "insight"
    assert "--refs e1" in lines[1]
    data = json.loads(res.stdout)["data"]
    assert data["recorded"] == {"insight": 1, "gap": 0}
    assert data["events"] == ["e1", "e2"]


def test_every_record_carries_actor_design_os_harvest(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    log = _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate(), _gap_candidate()])

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])

    assert res.exit_code == 0, res.stdout
    lines = log.read_text().strip("\n").split("\n")
    assert lines  # at least the harvested call
    for line in lines:
        assert "--actor design-os harvest" in line


def test_a_gap_is_recorded_with_its_target_and_kind(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    log = _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_gap_candidate()])

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])

    assert res.exit_code == 0, res.stdout
    lines = log.read_text().strip("\n").split("\n")
    gap_line = next(line for line in lines if line.split()[2] == "gap")
    assert '"target": "taste-rubric.md#rtl"' in gap_line
    assert '"kind": "rubric-gap"' in gap_line
    data = json.loads(res.stdout)["data"]
    assert data["recorded"] == {"insight": 0, "gap": 1}


def test_a_failed_child_write_leaves_the_cursor_unadvanced_so_the_report_reharvests(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    _install_ui(fake_bin, monkeypatch, tmp_path, fail_on="record insight")
    _install_model(fake_bin, monkeypatch, [_insight_candidate()])

    first = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])
    assert first.exit_code == 1
    assert json.loads(first.stdout)["error"]["code"] == "WRITE_ERROR"
    state_path = project / "design" / "harvest-state.json"
    if state_path.exists():
        assert "plans/p/reports/r.md" not in json.loads(state_path.read_text())["harvested"]

    monkeypatch.setenv("UI_FAIL_ON", "")
    second = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])
    assert second.exit_code == 0, second.stdout
    assert json.loads(second.stdout)["data"]["reports_read"] == 1


def test_harvest_never_writes_outside_design_and_never_touches_knowledge(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    knowledge = project / "knowledge"
    knowledge.mkdir()
    (knowledge / "marker.md").write_text("untouched")
    _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate()])

    before = {p.relative_to(project) for p in project.rglob("*") if p.is_file()}
    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])
    after = {p.relative_to(project) for p in project.rglob("*") if p.is_file()}

    assert res.exit_code == 0, res.stdout
    new_paths = after - before
    assert new_paths, "expected new files under design/"
    assert all(str(p).startswith("design/") for p in new_paths)
    assert (knowledge / "marker.md").read_text() == "untouched"


def test_prompt_version_matches_the_prompt_filename() -> None:
    assert harvest_cmd._PROMPT_PATH.stem == harvest_cmd.harvest_core.PROMPT_VERSION
    assert harvest_cmd._PROMPT_PATH.is_file()


def test_non_json_model_output_degrades_to_skipped_exit_zero_and_leaves_the_cursor(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    fake_bin.make_stub("modelcmd", "echo 'I looked at the report and found nothing worth noting.'\n")
    monkeypatch.setenv("DESIGN_OS_MODEL_CMD", "modelcmd")

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])

    assert res.exit_code == 0, res.stdout
    data = json.loads(res.stdout)["data"]
    assert data["status"] == "skipped"
    assert data["skipReason"] == "bad-candidates"
    assert not (project / "design" / "harvest-state.json").exists()
    inbox = list((project / "design" / "harvest-inbox").glob("*.md"))
    assert len(inbox) == 1


def test_a_candidate_already_in_the_ledger_from_a_partial_write_is_not_recorded_again(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    log = _install_ui(fake_bin, monkeypatch, tmp_path)
    _install_model(fake_bin, monkeypatch, [_insight_candidate()])

    # Simulate a prior partial write: the insight for this exact (kind, text, source)
    # already made it into the ledger before the run that wrote it died mid-batch.
    key = harvest_cmd.harvest_core.candidate_key("insight", _INSIGHT_TEXT, "plans/p/reports/r.md")
    ledger = project / "design" / "memory.events.jsonl"
    ledger.write_text(json.dumps({
        "v": 1, "id": "e1", "t": "2020-01-01T00:00:00Z", "type": "insight",
        "data": {"text": _INSIGHT_TEXT, "evidence": _EVIDENCE, "harvestKey": key},
    }) + "\n")

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])

    assert res.exit_code == 0, res.stdout
    data = json.loads(res.stdout)["data"]
    assert data["recorded"] == {"insight": 0, "gap": 0}
    lines = log.read_text().strip("\n").split("\n") if log.exists() else []
    assert all(line.split()[2] != "insight" for line in lines)
    assert any(line.split()[2] == "harvested" for line in lines)


def test_json_envelope_reports_dropped_candidates_by_reason(
    runner: CliRunner, tmp_path: Path, fake_bin: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(tmp_path)
    _install_ui(fake_bin, monkeypatch, tmp_path)
    candidates = [
        _insight_candidate(),
        _insight_candidate(evidence="this text is not in the report at all", text="A fabricated lesson nobody can trace back to any real source text in this report."),
        _insight_candidate(durable=False),
    ]
    _install_model(fake_bin, monkeypatch, candidates)

    res = runner.invoke(app, ["harvest", "--dir", str(project), "--json"])

    assert res.exit_code == 0, res.stdout
    data = json.loads(res.stdout)["data"]
    assert data["dropped"] == {"evidence-not-in-source": 1, "not-durable-or-actionable": 1}
    assert data["recorded"] == {"insight": 1, "gap": 0}
