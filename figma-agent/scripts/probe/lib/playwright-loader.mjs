import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    throw new Error("Playwright not found. Run `npm install playwright` (an optional devDependency of the figma-agent workspace) to enable the probe/ scripts.");
  }
}

export async function launchChromium(chromium) {
  try {
    return await chromium.launch({ headless: true });
  } catch (firstError) {
    try {
      return await chromium.launch({ headless: true, channel: "chrome" });
    } catch {
      throw firstError;
    }
  }
}
