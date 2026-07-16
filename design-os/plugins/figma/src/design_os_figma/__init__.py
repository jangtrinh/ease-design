"""design-os-figma — the first REAL ``design_os.plugins`` entry-point plugin.

Proves the umbrella's plugin chain end-to-end against a genuinely installed distribution:
``design-os`` (and its ``plugins`` diagnostic) discover this package via
``importlib.metadata.entry_points(group="design_os.plugins")`` and ``add_typer`` it onto the
live app in ``cli.main()``.

It wraps the ``figma-agent`` Node hand (the Figma broker + plugin bridge). Every ``figma-agent``
command prints EXACTLY one JSON object to stdout and exits 0, or prints ``{"error":{code,
message}}`` and exits 1. This plugin resolves the bin, runs it, and re-emits the hand's JSON
result VERBATIM inside the design-os envelope — it never reimplements or reinterprets the hand
(contract §1). Envelope/JsonFlag/resolve_bin are imported FROM the ``design_os`` package, which
is exactly why this distribution depends on ``design-os``.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Annotated, Any, NoReturn

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import KernelNotFound, resolve_bin, run_ui

_BIN_NAME = "figma-agent"
_BIN_ENV = "DESIGN_OS_FIGMA_AGENT_BIN"

_HINT = f"npm run build --workspace=figma-agent then npm link, or set {_BIN_ENV}"

# The hand-off to the deterministic kernel after a scan lands (spec §scan). Literal placeholders
# `<out>`/`<slug>` — it is a copy-me template, not an interpolated path.
_NEXT_HINT = "ui ingest-figma-ds <out> --name <slug>"

# figma-agent `scan-design-system` on a large file is slow (memory F3); `status` is a quick ping.
_STATUS_TIMEOUT = 30.0
_SCAN_TIMEOUT = 240.0
# `audit-ds` also walks EVERY page's instances for the usage tally — the heaviest read, so the
# most generous budget of the three.
_AUDIT_TIMEOUT = 300.0

# no_args_is_help so `design-os figma` prints help instead of erroring (humane UX, es-typer §2).
app = typer.Typer(name="figma", no_args_is_help=True)


@app.callback()
def _root() -> None:
    """figma — drive the Figma broker/plugin via the `figma-agent` hand. (network: talks to Figma)"""
    # no-op collapse guard (es-typer §2 ⚠): keeps `figma` a GROUP so `status`/`scan` keep their
    # names even while there are only two leaves.


def _fail(command: str, code: str, message: str, json_: bool) -> NoReturn:
    """Emit an error envelope (JSON or one human line) and exit 1 — every failure path routes here."""
    emit(err_env(command, code, message), json_mode=json_, text=f"{command}: {message}\n", exit_code=1)
    raise typer.Exit(1)  # unreachable (emit already raised) — makes this provably NoReturn


def _hand_error(result: dict[str, Any]) -> tuple[str, str]:
    """Extract ``(code, message)`` from a figma-agent failure payload, with safe fallbacks."""
    err = result.get("error")
    if isinstance(err, dict):
        return (
            str(err.get("code") or "HAND_ERROR"),
            str(err.get("message") or "figma-agent reported an error"),
        )
    return "HAND_ERROR", "figma-agent reported an error"


def _call_hand(
    command: str, argv: list[str], timeout: float, json_: bool
) -> tuple[str, dict[str, Any]]:
    """Resolve + run ``figma-agent <argv>``; return ``(bin, parsed_result)`` on the hand's exit 0.

    The single shell-out seam shared by both commands. Every failure emits the matching error
    envelope and exits 1 (via :func:`_fail`), so a normal return always carries one JSON object
    the caller can re-emit VERBATIM:

    - bin unresolvable            → ``HAND_NOT_FOUND`` (+ install/link hint)
    - hand exceeded its timeout   → ``HAND_TIMEOUT``
    - stdout not one JSON object  → ``BAD_HAND_OUTPUT``
    - hand exit != 0              → the hand's own ``error.code`` (or ``HAND_ERROR``)
    """
    bin_ = resolve_bin(_BIN_NAME, _BIN_ENV)
    if bin_ is None:
        _fail(command, "HAND_NOT_FOUND", _HINT, json_)
    try:
        proc = subprocess.run(  # noqa: S603 - bin_ is a resolved path; argv is fixed by us
            [bin_, *argv], capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        _fail(command, "HAND_TIMEOUT", f"figma-agent exceeded {timeout:.0f}s", json_)
    try:
        parsed: Any = json.loads(proc.stdout)
    except json.JSONDecodeError:
        parsed = None
    if not isinstance(parsed, dict):
        _fail(command, "BAD_HAND_OUTPUT", "figma-agent did not print a single JSON object", json_)
    if proc.returncode != 0:
        code, message = _hand_error(parsed)
        _fail(command, code, message, json_)
    return bin_, parsed


def _status_text(result: dict[str, Any]) -> str:
    broker = result.get("broker", "?")

    # Multi-file hand (P4): `plugins` is a per-file list; `activePlugin` names the file commands
    # currently route to (most-recently-active, or the FIGMA_AGENT_FILE-matched one). Render one
    # line per open file, marking the active target.
    plugins = result.get("plugins")
    if isinstance(plugins, list) and plugins:
        active = result.get("activePlugin")
        noun = "file" if len(plugins) == 1 else "files"
        lines = [f"figma status: broker={broker} ({len(plugins)} {noun} connected)"]
        for p in plugins:
            name = p.get("fileName") or "(unnamed)" if isinstance(p, dict) else "(unnamed)"
            page = p.get("page") if isinstance(p, dict) else None
            page_txt = f" · page {page}" if page else ""
            mark = "  ← active" if name == active else ""
            lines.append(f"  - {name}{page_txt}{mark}")
        if active is None:
            lines.append(
                "hint: a file is open but none is the active target (FIGMA_AGENT_FILE matched nothing?) — "
                "commands will wait or fail until a matching file is active.\n"
            )
        return "\n".join(lines) + ("" if active is None else "\n")

    # Legacy single-plugin shape: `plugin` is an object ({connected, state, …}); a stub/older hand
    # may send a string. When it isn't connected, point the user at the P2 panel — the CLI can only
    # drive the file while that panel is open (its own onboarding says the same).
    plugin = result.get("plugin", "?")
    connected = plugin.get("connected") is True if isinstance(plugin, dict) else plugin == "connected"
    line = f"figma status: broker={broker} plugin={plugin}\n"
    if not connected:
        line += (
            "hint: no plugin connected — open the Ease Design Figma Agent panel in Figma Desktop "
            "(Plugins → Development) and keep it open.\n"
        )
    return line


def _scan_text(out: Path) -> str:
    return f"figma scan: wrote {out}\nnext: {_NEXT_HINT}\n"


def _audit_text(result: dict[str, Any]) -> str:
    """One header line + a one-line-per-key summary table. Renders BOTH hand shapes: the full
    report ({file, summary, components, …}) and the compact --out shape ({path, file, summary}).

    We never parse ``components[]`` here — that is the JSON consumer's job; text mode stays a
    scannable overview (fileName, page count, and the per-detector tallies).
    """
    file = result.get("file") if isinstance(result.get("file"), dict) else {}
    file_name = file.get("fileName", "?")
    pages = file.get("pages")
    page_count = len(pages) if isinstance(pages, list) else 0
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    total = summary.get("total", "?")

    lines = [f"figma audit: {file_name} — {total} components, {page_count} pages"]
    for key, value in summary.items():
        lines.append(f"  {key}: {value}")
    path = result.get("path")
    if path:
        lines.append(f"wrote {path}")
    return "\n".join(lines) + "\n"


@app.command(name="status")
def status(json_: JsonFlag = False) -> None:
    """Report the figma-agent broker + plugin status. (network: pings the Figma broker)"""
    bin_, result = _call_hand("figma status", ["status"], _STATUS_TIMEOUT, json_)
    emit(
        ok_env("figma status", {"agent": bin_, "result": result}),
        json_mode=json_,
        text=_status_text(result),
        exit_code=0,
    )


@app.command(name="scan")
def scan(
    out: Annotated[
        Path, typer.Option("--out", help="Write the scanned design-system JSON to this path")
    ] = Path("ds.json"),
    json_: JsonFlag = False,
) -> None:
    """Scan the open Figma file's design system to a JSON file. (network: reads the Figma document)"""
    _, result = _call_hand(
        "figma scan", ["scan-design-system", "--out", str(out)], _SCAN_TIMEOUT, json_
    )
    data = {"out": str(out), "result": result, "next": _NEXT_HINT}
    emit(ok_env("figma scan", data), json_mode=json_, text=_scan_text(out), exit_code=0)


