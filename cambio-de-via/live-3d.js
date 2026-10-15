
const DATA = __DATA__;
const C = DATA.C;
const K = { iso, depthOf, cameraOf, solidSvg, lineSvg, dotsSvg, extrude, cylinder, slabOf, ringSeam, pathOf, ring, topTicks, planOutline, insetPlan, faceTextSvg, topMatrix, lineOnTop, segment, corners, rise };
const WORLD = makeWorld(C);
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const plate = stage.closest(".iso-plate") || document;
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const ease = (t) => t * t * (3 - 2 * t);
const smooth = (a, b, x) => ease(Math.min(1, Math.max(0, (x - a) / (b - a))));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const { X0, LB, THROW, PHI0, PHI1, SIGNAL } = C;
const MM = C.MM_PER_UNIT;

// ---------------- Modelo ----------------
const THROW_TIME = 3; // cambio de agujas en cámara lenta
const UNLOCK_TIME = 0.5;
const LOCK_TIME = 0.8;
const DEPART_DELAY = 0.7;
const VMAX = 46;
const ACCEL = 22;
const LOCO_AHEAD = 16;
const TRAIN_BACK = 17 + 72.8 + 18 + 31 + 4.4;
const S_XS = C.XS - DATA.ROUTES.straight.pts[0][0];
const STOP_FRONT = SIGNAL.x - 6; // el tren espera con el tope delantero antes de la señal
const routeLen = (name) => DATA.ROUTES[name].cum[DATA.ROUTES[name].cum.length - 1];

// La palanca gira; una manivela convierte el giro en el avance de la varilla, proporcional al seno del ángulo.
const bladeOf = (lever) => {
  const phi = PHI0 + (PHI1 - PHI0) * lever;
  return (Math.sin(phi) - Math.sin(PHI0)) / (Math.sin(PHI1) - Math.sin(PHI0));
};

const sim = {
  route: "diverging",
  lever: 1,
  from: 1,
  to: 1,
  phase: "set", // set → unlock → throw → lock → set
  t: 0,
  bolt: 1,
  train: null, // { route, s, v, state: "wait" | "run", hold }
  signal: false,
  idle: 0,
};
const xAlong = (name, s) => {
  const r = DATA.ROUTES[name];
  const pts = r.pts;
  const cum = r.cum;
  const c = clamp(s, 0, cum[cum.length - 1]);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < c) i++;
  const t = (c - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
};
const sOfFront = (name, x) => {
  // s del eje delantero de la locomotora con el tope delantero en x (antes de la punta las rutas son rectas)
  return x - DATA.ROUTES[name].pts[0][0] - LOCO_AHEAD;
};
function spawnTrain() {
  sim.train = { route: sim.route, s: sOfFront(sim.route, STOP_FRONT), v: 0, state: "wait", hold: DEPART_DELAY, age: 0 };
}
// Enclavamiento de itinerario: desde que el tren arranca hasta que su cola deja atrás el corazón.
function routeLocked() {
  const tr = sim.train;
  if (!tr || tr.state !== "run") return false;
  return xAlong(tr.route, tr.s - TRAIN_BACK) < WORLD.XF + 30;
}
function canThrow() {
  return sim.phase === "set" && !routeLocked();
}
let flash = 0;
function requestThrow(next) {
  if (!canThrow()) {
    flash = 1.6;
    return false;
  }
  next = next || (sim.route === "diverging" ? "straight" : "diverging");
  if (next === sim.route) return false;
  sim.route = next;
  sim.from = sim.lever;
  sim.to = next === "diverging" ? 1 : 0;
  sim.phase = "unlock";
  sim.t = 0;
  sim.signal = false;
  if (!sim.train) spawnTrain();
  return true;
}

