// Equipo rodante: GE ES44AC (TMY 2002 / TMY 2008), carro-tanque DOT-117, furgón, góndola y tolva.
// Medidas reales en metros; origen de cada vehículo al centro, a la altura del hongo del riel;
// +X = extremo A / frente, +Z = costado derecho.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GAUGE } from "./layout.js";
import { M, std, dust } from "./materials.js";
import * as TX from "./textures.js";
import { planarUV } from "./kit.js";
import { PartSet, slotMaterial } from "./fleet.js";

const RC = GAUGE / 2 + 0.037;

// ---------- geometría auxiliar (devuelve BufferGeometry ya colocada)
const G = {
  box(w, h, d, x, y, z, { r = 0.02, tile = 1.5, ry = 0, rz = 0, rx = 0 } = {}) {
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)) : new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return planarUV(g, tile);
  },
  cylX(r, len, x, y, z, seg = 16, r2 = r) {
    const g = new THREE.CylinderGeometry(r, r2, len, seg);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return g;
  },
  cylY(r, h, x, y, z, seg = 16, r2 = r) {
    const g = new THREE.CylinderGeometry(r, r2, h, seg);
    g.translate(x, y + h / 2, z);
    return g;
  },
  cylZ(r, len, x, y, z, seg = 16) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    return g;
  },
  rod(a, b, r = 0.02, seg = 6) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
    g.translate(A.x, A.y, A.z);
    return g;
  },
  tube(pts, r, seg = 8, n = 0) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.2);
    return new THREE.TubeGeometry(c, n || pts.length * 6, r, seg, false);
  },
  // perfil (x, y) extruido en Z, centrado en z
  ext(pts, depth, z, { holes = [], bevel = 0.012 } = {}) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, z - depth / 2);
    return planarUV(g, 1);
  },
  // barandal: lista de puntos, postes cada 'post'
  rail(pts, h, post = 1.4, r = 0.019) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      out.push(G.rod([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], r));
      out.push(G.rod([a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], r * 0.85));
      const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(1, Math.round(L / post));
      for (let k = i > 1 ? 1 : 0; k <= n; k++) {
        const f = k / n;
        const x = a[0] + (b[0] - a[0]) * f;
        const z = a[2] + (b[2] - a[2]) * f;
        const y = a[1] + (b[1] - a[1]) * f;
        out.push(G.rod([x, y, z], [x, y + h, z], r));
      }
    }
    return out;
  },
  ladder(x, y0, y1, z, w = 0.42, axis = "x", step = 0.3, r = 0.016) {
    const out = [];
    const off = (d) => (axis === "x" ? [x + d, z] : [x, z + d]);
    for (const d of [-w / 2, w / 2]) {
      const [a, b] = off(d);
      out.push(G.rod([a, y0, b], [a, y1, b], r * 1.3));
    }
    for (let y = y0 + 0.15; y < y1; y += step) {
      const [a, b] = off(-w / 2);
      const [c, d] = off(w / 2);
      out.push(G.rod([a, y, b], [c, y, d], r));
    }
    return out;
  },
};
export { G };

// ---------- materiales del equipo
let MM;
function mats() {
  if (MM) return MM;
  const m = M();
  const pBlack = TX.paint("#17191a", { seed: 31, grime: 0.55 });
  const pBlue = TX.paint("#1f6479", { seed: 32, grime: 0.3 });
  const pRed = TX.paint("#6e2a20", { seed: 33, grime: 0.55 });
  const pGrey = TX.paint("#e2e1da", { seed: 34, grime: 0.55 });
  const pGold = TX.paint("#d8b450", { seed: 35, grime: 0.25 });
  MM = {
    tank: dust(std({ map: pBlack.map, roughnessMap: pBlack.rough, roughness: 0.75, metalness: 0.25 }), { height: 1.6, amount: 0.55 }),
    black: dust(std({ map: pBlack.map, roughnessMap: pBlack.rough, roughness: 0.85, metalness: 0.35 }), { height: 1.3, amount: 0.6 }),
    truck: dust(std({ map: TX.rust(12).map, roughnessMap: TX.rust(12).rough, normalMap: TX.rust(12).normal, roughness: 1, metalness: 0.45, color: 0x8a8580 }), { height: 1.1, amount: 0.65 }),
    wheel: dust(std({ map: TX.rust(13).map, roughness: 0.7, metalness: 0.6, color: 0x9a948c }), { height: 0.9, amount: 0.5 }),
    tread: std({ color: 0xb8bbbe, metalness: 1, roughness: 0.3 }),
    blue: dust(std({ map: pBlue.map, roughnessMap: pBlue.rough, roughness: 0.5, metalness: 0.12 }), { height: 1.4, amount: 0.45 }),
    gold: std({ map: pGold.map, roughness: 0.4, metalness: 0.35 }),
    oxide: dust(std({ map: pRed.map, roughnessMap: pRed.rough, roughness: 0.85, metalness: 0.2 }), { height: 1.4, amount: 0.55 }),
    grey: dust(std({ map: pGrey.map, roughnessMap: pGrey.rough, roughness: 0.8, metalness: 0.2 }), { height: 1.0, amount: 0.3 }),
    yellow: m.yellow,
    glass: std({ color: 0x18242a, roughness: 0.05, metalness: 0.7, envMapIntensity: 1.3 }),
    grating: std({ map: TX.grating(), alphaTest: 0.5, color: 0x6d6f70, metalness: 0.6, roughness: 0.6, side: THREE.DoubleSide, alphaToCoverage: true }),
    rubber: m.rubber,
    chrome: std({ color: 0xd8dadc, metalness: 1, roughness: 0.18 }),
    lamp: std({ color: 0xfff4dc, emissive: 0xfff1d0, emissiveIntensity: 1.6, roughness: 0.2 }),
    lampOff: std({ color: 0xdedcd2, roughness: 0.15, metalness: 0.2 }),
    redLens: std({ color: 0x8a0d0d, emissive: 0x6a0000, emissiveIntensity: 0.3, roughness: 0.2 }),
    ballastLoad: std({ map: TX.ballast().map, normalMap: TX.ballast().normal, roughness: 0.95 }),
    galv: m.galv,
    hand: dust(std({ map: TX.paint("#efefea", { seed: 36, grime: 0.3 }).map, roughness: 0.5, metalness: 0.1 }), { height: 1.2, amount: 0.35 }),
    reflect: std({ map: null, color: 0xf2c400, roughness: 0.3, metalness: 0, emissive: 0x2a2000, emissiveIntensity: 1 }),
  };
  return MM;
}

