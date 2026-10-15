// Carro tanque DOT-117 desarmable — figura de capacitación.
// node carro-tanque/build.mjs            escribe carro-tanque.html en la raíz del repo
// node carro-tanque/build.mjs --audit    además corre la auditoría del skill anatomy (armado, desarmado y cuadros intermedios)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.claude/skills/anatomy/kit/lathe.mjs";
import * as A from "../.claude/skills/anatomy/kit/audit.mjs";
import { tubePieces, tubeSvg, crossingsOf } from "../.claude/skills/anatomy/kit/tube.mjs";
import { kitScript } from "../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { ENSAMBLES, TIPOS } from "./catalogo.mjs";
import { detalleHtml } from "./detalle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = process.argv.includes("--audit");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7);

// ---------------------------------------------------------------------------
// Medidas. Una unidad del mundo = 25 mm. x a lo largo del carro (+x = extremo B),
// y a lo ancho (+y = lado que ve el lector), z hacia arriba desde la cara superior del riel.
const mm = (v) => v / 25;
const M = {
  pullingFaces: mm(18237), // 59 ft 10 in entre caras de tracción (Greenbrier 30,600 gal DOT-117J)
  truckCenters: mm(14211), // 46 ft 7.5 in entre centros de bogíes
  tankOD: mm(3249), // diámetro exterior sobre la chaqueta, 10 ft 7.9 in
  extremeHeight: mm(4714), // altura extrema 15 ft 5.6 in
  gauge: mm(1435),
  wheelD: mm(914), // ruedas de 36 in
  wheelBase: mm(1778), // 70 in, bogíe de 286 000 lb (aproximado)
  coupler: mm(864), // eje del acoplador sobre el riel, 34 in (AAR: 32.5–34.5 in vacío)
  shell: mm(14.3), // virola 9/16 in TC-128B
  insulation: mm(13), // protección térmica cerámica 1/2 in
  jacket: mm(3.0), // chaqueta calibre 11
  headShield: mm(12.7), // escudo de cabezal 1/2 in
};
const TRUCK_X = M.truckCenters / 2;
const AXLE = M.wheelBase / 2;
const WR = M.wheelD / 2;
const RAIL_Y = M.gauge / 2 + 1.45;

// ---------------------------------------------------------------------------
// Cámara
const W = 1280;
const H = 600;
const AZIMUTH = 64;
const ELEVATION = 21;
const P = k.fitProjection(
  [
    [-430, -60, -16],
    [430, 60, -16],
    [-380, -66, 190],
    [380, 66, 190],
  ],
  W,
  H,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const YAX = (o) => G.frameOf(o, [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const XAX = (o) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const ZAX = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// ---------------------------------------------------------------------------
// Ensambles, resortes del despiece y piezas
// Nivel 1: cada ensamble (o mitad de ensamble) tiene un resorte y un vector.
const MOVE = {
  enganA: [-60, 0, 0],
  enganB: [60, 0, 0],
  segN: [0, 92, 30],
  segF: [0, -92, 30],
  segTop: [0, 0, 196],
  frenos: [0, 92, 0],
  accesorios: [0, 0, 236],
  descarga: [0, 0, -16],
  tanque: [0, 0, 120],
  estructura: [0, 0, 56],
  bogieA: [-112, 0, 0],
  bogieB: [112, 0, 0],
};
const ASM_OF_SPRING = { enganA: "enganches", enganB: "enganches", segN: "seguridad", segF: "seguridad", segTop: "seguridad", frenos: "frenos", accesorios: "accesorios", descarga: "descarga", tanque: "tanque", estructura: "estructura", bogieA: "bogies", bogieB: "bogies" };
// Orden de salida del despiece: lo que está afuera sale primero. El montaje es el orden inverso.
const STAGGER = ["enganA", "enganB", "segN", "segF", "segTop", "frenos", "accesorios", "descarga", "tanque", "estructura", "bogieA", "bogieB"];
const SPRING = { stagger: 0.12, stiffness: 46, damping: 12.6, substeps: 4 };
// Despiece de un ensamble: pieza por pieza, más espaciado.
const SPRING2 = { stagger: 0.24, stiffness: 46, damping: 12.6, substeps: 4 };

const PARTS = {}; // id de pieza -> { type, asm, spring, v2, l2, mat }
function part(id, type, { asm, spring, v2 = [0, 0, 0], l2 = true, l1 = true, ride2, mat }) {
  if (!TIPOS[type]) throw new Error(`tipo desconocido ${type}`);
  PARTS[id] = { type, asm, spring: spring ?? asm, v2, l2, l1, ride2, mat };
  return id;
}
// Nivel 2: orden de salida de las piezas de cada ensamble, y la pieza que queda fija.
const L2 = {};

const ITEMS = [];
const STATIC_SHAPES = [];
const names = new Map();
const nameFor = (base) => {
  const n = (names.get(base) ?? 0) + 1;
  names.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
};
function put(pid, ref, svg, shapes, { bias = 0, ride, mat, name: given, route, chunk } = {}) {
  const p = PARTS[pid];
  const name = given ?? nameFor(pid);
  for (const s of shapes) s.name = s.name ?? name;
  ITEMS.push({ pid, asm: p.asm, ride: ride ?? p.spring, at: ref, bias, svg, shapes, name, mat: mat ?? p.mat, l1: p.l1, route, chunk });
}
// Tubos y cadenas: trozos ordenables por profundidad; la ruta se registra para holguras, extremos y pliegues.
const ROUTES = [];
function pipe(pid, points, r, { tone = "hi", gaps = [], maxLength = 22, owner, touch, bundle, limp = false, free = [false, false], rims, ends = [true, true], caps = true, rings, bias = 0, ride, closed = false } = {}) {
  const name = nameFor(`${pid}.tubo`);
  ROUTES.push({ pid, name, points, r, ride, opts: { owner: owner ?? name, touch, bundle, limp, gaps, free, rims, ends, closed } });
  tubePieces(points, r, P, { maxLength, gaps, caps, rings, closed }).forEach((piece, i) => put(pid, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii, { owner: owner ?? name })], { name: `${name}:${i}`, route: name, chunk: i, bias, ride }));
  return name;
}
// Una pieza hecha de varios sólidos pequeños, pintados de atrás hacia adelante dentro del mismo grupo.
function multi(pid, subs, { bias = 0, ride } = {}) {
  const list = [...subs].sort((a, b) => k.depthOf(a.at, P) - k.depthOf(b.at, P));
  const c = list.reduce((acc, s) => G.add3(acc, s.at), [0, 0, 0]).map((v) => v / list.length);
  for (const s of list) s.shape.owner = s.shape.owner ?? pid;
  put(pid, c, list.map((s) => s.svg).join(""), list.map((s) => s.shape), { bias, ride });
}
const sBox = ([x0, y0, z0], [x1, y1, z1], { tone = "hi", bevel = 0, extra = "", owner } = {}) => {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.2 };
  return { svg: S(k.slabOf(plan, z0, z1 - z0, P, 2, bevel), { tone }) + extra, shape: A.slab(plan, z0, z1 - z0, { owner }, 2), at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] };
};
const sDisc = (F, s0, s1, r, { tone = "hi", extra = "", owner, bevel = 0 } = {}) => ({ svg: S(G.disc(s0, s1, r, F, P, { bevel }), { tone }) + extra, shape: A.disc(F, s0, s1, r, { owner }), at: G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)) });
const sBall = (c, r, { tone = "hi", owner } = {}) => ({ svg: S(G.sphereOf(c, r, P, { steps: 32 }), { tone }), shape: A.ball(c, r, { owner }), at: c });

// Ayudantes de sólidos: dibujan con el kit y registran la forma verdadera para la auditoría.
function box(pid, [x0, y0, z0], [x1, y1, z1], { tone = "hi", bias = 0, r = 0.25, bevel = 0, steps = 2, extra = "", inner = "", ride, mat, owner } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = A.slab(plan, z0, z1 - z0, { owner }, steps);
  put(pid, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone, inner }) + extra, [shape], { bias, ride, mat });
  return shape;
}
function prism(pid, F, poly, s0, s1, { tone = "hi", bias = 0, extra = "", inner = "", ride, mat, owner } = {}) {
  const shape = A.prism(F, poly, s0, s1, { owner });
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const ref = G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.add3(G.mul3(F.u, cx), G.mul3(F.v, cy)));
  put(pid, ref, S(G.prismOf(F, poly, s0, s1, P), { tone, inner }) + extra, [shape], { bias, ride, mat });
  return shape;
}
function disc(pid, F, s0, s1, r, { tone = "hi", bias = 0, extra = "", inner = "", ride, mat, owner, bevel = 0 } = {}) {
  const shape = A.disc(F, s0, s1, r, { owner });
  put(pid, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.disc(s0, s1, r, F, P, { bevel }), { tone, inner }) + extra, [shape], { bias, ride, mat });
  return shape;
}
function turned(pid, F, profile, { tone = "hi", bias = 0, extra = "", inner = "", ride, mat, owner } = {}) {
  const shape = A.solid(F, profile, { owner });
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  put(pid, G.add3(F.o, G.mul3(F.a, mid)), S(G.solidOf(profile, F, P), { tone, inner }) + extra, [shape], { bias, ride, mat });
  return shape;
}
function ringPart(pid, F, s0, s1, rIn, rOut, { tone = "hi", bias = 0, extra = "", ride, mat, owner } = {}) {
  const shape = A.ring(F, s0, s1, rIn, rOut, { owner });
  put(pid, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.ringBand(s0, s1, rIn, rOut, F, P), { tone }) + extra, [shape], { bias, ride, mat });
  return shape;
}
// Resorte helicoidal vertical: alambre visto, mitad trasera tenue y mitad delantera marcada.
function coilUp(pid, cx, cy, r, z0, z1, turns, { bias = 0, ride } = {}) {
  const toward = k.towardViewer(P);
  const back = [];
  const front = [];
  const n = Math.round(turns * 28);
  let run = [];
  let facing = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const p = [cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + (z1 - z0) * t];
    const f = Math.cos(a) * toward[0] + Math.sin(a) * toward[1] > 0;
    if (facing !== null && f !== facing) {
      run.push(at(p));
      (facing ? front : back).push(run);
      run = [];
    }
    facing = f;
    run.push(at(p));
  }
  if (run.length > 1) (facing ? front : back).push(run);
  const d = (runs) => runs.map((pts) => "M" + pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("L")).join("");
  const seat = (z) => Ln(k.sideArc(cx, cy, r, z, P, 16), { tone: "mid" });
  const svg = `<path class="coil-back" d="${d(back)}"/><path class="coil-front" d="${d(front)}"/>` + seat(z0) + seat(z1);
  put(pid, [cx, cy, (z0 + z1) / 2], svg, [A.cylinder(cx, cy, r, z0, z1 - z0)], { bias, ride });
}

// ---------------------------------------------------------------------------
// Vía: balasto y durmientes (fondo, nunca tapan nada), rieles en el orden de pintado.
const BACK = [];
const TIE_Z = [-16.1, -7.3];
const TIE_X = [];
for (let x = -444; x <= 444; x += 24) TIE_X.push(x);
{
  const bed = { x: -470, y: -78, w: 940, d: 156, r: 6 };
  BACK.push(`<path class="iso-halo" d="${k.haloOf(bed, -22, 6, P)}"/>`);
  BACK.push(`<g class="it-static" data-mat="balasto">${S(k.slabOf(bed, -22, 8, P, 6, 0), { tone: "lo" })}</g>`);
  const stones = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1500; i++) {
    const x = -466 + rnd() * 932;
    const y = -74 + rnd() * 148;
    if (TIE_X.some((tx) => Math.abs(x - tx) < 6.2) && Math.abs(y) < 53) continue;
    stones.push(at([x, y, -14]));
  }
  BACK.push(`<g data-mat="balasto">${Dots(stones, { size: 0.55, tone: "mid" })}</g>`);
  const ties = [...TIE_X].sort((a, b) => k.depthOf([a, 0, 0], P) - k.depthOf([b, 0, 0], P));
  for (const x of ties) {
    const plan = { x: x - 5.2, y: -52, w: 10.4, d: 104, r: 0.8 };
    STATIC_SHAPES.push(A.slab(plan, TIE_Z[0], TIE_Z[1] - TIE_Z[0], { name: `stand.durmiente${x}` }, 3));
    const pads = [-1, 1].map((s) => {
      const pad = { x: x - 4, y: s * RAIL_Y - 4.2, w: 8, d: 8.4, r: 0.3 };
      return S(k.slabOf(pad, TIE_Z[1], 0.01, P, 2), { tone: "mid", flat: true }) + Dots([at([x - 2.6, s * RAIL_Y - 3.4, TIE_Z[1]]), at([x + 2.6, s * RAIL_Y + 3.4, TIE_Z[1]]), at([x + 2.6, s * RAIL_Y - 3.4, TIE_Z[1]]), at([x - 2.6, s * RAIL_Y + 3.4, TIE_Z[1]])], { size: 0.7, tone: "hi" });
    });
    BACK.push(`<g data-mat="durmiente">${S(k.slabOf(plan, TIE_Z[0], TIE_Z[1] - TIE_Z[0], P, 3, 0.4), { tone: "mid" })}${pads.join("")}</g>`);
  }
}
const RAIL_PROFILE = [
  [[-1.45, -1.9], [1.45, -1.9], [1.45, 0], [-1.45, 0]],
  [[-0.42, -5.8], [0.42, -5.8], [0.42, -1.9], [-0.42, -1.9]],
  [[-3.0, -7.3], [3.0, -7.3], [3.0, -6.6], [1.0, -5.8], [-1.0, -5.8], [-3.0, -6.6]],
];
const RAIL_X = [-470, 470];
part("riel.lejano", "riel", { asm: "via", spring: "via", l2: false, mat: "riel" });
part("riel.cercano", "riel", { asm: "via", spring: "via", l2: false, mat: "riel" });
for (const s of [-1, 1]) {
  const pid = s > 0 ? "riel.cercano" : "riel.lejano";
  RAIL_PROFILE.forEach((poly, i) => {
    const F = XAX([0, s * RAIL_Y, 0]);
    const shape = A.prism(F, poly, RAIL_X[0], RAIL_X[1], { name: `stand.riel${s}.${i}` });
    put(pid, [0, s * RAIL_Y, i === 0 ? -1 : i === 1 ? -4 : -6.5], S(G.prismOf(F, poly, RAIL_X[0], RAIL_X[1], P), { tone: i === 0 ? "hi" : "mid" }), [shape], { bias: -0.2 * i });
  });
}

