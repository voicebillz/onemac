// Renders banner.html to PNG: node brand/render-banner.mjs (needs Playwright + Chromium).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
const b = await chromium.launch();
for (const [k, name] of [[1, "onemac-banner-1500x500.png"], [3, "onemac-banner-4500x1500.png"]]) {
  const p = await b.newPage({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: k });
  await p.goto(`file://${dir}banner.html`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: dir + name });
}
await b.close();
