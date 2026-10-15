// Carro tanque DOT-117 en 3D (three.js r149). Las piezas se arman con las mismas formas que audita
// la versión isométrica; los vectores de despiece, el escalonamiento y los pasos de montaje son los mismos.
const D = __DATA__;
const root = document.querySelector(".ct");
const stage = root.querySelector(".ct-stage");
const canvas = stage.querySelector(".ct-canvas");
const readout = root.querySelector("[data-readout]");
const hint = root.querySelector("[data-hint]");
const live = root.querySelector("[data-live]");
const info = root.querySelector("[data-info]");
const modeButtons = [...root.querySelectorAll("[data-mode]")];
const asmButtons = [...root.querySelectorAll("[data-asm]")];
const stepBox = root.querySelector("[data-steps]");
const stepLabel = root.querySelector("[data-step-label]");
const stepLine = root.querySelector("[data-step-line]");
const stepPrev = root.querySelector("[data-step-prev]");
const stepNext = root.querySelector("[data-step-next]");
const stepPlay = root.querySelector("[data-step-play]");
const resetButton = root.querySelector("[data-reset]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

THREE.ColorManagement.legacyMode = false;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 2, 4, 9000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.53;
controls.minDistance = 60;
controls.maxDistance = 3200;

scene.add(new THREE.HemisphereLight(0xf2f5f8, 0x8a8174, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(-320, 520, 900);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 420, bottom: -420, near: 100, far: 2400 });
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdfe8f2, 0.55);
fill.position.set(500, -300, 260);
scene.add(fill);

// Materiales: colores de materiales reales
const PALETTE = {
  negro: [0x34363a, 0.45, 0.35], acero: [0x6b6661, 0.6, 0.5], bogie: [0x5c4b40, 0.78, 0.35], rueda: [0x77736f, 0.42, 0.8],
  rodamiento: [0x9b9ea1, 0.35, 0.85], resorte: [0x3b3633, 0.5, 0.6], goma: [0x2a2928, 0.9, 0], zapata: [0x4a4644, 0.85, 0.2],
  cilindro: [0x50565b, 0.5, 0.5], riel: [0x837c76, 0.42, 0.75], amarillo: [0xe2ad1a, 0.5, 0.1], bronce: [0xb38b45, 0.35, 0.85],
  inox: [0xb9bdc1, 0.28, 0.9], acoplador: [0x4d4541, 0.65, 0.5], aparato: [0x56606a, 0.55, 0.5], rejilla: [0xa4a8ab, 0.6, 0.6],
  placa: [0xdcdad4, 0.6, 0.1], aislante: [0xeadfbd, 0.95, 0], primer: [0x8c7c70, 0.72, 0.3],
};
function material(key) {
  const [c, rough, metal] = PALETTE[key] ?? PALETTE.acero;
  return new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, side: THREE.DoubleSide });
}