// ---------------------------------------------------------------------------
// Bogíe de tres piezas (Barber / ASF tipo ride control) con frenos montados en el bogíe (TMX).
function truck(tag, X0) {
  const end = tag; // "A" (x < 0) o "B" (x > 0)
  const spring = `bogie${end}`;
  const asm = "bogies";
  const l2 = end === "B";
  const id = (s) => `b${end}.${s}`;
  const sideSign = { N: 1, F: -1 }; // cercano / lejano
  // Piezas del bogíe (vector de nivel 2 relativo, en el despiece del ensamble)
  for (const sd of ["N", "F"]) {
    const s = sideSign[sd];
    part(id(`bastidor${sd}`), "bastidor", { asm, spring, l2, v2: [0, s * 36, 0], mat: "bogie" });
    part(id(`resortes${sd}`), "resortes", { asm, spring, l2, v2: [0, s * 70, -4], mat: "resorte" });
    part(id(`cunas${sd}`), "cuna", { asm, spring, l2, v2: [0, s * 58, 6], mat: "bogie" });
    part(id(`apoyo${sd}`), "apoyoBogie", { asm, spring, l2, v2: [0, 0, 52], mat: "goma" });
    for (const ax of ["0", "1"]) {
      part(id(`adaptador${sd}${ax}`), "adaptador", { asm, spring, l2, v2: [0, 0, 16], mat: "bogie" });
      part(id(`rodamiento${sd}${ax}`), "rodamiento", { asm, spring, l2, v2: [0, s * 14, 0], mat: "rodamiento" });
      part(id(`tapa${sd}${ax}`), "tapaRodamiento", { asm, spring, l2, v2: [0, s * 22, 0], mat: "acero" });
    }
  }
  part(id("travesano"), "travesano", { asm, spring, l2, v2: [0, 0, 36], mat: "bogie" });
  part(id("eje0"), "ejeMontado", { asm, spring, l2, v2: [-38, 0, 0], mat: "rueda" });
  part(id("eje1"), "ejeMontado", { asm, spring, l2, v2: [38, 0, 0], mat: "rueda" });
  // Frenos del bogíe: pertenecen al ensamble de frenos pero viajan con el bogíe (ride).
  const fb = (s) => `f${end}.${s}`;
  const fl2 = end === "B";
  for (const bm of ["0", "1"]) {
    const sx = bm === "0" ? -1 : 1;
    // en el despiece de frenos las piezas del bogíe bajan o se abren hacia afuera: arriba pasa la tubería general
    part(fb(`viga${bm}`), "vigaFreno", { asm: "frenos", spring, l2: fl2, v2: [0, 0, -22], mat: "acero" });
    part(fb(`palanca${bm}`), "palanca", { asm: "frenos", spring, l2: fl2, v2: [-sx * 6, 0, -12], mat: "acero" });
    for (const [sd, s] of [["N", 1], ["F", -1]]) {
      part(fb(`cabeza${bm}${sd}`), "cabezaFreno", { asm: "frenos", spring, l2: fl2, v2: [0, s * 10, 0], mat: "acero" });
      part(fb(`zapata${bm}${sd}`), "zapata", { asm: "frenos", spring, l2: fl2, v2: [sx * 12, 0, 0], mat: "zapata" });
    }
  }
  part(fb("varilla"), "timoneria", { asm: "frenos", spring, l2: fl2, v2: [0, 0, -30], mat: "acero" });
  part(fb("ajustador"), "ajustador", { asm: "frenos", spring, l2: fl2, v2: [0, 0, -30], mat: "acero" });
  part(fb("cilindro"), "cilindro", { asm: "frenos", spring, l2: fl2, v2: [16, 0, 0], mat: "cilindro" });

  // Ejes montados
  for (const [ax, dx] of [["0", -AXLE], ["1", AXLE]]) {
    const F = YAX([X0 + dx, 0, WR]);
    const pid = id(`eje${ax}`);
    const owner = pid;
    const near = [[27.2, 19.3], [28.0, 19.3], [28.7, WR], [32.8, WR], [32.8, 6.4], [33.6, 6.4]];
    const far = near.map(([s, r]) => [-s, r]).reverse();
    // la rueda lejana se parte en la raíz de la pestaña: la zapata queda entre la banda y la pestaña
    const farRim = far.slice(0, 4);
    const farFlange = far.slice(3);
    const face = Ln(G.circleOf(F, 32.8, 15.4, P, 64) + G.circleOf(F, 32.8, 8.2, P, 40), { tone: "faint" });
    turned(pid, F, farRim, { tone: "hi", owner });
    turned(pid, F, farFlange, { tone: "hi", owner, bias: 0.05 });
    disc(pid, F, -27.2, 27.2, 3.4, { tone: "mid", owner, bias: -0.2 });
    turned(pid, F, near, { tone: "hi", owner, extra: face + Dots(G.dotsOf(F, 33.6, 4.6, 6, P, { all: true }), { size: 0.45, tone: "mid" }) });
    // Rodamientos, tapas y adaptadores en ambos muñones
    for (const sd of ["N", "F"]) {
      const s = sideSign[sd];
      const s0 = s * 33.6;
      const s1 = s * 40.0;
      disc(id(`rodamiento${sd}${ax}`), F, Math.min(s0, s1), Math.max(s0, s1), 4.6, { tone: "hi", inner: Ln(G.arcOf(F, s * 35.2, 4.6, P) + G.arcOf(F, s * 38.6, 4.6, P), { tone: "faint" }) });
      const c0 = s * 40.0;
      const c1 = s * 40.9;
      disc(id(`tapa${sd}${ax}`), F, Math.min(c0, c1), Math.max(c0, c1), 3.7, { tone: "mid", extra: s > 0 ? Dots(G.dotsOf(F, c1, 2.4, 3, P, { all: true, phase: 0.5 }), { size: 0.55, tone: "hi" }) + Ln(G.circleOf(F, c1, 1.2, P, 20), { tone: "lo" }) : "" });
      const ya = s > 0 ? [34.2, 39.8] : [-39.8, -34.2];
      box(id(`adaptador${sd}${ax}`), [X0 + dx - 4.5, ya[0], WR + 4.6], [X0 + dx + 4.5, ya[1], WR + 4.6 + 2.6], { tone: "mid", bevel: 0.3 });
    }
  }

  // Bastidores laterales: piezas convexas en el plano x–z extruidas a lo ancho.
  for (const sd of ["N", "F"]) {
    const s = sideSign[sd];
    const pid = id(`bastidor${sd}`);
    const y0 = s > 0 ? 34.75 : -39.25;
    const y1 = y0 + 4.5;
    const F = YAX([X0, 0, 0]);
    const owner = pid;
    const pieces = [
      [[28.5, 25.5], [42.5, 25.5], [42.5, 31], [28.5, 31]],
      [[-42.5, 25.5], [-28.5, 25.5], [-28.5, 31], [-42.5, 31]],
      [[28.5, 21], [31, 21], [31, 25.5], [28.5, 25.5]],
      [[40, 21], [42.5, 21], [42.5, 25.5], [40, 25.5]],
      [[-31, 21], [-28.5, 21], [-28.5, 25.5], [-31, 25.5]],
      [[-42.5, 21], [-40, 21], [-40, 25.5], [-42.5, 25.5]],
      [[-28.5, 27], [28.5, 27], [28.5, 31], [-28.5, 31]],
      [[12, 10.5], [16, 10.5], [16, 27], [12, 27]],
      [[-16, 10.5], [-12, 10.5], [-12, 27], [-16, 27]],
      [[-16, 7.5], [16, 7.5], [16, 10.5], [-16, 10.5]],
      [[16, 7.5], [31, 21], [28.5, 21], [16, 10.5]],
      [[-16, 7.5], [-16, 10.5], [-28.5, 21], [-31, 21]],
    ];
    for (const poly of pieces) {
      const cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      const dotsFace = poly === pieces[6] && s > 0 ? Dots([-20, -8, 8, 20].map((x) => at([X0 + x, y1, 29])), { size: 0.5, tone: "mid" }) : "";
      prism(pid, F, poly, y0, y1, { tone: "hi", owner, extra: dotsFace, bias: cz > 26 ? 0.05 : 0 });
    }
    // asiento de resortes, más ancho que el bastidor
    const ys = s > 0 ? [33.6, 41.0] : [-41.0, -33.6];
    box(pid, [X0 - 12, ys[0], 10.5], [X0 + 12, ys[1], 11.5], { tone: "mid", owner });
    // grupo de resortes 2 × 3
    const yc = s > 0 ? [35.6, 38.8] : [-38.8, -35.6];
    for (const y of yc) for (const x of [-6, 0, 6]) coilUp(id(`resortes${sd}`), X0 + x, y, 1.5, 11.5, 19, 4.5);
    // cuñas de fricción contra las columnas
    for (const sx of [-1, 1]) {
      const poly = sx > 0 ? [[10, 17], [12, 17.8], [12, 23], [10, 23]] : [[-12, 17.8], [-10, 17], [-10, 23], [-12, 23]];
      prism(id(`cunas${sd}`), F, poly, s > 0 ? 35.2 : -38.8, s > 0 ? 38.8 : -35.2, { tone: "mid" });
    }
  }

  // Travesaño del bogíe
  {
    const pid = id("travesano");
    const owner = pid;
    box(pid, [X0 - 10, -33.5, 14.5], [X0 + 10, 33.5, 25.4], { tone: "hi", owner, bevel: 0.4, steps: 2, inner: Ln(k.sideSeam({ x: X0 - 10, y: -33.5, w: 20, d: 67, r: 0.25 }, 20.5, P, 2), { tone: "faint" }) });
    for (const s of [-1, 1]) box(pid, [X0 - 10, s > 0 ? 33.5 : -40.5, 19], [X0 + 10, s > 0 ? 40.5 : -33.5, 25], { tone: "hi", owner });
    ringPart(pid, ZAX([X0, 0, 0]), 25.4, 26.4, 6.3, 7.6, { tone: "mid", owner, bias: 0.1, extra: Ln(k.ring(X0, 0, 5.2, 25.42, P, 40), { tone: "faint" }) });
    for (const [sd, s] of [["N", 1], ["F", -1]]) {
      const ys = s > 0 ? [22.5, 27.5] : [-27.5, -22.5];
      box(id(`apoyo${sd}`), [X0 - 3.2, ys[0], 25.4], [X0 + 3.2, ys[1], 27.2], { tone: "mid", bevel: 0.3, extra: Ln(k.planOutline({ x: X0 - 2.2, y: ys[0] + 1, w: 4.4, d: 3, r: 0.4 }, 27.2, P, 3), { tone: "faint" }) });
    }
  }

  // Frenos montados en el bogíe
  for (const [bm, sx] of [["0", -1], ["1", 1]]) {
    const xa = X0 + sx * 12.6;
    const xb = X0 + sx * 14.4;
    box(fb(`viga${bm}`), [Math.min(xa, xb), -29, 16.8], [Math.max(xa, xb), 29, 19.8], { tone: "hi", bevel: 0.3 });
    for (const [sd, s] of [["N", 1], ["F", -1]]) {
      const yh = s > 0 ? [29, 33] : [-33, -29];
      const xh = [X0 + sx * 12.6, X0 + sx * 16.0];
      box(fb(`cabeza${bm}${sd}`), [Math.min(...xh), yh[0], 15.8], [Math.max(...xh), yh[1], 20.8], { tone: "mid" });
      const ys = s > 0 ? [28.6, 32.6] : [-32.6, -28.6];
      const xs = [X0 + sx * 16.0, X0 + sx * 17.2];
      box(fb(`zapata${bm}${sd}`), [Math.min(...xs), ys[0], 14.3], [Math.max(...xs), ys[1], 22.3], { tone: "hi" });
    }
    const xl = [X0 + sx * 11.6, X0 + sx * 12.6];
    box(fb(`palanca${bm}`), [Math.min(...xl), 5, 11], [Math.max(...xl), 7, 21], { tone: "hi", extra: Dots([at([X0 + sx * 12.1, 7, 12]), at([X0 + sx * 12.1, 7, 18.3])], { size: 0.5, tone: "mid" }) });
  }
  {
    const F = XAX([X0, 6, 12]);
    disc(fb("varilla"), F, -11.6, -4, 0.6, { tone: "hi" });
    disc(fb("varilla"), F, 4, 11.6, 0.6, { tone: "hi" });
    disc(fb("ajustador"), F, -4, 4, 1.3, { tone: "hi", inner: Ln(G.arcOf(F, -1.5, 1.3, P) + G.arcOf(F, 1.5, 1.3, P), { tone: "faint" }) });
    const C = XAX([X0, -8, 18.3]);
    disc(fb("cilindro"), C, 14.4, 23.4, 2.6, { tone: "hi", inner: Ln(G.arcOf(C, 16.4, 2.6, P), { tone: "faint" }) });
    disc(fb("cilindro"), C, 23.4, 24.4, 2.9, { tone: "mid", extra: Dots(G.dotsOf(C, 24.4, 2.3, 8, P, { all: true }), { size: 0.4, tone: "mid" }) });
  }
  L2[asm] = L2[asm] ?? [];
}
truck("A", -TRUCK_X);
truck("B", TRUCK_X);
L2.bogies = {
  anchor: "bB.travesano",
  order: ["bB.tapaN0", "bB.tapaN1", "bB.tapaF0", "bB.tapaF1", "bB.resortesN", "bB.cunasN", "bB.resortesF", "bB.cunasF", "bB.bastidorN", "bB.bastidorF", "bB.apoyoN", "bB.apoyoF", "bB.travesano", "bB.adaptadorN0", "bB.adaptadorN1", "bB.adaptadorF0", "bB.adaptadorF1", "bB.rodamientoN0", "bB.rodamientoN1", "bB.rodamientoF0", "bB.rodamientoF1", "bB.eje0", "bB.eje1"],
};
// El travesaño queda fijo en el despiece del bogíe: lo demás se aparta de él.
PARTS["bB.travesano"].v2 = [0, 0, 0];
PARTS["bB.apoyoN"].v2 = [0, 0, 16];
PARTS["bB.apoyoF"].v2 = [0, 0, 16];

