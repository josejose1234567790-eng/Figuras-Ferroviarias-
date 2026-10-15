const D = __DATA__;
const root = document.querySelector(".ct");
const stage = root.querySelector(".ct-stage");
const car = stage.querySelector(".ct-car");
const cams = [...stage.querySelectorAll(".ct-cam")];
const readout = root.querySelector("[data-readout]");
const hint = root.querySelector("[data-hint]");
const live = root.querySelector("[data-live]");
const info = root.querySelector("[data-info]");
const modeButtons = [...root.querySelectorAll("[data-mode]")];
const asmButtons = [...root.querySelectorAll("[data-asm]")];
const stepBox = root.querySelector("[data-steps]");
const stepLabel = root.querySelector("[data-step-label]");
const stepLine = root.querySelector("[data-step-line]");
const stepPrev = root.querySelector("[data-step-prev]");
const stepNext = root.querySelector("[data-step-next]");
const stepPlay = root.querySelector("[data-step-play]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

const dot = (m) => m[0] * D.V[0] + m[1] * D.V[1] + m[2] * D.V[2];
const screenOf = (m) => [D.EX[0] * m[0] + D.EY[0] * m[1] + D.EZ[0] * m[2], D.EX[1] * m[0] + D.EY[1] * m[1] + D.EZ[1] * m[2]];
const nodes = [...car.querySelectorAll(".it")].map((el) => {
  const m1 = D.move[el.dataset.r] ?? [0, 0, 0];
  const m2 = el.dataset.m2.split(",").map(Number);
  return { el, pid: el.dataset.p, ride: el.dataset.r, ride2: el.dataset.r2, asm: el.dataset.a, k1: Number(el.dataset.k), k2: Number(el.dataset.k2), m1, m2, lift1: dot(m1), lift2: dot(m2), x1: el.hasAttribute("data-x1"), x2: el.hasAttribute("data-x2"), shown: "", off: false, box: null };
});
const cutLayer = stage.querySelector(".ct-cut");
const tankNodes = nodes.filter((n) => D.cutHides.includes(n.pid));

// Resortes del despiece: nivel 1 (ensambles) y nivel 2 (piezas del ensamble elegido).
const spring = () => ({ x: 0, v: 0, target: 0, pending: null });
const s1 = Object.fromEntries(D.stagger.map((id) => [id, spring()]));
let s2 = {};
const cam = { s: { x: 1, v: 0 }, x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, goal: [1, 0, 0] };

let mode = "armado";
let sel = null; // ensamble abierto en el nivel 2
let level2 = false;
let hot = null;
let pinned = null;
let stepIndex = D.steps.length;
let playing = false;
let playTimer = 0;
let swapTimer = 0;
let clock = 0;
let frame = 0;
let last = 0;
let touring = !still.matches;
let tourTimer = 0;
let order = nodes.map((_, i) => i);

function schedule(map, ids, value, gap) {
  let i = 0;
  for (const id of ids) {
    const s = map[id];
    if (!s) continue;
    if (s.target === value && !s.pending) continue;
    s.pending = { value, at: clock + (still.matches ? 0 : i++ * gap) };
  }
  run();
}
function settleSpring(s, dt, calm, sp) {
  if (s.pending && clock >= s.pending.at) {
    s.target = s.pending.value;
    s.pending = null;
  }
  if (calm) {
    s.x = s.target;
    s.v = 0;
    return s.pending !== null;
  }
  for (let i = 0; i < sp.substeps; i++) {
    const h = dt / sp.substeps;
    s.v += ((s.target - s.x) * sp.stiffness - s.v * sp.damping) * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.target - s.x) < 2e-4 && Math.abs(s.v) < 2e-4) {
    s.x = s.target;
    s.v = 0;
    return s.pending !== null;
  }
  return true;
}
function follow(c, target, dt, tau, calm) {
  if (calm) {
    c.x = target;
    c.v = 0;
    return false;
  }
  const w = 1 / tau;
  for (let i = 0; i < 4; i++) {
    const h = dt / 4;
    c.v += (w * w * (target - c.x) - 2 * w * c.v) * h;
    c.x += c.v * h;
  }
  if (Math.abs(target - c.x) < 1e-4 && Math.abs(c.v) < 1e-4) {
    c.x = target;
    c.v = 0;
    return false;
  }
  return true;
}

