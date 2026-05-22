import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { run } from "../src/cli.js";

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

// ─── Good fixture — no issues ─────────────────────────────────────────────────

describe("ui validate-layout — good fixture", () => {
  it("exits 0 with errorCount 0 in --json mode", () => {
    const { code, out } = captureRun(["validate-layout", fix("layout-good.html"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { errorCount: number; warningCount: number; findings: unknown[] };
    };
    expect(json.ok).toBe(true);
    expect(json.data.errorCount).toBe(0);
  });

  it("exits 0 in text mode and mentions 0 error(s)", () => {
    const { code, out } = captureRun(["validate-layout", fix("layout-good.html")]);
    expect(code).toBe(0);
    expect(out).toContain("0 error(s)");
  });
});

// ─── Broken fixture — error-severity findings ─────────────────────────────────

describe("ui validate-layout — broken fixture", () => {
  it("exits 1 with errorCount > 0 in --json mode", () => {
    const { code, out } = captureRun(["validate-layout", fix("layout-broken.html"), "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { errorCount: number; findings: { checkId: string; severity: string }[] };
    };
    expect(json.ok).toBe(true);        // command ran fine
    expect(json.data.errorCount).toBeGreaterThan(0);
  });

  it("findings include missing-body error", () => {
    const { out } = captureRun(["validate-layout", fix("layout-broken.html"), "--json"]);
    const json = JSON.parse(out) as { data: { findings: { checkId: string }[] } };
    expect(json.data.findings.some((f) => f.checkId === "missing-body")).toBe(true);
  });

  it("all error findings have severity 'error'", () => {
    const { out } = captureRun(["validate-layout", fix("layout-broken.html"), "--json"]);
    const json = JSON.parse(out) as { data: { findings: { checkId: string; severity: string }[] } };
    const errors = json.data.findings.filter((f) => f.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── Smells fixture — warning-only ───────────────────────────────────────────

describe("ui validate-layout — smells fixture", () => {
  it("exits 0 with warning findings and errorCount 0", () => {
    const { code, out } = captureRun(["validate-layout", fix("layout-smells.html"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      data: { errorCount: number; warningCount: number; findings: { checkId: string }[] };
    };
    expect(json.data.errorCount).toBe(0);
    expect(json.data.warningCount).toBeGreaterThan(0);
  });

  it("findings include fixed-width-overflow warning", () => {
    const { out } = captureRun(["validate-layout", fix("layout-smells.html"), "--json"]);
    const json = JSON.parse(out) as { data: { findings: { checkId: string }[] } };
    expect(json.data.findings.some((f) => f.checkId === "fixed-width-overflow")).toBe(true);
  });

  it("findings include viewport-unit-on-body warning", () => {
    const { out } = captureRun(["validate-layout", fix("layout-smells.html"), "--json"]);
    const json = JSON.parse(out) as { data: { findings: { checkId: string }[] } };
    expect(json.data.findings.some((f) => f.checkId === "viewport-unit-on-body")).toBe(true);
  });

  it("findings include img-no-dimensions warning", () => {
    const { out } = captureRun(["validate-layout", fix("layout-smells.html"), "--json"]);
    const json = JSON.parse(out) as { data: { findings: { checkId: string }[] } };
    expect(json.data.findings.some((f) => f.checkId === "img-no-dimensions")).toBe(true);
  });
});

// ─── Error paths ──────────────────────────────────────────────────────────────

describe("ui validate-layout error paths", () => {
  it("missing file --json → exit 1, FILE_NOT_FOUND", () => {
    const { code, out } = captureRun(["validate-layout", "/nonexistent-xyz.html", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("missing file arg --json → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["validate-layout", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("missing file arg text → exit 1, stderr message", () => {
    const { code, err } = captureRun(["validate-layout"]);
    expect(code).toBe(1);
    expect(err).toContain("requires a");
  });
});

// ─── --help ───────────────────────────────────────────────────────────────────

describe("ui validate-layout --help", () => {
  it("exits 0 and prints help text", () => {
    const { code, out } = captureRun(["validate-layout", "--help"]);
    expect(code).toBe(0);
    expect(out.toLowerCase()).toContain("validate-layout");
  });
});
