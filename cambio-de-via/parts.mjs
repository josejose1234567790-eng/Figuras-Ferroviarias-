// Geometría del cambio de vía. Se usa en la build (Node) y se inyecta en la página,
// así que no importa nada: recibe el kit (k), el torno (G), la proyección (P) y los datos (D).
export function makeParts(k, G, P, D) {
  const S = (paths, style) => k.solidSvg(paths, style);
  const Ln = (d, style) => k.lineSvg(d, style);
  const at = (p) => k.iso(p, P);
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const { R, X0, LB, THROW, Z } = D;

  // Carril desplazado `off` del eje de la desviada (positivo hacia +y, el centro de la curva).
  const yOff = (x, off) => (x <= X0 ? off : R - Math.sqrt((R - off) ** 2 - (x - X0) ** 2));

  // Una banda de anchura variable a lo largo de una polilínea: el contorno en planta de un carril.
  function stripRing(points, half) {
    const left = [];
    const right = [];
    points.forEach((p, i) => {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const h = typeof half === "function" ? half(i / (points.length - 1)) : half;
      left.push([p[0] - (dy / l) * h, p[1] + (dx / l) * h]);
      right.push([p[0] + (dy / l) * h, p[1] - (dx / l) * h]);
    });
    return [...left, ...right.reverse()];
  }

  const sample = (x0, x1, f, step = 3) => {
    const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / step));
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / n;
      return [x, f(x)];
    });
  };

  // Carril Vignole: patín ancho y bajo, alma y cabeza en un solo bloque con la cara de rodadura arriba.
  function railSvg(points, { tone = "mid", lit = false, foot = 1.7, head = D.HALF, footOn = true } = {}) {
    const out = [];
    if (footOn) out.push(S(k.extrude(stripRing(points, foot), Z.foot, Z.web - Z.foot, P, { convex: false }), { tone: "lo", crease: "none" }));
    const web = typeof head === "function" ? (t) => Math.min(0.38, head(t) * 0.7) : 0.38;
    out.push(S(k.extrude(stripRing(points, web), Z.web, Z.head - Z.web, P, { convex: false }), { tone: "lo", crease: "none" }));
    out.push(S(k.extrude(stripRing(points, head), Z.head, Z.top - Z.head, P, { convex: false }), { tone, lit, crease: "faint" }));
    return out.join("");
  }

  // Bridas (eclisas) en una junta: placa en el alma a cada lado y cuatro tornillos en el lado visible.
  function fishplate(xc, f, side = 1) {
    const pts = sample(xc - 7, xc + 7, f, 2);
    const offs = pts.map(([x, y], i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [x - ((b[1] - a[1]) / l) * 0.75 * side, y + ((b[0] - a[0]) / l) * 0.75 * side];
    });
    const ring = stripRing(offs, 0.36);
    const plate = S(k.extrude(ring, Z.web, Z.head - Z.web - 0.2, P, { convex: false }), { tone: "mid", crease: "none" });
    const bolts = [-4.5, -1.5, 1.5, 4.5].map((dx) => {
      const x = xc + dx;
      const y = f(x) + 1.12 * side;
      return at([x, y, (Z.web + Z.head) / 2]);
    });
    return plate + k.dotsSvg(bolts, { size: 0.5, tone: "hi" });
  }

  // Posición del eje de cada aguja. b = 0 itinerario directo, b = 1 desviado.
  const TIP_GAP = D.HALF + 0.42;
  function bladeY(side, x, b) {
    const t = Math.min(1, Math.max(0, (x - X0) / LB));
    if (side === "A") return yOff(x, -15) + TIP_GAP * (1 - sm(0, 0.8, t)) + (1 - b) * THROW * (1 - t);
    return 15 - TIP_GAP * (1 - sm(0, 0.8, t)) - b * THROW * (1 - t);
  }
  const bladeHalf = (t) => 0.42 + (D.HALF - 0.42) * sm(0, 0.45, t);

  function blade(side, b) {
    const pts = sample(X0, X0 + LB, (x) => bladeY(side, x, b), 2);
    // La aguja apoya en las placas de deslizamiento: sin patín, cabeza y alma desde Z.head.
    return railSvg(pts, { tone: "hi", lit: true, head: bladeHalf, footOn: false }) + k.dotsSvg([at([X0 + LB - 3, bladeY(side, X0 + LB - 3, b), Z.top])], { size: 0.45, tone: "lo" });
  }

  // Tirante entre agujas y varilla de la palanca: barras planas entre traviesas, bajo los patines.
  function bar(x, y0, y1, z, w = 2.4, h = 1.4, tone = "mid") {
    const lo = Math.min(y0, y1);
    return S(k.slabOf({ x: x - w / 2, y: lo, w, d: Math.abs(y1 - y0), r: 0.4 }, z, h, P, 2, 0.3), { tone, crease: "faint" });
  }
  function lug(x, y, z0, z1) {
    return S(k.slabOf({ x: x - 1.8, y: y - 1.6, w: 3.6, d: 3.2, r: 0.5 }, z0, z1 - z0, P, 2), { tone: "mid", crease: "none" }) + k.dotsSvg([at([x, y, z1])], { size: 0.45, tone: "hi" });
  }
  function stretcher(x, b) {
    const ya = bladeY("A", x, b);
    const yb = bladeY("B", x, b);
    return bar(x, ya - 1.6, yb + 1.6, Z.bar, 2.6, 1.2) + lug(x, ya, Z.bar + 1.2, Z.web) + lug(x, yb, Z.bar + 1.2, Z.web);
  }
  function rod(b) {
    const x = D.STRETCH[0];
    const ya = bladeY("A", x, b);
    const L = D.LEVER;
    return bar(x, L.y + 2, ya - 1.6, Z.bar + 0.1, 1.8, 1.2, "hi") + k.dotsSvg([at([x, L.y + 12, Z.bar + 1.3])], { size: 0.45, tone: "lo" });
  }

  // Palanca de contrapeso: gira alrededor de un eje paralelo a la vía.
  const leverAngle = (b) => D.PHI0 + (D.PHI1 - D.PHI0) * b;
  function leverArm(b) {
    const L = D.LEVER;
    const phi = leverAngle(b);
    // gira en el plano paralelo a la vía; una manivela acodada dentro de la caja mueve la varilla
    const axis = [Math.sin(phi), 0, Math.cos(phi)];
    const pivot = [L.x, L.y, L.pivot];
    const F = G.frameOf(pivot, axis, [0, 1, 0], G.cross3(axis, [0, 1, 0]));
    const square = (h) => [[-h, -h], [h, -h], [h, h], [-h, h]];
    const out = [];
    out.push(S(G.prismOf(F, square(1.3), -4, 30, P), { tone: "hi", crease: "faint" }));
    const weight = G.pointOf(F, 30, 0, 0);
    out.push(S(G.solidOf([[0, 2.2], [1.5, 4.6, 1], [5, 5.8, 1], [9, 4.4, 1], [10.8, 2.0]], G.frameOf(G.add3(weight, G.mul3(axis, -1)), axis, [0, 1, 0], F.v), P), { tone: "mid" }));
    out.push(S(G.prismOf(F, square(1.0), 39.8, 45, P), { tone: "hi", crease: "faint" }));
    out.push(S(G.disc(45, 52, 1.7, F, P), { tone: "mid" }));
    out.push(S(G.sphereOf(G.pointOf(F, 52.6, 0, 0), 2.2, P), { tone: "hi" }));
    return out.join("");
  }

  // ---------------- Tren ----------------
  function routeAt(route, s) {
    const pts = route.pts;
    const cum = route.cum;
    const clamped = Math.min(cum[cum.length - 1], Math.max(0, s));
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= clamped) lo = mid;
      else hi = mid;
    }
    const t = (clamped - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
  }

  // Un vehículo apoyado en dos ejes que siguen la vía: posición y rumbo salen de los dos puntos de apoyo.
  function poseOf(route, sFront, base) {
    const f = routeAt(route, sFront);
    const r = routeAt(route, sFront - base);
    const h = [f[0] - r[0], f[1] - r[1]];
    const l = Math.hypot(h[0], h[1]) || 1;
    const dir = [h[0] / l, h[1] / l];
    return { c: [(f[0] + r[0]) / 2, (f[1] + r[1]) / 2], dir, left: [-dir[1], dir[0]] };
  }
  const local = (pose, a, l) => [pose.c[0] + pose.dir[0] * a + pose.left[0] * l, pose.c[1] + pose.dir[1] * a + pose.left[1] * l];
  const box = (pose, a0, a1, l0, l1) => [local(pose, a0, l0), local(pose, a1, l0), local(pose, a1, l1), local(pose, a0, l1)];
  const prism = (pose, a0, a1, l0, l1, z, h, style, bevel) => S(k.extrude(box(pose, a0, a1, l0, l1), z, h, P, { bevel }), style);
  const V = G.viewOf(P);
  const faces = (pose) => {
    const seen = (n) => n[0] * V[0] + n[1] * V[1] > 0;
    return { leftSeen: seen(pose.left), front: seen(pose.dir) };
  };
  // Un cuadrilátero sobre una cara vertical del vehículo (ventanas, rejillas, puertas).
  function onSide(pose, l, a0, a1, z0, z1) {
    const p = [local(pose, a0, l), local(pose, a1, l)];
    return k.pathOf([at([...p[0], z0]), at([...p[1], z0]), at([...p[1], z1]), at([...p[0], z1])], true);
  }
  function onEnd(pose, a, l0, l1, z0, z1) {
    const p = [local(pose, a, l0), local(pose, a, l1)];
    return k.pathOf([at([...p[0], z0]), at([...p[1], z0]), at([...p[1], z1]), at([...p[0], z1])], true);
  }
  const lateralFrame = (pose, a, l, z) => {
    const o = [...local(pose, a, l), z];
    return G.frameOf(o, [pose.left[0], pose.left[1], 0], [pose.dir[0], pose.dir[1], 0], [0, 0, 1]);
  };
  const axialFrame = (pose, a, l, z) => G.frameOf([...local(pose, a, l), z], [pose.dir[0], pose.dir[1], 0], [pose.left[0], pose.left[1], 0], [0, 0, 1]);

  function wheelset(pose, axles, side) {
    const out = [];
    const l = side * 15;
    const wz = Z.top + D.WHEEL;
    for (const a of axles) {
      const F = lateralFrame(pose, a, l, wz);
      const s0 = side > 0 ? -1.6 : -1.8;
      const s1 = side > 0 ? 1.8 : 1.6;
      out.push(S(G.disc(s0, s1, D.WHEEL, F, P, { steps: 40 }), { tone: "lo" }));
      out.push(S(G.disc(side > 0 ? 1.8 : -2.4, side > 0 ? 2.4 : -1.8, 1.4, F, P, { steps: 20 }), { tone: "mid" }));
    }
    return out.join("");
  }
  function sideFrame(pose, half, axles, side) {
    const l0 = side > 0 ? 17.6 : -19.2;
    const out = [prism(pose, -half, half, l0, l0 + 1.6, Z.top + 8.6, 3.6, { tone: "mid" })];
    for (const a of axles) out.push(prism(pose, a - 2.2, a + 2.2, l0 + (side > 0 ? 1.6 : -1.2), l0 + (side > 0 ? 2.8 : 0), Z.top + 3.6, 5, { tone: "mid" }));
    return out.join("");
  }
  function buffers(pose, a, dirSign) {
    const out = [];
    for (const l of [-11, 11]) {
      const F = axialFrame(pose, a, l, Z.deck + 2);
      const s0 = dirSign > 0 ? 0 : -4.4;
      const s1 = dirSign > 0 ? 4.4 : 0;
      out.push(S(G.disc(dirSign > 0 ? 0 : -2.6, dirSign > 0 ? 2.6 : 0, 1.2, F, P, { steps: 16 }), { tone: "mid" }));
      out.push(S(G.disc(dirSign > 0 ? 2.6 : s0, dirSign > 0 ? s1 : -2.6, 2.4, F, P, { steps: 28 }), { tone: "hi" }));
    }
    return out.join("");
  }

  function loco(pose) {
    const { leftSeen, front } = faces(pose);
    const side = leftSeen ? 1 : -1;
    const A = [-17, 17];
    const out = [];
    out.push(wheelset(pose, A, -side), sideFrame(pose, 26, A, -side), wheelset(pose, A, side), sideFrame(pose, 26, A, side));
    // el extremo lejano primero: topes, cabina o capó según hacia dónde mire la locomotora
    out.push(front ? buffers(pose, -33, -1) : buffers(pose, 33, 1));
    out.push(prism(pose, -33, 33, -20, 20, Z.deck - 4, 4, { tone: "mid" }, 0.5));
    const sideL = 17 * side;
    const cab = [];
    cab.push(prism(pose, -31, -9, -17, 17, Z.deck, 32, { tone: "hi" }, 0.6));
    cab.push(prism(pose, -32.5, -7.5, -18.5, 18.5, Z.deck + 32, 2, { tone: "mid" }, 0.5));
    cab.push(Ln(onSide(pose, sideL, -27, -13, Z.deck + 17, Z.deck + 28), { tone: "lo" }));
    cab.push(Ln(onSide(pose, sideL, -27, -21, Z.deck + 2, Z.deck + 15), { tone: "faint" }));
    if (front) cab.push(Ln(onEnd(pose, -9, -13, -2, Z.deck + 18, Z.deck + 28), { tone: "lo" }), Ln(onEnd(pose, -9, 2, 13, Z.deck + 18, Z.deck + 28), { tone: "lo" }));
    else cab.push(Ln(onEnd(pose, -31, -13, -2, Z.deck + 18, Z.deck + 28), { tone: "lo" }), Ln(onEnd(pose, -31, 2, 13, Z.deck + 18, Z.deck + 28), { tone: "lo" }));
    const hood = [];
    hood.push(prism(pose, -9, 30, -12, 12, Z.deck, 22, { tone: "hi" }, 0.6));
    for (const a of [-3, 6, 15, 24]) hood.push(Ln(onSide(pose, 12 * side, a - 3, a + 3, Z.deck + 6, Z.deck + 17), { tone: "faint" }));
    if (front) {
      hood.push(Ln(onEnd(pose, 30, -8, 8, Z.deck + 4, Z.deck + 18), { tone: "lo" }));
      const grid = [];
      for (let l = -6; l <= 6; l += 2) grid.push(k.segment([...local(pose, 30, l), Z.deck + 4], [...local(pose, 30, l), Z.deck + 18], P));
      hood.push(Ln(grid.join(""), { tone: "faint" }));
    }
    const stack = local(pose, 4, 0);
    hood.push(S(k.cylinder(stack[0], stack[1], 2.2, Z.deck + 22, 5, P, 20), { tone: "mid" }));
    hood.push(Ln(k.ring(stack[0], stack[1], 1.3, Z.deck + 27, P, 16), { tone: "lo" }));
    hood.push(prism(pose, 16, 26, -6, 6, Z.deck + 22, 1.4, { tone: "mid" }));
    out.push(...(front ? [...cab, ...hood] : [...hood, ...cab]));
    // barandillas del pasillo, en el lado que se ve
    const rails = [];
    const posts = [];
    const l = 18.6 * side;
    const ps = [-6, 6, 18, 29].map((a) => local(pose, a, l));
    for (const p of ps) rails.push(k.rise([...p, Z.deck], Z.deck, Z.deck + 12, P));
    rails.push(k.segment([...ps[0], Z.deck + 12], [...ps[3], Z.deck + 12], P));
    posts.push(...ps.map((p) => at([...p, Z.deck + 12])), ...ps.map((p) => at([...p, Z.deck])));
    out.push(Ln(rails.join(""), { tone: "mid" }), k.dotsSvg(posts, { size: 0.55, tone: "mid" }));
    out.push(front ? buffers(pose, 33, 1) : buffers(pose, -33, -1));
    if (front) out.push(k.dotsSvg([-13, 13].map((l2) => at([...local(pose, 33, l2), Z.deck - 1.6])), { size: 1.1, tone: "hi" }));
    return out.join("");
  }

  function tankWagon(pose) {
    const { leftSeen, front } = faces(pose);
    const side = leftSeen ? 1 : -1;
    const A = [-18, 18];
    const out = [];
    out.push(wheelset(pose, A, -side), sideFrame(pose, 26, A, -side), wheelset(pose, A, side), sideFrame(pose, 26, A, side));
    out.push(front ? buffers(pose, -31, -1) : buffers(pose, 31, 1));
    out.push(prism(pose, -31, 31, -18, 18, Z.deck - 4, 3.6, { tone: "mid" }, 0.5));
    for (const a of [-18, 18]) out.push(prism(pose, a - 2.5, a + 2.5, -12, 12, Z.deck - 0.4, 4.4, { tone: "lo" }));
    const F = axialFrame(pose, 0, 0, Z.deck + 15);
    const tank = G.solidOf([[-28, 0], [-28, 10, 1], [-27, 13.4, 1], [-25, 14.6, 1], [-22, 15], [22, 15], [25, 14.6, 1], [27, 13.4, 1], [28, 10, 1], [28, 0]], F, P);
    const bands = [-12, 12].map((s) => Ln(G.arcOf(F, s, 15, P), { tone: "faint" })).join("");
    out.push(S(tank, { tone: "hi", inner: bands }));
    const dome = local(pose, 0, 0);
    out.push(S(k.cylinder(dome[0], dome[1], 5, Z.deck + 29.2, 3.6, P, 32, 0.4), { tone: "mid" }));
    out.push(Ln(k.ring(dome[0], dome[1], 3.4, Z.deck + 32.8, P, 28), { tone: "lo" }));
    out.push(k.dotsSvg([at([dome[0], dome[1], Z.deck + 32.8])], { size: 0.6, tone: "hi" }));
    out.push(front ? buffers(pose, 31, 1) : buffers(pose, -31, -1));
    return out.join("");
  }

  function train(route, s) {
    // s es el eje delantero de la locomotora; el vagón va enganchado detrás, topes contra topes.
    const lp = poseOf(route, s, 34);
    const wp = poseOf(route, s - 17 - (33 + 4.4 + 31 + 4.4) + 18, 36);
    return { wagon: tankWagon(wp), loco: loco(lp), lp, wp };
  }

  return { yOff, stripRing, sample, railSvg, fishplate, bladeY, blade, stretcher, rod, leverArm, leverAngle, routeAt, poseOf, loco, tankWagon, train };
}
