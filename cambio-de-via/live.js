
const DATA = __DATA__;
const P = DATA.P;
const K = { iso, pathOf, solidSvg, lineSvg, dotsSvg, extrude, slabOf, cylinder, ring, segment, rise, depthOf };
const PARTS = makeParts(K, G, P, DATA.D);
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $ = (name) => svg.querySelector(`[data-part="${name}"]`);
const el = { lever: $("lever"), a: $("bladeA"), b: $("bladeB"), s0: $("stretch0"), s1: $("stretch1"), slots: { straight: $("train-straight"), diverging: $("train-diverging") } };
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const ease = (t) => t * t * (3 - 2 * t);
const smooth = (a, b, x) => ease(Math.min(1, Math.max(0, (x - a) / (b - a))));

const { X0, XF } = DATA;
const PHI0 = DATA.D.PHI0, PHI1 = DATA.D.PHI1;
const THROW_TIME = 1.3;
const SPEED = 58; // unidades del dibujo por segundo
const LOCO_AHEAD = 16; // del eje delantero al tope delantero
const TRAIN_BACK = 17 + 72.8 + 18 + 31 + 4.4; // del eje delantero de la locomotora a la cola del vagón

// La palanca gira; la varilla (manivela bajo el eje) desplaza las agujas en proporción al seno del ángulo.
const bladeOf = (lever) => {
  const phi = PHI0 + (PHI1 - PHI0) * lever;
  return (Math.sin(phi) - Math.sin(PHI0)) / (Math.sin(PHI1) - Math.sin(PHI0));
};

let route = "diverging"; // itinerario pedido por la palanca
let lever = 1, from = 1, to = 1, throwT = 1;
let drawnLever = -1;
let train = null; // { route, s }
let pending = true; // un tren espera a que las agujas estén en posición
let wait = 0.6, idle = 0, last = 0, frame = 0, visible = false, flash = 0;

const routeLen = (name) => DATA.ROUTES[name].cum[DATA.ROUTES[name].cum.length - 1];
const S_XS = DATA.XS - DATA.ROUTES.straight.pts[0][0]; // s del extremo izquierdo del tablero
const startS = () => S_XS + 20 + 17; // centro de la locomotora 20 unidades dentro del tablero
const endS = (name) => routeLen(name);
const CALM_S = (name) => endS(name) - 48;
const xAlong = (name, s) => PARTS.routeAt(DATA.ROUTES[name], s)[0];

// Enclavamiento: desde que la locomotora se acerca a la punta hasta que la cola deja atrás el corazón.
function locked() {
  if (!train || still.matches) return false;
  const front = xAlong(train.route, train.s + LOCO_AHEAD);
  const tail = xAlong(train.route, train.s - TRAIN_BACK);
  return front > X0 - 40 && tail < XF + 30;
}

function throwTo(next) {
  if (locked()) {
    flash = 1.6;
    return false;
  }
  if (next === route && throwT >= 1) return false;
  route = next;
  from = lever;
  to = next === "diverging" ? 1 : 0;
  throwT = 0;
  if (!train) pending = true;
  else pending = true;
  return true;
}

function drawSwitch() {
  if (Math.abs(lever - drawnLever) < 1e-4) return;
  drawnLever = lever;
  const b = bladeOf(lever);
  el.lever.innerHTML = PARTS.leverArm(lever);
  el.a.innerHTML = PARTS.blade("A", b);
  el.b.innerHTML = PARTS.blade("B", b);
  el.s0.innerHTML = PARTS.rod(b) + PARTS.stretcher(DATA.D.STRETCH[0], b);
  el.s1.innerHTML = PARTS.stretcher(DATA.D.STRETCH[1], b);
}

// Cada vehículo aparece al entrar en el tablero y se desvanece al llegar al final de la vía.
function vehicleAlpha(name, sCentre) {
  return smooth(S_XS + 2, S_XS + 34, sCentre) * (1 - smooth(endS(name) - 62, endS(name) - 30, sCentre));
}

function drawTrain() {
  for (const slot of Object.values(el.slots)) if (!train || slot !== el.slots[train.route]) slot.innerHTML = "";
  if (!train) return;
  const t = PARTS.train(DATA.ROUTES[train.route], train.s);
  const aw = still.matches ? 0 : vehicleAlpha(train.route, train.s - 17 - 72.8);
  const al = vehicleAlpha(train.route, train.s - 17);
  el.slots[train.route].innerHTML = `<g opacity="${aw.toFixed(3)}">${aw > 0.01 ? t.wagon : ""}</g><g opacity="${al.toFixed(3)}">${al > 0.01 ? t.loco : ""}</g>`;
}

function where() {
  if (!train) return pending ? "tren esperando" : "vía libre";
  const front = xAlong(train.route, train.s + LOCO_AHEAD);
  const tail = xAlong(train.route, train.s - TRAIN_BACK);
  if (front < X0 - 40) return "tren acercándose";
  if (tail > XF + 30) return "tren alejándose";
  if (front < XF) return "tren en las agujas";
  return "tren en el corazón";
}

function say() {
  const b = bladeOf(lever);
  let state;
  if (b > 0.999) state = "vía desviada · aguja derecha acoplada";
  else if (b < 0.001) state = "vía directa · aguja izquierda acoplada";
  else state = `agujas moviéndose · ${Math.round(b * 100)} %`;
  const text = `${state} · ${flash > 0 ? "palanca enclavada" : where()}`;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-pressed", route === "diverging" ? "true" : "false");
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  flash = Math.max(0, flash - dt);
  if (throwT < 1) {
    throwT = calm ? 1 : Math.min(1, throwT + dt / THROW_TIME);
    lever = from + (to - from) * ease(throwT);
  }
  const set = throwT >= 1;
  if (!train && pending && set) {
    wait -= calm ? 99 : dt;
    if (wait <= 0) {
      pending = false;
      wait = 0.5;
      train = { route, s: startS() };
    }
  }
  if (train) {
    if (calm) {
      train.route = route;
      train.s = CALM_S(route);
    } else train.s += SPEED * dt;
    // antes de llegar a la punta de agujas el tren sigue el itinerario que marque la palanca
    if (!locked() && xAlong(train.route, train.s + LOCO_AHEAD) < X0 - 40 && set) train.route = route;
    if (!calm && train.s - 17 - 72.8 > endS(train.route) - 30) {
      train = null;
      idle = 0;
    }
  } else if (!pending && set && !calm) {
    idle += dt;
    if (idle > 2.2) {
      idle = 0;
      throwTo(route === "diverging" ? "straight" : "diverging");
    }
  }
  drawSwitch();
  drawTrain();
  say();
  const busy = !calm || throwT < 1 || flash > 0;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}

const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
const act = (next) => {
  idle = -6;
  throwTo(next);
  run();
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("click", () => act(route === "diverging" ? "straight" : "diverging"));
stage.addEventListener("keydown", (event) => {
  let next = null;
  if (event.key === " " || event.key === "Enter") next = route === "diverging" ? "straight" : "diverging";
  if (event.key === "ArrowLeft") next = "diverging";
  if (event.key === "ArrowRight") next = "straight";
  if (!next) return;
  event.preventDefault();
  act(next);
});
still.addEventListener?.("change", run);
drawSwitch();
say();
