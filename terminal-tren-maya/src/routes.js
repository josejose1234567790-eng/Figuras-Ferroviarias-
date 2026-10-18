// Rutas compuestas a través de cambios: se encadenan tramos de vías del trazo en un solo recorrido
// continuo, se calculan los cambios que deben alinearse y se proyectan vehículos sobre la ruta.
import { TRACKS, TURNOUTS } from "./layout.js";
import { analyse } from "./track.js";
import { subPath } from "./geom.js";

const T = (id) => TRACKS.find((t) => t.id === id);
let JUN;
export function junctions() {
  if (JUN) return JUN;
  JUN = TURNOUTS.map((to) => {
    const A = analyse(to);
    return { id: to.id, parent: A.parent.id, sP: A.sP, branch: A.B.id, sB: to.reverse ? A.B.length : 0 };
  });
  // continuidad sin cambio: despacho remata en la ladera oriente
  const d = T("despacho");
  const lo = T("ladera-oriente");
  JUN.push({ id: null, parent: "ladera-oriente", sP: lo.length, branch: "despacho", sB: d.length });
  return JUN;
}

function link(a, b) {
  for (const j of junctions()) {
    if (j.parent === a && j.branch === b) return { sa: j.sP, sb: j.sB, j };
    if (j.parent === b && j.branch === a) return { sa: j.sB, sb: j.sP, j };
  }
  throw new Error(`Sin enlace entre ${a} y ${b}`);
}

// legs: [{track, from?, to?}] en orden de recorrido; from/to en abscisa propia de cada vía (o x con fromX/toX)
export function makeRoute(legs) {
  const segs = [];
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    const tr = T(L.track);
    let s0 = L.from ?? (L.fromX !== undefined ? sAtX(tr, L.fromX) : null);
    let s1 = L.to ?? (L.toX !== undefined ? sAtX(tr, L.toX) : null);
    if (i > 0) s0 = link(legs[i - 1].track, L.track).sb;
    if (i < legs.length - 1) s1 = link(L.track, legs[i + 1].track).sa;
    segs.push({ track: tr, s0, s1 });
  }
  // muestras encadenadas
  const path = [];
  let acc = 0;
  for (const sg of segs) {
    sg.r0 = acc;
    const fwd = sg.s1 >= sg.s0;
    let sp = subPath(sg.track, Math.min(sg.s0, sg.s1), Math.max(sg.s0, sg.s1));
    if (!fwd) sp = sp.reverse().map((q) => ({ p: q.p, t: [-q.t[0], -q.t[1]], s: q.s }));
    sp.forEach((q, k) => {
      if (path.length && k === 0) return;
      if (path.length) acc += Math.hypot(q.p[0] - path[path.length - 1].p[0], q.p[1] - path[path.length - 1].p[1]);
      path.push({ p: q.p, t: q.t, s: acc });
    });
    sg.r1 = acc;
  }
  const route = { id: legs.map((l) => l.track).join(">"), path, length: acc, segs };
  route.switches = switchesFor(segs);
  return route;
}

// Estado de cambios que exige la ruta: 1 en los que diverge, 0 en los que pasa de frente
function switchesFor(segs) {
  const req = {};
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    if (i < segs.length - 1) {
      const { j } = link(a.track.id, segs[i + 1].track.id);
      if (j.id) req[j.id] = 1;
    }
    const lo = Math.min(a.s0, a.s1);
    const hi = Math.max(a.s0, a.s1);
    for (const j of junctions()) {
      if (!j.id || j.parent !== a.track.id) continue;
      if (j.sP > lo + 0.5 && j.sP < hi - 0.5 && req[j.id] === undefined) req[j.id] = 0;
    }
  }
  // un tramo sobre un ramal que arranca en su cambio también lo usa
  for (let i = 1; i < segs.length; i++) {
    const { j } = link(segs[i - 1].track.id, segs[i].track.id);
    if (j.id) req[j.id] = 1;
  }
  return req;
}

export function sAtX(tr, x) {
  const P = tr.path;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    if ((a.p[0] - x) * (b.p[0] - x) <= 0 && a.p[0] !== b.p[0]) {
      const f = (x - a.p[0]) / (b.p[0] - a.p[0]);
      return a.s + (b.s - a.s) * f;
    }
  }
  return Math.abs(x - P[0].p[0]) < Math.abs(x - P[P.length - 1].p[0]) ? 0 : tr.length;
}

// Abscisa de la ruta más cercana a un punto (x, z)
export function projectS(route, x, z) {
  const P = route.path;
  let best = 1e18;
  let bs = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i].p;
    const b = P[i + 1].p;
    const ab = [b[0] - a[0], b[1] - a[1]];
    const l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / l2));
    const d = (a[0] + ab[0] * f - x) ** 2 + (a[1] + ab[1] * f - z) ** 2;
    if (d < best) {
      best = d;
      bs = P[i].s + Math.sqrt(l2) * f;
    }
  }
  return { s: bs, d: Math.sqrt(best) };
}

export function trackRoute(id) {
  const tr = T(id);
  return makeRoute([{ track: id, from: 0, to: tr.length }]);
}
