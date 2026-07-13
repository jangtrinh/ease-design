"""`design-os vr-matrix` — accept/gate composition over stubbed `ui` + `page-shot`.

Most cases run against PATH-isolated stubs (deterministic, no real kernel/browser): a combined
``ui`` stub that (a) writes 2 fake component pages + an index.json for ``ds preview --split`` and
(b) emits a pass/fail envelope for ``vr gate`` (echoing its argv so forwarding can be proven),
plus a ``page-shot`` stub that writes one PNG per ``*.html`` input. One INTEGRATION case at the
bottom drives the REAL ``ui`` + ``page-shot`` end-to-end (accept → gate → clean).
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app
from design_os.kernel import resolve_bin

# ── Combined `ui` stub. `ds preview --split <dir>` writes 2 pages + index.json into <dir>;
# `vr gate` emits a pass/fail envelope carrying its own argv (so --max-ratio forwarding is
# assertable). The __SENTINELS__ are substituted per-variant by _ui_stub(). ──
_UI_STUB_TMPL = r"""
if [ "$1" = "ds" ] && [ "$2" = "preview" ]; then
  split=""
  prev=""
  for a in "$@"; do
    if [ "$prev" = "--split" ]; then split="$a"; fi
    prev="$a"
  done
  /bin/mkdir -p "$split"
  printf '%s' '<!doctype html><html lang=en><head><title>b</title></head><body><p>Button</p></body></html>' > "$split/control-button.html"
  printf '%s' '<!doctype html><html lang=en><head><title>c</title></head><body><p>Card</p></body></html>' > "$split/display-card.html"
  printf '%s' '{"total":2,"pages":[{"name":"Control/Button","status":"stable","file":"control-button.html"},{"name":"Display/Card","status":"stable","file":"display-card.html"}]}' > "$split/index.json"
  printf '%s\n' '{"ok":true,"command":"ds preview","data":{"mode":"split","pages":2}}'
  exit 0
fi
if [ "$1" = "vr" ] && [ "$2" = "gate" ]; then
  printf '%s\n' '{"ok":true,"command":"vr gate","data":{"maxRatio":0,"regressions":__REG__,"entries":[{"name":"control-button.png","status":"__STATUS__","diffPixels":__DIFFPIX__,"diffRatio":__DIFFRATIO__}],"argv":"'"$*"'"}}'
  exit __EXIT__
fi
printf '%s\n' '{"ok":true,"command":"stub","data":{}}'
exit 0
"""


def _ui_stub(*, regressions: int = 0, exit_code: int = 0) -> str:
    status = "ok" if regressions == 0 else "changed"
    return (
        _UI_STUB_TMPL.replace("__REG__", str(regressions))
        .replace("__STATUS__", status)
        .replace("__DIFFPIX__", "0" if regressions == 0 else "1600")
        .replace("__DIFFRATIO__", "0" if regressions == 0 else "1")
        .replace("__EXIT__", str(exit_code))
    )


# page-shot stub: write a 'PNG' file per *.html arg into the --out dir; emit a clean envelope.
# External commands are called by ABSOLUTE path (the fake_bin PATH sandbox holds only the stubs);
# basename is done with pure shell parameter expansion so no external tool is needed.
_PAGE_SHOT_STUB = r"""
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--out" ]; then out="$a"; fi
  prev="$a"
