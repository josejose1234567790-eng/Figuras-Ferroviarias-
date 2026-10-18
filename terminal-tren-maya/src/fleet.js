// Flota instanciada: cada pieza de un tipo de vehículo es un InstancedMesh; los vehículos se colocan
// sobre el trazo con los bogíes pivotando en la curva, ruedas que giran y suspensión según la carga.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAIL_TOP, pointAt } from "./layout.js";
import { hook, std } from "./materials.js";
import * as TX from "./textures.js";

// Conjunto de piezas de un tipo: se fusionan por (sujeción, material)
export class PartSet {
  constructor() {
    this.map = new Map();
  }
  add(attach, mat, geo, extra = {}) {
    if (!geo) return;
    const key = `${attach}|${mat.uuid}|${extra.slot ? "s" : ""}`;
    if (!this.map.has(key)) this.map.set(key, { attach, mat, geos: [], ...extra });
    this.map.get(key).geos.push(clean(geo));
  }
  parts() {
    return [...this.map.values()].map((p) => ({ attach: p.attach, mat: p.mat, slot: p.slot, geo: mergeGeometries(p.geos), cast: p.cast ?? true }));
  }
}
function clean(g) {
  let geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.morphAttributes = {};
  return geo;
}

// Atlas de rótulos individuales (números económicos): una franja por vehículo
export class SlotAtlas {
  constructor(n, w = 512, h = 80) {
    this.n = Math.max(1, n);
    this.w = w;
    this.h = h;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h * this.n;
    this.ctx = this.canvas.getContext("2d");
    this.next = 0;
  }
  draw(fn) {
    const k = this.next++;
    const g = this.ctx;
    g.save();
    g.translate(0, k * this.h);
    g.beginPath();
    g.rect(0, 0, this.w, this.h);
    g.clip();
    fn(g, this.w, this.h);
    g.restore();
    return k;
  }
  texture() {
    if (!this._t) {
      this._t = TX.bleed(this.canvas);
      this._t.wrapS = this._t.wrapT = THREE.ClampToEdgeWrapping;
    }
    return this._t;
  }
}

export function slotMaterial(atlas, params = {}) {
  const m = std({ map: atlas.texture(), alphaTest: 0.4, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, ...params });
  hook(m, `slot${atlas.n}`, (s) => {
    s.uniforms.uSlots = { value: atlas.n };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSlot;\nuniform float uSlots;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        #ifdef USE_MAP
        vMapUv = vec2(vMapUv.x, (vMapUv.y + (uSlots - 1.0 - aSlot)) / uSlots);
        #endif`,
      );
  });
  return m;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

export class Vehicle {
  constructor(type, opts = {}) {
    this.type = type;
    this.id = opts.id || "";
    this.label = opts.label || this.id;
    this.load = opts.load ?? 0;
    this.slot = opts.slot ?? 0;
    this.roll = 0;
    this.track = null;
    this.s = 0;
    this.dir = 1;
    this.flip = !!opts.flip;
    this.center = new THREE.Vector3();
    this.heading = 0;
    this.trucks = [
      { p: new THREE.Vector3(), yaw: 0 },
      { p: new THREE.Vector3(), yaw: 0 },
    ];
    this.dirty = true;
    this.meta = opts.meta || {};
  }
  get length() {
    return this.type.length;
  }
  // Coloca el centro del vehículo en la abscisa s; dir = +1 mira hacia s creciente
  place(track, s, dir = 1) {
    const T = this.type;
    const d = this.flip ? -dir : dir;
    this.track = track;
    this.s = s;
    this.dir = dir;
    const A = pointAt(track, s + T.b * d);
    const B = pointAt(track, s - T.b * d);
    this.center.set((A.p[0] + B.p[0]) / 2, RAIL_TOP, (A.p[1] + B.p[1]) / 2);
    const fx = A.p[0] - B.p[0];
    const fz = A.p[1] - B.p[1];
    this.heading = Math.atan2(-fz, fx);
    for (const [k, q] of [[0, A], [1, B]]) {
      this.trucks[k].p.set(q.p[0], RAIL_TOP, q.p[1]);
      this.trucks[k].yaw = Math.atan2(-q.t[1] * d, q.t[0] * d);
    }
    this.dirty = true;
  }
  move(ds) {
    this.roll += this.flip ? -ds : ds;
    this.place(this.track, this.s + ds * this.dir, this.dir);
  }
  setLoad(f) {
    this.load = f;
    this.dirty = true;
  }
}

