// Selva baja caducifolia (temporada de secas), arbustos, pasto seco y afloramientos de laja, con viento.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng, fbm } from "./util.js";
import { Chunked, trs } from "./geom.js";
import { hook, std, dust } from "./materials.js";
import { outside, heightAt } from "./terrain.js";
import { SITE } from "./layout.js";
import * as TX from "./textures.js";

export const WIND = { value: 0 };

// Árbol de altura 1: tronco con ramas y copa de tarjetas con normales esféricas
function treeGeometries() {
  const trunk = [];
  const t = new THREE.CylinderGeometry(0.018, 0.03, 0.62, 6, 1, true);
  t.translate(0, 0.31, 0);
  trunk.push(t);
  const r = rng(5);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.CylinderGeometry(0.007, 0.014, 0.32, 5, 1, true);
    b.translate(0, 0.16, 0);
    b.rotateZ(0.5 + r() * 0.35);
    b.rotateY((i / 4) * Math.PI * 2 + r());
    b.translate(0, 0.4 + r() * 0.12, 0);
    trunk.push(b);
  }
  const trunkGeo = mergeGeometries(trunk);
  const cards = [];
  const C = new THREE.Vector3(0, 0.68, 0);
  const add = (w, h, y, ry, rx, ox = 0, oz = 0) => {
    const p = new THREE.PlaneGeometry(w, h);
    p.rotateX(rx);
    p.rotateY(ry);
    p.translate(ox, y, oz);
    cards.push(p);
  };
  for (let i = 0; i < 3; i++) add(0.78, 0.5, 0.7, (i / 3) * Math.PI, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    add(0.46, 0.4, 0.62 + (i % 2) * 0.12, a, -0.5, Math.cos(a) * 0.2, Math.sin(a) * 0.2);
  }
  add(0.6, 0.5, 0.84, 0.3, -0.95);
  add(0.55, 0.5, 0.8, 2.2, -0.85);
  const crown = mergeGeometries(cards);
  // normales esféricas desde el centro de la copa: volumen en lugar de tarjetas planas
  const p = crown.attributes.position;
  const n = crown.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(C);
    v.y *= 1.4;
    v.normalize();
    n.setXYZ(i, v.x, v.y * 0.8 + 0.2, v.z);
  }
  return { trunkGeo, crown };
}

const WIND_VS = (atlas) => `
  #include <begin_vertex>
  {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
    #endif
    float hh = max(position.y, 0.0);
    float ph = ip.x * 0.13 + ip.z * 0.097;
    float sway = sin(uWind * 1.3 + ph) * 0.6 + sin(uWind * 2.9 + ph * 1.7) * 0.25;
    transformed.x += sway * 0.035 * hh * hh;
    transformed.z += cos(uWind * 1.1 + ph) * 0.02 * hh * hh;
    ${atlas ? "transformed += normal * sin(uWind * 6.0 + position.x * 40.0 + position.z * 31.0 + ph) * 0.006 * hh;" : ""}
  }
`;

function windHook(m, atlas) {
  return hook(m, `wind${atlas ? "a" : ""}`, (s) => {
    s.uniforms.uWind = WIND;
    s.vertexShader = s.vertexShader.replace("#include <common>", `#include <common>\nuniform float uWind;\n${atlas ? "attribute float aKind;" : ""}`).replace("#include <begin_vertex>", WIND_VS(atlas));
    if (atlas)
      s.vertexShader = s.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        #ifdef USE_MAP
        vMapUv = vMapUv * 0.5 + vec2(mod(aKind, 2.0) * 0.5, 0.5 - floor(aKind / 2.0) * 0.5);
        #endif`,
      );
  });
}

