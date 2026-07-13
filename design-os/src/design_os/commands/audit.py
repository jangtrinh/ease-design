"""``design-os audit <target> [--json] [--dir <project>]`` — compose the `ui` linter chain.

T1 / dogfood round 2 (proposal.md §Phasing). ``audit`` resolves ``target`` to a set of HTML
files, runs the four per-file ``ui`` linters over each, adds an optional tier-2 rendered
``axe`` section per file when the ``a11y-audit`` hand is present, adds the DS + flow checks
when a project design surface is present, and MERGES every kernel envelope into one report.

Contract §1 (proposal.md): audit NEVER reimplements a check — each section carries the
kernel's own envelope VERBATIM; audit only shells out and tallies. The exit code trusts the
kernel's gating: 1 iff any section's exit code is non-zero, else 0 (envelope ``ok`` stays
True — the command RAN; ``ok:false`` is reserved for audit itself failing).
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Annotated, Any

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import KernelNotFound, resolve_bin, resolve_ui, run_ui

_COMMAND = "audit"

# Per-file linter chain (the T0–T6 checks that take a single ``<file.html>``). Order is fixed
# so the emitted section list is deterministic.
PER_FILE_LINTERS = ["validate-layout", "taste-lint", "a11y-lint", "content-lint"]

# Directory segments never worth linting — dependency trees, VCS, build output. Compared
# segment-wise in Python (see ``_html_files``); never spelled into a shell command.
_EXCLUDED_SEGMENTS = {"node_modules", ".git", "dist", "build", ".next", "out"}

# Per-tool shell-out budget (seconds). Module-level so a test can monkeypatch it down to
# force the timeout path.
AUDIT_TIMEOUT = 60.0

_KERNEL_MISSING_MSG = (
    "The `ui` kernel binary was not found. Install/link it "
    "(e.g. `npm link` in the ease-design repo) or set DESIGN_OS_UI_BIN to its path."
)


def _display(path: Path) -> str:
    """Best-effort path relative to CWD for section/human display; absolute on failure."""
    try:
        return os.path.relpath(path, Path.cwd())
    except ValueError:  # pragma: no cover - only on Windows cross-drive paths
        return str(path)


def _html_files(target: Path) -> list[Path]:
    """Resolve ``target`` to the HTML files to lint.

    A file target is linted as-is; a directory is ``rglob``'d for ``*.html`` with any path
    under an excluded segment (node_modules, build output, VCS) dropped. Sorted for a stable,
    deterministic section order.
    """
    if target.is_file():
        return [target]
    files = [f for f in target.rglob("*.html") if _EXCLUDED_SEGMENTS.isdisjoint(f.parts)]
    return sorted(files)


def _section(tool: str, target_display: str, args: list[str]) -> dict[str, Any]:
    """Shell out ``ui <args> --json`` and wrap the result as one audit section.

    A timeout degrades to a synthetic ``TIMEOUT`` error envelope with ``exitCode -1`` so the
    audit keeps going. ``KernelNotFound`` is deliberately NOT caught here — it aborts the whole
    command (see :func:`audit`).
    """
    try:
        result = run_ui([*args, "--json"], timeout=AUDIT_TIMEOUT)
    except subprocess.TimeoutExpired:
        return {
            "tool": tool,
            "target": target_display,
            "exitCode": -1,
            "envelope": err_env(tool, "TIMEOUT", f"`ui {tool}` exceeded {AUDIT_TIMEOUT}s"),
        }
    return {
        "tool": tool,
        "target": target_display,
        "exitCode": result.returncode,
        "envelope": result.envelope,
    }


def _axe_section(axe_bin: str, path: Path, target_display: str) -> dict[str, Any]:
    """Shell out to the ``a11y-audit`` hand for one file; wrap its VERBATIM envelope as a section.

    Same degrade contract as :func:`_section`: a timeout becomes a synthetic ``TIMEOUT`` error
    envelope with ``exitCode -1`` so the audit keeps going. The hand's envelope is carried
    verbatim (contract §1) — audit only shells out and tallies, never re-normalises. The binary
    is a DIFFERENT hand than ``ui`` (rendered tier, needs a browser), so it is shelled directly
    rather than through :func:`run_ui`.
    """
    try:
        proc = subprocess.run(  # noqa: S603 - axe_bin is a resolved path; path is caller-controlled
            [axe_bin, str(path), "--json"],
            capture_output=True,
            text=True,
            timeout=AUDIT_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return {
            "tool": "axe",
            "target": target_display,
            "exitCode": -1,
            "envelope": err_env("axe", "TIMEOUT", f"`a11y-audit` exceeded {AUDIT_TIMEOUT}s"),
        }
    try:
        parsed: Any = json.loads(proc.stdout)
    except json.JSONDecodeError:
        parsed = None
    envelope = parsed if isinstance(parsed, dict) else None
    return {"tool": "axe", "target": target_display, "exitCode": proc.returncode, "envelope": envelope}


def _count(envelope: dict[str, Any] | None) -> tuple[int, int]:
    """Return ``(errors, warnings)`` for one kernel envelope.

    Prefer the kernel's own ``errorCount``/``warningCount`` (present on every per-file linter;
    taste-lint omits ``warningCount`` → treated as 0 via ``.get``). Fall back to counting
    ``findings`` by ``severity`` when neither count key is present (keeps working if a future
    check emits only findings). A failure/absent envelope contributes nothing.
    """
    if not isinstance(envelope, dict) or envelope.get("ok") is not True:
        return (0, 0)
    data = envelope.get("data")
    if not isinstance(data, dict):
        return (0, 0)
    if "errorCount" in data or "warningCount" in data:
        return (int(data.get("errorCount", 0)), int(data.get("warningCount", 0)))
    findings = data.get("findings")
    if isinstance(findings, list):
        errors = sum(1 for f in findings if isinstance(f, dict) and f.get("severity") == "error")
        return (errors, len(findings) - errors)
    # ds a11y shape (dogfood L6): {pairs, failures, unresolved} — no count keys, no findings.
    # Each contrast failure is an error (it is what gates the kernel's exit); `unresolved`
    # is a couldn't-check report, not a violation → count nothing for it.
    failures = data.get("failures")
    if isinstance(failures, list):
        return (len(failures), 0)
    # axe shape (a11y-audit): {pages:[{violationCount, ...}], totals} — no count keys, no
    # findings. Each violation is an error (it is what gates the hand's exit); `incompleteCount`
    # is axe's couldn't-decide bucket, not a violation → count nothing for it (mirrors L6).
    pages = data.get("pages")
    if isinstance(pages, list):
        return (sum(int(p.get("violationCount", 0)) for p in pages if isinstance(p, dict)), 0)
    return (0, 0)


def _ds_dir(target: Path, dir_: Path | None) -> Path | None:
    """The project dir for DS/flow checks: ``--dir`` wins, else ``target`` when it's a dir."""
    if dir_ is not None:
        return dir_
    return target if target.is_dir() else None