// Geometrías a partir de las formas registradas
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const basis = (x, y, z, o) => new THREE.Matrix4().makeBasis(V(x), V(y), V(z)).setPosition(V(o));
function latheRuns(poly) {
  // se parte el perfil en las esquinas vivas para que los cantos no se vean redondeados
  const pts = poly.slice();
  const closed = pts.length > 2 && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]);
  if (closed) pts.push(pts[0]);
  const runs = [];
  let run = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    run.push(pts[i]);
    if (i < pts.length - 1) {
      const a = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
      const b = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
      const la = Math.hypot(...a) || 1;
      const lb = Math.hypot(...b) || 1;
      if ((a[0] * b[0] + a[1] * b[1]) / (la * lb) < 0.86) {
        runs.push(run);
        run = [pts[i]];
      }
    }
  }
  if (run.length > 1) runs.push(run);
  return runs.filter((r) => r.length > 1 && r.some(([, rr]) => rr > 1e-3));
}
function bodyGeometry(sh) {
  const rmax = Math.max(...sh.p.map((q) => q[1]));
  const segs = rmax > 30 ? 96 : rmax > 6 ? 48 : rmax > 2 ? 28 : 16;
  const m = basis(sh.u, sh.a, sh.v, sh.o);
  return latheRuns(sh.p).map((run) => {
    const g = new THREE.LatheGeometry(run.map(([s, r]) => new THREE.Vector2(Math.max(r, 0), s)), segs);
    g.applyMatrix4(m);
    return g;
  });
}
function prismGeometry(sh) {
  const shape = new THREE.Shape(sh.p.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: sh.s1 - sh.s0, bevelEnabled: false, steps: 1 });
  const o = [sh.o[0] + sh.a[0] * sh.s0, sh.o[1] + sh.a[1] * sh.s0, sh.o[2] + sh.a[2] * sh.s0];
  g.applyMatrix4(basis(sh.u, sh.v, sh.a, o));
  return [g];
}
function boxGeometry(sh) {
  const g = new THREE.BoxGeometry(sh.half[0] * 2, sh.half[1] * 2, sh.half[2] * 2);
  g.applyMatrix4(basis(sh.axes[0], sh.axes[1], sh.axes[2], sh.o));
  return [g];
}
function ballGeometry(sh) {
  const g = new THREE.SphereGeometry(sh.r, 24, 16);
  g.translate(sh.o[0], sh.o[1], sh.o[2]);
  return [g];
}
function tubeGeometry(sh) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < sh.p.length - 1; i++) path.add(new THREE.LineCurve3(V(sh.p[i]), V(sh.p[i + 1])));
  return [new THREE.TubeGeometry(path, Math.max(2, sh.p.length * 2), sh.r, sh.r > 1 ? 14 : 10, false)];
}
class Helix extends THREE.Curve {
  constructor(c, r, z0, z1, turns) {
    super();
    Object.assign(this, { c, r, z0, z1, turns });
  }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return out.set(this.c[0] + this.r * Math.cos(a), this.c[1] + this.r * Math.sin(a), this.z0 + (this.z1 - this.z0) * t);
  }
}
function coilGeometry(sh) {
  const s0 = sh.p[0][0];
  const s1 = sh.p[2][0];
  const r = sh.p[1][1];
  return [new THREE.TubeGeometry(new Helix(sh.o, r - 0.3, s0 + 0.3, s1 - 0.3, 4.5), 120, 0.3, 8, false)];
}
const BUILD = { b: bodyGeometry, p: prismGeometry, x: boxGeometry, s: ballGeometry, t: tubeGeometry };
function mergeAll(list) {
  if (!list.length) return null;
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let at = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, at * 3);
    nor.set(g.attributes.normal.array, at * 3);
    at += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return out;
}

// Nodos: un grupo por ítem
const world = new THREE.Group();
scene.add(world);
const nodes = D.items.map((it) => {
  const group = new THREE.Group();
  const mat = material(it.m);
  const node = { pid: it.p, type: it.t, asm: it.a, ride: it.r, ride2: it.r2, x1: it.x1, x2: it.x2, group, mat, alpha: 1, goal: 1, clip: null, home: new THREE.Box3() };
  node.m1 = D.move[it.r] ?? [0, 0, 0];
  node.m2 = D.v2[it.r2] ?? [0, 0, 0];
  const geos = [];
  for (const sh of it.s) {
    geos.push(...(it.coil ? coilGeometry(sh) : (BUILD[sh.k] ?? (() => []))(sh)));
    if (sh.clip) node.clip = sh.clip;
  }
  // una sola malla por pieza: menos llamadas de dibujo
  const g = mergeAll(geos);
  if (g) {
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = it.a !== "via";
    mesh.receiveShadow = true;
    mesh.userData.node = node;
    group.add(mesh);
    g.computeBoundingBox();
    node.home.copy(g.boundingBox);
  }
  world.add(group);
  return node;
});
const byPid = new Map();
for (const n of nodes) {
  if (!byPid.has(n.pid)) byPid.set(n.pid, []);
  byPid.get(n.pid).push(n);
}

