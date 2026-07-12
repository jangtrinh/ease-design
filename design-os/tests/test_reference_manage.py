"""`design-os reference list` / `design-os reference rm` — cache inspection + safe deletion.

Neither leaf shells out to pixelshot (no ``fake_bin``/stub needed): both are pure
filesystem+index operations, so these tests build the ``references/`` layout directly on
disk (a ``<name>.png.tiles`` dir per fake capture + a hand-written ``index.json``), mirroring
the on-disk shape ``reference add`` itself produces (see test_reference_add.py).
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from design_os.cli import app


def _make_capture(refs_dir: Path, name: str, tiles: int = 1) -> None:
    """Create a fake ``<name>.png.tiles`` dir with ``tiles`` ``tile_*.jpg`` frames."""
    tile_dir = refs_dir / name
    tile_dir.mkdir(parents=True, exist_ok=True)
    for i in range(tiles):
        (tile_dir / f"tile_{i:04d}.jpg").write_bytes(b"x")


def _index_entry(name: str, tiles: int = 1) -> dict[str, object]:
    """One ``index.json`` entry in the same shape ``reference add`` writes."""
    return {"url": f"https://{name}.example", "dir": name, "tiles": tiles, "capturedAt": "2026-01-01T00:00:00+00:00"}


def _write_index(refs_dir: Path, entries: list[dict[str, object]]) -> None:
    refs_dir.mkdir(parents=True, exist_ok=True)
    (refs_dir / "index.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")


# ── reference list ──────────────────────────────────────────────────────────────────────


# ── Case 1: brand-new project (no references/ dir at all) → empty result, exit 0. ──
def test_list_empty_project_json(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["reference", "list", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "reference list"
    assert env["data"]["total"] == 0
    assert env["data"]["captures"] == []
    assert env["data"]["refsDir"] == str(tmp_path / "references")


def test_list_empty_project_text(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["reference", "list", "--project", str(tmp_path)])
    assert res.exit_code == 0
    assert res.stdout == "no references cached\n"


# ── Case 2: two real capture dirs + matching index → total 2, both present. ──
def test_list_two_captures_present_true(runner: CliRunner, tmp_path: Path) -> None:
    refs_dir = tmp_path / "references"
    _make_capture(refs_dir, "a.png.tiles", tiles=2)
    _make_capture(refs_dir, "b.png.tiles", tiles=3)
    _write_index(refs_dir, [_index_entry("a.png.tiles", 2), _index_entry("b.png.tiles", 3)])

    res = runner.invoke(app, ["reference", "list", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 0, res.stdout
    data = json.loads(res.stdout)["data"]
    assert data["total"] == 2
    assert all(c["present"] is True for c in data["captures"])
    assert {c["dir"] for c in data["captures"]} == {"a.png.tiles", "b.png.tiles"}


# ── Case 3: index entry survives a hand-deleted capture dir → present false + "!missing". ──
def test_list_missing_dir_present_false_and_text_flag(runner: CliRunner, tmp_path: Path) -> None:
    refs_dir = tmp_path / "references"
    _make_capture(refs_dir, "a.png.tiles", tiles=1)
    _write_index(refs_dir, [_index_entry("a.png.tiles")])
    shutil.rmtree(refs_dir / "a.png.tiles")  # simulate a user deleting it by hand

    json_res = runner.invoke(app, ["reference", "list", "--project", str(tmp_path), "--json"])
    assert json_res.exit_code == 0
    data = json.loads(json_res.stdout)["data"]
    assert data["total"] == 1
    assert data["captures"][0]["present"] is False

    text_res = runner.invoke(app, ["reference", "list", "--project", str(tmp_path)])
    assert text_res.exit_code == 0
    assert "!missing" in text_res.stdout
    assert "a.png.tiles (1 tiles) !missing" in text_res.stdout


# ── reference rm ─────────────────────────────────────────────────────────────────────────


# ── Case 4: happy path → dir gone from disk, index shrinks, both flags true. ──
def test_rm_happy_path_deletes_dir_and_index_entry(runner: CliRunner, tmp_path: Path) -> None:
    refs_dir = tmp_path / "references"
    _make_capture(refs_dir, "a.png.tiles", tiles=1)
    _write_index(refs_dir, [_index_entry("a.png.tiles")])

    res = runner.invoke(app, ["reference", "rm", "a.png.tiles", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 0, res.stdout
    env = json.loads(res.stdout)
    assert env["ok"] is True
    assert env["command"] == "reference rm"
    assert env["data"] == {"removed": "a.png.tiles", "dirDeleted": True, "indexUpdated": True}

    assert not (refs_dir / "a.png.tiles").exists()
    assert json.loads((refs_dir / "index.json").read_text()) == []


# ── Case 5: index entry with no dir on disk (already gone) → dirDeleted false, index still shrinks. ──
def test_rm_index_only_entry_dir_already_gone(runner: CliRunner, tmp_path: Path) -> None:
    refs_dir = tmp_path / "references"
    _write_index(refs_dir, [_index_entry("a.png.tiles")])

    res = runner.invoke(app, ["reference", "rm", "a.png.tiles", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 0, res.stdout
    data = json.loads(res.stdout)["data"]
    assert data == {"removed": "a.png.tiles", "dirDeleted": False, "indexUpdated": True}
    assert json.loads((refs_dir / "index.json").read_text()) == []


# ── Case 6: unknown name (no dir, no index entry) → NOT_FOUND, exit 1. ──
def test_rm_unknown_name_not_found(runner: CliRunner, tmp_path: Path) -> None:
    refs_dir = tmp_path / "references"
    _write_index(refs_dir, [_index_entry("keep.png.tiles")])

    res = runner.invoke(app, ["reference", "rm", "nope.png.tiles", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["command"] == "reference rm"
    assert env["error"]["code"] == "NOT_FOUND"
    # untouched: the unrelated index entry is still there.
    assert json.loads((refs_dir / "index.json").read_text()) == [_index_entry("keep.png.tiles")]


# ── Case 6b: rm against a project with no references/ dir at all → NOT_FOUND, no crash. ──
def test_rm_missing_refs_dir_is_not_found_not_crash(runner: CliRunner, tmp_path: Path) -> None:
    res = runner.invoke(app, ["reference", "rm", "whatever", "--project", str(tmp_path), "--json"])
    assert res.exit_code == 1
    assert json.loads(res.stdout)["error"]["code"] == "NOT_FOUND"


# ── Case 7: traversal-proof — every unsafe name is rejected BAD_ARG and refs dir is untouched. ──
@pytest.mark.parametrize("bad_name", ["../evil", "a/b", "", ".", ".."])
def test_rm_traversal_and_bad_names_rejected(runner: CliRunner, tmp_path: Path, bad_name: str) -> None:
    refs_dir = tmp_path / "references"
    _make_capture(refs_dir, "keep.png.tiles", tiles=1)
    _write_index(refs_dir, [_index_entry("keep.png.tiles")])
    before_dirs = sorted(p.name for p in refs_dir.iterdir())
    before_index = (refs_dir / "index.json").read_text()

    res = runner.invoke(app, ["reference", "rm", bad_name, "--project", str(tmp_path), "--json"])
    assert res.exit_code == 1
    env = json.loads(res.stdout)
    assert env["ok"] is False
    assert env["error"]["code"] == "BAD_ARG"

    # refs dir is byte-for-byte untouched: same dirs on disk, same index.json content.
    assert sorted(p.name for p in refs_dir.iterdir()) == before_dirs
    assert (refs_dir / "index.json").read_text() == before_index


# ── Case 8: text mode renders exactly one line. ──
def test_rm_text_mode_one_line(runner: CliRunner, tmp_path: Path) -> None:
    refs_dir = tmp_path / "references"
    _make_capture(refs_dir, "a.png.tiles", tiles=1)
    _write_index(refs_dir, [_index_entry("a.png.tiles")])

    res = runner.invoke(app, ["reference", "rm", "a.png.tiles", "--project", str(tmp_path)])
    assert res.exit_code == 0, res.stdout
    assert res.stdout.count("\n") == 1
    assert "a.png.tiles" in res.stdout
