/**
 * `ui ingest-css-ds` — command shell over css-token-ingest.ts (D4, spec 009 P3).
 * Covers the happy path (writes tokens.json), error codes, and the full
 * extract-tokens → ingest-css-ds → ds import → ds status seam (UC-03 Gherkin).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

function writeExtractTokens(dir: string, customProperties: unknown[]): string {
  const p = join(dir, "t.json");
  writeFileSync(p, JSON.stringify({ colors: [], fonts: [], customProperties }), "utf8");
  return p;
}

const errorCode = (out: string): string => (JSON.parse(out) as { error: { code: string } }).error.code;

describe("ui ingest-css-ds — happy path", () => {
  it("writes a portable, unsealed tokens.json with primitives + a semantic alias", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ingest-css-"));
    const src = writeExtractTokens(tmp, [
      { name: "--gray-900", value: "#181818", sources: ["a.css:L1"], selectors: [":root"] },
      { name: "--text-primary", value: "var(--gray-900)", sources: ["a.css:L2"], selectors: [":root"] },
    ]);
    const out = mkdtempSync(join(tmpdir(), "ease-ingest-css-out-"));
    const r = capture(["ingest-css-ds", src, "--out", out, "--name", "acme", "--json"]);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.out) as { ok: boolean; data: { tokens: string; stats: { primitives: number; semantics: number } } };
    expect(env.ok).toBe(true);
    expect(env.data.stats).toEqual({ primitives: 1, semantics: 1, skipped: 0 });
    expect(existsSync(env.data.tokens)).toBe(true);
    const written = JSON.parse(readFileSync(env.data.tokens, "utf8"));
    expect(written.color["gray-900"]).toEqual({ $value: "#181818", $type: "color" });
    expect(written.color["text-primary"].$value).toBe("{color.gray-900}");
    // Unsealed — no manifest written by this command.
    expect(existsSync(join(out, "ds.manifest.json"))).toBe(false);
  });

  it("D6 (corrected): --gray-900 and --color-gray-900 coexist — no false collision", () => {
    // dana's real shape: index.css's @theme re-exports --gray-900 under Tailwind's
    // --color-* convention. Two different declared properties, two different paths.
    const tmp = mkdtempSync(join(tmpdir(), "ease-ingest-css-"));
    const src = writeExtractTokens(tmp, [
      { name: "--gray-900", value: "#181818", sources: ["dana-tokens.css:L10"], selectors: [":root"] },
      { name: "--color-gray-900", value: "var(--gray-900)", sources: ["index.css:L31"], selectors: ["@theme"] },
    ]);
    const out = mkdtempSync(join(tmpdir(), "ease-ingest-css-out-"));
    const r = capture(["ingest-css-ds", src, "--out", out, "--json"]);
    expect(r.code).toBe(0);
    const written = JSON.parse(readFileSync(join(out, "tokens.json"), "utf8"));
    expect(written.color["gray-900"]).toEqual({ $value: "#181818", $type: "color" });
    expect(written.color["color-gray-900"].$value).toBe("{color.gray-900}");
  });
});

describe("ui ingest-css-ds — error codes", () => {
  it("missing <extract-tokens.json> positional → BAD_ARG", () => {
    const r = capture(["ingest-css-ds", "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("BAD_ARG");
  });

  it("nonexistent source file → FILE_NOT_FOUND", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ingest-css-err-"));
    const r = capture(["ingest-css-ds", join(tmp, "nope.json"), "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("FILE_NOT_FOUND");
  });

  it("JSON without customProperties[] → BAD_JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ingest-css-err-"));
    const p = join(tmp, "bad.json");
    writeFileSync(p, JSON.stringify({ colors: [] }), "utf8");
    const r = capture(["ingest-css-ds", p, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("BAD_JSON");
  });

  it("a genuine sanitization collision (case-only) → LEAF_COLLISION, both source lines", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ingest-css-err-"));
    const src = writeExtractTokens(tmp, [
      { name: "--Gray-900", value: "#181818", sources: ["dana-tokens.css:L10"], selectors: [":root"] },
      { name: "--gray-900", value: "#181818", sources: ["index.css:L31"], selectors: [":root"] },
    ]);
    const r = capture(["ingest-css-ds", src, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("LEAF_COLLISION");
    expect(r.out).toContain("dana-tokens.css:L10");
    expect(r.out).toContain("index.css:L31");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-ingest-css-err-"));
    const src = writeExtractTokens(tmp, [{ name: "--x", value: "#111", sources: ["a.css:L1"], selectors: [":root"] }]);
    const r = capture(["ingest-css-ds", src, "--bogus", "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("UNKNOWN_FLAG");
  });
});

describe("ui ingest-css-ds — UC-03: extract-tokens → ingest-css-ds → ds import → ds status", () => {
  it("the semantic tier survives the whole seam and the DS seals", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-css-road-"));
    const cssPath = join(tmp, "tokens.css");
    writeFileSync(
      cssPath,
      `:root {\n  --gray-900: #181818;\n  --text-primary: var(--gray-900);\n  --bg: #ffffff;\n}\n` +
        `[data-theme="dark"] {\n  --bg: #111111;\n}\n`,
      "utf8",
    );
    const htmlPath = join(tmp, "empty.html");
    writeFileSync(htmlPath, "<html></html>", "utf8");

    const extractOut = join(tmp, "t.json");
    const extract = capture(["designmd", "extract-tokens", htmlPath, "--css", cssPath, "--out", extractOut]);
    expect(extract.code).toBe(0);

    const ingestOut = join(tmp, "vocab");
    const ingest = capture(["ingest-css-ds", extractOut, "--out", ingestOut, "--name", "acme", "--json"]);
    expect(ingest.code).toBe(0);
    const tokensPath = (JSON.parse(ingest.out) as { data: { tokens: string } }).data.tokens;

    const dsDir = join(tmp, "project");
    const imp = capture(["ds", "import", tokensPath, "--dir", dsDir, "--name", "acme", "--json"]);
    expect(imp.code, imp.out || imp.err).toBe(0);

    const status = capture(["ds", "status", "--dir", dsDir, "--json"]);
    expect(status.code).toBe(0);

    const compiled = JSON.parse(readFileSync(join(dsDir, "design", "design.tokens.json"), "utf8"));
    expect(compiled.color["text-primary"].$value).toBe("{color.gray-900}");
    // spec 011 P2: `ds import` bakes role recognition — "bg" (leading bg- prefix) also
    // gains its role annotation, merged alongside the pre-existing mode.dark extension.
    expect(compiled.color.bg.$extensions).toEqual({
      "mode.dark": { $value: "#111111" }, "design-os.role": "background",
    });

    const css = capture(["tokens", "compile", join(dsDir, "design", "design.tokens.json"), "--target", "css"]);
    expect(css.code).toBe(0);
    expect(css.out).toContain("--color-bg: #ffffff");
    expect(css.out).not.toContain("#111111");
  });
});