def _ds_and_flow_sections(dsdir: Path) -> list[dict[str, Any]]:
    """DS specimen/a11y + flow-lint sections for a project dir, each gated on its artifact."""
    sections: list[dict[str, Any]] = []
    disp = _display(dsdir)
    if (dsdir / "design" / "component-registry.json").exists():
        sections.append(_section("ds specimen", disp, ["ds", "specimen", "--dir", str(dsdir)]))
    if (dsdir / "design" / "ds.manifest.json").exists():
        sections.append(_section("ds a11y", disp, ["ds", "a11y", "--dir", str(dsdir)]))
    flow = dsdir / "flow.json"
    if not flow.exists():
        flow = dsdir / "design" / "flow.json"
    if flow.exists():
        sections.append(_section("flow lint", _display(flow), ["flow", "lint", str(flow)]))
    return sections


def _summarize(sections: list[dict[str, Any]]) -> dict[str, int]:
    errors = warnings = failed = 0
    for s in sections:
        e, w = _count(s["envelope"])
        errors += e
        warnings += w
        env = s["envelope"]
        if s["exitCode"] < 0 or (isinstance(env, dict) and env.get("ok") is False):
            failed += 1
    return {"toolsRun": len(sections), "toolsFailed": failed, "errors": errors, "warnings": warnings}


def _build_audit(target: Path, dir_: Path | None) -> tuple[list[dict[str, Any]], dict[str, int], int, int]:
    """Run every applicable ``ui`` check over ``target``; return sections + summary + exit + count.

    Raises :class:`KernelNotFound` (caught by :func:`audit`) when the kernel is unresolvable —
    checked once up front so an empty target still aborts cleanly instead of a silent exit 0.
    """
    if resolve_ui() is None:
        raise KernelNotFound(_KERNEL_MISSING_MSG)
    files = _html_files(target)
    # Tier-2 rendered a11y hand (axe-core over a browser) — OPTIONAL. Resolved once; when absent
    # no `axe` section is emitted at all (silent degrade), leaving the existing report untouched.
    axe_bin = resolve_bin("a11y-audit", "DESIGN_OS_A11Y_AUDIT_BIN")
    sections: list[dict[str, Any]] = []
    for f in files:
        disp = _display(f)
        for tool in PER_FILE_LINTERS:
            sections.append(_section(tool, disp, [tool, str(f)]))
        if axe_bin is not None:
            sections.append(_axe_section(axe_bin, f, disp))
    dsdir = _ds_dir(target, dir_)
    if dsdir is not None:
        sections.extend(_ds_and_flow_sections(dsdir))
    summary = _summarize(sections)
    exit_code = 1 if any(s["exitCode"] != 0 for s in sections) else 0
    return sections, summary, exit_code, len(files)


def _render_text(sections: list[dict[str, Any]], summary: dict[str, int]) -> str:
    lines: list[str] = []
    for s in sections:
        errors, warnings = _count(s["envelope"])
        lines.append(f"[{s['tool']}] {s['target']} — {errors} error(s), {warnings} warning(s)")
    lines.append(
        f"audit: {summary['toolsRun']} tool-runs, {summary['errors']} errors, "
        f"{summary['warnings']} warnings"
    )
    return "\n".join(lines) + "\n"


def audit(
    target: Annotated[Path, typer.Argument(help="HTML file or project directory to audit")],
    json_: JsonFlag = False,
    dir_: Annotated[
        Path | None,
        typer.Option("--dir", help="Project dir for DS/flow checks (default: target if a dir)"),
    ] = None,
) -> None:
    """Audit HTML file(s) or a project dir through the deterministic `ui` linter chain."""
    if not target.exists():
        msg = f"no such file or directory: '{target}'"
        emit(err_env(_COMMAND, "TARGET_NOT_FOUND", msg), json_mode=json_, text=f"audit: {msg}\n", exit_code=1)
        return
    try:
        sections, summary, exit_code, n_files = _build_audit(target, dir_)
    except KernelNotFound as e:
        emit(err_env(_COMMAND, "KERNEL_NOT_FOUND", str(e)), json_mode=json_, text=f"audit: {e}\n", exit_code=1)
        return
    data = {"target": str(target), "files": n_files, "sections": sections, "summary": summary}
    emit(ok_env(_COMMAND, data), json_mode=json_, text=_render_text(sections, summary), exit_code=exit_code)