done
/bin/mkdir -p "$out"
for a in "$@"; do
  case "$a" in
    *.html)
      base=${a##*/}
      stem=${base%.html}
      printf 'PNG' > "$out/$stem.png"
      ;;
  esac
done
printf '%s\n' '{"ok":true,"command":"page-shot","data":{"shots":[],"errors":[],"total":0}}'
exit 0
"""

# page-shot stub that FAILS (e.g. no browser) → exercises the RENDER_FAILED path.
_PAGE_SHOT_FAIL_STUB = (
    "printf '%s\\n' "
    "'{\"ok\":false,\"command\":\"page-shot\",\"error\":"
    "{\"code\":\"NO_BROWSER\",\"message\":\"Could not launch Google Chrome\"}}'\n"
    "exit 1\n"
)


@pytest.fixture
def vr_bin(fake_bin, monkeypatch: pytest.MonkeyPatch):
    """`fake_bin` (PATH-isolated) with the page-shot env override cleared → PATH-only resolution."""
    monkeypatch.delenv("DESIGN_OS_PAGE_SHOT_BIN", raising=False)
    return fake_bin


def _project(tmp_path: Path, *, with_baseline: bool = False) -> Path:
    project = tmp_path / "proj"
    project.mkdir()
    if with_baseline:
        base = project / "design" / "vr-baselines"
        base.mkdir(parents=True)
        (base / "control-button.png").write_text("PNG")
    return project


# ── accept: renders every component, promotes the PNGs into <project>/design/vr-baselines. ──
def test_vr_matrix_accept_creates_baselines(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub())
    vr_bin.make_stub("page-shot", _PAGE_SHOT_STUB)
    project = _project(tmp_path)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--accept", "--json"])
    assert res.exit_code == 0
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "vr-matrix"
    data = env["data"]
    assert data["mode"] == "accept"
    assert data["summary"] == {"components": 2, "accepted": 2}
    assert {s["name"] for s in data["sections"]} == {"control-button", "display-card"}
    assert all(s["action"] == "accepted" for s in data["sections"])
    # Baselines actually written to the default dir.
    base = project / "design" / "vr-baselines"
    assert (base / "control-button.png").exists()
    assert (base / "display-card.png").exists()


def test_vr_matrix_accept_custom_baselines_dir(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub())
    vr_bin.make_stub("page-shot", _PAGE_SHOT_STUB)
    project = _project(tmp_path)
    baselines = tmp_path / "custom-baselines"

    res = runner.invoke(
        app, ["vr-matrix", "--project", str(project), "--baselines", str(baselines), "--accept", "--json"]
    )
    assert res.exit_code == 0
    assert json.loads(res.stdout)["data"]["baselines"] == str(baselines)
    assert (baselines / "control-button.png").exists()


# ── gate PASS: baseline present, no regression → exit 0, vr envelope carried verbatim. ──
def test_vr_matrix_gate_pass(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub(regressions=0, exit_code=0))
    vr_bin.make_stub("page-shot", _PAGE_SHOT_STUB)
    project = _project(tmp_path, with_baseline=True)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--json"])
    assert res.exit_code == 0
    data = json.loads(res.stdout)["data"]
    assert data["mode"] == "gate"
    assert data["summary"]["regressions"] == 0
    section = data["sections"][0]
    assert section["tool"] == "vr gate"
    assert section["exitCode"] == 0
    assert section["envelope"]["command"] == "vr gate"  # verbatim


# ── gate FAIL: a regression → exit 1, and the vr envelope is carried VERBATIM. ──
def test_vr_matrix_gate_fail_verbatim(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub(regressions=1, exit_code=1))
    vr_bin.make_stub("page-shot", _PAGE_SHOT_STUB)
    project = _project(tmp_path, with_baseline=True)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    # Envelope ok stays True (the command RAN); the gate lives in the exit code + the section.
    assert env["ok"] is True
    data = env["data"]
    assert data["summary"]["regressions"] == 1
    section = data["sections"][0]
    assert section["exitCode"] == 1
    # Carried verbatim (contract §1): per-entry vr results live untouched inside the section.
    assert section["envelope"]["data"]["regressions"] == 1
    assert section["envelope"]["data"]["entries"][0]["status"] == "changed"


# ── gate with no baseline dir at all → NO_BASELINE err envelope + the --accept hint. ──
def test_vr_matrix_gate_no_baseline(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub())
    vr_bin.make_stub("page-shot", _PAGE_SHOT_STUB)
    project = _project(tmp_path)  # no design/vr-baselines

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "NO_BASELINE"
    assert "--accept" in env["error"]["message"]


# ── render hand absent → HAND_NOT_FOUND (fires after the split, per the spec order). ──
def test_vr_matrix_hand_not_found(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub())
    vr_bin.remove("page-shot")  # absent on PATH; the env override is cleared by vr_bin
    project = _project(tmp_path)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "HAND_NOT_FOUND"
    assert "page-shot" in env["error"]["message"]


# ── --max-ratio is forwarded to `ui vr gate` verbatim (the stub echoes its argv). ──
def test_vr_matrix_max_ratio_forwarded(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub())
    vr_bin.make_stub("page-shot", _PAGE_SHOT_STUB)
    project = _project(tmp_path, with_baseline=True)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--max-ratio", "0.05", "--json"])
    assert res.exit_code == 0
    argv = json.loads(res.stdout)["data"]["sections"][0]["envelope"]["data"]["argv"]
    assert "--max-ratio" in argv
    assert "0.05" in argv


# ── a present-but-failing render hand → RENDER_FAILED (surfaces page-shot's own message). ──
def test_vr_matrix_render_failed(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub())
    vr_bin.make_stub("page-shot", _PAGE_SHOT_FAIL_STUB)
    project = _project(tmp_path)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--accept", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "RENDER_FAILED"


# ── the `ui` kernel absent → the whole command aborts with KERNEL_NOT_FOUND. ──
def test_vr_matrix_kernel_not_found(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.remove("ui")
    project = _project(tmp_path)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "KERNEL_NOT_FOUND"


# ── text mode renders a PASS/FAIL verdict line. ──
def test_vr_matrix_gate_text_mode(runner: CliRunner, vr_bin, tmp_path: Path) -> None:
    vr_bin.make_stub("ui", _ui_stub(regressions=1, exit_code=1))
    vr_bin.make_stub("page-shot", _PAGE_SHOT_STUB)
    project = _project(tmp_path, with_baseline=True)

    res = runner.invoke(app, ["vr-matrix", "--project", str(project)])
    assert res.exit_code == 1
    assert "vr-matrix: FAIL" in res.stdout
    assert "1 regression" in res.stdout


# ── INTEGRATION: the real `ui` + `page-shot` end-to-end. Fresh DS → accept → gate → clean. ──
_PERSONA_DATA = Path(__file__).parents[2] / "knowledge" / "personas" / "personas.json"
_no_ui = shutil.which("ui") is None
_no_page_shot = resolve_bin("page-shot", "DESIGN_OS_PAGE_SHOT_BIN") is None


@pytest.mark.integration
@pytest.mark.skipif(
    _no_ui or _no_page_shot, reason="requires the real `ui` kernel + `page-shot` hand (env-provided)"
)
def test_vr_matrix_integration_accept_then_gate(runner: CliRunner, tmp_path: Path) -> None:
    project = tmp_path / "proj"
    project.mkdir()
    init = subprocess.run(  # noqa: S603 - ui resolved from PATH; args are literals
        [
            shutil.which("ui"), "ds", "init", "acme",
            "--persona", "liquid-glass", "--intent", "a calm dense SaaS instrument",
            "--dir", str(project), "--persona-data", str(_PERSONA_DATA), "--json",
        ],
        capture_output=True, text=True,
    )
    assert init.returncode == 0, init.stderr or init.stdout

    # Record baselines, then gate the freshly-rendered shots against them on the SAME machine.
    acc = runner.invoke(app, ["vr-matrix", "--project", str(project), "--accept", "--json"])
    assert acc.exit_code == 0, acc.stdout
    assert json.loads(acc.stdout)["data"]["summary"]["accepted"] > 0

    gate = runner.invoke(app, ["vr-matrix", "--project", str(project), "--json"])
    assert gate.exit_code == 0, gate.stdout  # same machine/fonts + reduced-motion → no regression
    assert json.loads(gate.stdout)["data"]["summary"]["regressions"] == 0
