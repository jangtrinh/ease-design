import { describe, expect, it, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { run } from "../src/cli.js";
import { loadManifest } from "../src/core/ds-manifest.js";
import { pathsForDir, loadDesignSystem } from "../src/core/design-system.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", name);
const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

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

// ─── register — --states folds into --variants, not the dead `states` field ───
// (spec 009 P4, D3: 0/537 platform-design-system + 0/27 kit records ever populated
// `states`; it lives as `State=X` inside `variants`, kit-identical to Tone=/Size=.)

describe("ui registry register — --states → variants (spec 009 D3)", () => {
  it("test_states_flag_writes_state_axes_into_variants", () => {
    const p = tmpPath();
    const { code, out } = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--states", "hover,focus",
      "--file", p, "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      data: { component: { variants?: string[]; states?: string[] } };
    };
    expect(json.data.component.variants).toEqual(["State=Hover", "State=Focus"]);
    expect(json.data.component.states).toBeUndefined();
  });

  it("merges --variants and --states into one array, states appended after variants", () => {
    const p = tmpPath();
    const { out } = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--variants", "Variant=Primary,Size=Xs",
      "--states", "default,active",
      "--file", p, "--json",
    ]);
    const json = JSON.parse(out) as { data: { component: { variants?: string[] } } };
    expect(json.data.component.variants).toEqual([
      "Variant=Primary", "Size=Xs", "State=Default", "State=Active",
    ]);
  });

  it("invalid --states value still refuses with BAD_STATE (enum unchanged)", () => {
    const p = tmpPath();
    const { code, out } = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      "--states", "smashed",
      "--file", p, "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_STATE");
    expect(existsSync(p)).toBe(false);
  });

  it("test_a_component_records_axes_from_its_own_prop_names (D2) — --variants passes source-named axes through verbatim, no reinterpretation", () => {
    const p = tmpPath();
    const { out } = captureRun([
      "registry", "register", "Control/Button",
      "--category", "action",
      "--markup", fix("registry-markup.html"),
      // dana's own prop name is literally "variant" — the axis must stay
      // "Variant=", never rewritten to a house term like "Tone=".
      "--variants", "Variant=Primary,Variant=AccentSoft,Size=Xs,Radius=Sm",
      "--file", p, "--json",
    ]);
    const json = JSON.parse(out) as { data: { component: { variants?: string[] } } };
    expect(json.data.component.variants).toEqual([
      "Variant=Primary", "Variant=AccentSoft", "Size=Xs", "Radius=Sm",
    ]);
  });
});

// ─── register — sealed DS integration (spec 009 P1) ────────────────────────────

describe("ui registry register — sealed DS integration (spec 009 P1)", () => {
  function initDs(): string {
    const tmp = mkdtempSync(join(tmpdir(), "ease-registry-seal-"));
    captureRun([
      "ds", "init", "acme",
      "--persona", "liquid-glass", "--intent", "test", "--bare",
      "--dir", tmp, "--persona-data", PERSONA_DATA,
    ]);
    return tmp;
  }

  it("ds init → registry register → ds status exits 0", () => {
    const tmp = initDs();
    const registryPath = join(tmp, "design", "component-registry.json");
    const reg = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", fix("registry-markup.html"),
      "--file", registryPath,
    ]);
    expect(reg.code).toBe(0);
    const status = captureRun(["ds", "status", "--dir", tmp, "--json"]);
    expect(status.code).toBe(0);
  });

  it("appends a register changelog entry (kind register, by ui registry register)", () => {
    const tmp = initDs();
    const registryPath = join(tmp, "design", "component-registry.json");
    captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", fix("registry-markup.html"),
      "--file", registryPath,
    ]);
    const manifest = loadManifest(join(tmp, "design", "ds.manifest.json"));
    const last = manifest.changelog[manifest.changelog.length - 1];
    expect(last?.kind).toBe("register");
    expect(last?.by).toBe("ui registry register");
    expect(manifest.generation).toBe(2); // init = 1, register bumps to 2
  });

  it("refusing a bad token leaves the seal intact — DS still loads, registry unchanged", () => {
    const tmp = initDs();
    const registryPath = join(tmp, "design", "component-registry.json");
    const before = readFileSync(registryPath, "utf8");
    const r = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", fix("registry-markup.html"),
      "--tokens", "NOT A VALID TOKEN",
      "--file", registryPath, "--json",
    ]);
    expect(r.code).toBe(1);
    const json = JSON.parse(r.out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_TOKEN");
    expect(readFileSync(registryPath, "utf8")).toBe(before);
    expect(() => loadDesignSystem(pathsForDir(join(tmp, "design")))).not.toThrow();
  });

  // spec 009 P4 owner-correction: BAD_TOKEN was format-only (reports/p4-real-data-gate.md
  // §3) — a well-formed but INVENTED path registered cleanly. registry.ts now also checks
  // existence against the loaded DS's compiled tree (registry-token-check.ts) before saving.
  it("a well-formed but nonexistent token is refused when a DS is present — existence, not format", () => {
    const tmp = initDs();
    const registryPath = join(tmp, "design", "component-registry.json");
    const before = readFileSync(registryPath, "utf8");
    const r = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", fix("registry-markup.html"),
      "--tokens", "color.this-token-does-not-exist-anywhere",
      "--file", registryPath, "--json",
    ]);
    expect(r.code).toBe(1);
    const json = JSON.parse(r.out) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("BAD_TOKEN");
    // Distinct message from the format failure above — "does not exist", never "must match".
    expect(json.error.message).toMatch(/does not exist/);
    expect(json.error.message).not.toMatch(/must match/);
    expect(readFileSync(registryPath, "utf8")).toBe(before);
  });

  it("a token that genuinely resolves in the compiled DS is accepted", () => {
    const tmp = initDs();
    const registryPath = join(tmp, "design", "component-registry.json");
    const ds = loadDesignSystem(pathsForDir(join(tmp, "design")));
    const category = Object.keys(ds.tokens)[0]!;
    const name = Object.keys(ds.tokens[category]!)[0]!;
    const realPath = `${category}.${name}`;
    const r = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", fix("registry-markup.html"),
      "--tokens", realPath,
      "--file", registryPath, "--json",
    ]);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.out) as { data: { component: { tokensUsed: string[] } } };
    expect(json.data.component.tokensUsed).toEqual([realPath]);
  });

  it("a standalone registry (no DS next to --file) still accepts a nonexistent-but-well-formed token — format-only, unchanged", () => {
    const p = tmpPath();
    const r = captureRun([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", fix("registry-markup.html"),
      "--tokens", "color.this-token-does-not-exist-anywhere",
      "--file", p, "--json",
    ]);
    expect(r.code).toBe(0);
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