// ---------- ruedas y bogíes
function wheelset(R, { trackW = RC, journal = 0.97 } = {}) {
  const k = R / 0.457;
  const prof = [
    [0.1, 0.085],
    [0.1, -0.085],
    [0.17, -0.055],
    [0.39 * k, -0.045],
    [0.4 * k, -0.075],
    [R + 0.028, -0.07],
    [R + 0.031, -0.055],
    [R + 0.004, -0.036],
    [R, -0.025],
    [R - 0.006, 0.07],
    [R - 0.03, 0.072],
    [0.39 * k, 0.03],
    [0.17, 0.04],
    [0.1, 0.085],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const parts = { body: [], tread: [] };
  for (const s of [-1, 1]) {
    const w = new THREE.LatheGeometry(prof, 36);
    w.rotateX(s > 0 ? Math.PI / 2 : -Math.PI / 2);
    w.translate(0, 0, s * (trackW - 0.005));
    parts.body.push(w);
    // banda de rodadura pulida
    const t = new THREE.CylinderGeometry(R + 0.001, R - 0.004, 0.07, 36, 1, true);
    t.rotateX(Math.PI / 2);
    t.translate(0, 0, s * (trackW + 0.012));
    parts.tread.push(t);
    // tapa del rodamiento
    parts.body.push(G.cylZ(0.125, 0.2, 0, 0, s * journal, 16));
    parts.body.push(G.cylZ(0.09, 0.06, 0, 0, s * (journal + 0.12), 12));
  }
  parts.body.push(G.cylZ(0.085, 2 * journal, 0, 0, 0, 14));
  return parts;
}

function coilSpring(r, h, wire, turns) {
  const pts = [];
  const n = turns * 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, (i / n) * h, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 5, false);
}

// Bogíe de carga de tres piezas (ASF Ride Control) con resortes en la ventana del bastidor
function freightTruck(P, mm) {
  const sf = [
    [-1.34, 0.4],
    [-1.34, 0.6],
    [-1.06, 0.73],
    [-0.55, 0.87],
    [0.55, 0.87],
    [1.06, 0.73],
    [1.34, 0.6],
    [1.34, 0.4],
    [1.02, 0.35],
    [0.64, 0.4],
    [0.46, 0.22],
    [-0.46, 0.22],
    [-0.64, 0.4],
    [-1.02, 0.35],
  ];
  const win = [
    [-0.36, 0.34],
    [-0.36, 0.8],
    [0.36, 0.8],
    [0.36, 0.34],
  ];
  const holes = [
    [
      [-0.7, 0.55],
      [-0.48, 0.72],
      [-0.48, 0.55],
    ],
    [
      [0.7, 0.55],
      [0.48, 0.55],
      [0.48, 0.72],
    ],
  ];
  for (const s of [-1, 1]) {
    P.add("truck", mm.truck, G.ext(sf, 0.15, s * 1.0, { holes: [win, ...holes] }));
    // adaptadores de rodamiento
    for (const x of [-0.89, 0.89]) P.add("truck", mm.truck, G.box(0.3, 0.12, 0.2, x, 0.6, s * 0.97, { r: 0.02 }));
  }
  // travesaño (bolster) a través de las ventanas
  P.add("truck", mm.truck, G.box(0.42, 0.24, 2.3, 0, 0.72, 0, { r: 0.03 }));
  P.add("truck", mm.black, G.cylY(0.18, 0.05, 0, 0.84, 0, 18));
  // vigas de freno con zapatas
  for (const x of [-0.5, 0.5]) {
    P.add("truck", mm.truck, G.box(0.1, 0.1, 1.9, x, 0.44, 0, { r: 0.015 }));
    for (const s of [-1, 1]) P.add("truck", mm.black, G.box(0.08, 0.3, 0.12, x * 1.0 + Math.sign(x) * 0.0, 0.42, s * (RC + 0.0), { r: 0.01 }));
  }
  // resortes (se comprimen con la carga)
  const nest = [];
  for (const s of [-1, 1]) for (const dx of [-0.24, -0.12, 0, 0.12, 0.24]) {
    const c = coilSpring(0.05, 0.27, 0.014, 4);
    c.translate(dx, 0, s * 1.0);
    nest.push(c);
  }
  for (const c of nest) P.add("spring", mm.wheel, c);
}

// Bogíe GE HiAd de tres ejes con motores de tracción
function locoTruck(P, mm) {
  const L = 2.45;
  for (const s of [-1, 1]) {
    const pts = [
      [-L, 0.55],
      [-L, 1.05],
      [L, 1.05],
      [L, 0.55],
      [2.25, 0.55],
      [2.25, 0.82],
      [1.85, 0.82],
      [1.85, 0.55],
      [0.2, 0.55],
      [0.2, 0.82],
      [-0.2, 0.82],
      [-0.2, 0.55],
      [-1.85, 0.55],
      [-1.85, 0.82],
      [-2.25, 0.82],
      [-2.25, 0.55],
    ];
    P.add("truck", mm.black, G.ext(pts, 0.18, s * 1.2, { bevel: 0.02 }));
    for (const x of [-2.07, 0, 2.07]) {
      P.add("truck", mm.black, G.box(0.42, 0.34, 0.26, x, 0.42, s * 1.12, { r: 0.03 }));
      const sp = coilSpring(0.085, 0.2, 0.02, 3);
      sp.translate(x + 0.26, 0.82, s * 1.15);
      P.add("truck", mm.wheel, sp);
      const sp2 = coilSpring(0.085, 0.2, 0.02, 3);
      sp2.translate(x - 0.26, 0.82, s * 1.15);
      P.add("truck", mm.wheel, sp2);
    }
    // cilindros de freno y areneros
    for (const x of [-1.05, 1.05]) P.add("truck", mm.black, G.cylZ(0.11, 0.25, x, 0.78, s * 1.38, 14));
    for (const x of [-2.3, 2.3]) P.add("truck", mm.black, G.box(0.3, 0.35, 0.3, x, 1.02, s * 1.32, { r: 0.03 }));
    for (const x of [-2.4, 2.4]) P.add("truck", mm.black, G.rod([x, 0.95, s * 1.32], [x * 0.98, 0.15, s * RC], 0.02));
  }
  // travesaños y motores de tracción entre ruedas
  for (const x of [-1.04, 1.04]) P.add("truck", mm.black, G.box(0.35, 0.3, 2.2, x, 0.95, 0, { r: 0.03 }));
  for (const x of [-2.07, 0, 2.07]) P.add("truck", mm.black, G.cylZ(0.36, 1.05, x + (x >= 0 ? -0.62 : 0.62) * (x === 0 ? 1 : 1), 0.56, 0, 20));
}

