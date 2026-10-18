// Director: reproduce el guion (play/pausa, velocidad, saltos), aplica el estado a la escena 3D
// y conduce las cámaras (dron, seguir, nivel de vía, cinemática) con transiciones suaves.
import * as THREE from "three";
import { evalScene } from "./scenario.js";
import { RAIL_TOP, YARD } from "./layout.js";
import { heightAt } from "./terrain.js";

const DOME_Y = RAIL_TOP + 4.62 + 0.05;
const STORED = { yaw: Math.PI, in: 0.12, out: -1.45 };

function armIK(arm, x) {
  const p = arm.position;
  const dx = x - p.x;
  const dz = YARD.carga.z - p.z;
  const r = Math.hypot(dx, dz);
  const h = DOME_Y + 2.0 - (p.y + 1.5);
  const a = 2.6;
  const b = 2.3;
  const d = Math.min(a + b - 0.01, Math.hypot(r, h));
  const inA = Math.atan2(h, r) + Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const elbow = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b))));
  return { yaw: Math.atan2(-dz, dx), in: inA, out: -(Math.PI - elbow) };
}
const ease = (f) => f * f * (3 - 2 * f);
function lerpAng(a, b, f) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * f;
}

export class Director {
  constructor(o) {
    Object.assign(this, o);
    this.i = 0;
    this.t = 0;
    this.playing = false;
    this.speed = 10;
    this.mode = "cine";
    this.listeners = [];
    this.swShown = {};
    this.sigShown = {};
    this.scaleShown = "";
    this.cam = { pos: this.camera.position.clone(), target: this.controls.target.clone(), f: this.camera.getFocalLength() };
    this.offsets = [];
    let acc = 0;
    for (const sc of this.scenes) {
      this.offsets.push(acc);
      acc += sc.dur;
    }
    this.total = acc;
    for (const v of this.fleet.vehicles) v.flip = false;
    this.turnoutById = {};
    for (const g of this.turnouts) this.turnoutById[g.userData.id] = g;
    this.W = evalScene(this.scenes[0], 0);
  }
  on(fn) {
    this.listeners.push(fn);
  }
  emit() {
    for (const fn of this.listeners) fn(this);
  }
  get scene() {
    return this.scenes[this.i];
  }
  seek(i, t = 0) {
    this.i = Math.max(0, Math.min(this.scenes.length - 1, i));
    this.t = Math.max(0, Math.min(this.scene.dur, t));
    this.emit();
  }
  next() {
    if (this.i < this.scenes.length - 1) this.seek(this.i + 1, 0);
  }
  prev() {
    if (this.t > 5) this.seek(this.i, 0);
    else this.seek(this.i - 1, 0);
  }
  clock() {
    return this.offsets[this.i] + this.t;
  }
  update(realDt) {
    let simDt = 0;
    if (this.playing) {
      simDt = realDt * this.speed;
      this.t += simDt;
      while (this.t > this.scene.dur) {
        if (this.i < this.scenes.length - 1) {
          this.t -= this.scene.dur;
          this.i++;
          this.emit();
        } else {
          this.t = this.scene.dur;
          this.playing = false;
          this.emit();
          break;
        }
      }
    }
    this.W = evalScene(this.scene, this.t);
    this.apply(this.W, realDt, simDt);
    this.drive(realDt);
  }
  apply(W, realDt, simDt) {
    // vehículos
    for (const id in W.veh) {
      const v = this.byId[id];
      const r = W.veh[id];
      if (!v) continue;
      if (v.track !== r.route || v.s !== r.s || v.dir !== r.dir || v.roll !== r.roll || v.load !== r.load) {
        v.roll = r.roll;
        v.load = r.load;
        v.place(r.route, r.s, r.dir);
      }
    }
    this.fleet.update();
    // cambios: agujas y banderola se mueven en ~2 s
    for (const id in this.turnoutById) {
      const target = W.sw[id] ?? 0;
      const cur = this.swShown[id] ?? 0;
      if (cur !== target) {
        const step = Math.max(realDt * 0.6, simDt * 0.5);
        const nv = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
        this.swShown[id] = nv;
        this.turnoutById[id].userData.setState(ease(nv));
      }
    }
    // señales
    for (const k in W.sig) {
      if (this.sigShown[k] !== W.sig[k]) {
        this.sigShown[k] = W.sig[k];
        this.refs.signals[k]?.userData.setAspect(W.sig[k]);
      }
    }
    // indicador de la báscula
    if (W.scale !== this.scaleShown) {
      this.scaleShown = W.scale;
      const sc = this.refs.indicator.userData.screen;
      const g = sc.ctx;
      g.fillStyle = "#120707";
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = "#ff3a22";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const txt = W.scale;
      let fs = 120;
      g.font = `bold ${fs}px 'Courier New', monospace`;
      while (g.measureText(txt).width > 980 && fs > 30) {
        fs -= 4;
        g.font = `bold ${fs}px 'Courier New', monospace`;
      }
      g.fillText(txt, 512, 132);
      sc.tex.needsUpdate = true;
    }
    // brazos de llenado y pasarelas
    this.refs.rack.forEach((p, i) => {
      const f = ease(W.arms[i] || 0);
      const tgt = W.armX[i] !== null ? armIK(p.arm, W.armX[i]) : STORED;
      p.arm.userData.pose({ yaw: lerpAng(STORED.yaw, tgt.yaw, f), in: STORED.in + (tgt.in - STORED.in) * f, out: STORED.out + (tgt.out - STORED.out) * f });
      p.gangway.userData.setDown(ease(W.gw[i] || 0));
    });
    // personal
    const tg = this.clock();
    for (const k in this.people) {
      const rec = W.ppl[k];
      if (rec) this.people[k].pose(rec, tg);
    }
    // humo
    for (const id in this.smokes) {
      this.smokes[id].rate = W.smoke[id] ?? 0.6;
      this.smokes[id].update(Math.min(realDt, 0.1));
    }
  }
  // ---- cámaras
  focusPoint(W) {
    const cues = this.scene.focus;
    let fn = null;
    for (const c of cues) if (c.t <= this.t) fn = c.fn;
    if (!fn && cues.length) fn = cues[0].fn;
    return fn ? fn(W) : { x: -300, y: 2, z: -10, tx: 1, tz: 0 };
  }
  desired() {
    const W = this.W;
    if (this.mode === "cine") {
      const cues = this.scene.cams;
      let cue = cues[0];
      for (const c of cues) if (c.t <= this.t) cue = c;
      if (cue) {
        const s = cue.shot(W, this.t - cue.t, this.t);
        return { pos: new THREE.Vector3(...s.pos), target: new THREE.Vector3(...s.target), f: s.f, dof: s.dof };
      }
    }
    const c = this.focusPoint(W);
    const t = new THREE.Vector3(c.tx, 0, c.tz).normalize();
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const C = new THREE.Vector3(c.x, c.y, c.z);
    if (this.mode === "seguir") return { pos: C.clone().addScaledVector(t, -30).addScaledVector(n, 16).add(new THREE.Vector3(0, 9, 0)), target: C, f: 35 };
    if (this.mode === "via") {
      const p = C.clone().addScaledVector(n, 14).addScaledVector(t, 12);
      p.y = heightAt(p.x, p.z) + 1.65;
      return { pos: p, target: new THREE.Vector3(c.x, 1.6, c.z), f: 50 };
    }
    return { pos: C.clone().add(new THREE.Vector3(-170, 140, 160)), target: C, f: 24 };
  }
  drive(realDt) {
    if (this.mode === "libre") {
      this.post.bokeh.enabled = false;
      return;
    }
    const d = this.desired();
    const k = this.snap ? 1 : 1 - Math.exp(-Math.min(realDt, 0.1) / 0.9);
    this.snap = false;
    this.cam.pos.lerp(d.pos, k);
    this.cam.target.lerp(d.target, k);
    this.cam.f += (d.f - this.cam.f) * k;
    const gy = heightAt(this.cam.pos.x, this.cam.pos.z) + 0.9;
    if (this.cam.pos.y < gy) this.cam.pos.y = gy;
    this.camera.position.copy(this.cam.pos);
    this.controls.target.copy(this.cam.target);
    this.camera.setFocalLength(this.cam.f);
    this.camera.lookAt(this.cam.target);
    this.camera.updateProjectionMatrix();
    const dof = !!d.dof && this.quality() === "alta";
    this.post.bokeh.enabled = dof;
    if (dof) {
      const u = this.post.bokeh.uniforms;
      u.focus.value = this.cam.pos.distanceTo(this.cam.target);
      u.aperture.value = 0.00009;
      u.maxblur.value = 0.006;
    }
  }
}
