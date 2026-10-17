// Geometría auxiliar: barridos de perfiles a lo largo de trazos y lotes de instancias por zonas.
import * as THREE from "three";

// Muestras de un trazo entre s0 y s1 (incluye extremos interpolados).
export function subPath(track, s0 = 0, s1 = track.length) {
  const p = track.path;
  const out = [];
  const at = (s) => {
    let lo = 0;
    let hi = p.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (p[m].s < s) lo = m;
      else hi = m;
    }
    const a = p[lo];
    const b = p[hi];
    const f = Math.min(1, Math.max(0, (s - a.s) / Math.max(1e-6, b.s - a.s)));
    const t = [a.t[0] + (b.t[0] - a.t[0]) * f, a.t[1] + (b.t[1] - a.t[1]) * f];
    const l = Math.hypot(t[0], t[1]);
    return { p: [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f], t: [t[0] / l, t[1] / l], s };
  };
  out.push(at(s0));
  for (const q of p) if (q.s > s0 + 0.05 && q.s < s1 - 0.05) out.push({ p: q.p, t: norm(q.t), s: q.s });
  out.push(at(s1));
  return out;
}
const norm = (t) => {
  const l = Math.hypot(t[0], t[1]);
  return [t[0] / l, t[1] / l];
};

// Barrido de un perfil abierto [[u, y], ...] (en sentido antihorario) a lo largo de muestras.
// lateral desplaza el perfil; profileAt(f) permite perfiles variables (agujas).
export function sweep(samples, profile, { lateral = 0, y0 = 0, worldUV = 0, uScale = 1, vScale = 1, profileAt = null } = {}) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const n = samples.length;
  const total = samples[n - 1].s - samples[0].s || 1;
  const prof0 = profileAt ? profileAt(0) : profile;
  const segs = prof0.length - 1;
  let base = 0;
  for (let j = 0; j < segs; j++) {
    let acc = 0;
    for (let k = 0; k < j; k++) acc += Math.hypot(prof0[k + 1][0] - prof0[k][0], prof0[k + 1][1] - prof0[k][1]);
    for (let i = 0; i < n; i++) {
      const sm = samples[i];
      const pr = profileAt ? profileAt((sm.s - samples[0].s) / total) : profile;
      const a = pr[j];
      const b = pr[j + 1];
      const du = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(du, dy) || 1;
      const nu = dy / len;
      const ny = -du / len;
      const L = [-sm.t[1], sm.t[0]];
      for (const q of [a, b]) {
        const u = q[0] + lateral;
        const x = sm.p[0] + L[0] * u;
        const z = sm.p[1] + L[1] * u;
        pos.push(x, y0 + q[1], z);
        nor.push(L[0] * nu, ny, L[1] * nu);
        if (worldUV) uv.push(x / worldUV, z / worldUV);
        else uv.push((acc + (q === b ? len : 0)) * uScale, sm.s * vScale);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a0 = base + i * 2;
      const b0 = a0 + 1;
      const a1 = a0 + 2;
      const b1 = a0 + 3;
      idx.push(a0, a1, b0, b0, a1, b1);
    }
    base += n * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Instancias repartidas en celdas para que el recorte por cámara funcione en un patio de kilómetros.
export class Chunked {
  constructor(geometry, material, { cell = 120, castShadow = true, receiveShadow = true, name = "" } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.cell = cell;
    this.cells = new Map();
    this.opts = { castShadow, receiveShadow, name };
    this.extra = {};
  }
  add(matrix, attrs) {
    const e = matrix.elements;
    const key = `${Math.floor(e[12] / this.cell)},${Math.floor(e[14] / this.cell)}`;
    if (!this.cells.has(key)) this.cells.set(key, { m: [], a: [] });
    const c = this.cells.get(key);
    c.m.push(matrix.clone());
    if (attrs) c.a.push(attrs);
  }
  build(parent, attrSpec = {}) {
    const meshes = [];
    for (const [, c] of this.cells) {
      const im = new THREE.InstancedMesh(this.geometry, this.material, c.m.length);
      c.m.forEach((m, i) => im.setMatrixAt(i, m));
      for (const [name, size] of Object.entries(attrSpec)) {
        const arr = new Float32Array(c.m.length * size);
        c.a.forEach((a, i) => {
          const v = a[name];
          if (size === 1) arr[i] = v;
          else for (let k = 0; k < size; k++) arr[i * size + k] = v[k];
        });
        if (name === "instanceColor") {
          im.instanceColor = new THREE.InstancedBufferAttribute(arr, 3);
          continue;
        }
        im.geometry = im.geometry === this.geometry ? this.geometry.clone() : im.geometry;
        im.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size));
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = this.opts.castShadow;
      im.receiveShadow = this.opts.receiveShadow;
      im.name = this.opts.name;
      parent.add(im);
      meshes.push(im);
    }
    this.meshes = meshes;
    return meshes;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
export function trs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, "YXZ");
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s).clone();
}

// Rumbo (rotación Y) para que el eje +X local apunte en la dirección t=[tx,tz]
export const heading = (t) => Math.atan2(-t[1], t[0]);
