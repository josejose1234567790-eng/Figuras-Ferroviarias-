// Guion de la operación: 19 escenas en 5 fases. Cada escena es una lista de acciones cronometradas
// (movimientos, caminatas, ademanes, cambios, señales, carga, contadores y cámaras) sobre un estado
// del mundo; así se puede saltar a cualquier escena y el resultado siempre es el mismo.
import { pointAt, RAIL_TOP, SITE, TRACKS } from "./layout.js";
import { makeRoute, projectS, sAtX, trackRoute } from "./routes.js";
import { profile, slackDisp, slackEnd, V_PATIO, V_LENTA, KMH } from "./motion.js";
import { analyse } from "./track.js";
import { TURNOUTS } from "./layout.js";

const TR = (id) => TRACKS.find((t) => t.id === id);
const DECK = RAIL_TOP + 4.25 + 0.025;

// ---------- estado del mundo
export class World {
  constructor() {
    this.veh = {};
    this.ppl = {};
    this.sw = {};
    this.sig = { entrada: "rojo", salida: "rojo" };
    this.arms = Array(11).fill(0);
    this.armX = Array(11).fill(null);
    this.gw = Array(11).fill(0);
    this.cnt = { recibidos: 0, pesados: 0, cargados: 0, despachados: 0 };
    this.scale = "0 kg";
    this.smoke = {};
    this.note = "";
  }
  clone() {
    const w = new World();
    for (const k in this.veh) w.veh[k] = { ...this.veh[k] };
    for (const k in this.ppl) w.ppl[k] = { ...this.ppl[k] };
    w.sw = { ...this.sw };
    w.sig = { ...this.sig };
    w.arms = this.arms.slice();
    w.armX = this.armX.slice();
    w.gw = this.gw.slice();
    w.cnt = { ...this.cnt };
    w.scale = this.scale;
    w.smoke = { ...this.smoke };
    w.note = this.note;
    return w;
  }
}

// posición y tangente de un vehículo (centro) en el mundo
export function vehPose(W, id) {
  const r = W.veh[id];
  const q = pointAt(r.route, r.s);
  const l = Math.hypot(q.t[0], q.t[1]);
  return { x: q.p[0], z: q.p[1], tx: (q.t[0] / l) * r.dir, tz: (q.t[1] / l) * r.dir };
}

// ---------- constructor del guion
export class Script {
  constructor(fleetById, lengths) {
    this.byId = fleetById;
    this.len = lengths;
    this.cur = new World();
    this.scenes = [];
  }
  scene(meta, fn) {
    const sc = new SceneB(this, meta);
    fn(sc);
    sc.finish();
    this.scenes.push(sc.out);
    return sc.out;
  }
}

