// Instalaciones de la terminal: señal de entrada, báscula, combustible, arenero, fosa, llenadera,
// caseta del jefe de patio, bodega, torres de iluminación, cerca, postes de energía y seguridad.
import * as THREE from "three";
import { SITE, YARD, RAIL_TOP } from "./layout.js";
import { M, std, dust } from "./materials.js";
import * as TX from "./textures.js";
import { box, cyl, rod, rodsMesh, pipe, railing, stairs, ladder, label, signOnPost, safetySign, extinguisher, shower, shadow, planarUV, mergeGeometries } from "./kit.js";
import { RC } from "./track.js";
import { ROADS, heightAt } from "./terrain.js";

let W;
function mats() {
  if (W) return W;
  const wall = TX.wall();
  const roof = TX.roof();
  W = {
    wall: dust(std({ map: wall.map, roughnessMap: wall.rough, roughness: 1, metalness: 0 }), { height: 0.8, amount: 0.5, color: [0.72, 0.5, 0.4] }),
    sheet: dust(std({ map: wall.map, roughnessMap: wall.rough, normalMap: TX.ribs(), normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, metalness: 0.2 }), { height: 0.8, amount: 0.5, color: [0.72, 0.5, 0.4] }),
    roof: std({ map: roof.map, roughnessMap: roof.rough, normalMap: roof.normal, roughness: 1, metalness: 0.4 }),
    grating: std({ map: TX.grating(), alphaTest: 0.5, color: 0xa0a3a3, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide, alphaToCoverage: true }),
    alu: std({ color: 0xc9cdd0, metalness: 0.9, roughness: 0.35 }),
    tank: dust(std({ map: TX.paint("#eeeeea", { seed: 21, grime: 0.45 }).map, roughness: 0.5, metalness: 0.1 }), { height: 1.2, amount: 0.4 }),
    lensOff: (c) => std({ color: c, roughness: 0.2, metalness: 0, emissive: c, emissiveIntensity: 0.04 }),
    lensOn: (c) => std({ color: c, roughness: 0.2, metalness: 0, emissive: c, emissiveIntensity: 1.8 }),
    doorRoll: std({ map: TX.roof().map, color: 0xe2e4e0, roughness: 0.6, metalness: 0.5 }),
  };
  return W;
}

export function buildFacilities(scene) {
  const root = new THREE.Group();
  root.name = "instalaciones";
  scene.add(root);
  const out = { info: [] };
  root.add(entrySignal());
  root.add(scale());
  root.add(fuel());
  root.add(sandTower());
  root.add(pit());
  root.add(loadingRack());
  root.add(booth());
  root.add(warehouse());
  for (const [x, z] of SITE.torres) root.add(lightTower(x, z));
  root.add(fence());
  root.add(power());
  root.add(crossing());
  root.add(safetyAround());
  return root;
}

// ---------- Señal de entrada de mástil (aspectos rojo / amarillo / verde)
function entrySignal() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "señal";
  g.userData.info = "senal";
  const { x, z } = SITE.senalEntrada;
  g.position.set(x, 0, z);
  box(1.2, 0.5, 1.2, mat.concrete, 0, -0.1, 0, { parent: g });
  cyl(0.1, 0.12, 7.0, mat.galv, 0, 0.4, 0, { parent: g, seg: 14 });
  // gabinete de control al pie
  box(0.7, 1.3, 0.5, mat.galv, 0.9, 0, 0.9, { parent: g, r: 0.02 });
  // cabeza de señal mirando al poniente (-X)
  const head = new THREE.Group();
  head.position.set(-0.25, 5.4, 0);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 32), mat.black);
  back.rotation.z = Math.PI / 2;
  back.scale.set(1.35, 1, 1); // tablero vertical alargado
  head.add(back);
  box(0.3, 1.55, 0.42, mat.black, 0.16, -0.78, 0, { parent: head, r: 0.04 });
  const lamps = {};
  const cols = { verde: 0x2fd27a, amarillo: 0xffb21f, rojo: 0xff2b1c };
  ["verde", "amarillo", "rojo"].forEach((k, i) => {
    const y = 0.45 - i * 0.45;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 28), mats().lensOff(cols[k]));
    lens.position.set(-0.035, y, 0);
    lens.rotation.y = -Math.PI / 2;
    head.add(lens);
    const hg = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 24, 1, true, Math.PI * 0.05, Math.PI * 0.9);
    hg.rotateZ(Math.PI / 2); // visera sobre la mitad superior de la lente
    const hood = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, side: THREE.DoubleSide }));
    hood.position.set(-0.14, y + 0.0, 0);
    head.add(hood);
    lamps[k] = lens;
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.02, 6, 40), mat.white);
  ring.rotation.y = Math.PI / 2;
  ring.scale.set(1, 1.35, 1);
  ring.position.x = -0.03;
  head.add(ring);
  g.add(head);
  // plataforma de mantenimiento y escalera
  const plat = box(1.2, 0.05, 1.2, mats().grating, 0.4, 4.2, 0, { parent: g, r: 0 });
  plat.material = mats().grating;
  g.add(railing([[1.0, 4.25, -0.6], [1.0, 4.25, 0.6], [-0.2, 4.25, 0.6]], { h: 1.0, mat: mat.galv, toe: false }));
  const lad = ladder(4.2, { cage: true });
  lad.position.set(0.32, 0.3, 0);
  lad.rotation.y = Math.PI;
  g.add(lad);
  // placa de identificación
  const id = label(["SE-1"], { w: 0.5, h: 0.25, bg: "#ffffff", fg: "#111", border: true });
  id.position.set(-0.13, 2.6, 0);
  id.rotation.y = -Math.PI / 2;
  g.add(id);
  shadow(g);
  g.userData.setAspect = (a) => {
    for (const k of Object.keys(lamps)) lamps[k].material = k === a ? mats().lensOn(cols[k]) : mats().lensOff(cols[k]);
  };
  g.userData.setAspect("rojo");
  return g;
}

