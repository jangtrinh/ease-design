"""Pure collect logic: discovery, ledger parse, open-gap detection, recurrence grouping.

No Typer, no envelope, no policy beyond reading the ledger files it is handed. Deterministic:
same ledgers in → same result out; no network, no model, no ``ui`` shell-out. The ledger is
read and parsed directly (``json.loads`` per non-blank line) and is NEVER re-validated against
the event schema — the ``ui`` kernel owns validation on write; collect is a pure reader, so it
only parses. The raw gap ``text`` is carried through verbatim as DATA.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# Additive-first caps (spec §nguyên tắc 6): one topic, ≤10 files, ≤12000 chars/file per run.
# The collector never enforces these — it only reports them so the loop's draft step gates on them.
CAPS: dict[str, int] = {"max_topics": 1, "max_files": 10, "max_chars_per_file": 12000}

# Registry fallback is best-effort and MUST never be a silent blind spot (spec chốt #5).
REGISTRY_WARNING = "registry-only discovery: unregistered projects are invisible"


class BadLedger(Exception):
    """A project's ``memory.events.jsonl`` had a malformed line — collect fails closed."""

    def __init__(self, project: str, detail: str) -> None:
        self.project = project
        self.detail = detail
        super().__init__(f"{project}: {detail}")


# ─── Discovery ────────────────────────────────────────────────────────────────────

def ease_home() -> Path:
    """User-scope home for the registry (mirrors the kernel: ``$EASE_DESIGN_HOME`` overrides)."""
    env = os.environ.get("EASE_DESIGN_HOME")
    if env:
        return Path(env)
    return Path.home() / ".ease-design"


def registry_path() -> Path:
    return ease_home() / "projects.json"


def _load_registry(path: Path) -> list[Any]:
    """Best-effort read of the user registry; a missing or corrupt file reads as empty."""
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return data if isinstance(data, list) else []


def discover_projects(dirs: list[str]) -> tuple[list[Path], dict[str, Any] | None, list[str]]:
    """Return ``(project_paths, discovery_meta, warnings)``.

    Repeated ``--dir`` is the PRIMARY source (spec chốt #5): when any ``--dir`` is passed the
    registry is NEVER read. Only with no ``--dir`` do we fall back to the best-effort registry,
    and that fallback ALWAYS carries a warning so registry thinness is never a silent blind spot.
    """
    if dirs:
        return [Path(d) for d in dirs], None, []
    entries = _load_registry(registry_path())
    projects = [
        Path(e["path"]) for e in entries if isinstance(e, dict) and e.get("path")
    ]
    discovery = {"source": "registry", "projects_found": len(projects)}
    return projects, discovery, [REGISTRY_WARNING]


# ─── Ledger read + open-gap rule ──────────────────────────────────────────────────

def _ledger_path(project: Path) -> Path:
    return project / "design" / "memory.events.jsonl"


def parse_ledger(project: Path) -> list[dict[str, Any]]:
    """Parse a project's ledger into event dicts. Raise :class:`BadLedger` on any bad line.

    Only ``json.loads`` per non-blank line — NO schema re-validation (the kernel validated on
    write). A project with no ledger yields ``[]`` (a fresh project, not an error).
    """
    path = _ledger_path(project)
    if not path.is_file():
        return []
    events: list[dict[str, Any]] = []
    for lineno, raw in enumerate(path.read_text().splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BadLedger(str(project), f"line {lineno}: {exc.msg}") from exc
        if not isinstance(obj, dict):
            raise BadLedger(str(project), f"line {lineno}: not a JSON object")
        events.append(obj)
    return events


def open_gaps(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gaps that no ``insight`` has resolved.

    A gap ``g`` is RESOLVED once some ``insight`` event's ``refs`` contains ``g['id']`` —
    that is the loop's post-merge close-out step (librarian-loop.md §1b). Append-only ids
    guarantee any such insight was recorded after the gap, so plain refs-membership IS the
    'a later insight resolved it' rule.
    """
    resolved: set[str] = set()
    for event in events:
        if event.get("type") == "insight":
            for ref in event.get("refs") or []:
                resolved.add(ref)
    return [
        event
        for event in events
        if event.get("type") == "gap" and event.get("id") not in resolved
    ]


# ─── Collect + recurrence grouping ────────────────────────────────────────────────

def _gap_record(project: str, gap: dict[str, Any]) -> dict[str, Any]:
    """Flatten one open gap into the envelope shape (text carried verbatim — it is DATA)."""
    data = gap.get("data") or {}
    return {
        "id": gap.get("id"),
        "project": project,
        "target": data.get("target"),
        "text": data.get("text"),
        "kind": data.get("kind"),
    }


def _group_by_target(open_items: list[tuple[str, dict[str, Any]]]) -> list[dict[str, Any]]:
    """Group open gaps by ``data.target`` and pre-compute recurrence.

    Recurrence firewall (spec chốt #2): ``recurrent`` is ``distinct_project_count >= 2`` — one
    project repeating a target 10 times still counts once, because that may be that project's own
    taste, not a durable cross-studio lesson. This is a recall floor, never a graduation gate.
    """
    by_target: dict[Any, dict[str, Any]] = {}
    for project, gap in open_items:
        target = (gap.get("data") or {}).get("target")
        bucket = by_target.setdefault(target, {"gap_ids": [], "projects": set()})
        bucket["gap_ids"].append(gap.get("id"))
        bucket["projects"].add(project)
    groups: list[dict[str, Any]] = []
    for target in sorted(by_target, key=lambda t: (t is None, t)):
        bucket = by_target[target]
        distinct = len(bucket["projects"])
        groups.append(
            {
                "target": target,
                "gap_ids": bucket["gap_ids"],
                "distinct_project_count": distinct,
                "recurrent": distinct >= 2,
            }
        )
    return groups


def collect_data(projects: list[Path]) -> dict[str, Any]:
    """Build the collect ``data`` payload (discovery/warnings added by the command layer).

    Raises :class:`BadLedger` if any project's ledger is malformed (fail-closed).
    """
    per_project: list[dict[str, Any]] = []
    open_items: list[tuple[str, dict[str, Any]]] = []
    for project in projects:
        events = parse_ledger(project)
        gaps = open_gaps(events)
        per_project.append({"path": str(project), "open_gap_count": len(gaps)})
        for gap in gaps:
            open_items.append((str(project), gap))
    return {
        "projects": per_project,
        "open_gaps": [_gap_record(p, g) for p, g in open_items],
        "groups": _group_by_target(open_items),
        "caps": dict(CAPS),
    }
