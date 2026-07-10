import { defineConfig } from 'vitest/config';

// Pure-logic unit tests for the recall workspace. Kept SEPARATE from the root
// vitest project (which only globs root tests/) so recall tests never touch
// the deterministic `ui` binary suite. Run with:
//   npx vitest run --config recall/vitest.config.ts
// or simply: npx vitest run recall/tests/rank.test.ts
export default defineConfig({
  // Pin root to this workspace so `include` never resolves against the repo
  // root's tests/ (which holds the deterministic `ui` binary suite).
  root: import.meta.dirname,
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
