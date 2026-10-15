import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { makeParts } from "./parts.mjs";
import { makeWorld, drawScene, lockBolt } from "./scene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, "..", ".claude", "skills", "anatomy", "kit");

const WIDTH = 640;
const HEIGHT = 430;
const LENS = { x: 8, y: 6, w: 236, h: 150, mag: 3 };

// ---------------- Modelo ----------------
// Unidades del dibujo: 30 unidades = ancho de vía de 1435 mm. Escala longitudinal comprimida.
const X0 = -90;
const C = {
  R: 360,
  X0,
  LB: 70,
  THROW: 6, // carrera de la punta de aguja en el dibujo (exagerada)
  FW: 2.4,
  XS: -205,
  XE: 180,
  THETA_E: Math.asin(240 / 360),
  HALF: 0.9,
  Z: { ballast: 4, sleeper: 7.5, plate: 8.5, foot: 8.5, web: 9.2, head: 11.6, top: 13.2, bar: 4.2, deck: 27 },
  WHEEL: 5,
  LEVER: { x: X0 + 5, y: -50, pivot: 21 },
  PHI0: -0.5,
  PHI1: 0.5,
  STRETCH: [X0 + 5, X0 + 29],
  SIGNAL: { x: X0 - 37, y: -29 },
  LOCK: { x: X0 + 11, y: -27 },
  MM_PER_UNIT: 1435 / 30,
};
const W = makeWorld(C);

function routeOf(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return { pts: points.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]), cum: cum.map((c) => +c.toFixed(2)) };
}
const ROUTES = {
  straight: routeOf([[C.XS - 120, 0], [C.XE + 10, 0]]),
  diverging: routeOf([[C.XS - 120, 0], [X0, 0], ...Array.from({ length: 60 }, (_, i) => W.polar(C.R, (C.THETA_E * (i + 1)) / 60))]),
};

// ---------------- Cámara inicial ----------------
const VIEW = { azimuth: 70, elevation: 34 };
const fit = k.fitProjection(W.board.flatMap(([x, y]) => [[x, y, -15], [x, y, 0]]).concat([[C.LEVER.x, C.LEVER.y - 26, 78]]), WIDTH, HEIGHT, { pad: 14, headroom: 96, ...VIEW });
const CENTRE = [(Math.min(...W.board.map((p) => p[0])) + Math.max(...W.board.map((p) => p[0]))) / 2, (Math.min(...W.board.map((p) => p[1])) + Math.max(...W.board.map((p) => p[1]))) / 2, 12];
const BASE_SCALE = fit.scale * 0.97;
const POINTS = [X0 + 16, -3, 9];
const REGION = [X0 - 34, X0 + C.LB + 18];
const projectionAt = (view, scale, centre, box) => {
  const P0 = { origin: [0, 0], scale, azimuth: view.azimuth, elevation: view.elevation };
  const q = k.iso(centre, P0);
  return { ...P0, origin: [box[0] - q[0], box[1] - q[1]] };
};
const at0 = k.iso(CENTRE, fit);
const PAN0 = [at0[0] - WIDTH / 2 + 10, at0[1] - HEIGHT / 2];
const P = projectionAt(VIEW, BASE_SCALE, CENTRE, [WIDTH / 2 + PAN0[0], HEIGHT / 2 + PAN0[1]]);
const PL = projectionAt(VIEW, BASE_SCALE * LENS.mag, POINTS, [LENS.w / 2, LENS.h / 2]);

