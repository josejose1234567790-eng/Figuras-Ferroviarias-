// Vía: balasto con taludes, durmientes de concreto a 0.60 m, riel 115/136 lb con sujeción elástica,
// cambios con agujas móviles, sapo, contrarrieles y banderola; topes y descarriladores.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TRACKS, TURNOUTS, BUMPERS, GAUGE, RAIL_TOP, SITE, pointAt } from "./layout.js";
import { subPath, sweep, Chunked, trs, heading } from "./geom.js";
import { M, std } from "./materials.js";
import * as TX from "./textures.js";

export const RC = GAUGE / 2 + 0.037; // eje de cada riel
const RAIL_H = 0.186;
const RAIL_BASE = RAIL_TOP - RAIL_H;
const TIE_TOP = RAIL_BASE - 0.012;
const TIE_SP = 0.6;
const LP = 5.0; // longitud de aguja

// Perfil del riel 136RE (mitad derecha de abajo hacia arriba, luego espejo)
const half = [
  [0.076, 0.0],
  [0.076, 0.011],
  [0.03, 0.026],
  [0.011, 0.036],
  [0.0088, 0.05],
  [0.0088, 0.118],
  [0.014, 0.13],
  [0.037, 0.141],
  [0.0375, 0.168],
  [0.033, 0.179],
];
const crown = [
  [0.033, 0.179],
  [0.02, 0.1855],
  [0.0, 0.186],
  [-0.02, 0.1855],
  [-0.033, 0.179],
];
const BODY_R = half;
const BODY_L = half.slice().reverse().map(([u, y]) => [-u, y]);

// Perfil de aguja: cabeza reducida y altura menor en la punta
function bladeProfile(f, side) {
  const k = Math.min(1, 0.25 + f * 1.2);
  const hk = 0.72 + 0.28 * Math.min(1, f * 1.5);
  const sc = (pts) => pts.map(([u, y]) => [u * (y > 0.13 ? k : 1) * (y < 0.03 ? 0.75 : 1), y * hk]);
  const p = [...sc(BODY_R), ...sc(crown).slice(1, -1), ...sc(BODY_L)];
  return side ? p : p;
}

const ballastProfile = [
  [2.3, -0.06],
  [1.65, 0.42],
  [-1.65, 0.42],
  [-2.3, -0.06],
];

// Rangos (en x) donde la vía va sobre losa o fosa en lugar de balasto
function slabRanges(id) {
  const r = [];
  if (SITE.bascula.track === id) r.push([SITE.bascula.x - SITE.bascula.len / 2, SITE.bascula.x + SITE.bascula.len / 2]);
  if (SITE.fosa.track === id) r.push([SITE.fosa.x - SITE.fosa.len / 2, SITE.fosa.x + SITE.fosa.len / 2]);
  return r;
}

function nearestS(track, p) {
  let best = 1e9;
  let bs = 0;
  const P = track.path;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i].p;
    const b = P[i + 1].p;
    const ab = [b[0] - a[0], b[1] - a[1]];
    const l2 = ab[0] * ab[0] + ab[1] * ab[1];
    const f = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
    const q = [a[0] + ab[0] * f, a[1] + ab[1] * f];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best) {
      best = d;
      bs = P[i].s + Math.sqrt(l2) * f;
    }
  }
  return { d: best, s: bs };
}