// ---------- Báscula de vía con caseta e indicador digital
function scale() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "bascula";
  g.userData.info = "bascula";
  const B = SITE.bascula;
  const z = YARD.recibo.z;
  // losa y marco de la báscula a nivel de durmiente
  const top = RAIL_TOP - 0.198;
  const L = B.len + 4;
  box(L, top + 0.3, 4.6, mat.concrete2, B.x, -0.3, z, { parent: g, r: 0.04, tile: 3 });
  // plataforma de pesaje (placas de acero entre rieles y a los lados)
  box(B.len, 0.03, 2.0, mat.darkSteel, B.x, top, z, { parent: g, r: 0.005 });
  for (const s of [-1, 1]) box(B.len, 0.03, 0.5, mat.darkSteel, B.x, top, z + s * (RC + 0.45), { parent: g, r: 0.005 });
  // juntas de dilatación y franjas amarillas de aviso
  for (const s of [-1, 1]) box(0.08, 0.035, 4.2, mat.yellow, B.x + (s * B.len) / 2, top, z, { parent: g, r: 0.005 });
  for (const s of [-1, 1]) box(L, 0.02, 0.12, mat.yellow, B.x, top + 0.005, z + s * 2.2, { parent: g, r: 0 });
  // rampas de balasto en los extremos ya las da la vía; cajas de celdas de carga
  for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) box(0.35, 0.05, 0.35, mat.galv, B.x + i * 5, top, z + s * 1.95, { parent: g, r: 0.01 });
  // caseta de báscula al sur de la principal
  const [hx, hz] = B.caseta;
  const house = smallHouse(4.6, 3.2, 2.8, "BÁSCULA");
  house.position.set(hx, 0, hz + 1.0);
  house.rotation.y = Math.PI;
  g.add(house);
  // indicador digital en poste, legible desde la vía de recibo
  const ind = new THREE.Group();
  ind.position.set(hx + 12, 0, 4.4);
  cyl(0.08, 0.08, 4.2, mat.galv, 0, 0, 0, { parent: ind });
  box(2.6, 0.9, 0.25, mat.black, 0, 3.6, 0, { parent: ind, r: 0.03 });
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#120707";
  x.fillRect(0, 0, 1024, 256);
  x.fillStyle = "#ff3a22";
  x.font = "bold 170px 'Courier New', monospace";
  x.textAlign = "right";
  x.textBaseline = "middle";
  x.fillText("0 000", 900, 132);
  x.font = "bold 70px Arial";
  x.fillText("kg", 1000, 170);
  const t = TX.tex(c);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.6), std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.6, roughness: 0.3 }));
  scr.position.set(0, 4.05, -0.13);
  scr.rotation.y = Math.PI;
  ind.add(scr);
  ind.userData.screen = { canvas: c, ctx: x, tex: t };
  g.add(ind);
  g.userData.indicator = ind;
  return shadow(g);
}

// Caseta pequeña de block aplanado con ventana, puerta, minisplit y escalones
function smallHouse(w, d, h, name) {
  const mat = M();
  const g = new THREE.Group();
  const wm = mats().wall;
  box(w + 0.3, 0.35, d + 0.3, mat.concrete, 0, 0, 0, { parent: g, r: 0.02 });
  box(w, h, d, wm, 0, 0.35, 0, { parent: g, r: 0.04, tile: 3 });
  // losa con volado y pretil
  box(w + 0.8, 0.22, d + 0.8, mat.concrete, 0, h + 0.35, 0, { parent: g, r: 0.03 });
  box(w + 0.8, 0.18, 0.12, wm, 0, h + 0.57, (d + 0.8) / 2 - 0.06, { parent: g, r: 0.02 });
  // franja verde institucional
  box(w + 0.02, 0.18, d + 0.02, mat.green, 0, h + 0.0, 0, { parent: g, r: 0.01 });
  // ventana grande al frente (+Z) y puerta lateral
  box(w * 0.6, 1.1, 0.08, mat.galv, -w * 0.1, 1.35, d / 2, { parent: g, r: 0.01 });
  const gl = box(w * 0.6 - 0.1, 1.0, 0.04, mat.glass, -w * 0.1, 1.4, d / 2 + 0.03, { parent: g, r: 0 });
  gl.material = mat.glass;
  box(0.08, 1.0, 0.06, mat.galv, -w * 0.1, 1.4, d / 2 + 0.06, { parent: g, r: 0 });
  box(0.95, 2.1, 0.06, mat.galv, w / 2 - 0.7, 0.35, d / 2 + 0.01, { parent: g, r: 0.01 });
  box(0.06, 0.06, 0.12, mat.black, w / 2 - 0.35, 1.35, d / 2 + 0.06, { parent: g, r: 0 });
  box(1.3, 0.2, 0.9, mat.concrete, w / 2 - 0.7, 0, d / 2 + 0.6, { parent: g, r: 0.02 });
  box(1.5, 0.08, 1.0, mat.concrete, w / 2 - 0.7, 2.75, d / 2 + 0.5, { parent: g, r: 0.02 }); // marquesina
  // ventanas laterales y trasera con marco, vidrio y repisón
  const win = (ww, x, z, ry) => {
    const f = new THREE.Group();
    f.position.set(x, 0, z);
    f.rotation.y = ry;
    box(ww + 0.1, 1.05, 0.06, mat.galv, 0, 1.3, 0.02, { parent: f, r: 0.01 });
    const gl2 = box(ww - 0.04, 0.95, 0.03, mat.glass, 0, 1.35, 0.05, { parent: f, r: 0 });
    gl2.material = mat.glass;
    box(0.04, 0.95, 0.04, mat.galv, 0, 1.35, 0.07, { parent: f, r: 0 });
    box(ww + 0.25, 0.06, 0.14, mat.concrete, 0, 1.24, 0.07, { parent: f, r: 0.01 });
    g.add(f);
  };
  win(Math.min(1.4, d * 0.4), w / 2, 0, Math.PI / 2);
  win(Math.min(1.4, d * 0.4), -w / 2, 0, -Math.PI / 2);
  win(Math.min(1.6, w * 0.3), w * 0.15, -d / 2, Math.PI);
  // canalón y gárgolas del pretil
  for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) box(0.12, 0.08, 0.5, mat.galv, sx, h + 0.42, -d / 2 - 0.55, { parent: g, r: 0.01 });
  // minisplit y bajante
  box(0.85, 0.6, 0.32, mat.white, -w / 2 + 0.7, 0.4, -d / 2 - 0.2, { parent: g, r: 0.03 });
  cyl(0.04, 0.04, h + 0.4, mat.galv, w / 2 - 0.1, 0.2, -d / 2 - 0.08, { parent: g, seg: 8 });
  const lb = label([name], { w: Math.min(w * 0.7, 2.4), h: 0.35, bg: "#155b4e", fg: "#ffffff" });
  lb.position.set(0, h + 0.46, (d + 0.8) / 2 + 0.005);
  g.add(lb);
  return shadow(g);
}

