// Genera ../cruce-periferico.html: un solo archivo autónomo (Three.js r149 incrustado) que
// funciona abriéndolo directamente en el navegador, sin servidor ni conexión.
//   node cruce-periferico/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "..", "cambio-de-via", "vendor");
const read = (p) => readFileSync(p, "utf8");
// Los ejemplos de Three.js vienen como módulos ES: se pasan a script clásico sobre el THREE global.
const classic = (src, name) =>
  `(() => {\n${src.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'three';/, "const {$1} = THREE;").replace(/^export\s*\{[^}]*\};?\s*$/m, "")}\nwindow.${name} = ${name};\n})();`;
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
// El modelo es un módulo ES: se incrusta como script clásico bajo window.MODELO.
const modelo = read(join(HERE, "modelo.mjs"));
const modeloClassic = `window.MODELO = (() => {\n${modelo.replace(/^export\s+/gm, "")}\nreturn { CRUCE, AFORO, derivados, cierre, analisis, analisisPorHora };\n})();`;

const three = read(join(VENDOR, "three.min.js"));
const orbit = classic(read(join(VENDOR, "OrbitControls.js")), "OrbitControls");
const sky = classic(read(join(VENDOR, "Sky.js")), "Sky");
const parts = ["escena.js", "vehiculos.js", "tren.js", "paneles.js", "app.js"].map((f) => {
  try {
    return read(join(HERE, f));
  } catch {
    return "";
  }
});
const css = read(join(HERE, "estilo.css"));
const body = read(join(HERE, "cuerpo.html"));

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cruce Periférico PK 115+450</title>
<meta name="description" content="Simulación del cierre del cruce a nivel PK 115+450 del Ramal Poxilá–Mérida con el Anillo Periférico de Mérida al paso de un tren de carga: filas, accesos y disipación.">
<style>
${css}
</style>
</head>
<body>
${body}
<script>${safe(three)}</script>
<script>${safe(orbit)}</script>
<script>${safe(sky)}</script>
<script>${safe(modeloClassic)}</script>
<script>
try {
${parts.map(safe).join("\n")}
} catch (err) {
  console.error(err);
  const f = document.getElementById("fail");
  if (f) f.style.display = "grid";
}
</script>
</body>
</html>
`;
const outFile = join(HERE, "..", "cruce-periferico.html");
writeFileSync(outFile, html);
console.log("wrote", outFile, `${(html.length / 1024).toFixed(0)} KB`);