// Vía: durmientes y balasto (se ocultan al abrir un ensamble)
const trackObjects = [];
{
  const tieMat = material("placa");
  tieMat.color.set(0xb9b4ab);
  const tie = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(tie, tieMat, D.ties.length);
  const m = new THREE.Matrix4();
  D.ties.forEach(([x0, x1, y0, y1, z0, z1], i) => {
    m.makeScale(x1 - x0, y1 - y0, z1 - z0).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    inst.setMatrixAt(i, m);
  });
  inst.receiveShadow = true;
  inst.castShadow = true;
  scene.add(inst);
  trackObjects.push(inst);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(960, 160, 8), new THREE.MeshStandardMaterial({ color: 0xa9a49c, roughness: 1 }));
  bed.position.set(0, 0, -18);
  bed.receiveShadow = true;
  scene.add(bed);
  trackObjects.push(bed);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2400, 64), new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 1 }));
  ground.position.z = -22.2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// Placas ONU
function placardTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#d8d6d0";
  g.fillRect(0, 0, 256, 256);
  g.save();
  g.translate(128, 128);
  g.rotate(Math.PI / 4);
  g.fillStyle = "#c8231b";
  g.fillRect(-82, -82, 164, 164);
  g.strokeStyle = "#fff";
  g.lineWidth = 6;
  g.strokeRect(-74, -74, 148, 148);
  g.restore();
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(128, 40);
  g.bezierCurveTo(150, 62, 160, 78, 152, 92);
  g.bezierCurveTo(146, 104, 110, 104, 104, 92);
  g.bezierCurveTo(98, 80, 112, 66, 120, 58);
  g.closePath();
  g.fill();
  g.fillStyle = "#fff";
  g.fillRect(58, 110, 140, 38);
  g.strokeStyle = "#111";
  g.lineWidth = 3;
  g.strokeRect(58, 110, 140, 38);
  g.fillStyle = "#111";
  g.font = "bold 32px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("1993", 128, 130);
  g.fillStyle = "#fff";
  g.font = "bold 30px system-ui, sans-serif";
  g.fillText("3", 128, 196);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
{
  const tex = placardTexture();
  for (const [x, y, z, s] of D.placards) {
    const pid = s > 0 ? "s.placaN" : "s.placaF";
    const owner = (byPid.get(pid) ?? [])[0];
    if (!owner) continue;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    plane.up.set(0, 0, 1);
    plane.position.set(x, y + s * 0.05, z);
    plane.lookAt(x, y + s * 10, z);
    plane.userData.node = owner;
    owner.group.add(plane);
  }
}

