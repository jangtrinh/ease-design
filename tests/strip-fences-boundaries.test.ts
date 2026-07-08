/**
 * P13 — full-document boundary hardening for strip-fences.
 *
 * Preamble/postamble prose around a COMPLETE document is absorbed;
 * fragments (no document boundary) are never touched beyond fences.
 */
import { describe, expect, it } from "vitest";
import { stripFencesDetailed, stripFences } from "../src/core/stream-parse.js";
import { run } from "../src/cli.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DOC = "<!doctype html>\n<html>\n<body><p>Hi</p></body>\n</html>";

describe("stripFencesDetailed", () => {
  it("absorbs leading prose before <!doctype", () => {
    const r = stripFencesDetailed(`Here is the page you asked for:\n\n${DOC}`);
    expect(r.html).toBe(DOC);
    expect(r.strippedLeading).toBe(true);
    expect(r.strippedTrailing).toBe(false);
  });

  it("absorbs trailing commentary after </html>", () => {
    const r = stripFencesDetailed(`${DOC}\n\nLet me know if you want changes!`);
    expect(r.html).toBe(DOC);
    expect(r.strippedTrailing).toBe(true);
    expect(r.strippedLeading).toBe(false);
  });

  it("absorbs fences AND both boundaries together", () => {
    const r = stripFencesDetailed("Sure!\n```html\n" + DOC + "\n```\nHope that helps.");
    // Fence strip runs first; prose outside the fence sits outside the doc
    // boundary and is trimmed by the boundary pass.
    expect(r.html).toBe(DOC);
    expect(r.strippedLeading).toBe(true);
  });

  it("matches <html when there is no doctype", () => {
    const noDoctype = "<html><body>x</body></html>";
    const r = stripFencesDetailed(`intro text ${noDoctype}`);
    expect(r.html).toBe(noDoctype);
    expect(r.strippedLeading).toBe(true);
  });

  it("NEVER trims a fragment (no document boundary)", () => {
    const fragment = '<div class="card">\n  <p>Component fragment</p>\n</div>';
    const r = stripFencesDetailed(`\`\`\`html\n${fragment}\n\`\`\``);
    expect(r.html).toBe(fragment);
    expect(r.strippedLeading).toBe(false);
    expect(r.strippedTrailing).toBe(false);
    expect(r.strippedFences).toBe(true);
  });

  it("clean full document passes through unchanged (idempotent)", () => {
    const r = stripFencesDetailed(DOC);
    expect(r.html).toBe(DOC);
    expect(r.strippedFences).toBe(false);
    expect(r.strippedLeading).toBe(false);
    expect(r.strippedTrailing).toBe(false);
    // Idempotence: re-running produces identical output
    expect(stripFencesDetailed(r.html).html).toBe(r.html);
  });

  it("legacy stripFences behavior is unchanged (fences only)", () => {
    expect(stripFences("```html\n<p>x</p>\n```")).toBe("<p>x</p>");
    expect(stripFences(`intro ${DOC}`)).toBe(`intro ${DOC}`);
  });
});

describe("ui strip-fences --json booleans", () => {
  function capture(args: string[]): { exitCode: number; stdout: string } {
    let stdout = "";
    const orig = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = (c: any) => { stdout += String(c); return true; };
    let exitCode: number;
    try { exitCode = run(args); } finally { process.stdout.write = orig; }
    return { exitCode, stdout };
  }

  it("reports strippedLeading/strippedTrailing in the envelope", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fences-"));
    const f = join(tmp, "raw.html");
    writeFileSync(f, `Here you go:\n${DOC}\nEnjoy!`);
    const { exitCode, stdout } = capture(["strip-fences", f, "--json"]);
    expect(exitCode).toBe(0);
    const env = JSON.parse(stdout) as {
      ok: boolean;
      data: { strippedHtml: string; strippedLeading: boolean; strippedTrailing: boolean };
    };
    expect(env.ok).toBe(true);
    expect(env.data.strippedHtml).toBe(DOC);
    expect(env.data.strippedLeading).toBe(true);
    expect(env.data.strippedTrailing).toBe(true);
  });
});
