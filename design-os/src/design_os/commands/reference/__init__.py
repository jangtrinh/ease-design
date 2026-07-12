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

import typer

# Re-export everything the split-out modules define so any existing
# ``from design_os.commands.reference import <name>`` import site (or module-attribute access
# like ``reference.<name>``) keeps resolving exactly as it did when this was one flat module.
from .add import (
    CAPTURE_TIMEOUT,
    _COMMAND,
    _MISSING_MSG,
    _TILE_HEIGHT,
    _WORKERS,
    _build_captures,
    _count_tiles,
    _render_text,
    _run_pixelshot,
    _tile_dirs,
    add,
)
from .manage import (
    _BAD_NAME_MSG,
    _COMMAND_LIST,
    _COMMAND_RM,
    _render_list_text,
    _validate_rm_name,
    list_,
    rm,
)
from .store import _load_index

# Sub-Typer: an explicit callback keeps ``reference`` a GROUP so the lone ``add`` leaf can't
# be hoisted to ``design-os reference`` by Typer's single-command collapse (es-typer §2 ⚠).
reference_app = typer.Typer(name="reference", no_args_is_help=True)


@reference_app.callback()
def _reference_root() -> None:
    """Manage the project's reference cache (references/)."""
    # no-op collapse guard — see module docstring / es-typer §2.


# Register on the sub-app (define-then-register mirrors cli.py). Each leaf carries JsonFlag so
# the tree-walk meta-test's "every leaf has --json (except ui)" invariant holds.
reference_app.command(name="add")(add)
reference_app.command(name="list")(list_)
reference_app.command(name="rm")(rm)