// ---------------------------------------------------------------------------
// Estructura: vigas de tiro, travesaños pivote, placas centrales y apoyos laterales del carro.
const SILL = { x0: 248, x1: 343, top: 46, plate: 43, bottom: 27, web: [9.5, 12] };
const BOLSTER_HALF = 6;
for (const [end, sx] of [["A", -1], ["B", 1]]) {
  const asm = "estructura";
  const l2 = end === "B";
  const X = (x) => sx * x;
  const span = (a, b) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
  const sill = part(`e${end}.viga`, "vigaTiro", { asm, l2, mat: "acero" });
  const filler = part(`e${end}.relleno`, "rellenoCentral", { asm, l2, v2: [0, 0, -26], mat: "acero" });
  const centre = part(`e${end}.placa`, "placaCentral", { asm, l2, v2: [0, 0, -40], mat: "acero" });
  const owner = `e${end}.viga`;
  const [sx0, sx1] = span(SILL.x0, SILL.x1);
  const seamTop = Ln(k.sideSeam({ x: sx0, y: -13, w: sx1 - sx0, d: 26, r: 0.25 }, SILL.plate + 1.5, P, 2), { tone: "faint" });
  box(sill, [sx0, -13, SILL.plate], [sx1, 13, SILL.top], { tone: "hi", owner, bevel: 0.4, extra: Dots([0.15, 0.32, 0.5, 0.68, 0.85].flatMap((t) => [at([sx0 + (sx1 - sx0) * t, 10.5, SILL.top]), at([sx0 + (sx1 - sx0) * t, -10.5, SILL.top])]), { size: 0.45, tone: "mid" }) });
  for (const s of [-1, 1]) {
    const ys = s > 0 ? SILL.web : [-SILL.web[1], -SILL.web[0]];
    box(sill, [sx0, ys[0], SILL.bottom], [sx1, ys[1], SILL.plate], { tone: "hi", owner, inner: s > 0 ? seamTop : "" });
  }
  // cara de choque (striker): barra superior y dos mejillas; abajo queda abierta para el vástago del acoplador
  const [kx0, kx1] = span(SILL.x1, SILL.x1 + 3);
  // la boca de la cara de choque deja salir recto al aparato de choque y al yugo
  box(sill, [kx0, -13, 42.2], [kx1, 13, SILL.top], { tone: "hi", owner, bevel: 0.4 });
  for (const s of [-1, 1]) box(sill, [kx0, s > 0 ? 7.6 : -12, SILL.bottom], [kx1, s > 0 ? 12 : -7.6, 42.2], { tone: "hi", owner });
  // relleno central entre almas sobre la placa central
  const bx = span(TRUCK_X - BOLSTER_HALF, TRUCK_X + BOLSTER_HALF);
  box(filler, [bx[0], -SILL.web[0], SILL.bottom], [bx[1], SILL.web[0], SILL.plate], { tone: "mid" });
  disc(centre, ZAX([X(TRUCK_X), 0, 0]), 25.4, 27.0, 6.0, { tone: "hi", bevel: 0.3 });
  // travesaño pivote: dos brazos que nacen de las almas de la viga
  for (const [sd, s] of [["N", 1], ["F", -1]]) {
    const arm = part(`e${end}.travesano${sd}`, "travesanoPivote", { asm, l2, v2: [0, s * 48, 0], mat: "acero" });
    const poly = [[13, 31.6], [32, 31.6], [50, 36], [50, SILL.top], [13, SILL.top]].map(([y, z]) => [s * y, z]);
    const F = XAX([0, 0, 0]);
    prism(arm, F, poly, bx[0], bx[1], { tone: "hi", extra: s > 0 ? Dots([20, 30, 40].map((y) => at([X(TRUCK_X), y, SILL.top])), { size: 0.5, tone: "mid" }) : "" });
    const ap = part(`e${end}.apoyo${sd}`, "apoyoCarro", { asm, l2, v2: [0, 0, -22], mat: "acero" });
    const ys = s > 0 ? [22.5, 27.5] : [-27.5, -22.5];
    box(ap, [X(TRUCK_X) - 3.2, ys[0], 27.2], [X(TRUCK_X) + 3.2, ys[1], 31.6], { tone: "mid", bevel: 0.3 });
  }
  L2.estructura = L2.estructura ?? { anchor: "eB.viga", order: ["eB.apoyoN", "eB.apoyoF", "eB.placa", "eB.relleno", "eB.travesanoN", "eB.travesanoF"] };
}
// El relleno no puede bajar a través de la placa central: sale después de ella.

// ---------------------------------------------------------------------------
// Tanque. Eje a 2.8 m sobre el riel; virola cilíndrica y cabezales semielípticos 2:1.
const C = 112;
const RJ = M.tankOD / 2; // 64.98, sobre la chaqueta
const CYL = 269.5; // media longitud de la parte cilíndrica (tanque de 15.1 m entre cabezales)
const LAYER = { chaqueta: [0, M.jacket], aislamiento: [M.jacket, M.jacket + M.insulation], virola: [M.jacket + M.insulation, M.jacket + M.insulation + M.shell] };
const TF = XAX([0, 0, C]);
// Superficie de revolución con cabezales: radio r0 en el cilindro, fondo de cabezal r0/2 (2:1).
function hull(r0, depth = r0 / 2) {
  const tip = CYL + depth;
  const radius = (s) => {
    const a = Math.abs(s);
    if (a <= CYL) return r0;
    const u = Math.min(1, (a - CYL) / depth);
    return r0 * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const slope = (s) => {
    const a = Math.abs(s);
    if (a <= CYL) return 0;
    const u = Math.min(0.9995, (a - CYL) / depth);
    return (-Math.sign(s) * r0 * u) / (depth * Math.sqrt(1 - u * u));
  };
  // el último nudo queda a 1/10 000 del ápice: un ápice de radio cero rompe el sombreado suave
  const headS = (n) => Array.from({ length: n + 1 }, (_, i) => CYL + depth * Math.min(0.99995, Math.sin((i / n) * (Math.PI / 2))));
  return { r0, depth, tip, radius, slope, headS };
}
function profileOf(h, from = -h.tip, to = h.tip, n = 26) {
  const right = h.headS(n).filter((s) => s >= from && s <= to);
  const left = h.headS(n).map((s) => -s).filter((s) => s >= from && s <= to).reverse();
  const pts = [...left, ...[from, to].filter((s) => Math.abs(s) <= CYL)].sort((a, b) => a - b);
  const all = [...new Set([...pts, ...right].map((s) => +s.toFixed(4)))].sort((a, b) => a - b);
  return all.map((s) => [s, h.radius(s), 1]);
}
// Forma registrada de una cáscara delgada (exterior r0, interior r0 - t).
function thinShell(outer, inner, from, to, meta) {
  const o = profileOf(outer, from, to, 30).map(([s, r]) => [s, r]);
  const i = profileOf(inner, Math.max(from, -inner.tip), Math.min(to, inner.tip), 30).map(([s, r]) => [s, r]).reverse();
  return A.body(TF, [[o[0][0], 0], ...o, [o[o.length - 1][0], 0], [i[0][0], 0], ...i, [i[i.length - 1][0], 0]], meta);
}
// Partición de chaqueta y aislamiento: plano que contiene el eje del tanque y la dirección de la vista.
// Visto de canto, su corte es la línea del eje en pantalla; cada mitad es de 180° y sale por la normal SPLIT_N.
const SPLIT_N = G.unit3(G.cross3([1, 0, 0], V));
const SPLIT_U = G.unit3([0, V[1], V[2]]);
function axisClips(h, id) {
  const a = at([-500, 0, C]);
  const b = at([500, 0, C]);
  const far = 4000;
  const up = [a, b, [b[0], b[1] - far], [a[0], a[1] - far]];
  const dn = [a, b, [b[0], b[1] + far], [a[0], a[1] + far]];
  const d = (list) => "M" + list.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L") + "Z";
  const seam = [];
  for (const [s] of profileOf(h, -h.tip, h.tip, 40)) {
    const r = h.radius(s);
    const n = [-h.slope(s), SPLIT_U[1], SPLIT_U[2]];
    if (G.dot3(G.unit3(n), V) > 0.02) seam.push(at([s, r * SPLIT_U[1], C + r * SPLIT_U[2]]));
  }
  return {
    up: `<clipPath id="${id}-up" clipPathUnits="userSpaceOnUse"><path d="${d(up)}"/></clipPath>`,
    down: `<clipPath id="${id}-dn" clipPathUnits="userSpaceOnUse"><path d="${d(dn)}"/></clipPath>`,
    run: "M" + seam.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L"),
  };
}
function bodyPaths(h) {
  return G.solidOf(profileOf(h, -h.tip, h.tip, 26), TF, P, { smooth: { slope: h.slope, radius: h.radius, rows: 8 } });
}
const JACKET = hull(RJ);
const JACKET_IN = hull(RJ - M.jacket, RJ / 2 - M.jacket);
const INSUL = JACKET_IN;
const INSUL_IN = hull(RJ - LAYER.aislamiento[1], RJ / 2 - LAYER.aislamiento[1]);
const SHELL = INSUL_IN;
const SHELL_IN = hull(RJ - LAYER.virola[1], RJ / 2 - LAYER.virola[1]);
const FULL_JACKET = A.body(TF, [[-JACKET.tip, 0], ...profileOf(JACKET, -JACKET.tip, JACKET.tip, 30).map(([s, r]) => [s, r]), [JACKET.tip, 0]], { name: "tanque.forma" });
const FULL_SHELL = A.body(TF, [[-SHELL.tip, 0], ...profileOf(SHELL, -SHELL.tip, SHELL.tip, 30).map(([s, r]) => [s, r]), [SHELL.tip, 0]], { name: "tanque.formaVirola" });
const BELOW = () => A.orientedBox(G.add3([0, 0, C], G.mul3(SPLIT_N, -200)), [[1, 0, 0], SPLIT_U, SPLIT_N], [500, 300, 200], { name: "tanque.semiespacio" });
const ABOVE = () => A.orientedBox(G.add3([0, 0, C], G.mul3(SPLIT_N, 200)), [[1, 0, 0], SPLIT_U, SPLIT_N], [500, 300, 200], { name: "tanque.semiespacio" });
{
  const asm = "tanque";
  const owner = "tanque.cuerpo";
  part("t.chaquetaSup", "chaqueta", { asm, v2: G.mul3(SPLIT_N, 150).map((v) => +v.toFixed(2)), mat: "negro" });
  part("t.chaquetaInf", "chaqueta", { asm, mat: "negro" });
  part("t.aislamientoSup", "aislamiento", { asm, l1: false, v2: G.mul3(SPLIT_N, 76).map((v) => +v.toFixed(2)), mat: "aislante" });
  part("t.aislamientoInf", "aislamiento", { asm, l1: false, mat: "aislante" });
  part("t.virola", "virola", { asm, l1: false, mat: "primer" });
  part("t.cabezalA", "cabezal", { asm, l1: false, mat: "primer" });
  part("t.cabezalB", "cabezal", { asm, l1: false, mat: "primer" });
  part("t.escudoA", "escudo", { asm, v2: [-74, 0, 0], mat: "negro" });
  part("t.escudoB", "escudo", { asm, v2: [74, 0, 0], mat: "negro" });
  part("t.sumidero", "sumidero", { asm, ride2: "t.virola", mat: "acero" });
  part("t.placaA", "placaRefuerzo", { asm, ride2: "t.chaquetaInf", mat: "acero" });
  part("t.placaB", "placaRefuerzo", { asm, ride2: "t.chaquetaInf", mat: "acero" });
  L2.tanque = { anchor: "t.virola", order: ["t.escudoA", "t.escudoB", "t.chaquetaSup", "t.aislamientoSup"] };

  // chaqueta: un solo cuerpo liso, dibujado dos veces y recortado por el ecuador
  const jp = bodyPaths(JACKET);
  const jc = axisClips(JACKET, "cj");
  const seams = Ln([-210, -150, -90, -30, 30, 90, 150, 210].map((s) => G.arcOf(TF, s, RJ, P)).join("") + G.arcOf(TF, -CYL, RJ, P) + G.arcOf(TF, CYL, RJ, P), { tone: "faint" });
  const jacketSvg = S(jp, { tone: "hi", inner: seams });
  const jUp = thinShell(JACKET, JACKET_IN, -JACKET.tip, JACKET.tip, { owner });
  jUp.cut = [BELOW()];
  const jDn = thinShell(JACKET, JACKET_IN, -JACKET.tip, JACKET.tip, { owner });
  jDn.cut = [ABOVE()];
  put("t.chaquetaInf", [0, 0, C - 30], `<defs>${jc.down}</defs><g clip-path="url(#cj-dn)">${jacketSvg}</g>`, [jDn], { bias: 0.6 });
  put("t.chaquetaSup", [0, 0, C + 30], `<defs>${jc.up}</defs><g clip-path="url(#cj-up)">${jacketSvg}</g>${Ln(jc.run, { tone: "faint" })}`, [jUp], { bias: 0.6 });

  // aislamiento (solo se ve en el despiece del tanque y en el corte)
  const ip = bodyPaths(INSUL);
  const ic = axisClips(INSUL, "ca");
  const quilt = Ln([-240, -180, -120, -60, 0, 60, 120, 180, 240].map((s) => G.arcOf(TF, s, INSUL.r0, P)).join(""), { tone: "faint" });
  const insulSvg = S(ip, { tone: "hi", inner: quilt });
  const iUp = thinShell(INSUL, INSUL_IN, -INSUL.tip, INSUL.tip, { owner });
  iUp.cut = [BELOW()];
  const iDn = thinShell(INSUL, INSUL_IN, -INSUL.tip, INSUL.tip, { owner });
  iDn.cut = [ABOVE()];
  put("t.aislamientoInf", [0, 0, C - 30], `<defs>${ic.down}</defs><g clip-path="url(#ca-dn)">${insulSvg}</g>`, [iDn], { bias: 0.3 });
  put("t.aislamientoSup", [0, 0, C + 30], `<defs>${ic.up}</defs><g clip-path="url(#ca-up)">${insulSvg}</g>${Ln(ic.run, { tone: "mid" })}`, [iUp], { bias: 0.3 });

  // virola y cabezales del recipiente
  const shellSeams = Ln([-201, -134, -67, 0, 67, 134, 201].map((s) => G.arcOf(TF, s, SHELL.r0, P)).join(""), { tone: "lo" });
  put("t.virola", [0, 0, C], S(G.disc(-CYL, CYL, SHELL.r0, TF, P), { tone: "hi", inner: shellSeams }), [A.ring(TF, -CYL, CYL, SHELL_IN.r0, SHELL.r0, { owner })], { bias: 0 });
  for (const [end, sx] of [["A", -1], ["B", 1]]) {
    const prof = profileOf(SHELL, sx < 0 ? -SHELL.tip : CYL, sx < 0 ? -CYL : SHELL.tip, 26);
    const paths = G.solidOf(prof, TF, P, { smooth: { slope: SHELL.slope, radius: SHELL.radius, rows: 6 } });
    const outerP = prof.map(([s, r]) => [s, r]);
    const innerP = profileOf(SHELL_IN, sx < 0 ? -SHELL_IN.tip : CYL, sx < 0 ? -CYL : SHELL_IN.tip, 26).map(([s, r]) => [s, r]).reverse();
    // cáscara: curva exterior de borde a ápice, eje, curva interior de vuelta; sin caras falsas en el borde
    const poly = sx > 0 ? [...outerP, [SHELL.tip, 0], [SHELL_IN.tip, 0], ...innerP.slice(1)] : [[-SHELL_IN.tip, 0], [-SHELL.tip, 0], ...outerP.slice(1), ...innerP.slice(0, -1)];
    put(`t.cabezal${end}`, [sx * (CYL + 12), 0, C], S(paths, { tone: "hi", inner: Ln(G.arcOf(TF, sx * (CYL + 0.4), SHELL.r0, P), { tone: "lo" }) }), [A.body(TF, poly, { owner })], { bias: 0.1 });
  }

  // escudos de cabezal de altura completa, 1/2 in sobre la chaqueta
  const SHIELD = hull(RJ + M.headShield, RJ / 2 + M.headShield);
  const SHIELD_EDGE = 6;
  for (const [end, sx] of [["A", -1], ["B", 1]]) {
    // el borde del escudo queda 150 mm dentro del cabezal: no asoma sobre la silueta de la chaqueta
    const E0 = CYL + SHIELD_EDGE;
    const prof = profileOf(SHIELD, sx < 0 ? -SHIELD.tip : E0, sx < 0 ? -E0 : SHIELD.tip, 26);
    const paths = G.solidOf(profileOf(SHIELD, sx < 0 ? -SHIELD.tip : E0, sx < 0 ? -E0 : SHIELD.tip, 60), TF, P, { smooth: { slope: SHIELD.slope, rows: 8 } });
    const outerP = prof.map(([s, r]) => [s, r]);
    const innerP = profileOf(JACKET, sx < 0 ? -JACKET.tip : E0, sx < 0 ? -E0 : JACKET.tip, 26).map(([s, r]) => [s, r]).reverse();
    const poly = sx > 0 ? [...outerP, [SHIELD.tip, 0], [JACKET.tip, 0], ...innerP.slice(1)] : [[-JACKET.tip, 0], [-SHIELD.tip, 0], ...outerP.slice(1), ...innerP.slice(0, -1)];
    const lip = Ln(G.arcOf(TF, sx * (E0 + 2), SHIELD.radius(E0 + 2), P, { slope: SHIELD.slope(sx * (E0 + 2)) }), { tone: "lo" });
    put(`t.escudo${end}`, [sx * (CYL + 20), 0, C], S(paths, { tone: "hi", inner: lip }), [A.body(TF, poly, { owner })], { bias: 1.2 });
  }

  // sumidero bajo el centro del fondo, con brida para la válvula inferior
  const Z0 = ZAX([0, 0, 0]);
  const sumpShape = A.disc(Z0, 42.6, C - SHELL.r0 + 1.4, 7.5, { owner });
  sumpShape.cut = [{ ...FULL_SHELL }];
  const flange = A.disc(Z0, 41.2, 42.6, 9.2, { owner });
  put("t.sumidero", [0, 0, 44], S(G.disc(42.6, 47.6, 7.5, Z0, P), { tone: "hi" }) + S(G.disc(41.2, 42.6, 9.2, Z0, P), { tone: "mid" }), [sumpShape, flange], { bias: -0.4 });

  // placas de refuerzo entre la viga de tiro y la chaqueta
  for (const [end, sx] of [["A", -1], ["B", 1]]) {
    const xs = [sx * SILL.x0, sx * 268.5].sort((a, b) => a - b);
    const top = C - Math.sqrt(RJ * RJ - 13 * 13) + 0.05;
    const shape = A.slab({ x: xs[0], y: -13, w: xs[1] - xs[0], d: 26, r: 0.25 }, SILL.top, top - SILL.top, { owner: `t.placa${end}` }, 2);
    shape.cut = [{ ...FULL_JACKET }];
    put(`t.placa${end}`, [(xs[0] + xs[1]) / 2, 0, SILL.top + 1], S(k.slabOf({ x: xs[0], y: -13, w: xs[1] - xs[0], d: 26, r: 0.25 }, SILL.top, top - SILL.top, P, 2), { tone: "mid" }), [shape], { bias: -0.3 });
  }
}

// Rombo de clase 3 con el número ONU, dibujado en el plano de la cara y = yf.
function placardSvg(x, yf, z) {
  const o = at([x, yf, z]);
  const ex = at([x + 1, yf, z]);
  const ey = at([x, yf, z - 1]);
  const m = [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]].map((v) => v.toFixed(4)).join(" ");
  const d = 7.7;
  const flame = "M0 -6.1 C0.9 -5.2 1.5 -4.5 1.3 -3.6 C1.2 -3.0 0.7 -2.6 0 -2.5 C-0.7 -2.6 -1.2 -3.0 -1.3 -3.6 C-1.4 -4.3 -0.8 -4.9 -0.4 -5.4 C-0.3 -4.9 0 -4.7 0.2 -4.7 C0.4 -5.1 0.2 -5.6 0 -6.1Z";
  return `<g class="placard" transform="matrix(${m})"><path class="pl-red" d="M0 ${-d}L${d} 0L0 ${d}L${-d} 0Z"/><path class="pl-rim" d="M0 ${-d + 0.6}L${d - 0.6} 0L0 ${d - 0.6}L${-d + 0.6} 0Z"/><path class="pl-white" d="${flame}"/><rect class="pl-panel" x="-5.4" y="-1.5" width="10.8" height="3" rx="0.2"/><text class="pl-num" x="0" y="0.95" text-anchor="middle">1993</text><text class="pl-cls" x="0" y="5.6" text-anchor="middle">3</text></g>`;
}

