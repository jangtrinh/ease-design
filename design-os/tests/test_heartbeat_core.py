"""`heartbeat_core` — pure functions only, unit-tested with a FIXED `now` (no wall-clock
reads anywhere in this module; see heartbeat_core.py's module docstring).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from design_os import heartbeat_core as hc

_TZ = timezone(timedelta(hours=7))
_NOW = datetime(2026, 1, 1, 9, 0, 0, tzinfo=_TZ)


# ── parse_interval: valid units + the "0 is not a valid duration" rule ──
@pytest.mark.parametrize(
    "s,expected_seconds",
    [("30m", 1800), ("4h", 14400), ("1d", 86400), ("7d", 604800)],
)
def test_parse_interval_valid_units(s: str, expected_seconds: int) -> None:
    assert hc.parse_interval(s) == expected_seconds


@pytest.mark.parametrize("s", ["bad", "0m", "0h", "0d", "-1h", "1", "1w", "", "1M"])
def test_parse_interval_rejects_bad_or_zero(s: str) -> None:
    with pytest.raises(ValueError):
        hc.parse_interval(s)


# ── fnv1a64: standard test vectors (verified against the reference FNV-1a-64 algorithm) ──
def test_fnv1a64_known_vectors() -> None:
    assert hc.fnv1a64("") == 0xCBF29CE484222325
    assert hc.fnv1a64("a") == 0xAF63DC4C8601EC8C


# ── stagger_offset: deterministic + bounded ──
def test_stagger_offset_is_deterministic() -> None:
    a = hc.stagger_offset("/some/project", 3600)
    b = hc.stagger_offset("/some/project", 3600)
    assert a == b


def test_stagger_offset_bounded_by_interval_over_ten() -> None:
    offset = hc.stagger_offset("/some/project", 3600)
    assert 0 <= offset < max(1, 3600 // 10)


def test_stagger_offset_tiny_interval_still_bounded() -> None:
    # interval_sec // 10 == 0 → the max(1, ...) floor kicks in, offset must still be 0.
    offset = hc.stagger_offset("/some/project", 5)
    assert offset == 0


# ── is_due ──
def test_is_due_no_prior_state_is_baseline_due() -> None:
    assert hc.is_due(None, _NOW) is True


def test_is_due_boundary_next_run_at_equals_now() -> None:
    assert hc.is_due({"nextRunAt": _NOW.isoformat()}, _NOW) is True


def test_is_due_future_next_run_at_is_not_due() -> None:
    future = (_NOW + timedelta(hours=1)).isoformat()
    assert hc.is_due({"nextRunAt": future}, _NOW) is False


def test_is_due_past_next_run_at_is_due() -> None:
    past = (_NOW - timedelta(hours=1)).isoformat()
    assert hc.is_due({"nextRunAt": past}, _NOW) is True


# ── next_run_at: no stagger baked in ──
def test_next_run_at_adds_interval_with_no_stagger() -> None:
    assert hc.next_run_at(_NOW, 3600) == (_NOW + timedelta(seconds=3600)).isoformat()


# ── compare_summary matrix ──
def test_compare_summary_baseline_when_no_prev() -> None:
    assert hc.compare_summary(None, {"failures": 0}) == "baseline"


def test_compare_summary_ok_when_unchanged() -> None:
    assert hc.compare_summary({"failures": 0}, {"failures": 0}) == "ok"


def test_compare_summary_improved_when_lower() -> None:
    assert hc.compare_summary({"failures": 2}, {"failures": 0}) == "improved"


def test_compare_summary_worsened_when_higher() -> None:
    assert hc.compare_summary({"failures": 0}, {"failures": 2}) == "worsened"


def test_compare_summary_new_key_with_positive_value_is_worsened() -> None:
    assert hc.compare_summary({"failures": 0}, {"failures": 0, "gaps": 1}) == "worsened"


def test_compare_summary_new_key_with_zero_value_is_ok() -> None:
    assert hc.compare_summary({"failures": 0}, {"failures": 0, "gaps": 0}) == "ok"


def test_compare_summary_vanished_key_is_ignored_not_improved() -> None:
    # `gaps` existed before and is simply absent now — must NOT read as an improvement.
    assert hc.compare_summary({"failures": 0, "gaps": 5}, {"failures": 0}) == "ok"


def test_compare_summary_worsened_wins_over_improved_in_same_call() -> None:
    # one metric got better, another got worse → worsened takes precedence (never masked).
    assert hc.compare_summary({"failures": 2, "gaps": 0}, {"failures": 0, "gaps": 1}) == "worsened"


# ── state: load/save roundtrip, atomic write, corrupt-file handling ──
def test_load_state_missing_file_returns_fresh_default(tmp_path: Path) -> None:
    assert hc.load_state(tmp_path / "heartbeat-state.json") == {"version": 1, "tasks": {}}


def test_load_state_corrupt_json_raises_value_error(tmp_path: Path) -> None:
    p = tmp_path / "heartbeat-state.json"
    p.write_text("{not json")
    with pytest.raises(ValueError):
        hc.load_state(p)


def test_load_state_non_object_root_raises_value_error(tmp_path: Path) -> None:
    p = tmp_path / "heartbeat-state.json"
    p.write_text("[1, 2, 3]")
    with pytest.raises(ValueError):
        hc.load_state(p)


def test_save_state_roundtrips_and_cleans_up_tmp_file(tmp_path: Path) -> None:
    p = tmp_path / "sub" / "heartbeat-state.json"  # parent dir doesn't exist yet
    state = {"version": 1, "tasks": {"a11y": {"runs": 1}}}
    hc.save_state(p, state)
    assert hc.load_state(p) == state
    assert not p.with_name(p.name + ".tmp").exists()


# ── record_run: nextRunAt/history unshift+cap/suppressCount ──
def test_record_run_sets_next_run_at_from_interval() -> None:
    state: dict = {"version": 1, "tasks": {}}
    hc.record_run(state, "a11y", "baseline", {"failures": 0}, _NOW, 3600)
    assert state["tasks"]["a11y"]["nextRunAt"] == hc.next_run_at(_NOW, 3600)


def test_record_run_history_unshifts_newest_first_and_caps_at_20() -> None:
    state: dict = {"version": 1, "tasks": {}}
    for i in range(25):
        hc.record_run(state, "a11y", "ok", {"failures": i}, _NOW + timedelta(days=i), 86400)
    task = state["tasks"]["a11y"]
    assert task["runs"] == 25
    history = task["history"]
    assert len(history) == 20
    # newest run (i=24) unshifted to the front; oldest 5 (i=0..4) fell off the cap.
    assert history[0]["summary"] == {"failures": 24}
    assert history[-1]["summary"] == {"failures": 5}


def test_record_run_suppress_count_increments_only_on_ok_status() -> None:
    state: dict = {"version": 1, "tasks": {}}
    hc.record_run(state, "a11y", "baseline", {"failures": 0}, _NOW, 86400)
    assert state["tasks"]["a11y"]["suppressCount"] == 0
    hc.record_run(state, "a11y", "ok", {"failures": 0}, _NOW + timedelta(days=1), 86400)
    assert state["tasks"]["a11y"]["suppressCount"] == 1
    hc.record_run(state, "a11y", "worsened", {"failures": 1}, _NOW + timedelta(days=2), 86400)
    assert state["tasks"]["a11y"]["suppressCount"] == 1
    hc.record_run(state, "a11y", "improved", {"failures": 0}, _NOW + timedelta(days=3), 86400)
    assert state["tasks"]["a11y"]["suppressCount"] == 1
    hc.record_run(state, "a11y", "ok", {"failures": 0}, _NOW + timedelta(days=4), 86400)
    assert state["tasks"]["a11y"]["suppressCount"] == 2
