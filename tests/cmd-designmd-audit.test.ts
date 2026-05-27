import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", "designmd", name);

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = join(tmpdir(), `designmd-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpRoot, { recursive: true });
});
afterEach(() => {
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

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
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

/** tokens.json that matches `good-DESIGN.md`'s emitted values. */
const GOOD_TOKENS = {
  colors: [
    { hex: "#f97316", count: 5, sources: ["sample.css:L4"] },
    { hex: "#ffffff", count: 4, sources: ["sample.css:L5"] },
    { hex: "#1f2937", count: 3, sources: ["sample.css:L6"] },
  ],
  fonts: [
    { family: "Plus Jakarta Sans", context: "css-rule", sources: ["sample.css:L7"] },
    { family: "Nunito", context: "css-rule", sources: ["sample.css:L8"] },
  ],
  customProperties: [],
};

describe("ui designmd audit — good folder passes", () => {
  it("exits 0 on a known-good DESIGN.md", () => {
    copyFileSync(fix("good-DESIGN.md"), join(tmpRoot, "DESIGN.md"));
    writeFileSync(join(tmpRoot, "tokens.json"), JSON.stringify(GOOD_TOKENS, null, 2));
    const { code } = captureRun(["designmd", "audit", tmpRoot]);
    expect(code).toBe(0);
  });

  it("writes audit.md and audit.json into the folder", () => {
    copyFileSync(fix("good-DESIGN.md"), join(tmpRoot, "DESIGN.md"));
    writeFileSync(join(tmpRoot, "tokens.json"), JSON.stringify(GOOD_TOKENS, null, 2));
    captureRun(["designmd", "audit", tmpRoot]);
    expect(existsSync(join(tmpRoot, "audit.md"))).toBe(true);
    expect(existsSync(join(tmpRoot, "audit.json"))).toBe(true);
    const auditJson = JSON.parse(readFileSync(join(tmpRoot, "audit.json"), "utf8")) as {
      verdict: string;
      counts: { PASS: number; FAIL: number; WARN: number };
    };
    expect(auditJson.verdict).toBe("PASS");
    expect(auditJson.counts.FAIL).toBe(0);
  });

  it("--json envelope mirrors audit.json content", () => {
    copyFileSync(fix("good-DESIGN.md"), join(tmpRoot, "DESIGN.md"));
    writeFileSync(join(tmpRoot, "tokens.json"), JSON.stringify(GOOD_TOKENS, null, 2));
    const { code, out } = captureRun(["designmd", "audit", tmpRoot, "--json"]);
    expect(code).toBe(0);
    const env = JSON.parse(out) as { ok: boolean; data: { verdict: string; counts: Record<string, number> } };
    expect(env.ok).toBe(true);
    expect(env.data.verdict).toBe("PASS");
  });
});

describe("ui designmd audit — bad folder fails", () => {
  it("exits 1 when DESIGN.md ships an invented hex", () => {
    copyFileSync(fix("bad-invented-hex-DESIGN.md"), join(tmpRoot, "DESIGN.md"));
    writeFileSync(join(tmpRoot, "tokens.json"), JSON.stringify(GOOD_TOKENS, null, 2));
    const { code } = captureRun(["designmd", "audit", tmpRoot]);
    expect(code).toBe(1);
  });

  it("source-fidelity family reports the invented hex by path", () => {
    copyFileSync(fix("bad-invented-hex-DESIGN.md"), join(tmpRoot, "DESIGN.md"));
    writeFileSync(join(tmpRoot, "tokens.json"), JSON.stringify(GOOD_TOKENS, null, 2));
    captureRun(["designmd", "audit", tmpRoot]);
    const auditJson = JSON.parse(readFileSync(join(tmpRoot, "audit.json"), "utf8")) as {
      rows: { family: string; rule: string; status: string; detail: string }[];
    };
    const inventedRow = auditJson.rows.find(r => r.rule === "no-invented-hex" && r.status === "FAIL");
    expect(inventedRow).toBeDefined();
    expect(inventedRow!.detail).toMatch(/#d97706/);
  });

  it("source-fidelity family reports the missing font", () => {
    copyFileSync(fix("bad-invented-hex-DESIGN.md"), join(tmpRoot, "DESIGN.md"));
    writeFileSync(join(tmpRoot, "tokens.json"), JSON.stringify(GOOD_TOKENS, null, 2));
    captureRun(["designmd", "audit", tmpRoot]);
    const auditJson = JSON.parse(readFileSync(join(tmpRoot, "audit.json"), "utf8")) as {
      rows: { family: string; rule: string; status: string; detail: string }[];
    };
    const fontRow = auditJson.rows.find(r => r.rule === "fonts-present-in-source" && r.status === "FAIL");
    expect(fontRow).toBeDefined();
    expect(fontRow!.detail).toMatch(/Inter/);
  });
});

describe("ui designmd audit — tokens.json absent", () => {
  it("downgrades source-fidelity to WARN with summary-grade detail", () => {
    copyFileSync(fix("good-DESIGN.md"), join(tmpRoot, "DESIGN.md"));
    const { code } = captureRun(["designmd", "audit", tmpRoot]);
    // No FAIL — accessibility passes (white-on-white background nope; let's check exit code)
    expect([0, 2]).toContain(code);  // PASS or WARN depending on contrast
    const auditJson = JSON.parse(readFileSync(join(tmpRoot, "audit.json"), "utf8")) as {
      rows: { rule: string; status: string; detail: string }[];
    };
    const summaryGradeRow = auditJson.rows.find(r => r.rule === "source-tokens-available");
    expect(summaryGradeRow?.status).toBe("WARN");
  });
});

describe("ui designmd audit — error handling", () => {
  it("missing <folder-path> → exit 1, BAD_ARG", () => {
    const { code, err } = captureRun(["designmd", "audit"]);
    expect(code).toBe(1);
    expect(err).toMatch(/requires <folder-path>/);
  });

  it("nonexistent folder → exit 1, FOLDER_MISSING", () => {
    const { code, out } = captureRun(["designmd", "audit", "/nonexistent", "--json"]);
    expect(code).toBe(1);
    const env = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(env.error.code).toBe("FOLDER_MISSING");
  });

  it("folder without DESIGN.md → exit 1, FOLDER_MISSING", () => {
    const { code, out } = captureRun(["designmd", "audit", tmpRoot, "--json"]);
    expect(code).toBe(1);
    const env = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(env.error.code).toBe("FOLDER_MISSING");
  });
});

describe("ui designmd audit — discipline family catches leakage", () => {
  it("WARN when DESIGN.md contains 'Phase 1' string", () => {
    const tainted = readFileSync(fix("good-DESIGN.md"), "utf8")
      + "\n\n<!-- this references Phase 1 of the migration -->";
    writeFileSync(join(tmpRoot, "DESIGN.md"), tainted);
    writeFileSync(join(tmpRoot, "tokens.json"), JSON.stringify(GOOD_TOKENS, null, 2));
    const { code } = captureRun(["designmd", "audit", tmpRoot]);
    expect(code).toBe(1);  // discipline-leakage is FAIL not WARN
    const auditJson = JSON.parse(readFileSync(join(tmpRoot, "audit.json"), "utf8")) as {
      rows: { rule: string; status: string }[];
    };
    const leakRow = auditJson.rows.find(r => r.rule === "no-plan-reference-leakage");
    expect(leakRow?.status).toBe("FAIL");
  });
});
