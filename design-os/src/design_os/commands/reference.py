"""``design-os reference add <url...> [--project <dir>] [--json]`` — capture references.

T2 (proposal.md §Phasing). ``reference add`` shells out to the ``pixelshot`` capture hand
ONCE for the whole batch, then reconciles the reference cache: it diffs the ``*.png.tiles``
capture dirs under ``references/`` BY NAME (never mtime), tallies ``tile_*.jpg`` frames per
new capture, and appends each to ``references/index.json``.

Convention: references cache at ``<project>/references/<slug>/`` (workflow-experience.md).
Contract §1 (proposal.md): the umbrella never reimplements capture — pixelshot owns it; this
command only shells out, diffs the output tree, and records the manifest.

``reference list`` / ``reference rm`` are pure filesystem+index operations (no pixelshot, no
network): ``list`` reports the cached captures (with a live ``present`` bit in case the index
has drifted from disk — e.g. a user deleted a capture dir by hand), ``rm`` deletes one capture
dir and its index entry.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import resolve_pixelshot

_COMMAND = "reference add"
_COMMAND_LIST = "reference list"
_COMMAND_RM = "reference rm"

# Capture discipline (pilot/pixelbrowse): 1568px tiles + wait for network idle so lazy-loaded
# imagery lands before the shot; 4 workers for the batch. Numeric flags are strings — they go
# straight into the argv list, never formatted.
CAPTURE_TIMEOUT = 180.0
_TILE_HEIGHT = "1568"
_WORKERS = "4"

_MISSING_MSG = "pixelshot not on PATH — install: uv tool install pixelrag (or pipx)"
_BAD_NAME_MSG = "name must not be empty, '.', '..', or contain a path separator"

# Sub-Typer: an explicit callback keeps ``reference`` a GROUP so the lone ``add`` leaf can't
# be hoisted to ``design-os reference`` by Typer's single-command collapse (es-typer §2 ⚠).
reference_app = typer.Typer(name="reference", no_args_is_help=True)


@reference_app.callback()
def _reference_root() -> None:
    """Manage the project's reference cache (references/)."""
    # no-op collapse guard — see module docstring / es-typer §2.


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


def _load_index(index_path: Path) -> list[dict[str, Any]]:
    """Read ``index.json`` as a list; a missing/corrupt/non-list file starts fresh (``[]``)."""
    if not index_path.exists():
        return []
    try:
        parsed = json.loads(index_path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return parsed if isinstance(parsed, list) else []


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


def _render_list_text(captures: list[dict[str, Any]]) -> str:
    if not captures:
        return "no references cached\n"
    lines = [
        f"{c['dir']} ({c['tiles']} tiles)" + ("" if c["present"] else " !missing")
        for c in captures
    ]
    lines.append(f"reference list: {len(captures)} cached")
    return "\n".join(lines) + "\n"


def _validate_rm_name(name: str, refs_dir: Path) -> str | None:
    """Traversal guard for ``reference rm``: return an error message, or ``None`` if safe.

    Two independent checks (both must pass before any delete happens):
    1. reject empty / ``.`` / ``..`` / anything containing a path separator outright.
    2. resolve ``refs_dir / name`` and confirm its parent is still ``refs_dir`` — catches
       anything the cheap string check missed (e.g. a pre-existing symlink under refs_dir
       that points outside of it).
    """
    if not name or name in (".", "..") or "/" in name or "\\" in name:
        return _BAD_NAME_MSG
    target = refs_dir / name
    if target.resolve().parent != refs_dir.resolve():
        return _BAD_NAME_MSG
    return None


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


def list_(
    project: Annotated[
        Path, typer.Option("--project", help="Project root (default: cwd)")
    ] = Path("."),
    json_: JsonFlag = False,
) -> None:
    """List the project's cached references."""
    refs_dir = project / "references"
    index = _load_index(refs_dir / "index.json")  # missing refs dir/index -> [] (not an error)
    captures = [{**entry, "present": (refs_dir / entry["dir"]).is_dir()} for entry in index]

    data = {"refsDir": str(refs_dir), "captures": captures, "total": len(captures)}
    emit(
        ok_env(_COMMAND_LIST, data),
        json_mode=json_,
        text=_render_list_text(captures),
        exit_code=0,
    )


def rm(
    name: Annotated[
        str, typer.Argument(help="Capture dir name exactly as shown by `reference list`")
    ],
    project: Annotated[
        Path, typer.Option("--project", help="Project root (default: cwd)")
    ] = Path("."),
    json_: JsonFlag = False,
) -> None:
    """Remove one cached reference (its tiles dir and its index entry)."""
    refs_dir = project / "references"
    bad = _validate_rm_name(name, refs_dir)
    if bad is not None:
        emit(
            err_env(_COMMAND_RM, "BAD_ARG", bad),
            json_mode=json_,
            text=f"reference rm: {bad}\n",
            exit_code=1,
        )
        return

    # Both traversal checks passed — safe to touch the filesystem now.
    target = refs_dir / name
    dir_deleted = target.is_dir()
    if dir_deleted:
        shutil.rmtree(target)

    index_path = refs_dir / "index.json"
    index = _load_index(index_path)
    kept = [entry for entry in index if entry.get("dir") != name]
    index_updated = len(kept) != len(index)
    if index_updated:
        index_path.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + "\n")

    if not dir_deleted and not index_updated:
        msg = f"no reference named {name!r}"
        emit(
            err_env(_COMMAND_RM, "NOT_FOUND", msg),
            json_mode=json_,
            text=f"reference rm: {msg}\n",
            exit_code=1,
        )
        return

    data = {"removed": name, "dirDeleted": dir_deleted, "indexUpdated": index_updated}
    emit(
        ok_env(_COMMAND_RM, data),
        json_mode=json_,
        text=f"reference rm: removed {name}\n",
        exit_code=0,
    )


# Register on the sub-app (define-then-register mirrors cli.py). Each leaf carries JsonFlag so
# the tree-walk meta-test's "every leaf has --json (except ui)" invariant holds.
reference_app.command(name="add")(add)
reference_app.command(name="list")(list_)
reference_app.command(name="rm")(rm)
