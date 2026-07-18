"""Pure decision core for `design-os evolution` (spec 012 P1): read a project's 8
learning-loop signals from `design/` and roll them up into a verdict. No subprocess, no
model call, no wall-clock read — heartbeat "firing" rides the state file's own recorded
`history[].at` timestamps, never `datetime.now()` (Art I determinism). A missing/corrupt
file degrades to its empty shape; this module never raises on a malformed project.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_DESIGN = "design"
_LEDGER_REL = Path(_DESIGN) / "memory.events.jsonl"
_GRAPH_REL = Path(_DESIGN) / "memory.graph.json"
_SOUL_REL = Path(_DESIGN) / "soul.md"
_HEARTBEAT_CONFIG_REL = Path(_DESIGN) / "heartbeat.json"
_HEARTBEAT_STATE_REL = Path(_DESIGN) / "heartbeat-state.json"
_REGISTRY_REL = Path(_DESIGN) / "component-registry.json"
_TOKENS_REL = Path(_DESIGN) / "design.tokens.json"
# Taste-hub votes root defaults to <project>/taste (taste-store.ts resolveTasteRoot);
# design/votes.jsonl is also checked in case a project keeps it alongside the ledger.
_VOTES_RELS = (Path(_DESIGN) / "votes.jsonl", Path("taste") / "votes.jsonl")

# frontmatter/evidence regexes mirror src/core/ds-soul.ts's frontmatterStatus exactly.
_FRONTMATTER_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?")
_STATUS_RE = re.compile(r"^status:[ \t]*(\S+)", re.MULTILINE)
_EVIDENCE_RE = re.compile(r"—\s*(?:evidence|inherited):")


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    events: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            events.append(obj)
    return events


def _read_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def read_ledger_signal(project_dir: Path) -> dict[str, Any]:
    """Signals 1/2/5: ledger diversity, insight/gap counts (the ledger IS the source of
    truth — memory-events.ts's closed EVENT_TYPES set)."""
    path = project_dir / _LEDGER_REL
    exists = path.is_file()
    events = _read_jsonl(path)
    types: dict[str, int] = {}
    for e in events:
        t = e.get("type")
        if isinstance(t, str):
            types[t] = types.get(t, 0) + 1
    return {
        "exists": exists,
        "total": len(events),
        "types": dict(sorted(types.items())),
        "distinct": len(types),
        "insight_events": types.get("insight", 0),
        "gap_events": types.get("gap", 0),
    }


def read_graph_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 2: compiled graph insights + recurrence (`seen > 1` — a lesson HELD across
    harvests, memory-graph.ts InsightEntry)."""
    graph = _read_json(project_dir / _GRAPH_REL)
    if not isinstance(graph, dict):
        return {"exists": False, "insights_total": 0, "insights_recurrent": 0}
    raw_insights = graph.get("insights")
    insights = raw_insights if isinstance(raw_insights, list) else []
    recurrent = sum(
        1 for i in insights
        if isinstance(i, dict) and isinstance(i.get("seen"), (int, float)) and i["seen"] > 1
    )
    return {"exists": True, "insights_total": len(insights), "insights_recurrent": recurrent}


def read_soul_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 3: soul.md existence, ratified status, and evidence-cited clauses (lines with
    an em-dash `— evidence:`/`— inherited:`, ds-soul.ts's declared-stance convention)."""
    path = project_dir / _SOUL_REL
    if not path.is_file():
        return {"exists": False, "status": None, "ratified": False, "evidence_count": 0}
    text = path.read_text(encoding="utf-8")
    fm = _FRONTMATTER_RE.match(text)
    status = _STATUS_RE.search(fm.group(1)).group(1) if fm and _STATUS_RE.search(fm.group(1)) else None
    return {
        "exists": True,
        "status": status,
        "ratified": status == "ratified",
        "evidence_count": len(_EVIDENCE_RE.findall(text)),
    }


def read_heartbeat_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 6: heartbeat.json wiring + heartbeat-state.json firing. "Firing" = any task
    has a non-empty `history` (heartbeat_core.record_run unshifts newest-first at index 0);
    `last_run_at` is that entry's own `at`, never a wall-clock comparison."""
    config = _read_json(project_dir / _HEARTBEAT_CONFIG_REL)
    raw_tasks = config.get("tasks") if isinstance(config, dict) else None
    tasks_cfg = raw_tasks if isinstance(raw_tasks, list) else []
    wired = isinstance(config, dict) and len(tasks_cfg) > 0

    state = _read_json(project_dir / _HEARTBEAT_STATE_REL)
    raw_state_tasks = state.get("tasks") if isinstance(state, dict) else None
    state_tasks = raw_state_tasks if isinstance(raw_state_tasks, dict) else {}

    fired = False
    last_run_at: str | None = None
    for task_state in state_tasks.values():
        if not isinstance(task_state, dict):
            continue
        history = task_state.get("history")
        if isinstance(history, list) and history:
            fired = True
            entry = history[0]
            at = entry.get("at") if isinstance(entry, dict) else None
            if isinstance(at, str) and (last_run_at is None or at > last_run_at):
                last_run_at = at

    return {"wired": wired, "task_count": len(tasks_cfg), "fired": fired, "last_run_at": last_run_at}


def read_registry_signal(project_dir: Path, ledger: dict[str, Any]) -> dict[str, Any]:
    """Signal 8 (registry half): component-registry.json's own count vs the ledger's
    `component_registered` event count — reported as two independent numbers (Art VIII);
    they may legitimately diverge (a registry rebuilt/reset without replaying the ledger)."""
    registry = _read_json(project_dir / _REGISTRY_REL)
    components = registry.get("components") if isinstance(registry, dict) else None
    component_count = len(components) if isinstance(components, list) else 0
    return {
        "component_count": component_count,
        "component_registered_events": ledger["types"].get("component_registered", 0),
    }


def read_roles_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 8 (DS role half, spec 011): tokens carrying a baked `$extensions
    ["design-os.role"]` vs the total token count (ds-context-roles.ts's baked-annotation
    read — never recomputes recognition)."""
    tokens = _read_json(project_dir / _TOKENS_REL)
    total = 0
    roled = 0
    if isinstance(tokens, dict):
        for group in tokens.values():
            if not isinstance(group, dict):
                continue
            for tok in group.values():
                if not isinstance(tok, dict):
                    continue
                total += 1
                ext = tok.get("$extensions")
                if isinstance(ext, dict) and isinstance(ext.get("design-os.role"), str):
                    roled += 1
    return {"total_tokens": total, "roled_tokens": roled}


def read_taste_votes_signal(project_dir: Path) -> dict[str, Any]:
    """Signal 7: taste-hub votes.jsonl line count, if the ledger exists anywhere it's
    known to live (taste-store.ts's default root, or alongside design/)."""
    for rel in _VOTES_RELS:
        path = project_dir / rel
        if path.is_file():
            return {"exists": True, "count": len(_read_jsonl(path))}
    return {"exists": False, "count": 0}


def compute_verdict(signals: dict[str, Any]) -> str:
    """Brainstorm §6.3 / plan §6.3 — a LEARNING-SIGNAL rule, not a type count.
    NO-LOOP: no ledger at all. DEAD-LOOP: ledger has events but zero learning signal.
    ALIVE: any learning signal — an insight, a gap, a ratified soul, or a firing heartbeat."""
    ledger = signals["ledger"]
    if not ledger["exists"]:
        return "NO-LOOP"
    learning_signal = (
        ledger["insight_events"] > 0
        or ledger["gap_events"] > 0
        or signals["soul"]["ratified"]
        or signals["heartbeat"]["fired"]
    )
    return "ALIVE" if learning_signal else "DEAD-LOOP"


def gather_signals(project_dir: Path) -> dict[str, Any]:
    """Read all 8 signals + the rollup verdict. Read-only; never writes into `project_dir`."""
    ledger = read_ledger_signal(project_dir)
    signals: dict[str, Any] = {
        "ledger": ledger,
        "graph": read_graph_signal(project_dir),
        "soul": read_soul_signal(project_dir),
        "heartbeat": read_heartbeat_signal(project_dir),
        "registry": read_registry_signal(project_dir, ledger),
        "roles": read_roles_signal(project_dir),
        "taste_votes": read_taste_votes_signal(project_dir),
    }
    signals["verdict"] = compute_verdict(signals)
    return signals