// Analiza cada cambio: vía madre, desviada, separación lateral, sapo
export function analyse(to) {
  const B = TRACKS.find((t) => t.id === to.track);
  const bp = (x) => {
    const q = pointAt(B, to.reverse ? B.length - x : x);
    return q;
  };
  const d = to.dir;
  const T = to.at;
  let n = [-d[1], d[0]];
  const p30 = bp(30).p;
  if ((p30[0] - T[0]) * n[0] + (p30[1] - T[1]) * n[1] < 0) n = [d[1], -d[0]];
  const table = [];
  for (let s = 0; s <= 80; s += 0.5) {
    const q = bp(s).p;
    table.push([(q[0] - T[0]) * d[0] + (q[1] - T[1]) * d[1], (q[0] - T[0]) * n[0] + (q[1] - T[1]) * n[1]]);
  }
  const off = (x) => {
    for (let i = 0; i < table.length - 1; i++) if (table[i + 1][0] >= x) {
      const f = (x - table[i][0]) / Math.max(1e-6, table[i + 1][0] - table[i][0]);
      return table[i][1] + (table[i + 1][1] - table[i][1]) * f;
    }
    return table[table.length - 1][1];
  };
  const alongAt = (o) => {
    for (let i = 0; i < table.length - 1; i++) if (table[i + 1][1] >= o) {
      const f = (o - table[i][1]) / Math.max(1e-6, table[i + 1][1] - table[i][1]);
      return table[i][0] + (table[i + 1][0] - table[i][0]) * f;
    }
    return 80;
  };
  let parent = null;
  let sP = 0;
  for (const t of TRACKS) {
    if (t === B) continue;
    const r = nearestS(t, T);
    if (r.d < 0.2) {
      parent = t;
      sP = r.s;
      break;
    }
  }
  const tp = pointAt(parent, sP).t;
  const pSign = tp[0] * d[0] + tp[1] * d[1] > 0 ? 1 : -1;
  const Lp_ = [-tp[1], tp[0]];
  const parentSideU = Math.sign(Lp_[0] * n[0] + Lp_[1] * n[1]); // signo u del riel del lado desviado en la madre
  const bt = pointAt(B, to.reverse ? B.length - 1 : 1).t;
  const Lb = [-bt[1], bt[0]];
  const branchFarU = -Math.sign(Lb[0] * n[0] + Lb[1] * n[1]);
  const xf = alongAt(2 * RC);
  const Lz = alongAt(2.75);
  const W = (x, lat) => [T[0] + d[0] * x + n[0] * lat, T[1] + d[1] * x + n[1] * lat];
  return { to, B, bp, d, n, T, off, parent, sP, pSign, parentSideU, branchFarU, xf, Lz, W };
}

