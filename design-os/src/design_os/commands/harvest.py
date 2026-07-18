"""``design-os harvest [--dir] [--glob]... [--force] [--dry-run] [--emit-packet] [--json]``
— the host-model-driven fuel line (spec 006 P4). Reads end-of-phase reports, sends them to
a FRESH host-model process via `DESIGN_OS_MODEL_CMD`, runs the deterministic anti-
hallucination gate (harvest_core.gate), and records survivors through `ui memory record`.
Never touches `knowledge/` — only `gap`/`insight` events, which the unchanged librarian
veto-chain graduates. No model configured, a model process error, OR a model output that
fails to parse as the candidate envelope all degrade to `skipped`, exit 0 — the heartbeat
never breaks on a bad model turn.

Every recorded `insight`/`gap` event carries a content-addressed `harvestKey` (see
`harvest_core.candidate_key`); before recording, the ledger is checked for that key so a
retry after a partial write (Decision 4: cursor never advances on a mid-batch failure)
does not re-append the same candidate and manufacture a fake recurrence signal.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

import typer

from design_os import harvest_core
from design_os.envelope import JsonFlag, emit, err_env, ok_env
from design_os.harvest_model import ModelUnavailable, extract, resolve_model_cmd
from design_os.kernel import KernelNotFound, run_ui

_COMMAND = "harvest"
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "harvest-extract-v1.md"
_INBOX_REL = Path("design") / "harvest-inbox"


class _RecordError(Exception):
    """A `ui memory record` call the kernel rejected or that returned no envelope."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _write_inbox(project_dir: Path, packet: str, reports: list[harvest_core.Report]) -> Path:
    inbox = project_dir / _INBOX_REL
    inbox.mkdir(parents=True, exist_ok=True)
    slug = "-".join(r.rel.replace("/", "-").removesuffix(".md") for r in reports)[:80] or "packet"
    stamp = _now_iso().replace(":", "").replace("-", "")
    path = inbox / f"{stamp}-{slug}.md"
    path.write_text(packet, encoding="utf-8")
    return path


def _run_record(
    dir_: Path, event_type: str, data: dict[str, Any], *, refs: list[str] | None = None
) -> str:
    args = [
        "memory", "record", event_type, "--dir", str(dir_), "--actor", "design-os harvest",
        "--data", json.dumps(data, ensure_ascii=False), "--json",
    ]
    if refs:
        args += ["--refs", ",".join(refs)]
    result = run_ui(args)  # raises KernelNotFound when `ui` is unresolvable
    if result.envelope is None or not result.envelope.get("ok"):
        msg = (
            (result.envelope or {}).get("error", {}).get("message")
            if result.envelope else result.stderr.strip()
        )
        raise _RecordError(f"failed to record {event_type} for {data.get('source', data.get('text'))!r}: {msg}")
    return str(result.envelope["data"]["id"])


def _skip(dir_: Path, json_: bool, *, reason: str, deferred: list[harvest_core.Report],
          reports_read: int = 0, packet: Path | None = None, detail: str | None = None) -> None:
    data: dict[str, Any] = {
        "project": str(dir_), "reports_read": reports_read, "deferred": [r.rel for r in deferred],
        "candidates": 0, "recorded": {}, "dropped": {}, "events": [],
        "promptVersion": harvest_core.PROMPT_VERSION, "status": "skipped", "skipReason": reason,
    }
    if packet is not None:
        data["packet"] = str(packet)
    if detail is not None:
        data["detail"] = detail
    text = f"harvest: skipped ({reason})" + (f" — {detail}" if detail else "") + "\n"
    emit(ok_env(_COMMAND, data), json_mode=json_, text=text, exit_code=0)