const share1 = (n) => s1[n.ride]?.x ?? 0;
const share2 = (n) => s2[n.ride2]?.x ?? 0;
function visible(n) {
  if (mode === "corte" && tankNodes.includes(n)) return false;
  if (level2) return n.asm === sel && !n.x2;
  if (n.x1) return false;
  if (mode === "pasos") {
    const mounted = D.steps.slice(0, stepIndex).flatMap((st) => st.springs);
    const moving = stepIndex < D.steps.length ? D.steps[stepIndex].springs : [];
    return n.ride === "via" || mounted.includes(n.ride) || (moving.includes(n.ride) && s1[n.ride].x < 0.999);
  }
  return true;
}
function offsetOf(n) {
  const a = share1(n);
  const b = level2 ? share2(n) : 0;
  return [n.m1[0] * a + n.m2[0] * b, n.m1[1] * a + n.m2[1] * b, n.m1[2] * a + n.m2[2] * b];
}
function place() {
  stage.toggleAttribute("data-l2", level2);
  for (const n of nodes) {
    const off = !visible(n);
    if (off !== n.off) {
      n.off = off;
      off ? n.el.setAttribute("data-off", "") : n.el.removeAttribute("data-off");
    }
    const [tx, ty] = screenOf(offsetOf(n));
    const t = Math.abs(tx) < 0.005 && Math.abs(ty) < 0.005 ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (t !== n.shown) {
      n.shown = t;
      t ? n.el.setAttribute("transform", t) : n.el.removeAttribute("transform");
    }
  }
  const key = (n) => (level2 ? n.k2 + n.lift2 * share2(n) : n.k1 + n.lift1 * share1(n));
  const next = nodes.map((_, i) => i).sort((a, b) => key(nodes[a]) - key(nodes[b]));
  if (next.some((v, i) => v !== order[i])) {
    const frag = document.createDocumentFragment();
    for (const i of next) frag.appendChild(nodes[i].el);
    car.appendChild(frag);
    order = next;
  }
  const t = `translate(${cam.x.x.toFixed(2)} ${cam.y.x.toFixed(2)}) scale(${cam.s.x.toFixed(4)})`;
  for (const g of cams) g.setAttribute("transform", t);
}