const stateFor = (Pv) => {
  const parts = makeParts(k, G, Pv, C);
  return {
    parts,
    strings: {
      bladeA: parts.blade("A", 1),
      bladeB: parts.blade("B", 1),
      lever: parts.leverArm(1),
      stretch: [parts.rod(1) + parts.stretcher(C.STRETCH[0], 1) + lockBolt(k, Pv, C, 1), parts.stretcher(C.STRETCH[1], 1)],
    },
  };
};
const main = stateFor(P);
const lens = stateFor(PL);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Un cambio de vía sencillo a izquierda que se puede girar: traviesas largas, dos agujas unidas por tirantes, cerrojo, corazón con su punta y patas de liebre, dos contrarrieles, una palanca de contrapeso y una señal baja. Una lupa fija amplía las agujas. Al mover la palanca las agujas cambian despacio, se enclavan, la señal se abre y el tren pasa.",
  body: [
    `<g data-view="main">${drawScene(k, G, P, W, main.parts, main.strings)}</g>`,
    `<g class="cv-mark" data-part="mark"></g>`,
    `<svg class="cv-lens" x="${LENS.x}" y="${LENS.y}" width="${LENS.w}" height="${LENS.h}" viewBox="0 0 ${LENS.w} ${LENS.h}" overflow="hidden">` +
      `<rect class="cv-lens-bg" x="0.5" y="0.5" width="${LENS.w - 1}" height="${LENS.h - 1}" rx="6"/>` +
      `<g data-view="lens">${drawScene(k, G, PL, W, lens.parts, lens.strings, REGION)}</g>` +
      `<rect class="cv-lens-frame" x="0.5" y="0.5" width="${LENS.w - 1}" height="${LENS.h - 1}" rx="6"/>` +
      `<rect class="cv-lens-band" x="1" y="1" width="${LENS.w - 2}" height="22" rx="5"/><text class="cv-lens-title" x="10" y="15">LUPA ×${LENS.mag} · AGUJAS</text>` +
      `<rect class="cv-lens-band" x="1" y="${LENS.h - 32}" width="${LENS.w - 2}" height="31" rx="5"/><g class="cv-lens-gauge" transform="translate(10 ${LENS.h - 25})"><rect class="cv-gauge-track" x="0" y="0" width="${LENS.w - 20}" height="5" rx="2.5"/><rect class="cv-gauge-fill" data-part="gauge-fill" x="0" y="0" width="0" height="5" rx="2.5"/><text class="cv-gauge-text" data-part="gauge-text" x="0" y="17">punta de aguja</text></g>` +
      `</svg>`,
  ],
});

