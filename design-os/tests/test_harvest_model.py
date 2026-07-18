"""`harvest_model` — the adapter subprocess seam. `fake_bin` (conftest.py) sandboxes PATH so
no real model binary can leak into the test env."""

from __future__ import annotations

from pathlib import Path

import pytest

from design_os.harvest_model import ModelUnavailable, extract, resolve_model_cmd


def test_resolve_model_cmd_returns_none_when_the_env_var_is_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)
    assert resolve_model_cmd() is None


def test_resolve_model_cmd_splits_the_command_with_shlex(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DESIGN_OS_MODEL_CMD", "claude -p --model x")
    assert resolve_model_cmd() == ["claude", "-p", "--model", "x"]


def test_extract_passes_the_packet_on_stdin_and_returns_stdout(tmp_path: Path) -> None:
    captured = tmp_path / "captured.txt"
    script = tmp_path / "echo-model.sh"
    script.write_text(f"#!/bin/sh\ncat > {captured}\ncat {captured}\n")
    script.chmod(0o755)

    out = extract("the packet body", cmd=[str(script)])

    assert out == "the packet body"
    assert captured.read_text() == "the packet body"


def test_extract_raises_model_unavailable_on_a_missing_binary(tmp_path: Path) -> None:
    with pytest.raises(ModelUnavailable):
        extract("packet", cmd=[str(tmp_path / "does-not-exist")])


def test_extract_raises_model_unavailable_on_a_nonzero_exit(tmp_path: Path) -> None:
    script = tmp_path / "fail-model.sh"
    script.write_text("#!/bin/sh\ncat > /dev/null\nexit 1\n")
    script.chmod(0o755)
    with pytest.raises(ModelUnavailable):
        extract("packet", cmd=[str(script)])


def test_extract_raises_model_unavailable_on_timeout(tmp_path: Path) -> None:
    script = tmp_path / "hang-model.sh"
    script.write_text("#!/bin/sh\ncat > /dev/null\nsleep 5\n")
    script.chmod(0o755)
    with pytest.raises(ModelUnavailable):
        extract("packet", cmd=[str(script)], timeout=0.2)


# ─── spec 013 P2: resolve from the ui-init manifest when env is unset ────────────────────

def _wire(project: Path, manifest_rel: str, wrapper_rel: str) -> Path:
    """Write a runtime manifest with a modelAdapter + an executable wrapper (as `ui init` does)."""
    import json
    mf = project / manifest_rel
    mf.parent.mkdir(parents=True, exist_ok=True)
    mf.write_text(json.dumps({"version": 1, "runtime": "x", "status": "ready",
                              "modelAdapter": {"wrapper": wrapper_rel, "mode": "stdin"}}))
    wp = project / wrapper_rel
    wp.parent.mkdir(parents=True, exist_ok=True)
    wp.write_text("#!/usr/bin/env sh\nexec claude -p\n")
    wp.chmod(0o755)
    return wp


def test_resolve_reads_the_manifest_wrapper_when_env_is_unset(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)
    wp = _wire(tmp_path, ".claude/ease-design.json", ".claude/design-os-model.sh")
    assert resolve_model_cmd(tmp_path) == [str(wp)]


def test_env_override_wins_over_the_manifest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(tmp_path, ".claude/ease-design.json", ".claude/design-os-model.sh")
    monkeypatch.setenv("DESIGN_OS_MODEL_CMD", "my-model -q")
    assert resolve_model_cmd(tmp_path) == ["my-model", "-q"]


def test_resolve_is_none_when_no_manifest_exists(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)
    assert resolve_model_cmd(tmp_path) is None


def test_resolve_is_none_when_the_wrapper_file_is_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)
    import json
    mf = tmp_path / ".claude" / "ease-design.json"
    mf.parent.mkdir(parents=True, exist_ok=True)
    mf.write_text(json.dumps({"modelAdapter": {"wrapper": ".claude/gone.sh", "mode": "stdin"}}))
    assert resolve_model_cmd(tmp_path) is None  # manifest names a wrapper that isn't there


def test_running_host_marker_wins_over_declared_order(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import os
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)
    # Isolate: the test process itself runs under a host (CLAUDE_* set), which would otherwise
    # make claude detect as "running". Clear every configured marker, then set only agy's.
    for prefix in ("CLAUDECODE", "CLAUDE_CODE", "CLAUDE_", "CODEX_", "OPENAI_CODEX", "ANTIGRAVITY", "AGY_"):
        for k in list(os.environ):
            if k.startswith(prefix):
                monkeypatch.delenv(k, raising=False)
    # both claude (declared first) and antigravity wired; only the agy host env is present
    _wire(tmp_path, ".claude/ease-design.json", ".claude/design-os-model.sh")
    agy = _wire(tmp_path, ".agent/ease-design.json", ".agent/design-os-model.sh")
    monkeypatch.setenv("ANTIGRAVITY_SESSION", "1")
    assert resolve_model_cmd(tmp_path) == [str(agy)]


def test_declared_order_breaks_the_tie_when_no_host_marker_is_present(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import os
    monkeypatch.delenv("DESIGN_OS_MODEL_CMD", raising=False)
    for prefix in ("CLAUDECODE", "CLAUDE_CODE", "CLAUDE_", "CODEX_", "OPENAI_CODEX", "ANTIGRAVITY", "AGY_"):
        for k in list(os.environ):
            if k.startswith(prefix):
                monkeypatch.delenv(k, raising=False)
    # no host marker (the cron case) → the declared order (claude first) wins deterministically
    claude = _wire(tmp_path, ".claude/ease-design.json", ".claude/design-os-model.sh")
    _wire(tmp_path, ".agent/ease-design.json", ".agent/design-os-model.sh")
    assert resolve_model_cmd(tmp_path) == [str(claude)]
