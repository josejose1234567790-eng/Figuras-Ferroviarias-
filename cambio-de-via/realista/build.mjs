// Genera cambio-de-via-realista.html: un solo archivo con Three.js r149 incrustado, que funciona
// abriéndolo directamente en el navegador (sin servidor ni conexión).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, "..", "vendor");
const read = (p) => readFileSync(p, "utf8");
// Los ejemplos de Three.js vienen como módulos ES: se pasan a script clásico sobre el THREE global.
const classic = (src, name) =>
  `(() => {\n${src.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'three';/, "const {$1} = THREE;").replace(/^export\s*\{[^}]*\};?\s*$/m, "")}\nwindow.${name} = ${name};\n})();`;

const three = read(join(VENDOR, "three.min.js"));
const orbit = classic(read(join(VENDOR, "OrbitControls.js")), "OrbitControls");
const sky = classic(read(join(VENDOR, "Sky.js")), "Sky");
const app = read(join(HERE, "app.js"));
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cambio de vía realista</title>
<style>
  :root { --ink: #1d232b; --muted: #5d6673; --card: rgba(250, 250, 247, 0.9); --line: rgba(29, 35, 43, 0.14); --accent: #e8590c; --ok: #2b8a3e; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #c9d6e2; color: var(--ink); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
  #view { position: fixed; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
  #view:active { cursor: grabbing; }
  .panel { position: fixed; left: 16px; top: 16px; width: min(340px, calc(100vw - 32px)); background: var(--card); backdrop-filter: blur(8px); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12); }
  h1 { font-size: 16px; margin: 0 0 2px; letter-spacing: 0.01em; }
  .spec { color: var(--muted); font-size: 12px; margin: 0 0 12px; }
  button { width: 100%; font: 600 14px/1 inherit; padding: 11px 14px; border-radius: 8px; border: 0; background: var(--ink); color: #fff; cursor: pointer; }
  button:hover:not(:disabled) { background: #2f3946; }
  button:disabled { opacity: 0.45; cursor: default; }
  .row { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; font-size: 13px; }
  .row b { font-variant-numeric: tabular-nums; }
  .meter { height: 6px; border-radius: 3px; background: var(--line); margin-top: 6px; overflow: hidden; }
  #bar { height: 100%; width: 0; background: var(--accent); }
  #state { display: inline-block; margin-top: 10px; padding: 4px 9px; border-radius: 999px; background: #e7f5ea; color: var(--ok); font-size: 12px; }
  #state[data-phase="throw"], #state[data-phase="lock"] { background: #fde4d2; color: #a34006; }
  #state[data-phase="train"] { background: #e3ecf8; color: #1d3557; }
  .views { display: flex; gap: 6px; align-items: center; margin-top: 12px; font-size: 13px; color: var(--muted); }
  .views button.ghost { width: auto; flex: 1; padding: 7px 8px; font-weight: 500; font-size: 12px; background: transparent; color: var(--ink); border: 1px solid var(--line); }
  .views button.ghost:hover { background: rgba(0,0,0,0.05); }
  label { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; color: var(--muted); cursor: pointer; }
  .help { position: fixed; right: 16px; bottom: 14px; font-size: 12px; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; }
  #fail { display: none; position: fixed; inset: 0; place-items: center; text-align: center; padding: 24px; }
  @media (max-width: 560px) { .panel { padding: 12px; } .help { left: 16px; right: 16px; text-align: center; } }
</style>
</head>
<body>
<canvas id="view" aria-label="Cambio de vía sencillo en 3D: arrastra para girar, rueda para acercar"></canvas>
<div class="panel">
  <h1>Cambio de vía sencillo</h1>
  <p class="spec">Riel 115 lb/yd (115RE) · trocha 1435 mm · corazón n.º 10 · durmientes de concreto</p>
  <button id="throw" type="button">Mover palanca</button>
  <div class="row"><span>Itinerario</span><b id="route">directa</b></div>
  <div class="row"><span>Abertura aguja izquierda (lado −z)</span><b id="gapA">121 mm</b></div>
  <div class="row"><span>Abertura aguja derecha (lado +z)</span><b id="gapB">0 mm</b></div>
  <div class="meter" aria-hidden="true"><div id="bar"></div></div>
  <span id="state" data-phase="idle">agujas enclavadas · listo</span>
  <div class="views"><span>Vista:</span><button type="button" class="ghost" data-view="points">Agujas</button><button type="button" class="ghost" data-view="frog">Corazón</button><button type="button" class="ghost" data-view="overview">General</button></div>
  <label><input type="checkbox" id="follow"> Seguir al tren con la cámara</label>
  <label><input type="checkbox" id="fast"> Tren ×3 (acelerar la pasada)</label>
</div>
<div class="help">Arrastrar: girar · Rueda: acercar/alejar · Clic derecho: desplazar</div>
<div id="fail"><p>Este navegador no pudo iniciar WebGL, que hace falta para ver la escena en 3D.</p></div>
<script>${safe(three)}</script>
<script>${safe(orbit)}</script>
<script>${safe(sky)}</script>
<script>
try {
${safe(app)}
} catch (err) {
  console.error(err);
  document.getElementById("fail").style.display = "grid";
}
</script>
</body>
</html>
`;
const outFile = join(HERE, "..", "cambio-de-via-realista.html");
writeFileSync(outFile, html);
console.log("wrote", outFile, `${(html.length / 1024).toFixed(0)} KB`);
