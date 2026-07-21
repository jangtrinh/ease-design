"""Kernel bridge: locate and shell out to the deterministic ``ui`` TS binary.

Contract §1 (proposal.md): the umbrella NEVER reimplements a ``ui`` check — it only
shells out to ``ui … --json`` and parses the envelope. This module is that single seam.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any


class KernelNotFound(RuntimeError):
    """Raised when the ``ui`` kernel binary cannot be located on PATH or via env override."""


#: Floor for the ``ui`` kernel version this ``design-os`` release was built against (spec
#: 019 phase 3 — the two-CLI coupling blind spot). Keep in sync with the ease-design repo's
#: ``package.json`` "version" at release time; a below-floor ``ui`` is a SOFT doctor warning,
#: never a hard fail (older ``ui`` builds keep working, they just get told to update).
MIN_UI_VERSION = "0.1.0"


@dataclass
class KernelResult:
    """Outcome of a ``ui`` shell-out: raw streams + a parsed envelope when stdout is JSON."""

    returncode: int
    envelope: dict[str, Any] | None
    stdout: str
    stderr: str


def resolve_bin(name: str, env_var: str) -> str | None:
    """Locate a binary by name.

    Order: explicit ``env_var`` override (used verbatim) → ``PATH`` lookup via
    ``shutil.which(name)`` → ``None`` when nothing is found. This is the single resolution
    policy shared by every hand the umbrella shells out to.
    """
    override = os.environ.get(env_var)
    if override:
        return override
    return shutil.which(name)


def resolve_ui() -> str | None:
    """Locate the ``ui`` kernel binary.

    Order: explicit ``DESIGN_OS_UI_BIN`` env override (used verbatim) → ``PATH`` lookup →
    ``None`` when nothing is found.
    """
    return resolve_bin("ui", "DESIGN_OS_UI_BIN")


def resolve_pixelshot() -> str | None:
    """Locate the ``pixelshot`` capture hand.

    Order: explicit ``DESIGN_OS_PIXELSHOT_BIN`` env override (used verbatim) → ``PATH``
    lookup → ``None`` when nothing is found.
    """
    return resolve_bin("pixelshot", "DESIGN_OS_PIXELSHOT_BIN")


def run_ui(args: list[str], *, timeout: float = 120.0) -> KernelResult:
    """Shell out to ``ui <args>``, capturing output and parsing a JSON envelope if present.

    Raises :class:`KernelNotFound` when ``ui`` is not resolvable. A non-JSON stdout yields
    ``envelope=None`` (e.g. ``ui --version`` prints a bare version string, not an envelope).
    """
    ui_bin = resolve_ui()
    if ui_bin is None:
        raise KernelNotFound(
            "The `ui` kernel binary was not found. Install/link it "
            "(e.g. `npm link` in the ease-design repo) or set DESIGN_OS_UI_BIN to its path."
        )
    proc = subprocess.run(  # noqa: S603 - args are caller-controlled, ui is trusted
        [ui_bin, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    try:
        parsed: Any = json.loads(proc.stdout)
    except json.JSONDecodeError:
        parsed = None
    envelope = parsed if isinstance(parsed, dict) else None
    return KernelResult(
        returncode=proc.returncode,
        envelope=envelope,
        stdout=proc.stdout,
        stderr=proc.stderr,
    )


def ui_version() -> str | None:
    """Return the resolved ``ui`` binary's ``--version`` output, or ``None`` on any failure.

    Deterministic subprocess of a LOCAL binary — allowed under Art I (no-network); this
    never makes a network call. Degrades to ``None`` on missing binary, timeout, non-zero
    exit, or empty output, mirroring the rest of the kernel's "degrade, don't crash" style.
    """
    ui_bin = resolve_ui()
    if ui_bin is None:
        return None
    try:
        proc = subprocess.run(  # noqa: S603 - ui_bin is a resolved, trusted local path
            [ui_bin, "--version"], capture_output=True, text=True, timeout=10.0
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip() or None


def _parse_semver(version: str) -> tuple[int, int, int] | None:
    """Parse a strict ``X.Y.Z`` semver string; ``None`` on any non-conforming input."""
    parts = version.strip().split(".")
    if len(parts) != 3:
        return None
    try:
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    except ValueError:
        return None


def meets_min_ui_version(version: str | None) -> bool:
    """True when ``version`` parses as semver and is ``>= MIN_UI_VERSION``.

    Missing/unparsable input is treated as NOT meeting the floor — a doctor warning is the
    safe default, never a crash or a silent pass.
    """
    if version is None:
        return False
    parsed = _parse_semver(version)
    floor = _parse_semver(MIN_UI_VERSION)
    if parsed is None or floor is None:
        return False
    return parsed >= floor


def ui_below_floor(version: str | None) -> bool:
    """True ONLY when ``version`` is a valid semver strictly below ``MIN_UI_VERSION``.

    An unknown/unparseable version is NOT below-floor — we never warn "run update" on a
    version string we cannot read (e.g. a future ``ui`` printing ``unknown``); that is a
    different, non-actionable condition than a genuinely old build.
    """
    parsed = _parse_semver(version) if version is not None else None
    floor = _parse_semver(MIN_UI_VERSION)
    if parsed is None or floor is None:
        return False
    return parsed < floor
