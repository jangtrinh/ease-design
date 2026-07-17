/**
 * `ui ds-usage-lint <file.html> --dir <project>` — CLI E2E over the ENFORCEMENT
 * gate. Mirrors the mkdtempSync + design/design.tokens.json convention in
 * tests/ds-a11y.test.ts.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out, err };
}

let dir: string;
const write = (name: string, contents: string): string => {
  const p = join(dir, name);
  writeFileSync(p, contents, "utf8");
  return p;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-ds-usage-lint-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design", "design.tokens.json"), JSON.stringify({
    brand: { primary: { $value: "#3b82f6", $type: "color" } },
  }), "utf8");
});

describe("ui ds-usage-lint — the motivating probe", () => {
  it("undeclared var + hardcoded hex → exit 1, both findings reported", () => {
    const file = write("bad.html", `<html><head><style>
      .card { color: var(--totally-undeclared-token); background: #ff0000; }
    </style></head><body></body></html>`);
    const r = capture(["ds-usage-lint", file, "--dir", dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("undeclared-token");
    expect(r.out).toContain("hardcoded-color");
    expect(r.out).toContain("not a conformance claim");
  });

  it("--json reports N hardcoded / M off-system / K undeclared counts", () => {
    const file = write("bad.html", `<html><head><style>
      .card { color: var(--totally-undeclared-token); background: #ff0000; }
    </style></head><body></body></html>`);
    const r = capture(["ds-usage-lint", file, "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as {
      hardcodedColorCount: number; offSystemTokenCount: number; undeclaredTokenCount: number; errorCount: number;
    };
    expect(d.hardcodedColorCount).toBe(1);
    expect(d.undeclaredTokenCount).toBe(1);
    expect(d.offSystemTokenCount).toBe(0);
    expect(d.errorCount).toBe(2);
  });
});

describe("ui ds-usage-lint — declaration-block strip", () => {
  it("DS pasted into :root, component CSS uses only var(--dsToken) → exit 0, 0 findings", () => {
    const file = write("good.html", `<html><head><style>
      :root { --brand-primary: #3b82f6; }
      .card { color: var(--brand-primary); background: var(--brand-primary); }
    </style></head><body></body></html>`);
    const r = capture(["ds-usage-lint", file, "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { findings: unknown[] };
    expect(d.findings).toHaveLength(0);
  });
});

describe("ui ds-usage-lint — off-system-token", () => {
  it("page-declared var the DS lacks → warning, exit 0", () => {
    const file = write("warn.html", `<html><head><style>
      :root { --surface-card: var(--brand-primary); --brand-primary: #3b82f6; }
      .card { background: var(--surface-card); }
    </style></head><body></body></html>`);
    const r = capture(["ds-usage-lint", file, "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { warningCount: number; offSystemTokenCount: number };
    expect(d.warningCount).toBe(1);
    expect(d.offSystemTokenCount).toBe(1);
    expect(r.out).toContain("not in the project design system");
  });
});

describe("ui ds-usage-lint — error paths", () => {
  it("missing <file.html> → BAD_ARG", () => {
    const r = capture(["ds-usage-lint", "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("nonexistent HTML file → FILE_NOT_FOUND", () => {
    const r = capture(["ds-usage-lint", join(dir, "nope.html"), "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("FILE_NOT_FOUND");
  });

  it("no design.tokens.json under --dir → DS_NOT_FOUND", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-ds-usage-lint-empty-"));
    const file = write("good.html", "<html><body></body></html>");
    const r = capture(["ds-usage-lint", file, "--dir", empty, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DS_NOT_FOUND");
    rmSync(empty, { recursive: true, force: true });
  });

  it("malformed token JSON under --dir → BAD_JSON", () => {
    writeFileSync(join(dir, "design", "design.tokens.json"), "{not valid json", "utf8");
    const file = write("good.html", "<html><body></body></html>");
    const r = capture(["ds-usage-lint", file, "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_JSON");
  });
});

describe("ui ds-usage-lint — --help", () => {
  it("mentions the checks, options, and error codes", () => {
    const r = capture(["ds-usage-lint", "--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("undeclared-token");
    expect(r.out).toContain("off-system-token");
    expect(r.out).toContain("hardcoded-color");
    expect(r.out).toContain("--dir");
    expect(r.out).toContain("DS_NOT_FOUND");
  });
});
