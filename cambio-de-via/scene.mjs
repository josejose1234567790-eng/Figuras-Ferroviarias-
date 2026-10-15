// Escena completa del cambio de vía, dibujada con el kit para cualquier cámara (azimut y elevación).
// Se usa en Node (build-3d.mjs) y en la página: no importa nada; recibe el kit (k), el torno (G) y los datos.

// Geometría independiente de la cámara: trazados de carriles, traviesas, contorno del tablero.
export function makeWorld(C) {
  const { R, X0, LB, THROW, FW, XS, XE, THETA_E, HALF, LEVER } = C;
  const yOff = (x, off) => (x <= X0 ? off : R - Math.sqrt((R - off) ** 2 - (x - X0) ** 2));
  const xEnd = (off) => X0 + (R - off) * Math.sin(THETA_E);
  const polar = (rho, th) => [X0 + rho * Math.sin(th), R - rho * Math.cos(th)];
  const solve = (f, target, lo, hi) => {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if ((f(mid) - target) * (f(lo) - target) <= 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const sample = (x0, x1, f, step = 3) => {
    const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / step));
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / n;
      return [x, f(x)];
    });
  };
  const XF = X0 + Math.sqrt((R + 15) ** 2 - (R - 15) ** 2);
  const WING = 15 - 2 * HALF - FW;
  const xTip = solve((x) => yOff(x, -15 + HALF) - (15 - HALF), 1.0, X0 + 40, XF + 30);
  const xNotch = solve((x) => yOff(x, -15 - HALF) - (15 + HALF), 0, X0 + 40, XF + 60);
  const xNose = xNotch + 10;
  const xKnuckleA = solve((x) => yOff(x, -15), WING, X0 + LB, XF);
  const xKnuckleB = solve((x) => yOff(x, -15 + 2 * HALF + FW), 15, X0, XF);
  const xCheckD = X0 + (XF - X0) * ((R - 15) / (R + 15));
  const flareTo = (x0, x1, len, amt) => (x) => amt * (smooth(x0 + len, x0, x) + smooth(x1 - len, x1, x));

  const rails = {
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
  const noseRing = [
    [xTip, 15 - HALF],
    [xNose, 15 - HALF],
    [xNose, 15 + HALF],
    [xNotch, 15 + HALF],
    ...sample(xNotch, xNose, (x) => yOff(x, -15 - HALF), 1).slice(1),
    ...sample(xNose, xTip, (x) => yOff(x, -15 + HALF), 1),
  ];
  const frogPlate = [
    [xKnuckleA - 18, WING - 6],
    [xNose + 14, WING - 6],
    [xNose + 14, yOff(xNose + 14, -15) + 8],
    [xKnuckleB - 6, 22],
    [xKnuckleA - 18, 20],
  ];

  // traviesas
  const sleepers = [];
  const TIMBER0 = X0 - 13;
  const SPLIT = 104;
  for (let t = TIMBER0 - 12; t >= XS + 2; t -= 12) sleepers.push({ kind: "straight", x: t });
  for (let t = TIMBER0; t <= XE - 3; t += 12) sleepers.push({ kind: t <= SPLIT ? "timber" : "straight", x: t });
  const thStart = Math.asin((122 - X0) / R);
  for (let th = thStart; th <= THETA_E - 0.02; th += 12 / R) sleepers.push({ kind: "radial", th });
  const railLines = [
    { f: () => -15, from: XS, to: XE },
    { f: (x) => (x <= X0 ? 15 : yOff(x, 15)), from: XS, to: xEnd(15) },
    { f: () => 15, from: X0 + LB, to: xKnuckleB - 2 },
    { f: () => 15, from: xNose, to: XE },
    { f: (x) => yOff(x, -15), from: X0 + LB, to: xKnuckleA - 2 },
    { f: (x) => yOff(x, -15), from: xNose, to: xEnd(-15) },
  ];

  // tablero: envolvente convexa del balasto y de la palanca
  const hull = (points) => {
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
  };
  const BED = 34;
  const core = [[XS - 6, -BED], [XE + 6, -BED], [XE + 6, BED], [XS - 6, BED], [LEVER.x - 16, LEVER.y - 16], [LEVER.x + 16, LEVER.y - 16], polar(R - BED, THETA_E), polar(R + BED, THETA_E)];
  const grown = (by) => hull(core.flatMap(([x, y]) => Array.from({ length: 24 }, (_, i) => [x + by * Math.cos((i / 24) * Math.PI * 2), y + by * Math.sin((i / 24) * Math.PI * 2)])));
  const coreHull = hull(core);
  const centre = coreHull.reduce((a, q) => [a[0] + q[0] / coreHull.length, a[1] + q[1] / coreHull.length], [0, 0]);
  const push = (p, by) => {
    const d = Math.hypot(p[0] - centre[0], p[1] - centre[1]);
    return [p[0] + ((p[0] - centre[0]) / d) * by, p[1] + ((p[1] - centre[1]) / d) * by];
  };

  const thM = Math.asin(Math.sqrt((R + BED) ** 2 - (R - BED) ** 2) / (R + BED));
  const ballast = [[XS - 6, -BED], [XE + 6, -BED], [XE + 6, BED]];
  for (let i = 0; i <= 40; i++) ballast.push(polar(R + BED, thM + ((THETA_E - thM) * i) / 40));
  for (let i = 40; i >= 0; i--) ballast.push(polar(R - BED, (THETA_E * i) / 40));
  ballast.push([XS - 6, BED]);
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = ballast.length - 1; i < ballast.length; j = i++) {
      const [xi, yi] = ballast[i];
      const [xj, yj] = ballast[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gravel = [];
  for (let n = 0; n < 1400; n++) {
    const x = XS - 4 + rand() * (XE - XS + 8);
    const y = -BED + 1 + rand() * 160;
    if (inside(x, y) && inside(x + 1.5, y + 1.5) && inside(x - 1.5, y - 1.5)) gravel.push([+x.toFixed(1), +y.toFixed(1)]);
  }

  return {
    C, yOff, xEnd, polar, sample, smooth, XF, WING, xTip, xNotch, xNose, xKnuckleA, xKnuckleB, xCheckD,
    rails, noseRing, frogPlate, sleepers, TIMBER0, railLines,
    board: grown(16), groove: grown(11), feet: coreHull.map((p) => push(p, 2)), screws: coreHull.map((p) => push(p, 3)), ballast, gravel, BED,
  };
}

// Dibuja la escena para una proyección P. `region` limita lo dibujado a una franja de x (la lupa).
export function drawScene(k, G, P, W, parts, state, region = null) {
  const { C } = W;
  const { Z, X0, LB, THROW, HALF, LEVER, PHI0, PHI1, STRETCH, SIGNAL, LOCK } = C;
  const at = (p) => k.iso(p, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const Dots = (pts, style) => k.dotsSvg(pts, style);
  const { cosA, sinA } = k.cameraOf(P);
  const front = sinA >= 0; // la cámara mira desde el lado de la desviada (+y)
  const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
  const inRegion = (x) => !region || (x >= region[0] && x <= region[1]);
  const { yOff, polar, sample, rails, XF, xNose, xKnuckleA, xCheckD, WING } = W;
  const out = [];

  // tablero
  out.push(`<path class="iso-halo" d="${k.extrude(W.board, -15, 10, P).fill}"/>`);
  for (const [x, y] of [...W.feet].sort((a, b) => depth2(a) - depth2(b))) {
    out.push(S(k.cylinder(x, y, 7, -15, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -13.4, 3.4, P, 28), { tone: "mid" }));
  }
  out.push(S(k.extrude(W.board, -10, 10, P, { bevel: 1.6 }), { tone: "mid", inner: L(k.ringSeam(W.board, -4, P), { tone: "faint" }) }));
  out.push(L(k.pathOf(W.groove.map(([x, y]) => at([x, y, 0])), true), { tone: "lo" }));
  out.push(L(W.screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(Dots(W.screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  if (!region) {
  const ruler = { x: C.XS + 4, y: W.BED + 8, w: 120, d: 6, r: 1 };
  out.push(S(k.slabOf(ruler, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(ruler.x + 4, ruler.x + ruler.w - 4, 4, 5, ruler.y + 0.8, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(Dots([at([ruler.x + 2, ruler.y + 3, 0.6]), at([ruler.x + ruler.w - 2, ruler.y + 3, 0.6])], { size: 0.45 }));
  const plate = { x: C.XS + 132, y: W.BED + 8, w: 40, d: 22, r: 2 };
  out.push(S(k.slabOf(plate, 0, 0.8, P, 4, 0.3), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([plate.x + 5, plate.y + 7], 0.8, P, "x"), "DS 1:9", { size: 3.6, tone: "mid" }));
  for (const [y, w] of [[12, 26], [15.5, 19], [19, 23]]) out.push(L(k.lineOnTop([plate.x + 5, plate.y + y], [plate.x + 5 + w, plate.y + y], 0.8, P), { tone: "lo", free: true }));
  out.push(Dots([at([plate.x + 2.6, plate.y + 2.6, 0.8]), at([plate.x + plate.w - 2.6, plate.y + plate.d - 2.6, 0.8])], { size: 0.45 }));

  }
  // balasto
  out.push(S(k.extrude(W.ballast, 0, Z.ballast, P, { convex: false }), { tone: "lo", crease: "faint" }));
  if (!state.fast) out.push(Dots(W.gravel.filter(([x]) => inRegion(x)).map(([x, y]) => at([x, y, Z.ballast])), { size: 0.32, tone: "faint" }));

  // traviesas y placas, ordenadas por profundidad; los tirantes y la varilla van en su hueco
  const baseplate = (cx, cy, along, across, ang = 0) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const pt = (a, b) => [cx + a * c - b * s, cy + a * s + b * c];
    const ring = [pt(-along / 2, -across / 2), pt(along / 2, -across / 2), pt(along / 2, across / 2), pt(-along / 2, across / 2)];
    return S(k.extrude(ring, Z.sleeper, Z.plate - Z.sleeper, P), { tone: "mid", crease: "none" }) + Dots([pt(0, -across / 2 + 1.2), pt(0, across / 2 - 1.2)].map(([x, y]) => at([x, y, Z.plate])), { size: 0.5, tone: "hi" });
  };
  const items = [];
  for (const sl of W.sleepers) {
    const o = [];
    if (sl.kind === "radial") {
      const [cx, cy] = polar(C.R, sl.th);
      if (!inRegion(cx)) continue;
      const ring = [polar(C.R + 25, sl.th - 3 / C.R), polar(C.R + 25, sl.th + 3 / C.R), polar(C.R - 25, sl.th + 3 / C.R), polar(C.R - 25, sl.th - 3 / C.R)];
      o.push(S(k.extrude(ring, Z.ballast, Z.sleeper - Z.ballast, P, { bevel: 0.4 }), { tone: "mid" }));
      o.push(L([-1.2, 1.4].map((d) => k.segment([...polar(C.R + 25, sl.th + d / C.R), Z.sleeper], [...polar(C.R - 25, sl.th + d / C.R), Z.sleeper], P)).join(""), { tone: "faint" }));
      for (const off of [-15, 15]) {
        const [x, y] = polar(C.R - off, sl.th);
        o.push(baseplate(x, y, 5, 7.5, sl.th + Math.PI / 2));
      }
      items.push({ key: depth2([cx, cy]), svg: o.join("") });
      continue;
    }
    const x = sl.x;
    if (!inRegion(x)) continue;
    let y0 = -25;
    let y1 = 25;
    if (sl.kind === "timber") y1 = Math.max(25, yOff(x + 3, 15) + 9);
    if (x === W.TIMBER0 + 12 || x === W.TIMBER0 + 24) y0 = LEVER.y - 14;
    if (x === SIGNAL.x) y0 = SIGNAL.y - 8;
    if (x === LOCK.x) y0 = Math.min(y0, LOCK.y - 6);
    o.push(S(k.slabOf({ x: x - 3, y: y0, w: 6, d: y1 - y0, r: 0.6 }, Z.ballast, Z.sleeper - Z.ballast, P, 2, 0.4), { tone: "mid" }));
    o.push(L([-1.2, 1.4].map((d) => k.lineOnTop([x + d, y0], [x + d, y1], Z.sleeper, P)).join(""), { tone: "faint" }));
    if (x >= X0 - 2 && x <= X0 + LB) {
      for (const [a, b] of [[-18, -15 + 2 + THROW + 2.5], [15 - 2 - THROW - 2.5, yOff(x, 15) + 3]]) {
        const lo = Math.min(a, b);
        o.push(S(k.slabOf({ x: x - 2.5, y: lo, w: 5, d: Math.abs(b - a), r: 0.3 }, Z.sleeper, Z.web - Z.sleeper, P, 2), { tone: "mid", crease: "none" }));
        o.push(Dots([at([x, lo + 1.2, Z.web]), at([x, lo + Math.abs(b - a) - 1.2, Z.web])], { size: 0.5, tone: "hi" }));
      }
    } else {
      const inFrog = x >= xKnuckleA - 4 && x <= xNose + 2;
      for (const line of W.railLines) {
        if (x < line.from || x > line.to) continue;
        if (inFrog && line.f(x) > 0 && line.f(x) < 40 && line !== W.railLines[1]) continue;
        const wide = x > XF - 26 && x < XF + 26 && line === W.railLines[0];
        const y = line.f(x);
        o.push(wide ? baseplate(x, y + 3, 5, 13.5) : baseplate(x, y, 5, 7.5));
      }
      if (x > xCheckD - 26 && x < xCheckD + 26) o.push(baseplate(x, yOff(x, 15) - 3, 5, 13.5));
    }
    // traviesas paralelas: el plano x = cte las separa, así que se ordenan por x a lo largo de la vista
    items.push({ key: x * cosA + 0.001 * (y0 + y1) * sinA, svg: o.join(""), x });
  }
  // tirantes, varilla y cerrojo, en el hueco entre sus dos traviesas
  for (const [i, x] of STRETCH.entries()) items.push({ key: x * cosA, svg: `<g data-part="stretch${i}">${state.stretch[i]}</g>` });
  items.sort((a, b) => a.key - b.key);
  for (const it of items) out.push(it.svg);
  if (inRegion(XF)) {
    out.push(S(k.extrude(W.frogPlate, Z.sleeper, Z.plate - Z.sleeper, P, { bevel: 0.4 }), { tone: "mid" }));
    out.push(Dots([[xKnuckleA - 14, WING - 3], [xNose + 10, WING - 3], [xNose + 10, yOff(xNose + 10, -15) + 5.5], [xKnuckleA - 14, 18]].map(([x, y]) => at([x, y, Z.plate])), { size: 0.55, tone: "hi" }));
  }

  // palanca y señal (lado −y de la vía)
  const leverSide = () => {
    const o = [];
    const base = { x: LEVER.x - 9, y: LEVER.y - 9, w: 18, d: 18, r: 2 };
    o.push(S(k.slabOf(base, Z.sleeper, 4, P, 4, 0.6), { tone: "mid" }));
    o.push(Dots(k.corners(base, 2.4).map(([x, y]) => at([x, y, Z.sleeper + 4])), { size: 0.55, tone: "hi" }));
    o.push(L(k.ring(LEVER.x, LEVER.y, 5.5, Z.sleeper + 4, P, 28), { tone: "faint" }));
    const cheek = (y) => S(k.slabOf({ x: LEVER.x - 6, y, w: 12, d: 2.4, r: 0.6 }, Z.sleeper + 4, LEVER.pivot + 5 - Z.sleeper - 4, P, 2, 0.3), { tone: "mid" });
    const nearY = front ? 1 : -1;
    const boss = () => {
      const y = LEVER.y + nearY * 4.6;
      const F = G.frameOf([LEVER.x, y, LEVER.pivot], [0, nearY, 0], [1, 0, 0], [0, 0, 1]);
      return S(G.disc(0, 1.6, 3.4, F, P, { bevel: 0.3 }), { tone: "mid" }) + S(G.disc(1.6, 2.6, 1.6, F, P), { tone: "hi" }) +
        Dots([PHI0, PHI1].map((a) => at([LEVER.x + Math.sin(a) * 5.4, y, LEVER.pivot + Math.cos(a) * 5.4 - 0.6])), { size: 0.6, tone: "mid" });
    };
    o.push(cheek(front ? LEVER.y - 4.6 : LEVER.y + 2.2));
    o.push(`<g data-part="lever">${state.lever}</g>`);
    o.push(cheek(front ? LEVER.y + 2.2 : LEVER.y - 4.6), boss());
    return o.join("");
  };
  const signal = () => {
    // señal baja de maniobra: caja con dos focos, rojo (parada) y verde (vía libre)
    const { x, y } = SIGNAL;
    const o = [S(k.slabOf({ x: x - 5, y: y - 5, w: 10, d: 10, r: 1 }, Z.sleeper, 2, P, 3, 0.4), { tone: "mid" })];
    o.push(S(k.cylinder(x, y, 1.6, Z.sleeper + 2, 10, P, 18), { tone: "mid" }));
    const head = { x: x - 4, y: y - 3, w: 8, d: 6, r: 1.4 };
    o.push(S(k.slabOf(head, Z.sleeper + 12, 13, P, 4, 0.5), { tone: "hi" }));
    const face = front ? head.y + head.d : head.y;
    const lamp = (z) => k.pathOf(Array.from({ length: 20 }, (_, i) => at([x + 2.2 * Math.cos((i / 20) * 6.283), face, z + 2.2 * Math.sin((i / 20) * 6.283)])), true);
    o.push(`<path class="cv-lamp" data-lamp="red" d="${lamp(Z.sleeper + 21)}"/>`, `<path class="cv-lamp" data-lamp="green" d="${lamp(Z.sleeper + 16)}"/>`);
    return o.join("");
  };
  const lockBox = () => {
    // caja del cerrojo junto a la contraaguja derecha, al lado de la varilla
    const { x, y } = LOCK;
    const box = { x: x - 4, y: y - 4, w: 8, d: 8, r: 1 };
    return S(k.slabOf(box, Z.sleeper, 5, P, 3, 0.5), { tone: "mid" }) + Dots(k.corners(box, 1.6).map(([a, b]) => at([a, b, Z.sleeper + 5])), { size: 0.45, tone: "hi" });
  };
  const sideStuff = () => (inRegion(SIGNAL.x) ? signal() : "") + (inRegion(LEVER.x) ? leverSide() + lockBox() : "");
  if (front) out.push(sideStuff());

  // patines: todos antes que las cabezas
  const strip = (pts, half) => parts.stripRing(pts, half);
  const footOf = (pts, half = 1.7) => S(k.extrude(strip(pts, half), Z.foot, Z.web - Z.foot, P, { convex: false }), { tone: "lo", crease: "none" });
  const headOf = (pts, style = {}) => S(k.extrude(strip(pts, 0.38), Z.web, Z.head - Z.web, P, { convex: false }), { tone: "lo", crease: "none" }) + S(k.extrude(strip(pts, HALF), Z.head, Z.top - Z.head, P, { convex: false }), { tone: "mid", crease: "faint", ...style });
  const clip = (pts) => (region ? pts.filter(([x]) => x >= region[0] - 10 && x <= region[1] + 10) : pts);
  for (const key of Object.keys(rails)) {
    const pts = clip(rails[key]);
    if (pts.length > 1) out.push(footOf(pts, key.startsWith("check") ? 1.4 : 1.7));
  }
  const side = front ? 1 : -1;
  const joint = (x, f) => (inRegion(x) ? parts.fishplate(x, f, side) : "");
  const H = (key, style, extra = "") => {
    const pts = clip(rails[key]);
    return pts.length > 1 ? headOf(pts, style) + extra : "";
  };
  const heads = {
    farStock: () => H("farStock", {}, joint(-150, () => -15) + joint(130, () => -15)),
    checkS: () => H("checkS", { tone: "hi" }, Dots([-14, -5, 5, 14].map((d) => at([XF + d, -15 + HALF + C.FW / 2, Z.head + 0.6])), { size: 0.5, tone: "lo" })),
    closureA: () => H("closureA", { tone: "hi" }, joint(X0 + LB, (x) => yOff(x, -15))),
    nose: () => (inRegion(XF) ? S(k.extrude(W.noseRing, Z.foot, Z.top - Z.foot, P, { convex: false }), { tone: "hi", crease: "faint" }) : ""),
    noseS: () => H("noseS", {}, joint(xNose + 1, () => 15) + joint(-150, () => 15)),
    noseDa: () => H("noseDa"),
    closureB: () => H("closureB", { tone: "hi" }, joint(X0 + LB, () => 15)),
    nearA: () => H("nearA", {}, joint(-150, () => 15)),
    noseDb: () => H("noseDb", {}, joint(xNose + 1, (x) => yOff(x, -15))),
    checkD: () => H("checkD", { tone: "hi" }, Dots([-14, -5, 5, 14].map((d) => at([xCheckD + d, yOff(xCheckD + d, 15) - HALF - C.FW / 2, Z.head + 0.6])), { size: 0.5, tone: "lo" })),
    nearB: () => H("nearB"),
    bladeA: () => `<g data-part="bladeA">${state.bladeA}</g>`,
    bladeB: () => `<g data-part="bladeB">${state.bladeB}</g>`,
    trainS: () => `<g data-part="train-straight"></g>`,
    trainD: () => `<g data-part="train-diverging"></g>`,
  };
  // Orden de pintado de las cabezas: de lejos a cerca según el lado desde el que se mira.
  // Las ranuras del tren separan los carriles que quedan bajo el tren de los que pasan por delante.
  const order = front
    ? ["farStock", "checkS", "bladeA", "closureA", "nose", "noseS", "noseDa", "closureB", "bladeB", "nearA", "trainS", "noseDb", "checkD", "nearB", "trainD"]
    : ["nearB", "checkD", "noseDb", "nearA", "bladeB", "closureB", "noseDa", "nose", "closureA", "bladeA", "trainD", "noseS", "checkS", "farStock", "trainS"];
  for (const key of order) out.push(heads[key]());
  if (!front) out.push(sideStuff());
  return out.join("");
}

// Cerrojo: un pestillo sale de su caja y entra en la muesca de la varilla (p = 0 abierto, 1 enclavado).
export function lockBolt(k, P, C, p) {
  const { Z, LOCK } = C;
  const x1 = LOCK.x - 4;
  const x0 = x1 - 0.6 - 3.4 * p;
  return k.solidSvg(k.slabOf({ x: x0, y: LOCK.y - 1, w: x1 - x0, d: 2, r: 0.3 }, Z.sleeper + 1.6, 1.6, P, 2), { tone: "hi", crease: "none", lit: p > 0.98 });
}