class SceneB {
  constructor(S, meta) {
    this.S = S;
    this.meta = meta;
    this.start = S.cur.clone();
    this.actions = [];
    this.cams = [];
    this.focusCues = [];
    this.t = 0;
    this.end = 0;
  }
  get cur() {
    return this.S.cur;
  }
  push(a) {
    this.actions.push(a);
    this.end = Math.max(this.end, a.t1);
    a.apply(this.S.cur, a.t1 - a.t0, a.t1);
    return a;
  }
  wait(s) {
    this.t += s;
    return this;
  }
  // ---- acciones instantáneas o con duración
  set(fn, at = this.t) {
    return this.push({ t0: at, t1: at, apply: (W) => fn(W) });
  }
  live(fn, t0, t1) {
    // función evaluada continuamente (contadores derivados, indicador de báscula)
    return this.push({ t0, t1, apply: (W, tl, t) => fn(W, tl, t) });
  }
  signal(name, aspect, at = this.t) {
    return this.set((W) => (W.sig[name] = aspect), at);
  }
  smoke(id, rate, at = this.t) {
    return this.set((W) => (W.smoke[id] = rate), at);
  }
  hide(key, at = this.t) {
    return this.set((W) => (W.ppl[key].vis = false), at);
  }
  place(key, x, y, z, h, g = null, at = this.t) {
    return this.set((W) => (W.ppl[key] = { ...W.ppl[key], x, y, z, h, g, vis: true, moving: false }), at);
  }
  gesture(key, g, dur, { at = this.t, keep = false, advance = true } = {}) {
    const t0 = at;
    const t1 = at + dur;
    this.push({
      t0,
      t1,
      apply: (W, tl) => {
        const p = W.ppl[key];
        p.g = tl < dur || keep ? g : null;
      },
    });
    if (advance) this.t = Math.max(this.t, t1);
    return t1;
  }
  // Camina por puntos [[x,z],...] (desde su posición actual)
  walk(key, pts, { speed = 1.25, y = null, at = this.t, advance = true, endH = null } = {}) {
    const p0 = this.cur.ppl[key];
    const P = [[p0.x, p0.z], ...pts];
    const segs = [];
    let L = 0;
    for (let i = 1; i < P.length; i++) {
      const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      segs.push({ a: P[i - 1], b: P[i], l, s: L });
      L += l;
    }
    const dur = L / speed;
    const gait0 = p0.gait || 0;
    const yy = y ?? p0.y;
    this.push({
      t0: at,
      t1: at + dur,
      apply: (W, tl) => {
        const d = Math.min(L, tl * speed);
        let sg = segs[segs.length - 1];
        for (const s of segs) if (d <= s.s + s.l) {
          sg = s;
          break;
        }
        const f = sg.l ? (d - sg.s) / sg.l : 1;
        const rec = W.ppl[key];
        rec.x = sg.a[0] + (sg.b[0] - sg.a[0]) * f;
        rec.z = sg.a[1] + (sg.b[1] - sg.a[1]) * f;
        rec.y = yy;
        rec.vis = true;
        rec.h = Math.atan2(-(sg.b[1] - sg.a[1]), sg.b[0] - sg.a[0]);
        rec.gait = gait0 + d;
        rec.moving = d < L - 1e-3;
        rec.g = null;
        if (!rec.moving && endH !== null) rec.h = endH;
      },
    });
    if (advance) this.t = at + dur;
    return at + dur;
  }
  // Persona en el estribo del extremo de un vehículo mientras se mueve
  // endX = +1: extremo con mayor x (oriente); -1: extremo poniente
  ride(key, vid, endX, t0, t1, side = 1) {
    const L = this.S.len[vid];
    return this.push({
      t0,
      t1,
      apply: (W) => {
        const v = vehPose(W, vid);
        const end = endX * (Math.sign(v.tx) || 1);
        const e = end * (L / 2 - 0.55);
        const nx = -v.tz * side;
        const nz = v.tx * side;
        const rec = W.ppl[key];
        rec.x = v.x + v.tx * e + nx * 1.72;
        rec.z = v.z + v.tz * e + nz * 1.72;
        rec.y = 0.47;
        rec.h = Math.atan2(-v.tz * end, v.tx * end);
        rec.vis = true;
        rec.moving = false;
        rec.g = "radio";
      },
    });
  }
  switchTo(id, v, at = this.t) {
    return this.set((W) => (W.sw[id] = v), at);
  }
  // ---- movimiento de una composición a lo largo de una ruta
  move(ids, legs, o = {}) {
    const route = makeRoute(legs);
    const W = this.cur;
    const info = ids.map((id) => {
      const r = W.veh[id];
      const q = pointAt(r.route, r.s);
      const l = Math.hypot(q.t[0], q.t[1]);
      const fwd = [(q.t[0] / l) * r.dir, (q.t[1] / l) * r.dir];
      const pr = projectS(route, q.p[0], q.p[1]);
      if (pr.d > 2.5) console.warn("vehículo fuera de la ruta", id, pr.d.toFixed(1), route.id);
      const tq = pointAt(route, pr.s).t;
      const dir = fwd[0] * tq[0] + fwd[1] * tq[1] >= 0 ? 1 : -1;
      return { id, s0: pr.s, dir, roll0: r.roll || 0, L: this.S.len[id], loco: this.S.byId[id].meta.kind === "loco" };
    });
    info.sort((a, b) => a.s0 - b.s0);
    const head = info[info.length - 1];
    const tail = info[0];
    let D;
    const rsOf = (p) => (typeof p === "number" ? p : routeS(route, p.track, p.x, p.s));
    if (o.headTo !== undefined) D = rsOf(o.headTo) - (head.s0 + head.L / 2);
    else if (o.tailTo !== undefined) D = rsOf(o.tailTo) - (tail.s0 - tail.L / 2);
    else if (o.couple) {
      // acoplar al vehículo indicado (en reposo) por su extremo más cercano
      const v = vehPose(W, o.couple);
      const sv = projectS(route, v.x, v.z).s;
      D = sv - this.S.len[o.couple] / 2 - (head.s0 + head.L / 2);
    } else D = o.dist ?? -1e9;
    if (o.tailClear) D = Math.max(D, rsOf(o.tailClear) + 15 - (tail.s0 - tail.L / 2));
    const zones = [];
    if (o.slowLast) zones.push({ from: Math.max(0, D - o.slowLast), v: o.vSlow ?? 2 * KMH });
    if (o.couple) zones.push({ from: Math.max(0, D - 25), v: 2 * KMH });
    for (const z of o.zones || []) zones.push({ from: rsOf(z.at) - (head.s0 + head.L / 2), v: z.v });
    const pr = profile(Math.max(0.01, D), { vmax: o.vmax ?? V_PATIO, v0: o.v0 ?? 0, vEnd: o.vEnd ?? 0, zones });
    const locoIdx = Math.max(0, info.findIndex((i) => i.loco));
    const mode = { startStretched: !!o.startStretched, endStretched: !!o.vEnd };
    const t0 = o.at ?? this.t;
    const t1 = t0 + slackEnd(pr, info.length);
    const sw = route.switches;
    const locos = info.filter((i) => i.loco).map((i) => i.id);
    this.push({
      t0,
      t1,
      apply: (W2, tl) => {
        for (const k in sw) W2.sw[k] = sw[k];
        for (let i = 0; i < info.length; i++) {
          const it = info[i];
          const disp = slackDisp(pr, tl, Math.abs(i - locoIdx), mode);
          const rec = W2.veh[it.id];
          W2.veh[it.id] = { route, s: it.s0 + disp, dir: it.dir, load: rec.load, roll: it.roll0 + disp * it.dir };
        }
        for (const id of locos) W2.smoke[id] = tl < pr.T ? 2.4 : 1;
      },
    });
    this.lastMove = { route, pr, t0, t1, head: head.id };
    if (o.advance !== false) this.t = t1;
    return { t0, t1, T: t0 + pr.T, route, pr };
  }
  // ---- carga de un carro (suspensión baja) y contador
  load(ids, t0, dur) {
    return this.push({
      t0,
      t1: t0 + dur,
      apply: (W, tl) => {
        for (const id of ids) W.veh[id].load = Math.min(1, tl / dur);
      },
    });
  }
  counter(name, from, to, t0, t1) {
    return this.push({ t0, t1, apply: (W, tl) => (W.cnt[name] = Math.round(from + (to - from) * Math.min(1, tl / Math.max(1e-3, t1 - t0)))) });
  }
  ramp(fn, t0, dur) {
    return this.push({ t0, t1: t0 + dur, apply: (W, tl) => fn(W, Math.min(1, tl / Math.max(1e-3, dur))) });
  }
  // ---- cámaras
  cam(shot, at = this.t) {
    this.cams.push({ t: at, shot });
  }
  focus(fn, at = this.t) {
    this.focusCues.push({ t: at, fn });
  }
  finish() {
    const dur = Math.max((this.meta.nominal || 0) * 60, this.end + 8);
    this.out = { meta: this.meta, start: this.start, actions: this.actions, dur, cams: this.cams.sort((a, b) => a.t - b.t), focus: this.focusCues.sort((a, b) => a.t - b.t) };
  }
}

// abscisa sobre la ruta de un punto de una vía (por x o por s propia)
export function routeS(route, track, x, s) {
  const tr = TR(track);
  const ss = s ?? sAtX(tr, x);
  const q = pointAt(tr, ss);
  return projectS(route, q.p[0], q.p[1]).s;
}

export function evalScene(sc, t) {
  const W = sc.start.clone();
  for (const a of sc.actions) if (t >= a.t0) a.apply(W, Math.min(t, a.t1) - a.t0, t);
  return W;
}

// posición de la banderola de un cambio (para que el garrotero camine a ella)
const STANDS = {};
export function standPos(id) {
  if (STANDS[id]) return STANDS[id];
  const to = TURNOUTS.find((t) => t.id === id);
  const A = analyse(to);
  const p = A.W(-0.4, -RC_ - 2.4);
  STANDS[id] = p;
  return p;
}
const RC_ = 1.435 / 2 + 0.037;
export { DECK };
