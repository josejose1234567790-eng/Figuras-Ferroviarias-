// Piezas constructivas: cajas biseladas con UV a escala real, tubos, barandales, escaleras, letreros.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { M, std } from "./materials.js";
import * as TX from "./textures.js";

// UV planar por cara (en metros / tile) para que las texturas no se estiren
export function planarUV(geo, tile = 1) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function shadow(o, cast = true, recv = true) {
  o.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = recv;
    }
  });
  return o;
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0, { r = 0.03, ry = 0, tile = 2, parent } = {}) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)) : new THREE.BoxGeometry(w, h, d);
  geo.translate(0, 0, 0);
  // UV en coordenadas locales de la caja (se trasladan con la caja)
  planarUV(geo, tile);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, { seg = 16, parent, rz = 0, rx = 0, ry = 0, open = false } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
  m.position.set(x, y + (rz || rx ? 0 : h / 2), z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// Tubo recto entre dos puntos
export function rod(a, b, r, mat, { seg = 8 } = {}) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return mat ? shadow(new THREE.Mesh(g, mat)) : g;
}

export function rodsMesh(list, r, mat, seg = 6) {
  const geos = list.map(([a, b, rr]) => rod(a, b, rr || r, null, { seg }));
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  return shadow(m);
}

// Tubería curva por puntos
export function pipe(points, r, mat, { seg = 10, closed = false, tension = 0.0 } = {}) {
  const pts = points.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(pts, closed, "catmullrom", tension);
  const g = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 8), r, seg, closed);
  return shadow(new THREE.Mesh(g, mat));
}

// Barandal de tubo (pasamanos, intermedio y rodapié) a lo largo de una polilínea en un plano
export function railing(pts, { h = 1.07, mat = M().yellow, post = 1.5, toe = true } = {}) {
  const list = [];
  const geos = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    list.push([[a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]]]);
    list.push([[a[0], a[1] + h * 0.52, a[2]], [b[0], b[1] + h * 0.52, b[2]]]);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(1, Math.round(L / post));
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 1) continue;
      const f = k / n;
      const x = a[0] + (b[0] - a[0]) * f;
      const y = a[1] + (b[1] - a[1]) * f;
      const z = a[2] + (b[2] - a[2]) * f;
      list.push([[x, y, z], [x, y + h, z]]);
    }
    if (toe) {
      const g = new THREE.BoxGeometry(L, 0.1, 0.008);
      g.rotateY(-Math.atan2(b[2] - a[2], b[0] - a[0]));
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.05, (a[2] + b[2]) / 2);
      geos.push(g);
    }
  }
  const g = new THREE.Group();
  g.add(rodsMesh(list, 0.021, mat, 8));
  if (geos.length) g.add(shadow(new THREE.Mesh(mergeGeometries(geos), mat)));
  return g;
}

// Escalera de huella de rejilla con largueros y barandales; sube en +X local
export function stairs(width, rise, { run = rise / Math.tan((38 * Math.PI) / 180), mat = M().galv, rail = M().yellow } = {}) {
  const g = new THREE.Group();
  const n = Math.ceil(rise / 0.19);
  const gr = TX.grating();
  const treadMat = std({ map: gr, alphaTest: 0.5, color: 0x9a9c9c, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide });
  const treads = [];
  for (let i = 1; i <= n; i++) {
    const t = new THREE.BoxGeometry(run / n + 0.03, 0.03, width);
    t.translate((run * (i - 0.5)) / n, (rise * i) / n - 0.015, 0);
    treads.push(t);
  }
  g.add(shadow(new THREE.Mesh(mergeGeometries(treads), mat)));
  for (const s of [-1, 1]) {
    const L = Math.hypot(run, rise);
    const st = new THREE.Mesh(new THREE.BoxGeometry(L, 0.2, 0.012), mat);
    st.position.set(run / 2, rise / 2, (s * width) / 2);
    st.rotation.z = Math.atan2(rise, run);
    g.add(shadow(st));
    g.add(railing([[0, 0, (s * width) / 2 + s * 0.02], [run, rise, (s * width) / 2 + s * 0.02]], { h: 0.95, mat: rail, post: 1.2, toe: false }));
  }
  treadMat.dispose();
  return g;
}

