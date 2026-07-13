/**
 * Dogfood finding L7/L8 regression guard — a FRESHLY COMPILED DS must audit clean.
 *
 * `ui ds init` emits the FULL Design-OS paired {role}/{role}-foreground vocabulary
 * (L8: background, card, muted, primary, secondary, accent, popover, sidebar,
 * sidebar-primary, sidebar-accent + the status quartet = 14 pairs) with contrast-aware
 * foregrounds, so `ui ds a11y` runs in the deterministic "paired" mode (never the legacy
 * "inferred" fallback) and reports ZERO failures across all 14 pairs. This exercises the
 * real CLI end-to-end: init → a11y --json.
 *
 * It also gates the STATE-PAIR audit (W1): every compiled DS emits primary-hover, whose
 * surface is picked contrast-aware, so ≥1 interaction-state pair is checked and it too passes.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { loadPersonaIndex } from "../src/core/persona-loader.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

function capture(args: string[]): { exitCode: number; stdout: string } {
  let stdout = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  process.stderr.write = () => true;
  let exitCode: number;
  try { exitCode = run(args); } finally { process.stdout.write = origOut; process.stderr.write = origErr; }
  return { exitCode, stdout };
}

interface A11yData { mode: string; failures: unknown[]; checkedPairs: number; checkedStatePairs: number; statePairs: unknown[]; inferred: boolean }

/** Compile a DS for `persona` into a temp dir, then run `ds a11y --json` and parse it. */
function initThenA11y(persona: string): { exitCode: number; data: A11yData } {
  const tmp = mkdtempSync(join(tmpdir(), "ease-l7-"));
  const init = capture(["ds", "init", "acme", "--persona", persona, "--intent", "audit", "--dir", tmp, "--persona-data", PERSONA_DATA, "--json"]);
  expect(init.exitCode, `init ${persona}`).toBe(0);
  const r = capture(["ds", "a11y", "--dir", tmp, "--json"]);
  return { exitCode: r.exitCode, data: JSON.parse(r.stdout).data as A11yData };
}

/** The full Design-OS paired vocabulary the compiler emits (L8). */
const EXPECTED_PAIRS = 14;

describe("compiled DS → ui ds a11y paired mode with zero failures (L7/L8)", () => {
  // Two personas from DIFFERENT families, per the acceptance criterion.
  it("saas-aurora-minimal (functional-saas): mode 'paired', 14 pairs, ≥1 state pair, 0 failures, exit 0", () => {
    // saas-aurora has a BLACK primary-foreground: its hover surface must be picked lighter
    // (not the naive 600) or the state pair fails — the exact bug W1 closes.
    const { exitCode, data } = initThenA11y("saas-aurora-minimal");
    expect(data.mode).toBe("paired");
    expect(data.inferred).toBe(false);
    expect(data.checkedPairs).toBe(EXPECTED_PAIRS);
    expect(data.checkedStatePairs).toBeGreaterThanOrEqual(1);
    expect(data.failures).toHaveLength(0);
    expect(exitCode).toBe(0);
  });

  it("liquid-glass (material-surface): mode 'paired', 14 pairs, ≥1 state pair, 0 failures, exit 0", () => {
    const { exitCode, data } = initThenA11y("liquid-glass");
    expect(data.mode).toBe("paired");
    expect(data.inferred).toBe(false);
    expect(data.checkedPairs).toBe(EXPECTED_PAIRS);
    expect(data.checkedStatePairs).toBeGreaterThanOrEqual(1);
    expect(data.failures).toHaveLength(0);
    expect(exitCode).toBe(0);
  });

  // Stronger guarantee: EVERY persona compiles to a clean paired audit over all 14 pairs —
  // the contrast-aware picker must never leave a sub-AA foreground for any brand hue.
  it("every persona in the index compiles to paired mode, 14 pairs, ≥1 state pair, 0 a11y failures", () => {
    for (const p of loadPersonaIndex(PERSONA_DATA)) {
      const { exitCode, data } = initThenA11y(p.slug);
      expect(data.mode, `${p.slug} mode`).toBe("paired");
      expect(data.checkedPairs, `${p.slug} pairs`).toBe(EXPECTED_PAIRS);
      // Every persona ships primary-hover → its state pair is checked and must also pass.
      expect(data.checkedStatePairs, `${p.slug} state pairs`).toBeGreaterThanOrEqual(1);
      expect(data.failures, `${p.slug} failures`).toHaveLength(0);
      expect(exitCode, `${p.slug} exit`).toBe(0);
    }
  });
});