// Cámara: encuadra lo visible en su posición final.
function measure() {
  for (const n of nodes) {
    if (n.box) continue;
    const saved = n.el.getAttribute("transform");
    n.el.removeAttribute("transform");
    const hidden = n.el.hasAttribute("data-off");
    if (hidden) n.el.removeAttribute("data-off");
    try {
      const b = n.el.getBBox();
      n.box = [b.x, b.y, b.x + b.width, b.y + b.height];
    } catch {
      n.box = [0, 0, 0, 0];
    }
    if (hidden) n.el.setAttribute("data-off", "");
    if (saved) n.el.setAttribute("transform", saved);
  }
}
function frameGoal() {
  if (mode !== "despiece" && mode !== "pasos") return [1, 0, 0];
  if (mode === "pasos") return [1, 0, 0];
  measure();
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of nodes) {
    let show;
    let a = 0;
    let b = 0;
    if (level2) {
      show = n.asm === sel && !n.x2;
      b = 1;
    } else {
      show = !n.x1;
      const sp = s1[n.ride];
      a = sp ? (sp.pending ? sp.pending.value : sp.target) : 0;
    }
    if (!show || !n.box) continue;
    const [tx, ty] = screenOf([n.m1[0] * a + n.m2[0] * b, n.m1[1] * a + n.m2[1] * b, n.m1[2] * a + n.m2[2] * b]);
    box = [Math.min(box[0], n.box[0] + tx), Math.min(box[1], n.box[1] + ty), Math.max(box[2], n.box[2] + tx), Math.max(box[3], n.box[3] + ty)];
  }
  if (!Number.isFinite(box[0])) return [1, 0, 0];
  const pad = 28;
  const s = Math.min(level2 ? 2.6 : 1, (D.W - 2 * pad) / (box[2] - box[0]), (D.H - 2 * pad) / (box[3] - box[1]));
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  return [s, D.W / 2 - cx * s, D.H / 2 - cy * s];
}
function aim() {
  cam.goal = frameGoal();
  run();
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  const calm = still.matches;
  let moving = false;
  for (const id of D.stagger) moving = settleSpring(s1[id], dt, calm, D.spring) || moving;
  for (const id of Object.keys(s2)) moving = settleSpring(s2[id], dt, calm, D.spring2) || moving;
  moving = follow(cam.s, cam.goal[0], dt, 0.38, calm) || moving;
  moving = follow(cam.x, cam.goal[1], dt, 0.38, calm) || moving;
  moving = follow(cam.y, cam.goal[2], dt, 0.38, calm) || moving;
  place();
  say();
  frame = moving ? requestAnimationFrame(tick) : 0;
}
function run() {
  if (!frame) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

// Lectura
const count = (asm) => new Set(nodes.filter((n) => n.asm === asm && !n.x2).map((n) => n.pid)).size;
const PIECES = new Set(nodes.filter((n) => n.asm !== "via").map((n) => n.pid)).size;
function anyMoving() {
  return Object.values(s1).some((s) => s.x !== s.target || s.pending) || Object.values(s2).some((s) => s.x !== s.target || s.pending);
}
function say() {
  let text;
  if (mode === "corte") text = `corte longitudinal · llenado ${Math.round(D.fill * 100)} % · ${D.fillLitres.toLocaleString("es-MX")} L`;
  else if (mode === "pasos") text = stepIndex === 0 ? "paso 0 de " + D.steps.length + " · vía libre" : `paso ${stepIndex} de ${D.steps.length} · ${D.steps[stepIndex - 1].es.toLowerCase()}`;
  else if (level2) text = anyMoving() ? `${D.ensambles[sel].es.toLowerCase()} · abriendo` : `${D.ensambles[sel].es.toLowerCase()} · ${count(sel)} piezas`;
  else if (mode === "despiece") text = anyMoving() ? "separando ensambles" : "despiece · 8 ensambles";
  else text = anyMoving() ? "armando" : `armado · ${PIECES} piezas`;
  if (readout.textContent !== text) readout.textContent = text;
}
function announce(text) {
  live.textContent = text;
}

// Panel de información
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function showPart(pid) {
  if (!pid) {
    info.innerHTML = D.infoDefault;
    return;
  }
  const p = D.parts[pid];
  const t = D.tipos[p.t];
  const a = D.ensambles[p.a];
  info.innerHTML = `<p class="ct-info-asm">${a.n ? String(a.n).padStart(2, "0") + " · " : ""}${esc(a.es)}</p><h3 class="ct-info-name">${esc(t.es)} <span>(${esc(t.en)})</span></h3><dl><dt>Función</dt><dd>${esc(t.fn)}</dd><dt>Material</dt><dd>${esc(t.mat)}</dd></dl>`;
}
function setHot(pid) {
  if (hot === pid) return;
  hot = pid;
  for (const n of nodes) n.pid === pid ? n.el.setAttribute("data-hot", "") : n.el.removeAttribute("data-hot");
  pid ? car.setAttribute("data-hover", "") : car.removeAttribute("data-hover");
  showPart(pid ?? pinned);
}

// Modos
function setMode(next, { quiet = false } = {}) {
  if (!quiet) stopTour();
  if (mode === next && next !== "despiece") return;
  if (next !== "despiece" && level2) closeLevel2();
  mode = next;
  modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  root.dataset.mode = mode;
  stepBox.hidden = mode !== "pasos";
  if (cutLayer) cutLayer.toggleAttribute("data-on", mode === "corte");
  if (mode === "armado" || mode === "corte") schedule(s1, [...D.stagger].reverse(), 0, D.spring.stagger);
  if (mode === "despiece") schedule(s1, D.stagger, 1, D.spring.stagger);
  if (mode === "pasos") {
    stepIndex = 0;
    for (const id of D.stagger) Object.assign(s1[id], { x: 1, v: 0, target: 1, pending: null });
    showStep();
  }
  if (hint) hint.textContent = HINTS[mode];
  announce({ armado: "Carro armado", despiece: "Despiece en ensambles", pasos: "Montaje paso a paso", corte: "Corte longitudinal del tanque" }[mode]);
  aim();
}
const HINTS = {
  armado: "Pasa el cursor o toca una pieza",
  despiece: "Elige un ensamble para abrirlo en piezas",
  pasos: "Avanza el montaje paso a paso",
  corte: "Corte por el plano vertical del eje",
};
function openLevel2(asm) {
  stopTour();
  if (mode !== "despiece") setMode("despiece", { quiet: true });
  if (sel === asm && level2) {
    closeLevel2();
    schedule(s1, D.stagger, 1, D.spring.stagger);
    aim();
    return;
  }
  if (level2) closeLevel2();
  sel = asm;
  asmButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.asm === asm)));
  // el ensamble elegido se funde y reaparece en su lugar; luego se abre en piezas
  car.setAttribute("data-swap", "");
  clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    level2 = true;
    for (const id of D.stagger) Object.assign(s1[id], { x: 0, v: 0, target: 0, pending: null });
    s2 = Object.fromEntries((D.l2[asm]?.order ?? []).map((id) => [id, spring()]));
    place();
    car.removeAttribute("data-swap");
    schedule(s2, D.l2[asm]?.order ?? [], 1, D.spring2.stagger);
    aim();
  }, still.matches ? 0 : 260);
  pinned = null;
  showPart(null);
  info.innerHTML = `<p class="ct-info-asm">${String(D.ensambles[asm].n).padStart(2, "0")} · ${esc(D.ensambles[asm].en)}</p><h3 class="ct-info-name">${esc(D.ensambles[asm].es)}</h3><p>${esc(D.ensambles[asm].say)}. Toca cada pieza para ver su nombre, función y material.</p>`;
  announce(`${D.ensambles[asm].es} abierto en sus piezas`);
  aim();
}
function closeLevel2() {
  clearTimeout(swapTimer);
  car.removeAttribute("data-swap");
  level2 = false;
  sel = null;
  s2 = {};
  asmButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
}