def harvest(
    dir_: Annotated[Path, typer.Option("--dir", help="Project dir holding design/ (default: cwd)")] = Path("."),
    glob: Annotated[Optional[list[str]], typer.Option("--glob", help="Report glob, repeatable (default: plans/**/reports/*.md)")] = None,
    force: Annotated[bool, typer.Option("--force", help="Re-harvest reports the cursor already covered")] = False,
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Extract + gate, record nothing, leave the cursor")] = False,
    emit_packet: Annotated[bool, typer.Option("--emit-packet", help="Write the packet to design/harvest-inbox/ and stop — no model call")] = False,
    json_: JsonFlag = False,
) -> None:
    """Extract structured insight/gap candidates from end-of-phase reports via a fresh host-
    model process, gate them deterministically, and record survivors through the kernel."""
    design_dir = dir_ / "design"
    if not design_dir.is_dir():
        msg = f"no 'design/' directory under '{dir_}'"
        emit(err_env(_COMMAND, "NO_PROJECT", msg), json_mode=json_, text=f"harvest: {msg}\n", exit_code=1)
        return

    reports = harvest_core.discover_reports(dir_, glob or list(harvest_core.DEFAULT_GLOBS))
    state = harvest_core.load_state(dir_)
    to_harvest, deferred = harvest_core.pending(reports, state, force=force)
    if not to_harvest:
        _skip(dir_, json_, reason="no-new-reports", deferred=deferred)
        return

    packet = harvest_core.build_packet(_PROMPT_PATH.read_text(encoding="utf-8"), to_harvest)

    if emit_packet:
        path = _write_inbox(dir_, packet, to_harvest)
        _skip(dir_, json_, reason="emit-packet", deferred=deferred, reports_read=len(to_harvest), packet=path)
        return

    cmd = resolve_model_cmd(dir_)
    if cmd is None:
        path = _write_inbox(dir_, packet, to_harvest)
        _skip(dir_, json_, reason="no-model-adapter", deferred=deferred, reports_read=len(to_harvest), packet=path)
        return

    try:
        raw = extract(packet, cmd=cmd)
    except ModelUnavailable as e:
        path = _write_inbox(dir_, packet, to_harvest)
        _skip(dir_, json_, reason="model-error", deferred=deferred, reports_read=len(to_harvest), packet=path, detail=str(e))
        return

    try:
        candidates = harvest_core.parse_candidates(raw)
    except harvest_core.HarvestError as e:
        # A non-JSON / malformed model turn is a bad TURN, not a bad RUN — degrade like
        # ModelUnavailable (skipped, packet saved, cursor untouched, exit 0) rather than
        # breaking the heartbeat with exit 1.
        path = _write_inbox(dir_, packet, to_harvest)
        _skip(dir_, json_, reason="bad-candidates", deferred=deferred, reports_read=len(to_harvest), packet=path, detail=str(e))
        return

    survivors, dropped = harvest_core.gate(candidates, to_harvest)

    if dry_run:
        data = {
            "project": str(dir_), "reports_read": len(to_harvest), "deferred": [r.rel for r in deferred],
            "candidates": len(survivors), "recorded": {}, "dropped": dropped, "events": [],
            "promptVersion": harvest_core.PROMPT_VERSION, "status": "ok",
        }
        text = f"harvest --dry-run: {len(survivors)} candidate(s) survive, dropped {dropped}\n"
        emit(ok_env(_COMMAND, data), json_mode=json_, text=text, exit_code=0)
        return

    by_source: dict[str, list[harvest_core.Candidate]] = {}
    for c in survivors:
        by_source.setdefault(c.source, []).append(c)

    # Read once: within this run, a key only recurs if the SAME (kind, text, source)
    # was already appended by an earlier — partial — attempt at this same batch.
    already_recorded = harvest_core.ledger_candidate_keys(dir_)

    event_ids: list[str] = []
    recorded = {"insight": 0, "gap": 0}
    for report in to_harvest:
        report_cands = by_source.get(report.rel, [])
        try:
            hid = _run_record(dir_, "harvested", {
                "source": report.rel, "what": f"{len(report_cands)} candidates",
                "promptVersion": harvest_core.PROMPT_VERSION, "sha256": report.sha256,
            })
            event_ids.append(hid)
            for c in report_cands:
                key = harvest_core.candidate_key(c.kind, c.text, c.source)
                if key in already_recorded:
                    continue  # a prior partial write already recorded this exact candidate
                payload: dict[str, Any] = {"text": c.text, "evidence": c.evidence, "harvestKey": key}
                if c.kind == "gap":
                    payload["target"] = c.target
                    payload["kind"] = c.gap_kind
                eid = _run_record(dir_, c.kind, payload, refs=[hid])
                event_ids.append(eid)
                recorded[c.kind] += 1
                already_recorded.add(key)
        except KernelNotFound as e:
            emit(err_env(_COMMAND, "KERNEL_MISSING", str(e)), json_mode=json_, text=f"harvest: {e}\n", exit_code=1)
            return
        except _RecordError as e:
            emit(err_env(_COMMAND, "WRITE_ERROR", str(e)), json_mode=json_, text=f"harvest: {e}\n", exit_code=1)
            return
        state.setdefault("harvested", {})[report.rel] = {
            "sha256": report.sha256, "at": _now_iso(), "recorded": len(report_cands),
        }
        harvest_core.save_state(dir_, state)

    data = {
        "project": str(dir_), "reports_read": len(to_harvest), "deferred": [r.rel for r in deferred],
        "candidates": len(survivors), "recorded": recorded, "dropped": dropped, "events": event_ids,
        "promptVersion": harvest_core.PROMPT_VERSION, "status": "ok",
    }
    text = f"harvest: recorded {recorded['insight']} insight(s), {recorded['gap']} gap(s); dropped {dropped}\n"
    emit(ok_env(_COMMAND, data), json_mode=json_, text=text, exit_code=0)
