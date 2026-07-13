/**
 * The machine contract + the human renderer for `page-shot`, plus the pure output-naming rule.
 *
 * Envelope shape mirrors the `ui` kernel exactly:
 *   success: {"ok": true,  "command": "page-shot", "data": {…}}
 *   failure: {"ok": false, "command": "page-shot", "error": {"code", "message"}}
 *
 * `page-shot` is a RENDERER, not an auditor — so there is no honesty/conformance wording to
 * police here (unlike `a11y-audit`). It just reports what it wrote and what it couldn't.
 */
import { basename } from "node:path";

import type { ShotData } from "./shot-types.ts";

export const COMMAND = "page-shot";

export interface OkEnvelope {
  ok: true;
  command: string;
  data: ShotData;
}

export interface ErrEnvelope {
  ok: false;
  command: string;
  error: { code: string; message: string };
}

export function okEnv(data: ShotData): OkEnvelope {
  return { ok: true, command: COMMAND, data };
}

export function errEnv(code: string, message: string): ErrEnvelope {
  return { ok: false, command: COMMAND, error: { code, message } };
}

/**
 * Output PNG stem: the input's file name with its final extension dropped
 * (`control-button.html` → `control-button`; a `ui vr gate` matches baselines by this name).
 * URL query/hash are stripped first; an extension-less or empty base falls back to `page`.
 */
export function stem(target: string): string {
  const noQueryHash = target.split(/[?#]/, 1)[0] ?? target;
  const base = basename(noQueryHash);
  const dot = base.lastIndexOf(".");
  const s = dot > 0 ? base.slice(0, dot) : base;
  return s.length > 0 ? s : "page";
}

/** Human-readable render: one `target → file (bytes)` line per shot, `! target: error` per failure. */
export function formatText(data: ShotData): string {
  const lines: string[] = [];
  for (const s of data.shots) lines.push(`page-shot: ${s.target} → ${s.file} (${s.bytes} bytes)`);
  for (const e of data.errors) lines.push(`page-shot: ! ${e.target}: ${e.error}`);
  const failed = data.errors.length > 0 ? `, ${data.errors.length} failed` : "";
  lines.push(`page-shot: ${data.shots.length}/${data.total} rendered → ${data.out}${failed}`);
  return lines.join("\n") + "\n";
}
