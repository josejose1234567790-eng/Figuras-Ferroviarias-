// Precalcula las texturas procedurales en texturas.js (requiere Playwright con Chromium).
// Uso: node tools/hornear.mjs   (después de node build.mjs)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
let pw;
for (const p of [here + "/node_modules/", "/opt/node22/lib/node_modules/"]) {
  try {
    pw = createRequire(p)("playwright");
    break;
  } catch {
    /* siguiente */
  }
}
if (!pw) pw = req("playwright");
const browser = await pw.chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on("pageerror", (e) => console.log("error:", e.message));
await page.goto("file://" + join(here, "index.html") + "?captura=1&hornear=1&calidad=alta");
await page.waitForFunction(() => window.TM && window.TM.ready, null, { timeout: 900000 });
const js = await page.evaluate(() => TM.bakeAll());
writeFileSync(join(here, "texturas.js"), js);
console.log(`texturas.js: ${(js.length / 1048576).toFixed(1)} MB`);
await browser.close();
