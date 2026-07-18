"""The pluggable model adapter (spec 006 P4 Decision 2) — the repo's first host-model call.

A fresh process per harvest run, fed nothing but the versioned prompt + report text on
stdin: no session reuse, no conversation history, no repo context. `DESIGN_OS_MODEL_CMD`
is parsed with `shlex.split` and run as an argv list (never `shell=True`) — the value is
the operator's own config, not user input, but the packet still goes on stdin, never argv.

The packet embeds report text from `plans/**/reports/*.md`, which is agent-written =
UNTRUSTED input — a report can carry a prompt injection aimed at whatever model `cmd`
invokes here. `harvest_core.strip_untrusted` is cheap defense-in-depth on the packet
before it reaches this module; the real containment boundary is downstream, at the
librarian veto-chain + human merge into `knowledge/`, not this adapter or the gate.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path


class ModelUnavailable(Exception):
    """A missing binary, a timeout, or a non-zero exit — the caller degrades to `skipped`,
    never crashes the heartbeat."""


# Per-runtime manifests written by `ui init` (spec 013), each may carry a
# `modelAdapter.wrapper` — the executable that normalizes that host's model to our
# stdin contract. `(manifest rel path, env markers that mean THIS host is running)`.
# Order is the stable precedence when several manifests exist (a project init'd `--all`);
# the host actually running wins over declared order via its env markers.
_RUNTIME_MANIFESTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (".claude/ease-design.json", ("CLAUDECODE", "CLAUDE_CODE", "CLAUDE_")),
    ("AGENTS.ease-design.json", ("CODEX_", "OPENAI_CODEX")),
    (".agent/ease-design.json", ("ANTIGRAVITY", "AGY_")),
)


def _wrapper_from_manifest(project_dir: Path) -> list[str] | None:
    """Resolve the model wrapper from a project's `ui init` manifest(s). When several
    runtimes were init'd, the host whose env markers are present wins; otherwise the
    declared order above breaks the tie. Returns `None` if no wired, existing wrapper."""
    candidates: list[tuple[int, str]] = []
    for rel, env_markers in _RUNTIME_MANIFESTS:
        path = project_dir / rel
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        adapter = data.get("modelAdapter") if isinstance(data, dict) else None
        wrapper = adapter.get("wrapper") if isinstance(adapter, dict) else None
        if not isinstance(wrapper, str) or not wrapper:
            continue
        wrapper_path = project_dir / wrapper
        if not wrapper_path.is_file():
            continue
        host_running = any(any(k.startswith(m) for k in os.environ) for m in env_markers)
        candidates.append((0 if host_running else 1, str(wrapper_path)))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0])  # stable: host-running first, else declared order
    return [candidates[0][1]]


def resolve_model_cmd(project_dir: Path | None = None) -> list[str] | None:
    """The model command, in precedence order (spec 013 P2):
    1. `DESIGN_OS_MODEL_CMD` (shlex-split) — the operator's explicit override always wins.
    2. else the wrapper `ui init` wired into `project_dir`'s runtime manifest — so a freshly
       injected project harvests with the user's own host model, zero manual config.
    3. else `None` — the caller degrades to `skipped` (`no-model-adapter`), unchanged."""
    raw = os.environ.get("DESIGN_OS_MODEL_CMD")
    if raw and raw.strip():
        return shlex.split(raw)
    if project_dir is not None:
        return _wrapper_from_manifest(project_dir)
    return None


def extract(packet: str, *, cmd: list[str], timeout: float = 300.0) -> str:
    """Run the host model on a fresh process with `packet` on stdin; return raw stdout."""
    try:
        proc = subprocess.run(  # noqa: S603 - cmd is operator config; never shell=True
            cmd, input=packet, capture_output=True, text=True, timeout=timeout
        )
    except FileNotFoundError as e:
        raise ModelUnavailable(f"model command not found: {cmd!r}: {e}") from e
    except subprocess.TimeoutExpired as e:
        raise ModelUnavailable(f"model command timed out after {timeout}s: {cmd!r}") from e
    except OSError as e:
        raise ModelUnavailable(f"model command failed to start: {cmd!r}: {e}") from e
    if proc.returncode != 0:
        raise ModelUnavailable(
            f"model command exited {proc.returncode}: {cmd!r}\nstderr: {proc.stderr.strip()}"
        )
    return proc.stdout
