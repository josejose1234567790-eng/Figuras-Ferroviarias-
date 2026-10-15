// Tren de carga, barreras y señales luminosas del cruce.
// El tren avanza hacia +x. Su frente llega al borde poniente del cruce (x = −42.5) al terminar el
// preaviso, y el cruce sigue cerrado hasta que el último carro libera los 85 m, más la reapertura.
window.crearTren = function crearTren(S, MODELO) {
  const T = S.T;
  const { PI, min, max, sin, cos, abs } = Math;
  const { CRUCE } = MODELO;
  const HALF = CRUCE.anchoCruce / 2;
  const RAIL_TOP = S.TRACK.railTop;
  const GZ = S.GATE_Z;

  const std = S.std;
  const M = {
    loco: std({ color: 0x2c3a48, metalness: 0.35, roughness: 0.45, envMapIntensity: 0.6 }),
    locoStripe: std({ color: 0xf0b323, roughness: 0.5 }),
    hopper: std({ color: 0xb9bbb5, metalness: 0.3, roughness: 0.55, envMapIntensity: 0.5 }),
    box: std({ color: 0x7a3e2b, roughness: 0.7 }),
    tank: std({ color: 0x1f2124, metalness: 0.4, roughness: 0.45, envMapIntensity: 0.6 }),
    gondola: std({ color: 0x5b4a3c, roughness: 0.85 }),
    under: std({ color: 0x1d1e20, metalness: 0.5, roughness: 0.6 }),
    wheel: std({ color: 0x3a3836, metalness: 0.7, roughness: 0.45 }),
    glass: new T.MeshStandardMaterial({ color: 0x1a222a, metalness: 0.5, roughness: 0.1 }),
    head: new T.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff1c4, emissiveIntensity: 1.2 }),
    rail: std({ color: 0x4a4d50, metalness: 0.6, roughness: 0.5 }),
  };
  const add = (parent, geo, mat, x, y, z, cast = true) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const G = {}; // geometrías compartidas
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const wheelGeo = new T.CylinderGeometry(0.46, 0.46, 0.14, 18).rotateX(PI / 2);
  const gauge = S.TRACK.gauge / 2 + 0.035;
  function bogie(parent, xc, axles, spacing) {
    add(parent, box(spacing * (axles - 1) + 1.6, 0.55, 2.3), M.under, xc, 0.85, 0);
    for (let i = 0; i < axles; i++) {
      const x = xc + (i - (axles - 1) / 2) * spacing;
      for (const z of [-gauge, gauge]) add(parent, wheelGeo, M.wheel, x, RAIL_TOP + 0.46, z, false);
    }
  }
  // Locomotora diésel-eléctrica de 6 ejes, 22 m. Frente en x = 0, cuerpo hacia −x.
  function locomotive() {
    const g = new T.Group();
    const c = -11;
    add(g, box(21.4, 0.45, 3.1), M.under, c, 1.55, 0);
    add(g, box(21.6, 0.18, 3.12), M.locoStripe, c, 1.86, 0, false);
    add(g, box(13.2, 2.75, 2.5), M.loco, c - 2.8, 3.32, 0); // cofre largo
    add(g, box(3.2, 3.15, 2.5), M.loco, c - 10.1, 3.55, 0); // radiadores
    add(g, box(3.2, 0.2, 2.6), M.under, c - 10.1, 5.2, 0, false);
    add(g, box(3.4, 3.0, 3.1), M.loco, c + 6.8, 3.45, 0); // cabina
    add(g, box(3.5, 0.18, 3.2), M.loco, c + 6.8, 5.02, 0);
    add(g, box(0.06, 0.95, 2.6), M.glass, c + 8.53, 4.25, 0, false); // parabrisas
    for (const z of [-1.56, 1.56]) add(g, box(1.6, 0.8, 0.04), M.glass, c + 6.9, 4.3, z, false);
    add(g, box(1.6, 2.1, 2.5), M.loco, c + 9.3, 3.0, 0); // nariz
    add(g, box(1.62, 0.22, 2.52), M.locoStripe, c + 9.3, 2.2, 0, false);
    add(g, box(0.1, 0.3, 0.6), M.head, c + 10.12, 3.6, 0, false); // fanal
    add(g, box(6.5, 1.1, 2.2), M.under, c - 0.5, 0.95, 0); // tanque de combustible
    for (const z of [-1.5, 1.5]) add(g, box(19, 0.05, 0.05), M.rail, c - 1, 2.95, z, false); // pasamanos
    for (let k = 0; k < 4; k++) add(g, new T.CylinderGeometry(0.55, 0.55, 0.25, 16), M.under, c - 8 + k * 1.6, 4.75, 0, false); // ventiladores
    bogie(g, c - 7.4, 3, 1.95);
    bogie(g, c + 7.0, 3, 1.95);
    return g;
  }
  // Carros de carga de 22 m (de enganche a enganche).
  function car(kind) {
    const g = new T.Group();
    const c = -11;
    add(g, box(20.6, 0.35, 2.9), M.under, c, 1.3, 0);
    for (const x of [c - 10.6, c + 10.6]) add(g, box(0.7, 0.3, 0.35), M.under, x, 1.0, 0, false); // enganches
    if (kind === "hopper") {
      add(g, box(19.6, 2.6, 3.1), M.hopper, c, 3.1, 0);
      const roof = new T.CylinderGeometry(1.55, 1.55, 19.6, 20, 1, false, -PI / 2, PI).rotateZ(PI / 2);
      add(g, roof, M.hopper, c, 4.38, 0).scale.y = 0.32;
      const pyr = new T.ConeGeometry(1.9, 1.3, 4).rotateY(PI / 4).rotateX(PI);
      for (const dx of [-6, 0, 6]) add(g, pyr, M.hopper, c + dx, 1.25, 0);
      for (let k = 0; k < 6; k++) add(g, box(0.8, 0.12, 0.7), M.under, c - 7.5 + k * 3, 4.9, 0, false);
      add(g, box(19.4, 0.06, 0.5), M.under, c, 4.88, 0, false); // pasarela del techo
      for (let k = 0; k < 9; k++) for (const z of [-1.56, 1.56]) add(g, box(0.08, 2.5, 0.04), M.hopper, c - 9 + k * 2.25, 3.1, z, false);
    } else if (kind === "box") {
      add(g, box(19.8, 3.7, 3.2), M.box, c, 3.35, 0);
      add(g, box(19.9, 0.15, 3.3), M.box, c, 5.25, 0);
      for (const z of [-1.62, 1.62]) add(g, box(3.6, 3.1, 0.06), M.under, c, 3.2, z, false); // puerta
      for (let k = 0; k < 11; k++) for (const z of [-1.61, 1.61]) add(g, box(0.07, 3.6, 0.03), M.box, c - 9.6 + k * 1.92, 3.35, z, false);
    } else if (kind === "tank") {
      const shell = new T.CylinderGeometry(1.45, 1.45, 18.4, 28).rotateZ(PI / 2);
      add(g, shell, M.tank, c, 3.05, 0);
      for (const dx of [-9.2, 9.2]) add(g, new T.SphereGeometry(1.45, 20, 12, 0, PI * 2, 0, PI / 2).rotateZ(dx > 0 ? -PI / 2 : PI / 2), M.tank, c + dx, 3.05, 0);
      add(g, new T.CylinderGeometry(0.5, 0.5, 0.5, 16), M.tank, c, 4.6, 0);
      add(g, box(3, 0.08, 3.3), M.under, c, 4.55, 0, false);
    } else {
      add(g, box(19.6, 1.8, 3.1), M.gondola, c, 2.4, 0);
      const load = box(18.8, 0.6, 2.8);
      add(g, load, std({ color: 0xcfc6b2, roughness: 1 }), c, 3.4, 0); // piedra caliza
    }
    bogie(g, c - 7.6, 2, 1.8);
    bogie(g, c + 7.6, 2, 1.8);
    return g;
  }

  // Tren armado una sola vez con 33 carros; el de 20 oculta los últimos 13.
  const trainG = new T.Group();
  trainG.visible = false;
  S.world.add(trainG);
  const loco = locomotive();
  trainG.add(loco);
  const KINDS = ["hopper", "hopper", "box", "hopper", "tank", "hopper", "hopper", "gondola", "box", "hopper", "tank"];
  const cars = [];
  for (let i = 0; i < 33; i++) {
    const g = car(KINDS[i % KINDS.length]);
    g.position.x = -CRUCE.locomotora - i * CRUCE.carro;
    trainG.add(g);
    cars.push(g);
  }
  let state = null; // { t0, ci, carros, largo, v }
  const tailLbl = S.label("Último carro", [0, 7, 0], "lbl-note");
  tailLbl.maxDist = 700;
  tailLbl.visible = false;
  const frontLbl = S.label("", [0, 7.5, 0], "lbl-place lbl-small");
  frontLbl.maxDist = 900;
  frontLbl.visible = false;

  // ---------------- Punto de detección ----------------
  const det = new T.Group();
  S.world.add(det);
  {
    add(det, box(0.6, 1.1, 0.5), std({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.4 }), 0, 0.35, 3.6);
    add(det, new T.CylinderGeometry(0.05, 0.05, 2.4, 8), S.M.galv, 0, 1.2, 4.1);
    add(det, box(0.05, 0.5, 0.7), std({ color: 0xf1c232 }), 0, 2.2, 4.1);
  }
  function setDetection(x) {
    det.position.x = x;
  }

  // ---------------- Barreras y señales ----------------
  const lampOn = new T.MeshStandardMaterial({ color: 0xff3b2b, emissive: 0xff2010, emissiveIntensity: 2.2 });
  const lampOff = new T.MeshStandardMaterial({ color: 0x4a1210, emissive: 0x000000, roughness: 0.3 });
  const lampMat = [lampOff.clone(), lampOff.clone()]; // dos fases alternas
  const armLampMat = lampOff.clone();
  const black = std({ color: 0x141516, roughness: 0.6 });
  const glowTex = S.canvasTex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,90,60,1)");
    g.addColorStop(0.3, "rgba(255,40,20,0.55)");
    g.addColorStop(1, "rgba(255,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  const glowMats = [0, 1].map(() => new T.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
  const armGlow = new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
  const lampGeo = new T.CylinderGeometry(0.15, 0.15, 0.08, 20).rotateX(PI / 2);
  const backGeo = new T.CylinderGeometry(0.42, 0.42, 0.04, 24).rotateX(PI / 2);
  const visorGeo = new T.CylinderGeometry(0.2, 0.2, 0.35, 16, 1, true, -PI / 2, PI).rotateX(PI / 2);
  // Par de luces que mira hacia `face` (−1: al norte, +1: al sur), centrado en (x, y, z).
  function lightPair(parent, x, y, z, face) {
    const g = new T.Group();
    g.position.set(x, y, z);
    if (face > 0) g.rotation.y = PI;
    parent.add(g);
    add(g, box(1.6, 0.12, 0.12), S.M.galv, 0, 0, 0.1, false);
    for (const [i, dx] of [[0, -0.6], [1, 0.6]]) {
      add(g, backGeo, black, dx, 0, -0.05, false);
      add(g, lampGeo, lampMat[i], dx, 0, -0.1, false);
      add(g, visorGeo, black, dx, 0.02, -0.25, false);
      const sp = new T.Sprite(glowMats[i]);
      sp.scale.set(2.2, 2.2, 1);
      sp.position.set(dx, 0, -0.35);
      g.add(sp);
    }
    return g;
  }
  function crossbuck(parent, x, y, z, face) {
    const g = new T.Group();
    g.position.set(x, y, z);
    if (face > 0) g.rotation.y = PI;
    parent.add(g);
    for (const a of [PI / 4, -PI / 4]) {
      const m = add(g, new T.BoxGeometry(2.4, 0.42, 0.04), S.M.crossbuck, 0, 0, -0.08, false);
      m.rotation.z = a;
    }
    return g;
  }
  const gates = [];
  // Mástil con señales y barrera. armDir: +1 si el brazo se extiende hacia +x. face: hacia dónde miran las luces.
  function gateMast(x, z, armLen, armDir, face, { cantilever = 0 } = {}) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    S.world.add(g);
    add(g, box(1.0, 0.35, 1.0), S.M.curb, 0, 0.0, 0); // cimentación
    add(g, new T.CylinderGeometry(0.11, 0.13, 5.4, 12), S.M.galv, 0, 2.7, 0);
    crossbuck(g, 0, 4.9, 0, face);
    lightPair(g, 0, 3.6, face * -0.15, face);
    // mecanismo y brazo
    add(g, box(0.5, 1.3, 0.55), S.M.galv, armDir * -0.05, 0.85, -face * 0.45);
    const pivot = new T.Group();
    pivot.position.set(armDir * 0.25, 1.1, -face * 0.45);
    g.add(pivot);
    const arm = new T.Mesh(new T.BoxGeometry(armLen, 0.13, 0.11), S.M.stripe.clone());
    arm.material.map = S.stripeTex.clone();
    arm.material.map.needsUpdate = true;
    arm.material.map.repeat.set(armLen / 3.2, 1);
    arm.position.x = (armDir * armLen) / 2;
    arm.castShadow = true;
    pivot.add(arm);
    add(pivot, box(1.4, 0.35, 0.3), black, -armDir * 0.8, 0, 0); // contrapeso
    for (let k = 1; k <= 3; k++) {
      const lx = armDir * (armLen * (k / 3.3));
      add(pivot, new T.SphereGeometry(0.09, 10, 8), armLampMat, lx, 0.11, 0, false);
    }
    const sp = new T.Sprite(armGlow);
    sp.scale.set(1.2, 1.2, 1);
    sp.position.set(armDir * armLen * 0.97, 0.15, 0);
    pivot.add(sp);
    if (cantilever) {
      // brazo en voladizo a 6 m con dos pares de luces sobre los carriles centrales
      add(g, new T.CylinderGeometry(0.14, 0.16, 6.4, 12), S.M.galv, 0, 3.2, 0.35 * face);
      const cx = (armDir * cantilever) / 2;
      add(g, box(cantilever + 0.6, 0.35, 0.35), S.M.galv, cx, 6.3, 0.35 * face);
      add(g, box(cantilever + 0.6, 0.06, 0.6), S.M.galv, cx, 6.5, 0.35 * face, false);
      for (const f of [0.38, 0.78]) lightPair(g, armDir * cantilever * f, 5.75, 0.35 * face - face * 0.2, face);
    }
    gates.push({ pivot, armDir });
  }
  // Sentido sur (lado norte, z < 0): brazos desde el poniente, luces hacia el norte.
  gateMast(-25.7, -GZ, 12.9, +1, -1, { cantilever: 11 });
  gateMast(-41.4, -GZ, 8.6, +1, -1);
  // Sentido norte (lado sur, z > 0): brazos desde el oriente, luces hacia el sur.
  gateMast(25.7, GZ, 12.9, -1, +1, { cantilever: 11 });
  gateMast(41.4, GZ, 8.6, -1, +1);
  // Postes de señal en el camellón, del lado izquierdo de cada aproximación.
  for (const [x, z, face] of [[-11.3, -GZ, -1], [11.3, GZ, 1]]) {
    const g = new T.Group();
    g.position.set(x, 0.2, z);
    S.world.add(g);
    add(g, new T.CylinderGeometry(0.1, 0.12, 4.8, 12), S.M.galv, 0, 2.4, 0);
    crossbuck(g, 0, 4.35, 0, face);
    lightPair(g, 0, 3.15, -face * 0.15, face);
  }

  // ---------------- Animación ----------------
  const GATE_DOWN = [4, 14]; // s desde el inicio del preaviso: bajan en 10 s
  const UP = PI / 2 - 0.06;
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  function start({ t0, ci, carros }) {
    state = { t0, ci, carros, largo: ci.largo, v: ci.v };
    cars.forEach((g, i) => (g.visible = i < carros));
    trainG.visible = true;
  }
  let lightsOn = false;
  function update(t, wall, ev) {
    let gate = 0; // 0 arriba, 1 abajo
    lightsOn = false;
    if (state) {
      const { t0, ci, v, largo } = state;
      const tc = t0 + ci.total;
      const rel = t - t0;
      if (rel >= 0 && t < tc) lightsOn = true;
      gate = smooth((rel - GATE_DOWN[0]) / (GATE_DOWN[1] - GATE_DOWN[0]));
      if (t >= tc - ci.reapertura) gate = 1 - smooth((t - (tc - ci.reapertura)) / ci.reapertura);
      if (rel < GATE_DOWN[0]) gate = 0;
      const xf = -HALF + v * (t - (t0 + ci.preaviso));
      trainG.position.x = xf;
      const tail = xf - largo;
      // el último carro liberando el cruce
      tailLbl.visible = tail > -HALF - 140 && tail < HALF + 40;
      tailLbl.pos.set(tail + 2, 6.8, 0);
      frontLbl.visible = xf > -HALF - 260 && tail < HALF;
      frontLbl.pos.set(xf - 11, 7.6, 0);
      frontLbl.el.textContent = `${state.carros} carros + locomotora · ${Math.round(largo)} m · ${Math.round(v * 3.6)} km/h`;
      if (tail > S.TRACK.half + 50) {
        trainG.visible = false;
        state = null;
        tailLbl.visible = frontLbl.visible = false;
      }
    }
    for (const { pivot, armDir } of gates) pivot.rotation.z = armDir * UP * (1 - gate);
    // destello alterno a ~50 por minuto
    const ph = Math.floor(wall * 1.7) % 2;
    for (let i = 0; i < 2; i++) {
      const on = lightsOn && ph === i;
      lampMat[i].emissive.setHex(on ? 0xff2010 : 0x000000);
      lampMat[i].color.setHex(on ? 0xff3b2b : 0x4a1210);
      lampMat[i].emissiveIntensity = on ? 2.4 : 0;
      glowMats[i].opacity = on ? 0.95 : 0;
    }
    armLampMat.emissive.setHex(lightsOn ? 0xff2010 : 0);
    armLampMat.emissiveIntensity = lightsOn ? 2 : 0;
    armGlow.opacity = lightsOn ? 0.8 * (0.6 + 0.4 * ph) : 0;
    return { gate, lightsOn };
  }
  const fp = new T.Vector3();
  const ft = new T.Vector3();
  function follow(camera, controls, dt) {
    if (!trainG.visible) return;
    const x = trainG.position.x;
    ft.set(x - 18, 2, 0);
    fp.set(x - 70, 22, 46);
    const k = 1 - Math.exp(-dt * 2.5);
    camera.position.lerp(fp, k);
    controls.target.lerp(ft, k);
  }
  return { start, update, follow, setDetection, isRunning: () => !!state };
};
