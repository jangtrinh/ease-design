import { describe, expect, it, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync, readFileSync } from "node:fs";
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

const tmpFiles: string[] = [];
function tmpPath(): string {
  const p = join(
    tmpdir(),
    `registry-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  for (const p of tmpFiles) {
    if (existsSync(p)) unlinkSync(p);
  }
  tmpFiles.length = 0;
});

// ─── register ─────────────────────────────────────────────────────────────────

describe("ui registry register", () => {
  it("creates registry file and exits 0", () => {
    const p = tmpPath();
    const { code } = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--tokens", "color.primary,space.4",
      "--file", p,
    ]);
    expect(code).toBe(0);
    expect(existsSync(p)).toBe(true);
  });

  it("written file conforms: has version, components array, name pattern", () => {
    const p = tmpPath();
    captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--file", p,
    ]);
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      version: string;
      components: { name: string; category: string; markup: string; tokensUsed: string[] }[];
    };
    expect(typeof raw.version).toBe("string");
    expect(Array.isArray(raw.components)).toBe(true);
    expect(raw.components[0]?.name).toBe("Button/Primary");
    expect(/^[A-Z][A-Za-z]+\/[A-Z][A-Za-z]+$/.test(raw.components[0]?.name ?? "")).toBe(true);
  });

  it("--json mode returns ok:true with component and replaced:false", () => {
    const p = tmpPath();
    const { code, out } = captureRun([
      "registry", "register", "Card/Pricing",
      "--category", "layout",
      "--markup", fix("registry-markup.html"),
      "--file", p, "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { component: { name: string }; replaced: boolean };
    };
    expect(json.ok).toBe(true);
    expect(json.data.component.name).toBe("Card/Pricing");
    expect(json.data.replaced).toBe(false);
  });

  it("bad name (lowercase) → exit 1, BAD_NAME", () => {
    const p = tmpPath();
    const { code, out } = captureRun([
      "registry", "register", "button/primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--file", p, "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("BAD_NAME");
  });

  it("duplicate name without --force → exit 1, NAME_EXISTS", () => {
    const p = tmpPath();
    const base = [
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--file", p,
    ];
    captureRun(base);
    const { code, out } = captureRun([...base, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NAME_EXISTS");
  });

  it("duplicate name with --force → exit 0, replaced:true", () => {
    const p = tmpPath();
    const base = [
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--file", p,
    ];
    captureRun(base);
    const { code, out } = captureRun([...base, "--force", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { replaced: boolean } };
    expect(json.ok).toBe(true);
    expect(json.data.replaced).toBe(true);
  });

  it("missing --markup flag → exit 1, BAD_ARG", () => {
    const p = tmpPath();
    const { code, out } = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--file", p, "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("missing --category flag → exit 1, BAD_ARG", () => {
    const p = tmpPath();
    const { code, out } = captureRun([
      "registry", "register", "Button/Primary",
      "--markup", fix("registry-markup.html"),
      "--file", p, "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("nonexistent --markup file → exit 1, FILE_NOT_FOUND", () => {
    const p = tmpPath();
    const { code, out } = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", "/nonexistent-markup-xyz.html",
      "--file", p, "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

});

// ─── lookup ───────────────────────────────────────────────────────────────────

describe("ui registry lookup", () => {
  it("returns full record for existing component", () => {
    const { code, out } = captureRun([
      "registry", "lookup", "Button/Primary",
      "--file", fix("registry-valid.json"), "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { component: { name: string } } };
    expect(json.ok).toBe(true);
    expect(json.data.component.name).toBe("Button/Primary");
  });

  it("absent name → exit 1, NOT_FOUND", () => {
    const { code, out } = captureRun([
      "registry", "lookup", "Nope/Thing",
      "--file", fix("registry-valid.json"), "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("missing registry file → exit 1, REGISTRY_NOT_FOUND", () => {
    const { code, out } = captureRun([
      "registry", "lookup", "Button/Primary",
      "--file", "/nonexistent-registry-xyz.json", "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("REGISTRY_NOT_FOUND");
  });

  it("malformed registry file → exit 1, BAD_REGISTRY", () => {
    const { code, out } = captureRun([
      "registry", "lookup", "Button/Primary",
      "--file", fix("registry-bad.json"), "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_REGISTRY");
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe("ui registry list", () => {
  it("returns all components in --json mode", () => {
    const { code, out } = captureRun([
      "registry", "list",
      "--file", fix("registry-valid.json"), "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { count: number; components: { name: string; category: string }[] };
    };
    expect(json.ok).toBe(true);
    expect(json.data.count).toBe(2);
    expect(json.data.components).toHaveLength(2);
  });

  it("--category filter returns only matching components", () => {
    const { out } = captureRun([
      "registry", "list",
      "--category", "action",
      "--file", fix("registry-valid.json"), "--json",
    ]);
    const json = JSON.parse(out) as { data: { components: { category: string }[] } };
    expect(json.data.components.every((c) => c.category === "action")).toBe(true);
    expect(json.data.components.length).toBeGreaterThan(0);
  });

  it("unknown category returns empty list, exit 0", () => {
    const { code, out } = captureRun([
      "registry", "list",
      "--category", "nonexistent",
      "--file", fix("registry-valid.json"), "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { data: { count: number } };
    expect(json.data.count).toBe(0);
  });

  it("missing registry file → exit 1, REGISTRY_NOT_FOUND", () => {
    const { code, out } = captureRun([
      "registry", "list",
      "--file", "/nonexistent-registry-xyz.json", "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("REGISTRY_NOT_FOUND");
  });

  it("text mode lists component names", () => {
    const { code, out } = captureRun([
      "registry", "list",
      "--file", fix("registry-valid.json"),
    ]);
    expect(code).toBe(0);
    expect(out).toContain("Button/Primary");
    expect(out).toContain("Card/Pricing");
  });
});

// ─── No subcommand / --help ───────────────────────────────────────────────────

describe("ui registry no subcommand and --help", () => {
  it("bare 'ui registry' → exit 1", () => {
    const { code } = captureRun(["registry"]);
    expect(code).toBe(1);
  });

  it("'ui registry --help' → exit 0", () => {
    const { code, out } = captureRun(["registry", "--help"]);
    expect(code).toBe(0);
    expect(out.toLowerCase()).toContain("registry");
  });
});
