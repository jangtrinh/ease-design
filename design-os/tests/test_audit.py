"""`design-os audit <target>` — section composition, summary tally, and exit gating.

Most cases run against a PATH-isolated stub ``ui`` (deterministic, no real kernel). Two
INTEGRATION cases at the bottom exercise the REAL ``ui`` on the committed fixture site.

── OBSERVED kernel envelope shape (recorded per phase-02, verified by running the real
   `ui a11y-lint`/`content-lint`/`taste-lint` on tests/fixtures/audit-site/ on 2026-07-12) ──

  a11y-lint / content-lint / validate-layout  (data):
    {"file": <str>, "findings": [ {"checkId","severity","sc?","message","line?"} … ],
     "errorCount": <int>, "warningCount": <int>}
  taste-lint  (data):  {"file", "errorCount", "axesAffected": [...], "findings": [...]}
     ⇒ note: taste-lint has NO "warningCount" key → _count uses data.get("warningCount", 0).
  envelope wrapper (all): {"ok": true, "command": <tool>, "data": {…}}; exit 1 iff errorCount>0.

  So the audit summary counts errors/warnings from data.errorCount/warningCount (present on
  every per-file linter), and falls back to counting findings by severity for any future
  check that emits only findings. That is exactly what commands/audit.py::_count does.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app
from design_os.commands import audit as audit_mod

# ── Stub `ui`: branch on the first arg (the tool). Mirrors the observed data shape. ──
# a11y-lint → 1 error (exit 1); every other per-file linter → 0 errors (exit 0). ds/flow echo
# their argv into data so a test can prove `--dir`/positional forwarding.
_AUDIT_UI_STUB = r"""
case "$1" in
  a11y-lint)
    printf '%s\n' '{"ok":true,"command":"a11y-lint","data":{"file":"f","findings":[{"checkId":"icon-control-unnamed","severity":"error","sc":"4.1.2","message":"emoji control has no accessible name"}],"errorCount":1,"warningCount":0}}'
    exit 1 ;;
  validate-layout|taste-lint|content-lint)
    printf '%s\n' '{"ok":true,"command":"'"$1"'","data":{"file":"f","findings":[],"errorCount":0,"warningCount":0}}'
    exit 0 ;;
  ds)
    printf '%s\n' '{"ok":true,"command":"ds '"$2"'","data":{"findings":[],"errorCount":0,"warningCount":0,"argv":"'"$*"'"}}'
    exit 0 ;;
  flow)
    printf '%s\n' '{"ok":true,"command":"flow lint","data":{"findings":[],"errorCount":0,"warningCount":0,"argv":"'"$*"'"}}'
    exit 0 ;;
  --version)
    echo "0.9.9" ; exit 0 ;;
  *)
    printf '%s\n' '{"ok":true,"command":"stub","data":{}}'
    exit 0 ;;
esac
"""

# Timeout stub: the FIRST per-file linter (validate-layout) hangs; the rest return fast, so a
# test can assert the timed-out section is recorded AND later tools still run. `sleep` is
# called by ABSOLUTE path because the fake_bin PATH sandbox holds only the stubs (a bare
# `sleep` would be unresolved → exit 127, never actually hanging).
_TIMEOUT_UI_STUB = r"""
case "$1" in
  validate-layout)
    /bin/sleep 5 ;;
  *)
    printf '%s\n' '{"ok":true,"command":"'"$1"'","data":{"file":"f","findings":[],"errorCount":0,"warningCount":0}}'
    exit 0 ;;
