// Trazo de la terminal tipo (metros). x hacia el oriente, z hacia el sur, y hacia arriba.
// El patio queda al norte de la vía principal (z < 0) y servicios/stock al sur (z > 0).
export const GAUGE = 1.435;
export const RAIL_TOP = 0.666; // cara de rodadura sobre el terreno
const TAN = 1 / 8; // ladera con cambios del n.º 8
const COS = 1 / Math.hypot(1, TAN);
const SIN = TAN * COS;
const R_SW = 190; // radio de la curva del cambio

export const LADDER_W = -560; // arranque de la ladera poniente sobre la principal
export const LADDER_E = 560;
export const LADDER_S = -430; // ladera sur (servicios y stock), al oriente de la báscula

// Vías del patio: z y extremos
export const YARD = {
  recibo: { z: -6, nombre: "Vía de recibo" },
  despacho: { z: -11, nombre: "Vía de despacho" },
  clasif1: { z: -16, nombre: "Clasificación 1", east: 230 },
  clasif2: { z: -21, nombre: "Clasificación 2", east: 230 },
  clasif3: { z: -26, nombre: "Clasificación 3", east: 230 },
  carga: { z: -34, nombre: "Vía de carga (llenadera)", east: 290 },
  servicios: { z: 6, nombre: "Vía de servicios", east: 160 },
  stock: { z: 11, nombre: "Vía de stock", east: -170 },
};

function filletPolyline(pts, radius) {
  // pts: [[x,z],...]; devuelve muestras {p, t} con arcos en las esquinas
  const out = [];
  const push = (p, t) => out.push({ p, t });
  let start = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1]];
    const lab = Math.hypot(ab[0], ab[1]);
    const d1 = [ab[0] / lab, ab[1] / lab];
    if (!c) {
      line(start, b, d1);
      break;
    }
    const bc = [c[0] - b[0], c[1] - b[1]];
    const lbc = Math.hypot(bc[0], bc[1]);
    const d2 = [bc[0] / lbc, bc[1] / lbc];
    const cos = d1[0] * d2[0] + d1[1] * d2[1];
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (ang < 1e-4) continue;
    const tl = radius * Math.tan(ang / 2);
    const p1 = [b[0] - d1[0] * tl, b[1] - d1[1] * tl];
    const p2 = [b[0] + d2[0] * tl, b[1] + d2[1] * tl];
    line(start, p1, d1);
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    const nrm = cross > 0 ? [-d1[1], d1[0]] : [d1[1], -d1[0]];
    const ctr = [p1[0] + nrm[0] * radius, p1[1] + nrm[1] * radius];
    const a0 = Math.atan2(p1[1] - ctr[1], p1[0] - ctr[0]);
    const n = Math.max(4, Math.ceil((ang * radius) / 1.5));
    for (let k = 1; k <= n; k++) {
      const th = a0 + (cross > 0 ? 1 : -1) * ang * (k / n);
      const p = [ctr[0] + radius * Math.cos(th), ctr[1] + radius * Math.sin(th)];
      const t = cross > 0 ? [-Math.sin(th), Math.cos(th)] : [Math.sin(th), -Math.cos(th)];
      push(p, t);
    }
    start = p2;
  }
  function line(a, b, d) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 6));
    for (let k = out.length ? 1 : 0; k <= n; k++) push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], d);
  }
  // longitud acumulada
  let s = 0;
  out.forEach((o, i) => {
    if (i) s += Math.hypot(o.p[0] - out[i - 1].p[0], o.p[1] - out[i - 1].p[1]);
    o.s = s;
  });
  return out;
}

const tracks = [];
const turnouts = [];
const bumpers = [];

function addTrack(id, nombre, pts, { radius = R_SW, bumperEnd = false, bumperStart = false } = {}) {
  const path = filletPolyline(pts, radius);
  tracks.push({ id, nombre, pts, path, length: path[path.length - 1].s });
  if (bumperEnd) bumpers.push({ track: id, at: path[path.length - 1].p, dir: path[path.length - 1].t });
  if (bumperStart) bumpers.push({ track: id, at: path[0].p, dir: [-path[0].t[0], -path[0].t[1]] });
  return path;
}

// Un ramal que sale de una ladera: el cambio está donde la curva se separa de la ladera.
function branch(ladderOrigin, dir, z, east, id, nombre, opts) {
  const along = Math.abs(z) / (dir[1] === 0 ? 1 : Math.abs(dir[1]));
  const P = [ladderOrigin[0] + dir[0] * along, ladderOrigin[1] + dir[1] * along];
  const ang = Math.atan2(Math.abs(dir[1]), Math.abs(dir[0]));
  const tl = R_SW * Math.tan(ang / 2);
  const T = [P[0] - dir[0] * tl, P[1] - dir[1] * tl];
  const E = [east, z];
  addTrack(id, nombre, [T, P, E], opts);
  const sideSign = Math.sign(z);
  turnouts.push({ id: `cambio-${id}`, at: T, dir, side: sideSign, track: id });
  return { T, P };
}