// Avanza la simulación dt segundos (0 en pausa).
function step(dt) {
  if (dt <= 0) return;
  if (still.matches) {
    // movimiento reducido: cada fase termina al instante y el tren queda quieto
    if (sim.phase !== "set") { sim.lever = sim.to; sim.bolt = 1; sim.phase = "set"; }
    if (sim.train) sim.train.route = sim.route;
    return;
  }
  flash = Math.max(0, flash - dt);
  sim.t += dt;
  if (sim.phase === "unlock") {
    sim.bolt = 1 - clamp(sim.t / UNLOCK_TIME, 0, 1);
    if (sim.t >= UNLOCK_TIME) { sim.phase = "throw"; sim.t = 0; }
  } else if (sim.phase === "throw") {
    const u = clamp(sim.t / THROW_TIME, 0, 1);
    sim.lever = sim.from + (sim.to - sim.from) * ease(u);
    if (u >= 1) { sim.lever = sim.to; sim.phase = "lock"; sim.t = 0; }
  } else if (sim.phase === "lock") {
    sim.bolt = clamp(sim.t / LOCK_TIME, 0, 1);
    if (sim.t >= LOCK_TIME) { sim.bolt = 1; sim.phase = "set"; sim.t = 0; }
  }
  const tr = sim.train;
  if (tr) {
    tr.age += dt;
    if (tr.state === "wait") {
      tr.route = sim.route;
      // el tren solo sale con las agujas quietas, enclavadas y la señal abierta
      if (sim.phase === "set" && sim.bolt >= 1) {
        tr.hold -= dt;
        if (tr.hold <= 0) { sim.signal = true; tr.state = "run"; }
      } else tr.hold = DEPART_DELAY;
    } else {
      tr.v = Math.min(VMAX, tr.v + ACCEL * dt);
      tr.s += tr.v * dt;
      if (xAlong(tr.route, tr.s + LOCO_AHEAD) > SIGNAL.x + 14) sim.signal = false;
      if (tr.s - 17 - 72.8 > routeLen(tr.route) - 30) { sim.train = null; sim.idle = 0; }
    }
  } else if (sim.phase === "set") {
    sim.idle += dt;
  }
}

// ---------------- Vista ----------------
const view = { azimuth: DATA.VIEW.azimuth, elevation: DATA.VIEW.elevation, zoom: 1, pan: [...DATA.PAN0] };
const projectionAt = (v, scale, centre, box) => {
  const P0 = { origin: [0, 0], scale, azimuth: v.azimuth, elevation: v.elevation };
  const q = iso(centre, P0);
  return { ...P0, origin: [box[0] - q[0], box[1] - q[1]] };
};
const L = DATA.LENS;
const views = {
  main: { node: svg.querySelector('[data-view="main"]'), P: null, parts: null, region: null },
  lens: { node: svg.querySelector('[data-view="lens"]'), P: null, parts: null, region: DATA.REGION },
};
const mark = svg.querySelector('[data-part="mark"]');
const gaugeFill = svg.querySelector('[data-part="gauge-fill"]');
const gaugeText = svg.querySelector('[data-part="gauge-text"]');
const chip = plate.querySelector('[data-part="chip"]');
const buttons = Object.fromEntries([...plate.querySelectorAll("[data-act]")].map((b) => [b.dataset.act, b]));

function projections() {
  views.main.P = projectionAt(view, DATA.BASE_SCALE * view.zoom, DATA.CENTRE, [DATA.WIDTH / 2 + view.pan[0], DATA.HEIGHT / 2 + view.pan[1]]);
  views.lens.P = projectionAt(view, DATA.BASE_SCALE * L.mag, DATA.POINTS, [L.w / 2, L.h / 2]);
  for (const v of Object.values(views)) v.parts = makeParts(K, G, v.P, C);
}

const dyn = (v) => {
  const b = bladeOf(sim.lever);
  return {
    bladeA: v.parts.blade("A", b),
    bladeB: v.parts.blade("B", b),
    lever: v.parts.leverArm(sim.lever),
    stretch: [v.parts.rod(b) + v.parts.stretcher(C.STRETCH[0], b) + lockBolt(K, v.P, C, sim.bolt), v.parts.stretcher(C.STRETCH[1], b)],
  };
};