// Paso a paso
function showStep() {
  const st = D.steps[Math.max(0, stepIndex - 1)];
  stepLabel.textContent = stepIndex === 0 ? `Paso 0 de ${D.steps.length} · Vía` : `Paso ${stepIndex} de ${D.steps.length} · ${st.es}`;
  stepLine.textContent = stepIndex === 0 ? "Vía de trocha estándar (1435 mm) lista para recibir el carro." : st.line;
  stepPrev.disabled = stepIndex === 0;
  stepNext.disabled = stepIndex === D.steps.length;
  asmButtons.forEach((b) => b.setAttribute("aria-pressed", String(stepIndex > 0 && b.dataset.asm === st.asm)));
}
function goStep(i) {
  stopTour();
  const next = Math.max(0, Math.min(D.steps.length, i));
  if (next > stepIndex) {
    for (let j = stepIndex; j < next; j++) {
      for (const id of D.steps[j].springs) Object.assign(s1[id], { x: 1, v: 0, target: 1, pending: null });
    }
    // solo el último paso se anima; los anteriores quedan montados
    for (let j = stepIndex; j < next - 1; j++) for (const id of D.steps[j].springs) Object.assign(s1[id], { x: 0, v: 0, target: 0 });
    stepIndex = next;
    schedule(s1, D.steps[next - 1].springs, 0, D.spring.stagger);
  } else if (next < stepIndex) {
    for (let j = next; j < stepIndex; j++) for (const id of D.steps[j].springs) Object.assign(s1[id], { x: 1, v: 0, target: 1, pending: null });
    stepIndex = next;
  }
  showStep();
  announce(stepLabel.textContent + ". " + stepLine.textContent);
  run();
}
function play() {
  playing = !playing;
  stepPlay.textContent = playing ? "Pausa" : "Reproducir";
  clearTimeout(playTimer);
  if (playing) {
    if (stepIndex >= D.steps.length) goStep(0);
    const tickStep = () => {
      if (!playing) return;
      if (stepIndex >= D.steps.length) {
        playing = false;
        stepPlay.textContent = "Reproducir";
        return;
      }
      goStep(stepIndex + 1);
      playTimer = setTimeout(tickStep, still.matches ? 1600 : 2600);
    };
    playTimer = setTimeout(tickStep, 300);
  }
}

