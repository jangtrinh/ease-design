/**
 * Edit-strategy selection and line-number diff logic.
 *
 * Three strategies, ordered by preference:
 *   1. deterministic — simple pattern-based edits (color/text swaps)
 *   2. ln_diff       — LLM produces a line-number diff; we apply it here
 *   3. full_regen    — complete regeneration (always works, most expensive)
 *
 * ln-diff wire format:
 *   @@ line 45-47 @@
 *   - <old line>
 *   + <new line>
 *     <context line>   (two-space prefix → copied to both old and new)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditStrategy = "deterministic" | "ln_diff" | "full_regen";

export interface LnDiffChunk {
  startLine: number;
  endLine: number;
  oldLines: string[];
  newLines: string[];
}

// ─── Strategy selection ───────────────────────────────────────────────────────

/** Patterns that indicate a small, directly-pattern-matchable edit. */
const DETERMINISTIC_PATTERNS = [
  /(?:change|make|set)\s+(?:the\s+)?(?:color|background|bg)\s+(?:to|=)\s+/i,
  /(?:change|update|replace)\s+(?:the\s+)?(?:text|title|heading|label)\s+(?:to\s+)?"[^"]{1,80}"/i,
];

/** Patterns that indicate a large structural change — skip ln-diff entirely. */
const FULL_REGEN_PATTERNS = [
  /(?:completely|entirely|whole|all|redesign|rebuild|restructure|from\s+scratch)/i,
  /(?:new\s+layout|different\s+structure|rethink|overhaul)/i,
];

/**
 * Choose the best edit strategy for a change request.
 *
 * - `deterministic` if the request matches a simple color/text pattern.
 * - `full_regen` if the request signals a major structural change.
 * - `ln_diff` otherwise (default for moderate edits).
 */
export function selectEditStrategy(changeRequest: string): EditStrategy {
  for (const pat of DETERMINISTIC_PATTERNS) {
    if (pat.test(changeRequest)) return "deterministic";
  }
  for (const pat of FULL_REGEN_PATTERNS) {
    if (pat.test(changeRequest)) return "full_regen";
  }
  return "ln_diff";
}

// ─── Line numbering ───────────────────────────────────────────────────────────

/**
 * Prefix every line with a right-aligned line number.
 * Format: `"   1| <content>"` — pad width is the digit count of the last line.
 */
export function addLineNumbers(html: string): string {
  const lines = html.split("\n");
  const pad = String(lines.length).length;
  return lines
    .map((line, i) => `${String(i + 1).padStart(pad)}| ${line}`)
    .join("\n");
}

// ─── LN-diff parser ───────────────────────────────────────────────────────────

/**
 * Parse a ln-diff string into structured chunks.
 *
 * Recognises:
 *   `- ` prefix → old line (removed)
 *   `+ ` prefix → new line (added)
 *   `  ` prefix → context line (present in both old and new)
 *
 * Returns an empty array on garbage input — never throws.
 */
export function parseLnDiff(diffOutput: string): LnDiffChunk[] {
  const chunks: LnDiffChunk[] = [];
  const chunkPattern =
    /@@\s*line\s+(\d+)(?:\s*-\s*(\d+))?\s*@@\n([\s\S]*?)(?=(?:@@\s*line)|$)/g;

  let match: RegExpExecArray | null;
  while ((match = chunkPattern.exec(diffOutput)) !== null) {
    const startLine = parseInt(match[1] ?? "0", 10);
    const endLine = match[2] !== undefined ? parseInt(match[2], 10) : startLine;
    const body = (match[3] ?? "").trimEnd();

    const oldLines: string[] = [];
    const newLines: string[] = [];

    for (const line of body.split("\n")) {
      if (line.startsWith("- ")) {
        oldLines.push(line.slice(2));
      } else if (line.startsWith("+ ")) {
        newLines.push(line.slice(2));
      } else if (line.startsWith("  ")) {
        // Context line — present in both old and new
        oldLines.push(line.slice(2));
        newLines.push(line.slice(2));
      }
    }

    if (oldLines.length > 0 || newLines.length > 0) {
      chunks.push({ startLine, endLine, oldLines, newLines });
    }
  }

  return chunks;
}

// ─── LN-diff application ──────────────────────────────────────────────────────

// The patcher and its no-match diagnostics live in edit-strategy-apply.ts to
// keep this file focused on selection/numbering/parsing. Re-exported here so the
// historical import path (`core/edit-strategy.js`) stays stable for callers/tests.
export {
  applyLnDiff,
  applyLnDiffDetailed,
} from "./edit-strategy-apply.js";
export type {
  ApplyResult,
  UnmatchedChunk,
  NearestWindow,
} from "./edit-strategy-apply.js";
