import { chromium } from "playwright";
import { mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const pagePath = resolve(root, "runs/architecture-premium-service/index.html");
const output = resolve(root, "runs/architecture-premium-service/demo/architecture-demo.webm");
const temporary = resolve(root, "runs/architecture-premium-service/demo/raw");

await mkdir(dirname(output), { recursive: true });
await mkdir(temporary, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: temporary, size: { width: 1440, height: 900 } },
  reducedMotion: "no-preference",
});
const page = await context.newPage();
await page.goto(pathToFileURL(pagePath).href, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);

const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const stops = [0.12, 0.25, 0.39, 0.5, 0.62, 0.74, 0.87, 1];
for (const stop of stops) {
  await page.evaluate(
    ({ top, duration }) => new Promise((done) => {
      const start = scrollY;
      const began = performance.now();
      const frame = (now) => {
        const progress = Math.min((now - began) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        scrollTo(0, start + (top - start) * eased);
        progress < 1 ? requestAnimationFrame(frame) : done();
      };
      requestAnimationFrame(frame);
    }),
    { top: height * stop, duration: 1200 },
  );
  await page.waitForTimeout(450);
}

const video = page.video();
await context.close();
await browser.close();
await rename(await video.path(), output);
console.log(output);
