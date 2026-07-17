"""Pure decision core for `design-os harvest` (spec 006 P4): report discovery, the
content-hash cursor, packet assembly, candidate JSON parsing, and the deterministic
selection gate (Decision 3 — the anti-hallucination line). No subprocess, no model call,
no wall-clock read beyond what the caller passes in. The model proposes; this disposes.

`plans/**/reports/*.md` is agent-written = UNTRUSTED input (a report can carry an
injected instruction aimed at the harvesting model). Containment is the librarian
veto-chain + human merge downstream of `knowledge/` — NOT this module's verbatim-
evidence gate, which only proves a candidate quotes something that is literally in the
report, not that the report itself is trustworthy. `strip_untrusted` below is cheap
defense-in-depth on top of that, not the boundary.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Re-exported for callers — implementations live in sibling modules to keep this one
# under the 200-line budget: parsing in harvest_parse, untrusted-input + idempotency
# helpers in harvest_ledger.
from design_os.harvest_ledger import candidate_key, ledger_candidate_keys, strip_untrusted
from design_os.harvest_parse import Candidate, HarvestError, parse_candidates

__all__ = [
    "PROMPT_VERSION", "MIN_CONFIDENCE", "MIN_TEXT", "MAX_TEXT", "MIN_EVIDENCE",
    "MAX_PER_REPORT", "MAX_REPORTS_PER_RUN", "GAP_KINDS", "DEFAULT_GLOBS",
    "HarvestError", "Report", "Candidate", "normalize", "strip_untrusted",
    "candidate_key", "ledger_candidate_keys", "discover_reports", "load_state",
    "save_state", "pending", "build_packet", "parse_candidates", "gate",
]

PROMPT_VERSION = "harvest-extract-v1"
MIN_CONFIDENCE = 0.6
MIN_TEXT, MAX_TEXT = 40, 500
MIN_EVIDENCE = 24  # normalized chars; below this an empty/near-empty quote can slip past a naive substring check
MAX_PER_REPORT = 3
MAX_REPORTS_PER_RUN = 5
GAP_KINDS = frozenset({"rubric-gap", "persona-gap", "recipe-gap", "benchmark-stale", "guardrail-lesson"})
DEFAULT_GLOBS = ("plans/**/reports/*.md",)

_STATE_REL = Path("design") / "harvest-state.json"
_TARGET_RE = re.compile(r"^[a-z0-9][a-z0-9-]*\.md(#[a-z0-9-]+)?$")
_WS_RE = re.compile(r"\s+")

@dataclass(frozen=True)
class Report:
    rel: str  # project-relative posix path — the provenance ref
    sha256: str
    text: str

def normalize(s: str) -> str:
    """Lower + collapse whitespace — shared by the evidence check and batch dedupe."""
    return _WS_RE.sub(" ", s).strip().lower()

def discover_reports(project_dir: Path, globs: Sequence[str]) -> list[Report]:
    """Resolve each glob under `project_dir`, sorted by rel path. A match that resolves
    (symlink or `..`) outside `project_dir` is dropped — the traversal guard of Decision 1."""
    base = project_dir.resolve()
    found: dict[str, Report] = {}
    for pattern in globs:
        try:
            matches = base.glob(pattern)
        except (ValueError, NotImplementedError):
            continue
        for path in matches:
            if not path.is_file():
                continue
            try:
                rel = path.resolve().relative_to(base)
            except ValueError:
                continue  # escaped project_dir
            rel_posix = rel.as_posix()
            if rel_posix not in found:
                text = path.resolve().read_text(encoding="utf-8")
                sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
                found[rel_posix] = Report(rel=rel_posix, sha256=sha, text=text)
    return [found[k] for k in sorted(found)]

def load_state(project_dir: Path) -> dict[str, Any]:
    """Read `design/harvest-state.json`; a missing/corrupt file reads as a fresh cursor."""
    default: dict[str, Any] = {"version": 1, "promptVersion": PROMPT_VERSION, "harvested": {}}
    path = project_dir / _STATE_REL
    try:
        data = json.loads(path.read_text()) if path.is_file() else None
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, dict):
        return default
    data.setdefault("version", 1)
    data.setdefault("promptVersion", PROMPT_VERSION)
    data.setdefault("harvested", {})
    return data

def save_state(project_dir: Path, state: dict[str, Any]) -> None:
    """Write the cursor: sorted keys, 2-space indent, trailing newline — byte-stable."""
    path = project_dir / _STATE_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")

def pending(
    reports: Sequence[Report], state: dict[str, Any], *, force: bool
) -> tuple[list[Report], list[Report]]:
    """Split `reports` into `(to_harvest, deferred)`. A report whose sha256 matches the cursor
    is skipped unless `force`. Capped at `MAX_REPORTS_PER_RUN`; the rest is deferred, never lost."""
    harvested = state.get("harvested", {})
    due = list(reports) if force else [
        r for r in reports if harvested.get(r.rel, {}).get("sha256") != r.sha256
    ]
    return due[:MAX_REPORTS_PER_RUN], due[MAX_REPORTS_PER_RUN:]

def build_packet(prompt: str, reports: Sequence[Report]) -> str:
    """The prompt, then one fenced block per report headed by its rel path. Each report's
    text is run through `strip_untrusted` first — reports are untrusted input."""
    parts = [prompt.rstrip(), ""]
    for r in reports:
        body = strip_untrusted(r.text)
        parts += [f"--- REPORT: {r.rel} ---", body, f"--- END REPORT: {r.rel} ---", ""]
    return "\n".join(parts).rstrip() + "\n"

def gate(
    cands: Sequence[Candidate], reports: Sequence[Report]
) -> tuple[list[Candidate], dict[str, int]]:
    """Deterministic, adversarial selection gate (Decision 3). Dedupe is within THIS batch
    only, never against the ledger (P3 D3: recurrence is signal)."""
    report_by_rel = {r.rel: r for r in reports}
    norm_reports = {rel: normalize(r.text) for rel, r in report_by_rel.items()}
    dropped: dict[str, int] = {}
    def drop(reason: str) -> None:
        dropped[reason] = dropped.get(reason, 0) + 1
    survivors: list[Candidate] = []
    seen_norm: set[str] = set()
    for c in cands:
        if c.source not in report_by_rel:
            drop("unread-source")
        elif len(normalize(c.evidence)) < MIN_EVIDENCE:
            # Must run BEFORE the substring check below: "" (and any near-empty string)
            # is a substring of every report, so an empty-evidence candidate would
            # otherwise sail through the anti-hallucination gate untouched.
            drop("evidence-too-short")
        elif normalize(c.evidence) not in norm_reports[c.source]:
            drop("evidence-not-in-source")
        elif not (c.durable and c.actionable):
            drop("not-durable-or-actionable")
        elif c.confidence < MIN_CONFIDENCE:
            drop("low-confidence")
        elif not (MIN_TEXT <= len(c.text) <= MAX_TEXT):
            drop("text-length")
        elif c.kind == "gap" and (c.target is None or not _TARGET_RE.match(c.target)):
            drop("malformed-gap-target")
        elif c.kind == "gap" and c.gap_kind not in GAP_KINDS:
            drop("unknown-gap-kind")
        elif normalize(c.text) in seen_norm:
            drop("duplicate-in-batch")
        else:
            seen_norm.add(normalize(c.text))
            survivors.append(c)
    by_report: dict[str, list[Candidate]] = {}
    for c in survivors:
        by_report.setdefault(c.source, []).append(c)
    capped: list[Candidate] = []
    for group in by_report.values():
        group_sorted = sorted(group, key=lambda c: (-c.confidence, c.text))
        capped.extend(group_sorted[:MAX_PER_REPORT])
        for _ in group_sorted[MAX_PER_REPORT:]:
            drop("per-report-cap")
    return capped, dropped