export function buildVegetation(scene, splatAt, quality) {
  const group = new THREE.Group();
  group.name = "vegetacion";
  scene.add(group);
  const { trunkGeo, crown } = treeGeometries();
  const atlas = TX.foliageAtlas();
  const barkT = TX.bark();
  const trunkMat = windHook(std({ map: barkT.map, normalMap: barkT.normal, roughness: 0.95, color: 0xd8d0c4 }), false);
  const crownMat = windHook(std({ map: atlas, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, color: 0xffffff, alphaToCoverage: true }), true);
  crownMat.name = "follaje";
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.42, side: THREE.DoubleSide });
  windHook(depthMat, true);
  const trunkDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  windHook(trunkDepth, false);

  const trunks = new Chunked(trunkGeo, trunkMat, { cell: 150, name: "arbol" });
  const crowns = new Chunked(crown, crownMat, { cell: 150, name: "arbol" });
  const r = rng(301);
  const full = quality === "alta";
  const count = full ? 9000 : 5000;
  const put = (x, z, H, wide, kind) => {
    const y = heightAt(x, z) - 0.1;
    const ry = r() * Math.PI * 2;
    const m = trs(x, y, z, ry, H * wide, H, H * wide * (0.85 + r() * 0.3));
    const tint = 0.78 + r() * 0.34;
    trunks.add(m);
    crowns.add(m, { aKind: kind, instanceColor: [tint * (0.95 + r() * 0.1), tint, tint * (0.9 + r() * 0.15)] });
  };
  const kindPick = () => {
    const q = r();
    return q < 0.35 ? 0 : q < 0.6 ? 1 : q < 0.8 ? 2 : 3;
  };
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 6) {
    tries++;
    const x = -1200 + r() * 2400;
    const z = -1200 + r() * 2400;
    const o = outside(x, z);
    if (o < 14 || o > 50) continue;
    // densidad irregular: claros y manchones
    const dens = fbm(x / 60, z / 60, { seed: 12, octaves: 3 });
    if (r() > 0.25 + dens * 1.1) continue;
    if (Math.abs(z) < 14) continue; // derecho de vía de la principal
    if (Math.abs(x + 660) < 9 && z > 0) continue; // camino de acceso
    const H = o < 25 ? 2 + r() * 4 : 4 + r() * 5.5;
    put(x, z, H, 0.75 + r() * 0.45, kindPick());
    placed++;
  }
  // árboles sueltos dentro del predio (sombra junto a edificios y orillas)
  for (const [x, z] of [[-628, 46], [-655, 52], [-275, 66], [-338, 64], [-700, -70], [-520, 62], [210, 60], [260, 58], [-860, 40], [-880, -50], [700, 50], [620, -70], [880, 10]]) put(x + r() * 4, z + r() * 4, 6 + r() * 3, 1.0, kindPick());
  trunks.build(group);
  crowns.build(group, { aKind: 1, instanceColor: 3 });
  for (const m of crowns.meshes) m.customDepthMaterial = depthMat;
  for (const m of trunks.meshes) m.customDepthMaterial = trunkDepth;

  // Pasto seco en macollos (tarjetas cruzadas)
  const blades = [];
  for (let k = 0; k < 5; k++) {
    const p = new THREE.PlaneGeometry(0.55, 0.5);
    p.translate(0, 0.25, 0.08);
    p.rotateX(-0.22);
    p.rotateY((k / 5) * Math.PI * 2 + k * 0.3);
    blades.push(p);
  }
  const grassGeo = mergeGeometries(blades);
  const gn = grassGeo.attributes.normal;
  for (let i = 0; i < gn.count; i++) gn.setXYZ(i, 0, 1, 0);
  const grassMat = windHook(std({ map: TX.grassCard(), alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.95, color: 0xcfc4a6, alphaToCoverage: true }), false);
  grassMat.name = "pasto";
  const grass = new Chunked(grassGeo, grassMat, { cell: 80, castShadow: false, name: "pasto" });
  const gc = full ? 30000 : 12000;
  let gp = 0;
  tries = 0;
  while (gp < gc && tries < gc * 8) {
    tries++;
    const near = r() < 0.7;
    const x = near ? -1020 + r() * 2040 : -1200 + r() * 2400;
    const z = near ? -115 + r() * 225 : -1200 + r() * 2400;
    const sp = splatAt(x, z);
    if (sp[0] > 0.25 || sp[1] < 0.55) continue;
    if (outside(x, z) > 40) continue;
    if (fbm(x / 9, z / 9, { seed: 44, octaves: 2 }) < 0.45) continue; // macollos agrupados
    const s = 0.45 + r() * 0.8;
    const k = 0.75 + r() * 0.35;
    const green = r();
    grass.add(trs(x, heightAt(x, z) - 0.03, z, r() * 6.28, s, s * (0.7 + r() * 0.6), s), { instanceColor: [k * (1 - green * 0.25), k * (1 - green * 0.05), k * (0.85 - green * 0.2)] });
    gp++;
  }
  grass.build(group, { instanceColor: 3 });

  // Afloramientos de laja caliza
  const rockGeo = new THREE.IcosahedronGeometry(1, 2);
  const rp = rockGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) {
    v.set(rp.getX(i), rp.getY(i), rp.getZ(i));
    const k = 0.75 + fbm(v.x * 1.7 + 3, v.y * 1.7 + v.z * 1.3, { seed: 3, octaves: 3 }) * 0.6;
    v.multiplyScalar(k);
    v.y = Math.max(v.y * 0.55, -0.2);
    rp.setXYZ(i, v.x, v.y, v.z);
  }
  rockGeo.computeVertexNormals();
  const rc = TX.concrete(17, [158, 152, 140]);
  const rockMat = std({ map: rc.map, normalMap: rc.normal, normalScale: new THREE.Vector2(2, 2), roughness: 0.95 });
  const rocks = new Chunked(rockGeo, rockMat, { cell: 200, name: "laja" });
  let rk = 0;
  tries = 0;
  while (rk < 900 && tries < 20000) {
    tries++;
    const x = -1100 + r() * 2200;
    const z = -400 + r() * 800;
    const sp = splatAt(x, z);
    if (sp[2] < 0.3 || sp[0] > 0.2) continue;
    const s = 0.3 + r() * 1.4;
    rocks.add(trs(x, heightAt(x, z) - 0.15 * s, z, r() * 6.28, s * (1 + r()), s * (0.5 + r() * 0.5), s));
    rk++;
  }
  rocks.build(group);

  group.add(treeLine(46, 0, 9.5));
  group.add(treeLine(58, 1, 11));
  group.add(treeLine(68, 2, 12));

  return { group, grassMeshes: grass.meshes };
}

