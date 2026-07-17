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

import os
import shlex
import subprocess


class ModelUnavailable(Exception):
    """A missing binary, a timeout, or a non-zero exit — the caller degrades to `skipped`,
    never crashes the heartbeat."""


def resolve_model_cmd() -> list[str] | None:
    """`DESIGN_OS_MODEL_CMD` split with `shlex`; `None` when unset or blank."""
    raw = os.environ.get("DESIGN_OS_MODEL_CMD")
    if not raw or not raw.strip():
        return None
    return shlex.split(raw)


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