let fast = false;
function rebuild(which = ["main", "lens"]) {
  projections();
  for (const name of which) {
    const v = views[name];
    v.node.innerHTML = drawScene(K, G, v.P, WORLD, v.parts, { ...dyn(v), fast: fast && name === "main" }, v.region);
    v.el = {
      a: v.node.querySelector('[data-part="bladeA"]'),
      b: v.node.querySelector('[data-part="bladeB"]'),
      lever: v.node.querySelector('[data-part="lever"]'),
      s0: v.node.querySelector('[data-part="stretch0"]'),
      s1: v.node.querySelector('[data-part="stretch1"]'),
      slots: { straight: v.node.querySelector('[data-part="train-straight"]'), diverging: v.node.querySelector('[data-part="train-diverging"]') },
      lamps: [...v.node.querySelectorAll("[data-lamp]")],
    };
    v.drawn = null;
  }
  drawMark();
}

// Recuadro de la lupa sobre la zona de agujas en la vista principal, unido al panel de la lupa.
function drawMark() {
  const P = views.main.P;
  const pts = [];
  for (const x of [X0 - 10, X0 + LB + 4]) for (const y of [-20, 20]) for (const z of [0, 16]) pts.push(iso([x, y, z], P));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const r = { x: Math.min(...xs) - 3, y: Math.min(...ys) - 3, w: Math.max(...xs) - Math.min(...xs) + 6, h: Math.max(...ys) - Math.min(...ys) + 6 };
  const f = (n) => n.toFixed(1);
  const lines = [[L.x + L.w, L.y, r.x + r.w, r.y], [L.x, L.y + L.h, r.x, r.y + r.h]]
    .map(([x1, y1, x2, y2]) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`).join("");
  mark.innerHTML = `${lines}<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" rx="4"/>`;
}

function trainSvg(v) {
  const tr = sim.train;
  const t = v.parts.train(DATA.ROUTES[tr.route], tr.s);
  const enter = (c) => smooth(S_XS + 2, S_XS + 34, c) * (1 - smooth(routeLen(tr.route) - 62, routeLen(tr.route) - 30, c));
  const aw = enter(tr.s - 17 - 72.8);
  const al = enter(tr.s - 17) * Math.min(1, tr.age / 0.8);
  const items = [
    { d: depthOf([...t.wp.c, 0], v.P), svg: aw > 0.01 ? `<g opacity="${aw.toFixed(3)}">${t.wagon}</g>` : "" },
    { d: depthOf([...t.lp.c, 0], v.P), svg: al > 0.01 ? `<g opacity="${al.toFixed(3)}">${t.loco}</g>` : "" },
  ];
  return items.sort((a, b) => a.d - b.d).map((i) => i.svg).join("");
}

function paint() {
  const moving = sim.phase === "throw";
  const key = `${sim.lever.toFixed(5)}|${sim.bolt.toFixed(3)}|${moving}`;
  for (const v of Object.values(views)) {
    if (v.drawn !== key) {
      const d = dyn(v);
      v.el.a.innerHTML = d.bladeA;
      v.el.b.innerHTML = d.bladeB;
      v.el.lever.innerHTML = d.lever;
      v.el.s0.innerHTML = d.stretch[0];
      v.el.s1.innerHTML = d.stretch[1];
      v.el.a.classList.toggle("cv-moving", moving);
      v.el.b.classList.toggle("cv-moving", moving);
      v.drawn = key;
    }
    for (const [name, slot] of Object.entries(v.el.slots)) {
      const html = sim.train && sim.train.route === name ? trainSvg(v) : "";
      if (html || slot.firstChild) slot.innerHTML = html;
    }
    for (const lamp of v.el.lamps) lamp.toggleAttribute("data-on", lamp.dataset.lamp === (sim.signal ? "green" : "red"));
  }
  // separación de cada punta de aguja a su contraaguja, a escala del dibujo
  const b = bladeOf(sim.lever);
  const right = (1 - b) * THROW * MM;
  const left = b * THROW * MM;
  const full = THROW * MM;
  gaugeFill.setAttribute("width", ((L.w - 20) * b).toFixed(1));
  gaugeText.textContent = `punta dcha. ${Math.round(right)} mm · izq. ${Math.round(left)} mm`;
  let state = "locked";
  let label = "enclavada";
  if (sim.phase === "unlock") { state = "moving"; label = "desenclavando"; }
  if (sim.phase === "throw") { state = "moving"; label = `moviendo ${Math.round(b * full)} / ${Math.round(full)} mm`; }
  if (sim.phase === "lock") { state = "moving"; label = "enclavando"; }
  chip.dataset.state = state;
  chip.textContent = label;
  const routeText = sim.route === "diverging" ? "vía desviada" : "vía directa";
  const phaseText = { set: "agujas enclavadas", unlock: "desenclavando", throw: "agujas moviéndose", lock: "enclavando" }[sim.phase];
  let trainText = "";
  if (sim.train) {
    const tr = sim.train;
    const fx = xAlong(tr.route, tr.s + LOCO_AHEAD);
    if (tr.state === "wait") trainText = "tren parado ante la señal";
    else if (fx < X0) trainText = "tren arrancando";
    else if (fx < WORLD.XF) trainText = "tren en las agujas";
    else if (routeLocked()) trainText = "tren en el corazón";
    else trainText = "tren alejándose";
  }
  const text = [routeText, phaseText, flash > 0 ? "palanca enclavada" : trainText].filter(Boolean).join(" · ") + (paused ? " · pausa" : "");
  if (readout.textContent !== text) readout.textContent = text;
  buttons.throw.disabled = !canThrow();
  buttons.advance.disabled = !stepMode;
  buttons.pause.textContent = paused && !stepMode ? "Seguir" : "Pausa";
  buttons.pause.setAttribute("aria-pressed", String(paused && !stepMode));
  buttons.step.setAttribute("aria-pressed", String(stepMode));
}

// ---------------- Bucle ----------------
let paused = false;
let stepMode = false;
let viewDirty = false;
let frame = 0;
let last = 0;
let visible = false;
let userAt = -1e9;
const TOUR_IDLE = 2.5;

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (viewDirty) {
    viewDirty = false;
    rebuild(fast ? ["main", "lens"] : ["main", "lens"]);
  }
  if (!paused) {
    step(dt);
    // recorrido automático: si nadie toca nada, cambia de itinerario cuando el tren se ha ido
    if (!sim.train && sim.phase === "set" && sim.idle > TOUR_IDLE && performance.now() - userAt > 8000 && !still.matches) {
      sim.idle = 0;
      requestThrow();
    }
  }
  paint();
  const busy = !still.matches && !paused && (sim.phase !== "set" || sim.train || true);
  frame = visible && (busy || viewDirty) ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
const dirty = () => {
  viewDirty = true;
  run();
};

// ---------------- Entrada ----------------
const toSvg = (cx, cy) => {
  const box = svg.getBoundingClientRect();
  return [((cx - box.left) / box.width) * DATA.WIDTH, ((cy - box.top) / box.height) * DATA.HEIGHT];
};
function zoomAt(factor, at) {
  const z = clamp(view.zoom * factor, 0.55, 5);
  const f = z / view.zoom;
  const cx = DATA.WIDTH / 2 + view.pan[0];
  const cy = DATA.HEIGHT / 2 + view.pan[1];
  view.pan = [at[0] - (at[0] - cx) * f - DATA.WIDTH / 2, at[1] - (at[1] - cy) * f - DATA.HEIGHT / 2];
  view.zoom = z;
  dirty();
}
function orbit(dAz, dEl) {
  view.azimuth = (view.azimuth + dAz + 360) % 360;
  view.elevation = clamp(view.elevation + dEl, 12, 80);
  dirty();
}
const pointers = new Map();
let drag = null;
stage.addEventListener("pointerdown", (event) => {
  stage.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  if (pointers.size === 1) drag = { x: event.clientX, y: event.clientY, moved: 0 };
  else drag = { pinch: Math.hypot(...[...pointers.values()].reduce((a, p) => [a[0] - p[0], a[1] - p[1]])), moved: 99 };
  userAt = performance.now();
});
stage.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId) || !drag) return;
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  if (pointers.size >= 2) {
    const [p, q] = [...pointers.values()];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (drag.pinch) zoomAt(d / drag.pinch, toSvg((p[0] + q[0]) / 2, (p[1] + q[1]) / 2));
    drag.pinch = d;
    return;
  }
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (drag.moved > 4) {
    stage.classList.add("cv-dragging");
    fast = true;
    orbit(-dx * 0.45, dy * 0.3);
  }
});
const release = (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    const clicked = drag && drag.moved <= 4 && !drag.pinch;
    drag = null;
    stage.classList.remove("cv-dragging");
    if (fast) { fast = false; dirty(); }
    if (clicked && event.type === "pointerup") act(() => requestThrow());
  }
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  userAt = performance.now();
  zoomAt(Math.exp(-event.deltaY * 0.0015), toSvg(event.clientX, event.clientY));
}, { passive: false });

