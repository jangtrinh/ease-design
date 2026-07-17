/**
 * reseal (spec 009 P1, D1) — the shared Art IV ceremony extracted from
 * ds-change-token-impl.ts. Fixture: `ds init` builds a real sealed DS on disk; these
 * tests call reseal() directly and verify via loadDesignSystem/loadManifest. The CLI
 * round-trip (register/reconcile/change-token → ds status) is covered separately by
 * tests/cmd-registry.test.ts, tests/cmd-figma-reconcile*.test.ts, tests/cmd-ds-change-token.test.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { pathsForDir, loadDesignSystem } from "../src/core/design-system.js";
import { loadManifest, DSManifestError } from "../src/core/ds-manifest.js";
import { reseal } from "../src/core/ds-reseal.js";
import type { TokenTree } from "../src/core/token-model.js";
import type { Registry } from "../src/core/registry-store.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

function capture(args: string[]): void {
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (() => true) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (() => true) as any;
  try { run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
}

/** A real sealed DS on disk (via `ds init --bare`) — the fixture every test loads. */
function initFixture(): string {
  const tmp = mkdtempSync(join(tmpdir(), "ease-reseal-"));
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass", "--intent", "test", "--bare",
    "--dir", tmp, "--persona-data", PERSONA_DATA,
  ]);
  return tmp;
}

describe("reseal", () => {
  it("bumps generation and rehashes only what changed (tokens-only)", () => {
    const tmp = initFixture();
    const paths = pathsForDir(join(tmp, "design"));
    const ds = loadDesignSystem(paths);
    const before = ds.manifest;

    const newTokens: TokenTree = {
      ...ds.tokens,
      color: { ...ds.tokens["color"], primary: { $type: "color", $value: "#123456" } },
    };
    const result = reseal({
      ds, paths, tokens: newTokens, nowIso: "2026-01-01T00:00:00.000Z",
      entry: { kind: "change-token", by: "ui ds change-token", path: "color.primary" },
    });

    expect(result.generation).toBe(before.generation + 1);
    expect(result.compiledHash).not.toBe(before.compiledHash);
    expect(result.registryHash).toBe(before.registryHash); // untouched — no registry passed

    const onDisk = loadManifest(paths.manifest);
    expect(onDisk.generation).toBe(result.generation);
    expect(onDisk.compiledHash).toBe(result.compiledHash);
    expect(onDisk.registryHash).toBe(before.registryHash);
  });

  it("appends the caller's changelog entry", () => {
    const tmp = initFixture();
    const paths = pathsForDir(join(tmp, "design"));
    const ds = loadDesignSystem(paths);

    reseal({
      ds, paths, registry: ds.registry, nowIso: "2026-01-01T00:00:00.000Z",
      entry: { kind: "register", by: "ui registry register", note: "Button/Primary" },
    });

    const onDisk = loadManifest(paths.manifest);
    const last = onDisk.changelog[onDisk.changelog.length - 1];
    expect(last?.kind).toBe("register");
    expect(last?.by).toBe("ui registry register");
    expect(last?.note).toBe("Button/Primary");
    expect(last?.ts).toBe("2026-01-01T00:00:00.000Z");
    expect(onDisk.changelog).toHaveLength(ds.manifest.changelog.length + 1);
  });

  it("a half-commit reports recover-or-explain and does not leave a silent stale seal", () => {
    const tmp = initFixture();
    const paths = pathsForDir(join(tmp, "design"));
    const ds = loadDesignSystem(paths);

    const changedRegistry: Registry = {
      version: ds.registry.version,
      components: [{ name: "Button/Test", category: "action", markup: "<a></a>", tokensUsed: [], scope: "local" }],
    };
    // Point 'manifest' at the design/ directory itself — an existing directory, so the
    // final renameSync(tmp, manifest) fails deterministically (EISDIR) after the
    // registry write already committed. Models "content landed, manifest didn't."
    const brokenPaths = { ...paths, manifest: join(tmp, "design") };

    let caught: unknown;
    try {
      reseal({
        ds, paths: brokenPaths, registry: changedRegistry, nowIso: "2026-01-01T00:00:00.000Z",
        entry: { kind: "register", by: "ui registry register", note: "Button/Test" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DSManifestError);
    expect((caught as DSManifestError).code).toBe("WRITE_ERROR");
    expect((caught as DSManifestError).message).toMatch(/recover/i);

    // The registry DID commit; the manifest did not — so the OLD manifest now names a
    // registryHash the live file no longer matches. Never silent: the very next load
    // catches it loudly as DS_TAMPERED, not a stale seal nobody notices.
    expect(() => loadDesignSystem(paths)).toThrow(/DS_TAMPERED|hash mismatch/);
  });

  it("is byte-stable for the same input (Art I)", () => {
    const tmp = initFixture();
    const paths = pathsForDir(join(tmp, "design"));
    const ds = loadDesignSystem(paths);
    const input = {
      ds, paths, registry: ds.registry, nowIso: "2026-01-01T00:00:00.000Z",
      entry: { kind: "register" as const, by: "ui registry register", note: "x" },
    };

    reseal(input);
    const first = readFileSync(paths.manifest, "utf8");
    reseal(input); // same pre-mutation `ds` snapshot, same entry, same clock
    const second = readFileSync(paths.manifest, "utf8");

    expect(second).toBe(first);
  });
});