// Enganche tipo E/F con cabeza de nudillo y palanca de desenganche
function coupler(P, mm, xEnd, dir, y = 0.876, attach = "body") {
  const x = xEnd;
  P.add(attach, mm.black, G.box(0.9, 0.2, 0.22, x - dir * 0.45, y, 0, { r: 0.02 }));
  P.add(attach, mm.black, G.box(0.28, 0.32, 0.36, x - dir * 0.05, y, 0, { r: 0.05 }));
  P.add(attach, mm.black, G.box(0.16, 0.26, 0.12, x + dir * 0.02, y, 0.16, { r: 0.04 }));
  P.add(attach, mm.black, G.rod([x - dir * 0.3, y + 0.32, -1.25], [x - dir * 0.3, y + 0.32, 0.3], 0.018));
  P.add(attach, mm.black, G.rod([x - dir * 0.3, y + 0.32, -1.25], [x - dir * 0.3, y + 0.1, -1.4], 0.018));
  // manguera de aire
  P.add(attach, mm.rubber, G.tube([[x - dir * 0.35, y - 0.05, -0.45], [x - dir * 0.15, y - 0.25, -0.4], [x + dir * 0.02, y - 0.38, -0.32]], 0.025));
}

// ---------- rótulos y placas
function canvasTex(w, h, fn, { srgb = true, bleedIt = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  fn(c.getContext("2d"), w, h);
  const t = bleedIt ? TX.bleed(c) : TX.tex(c, { srgb });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function reflectTexture() {
  return canvasTex(1024, 16, (g) => {
    g.clearRect(0, 0, 1024, 16);
    g.fillStyle = "#f2c400";
    for (let x = 6; x < 1024; x += 73) g.fillRect(x, 0, 30, 16);
  });
}

function placardTexture() {
  return canvasTex(256, 256, (g) => {
    g.translate(128, 128);
    g.rotate(Math.PI / 4);
    g.fillStyle = "#ffffff";
    g.fillRect(-88, -88, 176, 176);
    g.fillStyle = "#c4161c";
    g.fillRect(-82, -82, 164, 164);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // flama estilizada
    g.fillStyle = "#111";
    g.beginPath();
    g.moveTo(128, 34);
    g.bezierCurveTo(150, 70, 160, 90, 140, 108);
    g.bezierCurveTo(146, 92, 136, 84, 132, 80);
    g.bezierCurveTo(130, 96, 112, 100, 116, 112);
    g.bezierCurveTo(100, 100, 104, 70, 128, 34);
    g.fill();
    g.fillStyle = "#fff";
    g.fillRect(64, 112, 128, 34);
    g.fillStyle = "#111";
    g.font = "bold 32px Arial";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("1203", 128, 130);
    g.font = "bold 30px Arial";
    g.fillText("3", 128, 206);
  });
}

function tankLetteringTexture() {
  return canvasTex(2048, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#e9e7df";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "bold 150px Arial";
    g.fillText("TREN MAYA", w / 2, 150);
    g.font = "bold 34px Arial";
    g.textAlign = "left";
    g.fillText("DOT-117J100W", 60, 330);
    g.fillText("CAPACIDAD 113 562 L", 60, 380);
    g.fillText("GASOLINA · UN 1203", 60, 430);
    g.textAlign = "right";
    g.fillText("TARA 40 800 kg", w - 60, 330);
    g.fillText("CARGA MÁX. 88 200 kg", w - 60, 380);
    g.fillText("PRUEBA TANQUE 2024", w - 60, 430);
    // franja reflejante en orillas
    g.fillStyle = "#d8d0b0";
    for (const x of [8, w - 40]) for (let y = 260; y < 480; y += 60) g.fillRect(x, y, 30, 40);
  });
}

// Superficie cilíndrica parcial para rótulos sobre el tanque (eje X)
function cylPatch(R, yC, x0, x1, a0, a1, side, nA = 10) {
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const nx = 2;
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nA; j++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const a = a0 + ((a1 - a0) * j) / nA;
      const z = Math.cos(a) * R * side;
      const y = yC + Math.sin(a) * R;
      pos.push(x, y, z);
      nor.push(0, Math.sin(a), Math.cos(a) * side);
      uv.push(side > 0 ? i / nx : 1 - i / nx, j / nA);
    }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nA; j++) {
      const a = i * (nA + 1) + j;
      const b = a + nA + 1;
      if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
      else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function plane(w, h, x, y, z, ry = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

// ---------- DOT-117
export function tankCarType(atlas) {
  const mm = mats();
  placardMaterial();
  const P = new PartSet();
  const L = 18.2;
  const R = 1.52;
  const yC = 2.62;
  const barrel = 7.35;
  const head = 0.76;
  // tanque con cabezas semielípticas 2:1 (chaqueta exterior)
  const prof = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.sin(t) * R, -barrel - Math.cos(t) * head));
  }
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.cos(t) * R, barrel + Math.sin(t) * head));
  }
  prof[0].x = 0.001;
  prof[prof.length - 1].x = 0.001;
  const tank = new THREE.LatheGeometry(prof, 56);
  tank.rotateZ(-Math.PI / 2);
  tank.translate(0, yC, 0);
  P.add("body", mm.tank, planarUV(tank, 2));
  // juntas de la chaqueta y cinturones
  for (const x of [-5.2, -2.6, 2.6, 5.2]) P.add("body", mm.tank, G.cylX(R + 0.012, 0.05, x, yC, 0, 56));
  // escudos de cabeza (borde) y bases de vía
  for (const s of [-1, 1]) P.add("body", mm.tank, G.cylX(R + 0.02, 0.08, s * barrel, yC, 0, 56));
  // vigas de tope (stub sills), travesaños del cuerpo y silletas
  for (const s of [-1, 1]) {
    P.add("body", mm.black, G.box(2.6, 0.42, 0.62, s * (L / 2 - 1.55), 1.05, 0, { r: 0.03 }));
    P.add("body", mm.black, G.box(0.5, 0.32, 3.0, s * 7.0, 1.12, 0, { r: 0.03 }));
    P.add("body", mm.black, G.box(0.28, 0.5, 2.2, s * 7.0, 1.35, 0, { r: 0.03 }));
    // plataforma de extremo con barandal y escalones
    const xe = s * (L / 2 - 0.55);
    P.add("body", mm.grating, G.box(0.85, 0.04, 2.9, xe, 1.3, 0, { r: 0 }));
    P.add("body", mm.black, G.box(0.9, 0.1, 0.08, xe, 1.27, 1.42, { r: 0.01 }));
    P.add("body", mm.black, G.box(0.9, 0.1, 0.08, xe, 1.27, -1.42, { r: 0.01 }));
    for (const z of [-1.42, 1.42]) {
      for (const g of G.rail([[s * (L / 2 - 0.98), 1.32, z], [s * (L / 2 - 0.12), 1.32, z]], 1.0, 0.8)) P.add("body", mm.black, g);
      // estribo y agarradera de esquina
      P.add("body", mm.black, G.box(0.36, 0.03, 0.2, s * (L / 2 - 0.6), 0.45, z * 1.02, { r: 0 }));
      P.add("body", mm.black, G.rod([s * (L / 2 - 0.42), 0.45, z * 1.02], [s * (L / 2 - 0.42), 1.27, z * 1.02], 0.018));
      P.add("body", mm.black, G.rod([s * (L / 2 - 0.78), 0.45, z * 1.02], [s * (L / 2 - 0.78), 1.27, z * 1.02], 0.018));
    }
    for (const g of G.rail([[s * (L / 2 - 0.12), 1.32, -1.42], [s * (L / 2 - 0.12), 1.32, -0.5]], 1.0, 0.8)) P.add("body", mm.black, g);
    for (const g of G.rail([[s * (L / 2 - 0.12), 1.32, 0.5], [s * (L / 2 - 0.12), 1.32, 1.42]], 1.0, 0.8)) P.add("body", mm.black, g);
    coupler(P, mm, s * (L / 2), s);
    // placas en las cabezas
    P.add("body", mm.placard, plane(0.3, 0.3, s * (barrel + head + 0.005) - s * 0.3, yC - 0.4, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2));
  }
  // freno de mano en el extremo B
  P.add("body", mm.black, G.box(0.08, 1.4, 0.1, -(L / 2 - 0.25), 1.95, 0.9, { r: 0.01 }));
  const hw = new THREE.TorusGeometry(0.25, 0.022, 6, 24);
  hw.rotateY(Math.PI / 2);
  hw.translate(-(L / 2 - 0.2), 2.6, 0.9);
  P.add("body", mm.black, hw);
  // depósito de aire y válvula de control
  P.add("body", mm.black, G.cylX(0.25, 1.4, -4.8, 1.0, 0.75, 16));
  P.add("body", mm.black, G.box(0.4, 0.35, 0.3, -5.9, 1.0, 0.75, { r: 0.04 }));
  P.add("body", mm.black, G.rod([-L / 2 + 0.4, 0.95, -0.3], [L / 2 - 0.4, 0.95, -0.3], 0.02));
  // válvula de descarga inferior con protección
  P.add("body", mm.black, G.box(0.6, 0.3, 0.6, 0, yC - R - 0.1, 0, { r: 0.04 }));
  P.add("body", mm.black, G.cylY(0.11, 0.35, 0, yC - R - 0.5, 0, 12));
  P.add("body", mm.black, G.rod([0, yC - R - 0.35, 0], [0, yC - R - 0.35, 1.25], 0.025));
  // domo: caja protectora de accesorios y plataforma superior con barandal
  P.add("body", mm.tank, G.cylY(0.62, 0.48, 0, yC + R - 0.06, 0, 28));
  P.add("body", mm.tank, G.cylY(0.66, 0.06, 0, yC + R + 0.42, 0, 28));
  P.add("body", mm.grating, G.box(2.6, 0.04, 1.9, 0, yC + R + 0.02, 0, { r: 0 }));
  for (const g of G.rail([[-1.3, yC + R + 0.04, -0.95], [1.3, yC + R + 0.04, -0.95], [1.3, yC + R + 0.04, -0.35]], 1.0, 0.9)) P.add("body", mm.yellow, g);
  for (const g of G.rail([[1.3, yC + R + 0.04, 0.35], [1.3, yC + R + 0.04, 0.95], [-1.3, yC + R + 0.04, 0.95], [-1.3, yC + R + 0.04, 0.35]], 1.0, 0.9)) P.add("body", mm.yellow, g);
  for (const g of G.rail([[-1.3, yC + R + 0.04, -0.35], [-1.3, yC + R + 0.04, -0.95]], 1.0, 0.9)) P.add("body", mm.yellow, g);
  // escaleras laterales al centro
  for (const s of [-1, 1]) {
    for (const g of G.ladder(0.0, 1.0, yC + R + 0.04, s * (R + 0.12), 0.44, "x")) P.add("body", mm.yellow, g);
    P.add("body", mm.black, G.rod([-0.25, yC + 0.6, s * (R + 0.12)], [-0.25, yC + 0.6, s * (R - 0.05)], 0.02));
    P.add("body", mm.black, G.rod([0.25, yC + 0.6, s * (R + 0.12)], [0.25, yC + 0.6, s * (R - 0.05)], 0.02));
  }
  // rótulos comunes y placas UN 1203 en ambos costados
  mm.letters = mm.letters || std({ map: tankLetteringTexture(), alphaTest: 0.45, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [-1, 1]) {
    P.add("body", mm.letters, cylPatch(R + 0.008, yC, -5.0, 5.0, -0.6, 0.9, s), { cast: false });
    for (const x of [-6.2, 6.2]) P.add("body", mm.placard, plane(0.3, 0.3, x, yC + 0.1, s * (R + 0.012), s > 0 ? 0 : Math.PI));
  }
  // franjas reflejantes amarillas
  mm.reflectStripe = mm.reflectStripe || std({ map: reflectTexture(), alphaTest: 0.4, color: 0xffffff, roughness: 0.3, emissive: 0x3a2c00, emissiveMap: reflectTexture(), emissiveIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [-1, 1]) P.add("body", mm.reflectStripe, cylPatch(R + 0.009, yC, -7.0, 7.0, -0.9, -0.84, s, 1), { cast: false });
  // número económico individual (atlas)
  const num = slotMaterial(atlas, { color: 0xe9e7df });
  for (const s of [-1, 1]) P.add("body", num, cylPatch(R + 0.01, yC, s > 0 ? -6.8 : 2.8, s > 0 ? -2.8 : 6.8, -0.75, -0.35, s), { slot: true, cast: false });
  freightTruck(P, mm);
  const ws = wheelset(0.457);
  for (const g of ws.body) P.add("axle", mm.wheel, g);
  for (const g of ws.tread) P.add("axle", mm.tread, g);
  return { name: "DOT-117", info: "dot117", length: L, b: 7.0, axles: [-0.89, 0.89], wheelR: 0.457, sag: 0.035, springTravel: 0.13, springBase: 0.36, parts: P.parts() };
}

// ---------- GE ES44AC
function cabLogoTexture() {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = "#dcb858";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(128, 128, 112, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.arc(128, 128, 96, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#dcb858";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "bold 40px Arial";
    g.fillText("DEFENSA", 128, 120);
    g.font = "bold 19px Arial";
    g.fillText("TREN MAYA", 128, 162);
  });
}
function locoLiveryTexture() {
  // costado del cofre largo: franja dorada, letreros y juntas de puertas
  return canvasTex(4096, 640, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // juntas de puertas y rejillas
    g.strokeStyle = "rgba(5,20,25,0.85)";
    g.lineWidth = 3;
    const px = w / 16.5;
    for (let x = 1.2; x < 16.4; x += 1.25) {
      g.beginPath();
      g.moveTo(x * px, 40);
      g.lineTo(x * px, h - 30);
      g.stroke();
    }
    g.fillStyle = "rgba(6,22,28,0.9)";
    for (let x = 1.5; x < 5.0; x += 0.42) g.fillRect(x * px, 70, 0.28 * px, 120);
    for (let x = 11.6; x < 15.8; x += 0.3) g.fillRect(x * px, 60, 0.2 * px, 210);
    // franja dorada doble
    g.fillStyle = "#dcb858";
    g.fillRect(0, h * 0.58, w, h * 0.075);
    g.fillRect(0, h * 0.68, w, h * 0.018);
    // letreros
    g.fillStyle = "#f2efe6";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "bold 170px Arial";
    g.fillText("TREN MAYA", w * 0.47, h * 0.36);
    g.font = "italic bold 70px Georgia, serif";
    g.fillStyle = "#dcb858";
    g.fillText("TSÍIMIN K'ÁAK", w * 0.47, h * 0.84);
    // emblema institucional genérico
    const cx = w * 0.74;
    const cy = h * 0.36;
    g.strokeStyle = "#dcb858";
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, 120, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, 100, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#dcb858";
    g.font = "bold 38px Arial";
    g.fillText("DEFENSA", cx, cy + 4);
    g.font = "bold 20px Arial";
    g.fillText("TREN MAYA", cx, cy + 50);
  });
}