// ---------------------------------------------------------------------------
// Boquilla de la entrada de hombre (soldada al tanque) y accesorios superiores.
const TOP = C + RJ; // 177, parte alta de la chaqueta
const PAD_TOP = 178;
const HOUSING = { rIn: 23.2, rOut: 24.2, z0: PAD_TOP, z1: 187.8 };
const LID_TOP = 188.6; // altura extrema 4714 mm
const SADDLE_F = G.frameOf([0, 0, C], [0, 0, 1], [0, 1, 0], [1, 0, 0]);
{
  part("t.boquilla", "boquilla", { asm: "tanque", ride2: "t.chaquetaSup", mat: "acero" });
  const pad = A.disc(SADDLE_F, RJ - 26, PAD_TOP - C, 25.4, { owner: "tanque.cuerpo" });
  pad.cut = [{ ...FULL_JACKET }];
  const ring = Ln(k.ring(0, 0, 14.4, PAD_TOP, P, 64), { tone: "faint" });
  put("t.boquilla", [0, 0, TOP], S(G.saddleOf(SADDLE_F, 25.4, RJ, PAD_TOP - C, P), { tone: "hi" }) + ring, [pad], { bias: 0.2 });
}
{
  const asm = "accesorios";
  part("a.tapaCaja", "tapaCaja", { asm, v2: [0, 0, 96], mat: "negro" });
  part("a.caja", "caja", { asm, v2: [0, 0, 70], mat: "negro" });
  part("a.tapa", "tapaManway", { asm, mat: "acero" });
  part("a.tornillos", "tornillos", { asm, v2: [0, 0, 10], mat: "rodamiento" });
  part("a.prd", "prd", { asm, v2: [-4, 3, 34], mat: "inox" });
  part("a.vacio", "vacio", { asm, v2: [-4, -4, 24], mat: "inox" });
  part("a.liquido", "valvulaLiquido", { asm, v2: [6, 2, 30], mat: "bronce" });
  part("a.vapor", "valvulaVapor", { asm, v2: [3, -4, 20], mat: "bronce" });
  part("a.buzo", "tuboBuzo", { asm, l1: false, ride2: "a.tapa", mat: "acero" });
  L2.accesorios = { anchor: "a.tapa", order: ["a.tapaCaja", "a.caja", "a.prd", "a.liquido", "a.vacio", "a.vapor", "a.tornillos"] };
  const ZF = ZAX([0, 0, 0]);
  const tv = k.towardViewer(P);
  const tv3 = [tv[0], tv[1], 0];
  const side3 = [-tv[1], tv[0], 0];
  const half = (sign) => A.orientedBox(G.mul3(tv3, sign * 40), [tv3, side3, [0, 0, 1]], [40, 60, 200], { name: "a.semiespacio" });
  // caja protectora: anillo; la mitad delantera se vuelve a pintar sobre las válvulas
  const ringPaths = G.ringBand(HOUSING.z0, HOUSING.z1, HOUSING.rIn, HOUSING.rOut, ZF, P);
  const az = Math.atan2(tv[1], tv[0]);
  const arc = [];
  for (let i = 0; i <= 48; i++) {
    const t = az - Math.PI / 2 + (Math.PI * i) / 48;
    arc.push(at([HOUSING.rIn * Math.cos(t), HOUSING.rIn * Math.sin(t), HOUSING.z1]));
  }
  const [l, r] = [arc[0], arc[arc.length - 1]].sort((a, b) => a[0] - b[0]);
  const clipPts = [...arc, [arc[arc.length - 1][0] + (arc[arc.length - 1][0] > arc[0][0] ? 14 : -14), arc[arc.length - 1][1]], [arc[arc.length - 1][0] + (arc[arc.length - 1][0] > arc[0][0] ? 14 : -14), arc[arc.length - 1][1] + 120], [arc[0][0] + (arc[0][0] > arc[arc.length - 1][0] ? 14 : -14), arc[0][1] + 120], [arc[0][0] + (arc[0][0] > arc[arc.length - 1][0] ? 14 : -14), arc[0][1]]];
  void l, r;
  const clip = `<clipPath id="caja-frente" clipPathUnits="userSpaceOnUse"><path d="M${clipPts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L")}Z"/></clipPath>`;
  const seam = Ln(k.sideArc(0, 0, HOUSING.rOut, HOUSING.z0 + 4.5, P, 48), { tone: "lo" });
  const bolts = Dots(G.dotsOf(ZF, HOUSING.z0 + 1.4, HOUSING.rOut + 0.05, 24, P, { fade: [0.04, 0.42] }), { size: 0.45, tone: "mid" });
  const back = A.ring(ZF, HOUSING.z0, HOUSING.z1, HOUSING.rIn, HOUSING.rOut);
  back.cut = [half(1)];
  const front = A.ring(ZF, HOUSING.z0, HOUSING.z1, HOUSING.rIn, HOUSING.rOut);
  front.cut = [half(-1)];
  put("a.caja", [0, 0, 182], S(ringPaths, { tone: "hi", inner: seam }) + bolts, [back], { bias: -6 });
  put("a.caja", [0, 0, 182], `<defs>${clip}</defs><g clip-path="url(#caja-frente)">${S(ringPaths, { tone: "hi", inner: seam }) + bolts}</g>`, [front], { bias: 6 });
  // tapa abatible con bisagras del lado A
  const hinge = [-1, 1].map((s) => sDisc(G.frameOf([-24.9, s * 8, HOUSING.z1 + 0.4], [0, 1, 0], [1, 0, 0], [0, 0, 1]), -2.4, 2.4, 0.9, { tone: "mid" }));
  multi("a.tapaCaja", [sDisc(ZF, HOUSING.z1, LID_TOP, 24.6, { tone: "hi", bevel: 0.5, extra: Ln(k.ring(0, 0, 20.5, LID_TOP, P, 64), { tone: "lo" }) + Dots([at([20, 4, LID_TOP]), at([20, -4, LID_TOP])], { size: 0.6, tone: "mid" }) }), ...hinge]);
  // tapa de la entrada de hombre y sus tornillos abatibles
  disc("a.tapa", ZF, PAD_TOP, 179.6, 13.6, { tone: "hi", bevel: 0.4, extra: Ln(k.ring(0, 0, 11.4, 179.6, P, 56), { tone: "faint" }) });
  // los tornillos rodean las válvulas: los de atrás y los de adelante se pintan por separado
  const swing = [[], []];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2 + 0.1;
    const x = 14.6 * Math.cos(t);
    const y = 14.6 * Math.sin(t);
    const front = x * tv[0] + y * tv[1] > 0 ? 1 : 0;
    swing[front].push(sDisc(ZAX([x, y, 0]), PAD_TOP, 181.4, 0.5, { tone: "mid" }));
    swing[front].push(sDisc(ZAX([x, y, 0]), 179.6, 180.7, 1.0, { tone: "hi" }));
  }
  multi("a.tornillos", swing[0]);
  multi("a.tornillos", swing[1]);
  // válvula de alivio de presión
  const PX = [-7, 5];
  multi("a.prd", [sDisc(ZAX([PX[0], PX[1], 0]), 179.6, 180.4, 2.9, { tone: "mid", extra: Dots(G.dotsOf(ZAX([PX[0], PX[1], 0]), 180.4, 2.4, 6, P, { all: true }), { size: 0.4, tone: "mid" }) }), sDisc(ZAX([PX[0], PX[1], 0]), 180.4, 184.2, 2.1, { tone: "hi" }), sDisc(ZAX([PX[0], PX[1], 0]), 184.2, 185.6, 2.6, { tone: "hi", bevel: 0.4 })]);
  // válvula de vacío
  const VX = [-7.5, -6];
  multi("a.vacio", [sDisc(ZAX([VX[0], VX[1], 0]), 179.6, 182.4, 1.25, { tone: "hi" }), sDisc(ZAX([VX[0], VX[1], 0]), 182.4, 183.2, 1.7, { tone: "hi", bevel: 0.3 })]);
  // válvulas de bola: líquido (3 in) y vapor (2 in), salida horizontal tapada
  const ball = (pid, x, y, rb, rn, zc, reach) => {
    const riserTop = zc - Math.sqrt(rb * rb - rn * rn);
    const side = x + Math.sqrt(rb * rb - rn * rn);
    const F = XAX([0, y, zc]);
    multi(pid, [
      sDisc(ZAX([x, y, 0]), 179.6, riserTop, rn, { tone: "hi" }),
      sBall([x, y, zc], rb, { tone: "hi" }),
      sDisc(F, side, reach, rn * 0.82, { tone: "hi" }),
      sDisc(F, reach, reach + 1.1, rn * 1.05, { tone: "mid", extra: Dots(G.dotsOf(F, reach + 1.1, rn * 0.6, 4, P, { all: true }), { size: 0.4, tone: "mid" }) }),
      sDisc(ZAX([x, y, 0]), zc + Math.sqrt(rb * rb - 0.25), zc + rb + 0.7, 0.5, { tone: "mid" }),
      sBox([x - 0.6, y - 0.5, zc + rb + 0.7], [x + rb * 2.2, y + 0.5, zc + rb + 1.3], { tone: "hi" }),
    ]);
  };
  ball("a.liquido", 6, 1, 2.6, 1.8, 183.2, 11);
  ball("a.vapor", 2, -7, 2.0, 1.3, 182.4, 7.5);
  // tubo buzo: de la tapa al sumidero (solo en el despiece y en el corte)
  pipe("a.buzo", [[6, 1, PAD_TOP], [6, 1, 45]], 1.3, { maxLength: 200, tone: "hi", ends: [true, false] });
}