// ---------- Estación de combustible: tanques horizontales en dique, bombas y despachador
function fuel() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "combustible";
  g.userData.info = "combustible";
  const { x, z } = SITE.combustible;
  g.position.set(x, 0, z);
  const dk = { w: 30, d: 13 };
  // dique de contención (losa y muros de concreto)
  box(dk.w, 0.2, dk.d, mat.concrete2, 0, 0, dk.d / 2 - 4, { parent: g, r: 0.02, tile: 3 });
  for (const s of [-1, 1]) {
    box(dk.w, 1.1, 0.25, mat.concrete, 0, 0, dk.d / 2 - 4 + (s * dk.d) / 2, { parent: g, r: 0.03, tile: 3 });
    box(0.25, 1.1, dk.d, mat.concrete, (s * dk.w) / 2, 0, dk.d / 2 - 4, { parent: g, r: 0.03, tile: 3 });
  }
  // tanques horizontales de diésel sobre silletas
  for (const k of [-1, 1]) {
    const tz = 2.5 + 0;
    const tx = k * 7.5;
    const tg = new THREE.Group();
    tg.position.set(tx, 0, tz);
    const shell = cyl(1.6, 1.6, 11, mats().tank, 0, 2.3, 0, { rz: Math.PI / 2, seg: 36, parent: tg });
    shell.position.y = 2.3;
    for (const e of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats().tank);
      cap.scale.set(1, 0.35, 1);
      cap.rotation.z = (-e * Math.PI) / 2;
      cap.position.set(e * 5.5, 2.3, 0);
      tg.add(cap);
      box(0.6, 1.0, 2.6, mat.concrete, e * 3.8, 0.2, 0, { parent: tg, r: 0.03 });
    }
    // bocas, venteo, escalerilla y rótulo
    cyl(0.3, 0.3, 0.3, mat.galv, 1.5, 3.85, 0, { parent: tg });
    cyl(0.05, 0.05, 1.4, mat.galv, -2.5, 3.85, 0, { parent: tg, seg: 8 });
    cyl(0.1, 0.1, 0.12, mat.galv, -2.5, 5.25, 0, { parent: tg, seg: 8 });
    const lb = label(["DIÉSEL", "60 000 L"], { w: 2.6, h: 0.9, fg: "#155b4e" });
    lb.position.set(0, 2.4, -1.61);
    lb.rotation.y = Math.PI;
    tg.add(lb);
    const nfpa = nfpaDiamond();
    nfpa.position.set(-3.6, 2.6, -1.62);
    nfpa.rotation.y = Math.PI;
    tg.add(nfpa);
    g.add(tg);
  }
  // patín de bombas y tubería hacia la isla de despacho
  box(3.0, 0.25, 1.6, mat.concrete, 0, 0.2, -3.0, { parent: g, r: 0.02 });
  for (const k of [-0.6, 0.6]) {
    cyl(0.25, 0.25, 0.7, mat.green, k, 0.85, -3.0, { parent: g, rz: Math.PI / 2 });
    box(0.5, 0.45, 0.45, mat.green, k + 0.55, 0.45, -3.0, { parent: g, r: 0.03 });
  }
  g.add(pipe([[0, 1.0, -2.3], [0, 1.0, -4.3], [0, 1.4, -4.3], [0, 1.4, -6.0], [-2, 1.4, -6.0], [-2, 0.9, -6.0], [-2, 0.9, -8.1]], 0.06, mat.galv));
  g.add(pipe([[-4, 2.3, 2.5], [-4, 1.0, 1.2], [-4, 1.0, -2.0], [-0.6, 1.0, -2.3]], 0.07, mat.galv));
  g.add(pipe([[4, 2.3, 2.5], [4, 1.0, 1.2], [4, 1.0, -2.0], [0.6, 1.0, -2.3]], 0.07, mat.galv));
  // isla de despacho junto a la vía de servicios
  const isl = new THREE.Group();
  isl.position.set(-2, 0, -8.5);
  box(8, 0.2, 1.4, mat.concrete, 0, 0, 0, { parent: isl, r: 0.04 });
  box(7.8, 0.06, 0.08, mat.yellow, 0, 0.2, 0.68, { parent: isl, r: 0 });
  box(1.0, 1.7, 0.6, mat.white, 0, 0.2, 0, { parent: isl, r: 0.04 });
  box(1.02, 0.25, 0.62, mat.green, 0, 1.75, 0, { parent: isl, r: 0.03 });
  const scr = label(["0 L"], { w: 0.5, h: 0.2, bg: "#0c1410", fg: "#7dffb0" });
  scr.position.set(0, 1.35, -0.305);
  scr.rotation.y = Math.PI;
  isl.add(scr);
  // carrete y manguera con pistola
  cyl(0.35, 0.35, 0.3, mat.red, 1.1, 1.0, 0, { parent: isl, rx: Math.PI / 2 });
  isl.add(pipe([[1.1, 1.0, -0.2], [1.3, 0.5, -0.8], [1.2, 0.25, -1.5], [0.6, 0.35, -1.9], [0.4, 0.9, -0.45]], 0.025, mat.black));
  box(0.12, 0.2, 0.3, mat.darkSteel, 0.4, 0.95, -0.4, { parent: isl, r: 0.02 });
  // protecciones
  for (const px of [-3.6, 3.6]) cyl(0.11, 0.11, 1.0, mat.yellow, px, 0.2, 0, { parent: isl, seg: 12 });
  g.add(isl);
  const s1 = signOnPost("prohibicion", "PROHIBIDO\nFUMAR");
  s1.position.set(-6, 0, -6.5);
  s1.rotation.y = Math.PI;
  g.add(s1);
  const s2 = signOnPost("precaucion", "PELIGRO\nINFLAMABLE");
  s2.position.set(6, 0, -6.5);
  s2.rotation.y = Math.PI;
  g.add(s2);
  const ex = extinguisher();
  ex.position.set(3.2, 0, -7.6);
  g.add(ex);
  // escalera para cruzar el muro del dique
  const st = stairs(0.8, 1.1);
  st.position.set(-dk.w / 2 + 2, 0, -4.4);
  st.rotation.y = Math.PI / 2;
  g.add(st);
  return shadow(g);
}

function nfpaDiamond() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.translate(128, 128);
  x.rotate(Math.PI / 4);
  const q = [["#1f5fbf", -90, 0], ["#d22", -90, -90], ["#f2d000", 0, -90], ["#fff", 0, 0]];
  for (const [col, a, b] of q) {
    x.fillStyle = col;
    x.fillRect(a, b, 90, 90);
  }
  x.strokeStyle = "#111";
  x.lineWidth = 5;
  x.strokeRect(-90, -90, 180, 180);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = "#111";
  x.font = "bold 46px Arial";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("2", 128, 64);
  x.fillText("1", 64, 128);
  x.fillText("0", 192, 128);
  const t = TX.tex(c);
  return new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), std({ map: t, transparent: true, alphaTest: 0.3, roughness: 0.6 }));
}

