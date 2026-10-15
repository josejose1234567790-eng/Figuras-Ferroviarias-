import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { makeParts } from "./parts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, "..", ".claude", "skills", "anatomy", "kit");
const theme = process.argv.includes("--dark") ? "dark" : "light";

const WIDTH = 640;
const HEIGHT = 290;

// ---------------- Modelo ----------------
// Unidades del dibujo: ancho de vía (entre ejes de carril) 30. Escala longitudinal comprimida.
const R = 360; // radio del eje de la vía desviada
const X0 = -90; // punta de agujas: aquí empieza la curva
const LB = 70; // longitud de aguja (de la punta al talón)
const THROW = 6; // carrera de la punta de aguja (exagerada)
const FW = 2.4; // canal de paso de la pestaña (ranura)
const XS = -205;
const XE = 180;
const THETA_E = Math.asin(240 / R); // la desviada termina donde su eje llega a x = 150
const Z = { ballast: 4, sleeper: 7.5, plate: 8.5, foot: 8.5, web: 9.2, head: 11.6, top: 13.2, bar: 4.2, deck: 27 };
const WHEEL = 5;
const LEVER = { x: X0 + 5, y: -50, pivot: 21 };
const PHI0 = -0.5;
const PHI1 = 0.5;
const STRETCH = [X0 + 5, X0 + 29];

const BOARD = { x: -218, y: -74, w: 412, d: 214, r: 8 };
const BOARD_H = 10;
const FOOT_H = 5;

const solve = (f, target, lo, hi) => {
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) - target) * (f(lo) - target) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
};

const HALF = 0.9;
const D0 = { HALF, R, X0, LB, THROW, Z, WHEEL, LEVER, PHI0, PHI1, STRETCH };
const yOff = (x, off) => (x <= X0 ? off : R - Math.sqrt((R - off) ** 2 - (x - X0) ** 2));
const xEnd = (off) => X0 + (R - off) * Math.sin(THETA_E);
const polar = (rho, th) => [X0 + rho * Math.sin(th), R - rho * Math.cos(th)];

const XF = X0 + Math.sqrt((R + 15) ** 2 - (R - 15) ** 2); // cruce teórico de los ejes de carril
const WING = 15 - 2 * HALF - FW; // eje de la pata de liebre junto a la punta recta
const xTip = solve((x) => yOff(x, -15 + HALF) - (15 - HALF), 1.0, X0 + 40, XF + 30);
const xNotch = solve((x) => yOff(x, -15 - HALF) - (15 + HALF), 0, X0 + 40, XF + 60);
const xNose = xNotch + 10;
const xKnuckleA = solve((x) => yOff(x, -15), WING, X0 + LB, XF);
const xKnuckleB = solve((x) => yOff(x, -15 + 2 * HALF + FW), 15, X0, XF);
const xCheckD = X0 + (XF - X0) * ((R - 15) / (R + 15));

// ---------------- Tablero ----------------
// El tablero sigue la vía: envolvente convexa del balasto y de la palanca, con las esquinas redondeadas.
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
const BED = 34;
const bedCore = () => {
  const pts = [[XS - 6, -BED], [XE + 6, -BED], [XE + 6, BED], [XS - 6, BED], [LEVER.x - 16, LEVER.y - 16], [LEVER.x + 16, LEVER.y - 16]];
  for (const rho of [R - BED, R + BED]) pts.push(polar(rho, THETA_E));
  return pts;
};
const grown = (by) => hull(bedCore().flatMap(([x, y]) => Array.from({ length: 24 }, (_, i) => [x + by * Math.cos((i / 24) * Math.PI * 2), y + by * Math.sin((i / 24) * Math.PI * 2)])));
const BOARD_RING = grown(16);

