"""`design-os evolution` — the DYNAMIC gate (spec 012 P3). Where `test_command_evolution.py`
reads four *static* store shapes, this walks a *single* store as work accrues and asserts the
verdict TRANSITIONS — because "evolution" is change over time, which no snapshot test covers.

Every rung was measured live before this was written (`scratchpad/p3-ladder.sh`):

    R1 fresh wired fixture ........................ WIRED
    R2 + mechanical work (no learning) ............ WIRED   ← the anti-lie
    R3 + heartbeat fired (still no learning) ...... DEAD-LOOP  (the honest way-station)
    R4 + one insight event ........................ ALIVE

Only the real `design-os evolution` CLI is exercised; the store is evolved between rungs by
writing the real event byte-shapes (`memory-events.ts`'s closed vocabulary) and the real
`heartbeat-state.json` shape (`evolution_signals.read_heartbeat_signal`). Deterministic and
hermetic — no `ui`, no node, no model. The *producer* of R4's insight in production
(`design-os harvest` + a model adapter + `ui memory record`) is proven end-to-end by
`test_command_harvest.py` / `test_heartbeat_runner_harvest.py`; this file cites them and tests
the verdict's dynamic response, the uncovered half.

Fixture: `fixtures/evolution-dynamic/design/` — a real `ds init --persona
data-dense-observatory` output (100% design:os-generated; no client DS committed to the repo).
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from typer.testing import CliRunner

from design_os.cli import app

_FIXTURE = Path(__file__).parent / "fixtures" / "evolution-dynamic" / "design"


def _verdict(runner: CliRunner, project: Path) -> dict[str, object]:
    """Run the real CLI and return its `data` payload (verdict + all signals)."""
    res = runner.invoke(app, ["evolution", "--dir", str(project), "--json"])
    assert res.exit_code == 0, res.stdout  # a health report always exits 0
    return json.loads(res.stdout)["data"]


def _append(ledger: Path, event: dict[str, object]) -> None:
    with ledger.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event) + "\n")


def test_dynamic_ladder_wired_through_alive(runner: CliRunner, tmp_path: Path) -> None:
    project = tmp_path / "project"
    shutil.copytree(_FIXTURE, project / "design")  # a writable copy — never mutate the fixture
    ledger = project / "design" / "memory.events.jsonl"

    # ── R1: fresh wired fixture — configured, nothing learned ───────────────────────────
    d = _verdict(runner, project)
    assert d["verdict"] == "WIRED"
    assert d["heartbeat"]["wired"] is True
    assert d["heartbeat"]["fired"] is False
    assert d["ledger"]["exists"] is False
    assert d["registry"]["component_count"] == 27  # the kit came in with the fixture

    # ── R2: real mechanical work accrues — the ANTI-LIE ─────────────────────────────────
    # token_change/lint_run/component_registered are mechanical bookkeeping, not learning.
    # The verdict must NOT jump to ALIVE just because the ledger got busy.
    _append(ledger, {"v": 1, "id": "e1", "t": "2026-07-18T10:00:00Z", "type": "token_change",
                     "data": {"path": "color.accent", "from": "#000", "to": "#111"}})
    _append(ledger, {"v": 1, "id": "e2", "t": "2026-07-18T10:01:00Z", "type": "lint_run",
                     "data": {"check": "a11y-lint", "file": "x.html", "errorCount": 0,
                              "warningCount": 0, "checkIds": []}})
    _append(ledger, {"v": 1, "id": "e3", "t": "2026-07-18T10:02:00Z", "type": "component_registered",
                     "data": {"name": "Card"}})
    d = _verdict(runner, project)
    assert d["verdict"] == "WIRED", "mechanical work must never read ALIVE (the anti-lie)"
    assert d["ledger"]["distinct"] == 3
    assert d["ledger"]["insight_events"] == 0
    assert d["ledger"]["gap_events"] == 0

    # ── R3: the heartbeat fires but still learns nothing — the honest way-station ────────
    # Measured live: firing the default wired heartbeat with no model adapter runs a11y/
    # specimen `ok` but records no learning signal, so a FIRED loop with no insight/gap/
    # ratified-soul reads DEAD-LOOP, not WIRED. We write the state artifact a fire produces
    # (read_heartbeat_signal keys off tasks.<id>.history[0].at); the real fire→state chain
    # is covered by test_command_heartbeat.py.
    (project / "design" / "heartbeat-state.json").write_text(json.dumps({
        "version": 1,
        "tasks": {"a11y": {"history": [{"at": "2026-07-18T10:03:00Z", "summary": {"failures": 1}}]}},
    }), encoding="utf-8")
    d = _verdict(runner, project)
    assert d["verdict"] == "DEAD-LOOP", "fired but no learning signal is DEAD-LOOP, not WIRED"
    assert d["heartbeat"]["fired"] is True
    assert d["heartbeat"]["last_run_at"] == "2026-07-18T10:03:00Z"

    # ── R4: a learning signal lands — the loop is ALIVE ─────────────────────────────────
    # The byte-shape a real harvest+`ui memory record` produces: an insight citing the
    # events it was drawn from (`refs` — memory-events.ts's provenance rule).
    _append(ledger, {"v": 1, "id": "e4", "t": "2026-07-18T10:05:00Z", "type": "insight",
                     "refs": ["e1", "e2"],
                     "data": {"text": "Dense settings tables need a sticky header once rows "
                                      "exceed a viewport — a durable cross-screen lesson."}})
    d = _verdict(runner, project)
    assert d["verdict"] == "ALIVE"
    assert d["ledger"]["insight_events"] == 1
    assert d["ledger"]["distinct"] == 4


def test_fixture_is_a_clean_wired_store(runner: CliRunner) -> None:
    """Guard the committed fixture itself: it must stay the pristine WIRED starting state the
    ladder depends on. If a future edit dirties it (a stray event, a ratified soul), the ladder
    would start mid-flight and its transitions would lie — fail loudly here first. Read-only."""
    d = _verdict(runner, _FIXTURE.parent)
    assert d["verdict"] == "WIRED"
    assert d["ledger"]["exists"] is False
    assert d["heartbeat"]["wired"] is True and d["heartbeat"]["fired"] is False
    assert d["soul"]["exists"] is True and d["soul"]["ratified"] is False