// ---------- Arenero: tolva elevada con brazo y manguera sobre la vía de servicios
function sandTower() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "arenero";
  g.userData.info = "arenero";
  const { x, z } = SITE.arenero;
  g.position.set(x, 0, z + 3.5);
  const legs = [];
  for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    box(0.8, 0.4, 0.8, mat.concrete, a, -0.1, b, { parent: g, r: 0.03 });
    legs.push([[a, 0.3, b], [a * 0.9, 7.2, b * 0.9]]);
  }
  g.add(rodsMesh(legs, 0.1, mat.galv, 10));
  const braces = [];
  const at = (sx, sz, y) => {
    const k = 1.5 - (0.15 * (y - 0.3)) / 6.9;
    return [sx * k, y, sz * k];
  };
  for (let i = 0; i < 3; i++) {
    const y0 = 0.9 + i * 2.1;
    const y1 = y0 + 2.1;
    for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      braces.push([at(a, b, i % 2 ? y0 : y1), at(c, d, i % 2 ? y1 : y0)]);
      braces.push([at(a, b, y1), at(c, d, y1)]);
    }
  }
  g.add(rodsMesh(braces, 0.04, mat.galv, 6));
  // tolva cilíndrica con fondo cónico
  cyl(1.7, 1.7, 3.6, mats().tank, 0, 8.4, 0, { parent: g, seg: 32 });
  cyl(1.7, 0.25, 1.5, mats().tank, 0, 6.9, 0, { parent: g, seg: 32 });
  cyl(1.75, 1.75, 0.15, mat.galv, 0, 12.0, 0, { parent: g, seg: 32 });
  g.add(railing(Array.from({ length: 17 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2) * 1.75, 12.15, Math.sin((i / 16) * Math.PI * 2) * 1.75]), { mat: mat.yellow, post: 1.2, toe: false }));
  const lad = ladder(11.9);
  lad.position.set(-1.9, 0.3, 0);
  g.add(lad);
  // brazo de entrega hacia la vía
  g.add(pipe([[0, 6.9, 0], [0, 6.3, -0.6], [0, 6.0, -2.5]], 0.12, mat.galv));
  g.add(rod([0, 6.0, -2.5], [0, 6.0, -3.6], 0.14, mat.galv));
  g.add(pipe([[0, 6.0, -3.6], [0.1, 5.4, -3.6], [0.25, 4.6, -3.4], [0.2, 4.0, -3.5]], 0.08, mat.black));
  const lb = label(["ARENERO"], { w: 2.4, h: 0.5, fg: "#155b4e" });
  lb.position.set(0, 9.5, -1.705);
  lb.rotation.y = Math.PI;
  g.add(lb);
  return shadow(g);
}

// ---------- Fosa de inspección en la vía de servicios
function pit() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "fosa";
  g.userData.info = "fosa";
  const F = SITE.fosa;
  const z = YARD.servicios.z;
  const top = RAIL_TOP - 0.198;
  const half = 0.62;
  g.position.set(F.x, 0, z);
  // muros y piso de la fosa (los rieles corren sobre los muros)
  for (const s of [-1, 1]) box(F.len + 0.6, top + 1.5, 0.45, mat.concrete2, 0, -1.5, s * (half + 0.225), { parent: g, r: 0.02, tile: 3 });
  box(F.len + 0.6, 0.1, 2 * half + 0.9, mat.concrete, 0, -1.6, 0, { parent: g, r: 0, tile: 3 });
  for (const s of [-1, 1]) box(0.3, top + 1.5, 2 * half, mat.concrete2, (s * (F.len + 0.3)) / 2, -1.5, 0, { parent: g, r: 0.02 });
  // andenes laterales de concreto con franja amarilla
  for (const s of [-1, 1]) {
    box(F.len + 4, top, 2.2, mat.concrete, 0, 0, s * (half + 0.45 + 1.1), { parent: g, r: 0.03, tile: 3 });
    box(F.len + 4, 0.012, 0.12, mat.yellow, 0, top, s * (half + 0.7), { parent: g, r: 0 });
  }
  // escalones al fondo y luminarias en los muros
  for (let i = 0; i < 7; i++) box(0.3, 0.22, 2 * half - 0.05, mat.concrete, -F.len / 2 + 0.3 + i * 0.3, -1.5 + i * 0.22, 0, { parent: g, r: 0.01 });
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) box(0.5, 0.12, 0.06, mat.white, i * 4, -0.7, s * (half - 0.02), { parent: g, r: 0.02 });
  const sg = signOnPost("precaucion", "FOSA DE\nINSPECCIÓN");
  sg.position.set(-F.len / 2 - 2.5, 0, 2.6);
  g.add(sg);
  return shadow(g);
}

