import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync } from "node:fs";
import { run } from "../src/cli.js";
import { parseLnDiff, applyLnDiffDetailed } from "../src/core/edit-strategy.js";
import type { UnmatchedChunk } from "../src/core/edit-strategy.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", name);

function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

// ─── Unit: nearest-window diagnostics ────────────────────────────────────────────

const HTML = ["<a>0</a>", "<b>1</b>", "<c>2</c>", "<d>3</d>", "<e>4</e>",
  "<f>5</f>", "<g>6</g>", "<h>7</h>", "<i>8</i>", "<j>9</j>",
  "<k>10</k>", "<l>11</l>", "<m>12</m>", "<n>13</n>", "<TARGET>14</TARGET>",
  "<p>15</p>", "<q>16</q>", "<r>17</r>", "<s>18</s>", "<t>19</t>"].join("\n");

describe("applyLnDiffDetailed", () => {
  it("returns ok:true with patched html when a chunk matches", () => {
    const diff = "@@ line 1-1 @@\n- <a>0</a>\n+ <a>zero</a>\n";
    const res = applyLnDiffDetailed(HTML, parseLnDiff(diff));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.html).toContain("<a>zero</a>");
  });

  it("labels the overlapping-chunk case distinctly (not a contradictory no-match)", () => {
    // Two chunks both quote line 1; the first rewrites it, so the combined apply
    // fails even though each chunk matches the ORIGINAL in isolation.
    const diff =
      "@@ line 1-1 @@\n- <a>0</a>\n+ <a>X</a>\n@@ line 1-1 @@\n- <a>0</a>\n+ <a>Y</a>\n";
    const res = applyLnDiffDetailed(HTML, parseLnDiff(diff));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.unmatched.length).toBeGreaterThanOrEqual(1);
      const u = res.unmatched[0] as UnmatchedChunk;
      expect(u.rule).toContain("overlaps");
      expect(u.rule).not.toContain("none of"); // no self-contradiction
    }
  });

  it("reports the nearest window when the real match is out of fuzzy range", () => {
    // Header says line 2 but the quoted line actually lives at line 15 (>±5 away).
    const diff = "@@ line 2-2 @@\n- <TARGET>14</TARGET>\n+ <TARGET>changed</TARGET>\n";
    const res = applyLnDiffDetailed(HTML, parseLnDiff(diff));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.unmatched).toHaveLength(1);
      const u = res.unmatched[0] as UnmatchedChunk;
      expect(u.startLine).toBe(2);
      expect(u.nearest?.startLine).toBe(15); // 1-indexed position of <TARGET>
      expect(u.nearest?.matched).toBe(1);
      expect(u.nearest?.lines).toEqual(["<TARGET>14</TARGET>"]);
    }
  });
});

// ─── Integration: the DIFF_NO_MATCH envelope now carries diagnostics ─────────────

describe("ui edit-strategy apply — DIFF_NO_MATCH diagnostics", () => {
  it("--json carries data.unmatched[] alongside the error", () => {
    const html = join(tmpdir(), `es-diag-${process.pid}.html`);
    writeFileSync(html, "<a>1</a>\n<b>2</b>\n<c>3</c>\n", "utf8");
    const { code, out } = captureRun(["edit-strategy", "apply", html, "--diff", fix("edit-strategy/diff-no-match.txt"), "--json"]);
    expect(code).toBe(1);
    const env = JSON.parse(out) as {
      error: { code: string };
      data: { unmatched: { startLine: number; oldLines: string[]; rule: string }[] };
    };
    expect(env.error.code).toBe("DIFF_NO_MATCH");
    expect(Array.isArray(env.data.unmatched)).toBe(true);
    expect(env.data.unmatched.length).toBeGreaterThanOrEqual(1);
    expect(env.data.unmatched[0]?.startLine).toBe(5);
    expect(typeof env.data.unmatched[0]?.rule).toBe("string");
  });

  it("text mode explains the miss and points at the full-regen fallback", () => {
    const html = join(tmpdir(), `es-diag2-${process.pid}.html`);
    writeFileSync(html, "<a>1</a>\n<b>2</b>\n<c>3</c>\n", "utf8");
    const { code, err } = captureRun(["edit-strategy", "apply", html, "--diff", fix("edit-strategy/diff-no-match.txt")]);
    expect(code).toBe(1);
    expect(err).toContain("did not match");
    expect(err).toContain("full regen");
  });
});
