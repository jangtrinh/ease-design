"""design-os CLI — app assembly + the ``standalone_mode=False`` envelope/exit wrapper.

This wrapper is the heart of the contract (proposal.md §3/§5). Invoking the Typer app
with ``standalone_mode=False`` stops Click from printing-and-exiting on usage errors, so
they surface *here* where we translate them into the JSON envelope + exit contract shared
with the ``ui`` kernel.

Exit contract:  0 clean · 1 findings/tool-error · 2 usage-error.
"""

from __future__ import annotations

import json
import sys

import typer

from design_os import plugins
from design_os.commands import audit as audit_cmd
from design_os.commands import doctor as doctor_cmd
from design_os.commands import evolution as evolution_cmd
from design_os.commands import harvest as harvest_cmd
from design_os.commands import heartbeat as heartbeat_cmd
from design_os.commands import ui_passthrough
from design_os.commands import update as update_cmd
from design_os.commands import vr_matrix as vr_matrix_cmd
from design_os.commands.librarian import librarian_app
from design_os.commands.reference import reference_app
from design_os.envelope import err_env

# --- Exception imports -------------------------------------------------------
# PROBED (typer 0.26.8, 2026-07-12): typer vendored Click into ``typer._click`` — a
# standalone ``click`` module does NOT exist (its import fails). So ``typer._click.exceptions``
# is the one true path; the ``click.exceptions`` fallback below is defensive-only and would
# fire solely on a future typer that un-vendors Click. Class hierarchy (from the probe):
#   NoArgsIsHelpError ⊂ NoSuchOption/BadParameter ⊂ UsageError ⊂ ClickException ⊂ Exception
#   typer.Exit / typer.Abort are RuntimeError subclasses (not ClickException).
try:
    from typer._click.exceptions import (
        ClickException,
        NoArgsIsHelpError,
        UsageError,
    )
except ImportError:  # pragma: no cover - defensive; unreachable on pinned typer==0.26.8
    from click.exceptions import (  # type: ignore[no-redef]
        ClickException,
        NoArgsIsHelpError,
        UsageError,
    )


app = typer.Typer(
    name="design-os",
    pretty_exceptions_enable=False,
    rich_markup_mode=None,
    no_args_is_help=True,
    add_completion=True,
)


@app.callback()
def root() -> None:
    """design-os — the DESIGN-OS conductor over the deterministic `ui` kernel."""
    # no-op: keeps group semantics so a future 2nd/3rd command can't trigger the
    # single-command collapse footgun (es-typer §2 ⚠).


# Central registration keeps ``app`` in one module and avoids a commands→cli circular
# import (mirrors the doctor pattern). The ui passthrough needs Click context settings so
# raw args / unknown options reach ``ctx.args`` untouched.
app.command(name="audit")(audit_cmd.audit)
app.command(name="doctor")(doctor_cmd.doctor)
app.command(name="evolution")(evolution_cmd.evolution)
app.command(name="harvest")(harvest_cmd.harvest)
app.command(name="heartbeat")(heartbeat_cmd.heartbeat)
app.command(name="update")(update_cmd.update)
app.command(name="vr-matrix")(vr_matrix_cmd.vr_matrix)
app.command(
    name="ui",
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True},
)(ui_passthrough.ui_cmd)
# Sub-app: `reference` is a GROUP (its callback is the collapse guard), so `add` stays a
# nested leaf reachable as `design-os reference add`.
app.add_typer(reference_app, name="reference")
# Sub-app: `librarian` is a GROUP (its callback is the collapse guard), so `collect` stays a
# nested leaf reachable as `design-os librarian collect`. Studio-level deterministic hand (WS-D).
app.add_typer(librarian_app, name="librarian")
# Built-in diagnostic (NOT a third-party plugin): lists the discovered `design_os.plugins` and
# their mount status. It lives on the STATIC app — unlike the third-party plugins themselves,
# which mount only in main() — so it shows in --help and the tree-walk sees a normal --json leaf.
app.command(name="plugins")(plugins.plugins_command)


def run(argv: list[str]) -> int:
    """Invoke the app with ``standalone_mode=False`` and map results to the exit contract.

    Behavior is locked to PROBED typer 0.26.8 reality (see
    tests/test_wrapper_exit_contract.py):

    - normal command → app returns ``None`` (or an int, when a command raised ``typer.Exit``
      that Click converted to a return under ``standalone_mode=False``) → 0 / that int.
    - ``--help`` → Click prints help and returns 0 → we return 0.
    - no args (``no_args_is_help``) → RAISES ``NoArgsIsHelpError(exit_code=2)`` with the help
      text in ``str(e)`` and NOT auto-printed → we print the help and return 0 (contract:
      no-args ⇒ help, clean exit).
    - unknown option / unknown command → RAISES ``UsageError(exit_code=2)`` → JSON envelope
      (``--json``) on stdout or ``design-os: <msg>`` on stderr; exit 2.
    """
    try:
        result = app(args=argv, standalone_mode=False)
    except NoArgsIsHelpError as e:
        # Probe: no_args_is_help + standalone_mode=False raises (exit_code 2) instead of
        # printing; the help body lives in str(e). Contract wants no-args ⇒ help, exit 0.
        print(str(e))
        return 0
    except typer.Exit as e:
        # Defensive: under standalone_mode=False Click converts Exit → a return value (see
        # the ``else`` branch), so this rarely fires; kept to honor the documented contract.
        return e.exit_code or 0
    except UsageError as e:
        # NoSuchOption / BadParameter / "No such command" — all exit 2.
        if "--json" in argv:
            print(json.dumps(err_env("design-os", "USAGE", str(e)), ensure_ascii=False))
        else:
            print(f"design-os: {e}", file=sys.stderr)
        return 2
    except ClickException as e:
        # App-level Click failure (exit_code defaults to 1).
        if "--json" in argv:
            print(
                json.dumps(
                    err_env("design-os", "ERROR", e.format_message()), ensure_ascii=False
                )
            )
        else:
            print(f"design-os: {e.format_message()}", file=sys.stderr)
        return e.exit_code
    except typer.Abort:
        print("design-os: aborted", file=sys.stderr)
        return 130
    else:
        return result if isinstance(result, int) else 0


def main() -> None:
    """Console-script entry point (``[project.scripts] design-os``).

    Mounts third-party plugins onto the real ``app`` right before dispatch — NOT at module
    import time, so the static ``app`` that the tests and the ``--help`` golden pin stays
    plugin-free. A broken plugin degrades to a stderr warning and is skipped (see plugins.mount).
    """
    plugins.mount(app)
    sys.exit(run(sys.argv[1:]))