// ---------------------------------------------------------------------------
// Descarga inferior
{
  const asm = "descarga";
  part("d.valvula", "bov", { asm, mat: "acero" });
  part("d.manija", "manijaBov", { asm, v2: [0, 30, 0], mat: "amarillo" });
  part("d.skidCerca", "skid", { asm, v2: [0, 18, 0], mat: "acero" });
  part("d.skidLejos", "skid", { asm, v2: [0, -18, 0], mat: "acero" });
  part("d.skidFrente", "skid", { asm, v2: [20, 0, 0], mat: "acero" });
  part("d.skidAtras", "skid", { asm, v2: [-20, 0, 0], mat: "acero" });
  part("d.skidFondo", "skid", { asm, v2: [0, 0, -16], mat: "acero" });
  L2.descarga = { anchor: "d.valvula", order: ["d.manija", "d.skidCerca", "d.skidLejos", "d.skidFrente", "d.skidAtras", "d.skidFondo"] };
  const ZF = ZAX([0, 0, 0]);
  multi("d.valvula", [
    sDisc(ZF, 39.8, 41.2, 8.4, { tone: "mid", extra: Dots(G.dotsOf(ZF, 39.8, 7.6, 12, P, { fade: [0.04, 0.42] }), { size: 0.45, tone: "hi" }) }),
    sDisc(ZF, 34, 39.8, 6.2, { tone: "hi", inner: "" }),
    sDisc(ZF, 28, 34, 3.4, { tone: "hi" }),
    sDisc(ZF, 26.6, 28, 4.2, { tone: "mid", bevel: 0.3 }),
    sBox([-1, 6.2, 35.8], [1, 7.4, 38.2], { tone: "hi" }),
  ]);
  multi("d.manija", [sBox([-0.8, 7.4, 36.2], [0.8, 30, 37.8], { tone: "hi" }), sBox([-5, 30, 35.4], [5, 31.6, 38.6], { tone: "hi", bevel: 0.3 })]);
  const skidTop = (y) => C - Math.sqrt(RJ * RJ - y * y);
  box("d.skidFondo", [-13.2, -11.2, 22], [13.2, 11.2, 23.2], { tone: "hi", bevel: 0.4 });
  box("d.skidFrente", [12, -11.2, 23.2], [13.2, 11.2, skidTop(0)], { tone: "hi" });
  box("d.skidAtras", [-13.2, -11.2, 23.2], [-12, 11.2, skidTop(0)], { tone: "hi" });
  box("d.skidLejos", [-12, -11.2, 23.2], [12, -10, skidTop(10)], { tone: "hi" });
  box("d.skidCerca", [-12, 10, 23.2], [12, 11.2, 30], { tone: "hi", extra: Dots([-8, 0, 8].map((x) => at([x, 11.2, 26.6])), { size: 0.5, tone: "mid" }) });
}