esac
"""

_MINIMAL_HTML = "<!doctype html><html lang=en><head><title>t</title></head><body><p>hi</p></body></html>\n"


def _write_html(path: Path) -> Path:
    path.write_text(_MINIMAL_HTML)
    return path


# ── Case 1: single file → 4 sections, one error, exit 1, envelopes carried verbatim. ──
def test_audit_single_file_json(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _AUDIT_UI_STUB)
    page = _write_html(tmp_path / "page.html")
    res = runner.invoke(app, ["audit", str(page), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "audit"
    data = env["data"]
    assert data["files"] == 1
    assert [s["tool"] for s in data["sections"]] == audit_mod.PER_FILE_LINTERS
    assert data["summary"] == {"toolsRun": 4, "toolsFailed": 0, "errors": 1, "warnings": 0}
    # The kernel envelope is passed through untouched (contract §1: not re-normalised).
    a11y = next(s for s in data["sections"] if s["tool"] == "a11y-lint")
    assert a11y["exitCode"] == 1
    assert a11y["envelope"]["command"] == "a11y-lint"
    assert a11y["envelope"]["data"]["errorCount"] == 1
    assert a11y["envelope"]["data"]["findings"][0]["checkId"] == "icon-control-unnamed"


# ── Case 2: directory rglob drops excluded segments; 2 valid files → 8 sections. ──
def test_audit_dir_excludes_build_segments(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _AUDIT_UI_STUB)
    _write_html(tmp_path / "page-a.html")
    _write_html(tmp_path / "page-b.html")
    # An HTML file under an excluded dependency tree must be skipped. Build the path with
    # os.path.join (per phase-02) — the excluded segment lives only in Python, never a shell arg.
    excluded_dir = Path(os.path.join(str(tmp_path), "node_modules", "pkg"))
    excluded_dir.mkdir(parents=True)
    _write_html(excluded_dir / "vendored.html")

    res = runner.invoke(app, ["audit", str(tmp_path), "--json"])
    assert res.exit_code == 1
    sections = json.loads(res.stdout)["data"]["sections"]
    assert len(sections) == 8  # 2 valid files × 4 linters; the vendored file is excluded
    assert all("node_modules" not in s["target"] for s in sections)
    # Both valid files, each covered by the full linter chain.
    covered = {s["target"] for s in sections}
    assert any(t.endswith("page-a.html") for t in covered)
    assert any(t.endswith("page-b.html") for t in covered)


# ── Case 3: DS detected via design/component-registry.json → `ds specimen --dir`. ──
def test_audit_detects_ds_specimen(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _AUDIT_UI_STUB)
    (tmp_path / "design").mkdir()
    (tmp_path / "design" / "component-registry.json").write_text("{}")

    res = runner.invoke(app, ["audit", str(tmp_path), "--json"])
    assert res.exit_code == 0  # no html, stubbed ds returns clean
    sections = json.loads(res.stdout)["data"]["sections"]
    specimen = next(s for s in sections if s["tool"] == "ds specimen")
    # The stub echoes its argv into data → proves audit forwarded `specimen --dir <dir>`.
    assert "--dir" in specimen["envelope"]["data"]["argv"]
    assert str(tmp_path) in specimen["envelope"]["data"]["argv"]
    # ds a11y is NOT emitted without design/ds.manifest.json.
    assert all(s["tool"] != "ds a11y" for s in sections)


# ── Case 3b: ds.manifest.json also present → `ds a11y` section added. ──
def test_audit_detects_ds_a11y_when_manifest_present(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _AUDIT_UI_STUB)
    (tmp_path / "design").mkdir()
    (tmp_path / "design" / "component-registry.json").write_text("{}")
    (tmp_path / "design" / "ds.manifest.json").write_text("{}")

    res = runner.invoke(app, ["audit", str(tmp_path), "--json"])
    tools = {s["tool"] for s in json.loads(res.stdout)["data"]["sections"]}
    assert {"ds specimen", "ds a11y"} <= tools


# ── Case 4: a per-tool timeout is recorded and the audit continues. ──
def test_audit_timeout_section_and_continues(
    runner: CliRunner, fake_bin, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_bin.make_stub("ui", _TIMEOUT_UI_STUB)
    # 1.0s sits comfortably above sh-spawn latency (the fast tools finish well under it) yet
    # far below the 5s sleep, so ONLY validate-layout times out — no flake from a tight bound.
    monkeypatch.setattr(audit_mod, "AUDIT_TIMEOUT", 1.0)  # force validate-layout to time out
    page = _write_html(tmp_path / "page.html")

    res = runner.invoke(app, ["audit", str(page), "--json"])
    assert res.exit_code == 1
    data = json.loads(res.stdout)["data"]
    sections = data["sections"]
    assert len(sections) == 4
    first = sections[0]
    assert first["tool"] == "validate-layout"
    assert first["exitCode"] == -1
    assert first["envelope"]["ok"] is False
    assert first["envelope"]["error"]["code"] == "TIMEOUT"
    # Later tools STILL ran after the timeout.
    later = next(s for s in sections if s["tool"] == "a11y-lint")
    assert later["exitCode"] == 0
    assert data["summary"]["toolsFailed"] >= 1


# ── Case 5: `ui` absent → whole command aborts with KERNEL_NOT_FOUND. ──
def test_audit_missing_ui_kernel_not_found(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.remove("ui")  # PATH sandbox no longer resolves `ui`; DESIGN_OS_UI_BIN is unset
    page = _write_html(tmp_path / "page.html")  # target exists → not a TARGET_NOT_FOUND case
    res = runner.invoke(app, ["audit", str(page), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "KERNEL_NOT_FOUND"


# ── Case 6: text mode renders the summary line in the documented format. ──
def test_audit_text_mode_summary_line(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _AUDIT_UI_STUB)
    page = _write_html(tmp_path / "page.html")
    res = runner.invoke(app, ["audit", str(page)])
    assert res.exit_code == 1
    lines = res.stdout.splitlines()
    assert lines[-1] == "audit: 4 tool-runs, 1 errors, 0 warnings"
    assert any(line.startswith("[a11y-lint]") and "1 error(s)" in line for line in lines)


# ── Defensive: a non-existent target fails fast with a clear envelope (before kernel work). ──
def test_audit_target_not_found(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    missing = tmp_path / "does-not-exist.html"
    res = runner.invoke(app, ["audit", str(missing), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "TARGET_NOT_FOUND"


# ── Case 7: INTEGRATION — the real `ui` kernel on the committed fixture site. ──
_FIXTURES = Path(__file__).parent / "fixtures" / "audit-site"
_no_ui = shutil.which("ui") is None


@pytest.mark.integration
@pytest.mark.skipif(_no_ui, reason="requires the real `ui` kernel on PATH")
def test_audit_real_ui_on_fixture_site(runner: CliRunner) -> None:
    res = runner.invoke(app, ["audit", str(_FIXTURES), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "audit"
    data = env["data"]
    # The full per-file linter chain ran (no golden count — the kernel evolves).
    tools = {s["tool"] for s in data["sections"]}
    assert set(audit_mod.PER_FILE_LINTERS) <= tools
    assert data["summary"]["errors"] >= 1  # the emoji-button + lorem defects
    # content-lint on index.html caught the placeholder copy.
    content_index = next(
        s for s in data["sections"]
        if s["tool"] == "content-lint" and s["target"].endswith("index.html")
    )
    findings = content_index["envelope"]["data"]["findings"]
    assert any("lorem" in f.get("checkId", "") for f in findings)


@pytest.mark.integration
@pytest.mark.skipif(_no_ui, reason="requires the real `ui` kernel on PATH")
def test_audit_real_ui_clean_file_exit_0(runner: CliRunner) -> None:
    res = runner.invoke(app, ["audit", str(_FIXTURES / "clean.html"), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["summary"]["errors"] == 0
    assert data["summary"]["toolsFailed"] == 0


# ── Case: ds a11y failures-shape counting (dogfood L6). The kernel's `ds a11y` data has
# no errorCount/findings — {pairs, failures, unresolved} — so the summary printed
# "0 error(s)" for a section that gated the whole audit. Failures count as errors;
# `unresolved` is a couldn't-check report and must NOT be counted. ──
_DS_A11Y_FAIL_STUB = (
    'if [ "$1" = "ds" ] && [ "$2" = "a11y" ]; then\n'
    "  echo '"
    '{"ok":true,"command":"ds a11y","data":{"mode":"inferred","pairs":[],'
    '"failures":[{"text":"colors.a","surface":"colors.b","ratio":1.0},'
    '{"text":"colors.c","surface":"colors.d","ratio":1.1}],"unresolved":["typography-sizes.text-2xl"]}}'
    "'\n"
    "  exit 1\nfi\n"
    "echo '"
    '{"ok":true,"command":"stub","data":{"errorCount":0,"warningCount":0,"findings":[]}}'
    "'\nexit 0\n"
)


def test_audit_counts_ds_a11y_failures_shape(runner: CliRunner, fake_bin, tmp_path: Path) -> None:
    fake_bin.make_stub("ui", _DS_A11Y_FAIL_STUB)
    (tmp_path / "design").mkdir()
    (tmp_path / "design" / "component-registry.json").write_text("{}")
    (tmp_path / "design" / "ds.manifest.json").write_text("{}")

    res = runner.invoke(app, ["audit", str(tmp_path), "--json"])
    assert res.exit_code == 1  # the ds a11y section gated
    data = json.loads(res.stdout)["data"]
    assert data["summary"]["errors"] == 2  # 2 failures counted; unresolved NOT counted
    sec = next(s for s in data["sections"] if s["tool"] == "ds a11y")
    assert sec["exitCode"] == 1

    res_text = runner.invoke(app, ["audit", str(tmp_path)])
    assert "[ds a11y]" in res_text.stdout
    assert "2 error(s)" in res_text.stdout
