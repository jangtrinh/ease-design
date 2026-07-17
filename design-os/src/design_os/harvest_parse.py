"""Model-output parsing for `design-os harvest` (spec 006 P4) — split out of
`harvest_core` to keep that module under the 200-line budget. Turns a raw model turn
into typed `Candidate`s, or raises `HarvestError` on anything that is not the documented
envelope shape (prose, malformed JSON, a missing/mistyped field).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

_FENCE_RE = re.compile(r"^```(?:json)?\s*\n(.*)\n```\s*$", re.DOTALL)


class HarvestError(Exception):
    """A model output that cannot be trusted — never a bare exception (`code` for the envelope)."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class Candidate:
    kind: str  # "insight" | "gap"
    text: str
    evidence: str
    source: str
    durable: bool
    actionable: bool
    confidence: float
    target: str | None = None  # required iff kind == "gap"
    gap_kind: str | None = None  # required iff kind == "gap"


def parse_candidates(raw: str) -> list[Candidate]:
    """Strip an optional ```json fence, parse, validate the envelope shape. Raises
    :class:`HarvestError` (`BAD_CANDIDATES`) on prose/malformed/missing-field input — never
    a bare exception. An empty `candidates` list is a valid answer."""
    text = raw.strip()
    m = _FENCE_RE.match(text)
    if m:
        text = m.group(1).strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as e:
        raise HarvestError("BAD_CANDIDATES", f"model output is not valid JSON: {e}") from e
    if not isinstance(payload, dict) or not isinstance(payload.get("candidates"), list):
        raise HarvestError("BAD_CANDIDATES", "expected an object with a 'candidates' array")
    candidates: list[Candidate] = []
    for i, c in enumerate(payload["candidates"]):
        if not isinstance(c, dict):
            raise HarvestError("BAD_CANDIDATES", f"candidate {i} is not an object")
        try:
            kind, ctext = str(c["kind"]), str(c["text"])
            evidence, source = str(c["evidence"]), str(c["source"])
            durable, actionable = bool(c["durable"]), bool(c["actionable"])
            confidence = float(c["confidence"])
        except KeyError as e:
            raise HarvestError("BAD_CANDIDATES", f"candidate {i} missing field {e}") from e
        except (TypeError, ValueError) as e:
            raise HarvestError("BAD_CANDIDATES", f"candidate {i} malformed field: {e}") from e
        target, gap_kind = c.get("target"), c.get("gapKind")
        candidates.append(Candidate(
            kind=kind, text=ctext, evidence=evidence, source=source,
            durable=durable, actionable=actionable, confidence=confidence,
            target=str(target) if target is not None else None,
            gap_kind=str(gap_kind) if gap_kind is not None else None,
        ))
    return candidates