// ---------- Llenadera: plataforma elevada techada con 11 posiciones y brazos articulados
function loadingRack() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "llenadera";
  g.userData.info = "llenadera";
  const L = SITE.llenadera;
  const zt = L.z;
  const len = L.x1 - L.x0;
  const deck = RAIL_TOP + 4.25; // a la altura del pasillo superior del carro
  const zp0 = zt - 2.3; // orilla de la plataforma del lado de la vía
  const pw = 2.6;
  const zc = zp0 - pw / 2;
  const cols = [];
  for (let x = L.x0; x <= L.x1 + 0.01; x += 6) {
    for (const zz of [zp0 - 0.25, zp0 - pw + 0.25]) cols.push([x, zz]);
  }
  // columnas, zapatas y vigas
  const colGeo = [];
  const footGeo = [];
  for (const [x, z] of cols) {
    const h = z === zp0 - pw + 0.25 ? 10.4 : deck;
    const c = new THREE.BoxGeometry(0.3, h, 0.3);
    c.translate(x, h / 2, z);
    colGeo.push(c);
    const f = new THREE.BoxGeometry(0.8, 0.3, 0.8);
    f.translate(x, 0.05, z);
    footGeo.push(f);
  }
  g.add(shadow(new THREE.Mesh(mergeGeometries(colGeo), mat.structure)));
  g.add(shadow(new THREE.Mesh(planarUV(mergeGeometries(footGeo)), mat.concrete)));
  box(len, 0.35, 0.22, mat.structure, (L.x0 + L.x1) / 2, deck - 0.4, zp0 - 0.25, { parent: g, r: 0.01 });
  box(len, 0.35, 0.22, mat.structure, (L.x0 + L.x1) / 2, deck - 0.4, zp0 - pw + 0.25, { parent: g, r: 0.01 });
  // piso de rejilla
  const deckM = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, pw), mats().grating);
  deckM.geometry = planarUV(deckM.geometry, 1);
  deckM.position.set((L.x0 + L.x1) / 2, deck, zc);
  g.add(shadow(deckM));
  // techo en voladizo sobre la vía (estructura y lámina)
  const roofY = 10.4;
  const trusses = [];
  for (let x = L.x0; x <= L.x1 + 0.01; x += 6) {
    trusses.push([[x, roofY, zp0 - pw - 0.6], [x, roofY + 0.3, zt + 3.6]]);
    trusses.push([[x, roofY - 1.6, zp0 - pw + 0.25], [x, roofY, zt - 0.5]]);
  }
  for (const zz of [zp0 - pw - 0.4, zt - 1.0, zt + 3.4]) trusses.push([[L.x0 - 1, roofY + 0.12, zz], [L.x1 + 1, roofY + 0.12, zz]]);
  g.add(rodsMesh(trusses, 0.1, mat.structure, 6));
  const rf = new THREE.Mesh(planarUV(new THREE.BoxGeometry(len + 3, 0.06, zt + 3.9 - (zp0 - pw - 0.8)), 3.2), mats().roof);
  rf.position.set((L.x0 + L.x1) / 2, roofY + 0.3, (zt + 3.9 + zp0 - pw - 0.8) / 2);
  rf.rotation.x = -0.03;
  g.add(shadow(rf));
  box(len + 3, 0.35, 0.05, mat.white, (L.x0 + L.x1) / 2, roofY + 0.1, zt + 3.9, { parent: g, r: 0 });
  // tubería cabezal de producto y de recuperación de vapores
  for (const [dy, r, m] of [[0.55, 0.11, mat.galv], [0.85, 0.08, mat.yellow]]) {
    const p = rod([L.x0 - 2, deck + dy, zp0 - pw + 0.45], [L.x1 + 2, deck + dy, zp0 - pw + 0.45], r, m, { seg: 12 });
    g.add(p);
  }
  // barandal posterior completo
  g.add(railing([[L.x0, deck, zp0 - pw + 0.04], [L.x1, deck, zp0 - pw + 0.04]], { mat: mat.yellow }));
  // posiciones: brazo articulado, pasarela abatible, válvula, número
  const step = len / L.posiciones;
  const arms = [];
  for (let i = 0; i < L.posiciones; i++) {
    const cx = L.x0 + step * (i + 0.5);
    // barandal frontal entre posiciones (con hueco para la pasarela)
    g.add(railing([[cx - step / 2 + 0.15, deck, zp0 - 0.04], [cx - 0.75, deck, zp0 - 0.04]], { mat: mat.yellow }));
    g.add(railing([[cx + 0.75, deck, zp0 - 0.04], [cx + step / 2 - 0.15, deck, zp0 - 0.04]], { mat: mat.yellow }));
    const gw = gangway();
    gw.position.set(cx, deck, zp0);
    g.add(gw);
    const arm = loadingArm();
    arm.position.set(cx + 2.2, deck, zp0 - 0.6);
    g.add(arm);
    arms.push({ arm, gangway: gw, x: cx });
    // válvula con volante rojo y medidor
    g.add(rod([cx + 2.2, deck + 0.55, zp0 - pw + 0.45], [cx + 2.2, deck + 0.55, zp0 - 0.9], 0.07, mat.galv));
    cyl(0.18, 0.18, 0.04, mat.red, cx + 2.2, deck + 1.05, zp0 - 1.6, { parent: g, rx: Math.PI / 2 });
    box(0.5, 0.6, 0.35, mat.white, cx + 3.3, deck, zp0 - pw + 0.5, { parent: g, r: 0.03 });
    // carrete de tierra física
    cyl(0.18, 0.18, 0.12, mat.yellow, cx - 1.6, deck + 1.0, zp0 - 0.2, { parent: g, rx: Math.PI / 2 });
    const num = label([`${i + 1}`], { w: 0.7, h: 0.7, bg: "#155b4e", fg: "#ffffff", border: true, px: 128 });
    num.position.set(cx, roofY - 0.9, zp0 + 0.02);
    g.add(num);
    g.add(rod([cx - 0.3, roofY - 0.55, zp0], [cx - 0.3, roofY - 0.1, zp0], 0.012, mat.galv));
    g.add(rod([cx + 0.3, roofY - 0.55, zp0], [cx + 0.3, roofY - 0.1, zp0], 0.012, mat.galv));
    // luminaria bajo techo
    box(1.2, 0.12, 0.35, mat.white, cx, roofY - 0.35, zt - 0.5, { parent: g, r: 0.02 });
  }
  // escaleras en extremos y al centro
  for (const [sx, dir] of [[L.x0 - 0.4, -1], [L.x1 + 0.4, 1], [(L.x0 + L.x1) / 2 + step / 2 - 0.4, 1]]) {
    const st = stairs(1.1, deck);
    const run = deck / Math.tan((38 * Math.PI) / 180);
    st.position.set(sx + dir * run, 0, zc - 0.5);
    st.rotation.y = dir > 0 ? Math.PI : 0;
    g.add(st);
    box(1.6, 0.05, pw, mats().grating, sx + dir * 0.3, deck - 0.05, zc, { parent: g, r: 0 }).material = mats().grating;
  }
  // rótulo y seguridad
  const lb = label(["LLENADERA DE CARROS-TANQUE"], { w: 12, h: 0.9, bg: "#155b4e", fg: "#ffffff" });
  lb.position.set((L.x0 + L.x1) / 2, roofY - 0.3, zt + 3.93);
  g.add(lb);
  for (const [px, pz, kind] of [[L.x0 - 6, zt - 5.5, "ducha"], [L.x1 + 6, zt - 5.5, "ducha"], [L.x0 + 60, zt - 6.5, "ext"], [L.x0 + 140, zt - 6.5, "ext"], [L.x0 - 6, zt - 8.5, "ext"], [L.x1 + 6, zt - 8.5, "ext"]]) {
    const o = kind === "ducha" ? shower() : extinguisher();
    o.position.set(px, 0, pz);
    g.add(o);
  }
  for (const [px, k, t] of [[L.x0 - 3, "obligacion", "USO OBLIGATORIO\nDE EPP"], [L.x0 - 5, "prohibicion", "PROHIBIDO\nFUMAR"], [L.x1 + 3, "precaucion", "PELIGRO\nINFLAMABLE"], [L.x1 + 5, "obligacion", "CONECTE\nTIERRA FÍSICA"]]) {
    const s = signOnPost(k, t);
    s.position.set(px, 0, zt - 4.0);
    g.add(s);
  }
  g.userData.arms = arms;
  return shadow(g);
}

// Pasarela abatible amarilla (guardada en vertical; gira hacia la vía)
function gangway() {
  const mat = M();
  const g = new THREE.Group();
  const p = new THREE.Group();
  box(1.2, 0.05, 1.9, mats().grating, 0, 0, 0.95, { parent: p, r: 0 }).material = mats().grating;
  for (const s of [-1, 1]) {
    box(0.06, 0.12, 1.9, mat.yellow, s * 0.6, 0, 0.95, { parent: p, r: 0.01 });
    p.add(rodsMesh([[[s * 0.6, 0.1, 0.1], [s * 0.6, 1.0, 0.4]], [[s * 0.6, 1.0, 0.4], [s * 0.6, 1.0, 1.75]], [[s * 0.6, 1.0, 1.75], [s * 0.6, 0.1, 1.85]]], 0.022, mat.yellow));
  }
  p.rotation.x = -Math.PI / 2 + 0.12; // guardada
  g.add(p);
  // contrapeso y bisagra
  cyl(0.06, 0.06, 1.3, mat.darkSteel, 0, 0.04, -0.02, { parent: g, rz: Math.PI / 2 });
  g.userData.plate = p;
  g.userData.setDown = (f) => (p.rotation.x = (-Math.PI / 2 + 0.12) * (1 - f) + 0.2 * f);
  return shadow(g);
}