export class Fleet {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "flota";
    scene.add(this.group);
    this.byType = new Map();
    this.vehicles = [];
    this.meshes = [];
  }
  add(type, opts) {
    const v = new Vehicle(type, opts);
    if (!this.byType.has(type)) this.byType.set(type, []);
    v.index = this.byType.get(type).length;
    this.byType.get(type).push(v);
    this.vehicles.push(v);
    return v;
  }
  build() {
    for (const [type, list] of this.byType) {
      const n = list.length;
      type.meshes = [];
      for (const part of type.parts) {
        const count = part.attach === "body" ? n : part.attach === "axle" ? n * 2 * type.axles.length : n * 2;
        let geo = part.geo;
        if (part.slot) {
          geo = geo.clone();
          geo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(new Float32Array(list.map((v) => v.slot)), 1));
        }
        const im = new THREE.InstancedMesh(geo, part.mat, count);
        im.castShadow = part.cast;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.name = type.name;
        im.userData.fleet = { type, attach: part.attach };
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(im);
        type.meshes.push({ im, part });
        this.meshes.push(im);
      }
    }
    this.update(true);
  }
  vehicleFromHit(hit) {
    const f = hit.object.userData.fleet;
    if (!f) return null;
    const list = this.byType.get(f.type);
    const i = hit.instanceId ?? 0;
    const per = f.attach === "body" ? 1 : f.attach === "axle" ? 2 * f.type.axles.length : 2;
    return list[Math.floor(i / per)];
  }
  update(force = false) {
    for (const [type, list] of this.byType) {
      let any = force;
      for (const v of list) if (v.dirty) any = true;
      if (!any) continue;
      const nAx = type.axles.length;
      for (const { im, part } of type.meshes) {
        list.forEach((v, vi) => {
          if (!v.dirty && !force) return;
          if (part.attach === "body") {
            _v.copy(v.center);
            _v.y += -type.sag * v.load;
            _q.setFromAxisAngle(_Y, v.heading);
            _m.compose(_v, _q, _s);
            im.setMatrixAt(vi, _m);
          } else {
            for (let j = 0; j < 2; j++) {
              const t = v.trucks[j];
              _q.setFromAxisAngle(_Y, t.yaw);
              _m.compose(t.p, _q, _s);
              if (part.attach === "truck") im.setMatrixAt(vi * 2 + j, _m);
              else if (part.attach === "spring") {
                const k = 1 - type.springTravel * v.load;
                _m2.makeTranslation(0, type.springBase, 0).multiply(new THREE.Matrix4().makeScale(1, k, 1));
                im.setMatrixAt(vi * 2 + j, _m.clone().multiply(_m2));
              } else if (part.attach === "axle") {
                for (let a = 0; a < nAx; a++) {
                  const ang = -v.roll / type.wheelR;
                  _m2.makeTranslation(type.axles[a], type.wheelR, 0).multiply(new THREE.Matrix4().makeRotationAxis(_Z, ang));
                  im.setMatrixAt((vi * 2 + j) * nAx + a, _m.clone().multiply(_m2));
                }
              }
            }
          }
        });
        im.instanceMatrix.needsUpdate = true;
      }
      for (const v of list) v.dirty = false;
    }
  }
}

// Coloca una composición: el primer vehículo con su enganche delantero en sHead, mirando a dir
export function placeConsist(track, sHead, dir, vehicles, gap = 0.0) {
  let s = sHead;
  for (const v of vehicles) {
    const c = s - dir * (v.length / 2);
    v.place(track, c, dir);
    s = c - dir * (v.length / 2 + gap);
  }
  return s;
}
