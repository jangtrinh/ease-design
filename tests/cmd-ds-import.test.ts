/**
 * `ui ds import <tokens.json> --dir <project>` — E2E onboarding of a flat token file
 * into the DTCG DS store. Covers store creation, JSON envelope, downstream `ds a11y`
 * consumability, and every error code declared for the subcommand in DS_HELP.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

function writeFlat(dir: string, name: string, obj: unknown): string {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(obj), "utf8");
  return p;
}

const errorCode = (r: { out: string }): string => (JSON.parse(r.out) as { error: { code: string } }).error.code;

describe("ui ds import — writes the DS store", () => {
  it("converts a flat token file into design/{tokens,registry,manifest} and reports byType.color", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-"));
    const src = writeFlat(tmp, "tokens.json", {
      colors: { primary: "#3366ff", bg: "#ffffff" },
      spacing: { "space-1": 4 },
    });
    const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(r.code).toBe(0);

    const dtokens = join(tmp, "design", "design.tokens.json");
    const dregistry = join(tmp, "design", "component-registry.json");
    const dmanifest = join(tmp, "design", "ds.manifest.json");
    expect(existsSync(dtokens)).toBe(true);
    expect(existsSync(dregistry)).toBe(true);
    expect(existsSync(dmanifest)).toBe(true);

    const data = JSON.parse(r.out).data as { imported: number; byType: Record<string, number> };
    expect(data.imported).toBeGreaterThan(0);
    expect(data.byType.color).toBe(2);

    const written = JSON.parse(readFileSync(dtokens, "utf8"));
    // spec 011 P2: `ds import` bakes role recognition before sealing — "primary" is a
    // self-declaring family keyword, so it gains the annotation losslessly.
    expect(written.colors.primary).toEqual({
      $value: "#3366ff", $type: "color", $extensions: { "design-os.role": "primary" },
    });
  });
});

describe("ui ds import — downstream consumability (ds a11y)", () => {
  it("an imported store is consumable by 'ds a11y': flags a failing pair, passes a clean one", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-a11y-"));
    const src = writeFlat(tmp, "tokens.json", {
      colors: {
        "text-muted": "#8a8d95", // known AA-fail on white
        "text-strong": "#111111", // clean pass on white
        "surface-bg": "#ffffff",
      },
    });
    const imp = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(imp.code).toBe(0);

    const r = capture([
      "ds", "a11y", "--dir", tmp,
      "--pairs", "colors.text-muted:colors.surface-bg,colors.text-strong:colors.surface-bg",
      "--json",
    ]);
    expect(r.code).toBe(1); // one of the two pairs fails AA
    const data = JSON.parse(r.out).data as {
      pairs: { text: string; surface: string; passesNormalText: boolean }[];
      failures: { text: string; surface: string }[];
    };
    expect(data.pairs).toHaveLength(2);
    expect(data.failures).toHaveLength(1);
    expect(data.failures[0]?.text).toBe("colors.text-muted");
    expect(data.failures[0]?.surface).toBe("colors.surface-bg");
    const passing = data.pairs.find((p) => p.text === "colors.text-strong");
    expect(passing?.passesNormalText).toBe(true);
  });
});

describe("ui ds import — error codes", () => {
  it("missing <tokens.json> positional → BAD_ARG", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const r = capture(["ds", "import", "--dir", tmp, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("BAD_ARG");
  });

  it("nonexistent source file → FILE_NOT_FOUND", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const r = capture(["ds", "import", join(tmp, "nope.json"), "--dir", tmp, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("FILE_NOT_FOUND");
  });

  it("empty object source → EMPTY_IMPORT", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const src = writeFlat(tmp, "tokens.json", {});
    const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("EMPTY_IMPORT");
  });

  it("source with only un-typeable values → EMPTY_IMPORT", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const src = writeFlat(tmp, "tokens.json", {
      shadows: { sm: "0 1px 2px rgba(0,0,0,.04)" },
      motion: { ease: "cubic-bezier(0.4,0,0.2,1)" },
    });
    const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("EMPTY_IMPORT");
  });

  it("re-import without --force when design.tokens.json exists → EXISTS", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const src = writeFlat(tmp, "tokens.json", { colors: { primary: "#111111" } });
    capture(["ds", "import", src, "--dir", tmp, "--json"]);
    const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("EXISTS");
  });

  it("re-import with --force overwrites → exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const src = writeFlat(tmp, "tokens.json", { colors: { primary: "#111111" } });
    capture(["ds", "import", src, "--dir", tmp, "--json"]);
    const src2 = writeFlat(tmp, "tokens2.json", { colors: { primary: "#222222" } });
    const r = capture(["ds", "import", src2, "--dir", tmp, "--force", "--json"]);
    expect(r.code).toBe(0);
    const written = JSON.parse(readFileSync(join(tmp, "design", "design.tokens.json"), "utf8"));
    expect(written.colors.primary.$value).toBe("#222222");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const src = writeFlat(tmp, "tokens.json", { colors: { primary: "#111111" } });
    const r = capture(["ds", "import", src, "--dir", tmp, "--bogus", "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("UNKNOWN_FLAG");
  });

  it("--name with spaces → BAD_NAME", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-err-"));
    const src = writeFlat(tmp, "tokens.json", { colors: { primary: "#111111" } });
    const r = capture(["ds", "import", src, "--dir", tmp, "--name", "Bad Name", "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("BAD_NAME");
  });
});

describe("ui ds import — D2: --force refuses to wipe a non-empty registry (spec 009 P1)", () => {
  function seedNonEmptyRegistry(tmp: string): void {
    const src = writeFlat(tmp, "tokens.json", { colors: { primary: "#111111" } });
    capture(["ds", "import", src, "--dir", tmp, "--json"]);
    const markup = join(tmp, "markup.html");
    writeFileSync(markup, "<button>Primary</button>", "utf8");
    const registryPath = join(tmp, "design", "component-registry.json");
    capture([
      "registry", "register", "Button/Primary",
      "--category", "action", "--markup", markup, "--file", registryPath,
    ]);
  }

  it("--force over a non-empty registry fails REGISTRY_NOT_EMPTY", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-d2-"));
    seedNonEmptyRegistry(tmp);
    const src2 = writeFlat(tmp, "tokens2.json", { colors: { primary: "#222222" } });
    const r = capture(["ds", "import", src2, "--dir", tmp, "--force", "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r)).toBe("REGISTRY_NOT_EMPTY");
    const reg = JSON.parse(readFileSync(join(tmp, "design", "component-registry.json"), "utf8"));
    expect(reg.components).toHaveLength(1); // NOT wiped
  });

  it("--force --reset-registry wipes as before (the escape hatch still works)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-d2-reset-"));
    seedNonEmptyRegistry(tmp);
    const src2 = writeFlat(tmp, "tokens2.json", { colors: { primary: "#222222" } });
    const r = capture(["ds", "import", src2, "--dir", tmp, "--force", "--reset-registry", "--json"]);
    expect(r.code).toBe(0);
    const reg = JSON.parse(readFileSync(join(tmp, "design", "component-registry.json"), "utf8"));
    expect(reg.components).toHaveLength(0);
    const tokens = JSON.parse(readFileSync(join(tmp, "design", "design.tokens.json"), "utf8"));
    expect(tokens.colors.primary.$value).toBe("#222222");
  });
});

describe("ui ds import — F2: alias-valued tokens survive import (spec 009 P3 D5)", () => {
  it("test_an_alias_valued_token_imports_and_resolves", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-alias-"));
    const src = writeFlat(tmp, "tokens.json", {
      color: { "gray-900": "#181818", "text-primary": "{color.gray-900}" },
    });
    const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { imported: number; skipped: number };
    expect(data.skipped).toBe(0);
    expect(data.imported).toBe(2);

    const written = JSON.parse(readFileSync(join(tmp, "design", "design.tokens.json"), "utf8"));
    // "text-primary" recognizes via the leading text- prefix → foreground (spec 011 P2).
    expect(written.color["text-primary"]).toEqual({
      $value: "{color.gray-900}", $type: "color", $extensions: { "design-os.role": "foreground" },
    });

    const compiled = capture(["tokens", "compile", join(tmp, "design", "design.tokens.json"), "--target", "css"]);
    expect(compiled.code).toBe(0);
    expect(compiled.out).toContain("--color-text-primary: #181818");
  });

  it("test_an_alias_only_token_file_is_not_empty_import", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-alias-only-"));
    // Every token in the file is alias-valued — none of them are literals, so this
    // exercises ds-import-impl.ts:64's EMPTY_IMPORT guard on a purely-semantic file.
    const src = writeFlat(tmp, "tokens.json", {
      color: { "text-primary": "{color.gray-900}", "text-secondary": "{color.gray-700}" },
    });
    const r = capture(["ds", "import", src, "--dir", tmp, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { imported: number };
    expect(data.imported).toBe(2);
  });
});

describe("ui ds import — writes a single trailing newline (spec 009 P1 D5 fallout)", () => {
  it("design.tokens.json / component-registry.json / ds.manifest.json each end with exactly one newline", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-import-newline-"));
    const src = writeFlat(tmp, "tokens.json", { colors: { primary: "#111111" } });
    capture(["ds", "import", src, "--dir", tmp, "--json"]);
    for (const name of ["design.tokens.json", "component-registry.json", "ds.manifest.json"]) {
      const raw = readFileSync(join(tmp, "design", name), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);
    }
  });
});