// Vía principal de interconexión
addTrack("principal", "Vía principal de interconexión", [[-2000, 0], [2000, 0]]);

// Ladera poniente norte (hacia z negativo)
const dW = [COS, -SIN];
const zCarga = YARD.carga.z;
const lenCarga = Math.abs(zCarga) / SIN;
const PcW = [LADDER_W + dW[0] * lenCarga, zCarga];
const TL = R_SW * Math.tan(Math.atan(TAN) / 2); // tangente de la curva del cambio
addTrack("carga", YARD.carga.nombre, [[LADDER_W - TL, 0], [LADDER_W, 0], PcW, [YARD.carga.east, zCarga]], { bumperEnd: true });
turnouts.push({ id: "cambio-ladera-poniente", at: [LADDER_W - TL, 0], dir: [1, 0], side: -1, track: "carga", ladder: true });
for (const id of ["clasif1", "clasif2", "clasif3"]) branch([LADDER_W, 0], dW, YARD[id].z, YARD[id].east, id, YARD[id].nombre, { bumperEnd: true });

// Recibo y despacho: de la ladera poniente a la ladera oriente (vías pasantes)
const dE = [-COS, -SIN];
const westPt = (z) => [LADDER_W + (Math.abs(z) / SIN) * COS, z];
const eastPt = (z) => [LADDER_E - (Math.abs(z) / SIN) * COS, z];
let despachoTe;
for (const id of ["recibo", "despacho"]) {
  const z = YARD[id].z;
  const a = westPt(z);
  const b = eastPt(z);
  const ang = Math.atan(TAN);
  const tl = R_SW * Math.tan(ang / 2);
  const Tw = [a[0] - dW[0] * tl, a[1] - dW[1] * tl];
  const Te = [b[0] - dE[0] * tl, b[1] - dE[1] * tl];
  addTrack(id, YARD[id].nombre, [Tw, a, b, Te]);
  turnouts.push({ id: `cambio-${id}-poniente`, at: Tw, dir: dW, side: -1, track: id });
  if (id === "recibo") turnouts.push({ id: `cambio-${id}-oriente`, at: Te, dir: dE, side: -1, track: id, reverse: true });
  else despachoTe = Te;
}
// Ladera oriente: de la principal a despacho (despacho remata la ladera con su curva)
addTrack("ladera-oriente", "Ladera oriente", [[LADDER_E + TL, 0], [LADDER_E, 0], despachoTe]);
turnouts.push({ id: "cambio-ladera-oriente", at: [LADDER_E + TL, 0], dir: [-1, 0], side: -1, track: "ladera-oriente", ladder: true });

// Ladera sur: servicios y stock
const dS = [COS, SIN];
{
  const zs = YARD.stock.z;
  const len = zs / SIN;
  const P = [LADDER_S + dS[0] * len, zs];
  addTrack("stock", YARD.stock.nombre, [[LADDER_S - TL, 0], [LADDER_S, 0], P, [YARD.stock.east, zs]], { bumperEnd: true });
  turnouts.push({ id: "cambio-ladera-sur", at: [LADDER_S - TL, 0], dir: [1, 0], side: 1, track: "stock", ladder: true });
  branch([LADDER_S, 0], dS, YARD.servicios.z, YARD.servicios.east, "servicios", YARD.servicios.nombre, { bumperEnd: true });
}

export const TRACKS = tracks;
export const TURNOUTS = turnouts;
export const BUMPERS = bumpers;

// Instalaciones (coordenadas x, z)
export const SITE = {
  bascula: { x: -470, track: "recibo", len: 22, caseta: [-470, 7.5] },
  llenadera: { x0: -30, x1: 172, z: YARD.carga.z, posiciones: 11 },
  combustible: { x: 40, z: 18 },
  arenero: { x: -40, z: 9.5 },
  fosa: { x: -120, track: "servicios", len: 30 },
  casetaJefe: { x: -640, z: 28 },
  bodega: { x: -300, z: 44 },
  senalEntrada: { x: -760, z: 3.4 },
  torres: [[-600, -48], [-380, 22], [-200, -48], [0, 26], [120, -52], [300, -48], [-80, 40], [480, -30]],
  cerca: { x0: -1000, x1: 1000, z0: -95, z1: 85 },
};

export function pointAt(track, s) {
  const p = track.path;
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m].s < s) lo = m;
    else hi = m;
  }
  const a = p[lo];
  const b = p[hi];
  const f = (s - a.s) / Math.max(1e-6, b.s - a.s);
  return { p: [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f], t: [a.t[0] + (b.t[0] - a.t[0]) * f, a.t[1] + (b.t[1] - a.t[1]) * f] };
}
