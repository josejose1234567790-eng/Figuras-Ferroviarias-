// Humo de escape: bocanadas tenues que suben, se abren y se desvanecen con el viento (sin efectos exagerados).
import * as THREE from "three";

let puffTex;
function puff() {
  if (puffTex) return puffTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  for (let i = 0; i < 14; i++) {
    const x = 64 + (Math.random() - 0.5) * 40;
    const y = 64 + (Math.random() - 0.5) * 40;
    const r = 22 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

export class Exhaust {
  constructor(scene, vehicle, local, { n = 60, rate = 1 } = {}) {
    this.v = vehicle;
    this.local = new THREE.Vector3(...local);
    this.rate = rate; // 0 = apagado, 1 = ralentí, 3 = acelerando
    this.items = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: puff(), color: 0x9c9a96, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.group.add(s);
      this.items.push({ s, age: 99, life: 1, vel: new THREE.Vector3() });
    }
    this.acc = 0;
  }
  source(out) {
    const v = this.v;
    const c = Math.cos(v.heading);
    const sn = Math.sin(v.heading);
    out.set(v.center.x + this.local.x * c + this.local.z * sn, v.center.y + this.local.y, v.center.z - this.local.x * sn + this.local.z * c);
    return out;
  }
  update(dt) {
    this.acc += dt * (this.rate > 0 ? 8 + this.rate * 6 : 0);
    while (this.acc > 1) {
      this.acc -= 1;
      const it = this.items.find((i) => i.age >= i.life);
      if (!it) break;
      it.age = 0;
      it.life = 3 + Math.random() * 2;
      this.source(it.s.position);
      it.vel.set((Math.random() - 0.5) * 0.3, 1.6 + this.rate * 0.8, (Math.random() - 0.5) * 0.3);
      it.s.visible = true;
      it.rot = Math.random() * Math.PI * 2;
    }
    for (const it of this.items) {
      if (it.age >= it.life) {
        it.s.visible = false;
        continue;
      }
      it.age += dt;
      const f = it.age / it.life;
      it.vel.y *= 1 - dt * 0.45;
      it.s.position.addScaledVector(it.vel, dt);
      it.s.position.x -= dt * 0.9; // brisa ligera del oriente
      it.s.position.z += dt * 0.25;
      const sc = 0.35 + f * (2.2 + this.rate * 0.8);
      it.s.scale.set(sc, sc, sc);
      it.s.material.opacity = (0.07 + this.rate * 0.05) * Math.sin(Math.min(1, f * 5) * Math.PI * 0.5) * (1 - f) * (1 - f);
      it.s.material.rotation = it.rot + f * 0.6;
    }
  }
}