// Brazo de llenado por domo: torreta giratoria, brazo interior, codo, brazo exterior y tubo de descenso
function loadingArm() {
  const mat = M();
  const alu = mats().alu;
  const g = new THREE.Group();
  cyl(0.16, 0.2, 1.4, mat.galv, 0, 0, 0, { parent: g, seg: 14 });
  const yaw = new THREE.Group();
  yaw.position.y = 1.5;
  g.add(yaw);
  cyl(0.14, 0.14, 0.3, mat.darkSteel, 0, -0.15, 0, { parent: yaw, seg: 14 });
  const inner = new THREE.Group();
  yaw.add(inner);
  inner.add(rod([0, 0, 0], [2.6, 0, 0], 0.075, alu, { seg: 12 }));
  // resorte/contrapeso
  inner.add(rod([-0.2, 0.05, 0], [-0.9, 0.05, 0], 0.04, mat.darkSteel));
  cyl(0.2, 0.2, 0.45, mat.yellow, -1.0, 0.05, 0, { parent: inner, rz: Math.PI / 2 });
  const elbow = new THREE.Group();
  elbow.position.x = 2.6;
  inner.add(elbow);
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), alu);
  elbow.add(sph);
  const outer = new THREE.Group();
  elbow.add(outer);
  outer.add(rod([0, 0, 0], [2.3, 0, 0], 0.07, alu, { seg: 12 }));
  const drop = new THREE.Group();
  drop.position.x = 2.3;
  outer.add(drop);
  drop.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), alu));
  drop.add(rod([0, 0, 0], [0, -2.0, 0], 0.06, alu, { seg: 12 }));
  cyl(0.2, 0.22, 0.25, mat.darkSteel, 0, -1.2, 0, { parent: drop, seg: 16 }); // cono de sello
  // pose guardada: plegado sobre la plataforma
  const pose = (a) => {
    // a.yaw (rad, 0 = paralelo a la vía), a.in (elevación brazo interior), a.out (rel.)
    yaw.rotation.y = a.yaw;
    inner.rotation.z = a.in;
    outer.rotation.z = a.out;
    drop.rotation.z = -(a.in + a.out);
  };
  // guardado: brazo interior paralelo a la plataforma, exterior plegado hacia abajo
  pose({ yaw: Math.PI, in: 0.12, out: -1.45 });
  g.userData.pose = pose;
  return shadow(g);
}

// ---------- Caseta del jefe de patio
function booth() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "caseta";
  g.userData.info = "caseta";
  const { x, z } = SITE.casetaJefe;
  g.position.set(x, 0, z);
  const h = smallHouse(7.2, 4.6, 3.0, "JEFE DE PATIO");
  h.rotation.y = Math.PI; // ventana grande hacia la vía (norte)
  g.add(h);
  // mástil de radio
  g.add(rodsMesh([[[2.8, 3.5, 1.6], [2.8, 12, 1.6]], [[2.8, 12, 1.6], [2.8, 13.2, 1.6], 0.012]], 0.04, mat.galv));
  // estacionamiento con topes y una camioneta de servicio no (fase posterior)
  for (let i = 0; i < 4; i++) box(1.6, 0.15, 0.25, mat.yellow, -4 + i * 2.8, 0, 6.5, { parent: g, r: 0.03 });
  const ex = extinguisher();
  ex.position.set(4.6, 0, -1.8);
  g.add(ex);
  const s = signOnPost("obligacion", "USO OBLIGATORIO\nDE EPP");
  s.position.set(-5, 0, -3.5);
  s.rotation.y = Math.PI;
  g.add(s);
  return shadow(g);
}

// ---------- Bodega blanca con techo verde a dos aguas
function warehouse() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "bodega";
  g.userData.info = "bodega";
  const { x, z } = SITE.bodega;
  g.position.set(x, 0, z);
  const w = 42;
  const d = 20;
  const h = 8;
  const pitch = 0.27;
  box(w + 1, 0.3, d + 1, mat.concrete, 0, 0, 0, { parent: g, r: 0.03, tile: 3 });
  const walls = box(w, h, d, mats().sheet, 0, 0.3, 0, { parent: g, r: 0.05, tile: 4 });
  walls.material = mats().sheet;
  // frontones (hastiales) de lámina
  const gable = new THREE.Shape();
  gable.moveTo(-d / 2, 0);
  gable.lineTo(d / 2, 0);
  gable.lineTo(0, (d / 2) * Math.tan(pitch));
  gable.closePath();
  for (const s of [-1, 1]) {
    const gg = new THREE.ExtrudeGeometry(gable, { depth: 0.2, bevelEnabled: false });
    gg.rotateY(Math.PI / 2);
    planarUV(gg, 4);
    const gm = new THREE.Mesh(gg, mats().sheet);
    gm.position.set(s * (w / 2) - 0.1, h + 0.3, 0);
    g.add(gm);
  }
  // techo verde acanalado con aleros
  const rl = d / 2 / Math.cos(pitch) + 0.8;
  for (const s of [-1, 1]) {
    const geo = planarUV(new THREE.BoxGeometry(w + 1.6, 0.08, rl), 3.2);
    const r = new THREE.Mesh(geo, mats().roof);
    r.position.set(0, h + 0.3 + (d / 4) * Math.tan(pitch) + 0.05, (s * d) / 4 + s * 0.35);
    r.rotation.x = s * pitch;
    g.add(r);
  }
  // cumbrera, canalones y bajantes
  box(w + 1.6, 0.18, 0.5, mat.green, 0, h + 0.3 + (d / 2) * Math.tan(pitch) - 0.04, 0, { parent: g, r: 0.04 });
  for (const s of [-1, 1]) {
    box(w + 1.6, 0.2, 0.22, mat.white, 0, h + 0.05, s * (d / 2 + 0.9), { parent: g, r: 0.03 });
    for (const px of [-w / 2 + 0.4, 0, w / 2 - 0.4]) cyl(0.07, 0.07, h + 0.2, mat.white, px, 0, s * (d / 2 + 0.12), { parent: g, seg: 8 });
  }
  // cortinas metálicas hacia el patio (norte, -Z) y puerta de personal
  for (const px of [-10, 6]) {
    const c = box(5, 5.2, 0.12, mats().doorRoll, px, 0.3, -d / 2 - 0.02, { parent: g, r: 0.01, tile: 1.2 });
    c.material = mats().doorRoll;
    box(5.6, 0.6, 0.6, mat.galv, px, 5.5, -d / 2 - 0.25, { parent: g, r: 0.05 });
    for (const s of [-1, 1]) box(0.25, 1.0, 0.25, mat.yellow, px + s * 2.8, 0.3, -d / 2 - 0.3, { parent: g, r: 0.03 });
  }
  box(1.0, 2.2, 0.08, mat.galv, 15, 0.3, -d / 2 - 0.02, { parent: g, r: 0.01 });
  // ventilas altas
  for (let px = -18; px <= 18; px += 6) box(1.8, 0.6, 0.06, mat.galv, px, 6.0, -d / 2 - 0.02, { parent: g, r: 0.01 });
  const lb = label(["ALMACÉN GENERAL"], { w: 9, h: 1.0, fg: "#155b4e" });
  lb.position.set(-2, 7.55, -d / 2 - 0.04);
  lb.rotation.y = Math.PI;
  g.add(lb);
  const ex = extinguisher();
  ex.position.set(13.5, 0.3, -d / 2 - 0.6);
  ex.rotation.y = Math.PI;
  g.add(ex);
  return shadow(g);
}

