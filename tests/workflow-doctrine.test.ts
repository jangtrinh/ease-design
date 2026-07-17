/**
 * Workflow doctrine checks — the Art II pairing for spec 009 D3.
 *
 * `states` on a ComponentRecord is a dead field: 0/537 populated in
 * platform-design-system, 0/27 in the `ds init` kit. The only place it was ever
 * mandated was workflow prose (`extract.md`, `learn.md`) telling the host model to
 * populate `--states` as a first-class record field. This test is the check that
 * fails if that doctrine regresses — a standard needs an emitter AND a linter
 * (constitution Art II); `registry.ts`/`registry-store.ts` are the emitter side
 * (`statesToVariants`), this is the linter side for the prose that could
 * re-introduce the mandate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOWS_DIR = join(REPO_ROOT, "templates", "workflows");

/**
 * A workflow "mandates" the dead field when it tells the host model to write a
 * bare `states:` key onto a component record (the pre-D3 doctrine), as opposed
 * to documenting that `--states` folds into `variants` as `State=X` (the
 * corrected doctrine, which mentions "states" freely — this check only rejects
 * the specific dead-field framing, not the word).
 */
const DEAD_FIELD_MANDATE = /\bstates\s*:\s*<|record'?s?\s+`?states`?\s+field\s+(?:is|must be)\s+populated|write\s+(?:a\s+)?`?states`?\s+field/i;

describe("workflow doctrine — no workflow mandates the dead `states` field (spec 009 D3)", () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".md"));

  it("scans every templates/workflows/*.md file (sanity: extract.md and learn.md are present)", () => {
    expect(files).toContain("extract.md");
    expect(files).toContain("learn.md");
  });

  for (const file of files) {
    it(`${file} does not mandate a bare 'states:' record field`, () => {
      const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      expect(DEAD_FIELD_MANDATE.test(content)).toBe(false);
    });
  }

  it("extract.md documents that --states folds into variants as State=X, not the states field", () => {
    const content = readFileSync(join(WORKFLOWS_DIR, "extract.md"), "utf8");
    expect(content).toMatch(/State=<PascalCase>/);
    expect(content).toMatch(/states.*field.*(?:unset|never)|(?:unset|never).*states.*field/is);
  });

  it("learn.md §3b documents the same correction", () => {
    const content = readFileSync(join(WORKFLOWS_DIR, "learn.md"), "utf8");
    expect(content).toMatch(/`states`\s+field on a registry record is dead/);
  });
});