export function buildTrack(scene, quality) {
  const mat = M();
  const group = new THREE.Group();
  group.name = "vias";
  scene.add(group);
  const TA = TURNOUTS.map(analyse);
  const cuts = new Map(); // `${id}|${u}` -> [[s0,s1]]
  const addCut = (id, u, a, b) => {
    const k = `${id}|${u}`;
    if (!cuts.has(k)) cuts.set(k, []);
    cuts.get(k).push([Math.min(a, b), Math.max(a, b)]);
  };
  for (const A of TA) {
    addCut(A.parent.id, A.parentSideU, A.sP, A.sP + A.pSign * LP);
    if (A.to.reverse) addCut(A.B.id, A.branchFarU, A.B.length - LP, A.B.length);
    else addCut(A.B.id, A.branchFarU, 0, LP);
  }

  // ---- Balasto y rieles por vía
  const ballastGeoms = [];
  const bodyGeoms = [];
  const headGeoms = [];
  for (const tr of TRACKS) {
    const slabs = slabRanges(tr.id);
    // balasto por tramos fuera de losas
    let pieces = [[0, tr.length]];
    for (const [x0, x1] of slabs) {
      const s0 = nearestS(tr, [x0, pointAt(tr, 0).p[1]]).s;
      const s1 = nearestS(tr, [x1, pointAt(tr, 0).p[1]]).s;
      pieces = pieces.flatMap(([a, b]) => {
        const lo = Math.min(s0, s1);
        const hi = Math.max(s0, s1);
        if (hi <= a || lo >= b) return [[a, b]];
        const out = [];
        if (lo > a) out.push([a, lo]);
        if (hi < b) out.push([hi, b]);
        return out;
      });
    }
    for (const [a, b] of pieces) ballastGeoms.push(sweep(subPath(tr, a, b), ballastProfile, { worldUV: 3 }));
    for (const u of [-1, 1]) {
      let segs = [[0, tr.length]];
      for (const [c0, c1] of cuts.get(`${tr.id}|${u}`) || [])
        segs = segs.flatMap(([a, b]) => {
          if (c1 <= a || c0 >= b) return [[a, b]];
          const out = [];
          if (c0 > a) out.push([a, c0]);
          if (c1 < b) out.push([c1, b]);
          return out;
        });
      for (const [a, b] of segs) {
        if (b - a < 0.05) continue;
        const sp = subPath(tr, a, b);
        bodyGeoms.push(sweep(sp, BODY_R, { lateral: u * RC, y0: RAIL_BASE, uScale: 4, vScale: 0.25 }));
        bodyGeoms.push(sweep(sp, BODY_L, { lateral: u * RC, y0: RAIL_BASE, uScale: 4, vScale: 0.25 }));
        headGeoms.push(sweep(sp, crown, { lateral: u * RC, y0: RAIL_BASE }));
      }
    }
  }
  const ballast = new THREE.Mesh(mergeGeometries(ballastGeoms), mat.ballast);
  ballast.receiveShadow = true;
  ballast.name = "balasto";
  group.add(ballast);
  const railBody = new THREE.Mesh(mergeGeometries(bodyGeoms), mat.railBody);
  railBody.castShadow = railBody.receiveShadow = true;
  railBody.name = "riel";
  const railHead = new THREE.Mesh(mergeGeometries(headGeoms), mat.railHead);
  railHead.receiveShadow = true;
  railHead.name = "riel";
  group.add(railBody, railHead);

  // ---- Durmientes de concreto (monobloque pretensado)
  const tieShape = new THREE.Shape();
  tieShape.moveTo(-0.145, 0);
  tieShape.lineTo(0.145, 0);
  tieShape.lineTo(0.11, 0.21);
  tieShape.lineTo(-0.11, 0.21);
  tieShape.closePath();
  const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: 1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 1 });
  tieGeo.translate(0, 0, -0.5); // largo en Z local = transversal a la vía tras heading()
  const ties = new Chunked(tieGeo, mat.tie, { name: "durmiente", castShadow: quality === "alta" });
  const seatGeo = fasteningGeometry();
  const seats = new Chunked(seatGeo, mat.fastening, { name: "sujecion", castShadow: false, cell: 60 });

  const zones = TA.map((A) => A);
  const inZone = (x, z) => {
    for (const A of zones) {
      const rx = x - A.T[0];
      const rz = z - A.T[1];
      const al = rx * A.d[0] + rz * A.d[1];
      if (al < -1.2 || al > A.Lz + 0.3) continue;
      const lat = rx * A.n[0] + rz * A.n[1];
      if (lat > -1.0 && lat < A.off(Math.max(0, al)) + 1.0) return true;
    }
    return false;
  };
  const inSlab = (id, x) => slabRanges(id).some(([a, b]) => x > a - 0.3 && x < b + 0.3);
  const yTie = TIE_TOP - 0.21;
  for (const tr of TRACKS) {
    for (let s = 0.3; s < tr.length - 0.2; s += TIE_SP) {
      const q = pointAt(tr, s);
      const t = norm(q.t);
      if (inZone(q.p[0], q.p[1]) || inSlab(tr.id, q.p[0])) continue;
      const h = heading(t);
      ties.add(trs(q.p[0], yTie, q.p[1], h, 1, 1, 2.6));
      seats.add(trs(q.p[0], RAIL_BASE, q.p[1], h, 1, 1, 1));
    }
  }
  // durmientes largos del cambio
  for (const A of TA) {
    for (let x = -1.2; x < A.Lz; x += TIE_SP) {
      const o = Math.max(0, A.off(Math.max(0, x)));
      const ext = x < 0.9 && x > -1.3 ? 1.6 : 0; // durmientes de cabeza para la banderola
      const len = 2.6 + o + ext;
      const c = A.W(x, o / 2 - ext / 2);
      ties.add(trs(c[0], yTie, c[1], heading(A.d), 1, 1, len));
    }
  }
  ties.build(group);
  seats.build(group);
  const clipMeshes = seats.meshes;

  // ---- Elementos de cada cambio
  const turnoutObjs = TA.map((A) => buildTurnout(A, group, mat));

  // ---- Topes y descarriladores
  for (const b of BUMPERS) group.add(buildBumper(b, mat));

  return { group, clipMeshes, turnouts: turnoutObjs };
}

const norm = (t) => {
  const l = Math.hypot(t[0], t[1]);
  return [t[0] / l, t[1] / l];
};

