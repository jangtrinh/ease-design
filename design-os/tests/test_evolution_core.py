"""`evolution_core` — pure, no model, no subprocess (spec 012 P1). Paired fixture tests:
the dana shape (dead loop) and the VSF shape (alive), plus the no-ledger shape."""

from __future__ import annotations

import json
from pathlib import Path

from design_os import evolution_core


def _write_ledger(project: Path, events: list[dict[str, object]]) -> None:
    (project / "design").mkdir(parents=True, exist_ok=True)
    path = project / "design" / "memory.events.jsonl"
    path.write_text("\n".join(json.dumps(e) for e in events) + "\n", encoding="utf-8")


# ─── the dana shape: 276 token_change, no graph, no soul, no heartbeat ──────────────────

def test_dana_shape_is_dead_loop(tmp_path: Path) -> None:
    events = [
        {"v": 1, "id": f"e{i}", "t": "2026-07-17T12:00:00Z", "type": "token_change",
         "data": {"path": "color.accent", "from": "#000", "to": "#111"}}
        for i in range(276)
    ]
    _write_ledger(tmp_path, events)

    signals = evolution_core.gather_signals(tmp_path)

    assert signals["verdict"] == "DEAD-LOOP"
    assert signals["ledger"]["exists"] is True
    assert signals["ledger"]["total"] == 276
    assert signals["ledger"]["types"] == {"token_change": 276}
    assert signals["ledger"]["insight_events"] == 0
    assert signals["ledger"]["gap_events"] == 0
    assert signals["graph"]["exists"] is False
    assert signals["soul"]["exists"] is False
    assert signals["soul"]["ratified"] is False
    assert signals["heartbeat"]["wired"] is False
    assert signals["heartbeat"]["fired"] is False


def test_dead_loop_report_names_every_stalled_dimension(tmp_path: Path) -> None:
    _write_ledger(tmp_path, [
        {"v": 1, "id": "e1", "t": "2026-07-17T12:00:00Z", "type": "token_change",
         "data": {"path": "color.accent", "from": "#000", "to": "#111"}},
    ])
    from design_os.commands.evolution import _render_text

    text = _render_text(evolution_core.gather_signals(tmp_path))

    assert "no insights" in text
    assert "no gaps" in text
    assert "no soul.md" in text
    assert "heartbeat: not wired" in text


# ─── the VSF shape: an insight event, a ratified soul, a wired+fired heartbeat ──────────

def test_vsf_shape_is_alive(tmp_path: Path) -> None:
    _write_ledger(tmp_path, [
        {"v": 1, "id": "e1", "t": "2026-07-17T12:00:00Z", "type": "component_registered",
         "data": {"name": "button-primary"}},
        {"v": 1, "id": "e2", "t": "2026-07-17T12:05:00Z", "type": "insight",
         "refs": ["e1"], "data": {"text": "Enterprise density with deliberate air holds."}},
    ])
    soul_dir = tmp_path / "design"
    (soul_dir / "soul.md").write_text(
        "---\nstatus: ratified\n---\n\n# Design Soul\n\n## Never\n\n- x — evidence: y\n",
        encoding="utf-8",
    )
    (soul_dir / "heartbeat.json").write_text(json.dumps({
        "version": 1,
        "tasks": [
            {"id": "a11y", "type": "ds-a11y", "interval": "1d"},
            {"id": "specimen", "type": "specimen", "interval": "1d"},
            {"id": "harvest", "type": "harvest", "interval": "12h"},
            {"id": "reflect", "type": "reflect", "interval": "24h"},
            {"id": "figma", "type": "figma-audit", "interval": "7d"},
        ],
    }), encoding="utf-8")
    (soul_dir / "heartbeat-state.json").write_text(json.dumps({
        "version": 1,
        "tasks": {
            "a11y": {
                "nextRunAt": "2026-07-18T09:00:00Z", "lastStatus": "baseline",
                "lastSummary": {"failures": 0}, "runs": 1,
                "history": [{"at": "2026-07-17T09:00:00Z", "status": "baseline", "summary": {"failures": 0}}],
            },
        },
    }), encoding="utf-8")

    signals = evolution_core.gather_signals(tmp_path)

    assert signals["verdict"] == "ALIVE"
    assert signals["ledger"]["insight_events"] == 1
    assert signals["soul"]["ratified"] is True
    assert signals["soul"]["evidence_count"] == 1
    assert signals["heartbeat"]["wired"] is True
    assert signals["heartbeat"]["task_count"] == 5
    assert signals["heartbeat"]["fired"] is True
    assert signals["heartbeat"]["last_run_at"] == "2026-07-17T09:00:00Z"


# ─── no ledger at all ───────────────────────────────────────────────────────────────────

def test_no_ledger_is_no_loop(tmp_path: Path) -> None:
    signals = evolution_core.gather_signals(tmp_path)

    assert signals["verdict"] == "NO-LOOP"
    assert signals["ledger"]["exists"] is False
    assert signals["ledger"]["total"] == 0


# ─── individual signal readers ──────────────────────────────────────────────────────────

def test_graph_recurrence_counts_seen_greater_than_one(tmp_path: Path) -> None:
    (tmp_path / "design").mkdir(parents=True)
    (tmp_path / "design" / "memory.graph.json").write_text(json.dumps({
        "v": 1, "insights": [
            {"id": "e1", "seen": 1, "text": "a"},
            {"id": "e2", "seen": 3, "text": "b"},
        ],
    }), encoding="utf-8")

    graph = evolution_core.read_graph_signal(tmp_path)

    assert graph["exists"] is True
    assert graph["insights_total"] == 2
    assert graph["insights_recurrent"] == 1


def test_roles_signal_counts_baked_extension(tmp_path: Path) -> None:
    (tmp_path / "design").mkdir(parents=True)
    (tmp_path / "design" / "design.tokens.json").write_text(json.dumps({
        "color": {
            "accent": {"$type": "color", "$value": "#f00", "$extensions": {"design-os.role": "brand"}},
            "gray-100": {"$type": "color", "$value": "#eee"},
        },
    }), encoding="utf-8")

    roles = evolution_core.read_roles_signal(tmp_path)

    assert roles["total_tokens"] == 2
    assert roles["roled_tokens"] == 1


def test_registry_signal_reads_component_count_and_ledger_events(tmp_path: Path) -> None:
    _write_ledger(tmp_path, [
        {"v": 1, "id": "e1", "t": "2026-07-17T12:00:00Z", "type": "component_registered",
         "data": {"name": "a"}},
        {"v": 1, "id": "e2", "t": "2026-07-17T12:01:00Z", "type": "component_registered",
         "data": {"name": "b"}},
    ])
    (tmp_path / "design" / "component-registry.json").write_text(json.dumps({
        "version": "0.1.0", "components": [{"name": "a"}],
    }), encoding="utf-8")

    ledger = evolution_core.read_ledger_signal(tmp_path)
    registry = evolution_core.read_registry_signal(tmp_path, ledger)

    assert registry["component_count"] == 1
    assert registry["component_registered_events"] == 2
