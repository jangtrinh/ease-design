"""`harvest_core` — pure, no model, no subprocess. The gate section is the heart of the
phase: it must be unfoolable by a confident tone (Decision 3, anti-hallucination)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from design_os import harvest_core
from design_os.harvest_core import Candidate, HarvestError, Report

_FIXTURE = Path(__file__).parent / "fixtures" / "harvest" / "campaign-report.md"

# A body long enough to clear MIN_TEXT (40) and short enough to clear MAX_TEXT (500),
# reused across gate tests that don't care about the exact wording.
_OK_TEXT = "x" * 60


def _report(rel: str = "plans/p/reports/r.md", text: str = "hello world", sha: str = "s") -> Report:
    return Report(rel=rel, sha256=sha, text=text)


def _cand(**overrides: object) -> Candidate:
    base: dict[str, object] = dict(
        kind="insight", text=_OK_TEXT, evidence="hello", source="plans/p/reports/r.md",
        durable=True, actionable=True, confidence=0.9, target=None, gap_kind=None,
    )
    base.update(overrides)
    return Candidate(**base)  # type: ignore[arg-type]


# ─── discovery / cursor ─────────────────────────────────────────────────────────────

def test_discover_reports_finds_only_the_default_glob_and_sorts_by_path(tmp_path: Path) -> None:
    (tmp_path / "plans" / "a" / "reports").mkdir(parents=True)
    (tmp_path / "plans" / "a" / "reports" / "r2.md").write_text("two")
    (tmp_path / "plans" / "a" / "reports" / "r1.md").write_text("one")
    (tmp_path / "plans" / "a" / "notes.md").write_text("not a report")
    (tmp_path / "plans" / "top.md").write_text("not a report either")

    reports = harvest_core.discover_reports(tmp_path, harvest_core.DEFAULT_GLOBS)

    assert [r.rel for r in reports] == ["plans/a/reports/r1.md", "plans/a/reports/r2.md"]


def test_discover_reports_drops_a_match_outside_the_project_dir(tmp_path: Path) -> None:
    project = tmp_path / "project"
    (project / "plans" / "x" / "reports").mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "escaped.md").write_text("should never be read")
    (project / "plans" / "x" / "reports" / "evil.md").symlink_to(outside / "escaped.md")

    reports = harvest_core.discover_reports(project, harvest_core.DEFAULT_GLOBS)

    assert reports == []


def test_pending_skips_a_report_whose_sha_is_unchanged() -> None:
    r = _report(sha="same-sha")
    state = {"harvested": {r.rel: {"sha256": "same-sha"}}}
    to_harvest, deferred = harvest_core.pending([r], state, force=False)
    assert to_harvest == []
    assert deferred == []


def test_pending_reharvests_an_edited_report() -> None:
    r = _report(sha="new-sha")
    state = {"harvested": {r.rel: {"sha256": "old-sha"}}}
    to_harvest, _ = harvest_core.pending([r], state, force=False)
    assert to_harvest == [r]


def test_pending_returns_everything_under_force() -> None:
    r = _report(sha="same-sha")
    state = {"harvested": {r.rel: {"sha256": "same-sha"}}}
    to_harvest, _ = harvest_core.pending([r], state, force=True)
    assert to_harvest == [r]


def test_pending_caps_at_five_and_returns_the_rest_as_deferred() -> None:
    reports = [_report(rel=f"plans/p/reports/r{i}.md", sha=str(i)) for i in range(7)]
    to_harvest, deferred = harvest_core.pending(reports, {"harvested": {}}, force=True)
    assert len(to_harvest) == harvest_core.MAX_REPORTS_PER_RUN == 5
    assert len(deferred) == 2
    assert to_harvest + deferred == reports


def test_save_state_is_byte_stable_for_the_same_input(tmp_path: Path) -> None:
    state = {"version": 1, "promptVersion": "harvest-extract-v1", "harvested": {"b.md": {"sha256": "1"}, "a.md": {"sha256": "2"}}}
    harvest_core.save_state(tmp_path, state)
    first = (tmp_path / "design" / "harvest-state.json").read_bytes()
    harvest_core.save_state(tmp_path, state)
    second = (tmp_path / "design" / "harvest-state.json").read_bytes()
    assert first == second
    assert first.endswith(b"\n")


# ─── parsing ─────────────────────────────────────────────────────────────────────────

def test_parse_candidates_strips_a_json_code_fence() -> None:
    raw = '```json\n{"v": 1, "candidates": []}\n```'
    assert harvest_core.parse_candidates(raw) == []


def test_parse_candidates_raises_bad_candidates_on_prose() -> None:
    with pytest.raises(HarvestError) as exc:
        harvest_core.parse_candidates("I looked at the report and found nothing worth noting.")
    assert exc.value.code == "BAD_CANDIDATES"


def test_parse_candidates_raises_bad_candidates_on_a_missing_required_field() -> None:
    raw = json.dumps({"v": 1, "candidates": [{"kind": "insight", "text": "x" * 50}]})
    with pytest.raises(HarvestError) as exc:
        harvest_core.parse_candidates(raw)
    assert exc.value.code == "BAD_CANDIDATES"


def test_parse_candidates_accepts_an_empty_candidate_list() -> None:
    assert harvest_core.parse_candidates('{"v": 1, "candidates": []}') == []


# ─── the gate — the heart of the phase ─────────────────────────────────────────────────

def test_gate_drops_a_candidate_whose_evidence_is_not_in_the_source_report() -> None:
    reports = [_report(text="the quick brown fox jumps over the lazy dog")]
    survivors, dropped = harvest_core.gate([_cand(evidence="this sentence is nowhere in the source")], reports)
    assert survivors == []
    assert dropped == {"evidence-not-in-source": 1}


def test_gate_accepts_evidence_that_differs_only_in_whitespace_from_the_report() -> None:
    reports = [_report(text="the quick   brown\nfox  jumps over the lazy dog, a filler sentence")]
    cand = _cand(evidence="the quick brown fox jumps over the lazy dog")
    survivors, dropped = harvest_core.gate([cand], reports)
    assert survivors == [cand]
    assert dropped == {}


def test_gate_drops_a_candidate_citing_a_report_that_was_not_read() -> None:
    reports = [_report(rel="plans/p/reports/other.md")]
    survivors, dropped = harvest_core.gate([_cand(source="plans/p/reports/unread.md")], reports)
    assert survivors == []
    assert dropped == {"unread-source": 1}


def test_gate_drops_non_durable_and_non_actionable_candidates() -> None:
    reports = [_report(text="hello world")]
    cands = [_cand(evidence="hello", durable=False, actionable=True),
             _cand(evidence="world", durable=True, actionable=False)]
    survivors, dropped = harvest_core.gate(cands, reports)
    assert survivors == []
    assert dropped == {"not-durable-or-actionable": 2}


def test_gate_drops_confidence_below_the_floor_and_keeps_it_at_exactly_0_6() -> None:
    reports = [_report(text="hello world")]
    below = _cand(evidence="hello", confidence=0.59)
    at_floor = _cand(evidence="hello world", confidence=0.6)
    survivors, dropped = harvest_core.gate([below, at_floor], reports)
    assert survivors == [at_floor]
    assert dropped == {"low-confidence": 1}


def test_gate_drops_text_shorter_than_40_and_longer_than_500_chars() -> None:
    reports = [_report(text="hello world")]
    too_short = _cand(evidence="hello", text="short")
    too_long = _cand(evidence="hello", text="x" * 501)
    survivors, dropped = harvest_core.gate([too_short, too_long], reports)
    assert survivors == []
    assert dropped == {"text-length": 2}


def test_gate_drops_a_gap_with_a_malformed_target() -> None:
    reports = [_report(text="hello world")]
    cand = _cand(evidence="hello", kind="gap", target="Not A Valid Target", gap_kind="rubric-gap")
    survivors, dropped = harvest_core.gate([cand], reports)
    assert survivors == []
    assert dropped == {"malformed-gap-target": 1}


def test_gate_drops_a_gap_whose_kind_is_outside_the_documented_vocabulary() -> None:
    reports = [_report(text="hello world")]
    cand = _cand(evidence="hello", kind="gap", target="taste-rubric.md#motion", gap_kind="not-a-real-kind")
    survivors, dropped = harvest_core.gate([cand], reports)
    assert survivors == []
    assert dropped == {"unknown-gap-kind": 1}


def test_gate_dedupes_within_one_batch_but_never_against_the_ledger() -> None:
    reports = [_report(text="hello world")]
    first = _cand(evidence="hello", text="Same lesson repeated twice in one batch, padded to length.")
    second = _cand(evidence="world", text="same lesson repeated twice in one batch, padded to length.")
    survivors, dropped = harvest_core.gate([first, second], reports)
    assert survivors == [first]
    assert dropped == {"duplicate-in-batch": 1}


def test_gate_caps_at_three_per_report_keeping_the_highest_confidence() -> None:
    reports = [_report(text="hello world")]
    cands = [
        _cand(evidence="hello", text=f"distinct candidate lesson number {i} padded out long enough", confidence=c)
        for i, c in enumerate([0.9, 0.8, 0.7, 0.6])
    ]
    survivors, dropped = harvest_core.gate(cands, reports)
    assert len(survivors) == 3
    assert {c.confidence for c in survivors} == {0.9, 0.8, 0.7}
    assert dropped == {"per-report-cap": 1}


def test_gate_counts_every_drop_by_reason() -> None:
    reports = [_report(text="hello world")]
    cands = [
        _cand(evidence="not present anywhere"),
        _cand(evidence="also not present at all"),
        _cand(evidence="hello", confidence=0.1),
    ]
    _, dropped = harvest_core.gate(cands, reports)
    assert dropped == {"evidence-not-in-source": 2, "low-confidence": 1}


# ─── the Art III-shaped fixture ─────────────────────────────────────────────────────────

def _fixture_report() -> Report:
    text = _FIXTURE.read_text(encoding="utf-8")
    return Report(rel="plans/07/reports/campaign-report.md", sha256="fixture", text=text)


def test_the_seeded_font_metric_finding_survives_the_gate() -> None:
    report = _fixture_report()
    evidence = (
        "a fixed-width box hugging Inter's width\nwraps under Be Vietnam Pro"
    )
    finding = _cand(
        source=report.rel,
        evidence=evidence,
        text="A fixed-width box hugging Inter's width wraps under Be Vietnam Pro because "
             "Vietnamese glyphs run wider at the same point size.",
    )
    survivors, _ = harvest_core.gate([finding], [report])
    assert survivors == [finding]


def test_the_green_test_run_and_the_time_spent_are_dropped_as_not_durable() -> None:
    report = _fixture_report()
    green = _cand(source=report.rel, evidence="ran npm test, all green", durable=False)
    time_spent = _cand(source=report.rel, evidence="took 2 hours end to end", durable=False)
    survivors, dropped = harvest_core.gate([green, time_spent], [report])
    assert survivors == []
    assert dropped == {"not-durable-or-actionable": 2}