// Diésel para el corte: sólido de revolución de la virola por debajo del nivel
const liquid = (() => {
  const N = 48;
  const C = D.C;
  const zl = D.liquidZ;
  const pos = [];
  const slices = D.liquid.filter(([, r]) => r > 0.05);
  for (const [s, r] of slices) {
    const h = (zl - C) / r;
    const ring = [];
    if (h >= 1) {
      for (let j = 0; j < N; j++) {
        const t = (j / N) * Math.PI * 2;
        ring.push([s, r * Math.cos(t), C + r * Math.sin(t)]);
      }
    } else {
      const a = Math.asin(Math.max(-1, h));
      const t0 = Math.PI - a;
      const t1 = 2 * Math.PI + a;
      for (let j = 0; j < N; j++) {
        const t = t0 + ((t1 - t0) * j) / (N - 1);
        ring.push([s, r * Math.cos(t), C + r * Math.sin(t)]);
      }
    }
    pos.push(ring);
  }
  const verts = [];
  const tri = (a, b, c) => verts.push(...a, ...b, ...c);
  for (let i = 0; i < pos.length - 1; i++) {
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      tri(pos[i][j], pos[i + 1][j], pos[i + 1][j1]);
      tri(pos[i][j], pos[i + 1][j1], pos[i][j1]);
    }
  }
  for (const k of [0, pos.length - 1]) {
    const c = pos[k].reduce((acc, p) => [acc[0] + p[0] / N, acc[1] + p[1] / N, acc[2] + p[2] / N], [0, 0, 0]);
    for (let j = 0; j < N; j++) tri(c, pos[k][j], pos[k][(j + 1) % N]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0xb07a1f, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(g, m);
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
})();
const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
liquid.material.clippingPlanes = [CUT_PLANE];

// Resortes del despiece (los mismos datos que la versión isométrica)
const spring = () => ({ x: 0, v: 0, target: 0, pending: null });
const s1 = Object.fromEntries(D.stagger.map((id) => [id, spring()]));
let s2 = {};
let mode = "armado";
let sel = null;
let level2 = false;
let hot = null;
let pinned = null;
let stepIndex = D.steps.length;
let playing = false;
let playTimer = 0;
let swapTimer = 0;
let clock = 0;
let last = 0;
let touring = !still.matches;
let tourTimer = 0;
const camGoal = { active: false, target: new THREE.Vector3(), dist: 900 };

function schedule(map, ids, value, gap) {
  let i = 0;
  for (const id of ids) {
    const s = map[id];
    if (!s) continue;
    if (s.target === value && !s.pending) continue;
    s.pending = { value, at: clock + (still.matches ? 0 : i++ * gap) };
  }
}
function settleSpring(s, dt, calm, sp) {
  if (s.pending && clock >= s.pending.at) {
    s.target = s.pending.value;
    s.pending = null;
  }
  if (calm) {
    s.x = s.target;
    s.v = 0;
    return s.pending !== null;
  }
  for (let i = 0; i < sp.substeps; i++) {
    const h = dt / sp.substeps;
    s.v += ((s.target - s.x) * sp.stiffness - s.v * sp.damping) * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.target - s.x) < 2e-4 && Math.abs(s.v) < 2e-4) {
    s.x = s.target;
    s.v = 0;
  }
  return true;
}
const share1 = (n) => s1[n.ride]?.x ?? 0;
const share2 = (n) => s2[n.ride2]?.x ?? 0;
function visibleNode(n) {
  if (mode === "corte" && !level2) {
    if (D.cut3dHide.includes(n.pid)) return false;
    if (D.cut3dShow.includes(n.pid)) return true;
  }
  if (level2) return n.asm === sel && !n.x2;
  if (n.x1) return false;
  if (mode === "pasos") {
    const mounted = D.steps.slice(0, stepIndex).flatMap((st) => st.springs);
    const moving = stepIndex < D.steps.length ? D.steps[stepIndex].springs : [];
    return n.ride === "via" || mounted.includes(n.ride) || (moving.includes(n.ride) && s1[n.ride].x < 0.999);
  }
  return true;
}
function offsetOf(n) {
  const a = share1(n);
  const b = level2 ? share2(n) : 0;
  return [n.m1[0] * a + n.m2[0] * b, n.m1[1] * a + n.m2[1] * b, n.m1[2] * a + n.m2[2] * b];
}

// Planos de recorte: mitades de chaqueta/aislamiento (siguen a la pieza) y el corte longitudinal
const AXIS = new THREE.Vector3(0, 0, D.C);
for (const n of nodes) {
  if (n.clip) n.halfPlane = new THREE.Plane(V(n.clip), 0);
}
function setClipping() {
  for (const n of nodes) {
    const planes = [];
    if (n.halfPlane) planes.push(n.halfPlane);
    if (mode === "corte" && !level2 && D.cut3dClip.includes(n.pid)) planes.push(CUT_PLANE);
    const before = n.mat.clippingPlanes ? n.mat.clippingPlanes.length : 0;
    n.mat.clippingPlanes = planes.length ? planes : null;
    if (before !== planes.length) n.mat.needsUpdate = true;
  }
  liquid.visible = mode === "corte" && !level2;
}

