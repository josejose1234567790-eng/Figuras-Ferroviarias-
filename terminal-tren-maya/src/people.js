// Personal de la terminal: figuras articuladas de 1.65 a 1.80 m con ropa de trabajo, chaleco reflejante,
// casco y botas; caminata con ciclo natural, ademanes (señales manuales, radio, inspección) y etiqueta de puesto.
import * as THREE from "three";
import { std, dust } from "./materials.js";
import * as TX from "./textures.js";
import { rng } from "./util.js";

export const ROLES = {
  jefe: { nombre: "Jefe de patio", casco: 0xf2f2ee, ropa: 0x4a5a72, chaleco: 0x9c2148 },
  maquinista: { nombre: "Maquinista", casco: 0x1f4f8c, ropa: 0x45597a, chaleco: 0xf26a1b },
  conductor: { nombre: "Conductor de tren", casco: 0xf2c418, ropa: 0x45597a, chaleco: 0xf26a1b },
  inspector: { nombre: "Inspector de carros", casco: 0xf2c418, ropa: 0x5c5f4a, chaleco: 0xc8e021 },
  bascula: { nombre: "Operador de báscula", casco: 0xf2f2ee, ropa: 0x6b6355, chaleco: 0xc8e021 },
  llenadera: { nombre: "Operador de llenadera", casco: 0xf26a1b, ropa: 0x45597a, chaleco: 0xf26a1b },
  combustible: { nombre: "Despachador de combustible", casco: 0xf26a1b, ropa: 0x5c5f4a, chaleco: 0xc8e021 },
  seguridad: { nombre: "Supervisor de seguridad", casco: 0x155b4e, ropa: 0x4a5a72, chaleco: 0xc8e021 },
  vigilante: { nombre: "Vigilante", casco: null, ropa: 0x3c4a36, chaleco: 0xc8e021 },
};

const SKIN = [0x8d5a3b, 0x9b6a48, 0x7a4b30, 0xa77655, 0x6e4329];

