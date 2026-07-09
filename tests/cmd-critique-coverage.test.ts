/**
 * `ui critique-coverage` — the curator's deterministic goal-axis accounting.
 * Asserts coverage %, uncovered listing, unknownRefs, empty-spec, exit codes, errors.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
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

let dir: string;
const write = (name: string, obj: unknown): string => {
  const p = join(dir, name);
  writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj), "utf8");
  return p;
};
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-cov-")); });

const SPEC = { acceptanceCriteria: [{ id: "c1", text: "table" }, { id: "c2", text: "filters" }], successMetrics: ["find a user < 10s"] };

describe("critique-coverage — coverage accounting", () => {
  it("100% coverage → exit 0, --json coveragePct 100", () => {
    const spec = write("spec.json", SPEC);
    const manifest = write("m.json", { screens: [{ name: "List", coversCriteria: ["c1", "c2"] }] });
    const r = capture(["critique-coverage", spec, manifest, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { coveragePct: number; uncovered: string[] };
    expect(d.coveragePct).toBe(100);
    expect(d.uncovered).toEqual([]);
  });

  it("partial coverage → exit 1 + uncovered listed", () => {
    const spec = write("spec.json", SPEC);
    const manifest = write("m.json", { screens: [{ name: "List", coversCriteria: ["c1"] }] });
    const r = capture(["critique-coverage", spec, manifest, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { coveragePct: number; uncovered: string[] };
    expect(d.uncovered).toEqual(["c2"]);
    expect(d.coveragePct).toBe(50);
  });

  it("text report names the uncovered criterion", () => {
    const spec = write("spec.json", SPEC);
    const manifest = write("m.json", { screens: [{ name: "List", coversCriteria: ["c1"] }] });
    const r = capture(["critique-coverage", spec, manifest]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[c2]");
    expect(r.out).toContain("UNCOVERED");
  });

  it("empty spec → 100% (nothing to cover), exit 0", () => {
    const spec = write("spec.json", { acceptanceCriteria: [] });
    const manifest = write("m.json", { screens: [{ name: "X" }] });
    const r = capture(["critique-coverage", spec, manifest, "--json"]);
    expect(r.code).toBe(0);
    expect((JSON.parse(r.out).data as { coveragePct: number }).coveragePct).toBe(100);
  });

  it("flags unknownRefs (a screen claims a criterion the spec doesn't list)", () => {
    const spec = write("spec.json", SPEC);
    const manifest = write("m.json", { screens: [{ name: "List", coversCriteria: ["c1", "c2", "c9"] }] });
    const r = capture(["critique-coverage", spec, manifest, "--json"]);
    expect(r.code).toBe(0); // c1+c2 covered → 100%
    expect((JSON.parse(r.out).data as { unknownRefs: string[] }).unknownRefs).toEqual(["c9"]);
  });
});

describe("critique-coverage — error paths (code in --json envelope)", () => {
  const code = (args: string[]): string => {
    const r = capture([...args, "--json"]);
    expect(r.code).toBe(1);
    return (JSON.parse(r.out) as { error: { code: string } }).error.code;
  };
  it("missing positionals → BAD_ARG", () => {
    const spec = write("spec.json", SPEC);
    expect(code(["critique-coverage", spec])).toBe("BAD_ARG");
  });
  it("nonexistent file → FILE_NOT_FOUND", () => {
    const spec = write("spec.json", SPEC);
    expect(code(["critique-coverage", spec, join(dir, "nope.json")])).toBe("FILE_NOT_FOUND");
  });
  it("malformed JSON → BAD_JSON", () => {
    const spec = write("spec.json", SPEC);
    const bad = write("bad.json", "{not json");
    expect(code(["critique-coverage", spec, bad])).toBe("BAD_JSON");
  });
  it("wrong shape (no acceptanceCriteria) → BAD_JSON", () => {
    const spec = write("spec.json", { nope: true });
    const manifest = write("m.json", { screens: [] });
    expect(code(["critique-coverage", spec, manifest])).toBe("BAD_JSON");
  });
  it("wrong manifest shape (no screens) → BAD_JSON", () => {
    const spec = write("spec.json", SPEC);
    const manifest = write("m.json", { nope: true });
    expect(code(["critique-coverage", spec, manifest])).toBe("BAD_JSON");
  });
});