// ---------------- Proyección ----------------
const P = k.fitProjection(
  [...BOARD_RING.flatMap(([x, y]) => [[x, y, -BOARD_H - FOOT_H], [x, y, 0]]), [LEVER.x, LEVER.y - 26, 78], [XS + 40, 0, 62], [XE - 20, 0, 62], [...polar(R, THETA_E - 0.1), 62]],
  WIDTH,
  HEIGHT,
  process.argv.includes("--plan") ? { pad: 16, azimuth: 90, elevation: 89 } : { pad: 14, azimuth: 70, elevation: 34 },
);
const parts = makeParts(k, G, P, D0);
const { stripRing, sample } = parts;
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dots = (pts, style) => k.dotsSvg(pts, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function board() {
  const out = [`<path class="iso-halo" d="${k.extrude(BOARD_RING, -BOARD_H - FOOT_H, BOARD_H, P).fill}"/>`];
  const core = hull(bedCore());
  const inset = (p, by) => {
    const c = core.reduce((a, q) => [a[0] + q[0] / core.length, a[1] + q[1] / core.length], [0, 0]);
    const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
    return [p[0] - ((p[0] - c[0]) / d) * by, p[1] - ((p[1] - c[1]) / d) * by];
  };
  const feetAt = byDepth(core.map((p) => inset(p, -2)));
  for (const [x, y] of feetAt) {
    out.push(S(k.cylinder(x, y, 7, -BOARD_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -BOARD_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.extrude(BOARD_RING, -BOARD_H, BOARD_H, P, { bevel: 1.6 }), { tone: "mid", inner: L(k.ringSeam(BOARD_RING, -4, P), { tone: "faint" }) }));
  out.push(L(k.pathOf(grown(11).map(([x, y]) => at([x, y, 0])), true), { tone: "lo" }));
  const screws = core.map((p) => inset(p, -3));
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // regla a lo largo del canto delantero recto
  const strip = { x: XS + 4, y: BED + 8, w: 120, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(Dots([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  // placa de características, entre la regla y la desviada
  const plate = { x: XS + 132, y: BED + 8, w: 40, d: 22, r: 2 };
  out.push(S(k.slabOf(plate, 0, 0.8, P, 4, 0.3), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([plate.x + 5, plate.y + 7], 0.8, P, "x"), "DS 1:9", { size: 3.6, tone: "mid" }));
  for (const [y, w] of [[12, 26], [15.5, 19], [19, 23]]) out.push(L(k.lineOnTop([plate.x + 5, plate.y + y], [plate.x + 5 + w, plate.y + y], 0.8, P), { tone: "lo", free: true }));
  out.push(Dots([at([plate.x + 2.6, plate.y + 2.6, 0.8]), at([plate.x + plate.w - 2.6, plate.y + plate.d - 2.6, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ---------------- Balasto ----------------
function ballast() {
  const B = 34;
  const thM = Math.asin((Math.sqrt((R + B) ** 2 - (R - B) ** 2)) / (R + B));
  const outer = [];
  for (let i = 0; i <= 40; i++) outer.push(polar(R + B, thM + ((THETA_E - thM) * i) / 40));
  const inner = [];
  for (let i = 40; i >= 0; i--) inner.push(polar(R - B, (THETA_E * i) / 40));
  const ring = [[XS - 6, -B], [XE + 6, -B], [XE + 6, B], ...outer, ...inner, [XS - 6, B]];
  const out = [S(k.extrude(ring, 0, Z.ballast, P, { convex: false }), { tone: "lo", crease: "faint" })];
  const dots = [];
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (let n = 0; n < 1400; n++) {
    const x = XS - 4 + rand() * (XE - XS + 8);
    const y = -B + 1 + rand() * 160;
    if (inside(x, y) && inside(x + 1.5, y + 1.5) && inside(x - 1.5, y - 1.5)) dots.push(at([x, y, Z.ballast]));
  }
  out.push(Dots(dots, { size: 0.32, tone: "faint" }));
  return out.join("");
}

// ---------------- Traviesas y placas ----------------
const sleepers = [];
const TIMBER0 = X0 - 13;
const SPLIT = 104;
for (let t = TIMBER0 - 12; t >= XS + 2; t -= 12) sleepers.push({ kind: "straight", x: t });
for (let t = TIMBER0; t <= XE - 3; t += 12) sleepers.push({ kind: t <= SPLIT ? "timber" : "straight", x: t });
const thStart = Math.asin((122 - X0) / R);
for (let th = thStart; th <= THETA_E - 0.02; th += 12 / R) sleepers.push({ kind: "radial", th });

// líneas de carril que llevan placa de asiento en cada traviesa
const railLines = [
  { f: () => -15, from: XS, to: XE },
  { f: (x) => (x <= X0 ? 15 : yOff(x, 15)), from: XS, to: xEnd(15) },
  { f: () => 15, from: X0 + LB, to: xKnuckleB - 2 },
  { f: () => 15, from: xNose, to: XE },
  { f: (x) => yOff(x, -15), from: X0 + LB, to: xKnuckleA - 2 },
  { f: (x) => yOff(x, -15), from: xNose, to: xEnd(-15) },
];

function baseplate(cx, cy, along, across, ang = 0) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const pt = (a, b) => [cx + a * c - b * s, cy + a * s + b * c];
  const ring = [pt(-along / 2, -across / 2), pt(along / 2, -across / 2), pt(along / 2, across / 2), pt(-along / 2, across / 2)];
  const out = [S(k.extrude(ring, Z.sleeper, Z.plate - Z.sleeper, P), { tone: "mid", crease: "none" })];
  out.push(Dots([pt(0, -across / 2 + 1.2), pt(0, across / 2 - 1.2)].map(([x, y]) => at([x, y, Z.plate])), { size: 0.5, tone: "hi" }));
  return out.join("");
}

function sleeperSvg(sl) {
  const out = [];
  if (sl.kind === "radial") {
    const [cx, cy] = polar(R, sl.th);
    const ring = [polar(R + 25, sl.th - 3 / R), polar(R + 25, sl.th + 3 / R), polar(R - 25, sl.th + 3 / R), polar(R - 25, sl.th - 3 / R)];
    out.push(S(k.extrude(ring, Z.ballast, Z.sleeper - Z.ballast, P, { bevel: 0.4 }), { tone: "mid" }));
    const grain = [-1.2, 1.4].map((d) => k.segment([...polar(R + 25, sl.th + d / R), Z.sleeper], [...polar(R - 25, sl.th + d / R), Z.sleeper], P)).join("");
    out.push(L(grain, { tone: "faint" }));
    for (const off of [-15, 15]) {
      const [x, y] = polar(R - off, sl.th);
      out.push(baseplate(x, y, 5, 7.5, sl.th + Math.PI / 2));
    }
    return { depth: depth2([cx, cy]), svg: out.join("") };
  }
  const x = sl.x;
  let y0 = -25;
  let y1 = 25;
  if (sl.kind === "timber") y1 = Math.max(25, yOff(x + 3, 15) + 9);
  if (x === TIMBER0 + 12 || x === TIMBER0 + 24) y0 = LEVER.y - 14;
  const plan = { x: x - 3, y: y0, w: 6, d: y1 - y0, r: 0.6 };
  out.push(S(k.slabOf(plan, Z.ballast, Z.sleeper - Z.ballast, P, 2, 0.4), { tone: "mid" }));
  out.push(L([-1.2, 1.4].map((d) => k.lineOnTop([x + d, y0], [x + d, y1], Z.sleeper, P)).join(""), { tone: "faint" }));
  const inBlades = x >= X0 - 2 && x <= X0 + LB;
  const inFrog = x >= xKnuckleA - 4 && x <= xNose + 2;
  if (inBlades) {
    // placas de deslizamiento: la aguja resbala sobre ellas al cambiar
    for (const [a, b] of [[-18, -15 + 2 + THROW + 2.5], [15 - 2 - THROW - 2.5, yOff(x, 15) + 3]]) {
      const lo = Math.min(a, b);
      const pl = { x: x - 2.5, y: lo, w: 5, d: Math.abs(b - a), r: 0.3 };
      out.push(S(k.slabOf(pl, Z.sleeper, Z.web - Z.sleeper, P, 2), { tone: "mid", crease: "none" }));
      out.push(Dots([at([x, lo + 1.2, Z.web]), at([x, lo + Math.abs(b - a) - 1.2, Z.web])], { size: 0.5, tone: "hi" }));
    }
  } else {
    for (const line of railLines) {
      if (x < line.from || x > line.to) continue;
      if (inFrog && line.f(x) > 0 && line.f(x) < 40 && line !== railLines[1]) continue;
      const wide = x > XF - 26 && x < XF + 26 && line === railLines[0];
      const y = line.f(x);
      out.push(wide ? baseplate(x, y + 3, 5, 13.5) : baseplate(x, y, 5, 7.5));
    }
    if (x > xCheckD - 26 && x < xCheckD + 26) out.push(baseplate(x, yOff(x, 15) - 3, 5, 13.5));
  }
  return { depth: depth2([x, (y0 + y1) / 2]), svg: out.join(""), x };
}

// ---------------- Carriles ----------------
const foot = (pts, half = 1.7) => S(k.extrude(stripRing(pts, half), Z.foot, Z.web - Z.foot, P, { convex: false }), { tone: "lo", crease: "none" });
const head = (pts, style = {}, half = HALF) => S(k.extrude(stripRing(pts, 0.38), Z.web, Z.head - Z.web, P, { convex: false }), { tone: "lo", crease: "none" }) + S(k.extrude(stripRing(pts, half), Z.head, Z.top - Z.head, P, { convex: false }), { tone: "mid", crease: "faint", ...style });
const ends = (pts) => [pts[0], pts[pts.length - 1]];

const flareTo = (x0, x1, len, amt) => (x) => amt * (smooth(x0 + len, x0, x) + smooth(x1 - len, x1, x));
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const R_ = {
  farStock: sample(XS, XE, () => -15, 8),
  checkS: sample(XF - 22, XF + 22, (x) => -15 + 2 * HALF + FW + flareTo(XF - 22, XF + 22, 7, 1.8)(x), 1.5),
  closureA: sample(X0 + LB, xNose + 6, (x) => Math.min(yOff(x, -15), WING) - 1.8 * smooth(xNose, xNose + 6, x), 1.5),
  closureB: sample(X0 + LB, xNose + 6, (x) => (x < xKnuckleB ? 15 : yOff(x, -15 + 2 * HALF + FW + 1.8 * smooth(xNose, xNose + 6, x))), 1.5),
  noseS: sample(xNose, XE, () => 15, 8),
  noseDa: sample(xNose, 81, (x) => yOff(x, -15), 2),
  noseDb: sample(81, xEnd(-15), (x) => yOff(x, -15), 3),
  nearA: [...sample(XS, X0, () => 15, 8), ...sample(X0 + 2, -11, (x) => yOff(x, 15), 2)],
  nearB: sample(-11, xEnd(15), (x) => yOff(x, 15), 3),
  checkD: sample(xCheckD - 22, xCheckD + 22, (x) => yOff(x, 15 - 2 * HALF - FW - flareTo(xCheckD - 22, xCheckD + 22, 7, 1.8)(x)), 1.5),
};
// Corazón: la punta (cara activa de los dos carriles que salen) en un solo bloque fundido.
const noseRing = [
  [xTip, 15 - HALF],
  [xNose, 15 - HALF],
  [xNose, 15 + HALF],
  [xNotch, 15 + HALF],
  ...sample(xNotch, xNose, (x) => yOff(x, -15 - HALF), 1).slice(1),
  ...sample(xNose, xTip, (x) => yOff(x, -15 + HALF), 1),
];
// Placa de asiento del corazón, bajo la punta, las patas de liebre y la garganta.
const frogPlate = [
  [xKnuckleA - 18, WING - 6],
  [xNose + 14, WING - 6],
  [xNose + 14, yOff(xNose + 14, -15) + 8],
  [xKnuckleB - 6, 22],
  [xKnuckleA - 18, 20],
];

function feet() {
  const out = [];
  for (const key of ["farStock", "checkS", "closureA", "closureB", "noseS", "noseDa", "noseDb", "nearA", "nearB", "checkD"]) out.push(foot(R_[key], key.startsWith("check") ? 1.4 : 1.7));
  return out.join("");
}

const joint = (x, f, side = 1) => parts.fishplate(x, f, side);
const heads = {
  farStock: head(R_.farStock) + joint(-150, () => -15) + joint(130, () => -15),
  checkS: head(R_.checkS, { tone: "hi" }) + Dots([-14, -5, 5, 14].map((d) => at([XF + d, -15 + HALF + FW / 2, Z.head + 0.6])), { size: 0.5, tone: "lo" }),
  closureA: head(R_.closureA, { tone: "hi" }) + joint(X0 + LB, (x) => yOff(x, -15)),
  nose: S(k.extrude(noseRing, Z.foot, Z.top - Z.foot, P, { convex: false }), { tone: "hi", crease: "faint" }),
  noseS: head(R_.noseS) + joint(xNose + 1, () => 15) + joint(-150, () => 15),
  noseDa: head(R_.noseDa),
  closureB: head(R_.closureB, { tone: "hi" }) + joint(X0 + LB, () => 15),
  nearA: head(R_.nearA) + joint(-150, () => 15),
  noseDb: head(R_.noseDb) + joint(xNose + 1, (x) => yOff(x, -15)),
  checkD: head(R_.checkD, { tone: "hi" }) + Dots([-14, -5, 5, 14].map((d) => at([xCheckD + d, yOff(xCheckD + d, 15) - HALF - FW / 2, Z.head + 0.6])), { size: 0.5, tone: "lo" }),
  nearB: head(R_.nearB),
};

// ---------------- Palanca ----------------
function leverBase() {
  const Lv = LEVER;
  const base = { x: Lv.x - 9, y: Lv.y - 9, w: 18, d: 18, r: 2 };
  const out = [S(k.slabOf(base, Z.sleeper, 4, P, 4, 0.6), { tone: "mid" })];
  out.push(Dots(k.corners(base, 2.4).map(([x, y]) => at([x, y, Z.sleeper + 4])), { size: 0.55, tone: "hi" }));
  out.push(L(k.ring(Lv.x, Lv.y, 5.5, Z.sleeper + 4, P, 28), { tone: "faint" }));
  out.push(S(k.slabOf({ x: Lv.x - 6, y: Lv.y - 4.6, w: 12, d: 2.4, r: 0.6 }, Z.sleeper + 4, Lv.pivot + 5 - Z.sleeper - 4, P, 2, 0.3), { tone: "mid" }));
  return out.join("");
}
function leverFront() {
  const Lv = LEVER;
  const y = Lv.y + 4.6;
  const out = [S(k.slabOf({ x: Lv.x - 6, y: Lv.y + 2.2, w: 12, d: 2.4, r: 0.6 }, Z.sleeper + 4, Lv.pivot + 5 - Z.sleeper - 4, P, 2, 0.3), { tone: "mid" })];
  const F = G.frameOf([Lv.x, y, Lv.pivot], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  out.push(S(G.disc(0, 1.6, 3.4, F, P, { bevel: 0.3 }), { tone: "mid" }));
  out.push(S(G.disc(1.6, 2.6, 1.6, F, P), { tone: "hi" }));
  // sector con las dos muescas de enclavamiento, grabado en la cara de la quijada
  const arc = [];
  for (let i = 0; i <= 24; i++) {
    const a = PHI0 - 0.14 + ((PHI1 - PHI0 + 0.28) * i) / 24;
    arc.push(at([Lv.x + Math.sin(a) * 4.6, y, Lv.pivot + 0.2 + Math.cos(a) * 4.6 - 4.6 + 4.6]));
  }
  out.push(Dots([PHI0, PHI1].map((a) => at([Lv.x + Math.sin(a) * 5.4, y, Lv.pivot + Math.cos(a) * 5.4 - 0.6])), { size: 0.6, tone: "mid" }));
  return out.join("");
}

// ---------------- Rutas del tren ----------------
function routeOf(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return { pts: points.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]), cum: cum.map((c) => +c.toFixed(2)) };
}
const ROUTES = {
  straight: routeOf([[XS - 120, 0], [XE + 10, 0]]),
  diverging: routeOf([[XS - 120, 0], [X0, 0], ...Array.from({ length: 60 }, (_, i) => polar(R, (THETA_E * (i + 1)) / 60))]),
};

// ---------------- Montaje ----------------
const b0 = 1;
const sleeperItems = sleepers.map(sleeperSvg).sort((a, b) => a.depth - b.depth);
const body = [board(), ballast()];
for (const item of sleeperItems) {
  body.push(item.svg);
  if (item.x === TIMBER0 + 12) body.push(`<g data-part="stretch0">${parts.rod(b0)}${parts.stretcher(STRETCH[0], b0)}</g>`);
  if (item.x === TIMBER0 + 36) body.push(`<g data-part="stretch1">${parts.stretcher(STRETCH[1], b0)}</g>`);
}
body.push(S(k.extrude(frogPlate, Z.sleeper, Z.plate - Z.sleeper, P, { bevel: 0.4 }), { tone: "mid" }));
body.push(Dots([[xKnuckleA - 14, WING - 3], [xNose + 10, WING - 3], [xNose + 10, yOff(xNose + 10, -15) + 5.5], [xKnuckleA - 14, 18]].map(([x, y]) => at([x, y, Z.plate])), { size: 0.55, tone: "hi" }));
body.push(leverBase(), `<g data-part="lever">${parts.leverArm(b0)}</g>`, leverFront());
body.push(feet());
body.push(heads.farStock, heads.checkS, `<g data-part="bladeA">${parts.blade("A", b0)}</g>`, heads.closureA, heads.nose, heads.noseS, heads.noseDa, heads.closureB, `<g data-part="bladeB">${parts.blade("B", b0)}</g>`, heads.nearA);
body.push(`<g data-part="train-straight"></g>`);
body.push(heads.noseDb, heads.checkD, heads.nearB);
body.push(`<g data-part="train-diverging"></g>`);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Un cambio de vía sencillo a izquierda sobre un tablero: traviesas largas, dos agujas unidas por tirantes, el corazón con su punta y patas de liebre, dos contrarrieles y una palanca de contrapeso al lado de la vía. Al mover la palanca, la varilla desplaza las agujas; la aguja que se acopla a su contraaguja decide el itinerario, y un tren de locomotora y vagón cisterna pasa por la vía desviada o por la directa.",
  body,
});

const DATA = { P, D: D0, ROUTES, XS, XE, X0, XF, xNose, xEnd: { straight: XE, diverging: xEnd(0) } };
const latheSource = readFileSync(join(KIT, "lathe.mjs"), "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { viewOf, frameOf, frameAlong, pointOf, disc, sphereOf, prismOf, solidOf, arcOf, dot3, add3, mul3, cross3, unit3 };})();\n`;
const partsScript = readFileSync(join(HERE, "parts.mjs"), "utf8").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const CSS = `<style>@media (max-width:560px){.iso-plate-corner[data-corner="readout"]{white-space:normal;left:0;text-align:right;line-height:1.35}.iso-plate-corner[data-corner="hint"]{bottom:34px}}.iso-stage{cursor:pointer}</style>`;
const page = CSS + k.plateHtml({
  fig: "Fig 1",
  title: "Cambio de vía",
  hint: "Pulsa la palanca · espacio",
  readout: "vía desviada · aguja derecha acoplada",
  keys: [
    { mark: "lit", label: "Agujas: la única pieza que se mueve; deciden el itinerario" },
    { mark: "raised", label: "Corazón, patas de liebre y contrarrieles: guían la pestaña donde se cruzan los carriles" },
    { mark: "edge", label: "Palanca de contrapeso, varilla y tirantes" },
  ],
  caption:
    "Cambio sencillo a izquierda. La palanca gira ±29° sobre su eje y la varilla arrastra las dos agujas a la vez, unidas por dos tirantes: una se acopla a su contraaguja y la otra queda abierta, de modo que la pestaña de las ruedas entra por un lado o por el otro. Más adelante los carriles se cruzan en el corazón: la rueda salta la garganta apoyada en la pata de liebre mientras el contrarriel del carril opuesto sujeta el eje por la otra rueda y evita que la pestaña choque contra la punta. Mientras el tren ocupa el aparato, la palanca queda enclavada. Escala longitudinal comprimida y carrera de agujas exagerada para que se vea.",
  body: `<div class="iso-stage" tabindex="0" role="button" aria-pressed="true" aria-label="Cambio de vía: pulsa o usa espacio para mover la palanca y cambiar las agujas; flechas izquierda y derecha eligen vía desviada o directa">${svg}</div>`,
});

const name = theme === "light" ? "cambio-de-via.html" : "cambio-de-via-oscuro.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Cambio de vía", theme, body: page, script: kitScript() + latheScript + partsScript + live }));
console.log("wrote", name, `XF=${XF.toFixed(1)} tip=${xTip.toFixed(1)} notch=${xNotch.toFixed(1)} kA=${xKnuckleA.toFixed(1)} kB=${xKnuckleB.toFixed(1)}`);