// Lathe a partir de radios por altura (perfil suave), con achatado en profundidad
function lathe(rows, seg = 14, depth = 1) {
  const pts = rows.map(([y, r]) => new THREE.Vector2(Math.max(0.001, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(1, 1, depth);
  g.computeVertexNormals();
  return g;
}
// Segmento de extremidad: cápsula ahusada de longitud L hacia -Y desde la articulación
function limb(L, r0, r1, seg = 10) {
  const rows = [
    [0, r0 * 0.6],
    [-r0 * 0.4, r0],
    [-L * 0.5, (r0 + r1) / 2 * 1.04],
    [-L + r1 * 0.4, r1],
    [-L, r1 * 0.55],
  ];
  return lathe(rows.map(([y, r]) => [y, r]).reverse().map(([y, r]) => [y, r]), seg);
}

function vestTexture(color) {
  return TX.tex(
    (() => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d");
      g.fillStyle = "#" + new THREE.Color(color).getHexString();
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#cfd3d4";
      g.fillRect(0, 150, 256, 22);
      g.fillRect(0, 200, 256, 22);
      for (const x of [40, 216]) g.fillRect(x - 11, 0, 22, 150);
      const d = g.getImageData(0, 0, 256, 256);
      for (let i = 0; i < d.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 14;
        d.data[i] += n;
        d.data[i + 1] += n;
        d.data[i + 2] += n;
      }
      g.putImageData(d, 0, 0);
      return c;
    })(),
  );
}

const matCache = new Map();
function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

export class Person {
  constructor(role, { height = 1.72, seed = 1, prop = null } = {}) {
    const R = ROLES[role];
    this.role = role;
    this.nombre = R.nombre;
    const r = rng(seed * 7919 + 3);
    const H = height;
    this.H = H;
    const skin = mat(`skin${seed % SKIN.length}`, () => std({ color: SKIN[seed % SKIN.length], roughness: 0.62 }));
    const cloth = mat(`cloth${R.ropa}`, () => dust(std({ color: R.ropa, roughness: 0.92, map: TX.paint("#c8c8c8", { seed: 70, grime: 0.2 }).map }), { height: 0.25, amount: 0.25, color: [0.62, 0.55, 0.45] }));
    const vest = mat(`vest${R.chaleco}`, () => std({ map: vestTexture(R.chaleco), roughness: 0.75 }));
    const boot = mat("boot", () => dust(std({ color: 0x3a2c22, roughness: 0.7 }), { height: 0.12, amount: 0.35, color: [0.62, 0.55, 0.45] }));
    const glove = mat("glove", () => std({ color: 0x8a7a5c, roughness: 0.9 }));
    const hat = R.casco ? mat(`hat${R.casco}`, () => std({ color: R.casco, roughness: 0.35, metalness: 0 })) : null;
    const dark = mat("dark", () => std({ color: 0x15181a, roughness: 0.3, metalness: 0.4 }));
    const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const root = new THREE.Group();
    root.name = "persona";
    root.userData.person = this;
    this.root = root;
    const hipY = 0.53 * H;
    const hips = new THREE.Group();
    hips.position.y = hipY;
    root.add(hips);
    this.hips = hips;
    // pelvis
    add(hips, lathe([[-0.07 * H, 0.0], [-0.06 * H, 0.08 * H], [0.0, 0.098 * H], [0.03 * H, 0.094 * H]], 14, 0.7), cloth);
    // torso (se inclina desde la cintura)
    const spine = new THREE.Group();
    spine.position.y = 0.03 * H;
    hips.add(spine);
    this.spine = spine;
    const tor = [
      [0, 0.092 * H],
      [0.08 * H, 0.088 * H],
      [0.17 * H, 0.1 * H],
      [0.235 * H, 0.112 * H],
      [0.27 * H, 0.1 * H],
      [0.29 * H, 0.05 * H],
      [0.3 * H, 0.032 * H],
    ];
    add(spine, lathe(tor, 16, 0.66), cloth);
    // chaleco: un poco más amplio entre cintura y pecho
    add(spine, lathe([[0.05 * H, 0.096 * H], [0.17 * H, 0.106 * H], [0.24 * H, 0.117 * H], [0.27 * H, 0.104 * H]], 16, 0.7), vest);
    // cuello y cabeza
    const neck = new THREE.Group();
    neck.position.y = 0.3 * H;
    spine.add(neck);
    this.neck = neck;
    add(neck, new THREE.CylinderGeometry(0.03 * H, 0.034 * H, 0.05 * H, 10), skin, 0, 0.02 * H, 0);
    const head = new THREE.Group();
    head.position.y = 0.045 * H;
    neck.add(head);
    this.head = head;
    const hg = new THREE.SphereGeometry(0.058 * H, 18, 14);
    hg.scale(0.86, 1.08, 0.95);
    add(head, hg, skin, 0, 0.06 * H, 0.004 * H);
    // nariz y orejas (volumen mínimo para leer la orientación)
    const nose = new THREE.SphereGeometry(0.011 * H, 8, 6);
    nose.scale(0.8, 1.1, 1);
    add(head, nose, skin, 0.05 * H, 0.055 * H, 0);
    for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.012 * H, 8, 6), skin, 0.0, 0.06 * H, s * 0.05 * H);
    // lentes de seguridad
    const gl = new THREE.TorusGeometry(0.052 * H, 0.008 * H, 6, 20, Math.PI * 0.9);
    gl.rotateX(Math.PI / 2);
    gl.rotateY(-Math.PI * 0.45);
    add(head, gl, dark, 0.0, 0.07 * H, 0);
    if (hat) {
      const shell = new THREE.SphereGeometry(0.066 * H, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      shell.scale(1.05, 0.95, 0.95);
      add(head, shell, hat, -0.004 * H, 0.085 * H, 0);
      const brim = new THREE.CylinderGeometry(0.074 * H, 0.076 * H, 0.008 * H, 22);
      brim.scale(1.15, 1, 1);
      add(head, brim, hat, 0.008 * H, 0.085 * H, 0);
    } else {
      const cap = new THREE.SphereGeometry(0.062 * H, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
      add(head, cap, cloth, 0, 0.085 * H, 0);
      const visor = new THREE.CylinderGeometry(0.045 * H, 0.045 * H, 0.006 * H, 14, 1, false, -Math.PI / 2, Math.PI);
      add(head, visor, cloth, 0.05 * H, 0.09 * H, 0);
    }
    // brazos
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0, 0.255 * H, s * 0.118 * H);
      spine.add(sh);
      add(sh, new THREE.SphereGeometry(0.04 * H, 10, 8), cloth, 0, 0, 0);
      add(sh, limb(0.18 * H, 0.04 * H, 0.033 * H), cloth);
      const el = new THREE.Group();
      el.position.y = -0.18 * H;
      sh.add(el);
      add(el, limb(0.15 * H, 0.032 * H, 0.025 * H), cloth);
      const hand = new THREE.SphereGeometry(0.026 * H, 10, 8);
      hand.scale(0.7, 1.35, 0.9);
      add(el, hand, glove, 0, -0.17 * H, 0);
      this.arms.push({ sh, el, s });
    }
    // piernas
    this.legs = [];
    for (const s of [-1, 1]) {
      const th = new THREE.Group();
      th.position.set(0, -0.02 * H, s * 0.055 * H);
      hips.add(th);
      add(th, limb(0.245 * H, 0.068 * H, 0.047 * H, 12), cloth);
      const kn = new THREE.Group();
      kn.position.y = -0.245 * H;
      th.add(kn);
      add(kn, limb(0.23 * H, 0.047 * H, 0.034 * H, 12), cloth);
      const ft = new THREE.Group();
      ft.position.y = -0.235 * H;
      kn.add(ft);
      const b = new THREE.SphereGeometry(0.05 * H, 12, 8);
      b.scale(1.45, 0.62, 0.72);
      add(ft, b, boot, 0.03 * H, -0.012 * H, 0);
      this.legs.push({ th, kn, ft, s });
    }
    // utilería según el puesto
    if (prop === "radio" || role === "jefe" || role === "conductor") {
      const rd = new THREE.BoxGeometry(0.03 * H, 0.08 * H, 0.02 * H);
      add(this.arms[1].el, rd, dark, 0.02 * H, -0.19 * H, 0);
    }
    if (role === "seguridad") add(this.arms[0].el, new THREE.BoxGeometry(0.02 * H, 0.12 * H, 0.09 * H), mat("clip", () => std({ color: 0x8a6a40, roughness: 0.8 })), 0.03 * H, -0.18 * H, 0);
    this.state = { mode: "idle", t: r() * 10, gesture: null, speed: 0, path: null, seg: 0, segS: 0 };
    this.phase = r() * Math.PI * 2;
    this.seed = seed;
  }

  // Camina por una polilínea [[x,z],...] a 'speed' m/s (y fija del piso)
  walk(path, { speed = 1.25, loop = false, y = 0 } = {}) {
    this.state.mode = "walk";
    this.state.path = path;
    this.state.loop = loop;
    this.state.speed = speed;
    this.state.seg = 0;
    this.state.segS = 0;
    this.root.position.set(path[0][0], y, path[0][1]);
    this.groundY = y;
  }
  stand(x, y, z, facing = 0) {
    this.state.mode = "idle";
    this.root.position.set(x, y, z);
    this.root.rotation.y = facing;
    this.groundY = y;
  }
  gesture(name) {
    this.state.gesture = name;
  }

  update(dt) {
    const S = this.state;
    S.t += dt;
    const t = S.t;
    const H = this.H;
    // postura base
    let swing = 0;
    let bob = 0;
    if (S.mode === "walk" && S.path) {
      const P = S.path;
      let a = P[S.seg];
      let b = P[(S.seg + 1) % P.length];
      let L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      S.segS += S.speed * dt;
      while (S.segS > L) {
        S.segS -= L;
        S.seg++;
        if (S.seg >= P.length - 1) {
          if (S.loop) S.seg = 0;
          else {
            S.seg = P.length - 2;
            S.segS = L;
            S.mode = "idle";
            break;
          }
        }
        a = P[S.seg];
        b = P[S.seg + 1];
        L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      const f = Math.min(1, S.segS / L);
      this.root.position.x = a[0] + (b[0] - a[0]) * f;
      this.root.position.z = a[1] + (b[1] - a[1]) * f;
      const target = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      let d = target - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * Math.min(1, dt * 6);
      // ciclo de marcha: zancada ≈ 0.42·H por paso
      const freq = S.speed / (0.42 * H) / 2;
      S.cyc = (S.cyc || 0) + dt * freq * Math.PI * 2;
      swing = Math.sin(S.cyc);
      bob = Math.abs(Math.cos(S.cyc));
    }
    const walking = S.mode === "walk";
    const k = walking ? 1 : 0;
    this.hips.position.y = 0.53 * H - (walking ? 0.012 * H * (1 - bob) : 0) + Math.sin(t * 1.6 + this.phase) * 0.002 * H;
    this.hips.rotation.y = swing * 0.08 * k;
    this.spine.rotation.y = -swing * 0.12 * k;
    this.spine.rotation.z = walking ? -0.05 : Math.sin(t * 0.5 + this.phase) * 0.01;
    this.spine.rotation.x = 0;
    this.neck.rotation.y = walking ? 0 : Math.sin(t * 0.3 + this.phase) * 0.35;
    this.neck.rotation.z = 0;
    for (const lg of this.legs) {
      const p = swing * lg.s;
      lg.th.rotation.z = walking ? p * 0.45 : 0.02;
      lg.kn.rotation.z = walking ? -Math.max(0, -Math.sin(S.cyc + (lg.s > 0 ? 0 : Math.PI)) ) * 0.75 - 0.05 : -0.03;
      lg.ft.rotation.z = walking ? Math.max(0, p) * -0.25 : 0.01;
    }
    for (const ar of this.arms) {
      ar.sh.rotation.set(0.08 * ar.s, 0, walking ? -swing * ar.s * 0.4 : 0.05);
      ar.el.rotation.set(0, 0, walking ? 0.35 + Math.max(0, swing * ar.s) * 0.25 : 0.12);
    }
    // ademanes (señales manuales del reglamento y uso de radio)
    const g = S.gesture;
    if (g === "inspeccion") {
      this.spine.rotation.z = -0.45;
      this.neck.rotation.z = -0.25;
      this.legs.forEach((lg) => {
        lg.th.rotation.z = 0.35;
        lg.kn.rotation.z = -0.55;
      });
      this.hips.position.y = 0.5 * H;
      this.arms[0].sh.rotation.set(0, 0, 0.9);
      this.arms[0].el.rotation.set(0, 0, 0.3);
    } else if (g === "radio") {
      const R = this.arms[1];
      R.sh.rotation.set(-0.15, 0, 1.15);
      R.el.rotation.set(0, 0, 2.2);
    } else if (g === "avanzar") {
      // brazo arriba y abajo en vertical
      const R = this.arms[1];
      R.sh.rotation.set(-0.4, 0, 1.6 + Math.sin(t * 3.0) * 0.9);
      R.el.rotation.set(0, 0, 0.2);
    } else if (g === "alto") {
      // brazo extendido moviéndose horizontalmente
      const R = this.arms[1];
      R.sh.rotation.set(-1.45 + Math.sin(t * 2.6) * 0.5, 0, 0.1);
      R.el.rotation.set(0, 0, 0.05);
    } else if (g === "retroceder") {
      const R = this.arms[1];
      R.sh.rotation.set(-1.2, 0, 1.0 + Math.sin(t * 2.4) * 0.6);
      R.el.rotation.set(0, 0, 0.9 + Math.cos(t * 2.4) * 0.5);
    } else if (g === "señalar") {
      const R = this.arms[1];
      R.sh.rotation.set(-0.2, 0, 1.4);
      R.el.rotation.set(0, 0, 0.1);
    } else if (g === "brazos") {
      this.arms.forEach((a) => {
        a.sh.rotation.set(0.25 * a.s, 0, 0.35);
        a.el.rotation.set(0, 0, 1.6);
      });
    }
  }
}

// Etiquetas flotantes (HTML) con el nombre del puesto
export class Labels {
  constructor(container) {
    this.el = document.createElement("div");
    this.el.id = "etiquetas";
    container.appendChild(this.el);
    this.items = [];
    this.visible = true;
  }
  add(obj, text, offset = 2.2) {
    const d = document.createElement("div");
    d.className = "etiqueta";
    d.textContent = text;
    this.el.appendChild(d);
    this.items.push({ obj, d, offset });
  }
  update(camera, occluders = null) {
    this.el.style.display = this.visible ? "" : "none";
    if (!this.visible) return;
    this.frame = (this.frame || 0) + 1;
    const v = new THREE.Vector3();
    if (occluders && (this.frame % 12 === 1 || this.forceOcclusion)) {
      const ray = new THREE.Raycaster();
      for (const it of this.items) {
        it.obj.getWorldPosition(v);
        v.y += it.offset - 0.3;
        const d = v.distanceTo(camera.position);
        if (d > 220) continue;
        ray.set(camera.position, v.clone().sub(camera.position).normalize());
        ray.far = d - 0.5;
        it.hidden = ray.intersectObjects(occluders, true).length > 0;
      }
      this.forceOcclusion = false;
    }
    const w = innerWidth;
    const h = innerHeight;
    for (const it of this.items) {
      it.obj.getWorldPosition(v);
      v.y += it.offset;
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      const show = !it.hidden && v.z < 1 && v.z > -1 && dist < 220 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      it.d.style.display = show ? "" : "none";
      if (!show) continue;
      it.d.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      it.d.style.opacity = String(Math.max(0.35, Math.min(1, 1.4 - dist / 160)));
    }
  }
}

export function buildPeople(scene, labels, { RAIL_TOP, deckY }) {
  const group = new THREE.Group();
  group.name = "personal";
  scene.add(group);
  const people = [];
  const put = (role, opts, place) => {
    const p = new Person(role, opts);
    place(p);
    group.add(p.root);
    labels.add(p.root, p.nombre, p.H + 0.45);
    people.push(p);
    return p;
  };
  // jefe de patio frente a la caseta, hablando por radio
  put("jefe", { height: 1.74, seed: 1 }, (p) => {
    p.stand(-641, 0.0, 22.5, Math.PI / 2);
    p.gesture("radio");
  });
  // maquinista junto a la cabina de la TMY 2002
  put("maquinista", { height: 1.7, seed: 2 }, (p) => p.stand(463.5, 0.0, -3.1, Math.PI));
  // conductor dando señal de avanzar al costado del tren
  put("conductor", { height: 1.78, seed: 3 }, (p) => {
    p.stand(447, 0.0, -3.0, -Math.PI / 2 + 0.6);
    p.gesture("avanzar");
  });
  // inspector de carros caminando a lo largo del tren
  put("inspector", { height: 1.68, seed: 4 }, (p) => p.walk([[440, -3.1], [300, -3.1]], { speed: 1.1, loop: true }));
  put("inspector", { height: 1.75, seed: 9 }, (p) => {
    p.stand(431.4, 0.0, -3.2, Math.PI / 2);
    p.gesture("inspeccion");
  });
  // operador de báscula en la puerta de su caseta
  put("bascula", { height: 1.66, seed: 5 }, (p) => p.stand(-468.4, 0.33, 4.6, Math.PI / 2));
  // operador de llenadera en la plataforma
  put("llenadera", { height: 1.72, seed: 6 }, (p) => {
    p.stand(28, deckY + 0.03, -36.9, -Math.PI / 2);
    p.gesture("señalar");
  });
  // despachador en la isla de combustible
  put("combustible", { height: 1.7, seed: 7 }, (p) => p.stand(40.5, 0.2, 9.0, Math.PI / 2));
  // supervisor de seguridad al pie de la escalera de la llenadera
  put("seguridad", { height: 1.8, seed: 8 }, (p) => {
    p.stand(-36, 0.0, -41.5, -0.4);
    p.gesture("brazos");
  });
  // vigilante en el acceso
  put("vigilante", { height: 1.76, seed: 10 }, (p) => p.walk([[-664, 88], [-664, 95], [-656, 95], [-656, 88]], { speed: 0.8, loop: true }));
  for (const p of people) p.update(0.01);
  return { group, people, update: (dt) => people.forEach((p) => p.update(dt)) };
}