function place(dt, calm) {
  let moving = false;
  for (const o of trackObjects) o.visible = !level2;
  for (const n of nodes) {
    const show = visibleNode(n);
    const dim = hot && !show ? 0 : hot && n.pid !== hot && !(hotAsm && n.asm === hotAsm) ? 0.45 : 1;
    n.goal = show ? dim : 0;
    if (car.swap) n.goal = 0;
    const k = calm ? 1 : 1 - Math.exp(-dt / 0.12);
    const before = n.alpha;
    n.alpha += (n.goal - n.alpha) * k;
    if (Math.abs(n.goal - n.alpha) < 0.01) n.alpha = n.goal;
    if (n.alpha !== before) moving = true;
    n.group.visible = n.alpha > 0.01;
    const transparent = n.alpha < 0.999;
    if (n.mat.transparent !== transparent) {
      n.mat.transparent = transparent;
      n.mat.depthWrite = !transparent;
      n.mat.needsUpdate = true;
    }
    n.mat.opacity = n.alpha;
    const o = offsetOf(n);
    n.group.position.set(o[0], o[1], o[2]);
    if (n.halfPlane) {
      const p = AXIS.clone().add(n.group.position);
      n.halfPlane.constant = -n.halfPlane.normal.dot(p);
    }
    const isHot = hot && (n.pid === hot || (hotAsm && n.asm === hotAsm));
    n.mat.emissive.setHex(isHot ? 0x1d63c9 : 0x000000);
    n.mat.emissiveIntensity = isHot ? 0.35 : 0;
  }
  return moving;
}
const car = { swap: false };

// Cámara: encuadra lo visible en su posición final
function goalBox() {
  const box = new THREE.Box3();
  for (const n of nodes) {
    let show;
    let a = 0;
    let b = 0;
    if (level2) {
      show = n.asm === sel && !n.x2;
      b = 1;
    } else {
      show = !n.x1 && n.asm !== "via";
      const sp = s1[n.ride];
      a = mode === "despiece" && sp ? (sp.pending ? sp.pending.value : sp.target) : 0;
    }
    if (!show || n.home.isEmpty()) continue;
    const off = new THREE.Vector3(n.m1[0] * a + n.m2[0] * b, n.m1[1] * a + n.m2[1] * b, n.m1[2] * a + n.m2[2] * b);
    box.union(n.home.clone().translate(off));
  }
  return box;
}
function aim(force = false) {
  const box = goalBox();
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const fov = (camera.fov * Math.PI) / 180;
  const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
  camGoal.target.copy(sphere.center);
  camGoal.dist = (sphere.radius / Math.sin(fit / 2)) * 0.92;
  camGoal.active = true;
  if (force) {
    const dir = new THREE.Vector3(Math.cos(1.12), Math.sin(1.12) * 1.0, 0.42).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, camGoal.dist);
    controls.target.copy(sphere.center);
    camGoal.active = false;
  }
}
function steerCamera(dt, calm) {
  if (!camGoal.active) return false;
  const k = calm ? 1 : 1 - Math.exp(-dt / 0.35);
  const dir = camera.position.clone().sub(controls.target);
  const dist = dir.length();
  dir.normalize();
  controls.target.lerp(camGoal.target, k);
  const nd = dist + (camGoal.dist - dist) * k;
  camera.position.copy(controls.target).addScaledVector(dir, nd);
  if (controls.target.distanceTo(camGoal.target) < 0.5 && Math.abs(nd - camGoal.dist) < 1) camGoal.active = false;
  return true;
}
controls.addEventListener("start", () => {
  camGoal.active = false;
  stopTour();
});

