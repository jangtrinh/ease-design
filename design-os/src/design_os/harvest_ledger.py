"""Untrusted-input sanitization + partial-write idempotency for `design-os harvest`
(spec 006 P4). Split out of `harvest_core` to keep that module under the 200-line
budget. Still pure: no subprocess, no model call — sha256 + a JSONL read only.

`plans/**/reports/*.md` is agent-written = UNTRUSTED input; `strip_untrusted` is cheap
defense-in-depth on the model packet, NOT the containment boundary — that boundary is
the librarian veto-chain + human merge downstream of `knowledge/` (see harvest_core's
module docstring).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_INJECTION_LINE_RE = re.compile(r"(?im)^[ \t]*(?:SYSTEM|INSTRUCTION):.*$")
_LEDGER_REL = Path("design") / "memory.events.jsonl"


def strip_untrusted(text: str) -> str:
    """Strip HTML comments and `SYSTEM:`/`INSTRUCTION:`-prefixed lines from report text
    before it reaches the model packet — a cheap defense against a report that tries to
    prompt-inject the harvesting model."""
    return _INJECTION_LINE_RE.sub("", _HTML_COMMENT_RE.sub("", text))


def candidate_key(kind: str, text: str, source: str) -> str:
    """Content-addressed idempotency key for one candidate. A partial write can leave a
    candidate recorded in the ledger while its report's cursor never advances (Decision 4);
    on rerun the model re-proposes the same candidate — this key lets the caller recognize
    the replay and skip re-recording it, instead of manufacturing a fake recurrence."""
    return hashlib.sha256(f"{kind}\x00{text}\x00{source}".encode("utf-8")).hexdigest()


def ledger_candidate_keys(project_dir: Path) -> set[str]:
    """Every `data.harvestKey` already present in `design/memory.events.jsonl`. A
    missing or unparseable ledger (or an unparseable individual line) reads as absent —
    this is a best-effort dedupe aid, never a reason to fail the run."""
    path = project_dir / _LEDGER_REL
    keys: set[str] = set()
    if not path.is_file():
        return keys
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        key = event.get("data", {}).get("harvestKey") if isinstance(event.get("data"), dict) else None
        if isinstance(key, str):
            keys.add(key)
    return keys