// Recorrido inicial: se desarma y se arma una vez, despacio; se detiene con cualquier interacción.
function stopTour() {
  if (!touring) return;
  touring = false;
  clearTimeout(tourTimer);
}
function tour(step = 0) {
  if (!touring) return;
  const seq = [["despiece", 4600], ["armado", 5200]];
  const [m, wait] = seq[step % seq.length];
  setMode(m, { quiet: true });
  tourTimer = setTimeout(() => tour(step + 1), wait);
}

// Eventos
modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
asmButtons.forEach((b) =>
  b.addEventListener("click", () => {
    stopTour();
    if (mode === "pasos") {
      const i = D.steps.findIndex((st) => st.asm === b.dataset.asm);
      if (i >= 0) goStep(i + 1);
      return;
    }
    hot = "__";
    setHot(null);
    openLevel2(b.dataset.asm);
  }),
);
asmButtons.forEach((b) =>
  b.addEventListener("pointerenter", () => {
    if (level2 || mode === "pasos") return;
    for (const n of nodes) n.asm === b.dataset.asm ? n.el.setAttribute("data-hot", "") : n.el.removeAttribute("data-hot");
    car.setAttribute("data-hover", "");
  }),
);
asmButtons.forEach((b) => b.addEventListener("pointerleave", () => { hot = "__"; setHot(null); }));
stepPrev.addEventListener("click", () => goStep(stepIndex - 1));
stepNext.addEventListener("click", () => goStep(stepIndex + 1));
stepPlay.addEventListener("click", play);
const itemAt = (e) => e.target.closest && e.target.closest(".it");
car.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch") return;
  const it = itemAt(e);
  if (it && it.dataset.a !== "via") setHot(it.dataset.p);
});
car.addEventListener("pointerout", (e) => {
  if (e.pointerType === "touch") return;
  const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".it");
  if (!to) setHot(null);
});
car.addEventListener("click", (e) => {
  stopTour();
  const it = itemAt(e);
  if (!it || it.dataset.a === "via") {
    pinned = null;
    setHot(null);
    return;
  }
  pinned = it.dataset.p;
  hot = null;
  setHot(pinned);
});
stage.addEventListener("keydown", (e) => {
  const keys = { ArrowRight: 1, ArrowLeft: -1 };
  if (e.key === "Escape") {
    setMode("armado");
    e.preventDefault();
  } else if (keys[e.key] && mode === "pasos") {
    goStep(stepIndex + keys[e.key]);
    e.preventDefault();
  } else if (keys[e.key]) {
    const list = Object.keys(D.ensambles).filter((a) => a !== "via").sort((a, b) => D.ensambles[a].n - D.ensambles[b].n);
    const i = sel ? list.indexOf(sel) : -1;
    openLevel2(list[(i + keys[e.key] + list.length) % list.length]);
    e.preventDefault();
  } else if (e.key === " " || e.key === "Enter") {
    setMode(mode === "despiece" ? "armado" : "despiece");
    e.preventDefault();
  }
});
root.addEventListener("pointerdown", stopTour, { capture: true });
root.addEventListener("keydown", stopTour, { capture: true });

showPart(null);
setMode("armado", { quiet: true });
let started = false;
new IntersectionObserver((entries) => {
  if (entries[entries.length - 1].isIntersecting && !started) {
    started = true;
    if (touring) tourTimer = setTimeout(() => tour(0), 1800);
  }
}, { rootMargin: "120px 0px" }).observe(stage);
window.__ct = { setMode, openLevel2, goStep, s1, nodes, stopTour, get s2() { return s2; } };