// Lectura y ficha
const PIECES = new Set(nodes.filter((n) => n.asm !== "via" && !n.x1).map((n) => n.pid)).size;
const count = (asm) => new Set(nodes.filter((n) => n.asm === asm && !n.x2).map((n) => n.pid)).size;
function anyMoving() {
  return Object.values(s1).some((s) => s.x !== s.target || s.pending) || Object.values(s2).some((s) => s.x !== s.target || s.pending);
}
function say() {
  let text;
  if (mode === "corte") text = `corte longitudinal · llenado ${Math.round(D.fill * 100)} % · ${D.fillLitres.toLocaleString("es-MX")} L`;
  else if (mode === "pasos") text = stepIndex === 0 ? `paso 0 de ${D.steps.length} · vía libre` : `paso ${stepIndex} de ${D.steps.length} · ${D.steps[stepIndex - 1].es.toLowerCase()}`;
  else if (level2) text = anyMoving() ? `${D.ensambles[sel].es.toLowerCase()} · abriendo` : `${D.ensambles[sel].es.toLowerCase()} · ${count(sel)} piezas`;
  else if (mode === "despiece") text = anyMoving() ? "separando ensambles" : "despiece · 8 ensambles";
  else text = anyMoving() ? "armando" : `armado · ${PIECES} piezas`;
  if (readout.textContent !== text) readout.textContent = text;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function showPart(pid) {
  if (!pid) {
    info.innerHTML = mode === "corte" ? D.corteInfo : D.infoDefault;
    return;
  }
  const p = D.parts[pid];
  const t = D.tipos[p.t];
  const a = D.ensambles[p.a];
  info.innerHTML = `<p class="ct-info-asm">${a.n ? String(a.n).padStart(2, "0") + " · " : ""}${esc(a.es)}</p><h3 class="ct-info-name">${esc(t.es)} <span>(${esc(t.en)})</span></h3><dl><dt>Función</dt><dd>${esc(t.fn)}</dd><dt>Material</dt><dd>${esc(t.mat)}</dd></dl>`;
}
let hotAsm = null;
function setHot(pid) {
  if (hot === pid && !hotAsm) return;
  hot = pid;
  hotAsm = null;
  showPart(pid ?? pinned);
  run();
}

// Modos
const HINTS = { armado: "Toca una pieza para ver su ficha", despiece: "Elige un ensamble para abrirlo en piezas", pasos: "Avanza el montaje paso a paso", corte: "Corte por el plano vertical del eje" };
function setMode(next, { quiet = false } = {}) {
  if (!quiet) stopTour();
  if (mode === next && next !== "despiece") return;
  if (next !== "despiece" && level2) closeLevel2();
  mode = next;
  modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  root.dataset.mode = mode;
  stepBox.hidden = mode !== "pasos";
  if (mode === "armado" || mode === "corte") schedule(s1, [...D.stagger].reverse(), 0, D.spring.stagger);
  if (mode === "despiece") schedule(s1, D.stagger, 1, D.spring.stagger);
  if (mode === "pasos") {
    stepIndex = 0;
    for (const id of D.stagger) Object.assign(s1[id], { x: 1, v: 0, target: 1, pending: null });
    showStep();
  }
  if (hint) hint.textContent = HINTS[mode];
  if (!pinned) showPart(null);
  setClipping();
  live.textContent = { armado: "Carro armado", despiece: "Despiece en ensambles", pasos: "Montaje paso a paso", corte: "Corte longitudinal del tanque" }[mode];
  aim();
  run();
}
function openLevel2(asm) {
  stopTour();
  if (mode !== "despiece") setMode("despiece", { quiet: true });
  if (sel === asm && level2) {
    closeLevel2();
    schedule(s1, D.stagger, 1, D.spring.stagger);
    aim();
    run();
    return;
  }
  if (level2) closeLevel2();
  sel = asm;
  asmButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.asm === asm)));
  car.swap = true;
  clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    level2 = true;
    for (const id of D.stagger) Object.assign(s1[id], { x: 0, v: 0, target: 0, pending: null });
    s2 = Object.fromEntries((D.l2[asm]?.order ?? []).map((id) => [id, spring()]));
    car.swap = false;
    setClipping();
    schedule(s2, D.l2[asm]?.order ?? [], 1, D.spring2.stagger);
    aim();
    run();
  }, still.matches ? 0 : 260);
  pinned = null;
  info.innerHTML = `<p class="ct-info-asm">${String(D.ensambles[asm].n).padStart(2, "0")} · ${esc(D.ensambles[asm].en)}</p><h3 class="ct-info-name">${esc(D.ensambles[asm].es)}</h3><p>${esc(D.ensambles[asm].say)}. Gira el modelo y toca cada pieza para ver su nombre, función y material.</p>`;
  live.textContent = `${D.ensambles[asm].es} abierto en sus piezas`;
  run();
}
function closeLevel2() {
  clearTimeout(swapTimer);
  car.swap = false;
  level2 = false;
  sel = null;
  s2 = {};
  asmButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
  setClipping();
}
function showStep() {
  const st = D.steps[Math.max(0, stepIndex - 1)];
  stepLabel.textContent = stepIndex === 0 ? `Paso 0 de ${D.steps.length} · Vía` : `Paso ${stepIndex} de ${D.steps.length} · ${st.es}`;
  stepLine.textContent = stepIndex === 0 ? "Vía de trocha estándar (1435 mm) lista para recibir el carro." : st.line;
  stepPrev.disabled = stepIndex === 0;
  stepNext.disabled = stepIndex === D.steps.length;
  asmButtons.forEach((b) => b.setAttribute("aria-pressed", String(stepIndex > 0 && b.dataset.asm === st.asm)));
}
function goStep(i) {
  stopTour();
  const next = Math.max(0, Math.min(D.steps.length, i));
  if (next > stepIndex) {
    for (let j = stepIndex; j < next - 1; j++) for (const id of D.steps[j].springs) Object.assign(s1[id], { x: 0, v: 0, target: 0, pending: null });
    for (const id of D.steps[next - 1].springs) Object.assign(s1[id], { x: 1, v: 0, target: 1, pending: null });
    stepIndex = next;
    schedule(s1, D.steps[next - 1].springs, 0, D.spring.stagger);
  } else if (next < stepIndex) {
    for (let j = next; j < stepIndex; j++) for (const id of D.steps[j].springs) Object.assign(s1[id], { x: 1, v: 0, target: 1, pending: null });
    stepIndex = next;
  }
  showStep();
  live.textContent = stepLabel.textContent + ". " + stepLine.textContent;
  run();
}
function play() {
  playing = !playing;
  stepPlay.textContent = playing ? "Pausa" : "Reproducir";
  clearTimeout(playTimer);
  if (!playing) return;
  if (stepIndex >= D.steps.length) goStep(0);
  const tickStep = () => {
    if (!playing) return;
    if (stepIndex >= D.steps.length) {
      playing = false;
      stepPlay.textContent = "Reproducir";
      return;
    }
    goStep(stepIndex + 1);
    playTimer = setTimeout(tickStep, still.matches ? 1600 : 2600);
  };
  playTimer = setTimeout(tickStep, 300);
}
function stopTour() {
  if (!touring) return;
  touring = false;
  clearTimeout(tourTimer);
}
function tour(step = 0) {
  if (!touring) return;
  const seq = [["despiece", 4800], ["armado", 5600]];
  const [m, wait] = seq[step % seq.length];
  setMode(m, { quiet: true });
  tourTimer = setTimeout(() => tour(step + 1), wait);
}

