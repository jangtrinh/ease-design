"""``design-os librarian`` — the studio librarian's deterministic hand (WS-D, spec 002).

A GROUP (explicit callback = the single-command collapse guard, es-typer §2 ⚠) so the lone
``collect`` leaf stays reachable as ``design-os librarian collect`` and can't be hoisted to
``design-os librarian``. Only the deterministic ``collect`` lives here — assess/draft/judge are
the host-CLI procedure ``knowledge/librarian-loop.md``, and merge is the human gate.
"""

from __future__ import annotations

import typer

from .collect import collect

librarian_app = typer.Typer(name="librarian", no_args_is_help=True)


@librarian_app.callback()
def _librarian_root() -> None:
    """The studio librarian's deterministic hand — collect gaps for the graduation loop."""
    # no-op collapse guard — see module docstring / es-typer §2.


librarian_app.command(name="collect")(collect)
