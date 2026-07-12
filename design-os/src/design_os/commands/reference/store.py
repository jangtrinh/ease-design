"""Reference-cache store: the ``index.json`` load helper shared by add/list/rm.

References cache at ``<project>/references/<slug>/`` (workflow-experience.md); this module
only knows how to read the ``index.json`` manifest that lives alongside those capture dirs.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _load_index(index_path: Path) -> list[dict[str, Any]]:
    """Read ``index.json`` as a list; a missing/corrupt/non-list file starts fresh (``[]``)."""
    if not index_path.exists():
        return []
    try:
        parsed = json.loads(index_path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return parsed if isinstance(parsed, list) else []
