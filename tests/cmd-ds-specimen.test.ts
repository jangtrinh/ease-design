/**
 * `ui ds specimen [--dir] [--strict] [--json]` — E2E over the real CLI (`run()`).
 * Reads design/component-registry.json and reports the variant×state matrix +
 * applicable-state completeness gaps (learn-from-shadcn Phase 3). Informational
 * by default (exit 0); --strict gates (exit 1 on any warning).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

/** Registry mixing a control missing-disabled, a data leaf missing-empty, a
 * complete component, and an icon that must NOT fire (over-fire guard). */
const MIXED_REGISTRY = {
  version: "0.1.0",
  components: [
    { name: "Toolbar / Button", variants: ["Size=md", "State=Hover"] }, // missing-disabled
    { name: "Filters / Select", variants: ["State=Default"] }, // missing-empty
    { name: "Forms / Field", variants: ["State=Hover", "State=Focus", "State=Disabled"] }, // complete
    { name: "Toolbar / Close Icon", variants: ["State=Hover", "State=Pressed"] }, // must not fire
  ],
};

const CLEAN_REGISTRY = {
  version: "0.1.0",
  components: [
    { name: "Forms / Field", variants: ["State=Hover", "State=Focus", "State=Disabled"] },
  ],
};

function writeRegistry(dir: string, registry: unknown): void {
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design", "component-registry.json"), JSON.stringify(registry), "utf8");
}

const errorCode = (r: { out: string }): string => (JSON.parse(r.out) as { error: { code: string } }).error.code;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-specimen-"));
  writeRegistry(dir, MIXED_REGISTRY);
});

describe("ui ds specimen", () => {
  it("default run: exit 0, text lists the gaps, icon component never fires", () => {
    const r = capture(["ds", "specimen", "--dir", dir]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("[missing-disabled] Toolbar / Button");
    expect(r.out).toContain("[missing-empty] Filters / Select");
    expect(r.out).not.toContain("Close Icon:");
    expect(r.out).not.toContain("Forms / Field:");
  });

  it("--json envelope has stateful, warningCount, findings", () => {
    const r = capture(["ds", "specimen", "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { stateful: number; warningCount: number; findings: unknown[] };
    expect(data.stateful).toBe(4);
    expect(data.warningCount).toBe(2);
    expect(data.findings).toHaveLength(2);
  });

  it("--strict exits 1 when gaps exist", () => {
    const r = capture(["ds", "specimen", "--dir", dir, "--strict", "--json"]);
    expect(r.code).toBe(1);
  });

  it("--strict exits 0 on a clean registry (no gaps)", () => {
    const cleanDir = mkdtempSync(join(tmpdir(), "ease-specimen-clean-"));
    writeRegistry(cleanDir, CLEAN_REGISTRY);
    const r = capture(["ds", "specimen", "--dir", cleanDir, "--strict", "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { warningCount: number };
    expect(data.warningCount).toBe(0);
  });

  it("missing component-registry.json → DS_NOT_FOUND", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "ease-specimen-empty-"));
    const r = capture(["ds", "specimen", "--dir", emptyDir, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("DS_NOT_FOUND");
  });

  it("malformed registry (not {components:[...]}) → BAD_JSON", () => {
    const badDir = mkdtempSync(join(tmpdir(), "ease-specimen-bad-"));
    writeRegistry(badDir, { version: "0.1.0" }); // no 'components' array
    const r = capture(["ds", "specimen", "--dir", badDir, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("BAD_JSON");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    const r = capture(["ds", "specimen", "--dir", dir, "--bogus", "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("UNKNOWN_FLAG");
  });
});