// Selección con el puntero
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const meshes = [];
  for (const n of nodes) if (n.group.visible && n.goal > 0.5) for (const m of n.group.children) meshes.push(m);
  const hits = ray.intersectObjects(meshes, false);
  for (const h of hits) {
    const n = h.object.userData.node;
    // con el corte, lo que queda del lado quitado no se puede tocar
    if (mode === "corte" && !level2 && n.mat.clippingPlanes && h.point.y > 0.01) continue;
    if (n.asm === "via") return null;
    return n;
  }
  return null;
}
let downAt = null;
canvas.addEventListener("pointerdown", (e) => {
  downAt = [e.clientX, e.clientY];
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" || e.buttons) return;
  const n = pick(e);
  setHot(n ? n.pid : null);
});
canvas.addEventListener("pointerleave", () => setHot(null));
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  stopTour();
  const n = pick(e);
  pinned = n ? n.pid : null;
  hot = null;
  setHot(pinned);
});

modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
asmButtons.forEach((b) =>
  b.addEventListener("click", () => {
    stopTour();
    hot = null;
    hotAsm = null;
    if (mode === "pasos") {
      const i = D.steps.findIndex((st) => st.asm === b.dataset.asm);
      if (i >= 0) goStep(i + 1);
      return;
    }
    openLevel2(b.dataset.asm);
  }),
);
asmButtons.forEach((b) =>
  b.addEventListener("pointerenter", () => {
    if (level2 || mode === "pasos") return;
    hot = "__";
    hotAsm = b.dataset.asm;
    run();
  }),
);
asmButtons.forEach((b) => b.addEventListener("pointerleave", () => setHot(null)));
stepPrev.addEventListener("click", () => goStep(stepIndex - 1));
stepNext.addEventListener("click", () => goStep(stepIndex + 1));
stepPlay.addEventListener("click", play);
resetButton.addEventListener("click", () => {
  stopTour();
  aim(true);
  run();
});
stage.addEventListener("keydown", (e) => {
  const keys = { ArrowRight: 1, ArrowLeft: -1 };
  if (e.key === "Escape") {
    setMode("armado");
    e.preventDefault();
  } else if (keys[e.key] && mode === "pasos") {
    goStep(stepIndex + keys[e.key]);
    e.preventDefault();
  } else if (keys[e.key]) {
    const list = Object.keys(D.ensambles).filter((a) => a !== "via").sort((a, b) => D.ensambles[a].n - D.ensambles[b].n);
    const i = sel ? list.indexOf(sel) : -1;
    openLevel2(list[(i + keys[e.key] + list.length) % list.length]);
    e.preventDefault();
  } else if (e.key === " " || e.key === "Enter") {
    setMode(mode === "despiece" ? "armado" : "despiece");
    e.preventDefault();
  }
});
root.addEventListener("pointerdown", stopTour, { capture: true });
root.addEventListener("keydown", stopTour, { capture: true });