// Orilla de la selva: lienzo con troncos, copas y sotobosque sobre una cinta alrededor del predio.
function treeLineTexture(seed) {
  return TX.once(`treeline${seed}`, () => treeLineMake(seed));
}
function treeLineMake(seed) {
  const W = 2048;
  const H = 512; // 64 m x 16 m (32 px/m)
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const r = rng(seed);
  const leaves = [0, 1, 2, 3].map((k) => TX.foliageCanvas(k));
  const px = 32;
  // troncos y ramas
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const top = H - (4 + r() * 6) * px;
    g.strokeStyle = `rgb(${96 + r() * 30},${90 + r() * 26},${80 + r() * 22})`;
    g.lineWidth = 3 + r() * 4;
    g.beginPath();
    g.moveTo(x, H);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, (H + top) / 2, x + (r() - 0.5) * 40, top);
    g.stroke();
  }
  // copas: varias capas de racimos (al fondo más oscuras)
  const crown = (x, y, s, k, dark) => {
    g.globalAlpha = 1;
    g.filter = dark ? "brightness(0.72)" : "none";
    g.drawImage(leaves[k], x - s / 2, y - s / 2, s, s * 0.85);
    g.filter = "none";
  };
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < 150; i++) {
      const x = ((i + r()) / 150) * W;
      const hTop = (6 + r() * 6 + Math.sin(x / 140 + seed) * 1.5) * px;
      const s = (3 + r() * 4) * px;
      const kk = r() < 0.3 ? 3 : Math.floor(r() * 3);
      crown(x, H - hTop + s * 0.3, s, kk, layer === 0);
      if (x < s) crown(x + W, H - hTop + s * 0.3, s, kk, layer === 0);
      if (x > W - s) crown(x - W, H - hTop + s * 0.3, s, kk, layer === 0);
    }
  // sotobosque denso
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const s = (1.5 + r() * 2.5) * px;
    crown(x, H - s * 0.35 - r() * px, s, Math.floor(r() * 4), r() < 0.5);
  }
  return TX.bleed(c);
}

function treeLine(dist, seed, height) {
  const F = SITE.cerca;
  const x0 = F.x0 - dist;
  const x1 = F.x1 + dist;
  const z0 = F.z0 - dist;
  const z1 = F.z1 + dist;
  const loop = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const r = rng(700 + seed);
  let s = 0;
  const step = 16;
  let prev = null;
  for (let i = 1; i < loop.length; i++) {
    const a = loop[i - 1];
    const b = loop[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const inward = [-d[1], d[0]]; // el lazo va en sentido horario visto desde arriba
    for (let t = 0; t <= L; t += step) {
      const j = (r() - 0.5) * 8;
      const x = a[0] + d[0] * t + inward[0] * j;
      const z = a[1] + d[1] * t + inward[1] * j;
      const skip = Math.abs(z) < 14 || (z > 0 && Math.abs(x + 660) < 9);
      const y = heightAt(x, z) - 0.4;
      const hh = height * (0.85 + r() * 0.3);
      const base = pos.length / 3;
      pos.push(x, y, z, x, y + hh, z);
      const n = [inward[0] * 0.7, 0.55, inward[1] * 0.7];
      nor.push(...n, ...n);
      uv.push(s / 64, 0, s / 64, hh / 16);
      if (prev !== null && !skip && !prev.skip) idx.push(prev.base, base, prev.base + 1, prev.base + 1, base, base + 1);
      prev = { base, skip };
      s += step;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = std({ map: treeLineTexture(900 + seed), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, alphaToCoverage: true });
  mat.name = "orilla-selva";
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.45, side: THREE.DoubleSide });
  m.name = "selva";
  m.userData.info = "selva";
  return m;
}
