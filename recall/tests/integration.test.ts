// The ONLY test file allowed to load the real ONNX embedder. Gated behind
// RECALL_E2E=1 so the default `vitest run` (and CI) never downloads a model.
//   RECALL_E2E=1 npx vitest run --config recall/vitest.config.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { embedAll, DIMS, MODEL_ID } from '../cli/src/embed.ts';
import { RecallStore } from '../cli/src/store.ts';
import { runQuery } from '../cli/src/cmd-query.ts';
import { runReflect } from '../cli/src/cmd-reflect.ts';

const E2E = process.env['RECALL_E2E'] === '1';

const tmpDirs: string[] = [];
function tmpProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'recall-integration-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe.skipIf(!E2E)('recall integration (real embedder)', () => {
  it(
    'embedAll returns DIMS-wide, unit-ish normalised vectors',
    { timeout: 300_000 },
    async () => {
      const vectors = await embedAll(['hello world', 'a second short sentence']);
      expect(vectors).toHaveLength(2);
      for (const v of vectors) {
        expect(v).toBeInstanceOf(Float32Array);
        expect(v.length).toBe(DIMS);
        let sumSq = 0;
        for (let i = 0; i < v.length; i++) sumSq += (v[i] as number) * (v[i] as number);
        // normalize: true -> L2 norm should be ~1.
        expect(Math.sqrt(sumSq)).toBeCloseTo(1, 1);
      }
    },
  );

  it(
    'ranks the semantically related item first for a related query',
    { timeout: 300_000 },
    async () => {
      const texts = [
        'The button uses the primary blue color token for its background.',
        'Chocolate chip cookies need butter, sugar, flour, and baking soda.',
        'Our design system spacing scale is based on an 8px grid.',
      ];
      const vectors = await embedAll(texts);

      const store = RecallStore.open(':memory:', DIMS, 'integration-test-model');
      texts.forEach((text, i) => {
        store.upsert(
          { id: `e${i}`, tier: 'semantic', text, refs: [], t: '', source: 'knowledge' },
          vectors[i] as Float32Array,
        );
      });

      const [queryVec] = await embedAll(['What color token does the primary button use?']);
      const ranked = store.knn(queryVec as Float32Array, 3);
      expect(ranked[0]).toBe('e0');

      store.close();
    },
  );

  it(
    'recall query stamps only the ids it served (spec 006 P3)',
    { timeout: 300_000 },
    async () => {
      const projectDir = tmpProjectDir();
      const dbPath = join(projectDir, 'design', 'memory.vec.db');
      const texts = [
        'The button uses the primary blue color token for its background.',
        'Chocolate chip cookies need butter, sugar, flour, and baking soda.',
      ];
      const vectors = await embedAll(texts);
      const store = RecallStore.open(dbPath, DIMS, MODEL_ID);
      texts.forEach((text, i) => {
        store.upsert(
          { id: `e${i}`, tier: 'semantic', text, refs: [], t: '2026-07-01T00:00:00.000Z', source: 'knowledge' },
          vectors[i] as Float32Array,
        );
      });
      store.close();

      const result = await runQuery('What color token does the primary button use?', {
        project: projectDir,
        home: false,
        k: 1,
        json: false,
        text: false,
        now: '2026-07-17T00:00:00.000Z',
      });
      expect(result.hits).toHaveLength(1);

      const verify = RecallStore.open(dbPath, DIMS, MODEL_ID);
      const items = verify.getItems(['e0', 'e1']);
      const stamped = [...items.values()].filter((it) => it.lastRetrievedAt !== undefined);
      expect(stamped).toHaveLength(1);
      expect(stamped[0]?.id).toBe(result.hits[0]?.id);
      verify.close();
    },
  );

  it(
    'recall reflect serves neighbours without stamping any retrieval (spec 006 P3 D5)',
    { timeout: 300_000 },
    async () => {
      const projectDir = tmpProjectDir();
      const dbPath = join(projectDir, 'design', 'memory.vec.db');
      const texts = [
        'The button uses the primary blue color token for its background.',
        'Chocolate chip cookies need butter, sugar, flour, and baking soda.',
      ];
      const vectors = await embedAll(texts);
      const store = RecallStore.open(dbPath, DIMS, MODEL_ID);
      store.upsert(
        { id: 'job1', tier: 'episodic', text: 'did the button task', refs: [], t: '2026-07-16T00:00:00.000Z', source: 'memory' },
        vectors[0] as Float32Array,
      );
      store.upsert(
        { id: 'e1', tier: 'semantic', text: texts[1] as string, refs: [], t: '2026-07-01T00:00:00.000Z', source: 'knowledge' },
        vectors[1] as Float32Array,
      );
      store.close();

      const jobEventsPath = join(projectDir, 'job-events.json');
      writeFileSync(jobEventsPath, JSON.stringify(['job1']), 'utf8');

      await runReflect(jobEventsPath, { project: projectDir, k: 5, json: false, now: '2026-07-17T00:00:00.000Z' });

      const verify = RecallStore.open(dbPath, DIMS, MODEL_ID);
      const items = verify.getItems(['job1', 'e1']);
      const stamped = [...items.values()].filter((it) => it.lastRetrievedAt !== undefined);
      expect(stamped).toHaveLength(0);
      verify.close();
    },
  );
});