export function locoType(atlas) {
  const mm = mats();
  const P = new PartSet();
  const L = 22.3;
  const H = L / 2;
  const yD = 1.75; // cubierta (andador)
  // bastidor y cubierta
  P.add("body", mm.black, G.box(L - 0.5, 0.42, 3.05, 0, yD - 0.21, 0, { r: 0.03 }));
  P.add("body", mm.blue, G.box(L - 0.5, 0.06, 3.1, 0, yD, 0, { r: 0.01 }));
  // faldón con franja dorada
  for (const s of [-1, 1]) P.add("body", mm.gold, G.box(L - 0.6, 0.12, 0.02, 0, yD - 0.12, s * 1.535, { r: 0 }));
  // tanque de combustible entre bogíes con depósitos de aire
  P.add("body", mm.black, G.box(9.6, 1.05, 2.75, 0, 0.62, 0, { r: 0.2 }));
  P.add("body", mm.black, G.box(9.0, 0.05, 2.8, 0, 1.0, 0, { r: 0 }));
  for (const s of [-1, 1]) P.add("body", mm.black, G.cylX(0.23, 4.0, 2.6, 1.42, s * 1.25, 16));
  for (const s of [-1, 1]) P.add("body", mm.black, G.cylY(0.07, 0.15, -3.5, 1.2, s * 1.38, 10));
  // pilotos (ambos extremos) con quitapiedras, escalones y luces de cuneta
  for (const e of [-1, 1]) {
    const x = e * (H - 0.12);
    P.add("body", mm.black, G.box(0.25, 1.2, 3.05, x, yD - 0.6, 0, { r: 0.03 }));
    const plow = G.ext(
      [
        [0, 0],
        [0.35, 0],
        [0.0, 0.55],
        [-0.2, 0.55],
      ],
      2.6,
      0,
    );
    plow.rotateY(e > 0 ? 0 : Math.PI);
    plow.translate(x, 0.12, 0);
    P.add("body", mm.black, plow);
    P.add("body", mm.yellow, G.box(0.03, 0.12, 3.06, x + e * 0.14, yD - 0.15, 0, { r: 0 }));
    for (const s of [-1, 1]) {
      // escalones de esquina
      for (let k = 0; k < 3; k++) P.add("body", mm.grating, G.box(0.55, 0.03, 0.3, x - e * 0.55, 0.45 + k * 0.38, s * 1.38, { r: 0 }));
      P.add("body", mm.black, G.box(0.6, 1.25, 0.03, x - e * 0.55, 0.45, s * 1.54, { r: 0 }));
      P.add("body", mm.hand, G.rod([x - e * 0.25, 0.5, s * 1.56], [x - e * 0.25, yD + 1.0, s * 1.56], 0.02));
      P.add("body", mm.hand, G.rod([x - e * 0.85, 0.5, s * 1.56], [x - e * 0.85, yD + 1.0, s * 1.56], 0.02));
      // luces de cuneta
      P.add("body", mm.black, G.box(0.14, 0.18, 0.18, x + e * 0.05, yD + 0.05, s * 1.2, { r: 0.02 }));
      P.add("body", mm.lamp, G.cylX(0.065, 0.02, x + e * 0.13, yD + 0.05, s * 1.2, 16));
    }
    coupler(P, mm, e * H, e);
    // barandal transversal del extremo
    for (const g of G.rail([[x - e * 0.15, yD, -1.45], [x - e * 0.15, yD, -0.45]], 1.0, 0.8)) P.add("body", mm.hand, g);
    for (const g of G.rail([[x - e * 0.15, yD, 0.45], [x - e * 0.15, yD, 1.45]], 1.0, 0.8)) P.add("body", mm.hand, g);
  }
  // barandales del andador
  for (const s of [-1, 1]) for (const g of G.rail([[-H + 0.8, yD, s * 1.48], [5.9, yD, s * 1.48]], 1.0, 1.6)) P.add("body", mm.hand, g);
  // cabina (x 6.0 a 9.35) y nariz
  const cab0 = 6.0;
  const cab1 = 9.35;
  P.add("body", mm.blue, G.box(cab1 - cab0, 2.55, 3.05, (cab0 + cab1) / 2, yD + 1.28, 0, { r: 0.06 }));
  P.add("body", mm.blue, G.box(cab1 - cab0 + 0.1, 0.18, 3.1, (cab0 + cab1) / 2, 4.38, 0, { r: 0.08 }));
  // parabrisas inclinado
  const ws = G.box(0.08, 0.95, 2.7, cab1 + 0.05, 3.72, 0, { r: 0.02, rz: 0.22 });
  P.add("body", mm.blue, ws);
  for (const s of [-1, 1]) P.add("body", mm.glass, G.box(0.03, 0.8, 1.15, cab1 + 0.11, 3.73, s * 0.66, { r: 0.01, rz: 0.22 }));
  // ventanas laterales de cabina
  for (const s of [-1, 1]) {
    P.add("body", mm.glass, G.box(1.0, 0.75, 0.03, cab0 + 2.35, 3.65, s * 1.53, { r: 0.02 }));
    P.add("body", mm.glass, G.box(0.85, 0.75, 0.03, cab0 + 1.2, 3.65, s * 1.53, { r: 0.02 }));
    P.add("body", mm.black, G.box(1.95, 0.05, 0.05, cab0 + 1.8, 4.05, s * 1.54, { r: 0 }));
    // espejo/ visera y franja dorada de cabina
    P.add("body", mm.gold, G.box(cab1 - cab0, 0.16, 0.02, (cab0 + cab1) / 2, yD + 0.95, s * 1.535, { r: 0 }));
  }
  // nariz corta
  P.add("body", mm.blue, G.box(1.3, 1.3, 2.45, cab1 + 0.62, yD + 0.65, 0, { r: 0.1 }));
  P.add("body", mm.blue, G.box(1.1, 0.25, 2.3, cab1 + 0.5, yD + 1.38, 0, { r: 0.1, rz: -0.18 }));
  P.add("body", mm.gold, G.box(0.02, 0.16, 2.46, cab1 + 1.28, yD + 0.95, 0, { r: 0 }));
  // faros en la nariz y tablero de número
  for (const z of [-0.22, 0.22]) {
    P.add("body", mm.black, G.box(0.1, 0.25, 0.28, cab1 + 1.25, yD + 1.05, z, { r: 0.03 }));
    P.add("body", mm.lamp, G.cylX(0.09, 0.02, cab1 + 1.31, yD + 1.05, z, 18));
  }
  // cofre largo (x -10.55 a 5.95)
  const h0 = -H + 0.6;
  const h1 = 5.95;
  P.add("body", mm.blue, G.box(h1 - h0 - 5.2, 2.5, 2.45, (h0 + 5.2 + h1) / 2, yD + 1.25, 0, { r: 0.06 }));
  // sección de radiadores ensanchada (alas) atrás
  P.add("body", mm.blue, G.box(5.2, 1.5, 2.45, h0 + 2.6, yD + 0.75, 0, { r: 0.05 }));
  const wing = G.ext(
    [
      [-1.23, 0],
      [1.23, 0],
      [1.55, 0.55],
      [1.55, 1.1],
      [-1.55, 1.1],
      [-1.55, 0.55],
    ],
    5.2,
    0,
    { bevel: 0.02 },
  );
  wing.rotateY(Math.PI / 2);
  wing.translate(h0 + 2.6, yD + 1.5, 0);
  P.add("body", mm.blue, wing);
  // ventiladores del radiador
  for (const x of [h0 + 1.3, h0 + 3.9]) {
    P.add("body", mm.black, G.cylY(0.85, 0.06, x, yD + 2.62, 0, 32));
    for (let k = 0; k < 6; k++) P.add("body", mm.black, G.box(1.6, 0.03, 0.04, x, yD + 2.69, 0, { r: 0, ry: (k / 6) * Math.PI }));
  }
  // rejillas laterales del radiador
  for (const s of [-1, 1]) P.add("body", mm.black, G.box(4.6, 0.45, 0.03, h0 + 2.6, yD + 2.1, s * 1.56, { r: 0, rx: s * -0.52 }));
  // freno dinámico (rejilla elevada) y chimenea
  P.add("body", mm.blue, G.box(2.6, 0.35, 2.2, 4.4, yD + 2.6, 0, { r: 0.05 }));
  P.add("body", mm.black, G.box(2.3, 0.04, 1.9, 4.4, yD + 2.78, 0, { r: 0 }));
  P.add("body", mm.black, G.box(0.9, 0.35, 0.45, -1.2, yD + 2.6, 0, { r: 0.08 }));
  P.add("body", mm.black, G.box(0.75, 0.05, 0.32, -1.2, yD + 2.93, 0, { r: 0.02 }));
  // escotillas del techo
  for (const x of [-3.6, 0.8, 2.4]) P.add("body", mm.blue, G.box(1.3, 0.06, 2.0, x, yD + 2.52, 0, { r: 0.02 }));
  // claxon y antenas en techo de cabina
  P.add("body", mm.chrome, G.cylX(0.05, 0.4, 7.4, 4.6, 0.3, 10, 0.08));
  P.add("body", mm.chrome, G.cylX(0.05, 0.35, 7.6, 4.6, -0.2, 10, 0.08));
  P.add("body", mm.black, G.rod([8.6, 4.47, 0], [8.6, 4.75, 0], 0.015));
  P.add("body", mm.black, G.box(0.35, 0.08, 0.25, 7.0, 4.51, -0.8, { r: 0.02 }));
  // luz trasera y faros traseros
  for (const z of [-0.25, 0.25]) P.add("body", mm.lamp, G.cylX(0.08, 0.02, -H + 0.62, yD + 2.3, z, 16));
  // librea en los costados del cofre largo
  mm.livery = mm.livery || std({ map: locoLiveryTexture(), alphaTest: 0.4, roughness: 0.45, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [-1, 1]) P.add("body", mm.livery, plane(h1 - h0, 2.4, (h0 + h1) / 2, yD + 1.25, s * 1.232, s > 0 ? 0 : Math.PI), { cast: false });
  // número económico (atlas) en la cabina y en la nariz
  const num = slotMaterial(atlas, { color: 0xf2efe6 });
  for (const s of [-1, 1]) P.add("body", num, plane(2.2, 0.36, (cab0 + cab1) / 2, yD + 0.5, s * 1.535, s > 0 ? 0 : Math.PI), { slot: true, cast: false });
  P.add("body", num, plane(1.6, 0.26, cab1 + 1.285, yD + 0.45, 0, Math.PI / 2), { slot: true, cast: false });
  // tableros de número iluminados en el techo de la cabina (frente)
  for (const z of [-0.85, 0.85]) {
    P.add("body", mm.black, G.box(0.12, 0.26, 0.9, cab1 + 0.08, 4.18, z, { r: 0.02 }));
    P.add("body", mm.boards || (mm.boards = slotMaterial(atlas, { color: 0x111111, emissive: 0xfff4dc, emissiveIntensity: 0.25 })), plane(0.82, 0.2, cab1 + 0.145, 4.18, z, Math.PI / 2), { slot: true, cast: false });
  }
  // logotipo de Defensa en el costado de la cabina
  mm.cabLogo = mm.cabLogo || std({ map: cabLogoTexture(), alphaTest: 0.4, roughness: 0.45, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [-1, 1]) P.add("body", mm.cabLogo, plane(0.9, 0.9, cab0 + 0.65, yD + 1.6, s * 1.536, s > 0 ? 0 : Math.PI), { cast: false });
  locoTruck(P, mm);
  const wsx = wheelset(0.533, { journal: 1.05 });
  for (const g of wsx.body) P.add("axle", mm.wheel, g);
  for (const g of wsx.tread) P.add("axle", mm.tread, g);
  return { name: "ES44AC", info: "es44ac", length: L, b: 7.9, axles: [-2.07, 0, 2.07], wheelR: 0.533, sag: 0, springTravel: 0, springBase: 0, parts: P.parts(), stack: [-1.2, yD + 2.95, 0] };
}

// ---------- carros de fondo
function sideRibs(P, mat, x0, x1, y0, y1, z, step, w = 0.1, d = 0.06) {
  for (let x = x0; x <= x1 + 0.001; x += step) P.add("body", mat, G.box(w, y1 - y0, d, x, (y0 + y1) / 2, z, { r: 0.01 }));
}

function genericLetter(atlasMatColor, atlas, P, x, y, z, w, ry) {
  const num = slotMaterial(atlas, { color: atlasMatColor });
  P.add("body", num, plane(w, w * 0.16, x, y, z, ry), { slot: true, cast: false });
}

export function boxcarType(atlas) {
  const mm = mats();
  const P = new PartSet();
  const L = 17.7;
  const bl = 16.4;
  P.add("body", mm.black, G.box(L - 0.6, 0.35, 0.6, 0, 1.0, 0, { r: 0.03 }));
  P.add("body", mm.oxide, G.box(bl, 3.6, 3.15, 0, 1.15 + 1.8, 0, { r: 0.05, tile: 2 }));
  P.add("body", mm.oxide, G.box(bl + 0.05, 0.2, 3.25, 0, 4.82, 0, { r: 0.1 }));
  for (const s of [-1, 1]) {
    sideRibs(P, mm.oxide, -bl / 2 + 0.3, -2.0, 1.2, 4.7, s * 1.6, 0.62);
    sideRibs(P, mm.oxide, 2.0, bl / 2 - 0.3, 1.2, 4.7, s * 1.6, 0.62);
    // puerta corrediza y rieles
    P.add("body", mm.oxide, G.box(3.2, 3.45, 0.08, 0.4, 2.9, s * 1.64, { r: 0.02 }));
    for (let k = 0; k < 5; k++) P.add("body", mm.oxide, G.box(3.2, 0.08, 0.05, 0.4, 1.5 + k * 0.75, s * 1.69, { r: 0.01 }));
    P.add("body", mm.black, G.box(7.0, 0.1, 0.1, 0.4, 4.7, s * 1.66, { r: 0.01 }));
    P.add("body", mm.black, G.box(7.0, 0.1, 0.1, 0.4, 1.15, s * 1.66, { r: 0.01 }));
    for (const x of [-bl / 2 + 0.25, bl / 2 - 0.25]) for (const g of G.ladder(x, 0.6, 4.4, s * 1.66, 0.45, "x")) P.add("body", mm.yellow, g);
    genericLetter(0xf0ede4, atlas, P, -5.0, 3.8, s * 1.64, 4.2, s > 0 ? 0 : Math.PI);
    coupler(P, mm, s * (L / 2), s);
    // extremos corrugados
    for (let y = 1.5; y < 4.6; y += 0.45) P.add("body", mm.oxide, G.box(0.08, 0.25, 3.0, s * (bl / 2 + 0.03), y, 0, { r: 0.04 }));
  }
  freightTruck(P, mm);
  const ws = wheelset(0.457);
  for (const g of ws.body) P.add("axle", mm.wheel, g);
  for (const g of ws.tread) P.add("axle", mm.tread, g);
  return { name: "Furgón", info: "furgon", length: L, b: 6.2, axles: [-0.89, 0.89], wheelR: 0.457, sag: 0.02, springTravel: 0.08, springBase: 0.36, parts: P.parts() };
}

export function gondolaType(atlas) {
  const mm = mats();
  const P = new PartSet();
  const L = 16.2;
  const bl = 15.0;
  P.add("body", mm.black, G.box(L - 0.5, 0.35, 0.6, 0, 1.0, 0, { r: 0.03 }));
  P.add("body", mm.black, G.box(bl, 0.12, 3.0, 0, 1.2, 0, { r: 0.02 }));
  for (const s of [-1, 1]) {
    P.add("body", mm.black, G.box(bl, 1.55, 0.08, 0, 1.2 + 0.78, s * 1.52, { r: 0.02 }));
    sideRibs(P, mm.black, -bl / 2 + 0.2, bl / 2 - 0.2, 1.2, 2.8, s * 1.58, 1.2, 0.14, 0.1);
    P.add("body", mm.black, G.box(bl, 0.12, 0.2, 0, 2.78, s * 1.55, { r: 0.03 }));
    P.add("body", mm.black, G.box(0.1, 1.55, 3.0, s * (bl / 2), 1.98, 0, { r: 0.02 }));
    for (const x of [-bl / 2 + 0.25, bl / 2 - 0.25]) for (const g of G.ladder(x, 0.6, 2.6, s * 1.64, 0.45, "x")) P.add("body", mm.yellow, g);
    genericLetter(0xf0ede4, atlas, P, -4.0, 2.2, s * 1.63, 3.6, s > 0 ? 0 : Math.PI);
    coupler(P, mm, s * (L / 2), s);
  }
  // carga de balasto
  const load = new THREE.CylinderGeometry(1, 1, 1, 24, 2);
  const pa = load.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const r = Math.hypot(pa.getX(i), pa.getZ(i));
    pa.setY(i, y > 0 ? 0.5 + 0.35 * Math.cos((r * Math.PI) / 2) * (0.85 + 0.15 * Math.sin(pa.getX(i) * 9)) : -0.5);
  }
  load.computeVertexNormals();
  load.scale(bl / 2 - 0.15, 1, 1.42);
  load.translate(0, 2.1, 0);
  P.add("body", mm.ballastLoad, planarUV(load, 2.5));
  freightTruck(P, mm);
  const ws = wheelset(0.457);
  for (const g of ws.body) P.add("axle", mm.wheel, g);
  for (const g of ws.tread) P.add("axle", mm.tread, g);
  return { name: "Góndola", info: "gondola", length: L, b: 5.7, axles: [-0.89, 0.89], wheelR: 0.457, sag: 0.03, springTravel: 0.12, springBase: 0.36, parts: P.parts() };
}

export function hopperType(atlas) {
  const mm = mats();
  const P = new PartSet();
  const L = 16.5;
  const bl = 15.2;
  P.add("body", mm.grey, G.box(L - 0.6, 0.3, 0.5, 0, 1.0, 0, { r: 0.03 }));
  P.add("body", mm.grey, G.box(bl, 2.3, 3.1, 0, 2.2 + 1.15, 0, { r: 0.08, tile: 2 }));
  // techo redondeado y escotillas
  const roof = new THREE.CylinderGeometry(1.55, 1.55, bl, 24, 1, false, -Math.PI / 2, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.3, 1);
  roof.translate(0, 4.5, 0);
  P.add("body", mm.grey, planarUV(roof, 2));
  for (let x = -6; x <= 6; x += 2) P.add("body", mm.grey, G.box(0.9, 0.12, 0.7, x, 4.93, 0, { r: 0.03 }));
  P.add("body", mm.grating, G.box(bl - 0.5, 0.03, 0.55, 0, 5.02, 0, { r: 0 }));
  // tolvas inferiores (3)
  for (const x of [-4.6, 0, 4.6]) {
    const hp = new THREE.CylinderGeometry(Math.SQRT2 * 1.5, 0.35, 1.45, 4, 1);
    hp.rotateY(Math.PI / 4);
    hp.scale(1.4, 1, 1.0);
    hp.translate(x, 1.5, 0);
    P.add("body", mm.grey, planarUV(hp, 2));
    P.add("body", mm.black, G.box(0.6, 0.25, 0.6, x, 0.68, 0, { r: 0.03 }));
  }
  for (const s of [-1, 1]) {
    for (let x = -bl / 2 + 0.4; x <= bl / 2 - 0.4; x += 1.5) P.add("body", mm.grey, G.box(0.12, 2.3, 0.06, x, 3.35, s * 1.58, { r: 0.01 }));
    for (const x of [-bl / 2 + 0.25, bl / 2 - 0.25]) for (const g of G.ladder(x, 0.6, 4.6, s * 1.62, 0.45, "x")) P.add("body", mm.yellow, g);
    genericLetter(0x1a1a1a, atlas, P, -4.5, 4.0, s * 1.6, 3.8, s > 0 ? 0 : Math.PI);
    coupler(P, mm, s * (L / 2), s);
  }
  freightTruck(P, mm);
  const ws = wheelset(0.457);
  for (const g of ws.body) P.add("axle", mm.wheel, g);
  for (const g of ws.tread) P.add("axle", mm.tread, g);
  return { name: "Tolva", info: "tolva", length: L, b: 6.0, axles: [-0.89, 0.89], wheelR: 0.457, sag: 0.03, springTravel: 0.12, springBase: 0.36, parts: P.parts() };
}

export function placardMaterial() {
  const mm = mats();
  if (!mm.placard) mm.placard = std({ map: placardTexture(), alphaTest: 0.4, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  return mm.placard;
}
export { mats as rollingMats };
