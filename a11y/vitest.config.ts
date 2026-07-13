import { defineConfig } from 'vitest/config';

// Unit tests for the a11y workspace. Kept SEPARATE from the root vitest project (which only
// globs root tests/) so these never touch the deterministic `ui` binary suite. The browser
// tests self-skip when Chrome is unavailable (see tests/has-chrome.ts). Run with:
//   npx vitest run --config a11y/vitest.config.ts
export default defineConfig({
  // Pin root to this workspace so `include` never resolves against the repo root's tests/.
  root: import.meta.dirname,
  test: {
    include: ['tests/**/*.test.ts'],
    // Launching Chrome + running axe over a page comfortably exceeds vitest's 5s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
