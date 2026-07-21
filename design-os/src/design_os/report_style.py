"""Style-A report renderer — Python mirror of ``src/core/report-style.ts`` (spec 019
Phase 2). Pure str-returning helpers only: no color, no Rich, no ANSI — the ``ui``
kernel's ``never Rich`` rule (see ``envelope.py``'s module docstring) applies equally
here, since the design-os umbrella's own text renderers print straight to stdout via
``envelope.emit``.

ASCII-safe: the single ``─`` rule in ``rule_header`` is the only box-drawing character
used anywhere in this module — same discipline as the TS renderer.
"""

from __future__ import annotations

#: Static status glyphs — never an in-place spinner (mirrors report-style.ts GLYPH).
GLYPH: dict[str, str] = {"done": "✓", "warn": "!", "fail": "✗", "pending": "·"}


def rule_header(title: str, verdict: str = "", width: int = 64) -> str:
    """The style-A signature line: ``title `` + ``─`` fill + `` verdict``, so the
    whole line is ``width`` columns with the verdict right-aligned. Falls back to a
    single-space separator when title+verdict already leave no room for a rule of at
    least 1 char. Mirrors ``ruleHeader`` in report-style.ts exactly.
    """
    if verdict == "":
        if len(title) >= width:
            return title
        fill_len = width - len(title) - 1
        return f"{title} {'─' * fill_len}"
    if len(title) + len(verdict) >= width - 2:
        return f"{title} {verdict}"
    fill_len = width - len(title) - len(verdict) - 2
    return f"{title} {'─' * fill_len} {verdict}"


def check_item(state: str, label: str, hint: str | None = None) -> str:
    """A static checklist row: ``  [✓] label``, ``  [ ] label``, ``  [!] label``, or
    ``  [✗] label``. ``state`` is one of ``done``/``pending``/``warn``/``fail`` — any
    other value renders the blank ``pending`` bracket. When ``hint`` is given and the
    state isn't ``done``, a follow-up arrow line is appended below it.
    """
    if state == "done":
        bracket = GLYPH["done"]
    elif state == "warn":
        bracket = GLYPH["warn"]
    elif state == "fail":
        bracket = GLYPH["fail"]
    else:
        bracket = " "
    line = f"  [{bracket}] {label}"
    if hint is not None and state != "done":
        line += f"\n        → {hint}"
    return line


def kv(key: str, value: str, key_width: int = 8) -> str:
    """A key/value line: ``  key      value``."""
    return f"  {key.ljust(key_width)} {value}"
