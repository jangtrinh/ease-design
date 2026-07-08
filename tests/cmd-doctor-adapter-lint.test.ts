import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function captureRun(args: string[]): { code: number; out: string } {
  let out = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  process.stderr.write = () => true;
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out };
}

interface DoctorJson {
  data: { healthy: boolean; checks: { id: string; status: string; detail: string }[] };
}
const check = (j: DoctorJson, id: string) => j.data.checks.find((c) => c.id === id);

function initClaude(dir: string): void {
  const r = captureRun(["init", "--runtime", "claude", "--cwd", dir, "--json"]);
  expect(r.code, r.out).toBe(0);
}

const manifestPath = (dir: string) => join(dir, ".claude", "ease-design.json");

describe("ui doctor — adapter integrity (template-drift + wrappers)", () => {
  it("a freshly-inited project passes both new checks", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-doc-lint-"));
    initClaude(dir);
    const r = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "template-drift")?.status).toBe("pass");
    expect(check(j, "adapter-wrappers")?.status).toBe("pass");
  });

  it("a tampered template hash in the manifest fails template-drift", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-doc-drift-"));
    initClaude(dir);
    const mf = JSON.parse(readFileSync(manifestPath(dir), "utf8")) as {
      templateHashes: Record<string, string>;
    };
    mf.templateHashes["workflows/generate.md"] = "0".repeat(64); // pretend the template changed
    writeFileSync(manifestPath(dir), JSON.stringify(mf, null, 2), "utf8");

    const r = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "template-drift")?.status).toBe("fail");
    expect(check(j, "template-drift")?.detail).toContain("generate.md");
  });

  it("a deleted wrapper file fails adapter-wrappers", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-doc-wrap-"));
    initClaude(dir);
    unlinkSync(join(dir, ".claude", "commands", "ui", "generate.md"));

    const r = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("generate.md");
  });

  it("an old manifest without recorded hashes warns (does not fail)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-doc-old-"));
    initClaude(dir);
    const mf = JSON.parse(readFileSync(manifestPath(dir), "utf8")) as Record<string, unknown>;
    delete mf["templateHashes"];
    delete mf["adapters"];
    writeFileSync(manifestPath(dir), JSON.stringify(mf, null, 2), "utf8");

    const r = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(r.code).toBe(0); // warnings never fail the run
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "template-drift")?.status).toBe("warn");
    expect(check(j, "adapter-wrappers")?.status).toBe("warn");
  });
});
