"""`design-os-figma` — the first REAL plugin, discovered via a genuinely installed distribution.

Tests 1 and 6 use **no monkeypatch**: they exercise real ``design_os.plugins`` entry-point
discovery, which works because ``design-os-figma`` is a uv-workspace dev dependency installed by
``uv sync`` (Phase 05's whole point). The command tests run against a PATH-isolated stub
``figma-agent`` from the shared ``fake_bin`` sandbox — the real hand on the host can never leak
in — asserting the plugin re-emits the hand's single-JSON-object output verbatim inside the
umbrella envelope, and surfaces the hand's own error codes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import typer
from typer.testing import CliRunner

from design_os.cli import run
from design_os.plugins import PluginReport, discover, mount
from design_os_figma import app as figma_app

# figma-agent status stub: prints the single JSON object the broker returns, exit 0.
_STATUS_OK_STUB = 'echo \'{"broker": "up", "plugin": "connected"}\'\nexit 0\n'

# figma-agent audit-ds stub: prints one FULL-report JSON object (no --out), exit 0.
_AUDIT_OK_STUB = (
    'echo \'{"file": {"fileName": "VSF - PCP", "pages": ["Page 1"]}, '
    '"summary": {"total": 3, "unused": 1, "junk": 1, "deprecated": 0, "duplicate": 0, '
    '"emptySets": 0, "misfiled": 1, "redundantFamilies": 0, "tokenViolations": 0}, '
    '"components": [], "families": [], '
    '"counts": {"components": 2, "sets": 1, "instancesTallied": 5, "unresolvedUsage": 0}}\'\n'
    "exit 0\n"
)


@pytest.fixture
def figma_env(fake_bin, monkeypatch: pytest.MonkeyPatch):
    """`fake_bin` PATH sandbox + guarantee the figma-agent env override can't leak in.

    `fake_bin` already points PATH at a stub-only sandbox (so no host `figma-agent` leaks in) and
    unsets DESIGN_OS_UI_BIN; the figma-agent override is unrelated, so unset it here too —
    otherwise a dev shell (or the orchestrator review) exporting DESIGN_OS_FIGMA_AGENT_BIN would
    shadow the sandbox stub.
    """
    monkeypatch.delenv("DESIGN_OS_FIGMA_AGENT_BIN", raising=False)
    return fake_bin


# ── Case 1: REAL entry-point discovery — the end-to-end proof of the plugin chain. ──
def test_figma_entry_point_is_really_discovered() -> None:
    """No monkeypatch: the installed design-os-figma dev-dep registers a `figma` entry point in
    the `design_os.plugins` group, so `discover()` finds it for real."""
    eps = {ep.name: ep.value for ep in discover()}
    assert "figma" in eps, f"figma entry point not discovered; found: {sorted(eps)}"
    assert eps["figma"] == "design_os_figma:app"


# ── Case 2: mount() (real discovery) onto a throwaway app → figma status runs verbatim. ──
def test_mount_onto_throwaway_then_status_ok(runner: CliRunner, figma_env) -> None:
    """mount() loads the real figma plugin onto a THROWAWAY Typer app (never the static one); the
    mounted `figma status` runs the stub hand and re-emits its JSON verbatim in the envelope."""
    figma_env.make_stub("figma-agent", _STATUS_OK_STUB)

    throwaway = typer.Typer()
    reports = mount(throwaway)
    assert PluginReport(name="figma", loaded=True, error=None) in reports

    res = runner.invoke(throwaway, ["figma", "status", "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "figma status"
    assert env["data"]["result"]["broker"] == "up"
    assert env["data"]["result"]["plugin"] == "connected"


# ── Case 3: no figma-agent on PATH (+ no env override) → HAND_NOT_FOUND, exit 1. ──
def test_status_hand_not_found(runner: CliRunner, figma_env) -> None:
    """figma_env installs NO figma-agent stub → resolve_bin() is None → HAND_NOT_FOUND, exit 1."""
    res = runner.invoke(figma_app, ["status", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["command"] == "figma status"
    assert env["error"]["code"] == "HAND_NOT_FOUND"


# ── Case 4: hand exits 1 with its own {error:{code,message}} → that code is surfaced verbatim. ──
def test_status_hand_error_propagates_code(runner: CliRunner, figma_env) -> None:
    figma_env.make_stub(
        "figma-agent",
        'echo \'{"error": {"code": "NO_BROKER", "message": "broker not reachable"}}\'\nexit 1\n',
    )
    res = runner.invoke(figma_app, ["status", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["command"] == "figma status"
    assert env["error"]["code"] == "NO_BROKER"
    assert env["error"]["message"] == "broker not reachable"


# ── Case 5: hand prints something that is not one JSON object → BAD_HAND_OUTPUT, exit 1. ──
def test_status_bad_hand_output(runner: CliRunner, figma_env) -> None:
    figma_env.make_stub("figma-agent", 'echo "not json at all"\nexit 0\n')
    res = runner.invoke(figma_app, ["status", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "BAD_HAND_OUTPUT"


# ── Case 6: `design-os plugins --json` through REAL run() + real discovery → figma loaded. ──
def test_plugins_diagnostic_lists_figma_loaded(capsys: pytest.CaptureFixture[str]) -> None:
    """The built-in `plugins` diagnostic (no monkeypatch) loads the figma plugin and reports it
    mounted — proof the umbrella really sees the installed entry point."""
    code = run(["plugins", "--json"])
    out = capsys.readouterr().out
    assert code == 0
    env = json.loads(out)
    assert env["ok"] is True
    assert env["command"] == "plugins"
    figma = next((p for p in env["data"]["plugins"] if p["name"] == "figma"), None)
    assert figma is not None, f"figma not listed: {env['data']['plugins']}"
    assert figma["loaded"] is True
    assert figma["module"] == "design_os_figma:app"
    assert figma["error"] is None


# ── Case 7: scan forwards the right argv, writes --out, and returns the verbatim result + hint. ──
def test_scan_writes_out_and_emits_next_hint(runner: CliRunner, figma_env, tmp_path: Path) -> None:
    argv_log = tmp_path / "argv.txt"
    out_file = tmp_path / "ds.json"
    counts = '{"components": 3, "tokens": 42}'
    # Stub: record argv → write the counts JSON to the --out path ($3) → print the same counts.
    body = (
        'echo "$@" > "' + str(argv_log) + '"\n'
        "echo '" + counts + "' > \"$3\"\n"
        "echo '" + counts + "'\n"
        "exit 0\n"
    )
    figma_env.make_stub("figma-agent", body)

    res = runner.invoke(figma_app, ["scan", "--out", str(out_file), "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "figma scan"
    data = env["data"]
    assert data["out"] == str(out_file)
    assert data["result"] == {"components": 3, "tokens": 42}
    assert data["next"] == "ui ingest-figma-ds <out> --name <slug>"
    # The stub received EXACTLY the argv the plugin promises to forward.
    assert argv_log.read_text().strip() == f"scan-design-system --out {out_file}"
    # …and the hand actually wrote the counts file at --out.
    assert json.loads(out_file.read_text()) == {"components": 3, "tokens": 42}


# ── Case 8: `audit --json` (no --out) re-emits the hand's full report VERBATIM in the envelope. ──
def test_audit_json_reemits_report_verbatim(runner: CliRunner, figma_env) -> None:
    figma_env.make_stub("figma-agent", _AUDIT_OK_STUB)
    res = runner.invoke(figma_app, ["audit", "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "figma audit"
    result = env["data"]["result"]
    assert result["file"]["fileName"] == "VSF - PCP"
    assert result["summary"]["total"] == 3
    assert result["summary"]["unused"] == 1
    assert result["counts"]["unresolvedUsage"] == 0
    assert "agent" in env["data"]  # the resolved bin path is echoed alongside the result


# ── Case 9: audit hand exits 1 with its own {error:{code,message}} → surfaced verbatim, exit 1. ──
def test_audit_hand_error_propagates_code(runner: CliRunner, figma_env) -> None:
    figma_env.make_stub(
        "figma-agent",
        'echo \'{"error": {"code": "E_NO_PLUGIN", "message": "no plugin connected"}}\'\nexit 1\n',
    )
    res = runner.invoke(figma_app, ["audit", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["command"] == "figma audit"
    assert env["error"]["code"] == "E_NO_PLUGIN"
    assert env["error"]["message"] == "no plugin connected"


# ── Case 10: audit forwards --out at the right argv position and re-emits the compact result. ──
def test_audit_forwards_out_argv_and_reemits(runner: CliRunner, figma_env, tmp_path: Path) -> None:
    argv_log = tmp_path / "argv.txt"
    out_file = tmp_path / "audit.json"
    compact = (
        '{"path": "' + str(out_file) + '", '
        '"file": {"fileName": "VSF - PCP", "pages": ["Page 1"]}, '
        '"summary": {"total": 2, "unused": 0}}'
    )
    # Stub: record argv → write the full report to the --out path ($3) → print the compact shape.
    body = (
        'echo "$@" > "' + str(argv_log) + '"\n'
        "echo '" + '{"full": true}' + "' > \"$3\"\n"
        "echo '" + compact + "'\n"
        "exit 0\n"
    )
    figma_env.make_stub("figma-agent", body)

    res = runner.invoke(figma_app, ["audit", "--out", str(out_file), "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "figma audit"
    result = env["data"]["result"]
    assert result["path"] == str(out_file)
    assert result["summary"]["total"] == 2
    # The stub received EXACTLY the argv the plugin promises to forward, --out in position.
    assert argv_log.read_text().strip() == f"audit-ds --out {out_file}"


# ── Case 11: text mode renders the one-line header + the per-detector summary table. ──
def test_audit_text_mode_renders_header_and_summary(runner: CliRunner, figma_env) -> None:
    figma_env.make_stub("figma-agent", _AUDIT_OK_STUB)
    res = runner.invoke(figma_app, ["audit"])  # no --json → human text
    assert res.exit_code == 0, res.stdout
    assert "figma audit: VSF - PCP — 3 components, 1 pages" in res.stdout
    assert "unused: 1" in res.stdout
    assert "misfiled: 1" in res.stdout


# ── Case 12: `figma --help` lists the new `audit` leaf. ──
def test_figma_help_lists_audit(runner: CliRunner) -> None:
    res = runner.invoke(figma_app, ["--help"])
    assert res.exit_code == 0
    assert "audit" in res.stdout


# ── Case 13: `reconcile` shells to the `ui` KERNEL (not figma-agent) and re-emits its data. ──
def test_reconcile_forwards_to_ui_kernel_and_reemits(
    runner: CliRunner, figma_env, tmp_path: Path
) -> None:
    """`design-os figma reconcile` is the deterministic-kernel member of the group: it runs
    `ui figma reconcile` (contract §1) and re-emits the kernel envelope's data verbatim."""
    argv_log = tmp_path / "argv.txt"
    env_obj = (
        '{"ok": true, "command": "figma reconcile", "data": '
        '{"cursor_from": 0, "cursor_to": 2, "applied": true, "dry_run": false, '
        '"delta": {"added": [], "updated": [], "deprecated": [{"name": "Card/Basic"}]}, '
        '"apply": {"deprecated": ["Card/Basic"], "updated": [], "pending": [], "skipped": []}}}'
    )
    body = 'echo "$@" > "' + str(argv_log) + '"\n' "echo '" + env_obj + "'\n" "exit 0\n"
    figma_env.make_stub("ui", body)

    res = runner.invoke(figma_app, ["reconcile", "--apply", "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "figma reconcile"
    assert env["data"]["result"]["apply"]["deprecated"] == ["Card/Basic"]
    # The kernel got EXACTLY the argv the plugin promises to forward (apply + json).
    assert argv_log.read_text().strip() == "figma reconcile --apply --json"


# ── Case 14: `reconcile` (no --apply) forwards --dry-run. ──
def test_reconcile_default_is_dry_run(runner: CliRunner, figma_env, tmp_path: Path) -> None:
    argv_log = tmp_path / "argv.txt"
    env_obj = '{"ok": true, "command": "figma reconcile", "data": {"cursor_from": 0, "cursor_to": 0, "dry_run": true, "delta": {"added": [], "updated": [], "deprecated": []}}}'
    body = 'echo "$@" > "' + str(argv_log) + '"\n' "echo '" + env_obj + "'\n" "exit 0\n"
    figma_env.make_stub("ui", body)

    res = runner.invoke(figma_app, ["reconcile", "--since", "3", "--json"])
    assert res.exit_code == 0, res.stdout
    assert argv_log.read_text().strip() == "figma reconcile --dry-run --since 3 --json"


# ── Case 15: `reconcile` with no `ui` kernel on PATH → KERNEL_NOT_FOUND, exit 1. ──
def test_reconcile_kernel_not_found(runner: CliRunner, figma_env) -> None:
    figma_env.remove("ui")  # drop the default kernel stub → run_ui raises KernelNotFound
    res = runner.invoke(figma_app, ["reconcile", "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["command"] == "figma reconcile"
    assert env["error"]["code"] == "KERNEL_NOT_FOUND"


# ── Case 16: `figma --help` lists the new `reconcile` leaf. ──
def test_figma_help_lists_reconcile(runner: CliRunner) -> None:
    res = runner.invoke(figma_app, ["--help"])
    assert res.exit_code == 0
    assert "reconcile" in res.stdout