const DATA = { PAN0, C, ROUTES, VIEW, CENTRE, BASE_SCALE, POINTS, REGION, LENS, WIDTH, HEIGHT };
const latheSource = readFileSync(join(KIT, "lathe.mjs"), "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { viewOf, frameOf, frameAlong, pointOf, disc, sphereOf, prismOf, solidOf, arcOf, dot3, add3, mul3, cross3, unit3 };})();\n`;
const strip = (file) => readFileSync(join(HERE, file), "utf8").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live-3d.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const CSS = `<style>
:root{--cv-accent:#e8590c;--cv-accent-soft:#fde4d2;--cv-accent-shade:#f6c3a0}
.iso-stage.cv-stage{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.iso-stage.cv-stage.cv-dragging{cursor:grabbing}
.cv-moving .iso-solid>.iso-edge,.cv-moving .iso-solid[data-lit]>.iso-edge{stroke:var(--cv-accent)}
.cv-moving .iso-solid>.iso-top,.cv-moving .iso-solid>.iso-fill{fill:var(--cv-accent-soft)}
.cv-moving .iso-solid>.iso-shade{fill:var(--cv-accent-shade)}
.cv-lamp{fill:var(--anatomy-lo,#999);stroke:var(--anatomy-mid,#666);stroke-width:.5}
.cv-lamp[data-on][data-lamp="red"]{fill:#e03131;stroke:#c92a2a}
.cv-lamp[data-on][data-lamp="green"]{fill:#2f9e44;stroke:#2b8a3e}
.cv-lens-bg{fill:var(--anatomy-card)}
.cv-lens-band{fill:var(--anatomy-card);opacity:.92}
.cv-lens-frame{fill:none;stroke:var(--anatomy-mid,#888);stroke-width:1}
.cv-lens-title{font:600 8.5px/1 var(--anatomy-mono,monospace);letter-spacing:.08em;fill:var(--anatomy-muted,#777)}
.cv-gauge-track{fill:var(--anatomy-faint,#e6e6e2)}
.cv-gauge-fill{fill:var(--cv-accent)}
.cv-gauge-text{font:9.5px/1 var(--anatomy-mono,monospace);fill:var(--anatomy-text,#333)}
.cv-mark rect{fill:none;stroke:var(--cv-accent);stroke-width:1;stroke-dasharray:3 2}
.cv-mark line{stroke:var(--cv-accent);stroke-width:.6;stroke-dasharray:3 2;opacity:.7}
.cv-controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;margin:10px 0 2px}
.cv-controls button{font:11px/1 var(--anatomy-mono,monospace);letter-spacing:.03em;padding:7px 10px;border-radius:6px;border:1px solid var(--anatomy-faint,#ccc);background:var(--anatomy-card);color:var(--anatomy-text,#222);cursor:pointer}
.cv-controls button:hover{border-color:var(--anatomy-mid,#888)}
.cv-controls button[aria-pressed="true"]{background:var(--cv-accent-soft);border-color:var(--cv-accent)}
.cv-controls button:disabled{opacity:.4;cursor:default}
.cv-controls .cv-chip{font:11px/1 var(--anatomy-mono,monospace);padding:6px 8px;border-radius:999px;background:var(--anatomy-faint,#eee);color:var(--anatomy-text,#222)}
.cv-controls .cv-chip[data-state="moving"]{background:var(--cv-accent-soft);color:#a34006}
.cv-controls .cv-chip[data-state="locked"]{background:#d3f9d8;color:#2b8a3e}
.iso-plate-corner[data-corner="readout"]{white-space:normal;max-width:64%;text-align:right;line-height:1.35}
@media (max-width:560px){.iso-plate-corner[data-corner="readout"]{white-space:normal;left:0;text-align:right;line-height:1.35}.iso-plate-corner[data-corner="hint"]{bottom:34px}}
</style>`;

const controls = `<div class="cv-controls" role="toolbar" aria-label="Controles">
<button type="button" data-act="throw">Cambiar agujas</button>
<button type="button" data-act="pause" aria-pressed="false">Pausa</button>
<button type="button" data-act="step" aria-pressed="false">Paso a paso</button>
<button type="button" data-act="advance" disabled>Avanzar ▸</button>
<button type="button" data-act="reset">Vista inicial</button>
<span class="cv-chip" data-part="chip" data-state="locked">enclavada</span>
</div>`;

const page = k.plateHtml({
  fig: "Fig 2",
  title: "Cambio de vía · 3D",
  hint: "Arrastra · rueda · espacio",
  readout: "vía desviada · agujas enclavadas",
  keys: [
    { mark: "lit", label: "Agujas: en naranja mientras se mueven; la lupa las sigue desde cualquier ángulo" },
    { mark: "raised", label: "Corazón, patas de liebre y contrarrieles" },
    { mark: "edge", label: "Palanca de contrapeso, varilla, tirantes, cerrojo y señal baja" },
  ],
  caption:
    "Arrastra para girar la vista alrededor del cambio, usa la rueda (o pellizca) para acercar, y pulsa «Cambiar agujas», la barra espaciadora o un clic sobre la escena. La palanca gira ±29°; la varilla arrastra las dos agujas, unidas por dos tirantes, en un cambio lento de 3 s. Al terminar, un cerrojo entra en la muesca de la varilla y deja las agujas enclavadas; solo entonces la señal baja pasa de rojo a verde y el tren arranca. Mientras el tren ocupa el aparato la palanca no se puede mover. La barra de la lupa da la separación de la punta de cada aguja a su contraaguja, a la escala del dibujo (ancho de vía 1435 mm), donde la carrera está exagerada para que se vea; en un cambio real es bastante menor. Teclas: espacio cambia, P pausa, S paso a paso, → avanza, flechas y +/− mueven la cámara, R vista inicial.",
  body: `<div class="iso-stage cv-stage" tabindex="0" role="application" aria-label="Cambio de vía en 3D. Arrastra o usa las flechas para girar, rueda o más y menos para acercar, espacio para cambiar las agujas, P para pausar, S para el modo paso a paso.">${svg}</div>${controls}`,
});

writeFileSync(join(HERE, "cambio-de-via-3d.html"), k.pageHtml({ title: "Cambio de vía 3D", theme: "light", body: CSS + page, script: kitScript() + latheScript + strip("parts.mjs") + strip("scene.mjs") + live }));
console.log("wrote cambio-de-via-3d.html", `scale ${BASE_SCALE.toFixed(3)}`);
