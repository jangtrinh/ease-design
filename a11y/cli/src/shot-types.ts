/**
 * Shared shapes for the `page-shot` render hand.
 *
 * These are plain data — the browser-coupled capture loop lives in `shoot.ts` (the only
 * module that imports Playwright). Keeping the shapes + the envelope/format layer browser-free
 * lets their tests build hand-made data without launching Chrome (mirrors `types.ts`).
 */

/** One successful screenshot: the target as given, the written file name, and its byte size. */
export interface ShotEntry {
  /** The target as passed (a display path or URL). */
  target: string;
  /** Output file name written under `--out` (`<stem>.png`). */
  file: string;
  /** Size of the written PNG in bytes (Buffer length). */
  bytes: number;
}

/** One target that could not be rendered — carries the failure message, never throws the batch. */
export interface ShotError {
  target: string;
  error: string;
}

/** The full render payload carried in the envelope's `data`. */
export interface ShotData {
  /** Successfully rendered targets, in input order. */
  shots: ShotEntry[];
  /** Targets that failed to render (empty on a clean run). Non-empty → the CLI exits 1. */
  errors: ShotError[];
  /** The output directory the PNGs were written into. */
  out: string;
  /** How many targets were requested (shots.length + errors.length). */
  total: number;
}
