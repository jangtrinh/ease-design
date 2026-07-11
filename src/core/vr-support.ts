/**
 * Pure helpers for `ui vr` (DESIGN-OS T5): mask parsing, threshold clamping, and
 * per-file gate verdicts. No IO here — the command module reads/writes files.
 */
import type { Mask } from "./snapshot-diff.js";

/** Parse a `--mask "x,y,w,h;x,y,w,h"` string into rectangles. Throws on malformed input. */
export function parseMasks(spec: string): Mask[] {
  const out: Mask[] = [];
  for (const part of spec.split(";").map((s) => s.trim()).filter(Boolean)) {
    const nums = part.split(",").map((n) => Number(n.trim()));
    if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n) || n < 0)) {
      throw new Error(`bad --mask rectangle '${part}' (expected "x,y,w,h" with non-negative numbers)`);
    }
    const [x, y, w, h] = nums as [number, number, number, number];
    out.push({ x, y, w, h });
  }
  return out;
}

/** Parse a 0–1 numeric flag; throws with the flag name on a bad value. */
export function parseUnit(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`--${flag} must be a number between 0 and 1 (got '${value}')`);
  return n;
}

export type GateStatus = "ok" | "changed" | "size" | "missing-current" | "new";
export interface GateEntry {
  name: string;
  status: GateStatus;
  diffPixels?: number;
  diffRatio?: number;
  detail?: string;
}

/** A gate entry is a failure (exit 1) unless it merely passed or is a not-yet-accepted new baseline. */
export function isRegression(e: GateEntry): boolean {
  return e.status === "changed" || e.status === "size" || e.status === "missing-current";
}

const GLYPH: Record<GateStatus, string> = {
  ok: "✓", changed: "✗", size: "✗", "missing-current": "✗", new: "!",
};

export function formatGateLine(e: GateEntry): string {
  const head = `  ${GLYPH[e.status]} ${e.name}`;
  switch (e.status) {
    case "ok": return `${head} — match`;
    case "changed": return `${head} — ${e.diffPixels} px differ (${((e.diffRatio ?? 0) * 100).toFixed(2)}%)`;
    case "size": return `${head} — ${e.detail ?? "dimensions differ"}`;
    case "missing-current": return `${head} — baseline has no matching current render`;
    case "new": return `${head} — new render, no baseline yet (run 'ui vr accept')`;
  }
}