// ---------- Torre de iluminación de celosía
let towerGeo;
function lightTower(x, z) {
  const mat = M();
  if (!towerGeo) {
    const H = 30;
    const list = [];
    const legs = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2);
    const at = (a, y) => {
      const r = 1.3 - (y / H) * 0.85;
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    };
    for (const a of legs) list.push([at(a, 0), at(a, H), 0.07]);
    for (let y = 0; y < H; y += 1.5)
      for (let k = 0; k < 3; k++) {
        const a = legs[k];
        const b = legs[(k + 1) % 3];
        list.push([at(a, y), at(b, y + 1.5), 0.025]);
        list.push([at(a, y + 1.5), at(b, y + 1.5), 0.025]);
      }
    const geos = list.map(([a, b, r]) => rod(a, b, r, null, { seg: 5 }));
    // corona de reflectores
    const ring = new THREE.BoxGeometry(3.6, 0.12, 1.2);
    ring.translate(0, H + 0.2, 0);
    geos.push(ring);
    towerGeo = { frame: mergeGeometries(geos) };
    const lamps = [];
    for (let i = 0; i < 8; i++) {
      const b = new THREE.BoxGeometry(0.55, 0.45, 0.25);
      b.rotateX(0.45);
      b.translate(-1.5 + (i % 4) * 1.0, H + 0.8 + Math.floor(i / 4) * 0.6, 0.45);
      lamps.push(b);
    }
    towerGeo.lamps = mergeGeometries(lamps);
  }
  const g = new THREE.Group();
  g.name = "torre";
  g.userData.info = "torre";
  g.position.set(x, 0, z);
  g.add(shadow(new THREE.Mesh(towerGeo.frame, mat.galv)));
  g.add(shadow(new THREE.Mesh(towerGeo.lamps, mat.darkSteel)));
  box(3.2, 0.5, 3.2, mat.concrete, 0, -0.2, 0, { parent: g, r: 0.04 });
  box(0.6, 1.2, 0.4, mat.galv, 1.8, 0, 0, { parent: g, r: 0.02 });
  const lad = ladder(29.5, { cage: true });
  lad.position.set(1.05, 0.3, 0);
  g.add(lad);
  // reflectores orientados al patio
  g.rotation.y = Math.atan2(-z, 0) > 0 ? 0 : Math.PI;
  return g;
}

// ---------- Cerca perimetral de malla ciclónica con alambre de púas
function fence() {
  const mat = M();
  const F = SITE.cerca;
  const g = new THREE.Group();
  g.name = "cerca";
  g.userData.info = "cerca";
  const link = TX.chainLink();
  const meshMat = std({ map: link, alphaTest: 0.35, side: THREE.DoubleSide, color: 0xc8ccc8, metalness: 0.6, roughness: 0.45, alphaToCoverage: true });
  const H = 2.1;
  const sides = [
    [[F.x0, F.z0], [F.x1, F.z0]],
    [[F.x1, F.z0], [F.x1, F.z1]],
    [[F.x1, F.z1], [F.x0, F.z1]],
    [[F.x0, F.z1], [F.x0, F.z0]],
  ];
  // huecos: vía principal en los extremos oriente y poniente; portón del acceso sur
  const gaps = [
    { x: F.x0, z: 0, r: 7 },
    { x: F.x1, z: 0, r: 7 },
    { x: -660, z: F.z1, r: 5 },
  ];
  const posts = [];
  const meshGeos = [];
  const wires = [];
  for (const [a, b] of sides) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    let runStart = null;
    const flush = (s0, s1) => {
      if (s1 - s0 < 0.5) return;
      const p0 = [a[0] + dir[0] * s0, a[1] + dir[1] * s0];
      const p1 = [a[0] + dir[0] * s1, a[1] + dir[1] * s1];
      const len = s1 - s0;
      const pg = new THREE.PlaneGeometry(len, H);
      const uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 0.5), uv.getY(i) * (H / 0.5));
      pg.rotateY(-Math.atan2(dir[1], dir[0]));
      pg.translate((p0[0] + p1[0]) / 2, H / 2 + 0.05, (p0[1] + p1[1]) / 2);
      meshGeos.push(pg);
      for (const dy of [H + 0.12, H + 0.27, H + 0.42]) wires.push([[p0[0], dy, p0[1]], [p1[0], dy, p1[1]], 0.005]);
      wires.push([[p0[0], H, p0[1]], [p1[0], H, p1[1]], 0.02]);
    };
    for (let s = 0; s <= L + 0.01; s += 3) {
      const p = [a[0] + dir[0] * s, a[1] + dir[1] * s];
      const inGap = gaps.some((gp) => Math.hypot(p[0] - gp.x, p[1] - gp.z) < gp.r);
      if (inGap) {
        if (runStart !== null) flush(runStart, s - 3);
        runStart = null;
        continue;
      }
      if (runStart === null) runStart = s;
      posts.push([p[0], p[1]]);
    }
    if (runStart !== null) flush(runStart, L);
  }
  const fm = new THREE.Mesh(mergeGeometries(meshGeos), meshMat);
  fm.receiveShadow = true;
  fm.castShadow = false;
  g.add(fm);
  g.add(rodsMesh(wires, 0.006, mat.galv, 4));
  const postGeo = [];
  for (const [x, z] of posts) {
    const pg = new THREE.CylinderGeometry(0.03, 0.03, H + 0.5, 6);
    pg.translate(x, (H + 0.5) / 2, z);
    postGeo.push(pg);
  }
  g.add(shadow(new THREE.Mesh(mergeGeometries(postGeo), mat.galv)));
  // portón abierto del acceso sur y caseta de vigilancia
  for (const s of [-1, 1]) {
    cyl(0.08, 0.08, 2.6, mat.galv, -660 + s * 5, 0, F.z1, { parent: g });
    const leaf = box(4.6, 1.9, 0.05, meshMat, -660 + s * 5 + 0.2 * s, 0.1, F.z1 + 2.3, { parent: g, r: 0 });
    leaf.rotation.y = s * 1.35;
    leaf.position.x = -660 + s * 5 - s * 0.4;
    leaf.material = meshMat;
  }
  const guard = smallHouse(3, 3, 2.6, "VIGILANCIA");
  guard.position.set(-650, 0, F.z1 + 7);
  g.add(guard);
  const sg = signOnPost("obligacion", "USO OBLIGATORIO\nDE EPP");
  sg.position.set(-667, 0, F.z1 + 4);
  g.add(sg);
  const sp = signOnPost("precaucion", "VELOCIDAD MÁXIMA\n10 km/h", 1.6);
  sp.position.set(-653, 0, F.z1 - 6);
  sp.rotation.y = Math.PI;
  g.add(sp);
  return g;
}

