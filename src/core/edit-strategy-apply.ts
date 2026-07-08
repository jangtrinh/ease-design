/**
 * LN-diff application + no-match diagnostics.
 *
 * `applyLnDiff` is the all-or-nothing patcher (returns null if any chunk fails,
 * so the caller can fall back to full regeneration). `applyLnDiffDetailed` wraps
 * it: on failure it recomputes WHICH chunks did not match and attaches a nearest
 * trimmed-match window per chunk, so the host model can repair the diff once
 * before escalating to the identity-risky `full_regen` — the cheap-recover-first
 * pattern mature coding agents (Aider) use instead of discarding a near-miss.
 *
 * Pure string analysis — no I/O, no side effects.
 */
import type { LnDiffChunk } from "./edit-strategy.js";

const FUZZY_RANGE = 5;

// ─── Application ────────────────────────────────────────────────────────────────

/**
 * Apply ln-diff chunks to an HTML string.
 *
 * - Chunks are applied bottom-up so earlier line numbers stay valid.
 * - Each chunk first attempts an exact match at `startLine`; if that fails,
 *   searches ±5 lines (fuzzy match).
 * - Returns `null` if any chunk cannot be matched — the caller should fall
 *   back to full regeneration.
 * - Returns `null` immediately if `chunks` is empty.
 */
export function applyLnDiff(html: string, chunks: LnDiffChunk[]): string | null {
  if (chunks.length === 0) return null;

  const lines = html.split("\n");
  // Bottom-up: largest startLine first preserves validity of earlier positions.
  const sorted = [...chunks].sort((a, b) => b.startLine - a.startLine);

  for (const chunk of sorted) {
    const start = chunk.startLine - 1; // convert to 0-indexed
    const end = chunk.endLine;         // exclusive splice end

    // Exact match
    const slice = lines.slice(start, end);
    const exactMatch =
      chunk.oldLines.length > 0 &&
      chunk.oldLines.every((old, i) => slice[i]?.trim() === old.trim());

    if (exactMatch) {
      // Splice exactly the verified lines (oldLines.length), NOT the header
      // range (end - start). Models routinely emit a wide `@@ line a-b @@`
      // header while quoting fewer old lines; splicing the header width would
      // silently delete the unverified trailing lines. This mirrors the fuzzy
      // path below, keeping both branches consistent.
      lines.splice(start, chunk.oldLines.length, ...chunk.newLines);
      continue;
    }

    // Fuzzy match within ±FUZZY_RANGE lines
    const searchStart = Math.max(0, start - FUZZY_RANGE);
    const searchEnd = Math.min(lines.length, end + FUZZY_RANGE);
    let found = false;

    for (let i = searchStart; i < searchEnd; i++) {
      const candidate = lines.slice(i, i + chunk.oldLines.length);
      if (
        chunk.oldLines.length > 0 &&
        chunk.oldLines.every((old, j) => candidate[j]?.trim() === old.trim())
      ) {
        lines.splice(i, chunk.oldLines.length, ...chunk.newLines);
        found = true;
        break;
      }
    }

    if (!found) return null;
  }

  return lines.join("\n");
}

// ─── Diagnostics ────────────────────────────────────────────────────────────────

export interface NearestWindow {
  /** 1-indexed line where the closest partial match begins. */
  startLine: number;
  /** The actual document lines at that window (what the model should quote). */
  lines: string[];
  /** How many of the chunk's quoted old lines matched (trim-normalised). */
  matched: number;
}

export interface UnmatchedChunk {
  startLine: number;
  endLine: number;
  oldLines: string[];
  /** Why this chunk failed to apply. */
  rule: string;
  /** Best partial-match window found anywhere in the document, or null. */
  nearest: NearestWindow | null;
}

export type ApplyResult =
  | { ok: true; html: string }
  | { ok: false; unmatched: UnmatchedChunk[] };

/** True when a chunk matches exactly at its header line or within ±FUZZY_RANGE. */
function chunkMatches(lines: string[], chunk: LnDiffChunk): boolean {
  if (chunk.oldLines.length === 0) return false;
  const start = chunk.startLine - 1;
  const searchStart = Math.max(0, start - FUZZY_RANGE);
  const searchEnd = Math.min(lines.length, chunk.endLine + FUZZY_RANGE);
  for (let i = searchStart; i < searchEnd; i++) {
    const candidate = lines.slice(i, i + chunk.oldLines.length);
    if (chunk.oldLines.every((old, j) => candidate[j]?.trim() === old.trim())) {
      return true;
    }
  }
  return false;
}

/** Build an actionable diagnostic for a chunk that failed to match. */
function diagnoseChunk(lines: string[], chunk: LnDiffChunk): UnmatchedChunk {
  const n = chunk.oldLines.length;
  let bestIdx = -1;
  let bestScore = -1;
  const anchor = chunk.startLine - 1;

  if (n > 0) {
    for (let i = 0; i + n <= lines.length; i++) {
      let score = 0;
      for (let j = 0; j < n; j++) {
        if (lines[i + j]?.trim() === chunk.oldLines[j]?.trim()) score++;
      }
      // Prefer a higher match count; break ties toward the header line.
      if (
        score > bestScore ||
        (score === bestScore && Math.abs(i - anchor) < Math.abs(bestIdx - anchor))
      ) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }

  const nearest: NearestWindow | null =
    bestIdx >= 0
      ? { startLine: bestIdx + 1, lines: lines.slice(bestIdx, bestIdx + Math.max(n, 1)), matched: bestScore }
      : null;

  const rule =
    n === 0
      ? "chunk quoted no old lines to anchor against — include the exact lines to replace with a '- ' prefix"
      : `none of the ${n} quoted old line(s) matched at line ${chunk.startLine} or within ±${FUZZY_RANGE}`;

  return {
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    oldLines: chunk.oldLines,
    rule,
    nearest,
  };
}

/**
 * Apply chunks and, on failure, return per-chunk diagnostics instead of a bare
 * null. The happy path delegates to `applyLnDiff` for exact byte-parity with the
 * existing patcher; diagnostics are computed only when it fails.
 */
export function applyLnDiffDetailed(html: string, chunks: LnDiffChunk[]): ApplyResult {
  const applied = applyLnDiff(html, chunks);
  if (applied !== null) return { ok: true, html: applied };

  const lines = html.split("\n");
  const unmatched = chunks.filter((c) => !chunkMatches(lines, c)).map((c) => diagnoseChunk(lines, c));

  // Every chunk matched in isolation yet the combined apply failed — the chunks
  // overlap or target the same lines. Re-quoting cannot help here, so give a
  // distinct rule (not diagnoseChunk's "no match" text, which would tell the
  // model to re-quote already-exact lines and waste a repair cycle).
  if (unmatched.length === 0) {
    return {
      ok: false,
      unmatched: chunks.map((c) => ({
        ...diagnoseChunk(lines, c),
        rule: "chunk matches in isolation but overlaps another chunk — regenerate rather than re-quoting",
      })),
    };
  }
  return { ok: false, unmatched };
}
