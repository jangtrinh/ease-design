// The ONLY test file allowed to load the real ONNX embedder. Gated behind
// RECALL_E2E=1 so the default `vitest run` (and CI) never downloads a model.
//   RECALL_E2E=1 npx vitest run --config recall/vitest.config.ts
import { describe, it, expect } from 'vitest';

import { embedAll, DIMS } from '../cli/src/embed.ts';
import { RecallStore } from '../cli/src/store.ts';

const E2E = process.env['RECALL_E2E'] === '1';

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
});
