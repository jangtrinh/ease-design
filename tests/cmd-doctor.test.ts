import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

// In-process CLI capture (mirrors cmd-validate-layout.test.ts).
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

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ease-doctor-"));
}

// ─── Install-level checks (always run) ──────────────────────────────────────────

describe("ui doctor — install health", () => {
  it("passes the install checks when run from the built package (exit 0)", () => {
    const { code, out } = captureRun(["doctor", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { healthy: boolean; failCount: number; checks: { id: string; status: string }[] };
    };
    expect(json.data.healthy).toBe(true);
    expect(json.data.checks.find((c) => c.id === "node-version")?.status).toBe("pass");
    expect(json.data.checks.find((c) => c.id === "templates-root")?.status).toBe("pass");
    expect(json.data.checks.find((c) => c.id === "knowledge-root")?.status).toBe("pass");
  });

  it("reports the three install checks in text mode", () => {
    const { code, out } = captureRun(["doctor"]);
    expect(code).toBe(0);
    expect(out).toContain("node-version");
    expect(out).toContain("knowledge-root");
    expect(out).toContain("All checks passed");
  });
});

// ─── Project-level checks (with --cwd) ──────────────────────────────────────────

describe("ui doctor — project checks", () => {
  it("fails project checks when the directory has no install (exit 1)", () => {
    const dir = tmp(); // empty dir, no manifest
    const { code, out } = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as {
      data: { healthy: boolean; checks: { id: string; status: string }[] };
    };
    expect(json.data.healthy).toBe(false);
    expect(json.data.checks.find((c) => c.id === "project-manifest")?.status).toBe("fail");
  });

  it("passes project checks when a valid manifest with a resolvable knowledgePath exists", () => {
    const dir = tmp();
    mkdirSync(join(dir, ".claude"), { recursive: true });
    // Point knowledgePath at the real bundled knowledge dir so it resolves.
    const realKnowledge = join(process.cwd(), "knowledge");
    writeFileSync(
      join(dir, ".claude", "ease-design.json"),
      JSON.stringify({ version: 1, runtime: "claude", status: "ready", knowledgePath: realKnowledge }),
      "utf8",
    );
    const { code, out } = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { data: { checks: { id: string; status: string }[] } };
    expect(json.data.checks.find((c) => c.id === "project-manifest")?.status).toBe("pass");
    expect(json.data.checks.find((c) => c.id === "project-knowledge")?.status).toBe("pass");
  });

  it("fails project-knowledge when the manifest knowledgePath does not resolve", () => {
    const dir = tmp();
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, ".claude", "ease-design.json"),
      JSON.stringify({ version: 1, runtime: "claude", status: "ready", knowledgePath: "/nonexistent/knowledge" }),
      "utf8",
    );
    const { code, out } = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { data: { checks: { id: string; status: string }[] } };
    expect(json.data.checks.find((c) => c.id === "project-manifest")?.status).toBe("pass");
    expect(json.data.checks.find((c) => c.id === "project-knowledge")?.status).toBe("fail");
  });

  it("fails gracefully on a malformed manifest", () => {
    const dir = tmp();
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "ease-design.json"), "{ not valid json", "utf8");
    const { code, out } = captureRun(["doctor", "--cwd", dir, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { data: { checks: { id: string; status: string }[] } };
    expect(json.data.checks.find((c) => c.id === "project-manifest")?.status).toBe("fail");
  });

  it("accepts a bare positional path as the project dir", () => {
    const dir = tmp();
    const { code } = captureRun(["doctor", dir, "--json"]);
    expect(code).toBe(1); // empty dir → project checks fail
  });
});