// ---------- Postes de concreto y línea de media tensión
function power() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "energia";
  g.userData.info = "postes";
  const poles = [];
  for (let x = -1000; x <= 1000; x += 50) poles.push([x, 81]);
  const feeder = [];
  for (let z = 1300; z >= 131; z -= 50) feeder.push([-655, z]);
  feeder.push([-655, 81]);
  const branch = [[-655, 81], [-655, 45], [-640, 36]];
  const H = 11.5;
  const geoP = [];
  const geoA = [];
  const geoI = [];
  const all = [...poles, ...feeder, ...branch.slice(1)];
  const uniq = new Map();
  for (const p of all) uniq.set(`${p[0]},${p[1]}`, p);
  for (const [x, z] of uniq.values()) {
    const y0 = heightAt(x, z);
    const p = new THREE.CylinderGeometry(0.11, 0.2, H, 8);
    p.translate(x, y0 + H / 2 - 1.0, z);
    geoP.push(p);
    const a = new THREE.BoxGeometry(0.1, 0.1, 2.4);
    a.translate(x, y0 + H - 1.6, z);
    geoA.push(a);
    for (const dz of [-1.05, 0, 1.05]) {
      const ins = new THREE.CylinderGeometry(0.05, 0.07, 0.25, 8);
      ins.translate(x, y0 + H - 1.4 + (dz === 0 ? 0.6 : 0), z + dz);
      geoI.push(ins);
    }
  }
  g.add(shadow(new THREE.Mesh(planarUV(mergeGeometries(geoP), 1), mat.concrete)));
  g.add(shadow(new THREE.Mesh(mergeGeometries(geoA), mat.galv)));
  g.add(shadow(new THREE.Mesh(mergeGeometries(geoI), std({ color: 0x8a6b4a, roughness: 0.3 }))));
  // conductores con catenaria
  const wires = [];
  const span = (A, B, dy, dz) => {
    const n = 10;
    const yA = heightAt(A[0], A[1]) + H - 1.25 + dy;
    const yB = heightAt(B[0], B[1]) + H - 1.25 + dy;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const sag = 0.012 * L;
    let prev = null;
    // desplazamiento lateral perpendicular al tramo
    const dir = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const nx = -dir[1];
    const nz = dir[0];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const p = [A[0] + (B[0] - A[0]) * f + nx * dz, yA + (yB - yA) * f - 4 * sag * f * (1 - f), A[1] + (B[1] - A[1]) * f + nz * dz];
      if (prev) wires.push([prev, p]);
      prev = p;
    }
  };
  const runLine = (list, alongX) => {
    for (let i = 1; i < list.length; i++)
      for (const [dy, dz] of [[0, -1.05], [0.6, 0], [0, 1.05]]) span(list[i - 1], list[i], dy, alongX ? dz : -dz);
  };
  runLine(poles, true);
  runLine(feeder, false);
  runLine(branch, false);
  const wm = rodsMesh(wires, 0.011, std({ color: 0x3a3c3e, metalness: 0.7, roughness: 0.5 }), 4);
  wm.castShadow = false;
  g.add(wm);
  // transformador en el poste frente a la caseta
  const tr = cyl(0.35, 0.35, 1.1, mat.galv, -640, H - 4.5, 36, { parent: g, seg: 14 });
  tr.castShadow = true;
  return g;
}

// ---------- Cruce a nivel del camino de acceso con la vía principal
function crossing() {
  const mat = M();
  const g = new THREE.Group();
  g.name = "cruce";
  const x = -660;
  const panelMat = std({ map: TX.concrete(31, [92, 92, 90]).map, roughness: 0.85 });
  box(7.5, 0.04, RC * 2 - 0.12, panelMat, x, RAIL_TOP - 0.03, 0, { parent: g, r: 0.01, tile: 2 }).material = panelMat;
  for (const s of [-1, 1]) box(7.5, 0.04, 0.9, panelMat, x, RAIL_TOP - 0.03, s * (RC + 0.52), { parent: g, r: 0.01 }).material = panelMat;
  for (const s of [-1, 1]) box(7.5, RAIL_TOP - 0.02, 3.0, mat.concrete2, x, 0, s * 3.4, { parent: g, r: 0.3 });
  // crucetas
  for (const [px, pz, ry] of [[x - 5, 6.5, 0], [x + 5, -6.5, Math.PI]]) {
    const cr = new THREE.Group();
    cr.position.set(px, 0, pz);
    cr.rotation.y = ry;
    cyl(0.05, 0.05, 3.6, mat.galv, 0, 0, 0, { parent: cr, seg: 8 });
    for (const a of [0.6, -0.6]) {
      const b = label(["CRUCE F.C."], { w: 2.0, h: 0.32, bg: "#ffffff", fg: "#111", border: true });
      b.position.set(0, 3.2, 0.06 + (a > 0 ? 0 : 0.01));
      b.rotation.z = a;
      cr.add(b);
    }
    const alto = label(["ALTO"], { w: 0.75, h: 0.75, bg: "#c4161c", fg: "#ffffff", px: 128 });
    alto.position.set(0, 2.1, 0.06);
    cr.add(alto);
    g.add(shadow(cr));
  }
  return g;
}

// Señalización dispersa en el patio
function safetyAround() {
  const g = new THREE.Group();
  const items = [
    ["precaucion", "VELOCIDAD MÁXIMA\nEN PATIO 10 km/h", -600, 5.0, -Math.PI / 2],
    ["precaucion", "CUIDADO\nEQUIPO EN MOVIMIENTO", -520, 18, 0],
    ["obligacion", "USO OBLIGATORIO\nDE EPP", -632, 40, 0],
    ["prohibicion", "PROHIBIDO CRUZAR\nENTRE CARROS", -300, -45, Math.PI],
    ["precaucion", "VELOCIDAD MÁXIMA\nBÁSCULA 5 km/h", -500, -2.6, -Math.PI / 2],
  ];
  for (const [k, t, x, z, ry] of items) {
    const s = signOnPost(k, t);
    s.position.set(x, 0, z);
    s.rotation.y = ry;
    g.add(s);
  }
  for (const [x, z] of [[-470, 12], [-120, 12], [-300, 32], [40, 30]]) {
    const e = extinguisher();
    e.position.set(x + 3, 0, z);
    g.add(e);
  }
  return g;
}