// Placa de asiento, hombros y grapas elásticas tipo "e" de ambos rieles
function fasteningGeometry() {
  const parts = [];
  const color = (g, c) => {
    const col = new THREE.Color(c);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  };
  for (const u of [-1, 1]) {
    const pad = new THREE.BoxGeometry(0.16, 0.012, 0.19);
    pad.translate(0, -0.006, u * RC);
    parts.push(color(pad.toNonIndexed(), 0x161616));
    for (const side of [-1, 1]) {
      const sh = new THREE.BoxGeometry(0.07, 0.05, 0.05);
      sh.translate(0, 0.0, u * RC + side * 0.105);
      parts.push(color(sh.toNonIndexed(), 0x6c6a66));
      // grapa: curva en "e" que apoya sobre el patín
      const pts = [
        [0.03, 0.02, side * 0.14],
        [0.035, 0.045, side * 0.11],
        [0.0, 0.05, side * 0.085],
        [-0.035, 0.035, side * 0.1],
        [-0.03, 0.02, side * 0.13],
        [-0.02, 0.016, side * 0.075],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z + u * RC));
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0085, 5, false);
      parts.push(color(tube.toNonIndexed(), 0x2c2e30));
    }
  }
  for (const p of parts) {
    p.deleteAttribute("uv");
  }
  const g = mergeGeometries(parts);
  // eje de vía en X local, lateral en Z local → coincide con heading()
  g.rotateY(0);
  return g;
}