function act(fn) {
  userAt = performance.now();
  fn();
  run();
}
function setPaused(on) {
  paused = on;
  if (!on) stepMode = false;
}
function advance() {
  // un paso: 0,2 s de simulación, en subpasos para que el tren y las agujas avancen igual que en marcha
  for (let i = 0; i < 4; i++) step(0.05);
  paint();
}
buttons.throw.addEventListener("click", () => act(() => requestThrow()));
buttons.pause.addEventListener("click", () => act(() => setPaused(!(paused && !stepMode))));
buttons.step.addEventListener("click", () => act(() => { stepMode = !stepMode; paused = stepMode; }));
buttons.advance.addEventListener("click", () => act(advance));
buttons.reset.addEventListener("click", () => act(() => { Object.assign(view, { azimuth: DATA.VIEW.azimuth, elevation: DATA.VIEW.elevation, zoom: 1, pan: [...DATA.PAN0] }); dirty(); }));
stage.addEventListener("keydown", (event) => {
  const k = event.key;
  let handled = true;
  if (k === " " || k === "Enter") act(() => requestThrow());
  else if (k === "p" || k === "P") act(() => setPaused(!(paused && !stepMode)));
  else if (k === "s" || k === "S") act(() => { stepMode = !stepMode; paused = stepMode; });
  else if ((k === "ArrowRight" || k === ".") && stepMode) act(advance);
  else if (k === "ArrowLeft") act(() => orbit(-10, 0));
  else if (k === "ArrowRight") act(() => orbit(10, 0));
  else if (k === "ArrowUp") act(() => orbit(0, 5));
  else if (k === "ArrowDown") act(() => orbit(0, -5));
  else if (k === "+" || k === "=") act(() => zoomAt(1.2, [DATA.WIDTH / 2, DATA.HEIGHT / 2]));
  else if (k === "-") act(() => zoomAt(1 / 1.2, [DATA.WIDTH / 2, DATA.HEIGHT / 2]));
  else if (k === "r" || k === "R") buttons.reset.click();
  else handled = false;
  if (handled) event.preventDefault();
});
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

// estado inicial: vía desviada enclavada y un tren esperando ante la señal
spawnTrain();
if (still.matches) {
  sim.train.state = "run";
  sim.train.s = routeLen("diverging") - 48;
  sim.signal = false;
}
rebuild();
paint();
