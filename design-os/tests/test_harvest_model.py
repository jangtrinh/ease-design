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
