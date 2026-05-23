import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "..", "scripts", "derive-personas-json.mjs");

describe("personas.json fidelity against Markdown family files", () => {
  it("derive-personas-json exits 0 with zero errors (no concept drift)", () => {
    const result = spawnSync("node", [SCRIPT], { encoding: "utf8" });
    // Print stderr on failure to make CI output actionable
    if (result.status !== 0) {
      console.error("derive-personas-json output:\n" + result.stderr);
    }
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("derive-personas-json stdout confirms all 23 personas verified", () => {
    const result = spawnSync("node", [SCRIPT], { encoding: "utf8" });
    expect(result.stdout).toContain("23 personas verified");
  });
});