function buildTurnout(A, parent, mat) {
  const g = new THREE.Group();
  g.name = "cambio";
  g.userData.info = "cambio";
  const y0 = RAIL_BASE;
  const samplesLine = (pts) => {
    let s = 0;
    return pts.map((p, i) => {
      if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      return { p, t: norm([b[0] - a[0], b[1] - a[1]]), s };
    });
  };
  // Agujas: cada una gira alrededor de su talón
  const blades = [];
  const heelLat = [RC - 0.037 - 0.036, -RC + 0.037 + 0.036];
  for (let k = 0; k < 2; k++) {
    const pts = [];
    for (let x = 0; x <= LP + 0.001; x += 0.5) {
      const lat = k === 0 ? heelLat[0] : A.off(x) + heelLat[1];
      pts.push(A.W(x, lat));
    }
    const sp = samplesLine(pts);
    const heel = sp[sp.length - 1].p;
    const geo = sweep(sp, null, { y0, profileAt: (f) => bladeProfile(f) });
    geo.translate(-heel[0], 0, -heel[1]);
    const body = new THREE.Mesh(geo, mat.railBody);
    body.castShadow = body.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(heel[0], 0, heel[1]);
    pivot.add(body);
    g.add(pivot);
    const tip = sp[0].p;
    const v = [tip[0] - heel[0], tip[1] - heel[1]];
    blades.push({ pivot, v });
  }
  // Barras de conexión entre agujas
  const rods = new THREE.Group();
  for (const x of [0.35, 1.25]) {
    const a = A.W(x, heelLat[0]);
    const b = A.W(x, A.off(x) + heelLat[1]);
    const len = Math.hypot(a[0] - b[0], a[1] - b[1]) + 0.12;
    const rod = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.06), mat.darkSteel);
    rod.position.set((a[0] + b[0]) / 2, y0 + 0.035, (a[1] + b[1]) / 2);
    rod.rotation.y = heading(A.n);
    rod.castShadow = true;
    rods.add(rod);
  }
  // Varilla de maniobra hacia la banderola
  {
    const a = A.W(0.35, -RC);
    const b = A.W(0.35, -RC - 1.45);
    const len = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 8), mat.darkSteel);
    rod.rotation.z = Math.PI / 2;
    const rg = new THREE.Group();
    rg.position.set((a[0] + b[0]) / 2, y0 + 0.06, (a[1] + b[1]) / 2);
    rg.rotation.y = heading(A.n);
    rg.add(rod);
    rods.add(rg);
  }
  g.add(rods);
  // Placas de deslizamiento bajo las agujas
  const plateGeo = [];
  for (let x = -0.3; x < LP; x += TIE_SP) {
    const o = A.off(Math.max(0, x));
    const a = A.W(x, (o + 0) / 2);
    const len = 2 * RC + o + 0.35;
    const pg = new THREE.BoxGeometry(0.2, 0.014, len);
    pg.rotateY(heading(A.d));
    pg.translate(a[0], y0 - 0.007, a[1]);
    plateGeo.push(pg);
  }
  const plates = new THREE.Mesh(mergeGeometries(plateGeo), mat.darkSteel);
  plates.receiveShadow = true;
  g.add(plates);

  // Sapo (corazón de acero al manganeso)
  {
    const xf = A.xf;
    const a0 = A.W(xf - 1, A.off(xf - 1));
    const a1 = A.W(xf + 1, A.off(xf + 1));
    const bdir = norm([a1[0] - a0[0], a1[1] - a0[1]]);
    const bis = norm([A.d[0] + bdir[0], A.d[1] + bdir[1]]);
    const x0 = A.W(xf, RC);
    const c = [x0[0] + bis[0] * 0.6, x0[1] + bis[1] * 0.6];
    const frog = new THREE.Mesh(new THREE.BoxGeometry(5.2, RAIL_H - 0.012, 0.42), mat.rustSteel);
    frog.position.set(c[0], y0 + (RAIL_H - 0.012) / 2, c[1]);
    frog.rotation.y = heading(bis);
    frog.castShadow = frog.receiveShadow = true;
    g.add(frog);
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.004, 0.16), mat.railHead);
    top.position.set(0, (RAIL_H - 0.012) / 2 + 0.002, 0);
    frog.add(top);
    // contrarrieles frente al sapo, en la madre y en la desviada
    for (const k of [0, 1]) {
      const pts = [];
      for (let x = xf - 2.6; x <= xf + 2.61; x += 0.4) {
        const flare = Math.max(0, Math.abs(x - xf) - 1.8) * 0.06;
        const lat = k === 0 ? -RC + 0.11 + flare : A.off(x) + RC - 0.11 - flare;
        pts.push(A.W(x, lat));
      }
      const geo = sweep(samplesLine(pts), [...BODY_R.map(([u, y]) => [u * 0.8, y * 0.95]), ...BODY_L.map(([u, y]) => [u * 0.8, y * 0.95])], { y0 });
      const gr = new THREE.Mesh(geo, mat.railBody);
      gr.castShadow = true;
      g.add(gr);
    }
  }

  // Banderola (aparato de cambio manual)
  {
    const p = A.W(0.35, -RC - 1.55);
    const st = new THREE.Group();
    st.position.set(p[0], TIE_TOP, p[1]);
    st.rotation.y = heading(A.d);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.42), mat.darkSteel);
    base.position.y = 0.11;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.25, 10), mat.black);
    shaft.position.y = 0.85;
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), mat.yellow);
    lever.rotation.z = Math.PI / 2;
    lever.position.set(0.45, 0.3, 0);
    const target = new THREE.Group();
    target.position.y = 1.35;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.012, 24), std({ color: 0x1f9d55, roughness: 0.45 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 32), mat.white);
    rim.rotation.y = Math.PI / 2;
    target.add(rim);
    disc.rotation.z = Math.PI / 2;
    const disc2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.32, 0.5), std({ color: 0xc0281e, roughness: 0.45 }));
    disc2.rotation.y = Math.PI / 2;
    disc2.position.y = 0.0;
    disc.position.y = 0;
    target.add(disc, disc2);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 12), mat.black);
    lamp.position.y = 1.67;
    st.add(base, shaft, lever, target, lamp);
    st.traverse((o) => o.isMesh && (o.castShadow = true));
    st.userData.info = "banderola";
    g.add(st);
    g.userData.target = target;
  }

  // Estado: 0 = vía directa, 1 = desviada
  const throwGap = 0.11;
  const setState = (sig) => {
    blades.forEach((b, k) => {
      const shift = k === 0 ? -throwGap * sig : throwGap * (1 - sig);
      // giro pequeño alrededor del talón para mover la punta "shift" hacia n
      const vx = b.v[0];
      const vz = b.v[1];
      const disp = [vz, -vx];
      const l2 = vx * vx + vz * vz;
      b.pivot.rotation.y = (shift * (A.n[0] * disp[0] + A.n[1] * disp[1])) / l2;
    });
    rods.position.set(A.n[0] * -throwGap * sig, 0, A.n[1] * -throwGap * sig);
    g.userData.target.rotation.y = (sig * Math.PI) / 2;
    g.userData.state = sig;
  };
  setState(0);
  g.userData.setState = setState;
  g.userData.id = A.to.id;
  parent.add(g);
  return g;
}