// ---------------------------------------------------------------------------
// Frenos de cuerpo: tubería general, válvula de control, depósito y freno de mano.
{
  const asm = "frenos";
  const BP = { y: 27, z: 49.6, low: 42, r: 0.84 };
  part("f.tuberia", "tuberiaFreno", { asm, v2: [0, 34, 0], mat: "acero" });
  part("f.soportes", "soporteTubo", { asm, v2: [0, 0, 18], mat: "acero" });
  part("f.ramal", "ramal", { asm, v2: [0, 34, 0], ride2: "f.tuberia", mat: "acero" });
  part("f.valvula", "valvulaControl", { asm, v2: [-22, 0, 0], mat: "cilindro" });
  part("f.deposito", "deposito", { asm, v2: [0, 0, -20], mat: "acero" });
  part("f.tubosDep", "tuboDeposito", { asm, v2: [-11, 0, 0], ride2: "f.valvula", mat: "acero" });
  for (const end of ["A", "B"]) {
    const sx = end === "B" ? 1 : -1;
    part(`f.llave${end}`, "llaveAngular", { asm, v2: [sx * 18, 0, 0], mat: "bronce" });
    part(`f.manguera${end}`, "manguera", { asm, v2: [sx * 30, 0, -4], mat: "goma" });
  }
  part("f.frenoMano", "frenoMano", { asm, v2: [16, 0, 0], mat: "acero" });
  part("f.volante", "volante", { asm, v2: [30, 0, 0], mat: "amarillo" });
  part("f.soporteFreno", "soporteFreno", { asm, v2: [0, 0, -16], mat: "acero" });
  part("f.cadena", "cadena", { asm, v2: [0, 14, 0], mat: "acero" });
  part("f.acodada", "palancaAcodada", { asm, v2: [0, 0, -24], mat: "acero" });
  // tubería general con soportes cada ~1.9 m
  const route = G.fillet([[-333, BP.y, BP.low], [-318, BP.y, BP.low], [-318, BP.y, BP.z], [318, BP.y, BP.z], [318, BP.y, BP.low], [333, BP.y, BP.low]], 3, 8);
  const TEE = [144, BP.y, BP.z];
  const brackets = [-250, -170, -90, -10, 60, 210, 250];
  const gaps = [];
  for (const x of brackets) {
    const hit = crossingsOf(route, [x, BP.y, BP.z], [1, 0, 0], 2)[0];
    if (hit !== undefined) gaps.push([hit - 0.8, hit + 0.8]);
  }
  const teeAt = crossingsOf(route, TEE, [1, 0, 0], 2)[0];
  const teeR = 1.3;
  const teeCut = Math.sqrt(teeR * teeR - BP.r * BP.r);
  gaps.push([teeAt - teeCut, teeAt + teeCut]);
  gaps.sort((a, b) => a[0] - b[0]);
  const bpName = pipe("f.tuberia", route, BP.r, { gaps, maxLength: 26, rims: [BP.r * 1.6, BP.r * 1.6], free: [true, true] });
  // la te y los collarines abrazan la tubería: son de la misma pieza y salen con ella
  multi("f.tuberia", [sBall(TEE, teeR, { tone: "hi", owner: bpName })]);
  const tankBelow = (y) => C - Math.sqrt(RJ * RJ - y * y);
  for (const x of brackets) {
    const F = XAX([x, BP.y, BP.z]);
    multi("f.tuberia", [sDisc(F, -0.8, 0.8, 1.3, { tone: "mid", owner: bpName })]);
    multi("f.soportes", [sBox([x - 0.8, BP.y - 1.4, BP.z + 1.3], [x + 0.8, BP.y + 1.4, tankBelow(BP.y - 1.4)], { tone: "mid" })]);
  }
  // válvula de control con porciones de servicio y emergencia
  const VC = { x0: 138, x1: 148, y0: 12, y1: 28, z0: 33, z1: 45 };
  multi("f.valvula", [
    sBox([VC.x0, VC.y0, VC.z0], [VC.x1, VC.y1, VC.z1], { tone: "hi", bevel: 0.4, extra: Dots([[VC.x0 + 1.5, VC.z0 + 1.5], [VC.x1 - 1.5, VC.z0 + 1.5], [VC.x0 + 1.5, VC.z1 - 1.5], [VC.x1 - 1.5, VC.z1 - 1.5]].map(([x, z]) => at([x, VC.y1, z])), { size: 0.5, tone: "mid" }) }),
    sBox([VC.x0 + 1, VC.y1, VC.z0 + 1.5], [VC.x1 - 1, VC.y1 + 3.4, VC.z1 - 2], { tone: "hi", bevel: 0.3, extra: Ln(k.planOutline({ x: VC.x0 + 2, y: VC.y1 + 0.6, w: VC.x1 - VC.x0 - 4, d: 2.2, r: 0.3 }, VC.z1 - 2, P, 2), { tone: "faint" }) }),
    sBox([VC.x0 + 1, VC.y0 - 3.4, VC.z0 + 1.5], [VC.x1 - 1, VC.y0, VC.z1 - 2], { tone: "hi", bevel: 0.3 }),
  ]);
  pipe("f.ramal", [[144, BP.y, BP.z - Math.sqrt(teeR * teeR - 0.6 * 0.6)], [144, BP.y, VC.z1]], 0.6, { maxLength: 40, free: [false, true], touch: [bpName] });
  // depósito de dos compartimentos
  const DEP = { x0: 152, x1: 198, y: 14, z: 38, r: 6.2 };
  const DF = XAX([0, DEP.y, DEP.z]);
  const prof = [[DEP.x0, 4.8], [DEP.x0 + 0.6, 5.6, 1], [DEP.x0 + 1.6, 6.05, 1], [DEP.x0 + 2.6, DEP.r], [DEP.x1 - 2.6, DEP.r], [DEP.x1 - 1.6, 6.05, 1], [DEP.x1 - 0.6, 5.6, 1], [DEP.x1, 4.8]];
  const bandsDep = [160, 190];
  multi("f.deposito", [
    { svg: S(G.solidOf(prof, DF, P), { tone: "hi", inner: Ln(G.arcOf(DF, 175, DEP.r, P), { tone: "lo" }) }), shape: A.solid(DF, prof), at: [175, DEP.y, DEP.z] },
    ...bandsDep.map((x) => ({ svg: S(G.ringBand(x - 0.8, x + 0.8, DEP.r, DEP.r + 0.4, DF, P), { tone: "mid" }), shape: A.ring(DF, x - 0.8, x + 0.8, DEP.r, DEP.r + 0.4), at: [x, DEP.y, DEP.z + 0.1] })),
    ...bandsDep.map((x) => sBox([x - 0.8, DEP.y - 2, DEP.z + DEP.r + 0.4], [x + 0.8, DEP.y + 2, tankBelow(DEP.y - 2)], { tone: "mid" })),
    sDisc(ZAX([175, DEP.y, 0]), DEP.z - DEP.r - 1.4, DEP.z - DEP.r + 0.02, 0.6, { tone: "mid" }),
  ]);
  pipe("f.tubosDep", [[VC.x1, 16, 40], [DEP.x0, 16, 40]], 0.5, { maxLength: 20, free: [false, true] });
  pipe("f.tubosDep", [[VC.x1, 13, 35.5], [DEP.x0, 13, 35.5]], 0.5, { maxLength: 20, free: [false, true] });
  // llaves angulares y mangueras en ambos extremos
  for (const [end, sx] of [["A", -1], ["B", 1]]) {
    const F = XAX([0, BP.y, BP.low]);
    const a0 = sx * 333;
    const a1 = sx * 336.6;
    multi(`f.llave${end}`, [
      sDisc(F, Math.min(a0, a1), Math.max(a0, a1), 1.5, { tone: "hi" }),
      sBox([sx * 334 - 0.6, BP.y - 0.5, BP.low + 1.5], [sx * 334 + 0.6, BP.y + 0.5, BP.low + 2.4], { tone: "mid" }),
      sBox([Math.min(sx * 334, sx * 339) , BP.y - 0.4, BP.low + 2.4], [Math.max(sx * 334, sx * 339), BP.y + 0.4, BP.low + 3.0], { tone: "hi" }),
    ]);
    const gh = { x0: sx * 339.3, x1: sx * 341.7 };
    pipe(`f.manguera${end}`, G.fillet([[a1, BP.y, BP.low], [sx * 340.5, BP.y, BP.low], [sx * 340.5, BP.y, 29]], 2.4, 8), 0.75, { maxLength: 12, tone: "hi", rings: { pitch: 1.1, fade: [0.1, 0.55], tone: "lo" }, free: [true, false] });
    multi(`f.manguera${end}`, [sBox([Math.min(gh.x0, gh.x1), BP.y - 1.6, 26], [Math.max(gh.x0, gh.x1), BP.y + 1.6, 29], { tone: "hi", bevel: 0.3 })]);
  }
  // freno de mano en el extremo B, lado cercano
  const HB = { x0: 303.5, x1: 309.5, y0: 9, y1: 23, z0: 70, z1: 84 };
  box("f.soporteFreno", [305, 10, SILL.top], [308, 14, HB.z0], { tone: "hi" });
  box("f.frenoMano", [HB.x0, HB.y0, HB.z0], [HB.x1, HB.y1, HB.z1], { tone: "hi", bevel: 0.5, extra: Dots([[HB.y0 + 1.2, HB.z0 + 1.2], [HB.y1 - 1.2, HB.z0 + 1.2], [HB.y0 + 1.2, HB.z1 - 1.2], [HB.y1 - 1.2, HB.z1 - 1.2]].map(([y, z]) => at([HB.x1, y, z])), { size: 0.5, tone: "mid" }) });
  const WC = [HB.x1, 16, 79];
  const WF = G.frameOf(WC, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const spokes = [0, 1, 2, 3].map((i) => {
    const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const d = [0, Math.cos(t), Math.sin(t)];
    const c = G.add3(WC, [1.9, 0, 0]);
    return sDisc(G.frameAlong(c, d), 1.4, 9.05, 0.45, { tone: "hi" });
  });
  multi("f.volante", [sDisc(WF, 0, 2.6, 1.4, { tone: "hi", owner: "f.volante" }), ...spokes.map((sp) => ((sp.shape.owner = "f.volante"), sp))]);
  // aro del volante: un tubo cerrado, para que se vea hueco entre los rayos
  const rim = Array.from({ length: 48 }, (_, i) => G.add3(WC, [1.9, 9.55 * Math.cos((i / 48) * Math.PI * 2), 9.55 * Math.sin((i / 48) * Math.PI * 2)]));
  pipe("f.volante", rim, 0.6, { closed: true, maxLength: 8, owner: "f.volante" });
  box("f.acodada", [304.5, 12, 35.2], [308.5, 17, 39.2], { tone: "hi", bevel: 0.3 });
  pipe("f.cadena", [[306.5, 15.6, HB.z0], [306.5, 15.6, 39.2]], 0.5, { maxLength: 40, tone: "mid", rings: { pitch: 0.9, fade: [0.05, 0.5], tone: "hi" }, free: [true, true] });
  L2.frenos = { anchor: "f.deposito", order: ["fB.zapata0N", "fB.zapata0F", "fB.zapata1N", "fB.zapata1F", "fB.cabeza0N", "fB.cabeza0F", "fB.cabeza1N", "fB.cabeza1F", "fB.cilindro", "fB.varilla", "fB.ajustador", "fB.palanca0", "fB.palanca1", "fB.viga0", "fB.viga1", "f.mangueraB", "f.mangueraA", "f.llaveB", "f.llaveA", "f.soportes", "f.tuberia", "f.valvula", "f.deposito", "f.volante", "f.frenoMano", "f.acodada", "f.cadena", "f.soporteFreno"] };
}

// ---------------------------------------------------------------------------
// Enganches: acoplador tipo E de doble repisa, yugo, aparato de choque, llave y soporte.
for (const [end, sx] of [["A", -1], ["B", 1]]) {
  const asm = "enganches";
  const spring = `engan${end}`;
  const l2 = end === "B";
  const X = (x) => sx * x;
  const span = (a, b) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
  const id = (s) => `g${end}.${s}`;
  part(id("acoplador"), "acoplador", { asm, spring, l2, v2: [X(34), 0, 0], mat: "acoplador" });
  part(id("yugo"), "yugo", { asm, spring, l2, mat: "acero" });
  part(id("aparato"), "aparato", { asm, spring, l2, v2: [0, 30, 0], mat: "aparato" });
  part(id("llaveN"), "llave", { asm, spring, l2, v2: [0, 10, 18], mat: "acero" });
  part(id("llaveF"), "llave", { asm, spring, l2, v2: [0, -10, 18], mat: "acero" });
  part(id("soporte"), "soporteAcoplador", { asm, spring, l2, v2: [0, 0, -12], mat: "acero" });
  if (l2) L2.enganches = { anchor: id("yugo"), order: [id("llaveN"), id("llaveF"), id("acoplador"), id("soporte"), id("aparato")] };
  const owner = id("acoplador");
  const [h0, h1] = span(347, 359);
  const [n0, n1] = span(359, M.pullingFaces / 2);
  const [g0, g1] = span(359, 364);
  const [s0, s1] = span(334, 347);
  // nudillo del lado cercano en B, del lado lejano en A (los acopladores de un carro son opuestos)
  const kn = sx > 0 ? [0.5, 8.6] : [-8.6, -0.5];
  const gd = sx > 0 ? [-7.5, -3] : [3, 7.5];
  // el vástago pasa por la boca de la cara de choque: es su propio ítem, la cabeza otro
  box(id("acoplador"), [s0, -3.4, 31], [s1, 3.4, 38.2], { owner });
  multi(id("acoplador"), [
    sBox([h0, -7.5, 28], [h1, 7.5, 41.2], { tone: "hi", bevel: 0.5, owner, extra: Dots([at([X(353), 7.5, 30.5]), at([X(353), 7.5, 38.6])], { size: 0.55, tone: "mid" }) }),
    sBox([span(347, 358)[0], -7.5, 41.2], [span(347, 358)[1], 7.5, 42], { tone: "hi", owner }),
    sBox([span(347, 358)[0], -7.5, 27.2], [span(347, 358)[1], 7.5, 28], { tone: "hi", owner }),
    sBox([n0, kn[0], 29.2], [n1, kn[1], 40], { tone: "hi", bevel: 0.4, owner, extra: Dots([at([X(361), (kn[0] + kn[1]) / 2, 40])], { size: 0.7, tone: "mid" }) }),
    sBox([g0, gd[0], 29.6], [g1, gd[1], 39.6], { tone: "hi", owner }),
  ]);
  const [y0, y1] = span(290.4, 292);
  const [y2, y3] = span(331, 334);
  const [d0, d1] = span(292, 331);
  // el yugo abraza al aparato: cada tramo es su propio ítem para que el orden de pintado los separe
  const yo = id("yugo");
  box(yo, [d0, -7, 40.8], [d1, 7, 41.8], { owner: yo });
  box(yo, [d0, -7, 27.6], [d1, 7, 28.8], { owner: yo });
  box(yo, [y0, -7, 27.6], [y1, 7, 41.8], { owner: yo });
  box(yo, [y2, -7, 27.6], [y3, 7, 41.8], { owner: yo });
  box(id("aparato"), [d0, -6.6, 28.8], [d1, 6.6, 40.8], { tone: "hi", bevel: 0.3, inner: Ln([0.2, 0.4, 0.6, 0.8].map((t) => k.sideSeam({ x: d0, y: -6.6, w: d1 - d0, d: 13.2, r: 0.2 }, 28.8 + 12 * t, P, 2)).join(""), { tone: "faint" }) });
  const [k0, k1] = span(328.5, 331.5);
  box(id("llaveN"), [k0, SILL.web[1], 32], [k1, 15.4, 37], { tone: "hi", bevel: 0.3 });
  box(id("llaveF"), [k0, -15.4, 32], [k1, -SILL.web[1], 37], { tone: "hi", bevel: 0.3 });
  // el soporte entra en la boca de la cara de choque y se apoya en sus mejillas
  const [c0, c1] = span(339, 346);
  box(id("soporte"), [c0, -7.6, 29], [c1, 7.6, 31], { tone: "mid" });
}

// ---------------------------------------------------------------------------
// Seguridad: plataforma, barandales, escaleras, agarraderas, estribos y placas.
{
  const asm = "seguridad";
  const PL = { y: 20, z0: 179, z1: 180 };
  const halves = [["A", -1], ["B", 1]];
  for (const [h, sx] of halves) {
    const [x0, x1] = [sx * 27, sx * 60].sort((a, b) => a - b);
    part(`s.plataforma${h}`, "plataforma", { asm, spring: "segTop", v2: [0, 0, 8], mat: "rejilla" });
    part(`s.barandal${h}N`, "barandal", { asm, spring: "segTop", v2: [0, 0, 22], mat: "amarillo" });
    part(`s.barandal${h}F`, "barandal", { asm, spring: "segTop", v2: [0, 0, 22], mat: "amarillo" });
    const grate = [];
    for (let x = x0 + 1.5; x < x1 - 1; x += 1.6) for (let y = -PL.y + 1.5; y < PL.y - 1; y += 1.6) grate.push(at([x, y, PL.z1]));
    box(`s.plataforma${h}`, [x0, -PL.y, PL.z0], [x1, PL.y, PL.z1], { tone: "hi", extra: Dots(grate, { size: 0.32, tone: "lo" }) });
    for (const x of [x0 + 1.5, x1 - 1.5]) for (const y of [-17, 17]) {
      const surf = C + Math.sqrt(RJ * RJ - (Math.abs(y) + 0.6) ** 2);
      box(`s.plataforma${h}`, [x - 0.6, y - 0.6, surf], [x + 0.6, y + 0.6, PL.z0], { tone: "mid" });
    }
    for (const [sd, s] of [["N", 1], ["F", -1]]) {
      const y = s * (PL.y - 0.7);
      const posts = [x0 + 1.2, x1 - 1.2];
      const subs = [];
      for (const x of posts) subs.push(sDisc(ZAX([x, y, 0]), PL.z1, 202, 0.6, { tone: "hi" }));
      for (const z of [191, 201.4]) subs.push(sDisc(XAX([0, y, z]), posts[0] + 0.6, posts[1] - 0.6, 0.55, { tone: "hi" }));
      multi(`s.barandal${h}${sd}`, subs);
    }
  }
  for (const [sd, s] of [["N", 1], ["F", -1]]) {
    const spring = sd === "N" ? "segN" : "segF";
    part(`s.escalera${sd}`, "escalera", { asm, spring, v2: [0, s * 20, 0], mat: "amarillo" });
    part(`s.agarradera${sd}`, "agarradera", { asm, spring, v2: [0, s * 28, 10], mat: "amarillo" });
    part(`s.placa${sd}`, "placa", { asm, spring, v2: [0, s * 30, 0], mat: "placa" });
    // escalera lateral
    const yo = s > 0 ? [68.6, 69.8] : [-69.8, -68.6];
    const yin = s > 0 ? yo[0] : yo[1];
    const subs = [];
    for (const [xa, xb] of [[38, 39.2], [50.8, 52]]) {
      subs.push(sBox([xa, yo[0], 46], [xb, yo[1], 150], { tone: "hi" }));
      for (const z0 of [95, 135]) {
        const yt = Math.sqrt(RJ * RJ - (z0 - C) ** 2);
        subs.push(sBox([xa, s > 0 ? yt : yin, z0 - 1], [xb, s > 0 ? yin : -yt, z0 + 1], { tone: "mid" }));
      }
    }
    for (let z = 52; z <= 148; z += 12) subs.push(sDisc(XAX([0, s * 69.2, z]), 39.2, 50.8, 0.55, { tone: "hi" }));
    multi(`s.escalera${sd}`, subs);
    // agarradera en el hombro del tanque, junto a la escalera
    const th = (55 * Math.PI) / 180;
    const radial = [0, s * Math.cos(th), Math.sin(th)];
    const base = (x) => [x, s * RJ * Math.cos(th), C + RJ * Math.sin(th)];
    const g = [];
    for (const x of [40.5, 49.5]) g.push(sDisc(G.frameAlong(base(x), radial), 0, 4.2, 0.5, { tone: "hi" }));
    g.push(sDisc(G.frameAlong(G.add3(base(40), G.mul3(radial, 4.7)), [1, 0, 0]), 0, 10, 0.5, { tone: "hi" }));
    multi(`s.agarradera${sd}`, g);
    // placa ONU sobre la chaqueta, a la altura del ecuador
    const py = s > 0 ? [RJ, RJ + 0.5] : [-RJ - 0.5, -RJ];
    const placard = s > 0 ? placardSvg(-120, RJ + 0.5, 112) : "";
    box(`s.placa${sd}`, [-132, py[0], 100], [-108, py[1], 124], { tone: "hi", extra: placard });
    // estribos bajo los extremos del travesaño pivote
    for (const [end, sx] of [["A", -1], ["B", 1]]) {
      const pid = part(`s.estribo${end}${sd}`, "estribo", { asm, spring, v2: [0, 0, -14], mat: "amarillo" });
      const X0 = sx * TRUCK_X;
      const ys = s > 0 ? [46.4, 47.6] : [-47.6, -46.4];
      const armBottom = 31.6 + (46.4 - 32) * (4.4 / 18);
      const tread = s > 0 ? [44.6, 49.4] : [-49.4, -44.6];
      const slots = Ln([-3.5, 0, 3.5].map((dx) => k.planOutline({ x: X0 + dx - 1, y: tread[0] + 1, w: 2, d: 2.8, r: 0.6 }, 14, P, 2)).join(""), { tone: "lo" });
      multi(pid, [sBox([X0 - 5.8, ys[0], 14], [X0 - 4.6, ys[1], armBottom], { tone: "hi" }), sBox([X0 + 4.6, ys[0], 14], [X0 + 5.8, ys[1], armBottom], { tone: "hi" }), sBox([X0 - 5.8, tread[0], 13], [X0 + 5.8, tread[1], 14], { tone: "hi", extra: slots })]);
    }
  }
  L2.seguridad = { anchor: "s.plataformaB", order: ["s.barandalAN", "s.barandalAF", "s.barandalBN", "s.barandalBF", "s.plataformaA", "s.plataformaB", "s.agarraderaN", "s.agarraderaF", "s.escaleraN", "s.escaleraF", "s.placaN", "s.placaF", "s.estriboAN", "s.estriboBN", "s.estriboAF", "s.estriboBF"] };
}

// ---------------------------------------------------------------------------
// Grabación para la auditoría y orden de pintado
function cloneShapes(items) {
  const map = new Map();
  const all = [...items.flatMap((it) => it.shapes)];
  for (const s of all) map.set(s, { ...s });
  for (const c of map.values()) if (c.cut) c.cut = [c.cut].flat().map((h) => map.get(h) ?? { ...h });
  return map;
}
// Un corte que no es una pieza dibujada (la forma llena de la chaqueta, un semiespacio) viaja con su pieza.
function stampCuts(R) {
  const own = new Set(R.solids);
  for (const shape of R.solids) {
    if (!shape.cut) continue;
    for (const c of [shape.cut].flat()) if (!own.has(c)) Object.assign(c, { move: shape.move, ride: shape.ride, piece: shape.piece });
  }
}
function level1() {
  const R = A.recorder(P, { order: STAGGER, spring: SPRING });
  const map = cloneShapes(ITEMS);
  for (const s of STATIC_SHAPES) R.solid({ ...s });
  for (const it of ITEMS) {
    if (!it.l1) continue;
    const shapes = it.shapes.map((s) => R.solid(map.get(s)));
    R.put({ piece: it.ride, ride: it.ride, at: it.at, bias: it.bias, move: MOVE[it.ride] ?? [0, 0, 0], shapes, name: it.name, svg: it.svg, ref: it, route: it.route, chunk: it.chunk });
  }
  for (const rt of ROUTES) {
    if (!PARTS[rt.pid].l1) continue;
    const ride = rt.ride ?? PARTS[rt.pid].spring;
    R.route(rt.name, rt.points, rt.r, { ...rt.opts, piece: ride, ride, move: MOVE[ride] ?? [0, 0, 0] });
  }
  stampCuts(R);
  return R;
}
function level2(asm) {
  const spec = L2[asm];
  const chosen = ITEMS.filter((it) => it.asm === asm && PARTS[it.pid].l2);
  // En el despiece de un ensamble lo demás está oculto: el soporte se prueba en el carro armado (nivel 1).
  const R = A.recorder(P, { order: spec.order, spring: SPRING2, ground: () => true });
  const map = cloneShapes(chosen);
  for (const it of chosen) {
    const shapes = it.shapes.map((s) => R.solid(map.get(s)));
    const rider = PARTS[it.pid].ride2 ?? it.pid;
    R.put({ piece: rider, ride: rider, at: it.at, bias: it.bias, move: PARTS[rider].v2, shapes, name: it.name, svg: it.svg, ref: it, route: it.route, chunk: it.chunk });
  }
  for (const rt of ROUTES) {
    if (PARTS[rt.pid].asm !== asm || !PARTS[rt.pid].l2) continue;
    const rider = PARTS[rt.pid].ride2 ?? rt.pid;
    R.route(rt.name, rt.points, rt.r, { ...rt.opts, piece: rider, ride: rider, move: PARTS[rider].v2 });
  }
  stampCuts(R);
  return R;
}

// La rejilla del orden de pintado va en unidades del viewBox; el tanque ocupa medio cuadro, así que 1 px basta.
const GRID = { step: 1 };
const t0 = Date.now();
const FAST = process.argv.includes("--fast");
const settle = (R) => (FAST ? R.items.forEach((it) => (it.key = it.key)) : A.settle(R, P, GRID));
const want = (label) => !ONLY || ONLY.split(",").some((o) => label.includes(o));
const R1 = level1();
if (want("nivel 1")) settle(R1);
for (const it of R1.items) it.ref.k1 = it.key;
console.log(`orden nivel 1: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const R2 = {};
for (const asm of Object.keys(L2)) {
  if (!L2[asm].order) continue;
  if (!want(`nivel 2 · ${asm}`)) continue;
  R2[asm] = level2(asm);
  settle(R2[asm]);
  for (const it of R2[asm].items) it.ref.k2 = it.key;
}

// ---------------------------------------------------------------------------
// Corte longitudinal por el plano vertical del eje (y = 0): se quita la mitad cercana del tanque.
// Se ve la mitad lejana por dentro, las capas de pared cortadas, el sumidero, la boquilla de la
// entrada de hombre y el diésel con un llenado típico.
const FILL_FRAC = 0.94; // diésel: el peso bruto de 286 000 lb limita el llenado
const MANWAY_HOLE = 10; // boca de 20 in
const SUMP = { r: 7.5, rin: 6.3, z0: 42.6, floor: 43.8, fl: 9.2, flz: 41.2, outlet: 3.4 };
function fillLevel(frac, r) {
  // altura del líquido en un cilindro horizontal para una fracción de área dada
  let lo = 0;
  let hi = 2 * r;
  for (let i = 0; i < 60; i++) {
    const h = (lo + hi) / 2;
    const phi = 2 * Math.acos(1 - h / r);
    const area = (r * r * (phi - Math.sin(phi))) / 2;
    if (area / (Math.PI * r * r) < frac) lo = h;
    else hi = h;
  }
  return (lo + hi) / 2;
}
const LIQUID_Z = C - SHELL_IN.r0 + fillLevel(FILL_FRAC, SHELL_IN.r0);
function cutSvg() {
  const d = (pts, close = true) => "M" + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L") + (close ? "Z" : "");
  const P3 = (pts) => pts.map((p) => at(p));
  const sList = (h, n = 34) => {
    const ss = profileOf(h, -h.tip, h.tip, n).map(([s]) => s);
    const out = [];
    for (let i = 0; i < ss.length - 1; i++) {
      const steps = Math.max(1, Math.ceil((ss[i + 1] - ss[i]) / 22));
      for (let j = 0; j < steps; j++) out.push(ss[i] + ((ss[i + 1] - ss[i]) * j) / steps);
    }
    out.push(ss[ss.length - 1]);
    return out;
  };
  // facetas de la mitad lejana (y <= 0) de una superficie de revolución, vistas desde afuera o desde adentro
  const facets = (h, inside) => {
    const ss = sList(h);
    const out = [];
    const T0 = Math.PI / 2;
    const n = 40;
    for (let i = 0; i < ss.length - 1; i++) {
      for (let j = 0; j < n; j++) {
        const t0 = T0 + (Math.PI * j) / n;
        const t1 = T0 + (Math.PI * (j + 1)) / n;
        const sm = (ss[i] + ss[i + 1]) / 2;
        const tm = (t0 + t1) / 2;
        let nrm = G.unit3([-h.slope(sm), Math.cos(tm), Math.sin(tm)]);
        if (inside) nrm = G.mul3(nrm, -1);
        if (G.dot3(nrm, V) <= 1e-6) continue;
        const pt = (s, t) => [s, h.radius(s) * Math.cos(t), C + h.radius(s) * Math.sin(t)];
        out.push({ poly: P3([pt(ss[i], t0), pt(ss[i + 1], t0), pt(ss[i + 1], t1), pt(ss[i], t1)]), tone: G.toneOf(nrm, P) });
      }
    }
    return out;
  };
  const shaded = (list, cls) => {
    const buckets = [[], [], [], [], []];
    for (const f of list) buckets[Math.min(4, f.tone)].push(d(f.poly));
    const fill = list.map((f) => d(f.poly)).join("");
    return `<g class="${cls}"><path class="cx-fill" d="${fill}"/>${buckets.map((b, i) => (b.length ? `<path class="cx-tone" data-t="${i}" d="${b.join("")}"/>` : "")).join("")}</g>`;
  };
  const parts = [];
  // 1. interior de la mitad lejana de la virola y los cabezales
  parts.push(shaded(facets(SHELL_IN, true), "cx-inner"));
  // 2. superficie libre del diésel
  {
    const a = Math.abs(LIQUID_Z - C);
    const ss = sList(SHELL_IN, 50).filter((s) => SHELL_IN.radius(s) > a + 0.05);
    const w = (s) => Math.sqrt(Math.max(0, SHELL_IN.radius(s) ** 2 - a * a));
    const back = ss.map((s) => [s, -w(s), LIQUID_Z]);
    const front = [...ss].reverse().map((s) => [s, 0, LIQUID_Z]);
    parts.push(`<path class="cx-liquid-top" d="${d(P3([...back, ...front]))}"/>`);
    const glints = [-200, -110, -20, 70, 160].map((x) => d(P3([[x, -w(x) * 0.25, LIQUID_Z], [x + 26, -w(x) * 0.25, LIQUID_Z]]), false)).join("");
    parts.push(`<path class="cx-glint" d="${glints}"/>`);
  }
  // 3. mitad lejana exterior que queda a la vista (franja superior y cabezal B)
  const outer = facets(JACKET, false);
  parts.push(`<defs><clipPath id="cx-outer" clipPathUnits="userSpaceOnUse"><path d="${outer.map((f) => d(f.poly)).join("")}"/></clipPath></defs><g data-mat="negro" clip-path="url(#cx-outer)">${S(bodyPaths(JACKET), { tone: "hi" })}</g>`);
  // 4. caras de corte en el plano y = 0
  const onPlane = (s, z) => at([s, 0, z]);
  const band = (outerH, innerH, from, to, holes = []) => {
    // anillo de pared entre dos perfiles, recortado en [from, to] y con huecos [a, b] (arriba o abajo)
    const segs = [];
    for (const sign of [1, -1]) {
      const cuts = holes.filter((hh) => hh.sign === sign).map((hh) => [hh.a, hh.b]);
      let spans = [[from, to]];
      for (const [a, b] of cuts) spans = spans.flatMap(([x0, x1]) => (b <= x0 || a >= x1 ? [[x0, x1]] : [[x0, a], [b, x1]].filter(([u, v]) => v - u > 0.01)));
      for (const [x0, x1] of spans) {
        const ss = [];
        const n = Math.max(2, Math.ceil((x1 - x0) / 3));
        for (let i = 0; i <= n; i++) ss.push(x0 + ((x1 - x0) * i) / n);
        const o = ss.map((s) => onPlane(s, C + sign * outerH.radius(s)));
        const inn = [...ss].reverse().map((s) => onPlane(s, C + sign * innerH.radius(Math.max(-innerH.tip, Math.min(innerH.tip, s)))));
        segs.push(d([...o, ...inn]));
      }
    }
    return segs.join("");
  };
  const holes = [{ sign: 1, a: -MANWAY_HOLE - 1.2, b: MANWAY_HOLE + 1.2 }, { sign: -1, a: -SUMP.r, b: SUMP.r }];
  // cabezales: la sección de cada cabezal se cierra en su ápice
  const capBand = (outerH, innerH, sx) => {
    const ss = profileOf(outerH, sx < 0 ? -outerH.tip : CYL, sx < 0 ? -CYL : outerH.tip, 30).map(([s]) => s);
    const o = [...ss.map((s) => onPlane(s, C + outerH.radius(s))), ...[...ss].reverse().map((s) => onPlane(s, C - outerH.radius(s)))];
    const si = profileOf(innerH, sx < 0 ? -innerH.tip : CYL, sx < 0 ? -CYL : innerH.tip, 30).map(([s]) => s);
    const i = [...si.map((s) => onPlane(s, C + innerH.radius(s))), ...[...si].reverse().map((s) => onPlane(s, C - innerH.radius(s)))];
    return d(o) + d(i.reverse());
  };
  const layer = (cls, outerH, innerH) => `<path class="cx-sec ${cls}" fill-rule="evenodd" d="${band(outerH, innerH, -CYL, CYL, holes)}${capBand(outerH, innerH, -1)}${capBand(outerH, innerH, 1)}"/>`;
  // diésel cortado
  {
    const a = LIQUID_Z;
    const ss = sList(SHELL_IN, 50).filter((s) => C - SHELL_IN.radius(s) < a - 0.05);
    const top = ss.map((s) => onPlane(s, Math.min(a, C + SHELL_IN.radius(s))));
    const bottom = [...ss].reverse().map((s) => (Math.abs(s) < SUMP.rin ? onPlane(s, SUMP.floor) : onPlane(s, C - SHELL_IN.radius(s))));
    parts.push(`<path class="cx-liquid" d="${d([...top, ...bottom])}"/>`);
  }
  parts.push(layer("cx-shell", SHELL, SHELL_IN));
  parts.push(layer("cx-insul", INSUL, INSUL_IN));
  parts.push(layer("cx-jacket", JACKET, JACKET_IN));
  // escudos de cabezal cortados
  const SH = hull(RJ + M.headShield, RJ / 2 + M.headShield);
  for (const sx of [-1, 1]) {
    const ss = profileOf(SH, sx < 0 ? -SH.tip : CYL + 6, sx < 0 ? -CYL - 6 : SH.tip, 30).map(([s]) => s);
    const half = (sign) => d([...ss.map((s) => onPlane(s, C + sign * SH.radius(s))), ...[...ss].reverse().map((s) => onPlane(s, C + sign * JACKET.radius(s)))]);
    parts.push(`<path class="cx-sec cx-shield" d="${half(1)}${half(-1)}"/>`);
  }
  // sumidero y su brida, cortados
  {
    const top = C - SHELL.r0;
    const blocks = [
      [[-SUMP.r, SUMP.z0], [-SUMP.rin, SUMP.z0], [-SUMP.rin, top + 0.6], [-SUMP.r, top + 0.6]],
      [[SUMP.rin, SUMP.z0], [SUMP.r, SUMP.z0], [SUMP.r, top + 0.6], [SUMP.rin, top + 0.6]],
      [[-SUMP.rin, SUMP.z0], [SUMP.rin, SUMP.z0], [SUMP.rin, SUMP.floor], [-SUMP.rin, SUMP.floor]],
      [[-SUMP.fl, SUMP.flz], [-SUMP.outlet, SUMP.flz], [-SUMP.outlet, SUMP.z0], [-SUMP.fl, SUMP.z0]],
      [[SUMP.outlet, SUMP.flz], [SUMP.fl, SUMP.flz], [SUMP.fl, SUMP.z0], [SUMP.outlet, SUMP.z0]],
    ];
    parts.push(`<path class="cx-sec cx-steel" d="${blocks.map((b) => d(b.map(([x, z]) => onPlane(x, z)))).join("")}"/>`);
    // el piso del sumidero tiene un agujero de salida hacia la válvula
    parts.push(`<path class="cx-hole" d="${d([[-SUMP.outlet, SUMP.z0], [SUMP.outlet, SUMP.z0], [SUMP.outlet, SUMP.floor], [-SUMP.outlet, SUMP.floor]].map(([x, z]) => onPlane(x, z)))}"/>`);
  }
  // boquilla de la entrada de hombre cortada: atraviesa chaqueta, aislamiento y virola
  {
    const neck = [
      [[-25.4, C + JACKET.r0 - 0.3], [-MANWAY_HOLE - 1.2, C + JACKET.r0 - 0.3], [-MANWAY_HOLE - 1.2, PAD_TOP], [-25.4, PAD_TOP]],
      [[MANWAY_HOLE + 1.2, C + JACKET.r0 - 0.3], [25.4, C + JACKET.r0 - 0.3], [25.4, PAD_TOP], [MANWAY_HOLE + 1.2, PAD_TOP]],
      [[-MANWAY_HOLE - 1.2, C + SHELL_IN.r0 - 1.5], [-MANWAY_HOLE, C + SHELL_IN.r0 - 1.5], [-MANWAY_HOLE, PAD_TOP], [-MANWAY_HOLE - 1.2, PAD_TOP]],
      [[MANWAY_HOLE, C + SHELL_IN.r0 - 1.5], [MANWAY_HOLE + 1.2, C + SHELL_IN.r0 - 1.5], [MANWAY_HOLE + 1.2, PAD_TOP], [MANWAY_HOLE, PAD_TOP]],
    ];
    parts.push(`<path class="cx-sec cx-steel" d="${neck.map((b) => d(b.map(([x, z]) => onPlane(x, z)))).join("")}"/>`);
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Página
const unit = (v) => {
  const o = at([0, 0, 0]);
  const p = at(v);
  return [+(p[0] - o[0]).toFixed(4), +(p[1] - o[1]).toFixed(4)];
};
const f2 = (v) => v.map((n) => n.toFixed(1)).join(",");
const sorted = [...ITEMS].sort((a, b) => (a.k1 ?? a.k2 ?? 0) - (b.k1 ?? b.k2 ?? 0));
const cutKey = ITEMS.find((it) => it.pid === "t.chaquetaInf").k1 ?? 0;
for (const it of ITEMS) if (it.pid === "a.buzo") it.k1 = cutKey + 0.4;
const groups = sorted.map((it) => {
  const p = PARTS[it.pid];
  const k2 = it.k2 ?? 0;
  const k1 = it.k1 ?? it.k2 ?? 0;
  const r2 = p.ride2 ?? it.pid;
  return `<g class="it" data-p="${it.pid}" data-r="${it.ride}" data-r2="${r2}" data-a="${it.asm}" data-mat="${it.mat ?? "acero"}" data-k="${k1.toFixed(2)}" data-k2="${k2.toFixed(2)}" data-m2="${f2(PARTS[r2].v2)}"${p.l2 ? "" : ' data-x2=""'}${p.l1 ? "" : ' data-x1="" data-off=""'}>${it.svg}</g>`;
});

// el corte entra en el orden de pintado en el lugar de la chaqueta
const cutGroup = `<g class="it" data-p="t.corte" data-r="tanque" data-r2="t.corte" data-a="tanque" data-mat="primer" data-k="${cutKey.toFixed(2)}" data-k2="0" data-m2="0,0,0" data-x2="" data-off="">${cutSvg()}</g>`;
groups.splice(sorted.findIndex((it) => (it.k1 ?? 0) > cutKey), 0, cutGroup);
part("t.corte", "corte", { asm: "tanque", l2: false, l1: false });

const STEPS = [
  { asm: "bogies", springs: ["bogieB", "bogieA"], es: "Bogíes", line: "Se ruedan los dos bogíes sobre la vía; cada uno ya trae su timonería de freno TMX (vigas, zapatas, palancas, ajustador y cilindro)." },
  { asm: "estructura", springs: ["estructura"], es: "Estructura", line: "Se bajan las vigas de tiro con sus travesaños pivote: la placa central entra en el tazón del bogíe y los apoyos laterales asientan." },
  { asm: "tanque", springs: ["tanque"], es: "Tanque", line: "Se asienta el tanque (virola, cabezales, aislamiento, chaqueta y escudos) con sus placas de refuerzo sobre las vigas de tiro." },
  { asm: "descarga", springs: ["descarga"], es: "Descarga inferior", line: "Se atornilla la válvula de salida a la brida del sumidero, se pasa su manija y se suelda la protección." },
  { asm: "accesorios", springs: ["accesorios"], es: "Accesorios superiores", line: "Tapa de la entrada de hombre con sus tornillos; válvulas de alivio, vacío, líquido y vapor; caja protectora y su tapa." },
  { asm: "frenos", springs: ["frenos"], es: "Frenos", line: "Tubería general con soportes y llaves angulares, mangueras, válvula de control, depósito de dos compartimentos y freno de mano con cadena." },
  { asm: "seguridad", springs: ["segTop", "segF", "segN"], es: "Seguridad", line: "Plataforma con barandales, escaleras laterales, agarraderas, estribos y placas con el número ONU." },
  { asm: "enganches", springs: ["enganB", "enganA"], es: "Enganches", line: "En cada extremo: aparato de choque dentro del yugo, llave de enganche, soporte y acoplador tipo E de doble repisa." },
];
// El montaje paso a paso es exactamente el despiece al revés: la auditoría ya recorre esos cuadros (estados de prefijo).
if (STEPS.flatMap((st) => st.springs).join() !== [...STAGGER].reverse().join()) throw new Error("los pasos no son el despiece al revés");
const FILL = FILL_FRAC;
const CAPACITY_L = 115830;
const DATA = {
  W,
  H,
  V,
  EX: unit([1, 0, 0]),
  EY: unit([0, 1, 0]),
  EZ: unit([0, 0, 1]),
  move: MOVE,
  stagger: STAGGER,
  spring: SPRING,
  spring2: SPRING2,
  asmOfSpring: ASM_OF_SPRING,
  ensambles: ENSAMBLES,
  tipos: TIPOS,
  steps: STEPS,
  fill: FILL,
  fillLitres: Math.round((CAPACITY_L * FILL) / 100) * 100,
  cutHides: ["t.chaquetaSup", "t.chaquetaInf", "t.escudoA", "t.escudoB", "t.boquilla", "t.sumidero", "a.caja", "a.tapaCaja", "s.escaleraN", "s.agarraderaN", "s.placaN"],
  corteInfo: detalleHtml(),
  infoDefault: `<p class="ct-info-asm">Ficha de la pieza</p><h3 class="ct-info-name">Pasa el cursor o toca una pieza</h3><p>Verás su nombre en español, el término en inglés que se usa en taller, su función y su material.</p>`,
  parts: Object.fromEntries(Object.entries(PARTS).map(([id, p]) => [id, { t: p.type, a: p.asm }])),
  l2: Object.fromEntries(Object.entries(L2).map(([a, s]) => [a, { order: s.order }])),
};

const CSS = readFileSync(join(HERE, "estilo.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const backSvg = k.figureSvg({ width: W, height: H, label: "Vía de trocha estándar sobre balasto.", body: `<g class="ct-cam">${BACK.join("")}</g>`, className: "ct-back" });
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg ct-front" viewBox="0 0 ${W} ${H}" role="img" aria-label="Carro tanque DOT-117 sobre la vía, con sus ocho ensambles: tanque, accesorios superiores, descarga inferior, estructura, bogíes, enganches, frenos y elementos de seguridad."><g class="ct-cam"><g class="ct-car">${groups.join("")}</g></g></svg>`;
const ORDERED = Object.entries(ENSAMBLES).filter(([a]) => a !== "via").sort((x, y) => x[1].n - y[1].n);
const asmList = ORDERED.map(([a, e]) => `<li><button type="button" class="ct-asm" data-asm="${a}" aria-pressed="false"><span class="ct-num">${String(e.n).padStart(2, "0")}</span><span class="ct-asm-es">${e.es}</span><span class="ct-asm-en">${e.en}</span><span class="ct-asm-n">${new Set(Object.entries(PARTS).filter(([, p]) => p.asm === a).map(([, p]) => p.type)).size} tipos</span></button></li>`).join("");
const modes = [["armado", "Armado"], ["despiece", "Despiece"], ["pasos", "Paso a paso"], ["corte", "Corte interior"]].map(([m, label]) => `<button type="button" class="ct-mode" data-mode="${m}" aria-pressed="${m === "armado"}">${label}</button>`).join("");
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">DOT-117J · 115 830 L</span><span class="iso-plate-corner" data-corner="hint" data-hint>Pasa el cursor o toca una pieza</span><span class="iso-plate-corner" data-corner="readout" data-readout>armado</span></div>`;
const steps = `<div class="ct-steps" data-steps hidden><div class="ct-step-text"><p class="ct-step-label" data-step-label></p><p class="ct-step-line" data-step-line></p></div><div class="ct-step-ctl"><button type="button" data-step-prev>Anterior</button><button type="button" data-step-play>Reproducir</button><button type="button" data-step-next>Siguiente</button></div></div>`;
const MEDIDAS = [
  ["Largo entre caras de tracción", "18 237 mm (59 ft 10 in)", "G"],
  ["Distancia entre centros de bogíes", "14 211 mm (46 ft 7.5 in)", "G"],
  ["Diámetro exterior del tanque, sobre la chaqueta", "3 249 mm (10 ft 7.9 in)", "G"],
  ["Altura extrema sobre el riel", "4 714 mm (15 ft 5.6 in)", "G"],
  ["Capacidad", "115 830 L (30 600 gal)", "G"],
  ["Largo del tanque entre cabezales", "≈ 15 100 mm, aproximado (del volumen, cabezales 2:1)", ""],
  ["Eje del tanque sobre el riel", "≈ 2 800 mm, aproximado", ""],
  ["Virola y cabezales", "14.3 mm (9/16 in), acero TC-128B", "C"],
  ["Aislamiento térmico / chaqueta", "13 mm (1/2 in) cerámico / 3 mm (calibre 11)", "C"],
  ["Escudos de cabezal, altura completa", "12.7 mm (1/2 in)", "C"],
  ["Eje del acoplador sobre el riel", "864 mm (34 in); AAR 32.5–34.5 in vacío", "A"],
  ["Ruedas / trocha / base del bogíe", "914 mm (36 in) / 1 435 mm / ≈ 1 778 mm, aproximado", ""],
  ["Llenado típico en el corte", "≈ 94 % con diésel (límite de peso de 286 000 lb), aproximado", ""],
];
const SRC = {
  G: ["Greenbrier, ficha 30,600 gal DOT-117J", "https://www.gbrx.com/wp-content/uploads/2022/01/30600-Gallon-DOT-117-Tank-Car.pdf"],
  C: ["49 CFR 179.202 (eCFR)", "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-179/subpart-D/section-179.202-13"],
  A: ["Acoplador AAR (Janney)", "https://en.wikipedia.org/wiki/AAR_coupler"],
};
const rows = MEDIDAS.map(([what, val, src]) => `<tr><th scope="row">${what}</th><td>${val}</td><td>${src ? `<a href="${SRC[src][1]}" rel="noopener">${SRC[src][0]}</a>` : "aproximado"}</td></tr>`).join("");
const caption = `<figcaption class="ct-caption"><p>Carro tanque DOT-117J100W para líquidos inflamables (diésel, gasolina): tanque con virola de 9/16 in, protección térmica y chaqueta, escudos de cabezal de altura completa, accesorios superiores dentro de una caja protectora y válvula inferior protegida. Dibujado a escala real con trocha de 1 435 mm y ruedas de 36 in; las medidas sin fuente están marcadas como aproximadas. Fuentes adicionales: <a href="https://www.gatx.com/products/large-capacity-general-service-tank-cars-25k/" rel="noopener">GATX, DOT-117J</a>; <a href="https://www.phmsa.dot.gov/regulations/title49/interp/15-0133" rel="noopener">PHMSA, interpretación 15-0133</a>.</p><table class="ct-table"><thead><tr><th scope="col">Medida</th><th scope="col">Valor</th><th scope="col">Fuente</th></tr></thead><tbody>${rows}</tbody></table></figcaption>`;
const body = `<header class="ct-head"><p class="ct-eyebrow">Capacitación técnica · material rodante</p><h1>Carro tanque DOT-117 para combustibles líquidos</h1><p class="ct-lede">Ocho ensambles y ${new Set(Object.values(PARTS).filter((p) => p.asm !== "via" && p.type !== "corte").map((p) => p.type)).size} tipos de pieza, armados en el orden real de montaje. Separa los ensambles, abre cada uno en sus piezas, sigue el montaje paso a paso o corta el tanque para ver su interior.</p></header><figure class="iso-figure ct"><div class="iso-plate">${corners}<div class="ct-bar" role="group" aria-label="Modo de vista">${modes}</div><div class="ct-stage" tabindex="0" role="group" aria-label="Carro tanque DOT-117. Flechas: abrir el ensamble siguiente o anterior (en paso a paso, avanzar o retroceder). Espacio: separar o juntar los ensambles. Escape: volver al carro armado.">${backSvg}${frontSvg}</div><span class="ct-live" aria-live="polite" data-live></span></div>${steps}<div class="ct-below"><nav class="ct-asms" aria-label="Ensambles"><ol>${asmList}</ol></nav><aside class="ct-info" data-info aria-live="polite"></aside></div>${caption}</figure>`;
const page = k.pageHtml({ title: "Carro tanque DOT-117", theme: "light", body: `<style>${CSS}</style>${body}`, script: kitScript() + LIVE, width: 1320 }).replace('lang="en"', 'lang="es"');
const OUT = join(HERE, "..", "carro-tanque.html");
if (!ONLY) writeFileSync(OUT, page);
console.log("escrito carro-tanque.html", `${(page.length / 1024).toFixed(0)} KB`, `${ITEMS.length} ítems`, `${Object.keys(PARTS).length} piezas`);

if (AUDIT) {
  const runs = [["nivel 1", R1], ...Object.entries(R2).map(([a, R]) => [`nivel 2 · ${a}`, R])].filter(([label]) => want(label));
  let bad = 0;
  for (const [label, R] of runs) {
    // tubería y mangueras pasan por delante de las almas de la viga, a 16–20 unidades de profundidad: revisado a 4×
    const CROWD_OK = [["f.tuberia*", "eA.viga*"], ["f.tuberia*", "eB.viga*"], ["f.manguera*", "eA.viga*"], ["f.manguera*", "eB.viga*"], ["f.cadena*", "eB.viga*"], ["f.mangueraB*", "bB.eje1*"]];
    // el borde del escudo A asoma media unidad alrededor del cabezal; pintado antes que la chaqueta se ve bien: revisado a 4×
    const result = A.audit(R, P, { crowd: CROWD_OK, allow: [["t.escudoA", "t.chaqueta*"]] });
    const n = A.failures(result);
    console.log(`\n=== ${label}: ${n} problema(s)`);
    if (n) console.log(A.report(result));
    bad += n;
  }
  console.log(bad ? `\naudit FAILED (${bad})` : "\naudit passed");
  if (bad) process.exitCode = 1;
}
