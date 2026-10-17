// Empaqueta src/ en un solo script clásico (app.js) para abrir index.html con doble clic, sin servidor.
// Uso: npm install && node build.mjs
import { build } from "esbuild";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nodePaths = [join(here, "node_modules"), process.env.TM_NODE_MODULES].filter((p) => p && existsSync(p));

await build({
  entryPoints: [join(here, "src/main.js")],
  bundle: true,
  format: "iife",
  minify: !process.env.DEV,
  target: ["chrome100", "firefox100", "safari15"],
  outfile: join(here, "app.js"),
  nodePaths,
  legalComments: "none",
  logLevel: "info",
});
copyFileSync(join(here, "src/index.html"), join(here, "index.html"));