let bumperTex;
function stripes() {
  if (bumperTex) return bumperTex;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#d9a516";
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = "#151515";
  for (let x = -64; x < 576; x += 64) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 32, 64);
    g.lineTo(x + 64, 0);
    g.lineTo(x + 32, 0);
    g.fill();
  }
  const img = g.getImageData(0, 0, 512, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random() * 18 - 9;
    for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + n));
  }
  g.putImageData(img, 0, 0);
  bumperTex = TX.tex(c);
  return bumperTex;
}

function buildBumper(b, mat) {
  const g = new THREE.Group();
  g.name = "tope";
  g.userData.info = "tope";
  g.position.set(b.at[0], 0, b.at[1]);
  g.rotation.y = heading(b.dir);
  // tope de fricción: bastidor de acero sobre los rieles, cabezal a la altura del enganche
  const beamMat = std({ map: stripes(), roughness: 0.65, metalness: 0.2 });
  const yC = RAIL_TOP + 0.88;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 2.7), beamMat);
  head.position.set(0, yC, 0);
  g.add(head);
  for (const u of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, yC - RAIL_TOP + 0.1, 0.2), mat.darkSteel);
    post.position.set(0.05, (yC + RAIL_TOP) / 2, u * RC);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.16), mat.darkSteel);
    strut.position.set(-1.15, (yC + RAIL_TOP) / 2 - 0.05, u * RC);
    strut.rotation.z = Math.atan2(yC - RAIL_TOP - 0.1, 2.4);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.24), mat.darkSteel);
    shoe.position.set(-1.0, RAIL_TOP + 0.03, u * RC);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 20), mat.black);
    pad.rotation.z = Math.PI / 2;
    pad.position.set(-0.23, yC, u * 0.6);
    g.add(post, strut, shoe, pad);
  }
  // durmientes y balasto de remate
  const mound = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 1.9, 0.62, 4, 1);
  mound.rotateY(Math.PI / 4);
  mound.scale(2.4, 1, 3.0);
  mound.translate(1.6, 0.25, 0);
  const pa = mound.attributes.position;
  const uvm = new Float32Array(pa.count * 2);
  for (let i = 0; i < pa.count; i++) {
    uvm[i * 2] = (pa.getX(i) + b.at[0]) / 3;
    uvm[i * 2 + 1] = (pa.getZ(i) + pa.getY(i) + b.at[1]) / 3;
  }
  mound.setAttribute("uv", new THREE.BufferAttribute(uvm, 2));
  mound.computeVertexNormals();
  g.add(new THREE.Mesh(mound, M().ballast));
  g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  // descarrilador 25 m antes, con su letrero
  const dr = new THREE.Group();
  dr.position.set(-25, 0, 0);
  const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.28), mat.yellow);
  wedge.position.set(0, RAIL_TOP + 0.04, RC - 0.05);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.0), mat.yellow);
  arm.position.set(0, RAIL_TOP - 0.05, RC + 0.55);
  dr.add(wedge, arm, signPost(["DESCARRILADOR"], "#e0b21a", "#111", 0.6, 0.3, 1.2, RC + 2.2));
  dr.userData.info = "descarrilador";
  g.add(dr);
  return g;
}

// Letrero sencillo sobre poste (también se usa en edificios)
export function signPost(lines, bg, fg, w, h, height, lateral = 0, { both = false } = {}) {
  const g = new THREE.Group();
  const mat = M();
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const x = c.getContext("2d");
  x.fillStyle = bg;
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = fg;
  x.lineWidth = 10;
  x.strokeRect(14, 14, c.width - 28, c.height - 28);
  x.fillStyle = fg;
  x.textAlign = "center";
  x.textBaseline = "middle";
  const fs = Math.min(110, (c.height - 60) / lines.length);
  x.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
  lines.forEach((l, i) => {
    let size = fs;
    while (x.measureText(l).width > c.width - 70 && size > 20) {
      size -= 4;
      x.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    }
    x.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.1);
    x.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
  });
  const t = TX.tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const face = std({ map: t, roughness: 0.55, metalness: 0.1 });
  const back = mat.galv;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), [back, back, back, back, face, both ? face : back]);
  panel.position.set(0, height + h / 2, 0.035);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, height + h, 8), mat.galv);
  post.position.y = (height + h) / 2;
  g.add(panel, post);
  g.position.z = lateral;
  // el letrero mira hacia -X (hacia el tren que llega)
  g.rotation.y = -Math.PI / 2;
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}
