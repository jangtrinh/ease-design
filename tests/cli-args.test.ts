import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/core/cli-args.js";

describe("parseArgs", () => {
  it("parses command and subcommand", () => {
    const r = parseArgs(["color", "scale", "#3b82f6"]);
    expect(r.command).toBe("color");
    expect(r.subcommand).toBe("scale");
    expect(r.positionals).toEqual(["#3b82f6"]);
  });

  it("parses --json flag as boolean", () => {
    const r = parseArgs(["color", "scale", "#fff", "--json"]);
    expect(r.json).toBe(true);
    expect(r.flags["json"]).toBe(true);
  });

  it("parses --target=css as string flag", () => {
    const r = parseArgs(["tokens", "compile", "x.json", "--target=css"]);
    expect(r.flags["target"]).toBe("css");
  });

  it("parses --target css (space-separated) as string flag", () => {
    const r = parseArgs(["tokens", "compile", "x.json", "--target", "css"]);
    expect(r.flags["target"]).toBe("css");
  });

  it("parses -h as help", () => {
    const r = parseArgs(["-h"]);
    expect(r.help).toBe(true);
  });

  it("parses -v as version", () => {
    const r = parseArgs(["-v"]);
    expect(r.version).toBe(true);
  });

  it("parses --help as help", () => {
    const r = parseArgs(["--help"]);
    expect(r.help).toBe(true);
  });

  it("parses --version as version", () => {
    const r = parseArgs(["--version"]);
    expect(r.version).toBe(true);
  });

  it("treats everything after -- as positionals", () => {
    const r = parseArgs(["color", "convert", "--", "--not-a-flag"]);
    expect(r.positionals).toContain("--not-a-flag");
  });

  it("returns undefined command for empty args", () => {
    const r = parseArgs([]);
    expect(r.command).toBeUndefined();
    expect(r.subcommand).toBeUndefined();
  });

  it("full parse: color scale with json", () => {
    const r = parseArgs(["color", "scale", "#3b82f6", "--json"]);
    expect(r).toMatchObject({
      command: "color",
      subcommand: "scale",
      positionals: ["#3b82f6"],
      json: true,
    });
  });

  it("full parse: tokens compile with target flag", () => {
    const r = parseArgs(["tokens", "compile", "x.json", "--target=css"]);
    expect(r.command).toBe("tokens");
    expect(r.subcommand).toBe("compile");
    expect(r.positionals).toEqual(["x.json"]);
    expect(r.flags["target"]).toBe("css");
  });

  it("captures a negative-number value for a flag, not drops it", () => {
    // A flag followed by a negative number must store the number as the value,
    // not silently become boolean true (which would cause a misleading error downstream).
    const r = parseArgs(["color", "convert", "--oklch", "-0.6 0.2 250"]);
    expect(r.flags["oklch"]).toBe("-0.6 0.2 250");
  });

  it("treats --flag followed by another --flag as boolean true, not value", () => {
    const r = parseArgs(["color", "scale", "--json", "--help"]);
    expect(r.flags["json"]).toBe(true);
    expect(r.flags["help"]).toBe(true);
  });

  it("treats --flag followed by -h as boolean true, not a value", () => {
    const r = parseArgs(["--json", "-h"]);
    expect(r.flags["json"]).toBe(true);
    expect(r.flags["help"]).toBe(true);
  });

  it("bare - after a string flag is treated as its value (stdin sentinel)", () => {
    // `--markup -` must store "-" as the flag value, not drop it or
    // misclassify it as an unknown short option.
    const r = parseArgs(["registry", "register", "Button/Primary", "--markup", "-"]);
    expect(r.command).toBe("registry");
    expect(r.subcommand).toBe("register");
    expect(r.positionals).toEqual(["Button/Primary"]);
    expect(r.flags["markup"]).toBe("-");
  });

  it("bare - as a standalone positional is treated as a value, not an unknown flag", () => {
    // When `-` appears as the second non-flag token it is placed in the subcommand
    // slot (second positional carved out by the parser), not silently stored as a
    // spurious flag entry. Commands with hasSubcommands:false re-route it back to
    // positionals[0] in cli.ts — but the key invariant here is that no flag is set.
    const r = parseArgs(["autofix", "-"]);
    expect(r.command).toBe("autofix");
    expect(r.subcommand).toBe("-");
    expect(r.positionals).toEqual([]);
    // Must NOT appear as a spurious flag (the old behaviour was flags[""] = true)
    expect(r.flags[""]).toBeUndefined();
  });
});