// Escalera marina con jaula
export function ladder(height, { mat = M().galv, cage = true } = {}) {
  const list = [];
  for (const s of [-0.23, 0.23]) list.push([[0, 0, s], [0, height + 1.0, s]]);
  for (let y = 0.3; y < height; y += 0.3) list.push([[0, y, -0.23], [0, y, 0.23]]);
  if (cage)
    for (let y = 2.4; y < height + 1; y += 1.2) {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const a = -Math.PI / 2 + (k / 8) * Math.PI;
        pts.push([-Math.cos(a) * 0.38 - 0.38, y, Math.sin(a) * 0.36]);
      }
      for (let k = 1; k < pts.length; k++) list.push([pts[k - 1], pts[k]]);
    }
  if (cage) for (const a of [0.25, 0.5, 0.75]) {
    const ang = -Math.PI / 2 + a * Math.PI;
    list.push([[-Math.cos(ang) * 0.38 - 0.38, 2.4, Math.sin(ang) * 0.36], [-Math.cos(ang) * 0.38 - 0.38, height + 1, Math.sin(ang) * 0.36]]);
  }
  return rodsMesh(list, 0.016, mat, 6);
}

// Texto o letrero pintado en un plano (para rótulos en muros)
export function label(lines, { w = 4, h = 1, bg = null, fg = "#1b1b1b", font = "bold", px = 256, border = false } = {}) {
  const c = document.createElement("canvas");
  c.width = Math.round((px * w) / h);
  c.height = px;
  const x = c.getContext("2d");
  if (bg) {
    x.fillStyle = bg;
    x.fillRect(0, 0, c.width, c.height);
  }
  if (border) {
    x.strokeStyle = fg;
    x.lineWidth = px * 0.05;
    x.strokeRect(px * 0.06, px * 0.06, c.width - px * 0.12, c.height - px * 0.12);
  }
  x.fillStyle = fg;
  x.textAlign = "center";
  x.textBaseline = "middle";
  const fs = (px * 0.78) / lines.length;
  lines.forEach((l, i) => {
    let size = fs;
    x.font = `${font} ${size}px Arial, Helvetica, sans-serif`;
    while (x.measureText(l).width > c.width * 0.9 && size > 8) {
      size -= 2;
      x.font = `${font} ${size}px Arial, Helvetica, sans-serif`;
    }
    x.fillText(l, c.width / 2, px / 2 + (i - (lines.length - 1) / 2) * fs * 1.05);
  });
  const t = TX.tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const m = std({ map: t, transparent: !bg, alphaTest: bg ? 0 : 0.3, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.receiveShadow = true;
  return mesh;
}

// Letrero de seguridad sobre poste o muro, con símbolo geométrico según tipo
export function safetySign(kind, text, { w = 0.6, h = 0.8 } = {}) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 512;
  const x = c.getContext("2d");
  const colors = {
    prohibicion: ["#ffffff", "#c4161c", "#111"],
    obligacion: ["#ffffff", "#1660a8", "#111"],
    precaucion: ["#f5c400", "#111111", "#111"],
    emergencia: ["#ffffff", "#17803d", "#111"],
    incendio: ["#ffffff", "#c4161c", "#111"],
  }[kind];
  x.fillStyle = colors[0];
  x.fillRect(0, 0, 384, 512);
  x.lineWidth = 22;
  x.strokeStyle = colors[1];
  x.fillStyle = colors[1];
  const cx = 192;
  const cy = 190;
  if (kind === "prohibicion") {
    x.beginPath();
    x.arc(cx, cy, 130, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.moveTo(cx - 92, cy - 92);
    x.lineTo(cx + 92, cy + 92);
    x.stroke();
  } else if (kind === "obligacion") {
    x.beginPath();
    x.arc(cx, cy, 140, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#fff";
    x.beginPath();
    x.arc(cx, cy - 40, 34, 0, Math.PI * 2);
    x.fill();
    x.fillRect(cx - 40, cy, 80, 90);
  } else if (kind === "precaucion") {
    x.fillStyle = "#111";
    x.beginPath();
    x.moveTo(cx, 40);
    x.lineTo(cx + 160, 330);
    x.lineTo(cx - 160, 330);
    x.closePath();
    x.fill();
    x.fillStyle = "#f5c400";
    x.beginPath();
    x.moveTo(cx, 90);
    x.lineTo(cx + 120, 305);
    x.lineTo(cx - 120, 305);
    x.closePath();
    x.fill();
    x.fillStyle = "#111";
    x.fillRect(cx - 12, 150, 24, 90);
    x.fillRect(cx - 12, 255, 24, 26);
  } else {
    x.fillRect(42, 50, 300, 280);
    x.fillStyle = "#fff";
    x.fillRect(cx - 20, 100, 40, 180);
    x.fillRect(cx - 90, 170, 180, 40);
  }
  x.fillStyle = colors[2];
  x.textAlign = "center";
  x.textBaseline = "middle";
  const words = text.split("\n");
  const fs = words.length > 2 ? 40 : 48;
  words.forEach((l, i) => {
    let size = fs;
    x.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    while (x.measureText(l).width > 350 && size > 18) {
      size -= 2;
      x.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    }
    x.fillText(l, cx, 400 + (i - (words.length - 1) / 2) * fs * 1.1 + (words.length > 1 ? 10 : 20));
  });
  const t = TX.tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const face = std({ map: t, roughness: 0.5, metalness: 0.05 });
  const back = M().galv;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), [back, back, back, back, face, back]);
  return shadow(m);
}

export function signOnPost(kind, text, height = 1.6) {
  const g = new THREE.Group();
  const s = safetySign(kind, text);
  s.position.set(0, height + 0.4, 0.03);
  g.add(s);
  g.add(cyl(0.03, 0.03, height + 0.8, M().galv, 0, 0, 0, { seg: 8 }));
  return g;
}

// Extintor de polvo químico en gabinete con poste señalado
export function extinguisher() {
  const g = new THREE.Group();
  const mat = M();
  box(0.5, 1.05, 0.32, mat.red, 0, 0.55, 0, { r: 0.02, parent: g });
  const glass = box(0.38, 0.75, 0.01, mat.glass, 0, 0.68, 0.165, { r: 0, parent: g });
  glass.material = mat.glass;
  cyl(0.085, 0.085, 0.55, mat.red, 0, 0.72, 0.05, { parent: g });
  cyl(0.04, 0.04, 2.3, mat.galv, 0, 0, -0.2, { seg: 8, parent: g });
  const s = safetySign("incendio", "EXTINTOR", { w: 0.4, h: 0.5 });
  s.position.set(0, 2.05, -0.17);
  g.add(s);
  return shadow(g);
}

// Regadera y lavaojos de emergencia
export function shower() {
  const g = new THREE.Group();
  const mat = M();
  const green = mat.green;
  cyl(0.04, 0.04, 2.3, green, 0, 0, 0, { seg: 10, parent: g });
  g.add(rod([0, 2.25, 0], [0.55, 2.25, 0], 0.03, green));
  cyl(0.15, 0.04, 0.12, mat.galv, 0.55, 2.05, 0, { parent: g });
  g.add(rod([0, 1.0, 0], [0.32, 1.0, 0], 0.025, green));
  cyl(0.14, 0.08, 0.1, mat.yellow, 0.36, 1.0, 0, { parent: g });
  box(0.45, 0.04, 0.45, mat.concrete, 0.25, -0.01, 0, { r: 0.01, parent: g });
  const s = safetySign("emergencia", "REGADERA DE\nEMERGENCIA", { w: 0.4, h: 0.5 });
  s.position.set(0, 2.62, 0.05);
  g.add(s);
  return shadow(g);
}

export { mergeGeometries };
