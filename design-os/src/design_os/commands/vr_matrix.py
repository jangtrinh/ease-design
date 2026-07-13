"""``design-os vr-matrix [--project DIR] [--baselines DIR] [--accept] [--max-ratio F] [--json]``
— the per-component visual-regression matrix.

Composes three deterministic seams — it NEVER re-implements a check (contract §1):

  1. ``ui ds preview --split <tmp> --dir <project>`` renders one HTML page per component and an
     ``index.json`` manifest (the markup single-source-of-truth).
  2. the ``page-shot`` render hand screenshots every page to ``<tmp>/shots/<slug>.png``.
  3. either ``--accept`` (promote the shots into the baselines dir) or ``ui vr gate`` (diff the
     shots against the committed baselines, carrying the kernel's envelope VERBATIM).

Same-machine discipline (T5 lesson): baselines and gate renders MUST be produced on the SAME
machine / same fonts. Cross-machine antialiasing + hinting noise otherwise floods the diff and
turns every gate red. ``--max-ratio`` is the AA-tolerance escape hatch for the residual jitter.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Annotated, Any

import typer

from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.kernel import KernelNotFound, resolve_bin, resolve_ui, run_ui

_COMMAND = "vr-matrix"

# page-shot renders every component page in ONE process; generous so a full 27-page kit never
# clips. vr gate is a pure pixel diff over the same set — fast, but kept comfortably above spawn.
RENDER_TIMEOUT = 300.0
UI_TIMEOUT = 120.0

_KERNEL_MISSING_MSG = (
    "The `ui` kernel binary was not found. Install/link it "
    "(e.g. `npm link` in the ease-design repo) or set DESIGN_OS_UI_BIN to its path."
)
_HAND_MISSING_MSG = (
    "The `page-shot` render hand was not found. Build the a11y npm workspace "
    "(`npm run build --workspace=a11y`) and put its bin on PATH, or set "
    "DESIGN_OS_PAGE_SHOT_BIN to the built cli/page-shot.js."
)


def _env_message(env: dict[str, Any] | None) -> str | None:
    """Best-effort human message out of a kernel error envelope."""
    if isinstance(env, dict):
        error = env.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
    return None


def _read_index_pages(split_dir: Path) -> list[dict[str, Any]]:
    """Read ``<split_dir>/index.json`` → its ``pages`` list ([] on any malformed/absent file).

    The manifest is a raw file the kernel wrote (``{total, pages:[{name,status,file}]}``), NOT an
    envelope — so its ``pages`` key is read directly.
    """
    try:
        parsed: Any = json.loads((split_dir / "index.json").read_text())
    except (OSError, json.JSONDecodeError):
        return []
    pages = parsed.get("pages") if isinstance(parsed, dict) else None
    return [p for p in pages if isinstance(p, dict) and "file" in p] if isinstance(pages, list) else []


def _run_page_shot(hand: str, pages: list[Path], out_dir: Path) -> subprocess.CompletedProcess[str]:
    """Shell out to the ``page-shot`` hand for every page in ONE process → PNG per slug."""
    return subprocess.run(  # noqa: S603 - hand is a resolved path; pages are kernel-emitted
        [hand, *[str(p) for p in pages], "--out", str(out_dir), "--json"],
        capture_output=True,
        text=True,
        timeout=RENDER_TIMEOUT,
    )


def _accept(shots_dir: Path, baselines: Path) -> list[dict[str, Any]]:
    """Promote every rendered PNG into ``baselines`` (mkdir -p); one section per component."""
    baselines.mkdir(parents=True, exist_ok=True)
    sections: list[dict[str, Any]] = []
    for png in sorted(shots_dir.glob("*.png")):
        shutil.copyfile(png, baselines / png.name)
        sections.append({"name": png.stem, "action": "accepted", "file": png.name})
    return sections


def _regressions(env: dict[str, Any] | None) -> int:
    """Pull ``data.regressions`` out of the vr-gate envelope (0 when absent)."""
    if isinstance(env, dict) and isinstance(env.get("data"), dict):
        r = env["data"].get("regressions")
        if isinstance(r, int):
            return r
    return 0


def _render_accept_text(sections: list[dict[str, Any]], baselines: Path) -> str:
    lines = [f"accepted {s['file']}" for s in sections]
    lines.append(f"vr-matrix: {len(sections)} baseline(s) written → {baselines}")
    return "\n".join(lines) + "\n"


def _render_gate_text(exit_code: int, regressions: int, baselines: Path) -> str:
    verdict = "PASS" if exit_code == 0 else "FAIL"
    return f"vr-matrix: {verdict} — {regressions} regression(s) vs {baselines}\n"


def vr_matrix(
    project: Annotated[
        Path, typer.Option("--project", help="Project dir holding design/ (default: cwd)")
    ] = Path("."),
    baselines: Annotated[
        Path | None,
        typer.Option("--baselines", help="Baseline PNG dir (default: <project>/design/vr-baselines)"),
    ] = None,
    accept: Annotated[
        bool,
        typer.Option("--accept", help="Promote the current renders to baselines instead of gating"),
    ] = False,
    max_ratio: Annotated[
        float | None,
        typer.Option(
            "--max-ratio",
            help="Max changed-pixel ratio (0-1) that still passes — the AA-tolerance escape hatch "
            "for same-machine hinting jitter (default: 0, any real diff fails)",
        ),
    ] = None,
    json_: JsonFlag = False,
) -> None:
    """Render each component (page-shot) and gate it against a baseline (`ui vr gate`).

    Baselines and gate renders MUST be produced on the same machine/fonts (T5 lesson) — cross-
    machine antialiasing noise floods the diff. Record baselines with --accept, then gate.
    """
    if resolve_ui() is None:
        emit(
            err_env(_COMMAND, "KERNEL_NOT_FOUND", _KERNEL_MISSING_MSG),
            json_mode=json_,
            text=f"vr-matrix: {_KERNEL_MISSING_MSG}\n",
            exit_code=1,
        )
        return

    base_dir = baselines if baselines is not None else project / "design" / "vr-baselines"

    with tempfile.TemporaryDirectory(prefix="vr-matrix-") as tmp:
        tmp_path = Path(tmp)
        split_dir = tmp_path / "split"
        shots_dir = tmp_path / "shots"

        # 1. Render one HTML page per component + the index.json manifest.
        try:
            split = run_ui(
                ["ds", "preview", "--split", str(split_dir), "--dir", str(project), "--json"],
                timeout=UI_TIMEOUT,
            )
        except (KernelNotFound, subprocess.SubprocessError) as e:  # pragma: no cover - defensive
            emit(
                err_env(_COMMAND, "PREVIEW_FAILED", str(e)),
                json_mode=json_,
                text=f"vr-matrix: {e}\n",
                exit_code=1,
            )
            return
        if split.returncode != 0:
            msg = _env_message(split.envelope) or "`ui ds preview --split` failed"
            emit(
                err_env(_COMMAND, "PREVIEW_FAILED", msg),
                json_mode=json_,
                text=f"vr-matrix: {msg}\n",
                exit_code=1,
            )
            return

        pages_meta = _read_index_pages(split_dir)
        page_files = [split_dir / p["file"] for p in pages_meta]

        # 2. Resolve the render hand (absent → HAND_NOT_FOUND, per the spec order: after split).
        hand = resolve_bin("page-shot", "DESIGN_OS_PAGE_SHOT_BIN")
        if hand is None:
            emit(
                err_env(_COMMAND, "HAND_NOT_FOUND", _HAND_MISSING_MSG),
                json_mode=json_,
                text=f"vr-matrix: {_HAND_MISSING_MSG}\n",
                exit_code=1,
            )
            return

        # 3. Render every page to a PNG per slug (a --bare DS has 0 pages → nothing to render).
        if page_files:
            proc = _run_page_shot(hand, page_files, shots_dir)
            if proc.returncode != 0:
                msg = _env_message(_safe_json(proc.stdout)) or (
                    proc.stderr.strip() or "`page-shot` failed to render the component pages"
                )
                emit(
                    err_env(_COMMAND, "RENDER_FAILED", msg),
                    json_mode=json_,
                    text=f"vr-matrix: {msg}\n",
                    exit_code=1,
                )
                return
        else:
            shots_dir.mkdir(parents=True, exist_ok=True)

        # 4a. Accept: promote the fresh shots into the baselines dir.
        if accept:
            sections = _accept(shots_dir, base_dir)
            data = {
                "project": str(project),
                "baselines": str(base_dir),
                "mode": "accept",
                "sections": sections,
                "summary": {"components": len(pages_meta), "accepted": len(sections)},
            }
            emit(
                ok_env(_COMMAND, data),
                json_mode=json_,
                text=_render_accept_text(sections, base_dir),
                exit_code=0,
            )
            return

        # 4b. Gate: the baselines dir must exist (record it with --accept first).
        if not base_dir.exists():
            msg = (
                f"no baseline directory at '{base_dir}'. "
                "Record baselines first with `design-os vr-matrix --accept`."
            )
            emit(
                err_env(_COMMAND, "NO_BASELINE", msg),
                json_mode=json_,
                text=f"vr-matrix: {msg}\n",
                exit_code=1,
            )
            return

        # One gate over the whole set; the kernel diffs by filename and gates the exit.
        gate_args = ["vr", "gate", str(base_dir), str(shots_dir)]
        if max_ratio is not None:
            gate_args += ["--max-ratio", str(max_ratio)]
        gate = run_ui([*gate_args, "--json"], timeout=UI_TIMEOUT)
        section = {"tool": "vr gate", "exitCode": gate.returncode, "envelope": gate.envelope}
        regressions = _regressions(gate.envelope)
        data = {
            "project": str(project),
            "baselines": str(base_dir),
            "mode": "gate",
            "sections": [section],  # the vr envelope, carried VERBATIM
            "summary": {"components": len(pages_meta), "regressions": regressions},
        }
        emit(
            ok_env(_COMMAND, data),
            json_mode=json_,
            text=_render_gate_text(gate.returncode, regressions, base_dir),
            exit_code=gate.returncode,
        )


def _safe_json(text: str) -> dict[str, Any] | None:
    """Parse ``text`` as a JSON object, or ``None`` (page-shot may print a non-envelope error)."""
    try:
        parsed: Any = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
