"""``reference list`` / ``reference rm`` — pure filesystem+index operations (no pixelshot).

Neither leaf shells out to pixelshot or touches the network: ``list`` reports the cached
captures (with a live ``present`` bit in case the index has drifted from disk — e.g. a user
deleted a capture dir by hand), ``rm`` deletes one capture dir and its index entry.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Annotated, Any

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env

from .store import _load_index

_COMMAND_LIST = "reference list"
_COMMAND_RM = "reference rm"

_BAD_NAME_MSG = "name must not be empty, '.', '..', or contain a path separator"


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