// Bucle
let frame = 0;
let visibleStage = true;
function resize() {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
  last = now;
  clock += dt;
  const calm = still.matches;
  let moving = false;
  for (const id of D.stagger) moving = settleSpring(s1[id], dt, calm, D.spring) || moving;
  for (const id of Object.keys(s2)) moving = settleSpring(s2[id], dt, calm, D.spring2) || moving;
  moving = anyMoving() || moving;
  moving = place(dt, calm) || moving;
  moving = steerCamera(dt, calm) || moving;
  moving = controls.update() || moving;
  resize();
  renderer.render(scene, camera);
  say();
  frame = moving && visibleStage ? requestAnimationFrame(tick) : 0;
}
function run() {
  if (!frame && visibleStage) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}
controls.addEventListener("change", run);
new ResizeObserver(run).observe(canvas);
new IntersectionObserver((entries) => {
  visibleStage = entries[entries.length - 1].isIntersecting;
  if (visibleStage) run();
}, { rootMargin: "120px 0px" }).observe(stage);

showPart(null);
resize();
setMode("armado", { quiet: true });
aim(true);
if (touring) tourTimer = setTimeout(() => tour(0), 2200);
run();
window.__ct = { setMode, openLevel2, goStep, stopTour, s1, nodes, camera, controls, get s2() { return s2; } };