def _reconcile_text(data: dict[str, Any]) -> str:
    """One-line summary of the kernel's reconcile envelope (dry-run preview or applied)."""
    delta = data.get("delta") if isinstance(data.get("delta"), dict) else {}
    added = len(delta.get("added", [])) if isinstance(delta.get("added"), list) else 0
    updated = len(delta.get("updated", [])) if isinstance(delta.get("updated"), list) else 0
    deprecated = len(delta.get("deprecated", [])) if isinstance(delta.get("deprecated"), list) else 0
    mode = "applied" if data.get("applied") else "dry-run"
    frm = data.get("cursor_from", "?")
    to = data.get("cursor_to", "?")
    return (
        f"figma reconcile ({mode}) — cursor {frm}..{to}\n"
        f"  {added} added · {updated} updated · {deprecated} deprecated\n"
    )


@app.command(name="reconcile")
def reconcile(
    apply: Annotated[
        bool, typer.Option("--apply", help="Commit the delta into the registry (default: dry-run preview)")
    ] = False,
    since: Annotated[
        int | None, typer.Option("--since", help="Line-count cursor to start from")
    ] = None,
    dir_: Annotated[
        Path | None, typer.Option("--dir", help="Project directory holding design/")
    ] = None,
    json_: JsonFlag = False,
) -> None:
    """Reconcile the Figma change-log into the component registry. (deterministic `ui` kernel; no network)

    The ONE deterministic-kernel member of the `figma` group: it shells to `ui figma reconcile`
    (contract §1 — never reimplemented), NOT the figma-agent hand. Undo = replay to a prior cursor.
    """
    args = ["figma", "reconcile", "--apply" if apply else "--dry-run"]
    if since is not None:
        args += ["--since", str(since)]
    if dir_ is not None:
        args += ["--dir", str(dir_)]
    try:
        result = run_ui([*args, "--json"])
    except KernelNotFound as exc:
        _fail("figma reconcile", "KERNEL_NOT_FOUND", str(exc), json_)
    env = result.envelope
    if env is None:
        _fail("figma reconcile", "BAD_KERNEL_OUTPUT", "ui did not print a JSON envelope", json_)
    if not env.get("ok", False):
        error = env.get("error") if isinstance(env.get("error"), dict) else {}
        _fail(
            "figma reconcile",
            str(error.get("code") or "RECONCILE_FAILED"),
            str(error.get("message") or "reconcile failed"),
            json_,
        )
    data = env.get("data") if isinstance(env.get("data"), dict) else {}
    emit(
        ok_env("figma reconcile", {"result": data}),
        json_mode=json_,
        text=_reconcile_text(data),
        exit_code=0,
    )


@app.command(name="audit")
def audit(
    out: Annotated[
        Path | None, typer.Option("--out", help="Write the audit report JSON to this path")
    ] = None,
    json_: JsonFlag = False,
) -> None:
    """Audit the open Figma file's component library for DS-hygiene problems. (network: reads the Figma document)"""
    # Forward --out only when given; the hand omits it → returns the full report on stdout.
    argv = ["audit-ds", *(["--out", str(out)] if out else [])]
    bin_, result = _call_hand("figma audit", argv, _AUDIT_TIMEOUT, json_)
    # Contract §1: re-emit the hand's JSON result VERBATIM — never reinterpret it.
    emit(
        ok_env("figma audit", {"agent": bin_, "result": result}),
        json_mode=json_,
        text=_audit_text(result),
        exit_code=0,
    )
