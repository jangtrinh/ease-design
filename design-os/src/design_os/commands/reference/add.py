"""``reference add`` — shell out to pixelshot ONCE per batch, then reconcile the cache.

T2 (proposal.md §Phasing). Contract §1 (proposal.md): the umbrella never reimplements
capture — pixelshot owns it; this module only shells out, diffs the output tree, and records
the manifest.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import resolve_pixelshot

from .store import _load_index

_COMMAND = "reference add"

# Capture discipline (pilot/pixelbrowse): 1568px tiles + wait for network idle so lazy-loaded
# imagery lands before the shot; 4 workers for the batch. Numeric flags are strings — they go
# straight into the argv list, never formatted.
CAPTURE_TIMEOUT = 180.0
_TILE_HEIGHT = "1568"
_WORKERS = "4"

_MISSING_MSG = "pixelshot not on PATH — install: uv tool install pixelrag (or pipx)"


def _tile_dirs(refs_dir: Path) -> set[str]:
    """Names of the ``*.png.tiles`` capture dirs currently under ``refs_dir`` (empty if none)."""
    if not refs_dir.is_dir():
        return set()
    return {
        p.name
        for p in refs_dir.iterdir()
        if p.is_dir() and p.name.endswith(".png.tiles")
    }


def _count_tiles(tile_dir: Path) -> int:
    """Number of ``tile_*.jpg`` frames captured into one ``*.png.tiles`` dir."""
    return sum(1 for _ in tile_dir.glob("tile_*.jpg"))


def _run_pixelshot(bin_: str, urls: list[str], refs_dir: Path) -> subprocess.CompletedProcess[str]:
    """Shell out to pixelshot ONCE for the whole batch with the fixed capture discipline."""
    cmd = [
        bin_,
        *urls,
        "--output",
        str(refs_dir),
        "--tile-height",
        _TILE_HEIGHT,
        "--wait-network-idle",
        "--workers",
        _WORKERS,
    ]
    return subprocess.run(  # noqa: S603 - bin_ is a resolved path; urls are caller-controlled
        cmd, capture_output=True, text=True, timeout=CAPTURE_TIMEOUT
    )


def _build_captures(new_dirs: list[str], urls: list[str], refs_dir: Path) -> list[dict[str, Any]]:
    """One manifest entry per NEW capture dir (tile count + best-effort url + timestamp).

    url→dir mapping is best-effort: pixelshot sanitizes each url into a dir name, which we do
    NOT try to reverse. When the new-dir count matches the url count we zip a stable sort of
    each side; otherwise every ``url`` is ``null`` rather than guessed wrong.
    """
    captured_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sorted_urls = sorted(urls)
    can_map = len(new_dirs) == len(urls)
    entries: list[dict[str, Any]] = []
    for i, name in enumerate(new_dirs):
        entries.append(
            {
                "url": sorted_urls[i] if can_map else None,
                "dir": name,
                "tiles": _count_tiles(refs_dir / name),
                "capturedAt": captured_at,
            }
        )
    return entries


def _render_text(captured: list[dict[str, Any]], refs_dir: Path) -> str:
    if not captured:
        return "reference add: nothing captured (already cached?)\n"
    lines = [f"+ {c['dir']} ({c['tiles']} tiles)" for c in captured]
    lines.append(f"reference add: {len(captured)} captured -> {refs_dir}")
    return "\n".join(lines) + "\n"


def add(
    urls: Annotated[
        list[str], typer.Argument(help="URL(s) or local HTML/PDF file(s) to capture")
    ],
    project: Annotated[
        Path, typer.Option("--project", help="Project root (default: cwd)")
    ] = Path("."),
    json_: JsonFlag = False,
) -> None:
    """Capture reference(s) into references/ via pixelshot. (network: fetches the URLs via local Chrome)"""
    bin_ = resolve_pixelshot()
    if bin_ is None:
        emit(
            err_env(_COMMAND, "HAND_NOT_FOUND", _MISSING_MSG),
            json_mode=json_,
            text=f"reference add: {_MISSING_MSG}\n",
            exit_code=1,
        )
        return

    refs_dir = project / "references"
    refs_dir.mkdir(parents=True, exist_ok=True)
    before = _tile_dirs(refs_dir)  # snapshot BEFORE so new captures are a set diff, not mtime.

    try:
        proc = _run_pixelshot(bin_, urls, refs_dir)
    except subprocess.TimeoutExpired:
        msg = f"pixelshot exceeded {CAPTURE_TIMEOUT:.0f}s"
        emit(
            err_env(_COMMAND, "CAPTURE_FAILED", msg),
            json_mode=json_,
            text=f"reference add: {msg}\n",
            exit_code=1,
        )
        return

    if proc.returncode != 0:
        tail = (proc.stderr or "").strip()[-300:]
        msg = tail or f"pixelshot exited {proc.returncode}"
        emit(
            err_env(_COMMAND, "CAPTURE_FAILED", msg),
            json_mode=json_,
            text=f"reference add: capture failed\n{msg}\n",
            exit_code=1,
        )
        return

    new_dirs = sorted(_tile_dirs(refs_dir) - before)
    captured = _build_captures(new_dirs, urls, refs_dir)

    if captured:
        index_path = refs_dir / "index.json"
        index = _load_index(index_path)
        index.extend(captured)
        index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")

    data = {"captured": captured, "refsDir": str(refs_dir), "total": len(captured)}
    emit(
        ok_env(_COMMAND, data),
        json_mode=json_,
        text=_render_text(captured, refs_dir),
        exit_code=0,
    )
