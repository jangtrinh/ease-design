"""The two learning-loop heartbeat runners — `harvest` and `reflect` (spec 006 P5 Decision
1). Split out of `heartbeat_runners.py`, already at its 200-line cap, so both stay under it.

Same runner contract: ``(project_dir, params) -> {"status": "ok"|"error"|"skipped",
"summary": {…numeric…}, "detail": str, "skipReason"?}``, never raises. Decision 2 (the
anti-regression trap, Key Insight 1): ``summary`` carries ONLY ``failures`` — a harvest/
reflect that found or recorded MORE must never look like "worsened" to
`heartbeat_core.compare_summary`. Decision 4's degrade table (skip reason → condition): no-
project → no `design/`; no-new-reports (harvest) / no-new-events (reflect, < `minEvents`);
recall-missing (reflect, no `recall` bin); no-model-adapter (no `DESIGN_OS_MODEL_CMD`); a
model call that fails/times out is the one exception — `status: "error"`, `failures: 1`,
the notify-worthy case.

Decision 3: both import `harvest_core`/`harvest_model`/`reflect_core` directly and pass
`project_dir` explicitly — no cwd dependence (Key Insight 5).
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from design_os import harvest_core, reflect_core
from design_os.commands.harvest import _PROMPT_PATH, _RecordError, _run_record, _write_inbox
from design_os.harvest_model import ModelUnavailable, extract, resolve_model_cmd
from design_os.kernel import KernelNotFound, run_ui

_RECALL_TIMEOUT = 60.0
_DEFAULT_MIN_EVENTS = 5
_JOB_EVENTS_REL = Path("design") / ".reflect-job-events.json"


def _resolve_bin(name: str, env_var: str) -> str | None:
    """Mirrors `heartbeat_runners._resolve_bin` (duplicated, not imported, to avoid a cycle:
    `heartbeat_runners` imports this module's runners)."""
    from design_os.commands import heartbeat as heartbeat_cmd
    return heartbeat_cmd.resolve_bin(name, env_var)


def _parse_one_json(stdout: str) -> Any:
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return None


def _no_project(project_dir: Path) -> dict[str, Any] | None:
    if (project_dir / "design").is_dir():
        return None
    return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-project"}


# ─── harvest ─────────────────────────────────────────────────────────────────────


def _run_harvest(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Harvest new end-of-phase reports into memory candidates (spec 006 P5)."""
    skip = _no_project(project_dir)
    if skip is not None:
        return skip

    raw_globs = params.get("glob") if isinstance(params, dict) else None
    globs = raw_globs if isinstance(raw_globs, list) and raw_globs else list(harvest_core.DEFAULT_GLOBS)
    reports = harvest_core.discover_reports(project_dir, globs)
    state = harvest_core.load_state(project_dir)
    to_harvest, _deferred = harvest_core.pending(reports, state, force=False)
    if not to_harvest:
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-new-reports"}

    packet = harvest_core.build_packet(_PROMPT_PATH.read_text(encoding="utf-8"), to_harvest)
    cmd = resolve_model_cmd(project_dir)
    if cmd is None:
        _write_inbox(project_dir, packet, to_harvest)
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-model-adapter"}

    try:
        raw = extract(packet, cmd=cmd)
    except ModelUnavailable as e:
        _write_inbox(project_dir, packet, to_harvest)
        return {"status": "error", "summary": {"failures": 1}, "detail": f"harvest: model call failed: {e}"}

    try:
        candidates = harvest_core.parse_candidates(raw)
    except harvest_core.HarvestError as e:
        # A bad TURN (malformed model output), not a bad RUN — mirrors harvest.py: never
        # pages the owner over one flaky turn.
        _write_inbox(project_dir, packet, to_harvest)
        return {"status": "skipped", "summary": {}, "detail": str(e), "skipReason": "bad-candidates"}

    survivors, dropped = harvest_core.gate(candidates, to_harvest)
    by_source: dict[str, list[harvest_core.Candidate]] = {}
    for c in survivors:
        by_source.setdefault(c.source, []).append(c)
    already_recorded = harvest_core.ledger_candidate_keys(project_dir)
    recorded = {"insight": 0, "gap": 0}
    try:
        for report in to_harvest:
            report_cands = by_source.get(report.rel, [])
            harvested_data = {"source": report.rel, "what": f"{len(report_cands)} candidates",
                               "promptVersion": harvest_core.PROMPT_VERSION, "sha256": report.sha256}
            hid = _run_record(project_dir, "harvested", harvested_data)
            for c in report_cands:
                key = harvest_core.candidate_key(c.kind, c.text, c.source)
                if key in already_recorded:
                    continue
                payload: dict[str, Any] = {"text": c.text, "evidence": c.evidence, "harvestKey": key}
                if c.kind == "gap":
                    payload["target"] = c.target
                    payload["kind"] = c.gap_kind
                _run_record(project_dir, c.kind, payload, refs=[hid])
                recorded[c.kind] += 1
                already_recorded.add(key)
            state.setdefault("harvested", {})[report.rel] = {"sha256": report.sha256, "recorded": len(report_cands)}
            harvest_core.save_state(project_dir, state)
    except (KernelNotFound, _RecordError) as e:
        return {"status": "error", "summary": {"failures": 1}, "detail": f"harvest: record failed: {e}"}

    n_recorded = recorded["insight"] + recorded["gap"]
    n_dropped = sum(dropped.values())
    detail = f"harvest: {len(to_harvest)} report(s) → {n_recorded} recorded, {n_dropped} dropped"
    return {"status": "ok", "summary": {"failures": 0}, "detail": detail}


# ─── reflect ─────────────────────────────────────────────────────────────────────


def _run_reflect(project_dir: Path, params: dict[str, Any]) -> dict[str, Any]:
    """Reflect over accumulated ledger events into one durable insight (spec 006 P5
    Decision 5) — job events ride the `memory export-corpus --since` cursor; the host
    model distils the lesson (`recall` never calls an LLM)."""
    skip = _no_project(project_dir)
    if skip is not None:
        return skip

    raw_min = params.get("minEvents") if isinstance(params, dict) else None
    min_events = raw_min if isinstance(raw_min, int) and raw_min > 0 else _DEFAULT_MIN_EVENTS
    state = reflect_core.load_state(project_dir)
    cursor = state.get("lastEventId")
    argv = ["memory", "export-corpus", "--json", "--dir", str(project_dir)]
    if isinstance(cursor, str):
        argv += ["--since", cursor]
    try:
        result = run_ui(argv)
    except KernelNotFound as e:
        return {"status": "error", "summary": {"failures": 1}, "detail": f"reflect: {e}"}
    if result.envelope is None or not result.envelope.get("ok"):
        return {"status": "error", "summary": {"failures": 1}, "detail": "reflect: export-corpus printed no valid envelope"}
    items = (result.envelope.get("data") or {}).get("items")
    items = items if isinstance(items, list) else []
    job_ids = reflect_core.select_job_events(items, cursor if isinstance(cursor, str) else None)
    if not reflect_core.has_enough_events(job_ids, min_events):
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-new-events"}

    recall_bin = _resolve_bin("recall", "DESIGN_OS_RECALL_BIN")
    if recall_bin is None:
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "recall-missing"}

    job_events_path = project_dir / _JOB_EVENTS_REL
    job_events_path.parent.mkdir(parents=True, exist_ok=True)
    job_events_path.write_text(json.dumps(job_ids), encoding="utf-8")
    try:
        proc = subprocess.run(  # noqa: S603
            [recall_bin, "reflect", str(job_events_path), "--project", str(project_dir), "--json"],
            capture_output=True, text=True, timeout=_RECALL_TIMEOUT, cwd=str(project_dir),
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "summary": {"failures": 1}, "detail": "reflect: `recall reflect` exceeded 60s"}
    except OSError as e:
        return {"status": "error", "summary": {"failures": 1}, "detail": f"reflect: `{recall_bin}` could not be executed: {e}"}
    finally:
        job_events_path.unlink(missing_ok=True)

    packet = _parse_one_json(proc.stdout)
    if not isinstance(packet, dict) or "instruction" not in packet:
        return {"status": "error", "summary": {"failures": 1}, "detail": "reflect: `recall reflect` printed no valid packet"}
    prompt = reflect_core.build_reflect_prompt(packet)
    cmd = resolve_model_cmd(project_dir)
    if cmd is None:
        return {"status": "skipped", "summary": {}, "detail": "", "skipReason": "no-model-adapter"}

    try:
        raw = extract(prompt, cmd=cmd)
    except ModelUnavailable as e:
        return {"status": "error", "summary": {"failures": 1}, "detail": f"reflect: model call failed: {e}"}

    lesson = raw.strip()
    accepted, reason = reflect_core.gate_lesson(lesson, reflect_core.latest_insight_text(project_dir))
    if not accepted:
        return {"status": "ok", "summary": {"failures": 0}, "detail": f"reflect: lesson dropped ({reason})"}

    try:
        _run_record(project_dir, "insight", {"text": lesson}, refs=job_ids)
    except (KernelNotFound, _RecordError) as e:
        return {"status": "error", "summary": {"failures": 1}, "detail": f"reflect: record failed: {e}"}

    reflect_core.save_state(project_dir, reflect_core.advance_cursor(state, job_ids))
    return {"status": "ok", "summary": {"failures": 0}, "detail": f"reflect: recorded 1 insight from {len(job_ids)} event(s)"}
