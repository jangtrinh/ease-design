import { defineConfig } from "tsup";

// Bundles the `ui` binary. The shebang is injected here (not in source) so the
// build output has exactly one, and `src/cli.ts` stays plain TypeScript.
export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
