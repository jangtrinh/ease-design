/**
 * Filesystem write engine for adapter artifacts.
 *
 * Handles two write modes:
 *   "write"          — create or overwrite a file at absPath with content.
 *   "upsert-section" — insert/replace a sentinel-delimited block inside a
 *                      host file (e.g. AGENTS.md). Appends at EOF when the
 *                      file exists but the block is absent.
 *
 * All-or-nothing contract: on any write failure, every file written during
 * this call is deleted (or restored to its pre-call snapshot) before the
 * error is re-thrown. Best-effort: a rollback unlink failure is logged to
 * stderr but does not change the error code.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { AdapterArtifact } from "../adapters/index.js";

// ─── Error type ───────────────────────────────────────────────────────────────

export class AdapterWriteError extends Error {
  constructor(
    public readonly code: "MANIFEST_EXISTS" | "WRITE_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "AdapterWriteError";
  }
}

// ─── Sentinel block finder ────────────────────────────────────────────────────

/**
 * Locate a sentinel-delimited block inside `content`.
 *
 * Returns the character offsets (inclusive of both sentinel lines) or null
 * when the begin sentinel is absent.
 */
export function findSentinelBlock(
  content: string,
  begin: string,
  end: string,
): { start: number; end: number } | null {
  const startIdx = content.indexOf(begin);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(end, startIdx + begin.length);
  if (endIdx === -1) return null;
  return { start: startIdx, end: endIdx + end.length };
}

// ─── Write result ─────────────────────────────────────────────────────────────

export interface ArtifactWriteResult {
  path: string;
  written: boolean;
  replaced: boolean;
}

// ─── Writer ───────────────────────────────────────────────────────────────────

/**
 * Write all adapter artifacts to the filesystem.
 *
 * Write order:
 *   1. "write" artifacts sorted alphabetically by absPath.
 *   2. "upsert-section" artifacts last (only Codex uses them; at most one).
 *
 * @throws AdapterWriteError("MANIFEST_EXISTS", …) when a target already exists
 *         and force is false.
 * @throws AdapterWriteError("WRITE_ERROR", …) on any I/O failure; rolls back
 *         all writes from this call before throwing.
 */
export function writeAdapterArtifacts(
  artifacts: AdapterArtifact[],
  opts: { force: boolean },
): ArtifactWriteResult[] {
  const { force } = opts;

  // ── Step 1: sort — "write" alphabetically, then "upsert-section" ──────────
  const sorted = [...artifacts].sort((a, b) => {
    if (a.mode === b.mode) return a.absPath.localeCompare(b.absPath);
    return a.mode === "write" ? -1 : 1;
  });

  // ── Step 2: snapshot pre-existing content ─────────────────────────────────
  // Map absPath → original content buffer, or null when the file was absent.
  // Every artifact path is inserted so `wasPresent` can assert completeness.
  const snapshots = new Map<string, Buffer | null>();

  for (const art of sorted) {
    if (existsSync(art.absPath)) {
      snapshots.set(art.absPath, readFileSync(art.absPath));
    } else {
      snapshots.set(art.absPath, null);
    }
  }

  /**
   * Return true when the path existed before this write session.
   * Asserts the snapshot entry is present — if it is missing, a caller
   * bypassed Step 2, which is a programming error.
   */
  function wasPresent(absPath: string): boolean {
    if (!snapshots.has(absPath)) {
      throw new Error(
        `adapter-writer: no snapshot for '${absPath}' — step 2 was skipped`,
      );
    }
    return snapshots.get(absPath) !== null;
  }

  // ── Step 3: collision check ────────────────────────────────────────────────
  if (!force) {
    const conflicts: string[] = [];

    for (const art of sorted) {
      if (art.mode === "write") {
        if (wasPresent(art.absPath)) {
          conflicts.push(art.absPath);
        }
      } else {
        // upsert-section: conflict iff the host file exists AND has the sentinel
        if (wasPresent(art.absPath)) {
          const snap = snapshots.get(art.absPath) as Buffer;
          const existing = snap.toString("utf8");
          if (findSentinelBlock(existing, art.sentinelBegin, art.sentinelEnd) !== null) {
            conflicts.push(art.absPath);
          }
        }
      }
    }

    if (conflicts.length > 0) {
      const listed = conflicts.map((p) => `'${p}'`).join(", ");
      const msg =
        conflicts.length === 1
          ? `adapter file already exists: ${listed} (use --force to overwrite)`
          : `adapter files already exist: ${listed} (use --force to overwrite)`;
      throw new AdapterWriteError("MANIFEST_EXISTS", msg);
    }
  }

  // ── Step 4: sequential write with rollback on failure ─────────────────────
  const results: ArtifactWriteResult[] = [];
  const writtenThisRun: string[] = [];

  for (const art of sorted) {
    const existedBefore = wasPresent(art.absPath);

    try {
      if (art.mode === "write") {
        mkdirSync(dirname(art.absPath), { recursive: true });
        writeFileSync(art.absPath, art.content, "utf8");
        if (art.executable === true) chmodSync(art.absPath, 0o755);
        writtenThisRun.push(art.absPath);
        results.push({ path: art.absPath, written: true, replaced: existedBefore });
      } else {
        // upsert-section
        const snap = snapshots.get(art.absPath) ?? null;
        const hostContent = snap !== null ? snap.toString("utf8") : "";
        const blockRange = findSentinelBlock(
          hostContent,
          art.sentinelBegin,
          art.sentinelEnd,
        );

        let newContent: string;
        let replaced: boolean;

        if (blockRange !== null) {
          // Replace existing block in place; preserve surrounding content exactly.
          newContent =
            hostContent.slice(0, blockRange.start) +
            art.content +
            hostContent.slice(blockRange.end);
          replaced = true;
        } else if (hostContent.length > 0) {
          // Append at EOF separated by a single blank line.
          newContent = hostContent.trimEnd() + "\n\n" + art.content + "\n";
          replaced = false;
        } else {
          // New file: write the block directly.
          newContent = art.content + "\n";
          replaced = false;
        }

        mkdirSync(dirname(art.absPath), { recursive: true });
        writeFileSync(art.absPath, newContent, "utf8");
        writtenThisRun.push(art.absPath);
        results.push({ path: art.absPath, written: true, replaced });
      }
    } catch (e) {
      // Rollback all writes from this run.
      for (const p of writtenThisRun) {
        try {
          const snap = snapshots.get(p) ?? null;
          if (snap === null) {
            // File did not exist before; delete it.
            if (existsSync(p)) unlinkSync(p);
          } else {
            // File existed before; restore original content.
            writeFileSync(p, snap);
          }
        } catch (rollbackErr) {
          process.stderr.write(
            `ui: rollback failed for '${p}': ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}\n`,
          );
        }
      }
      const msg = `cannot write '${art.absPath}': ${e instanceof Error ? e.message : String(e)}`;
      throw new AdapterWriteError("WRITE_ERROR", msg);
    }
  }

  return results;
}
