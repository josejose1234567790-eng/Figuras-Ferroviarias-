// Vehículos: geometría de cada tipo y microsimulación por carril.
// Coordenada s: distancia del frente del vehículo a la vía, positiva aguas arriba.
// Sentido sur: viene del norte (z < 0) y avanza hacia +z, frente en z = −s.
// Sentido norte: viene del sur (z > 0) y avanza hacia −z, frente en z = +s.
window.crearTrafico = function crearTrafico(S, MODELO) {
  const T = S.T;
  const { PI, min, max, sqrt, floor, abs } = Math;
  const { AFORO, CRUCE } = MODELO;
  const COMP = AFORO.composicion;

  // ---------------- Geometría ----------------
  function merge(list) {
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      o += g.attributes.position.count;
    }
    const out = new T.BufferGeometry();
    out.setAttribute("position", new T.BufferAttribute(pos, 3));
    out.setAttribute("normal", new T.BufferAttribute(nor, 3));
    return out;
  }
  // Caja con el frente en zf y el cuerpo hacia −z.
  const B = (w, h, l, x, y, zf) => new T.BoxGeometry(w, h, l).translate(x, y + h / 2, zf - l / 2);
  const W = (r, w, x, z) => new T.CylinderGeometry(r, r, w, 14).rotateZ(PI / 2).translate(x, r, z);
  const axle = (r, track, z, w = 0.3) => [W(r, w, -track / 2, z), W(r, w, track / 2, z)];
  const dual = (r, z) => [W(r, 0.5, -0.95, z), W(r, 0.5, 0.95, z)];
  const tail = (x, y, z) => [B(0.3, 0.14, 0.05, -x, y, z), B(0.3, 0.14, 0.05, x, y, z)];
  function tractor() {
    return {
      body: [B(2.45, 2.0, 2.3, 0, 1.0, 0), B(2.4, 1.0, 1.0, 0, 0.55, 0.1), B(2.4, 2.4, 1.3, 0, 0.9, -2.3)],
      glass: [B(2.2, 0.85, 0.06, 0, 2.05, 0.03), B(2.47, 0.6, 1.2, 0, 2.15, -0.5)],
      dark: [B(1.1, 0.45, 6.6, 0, 0.5, 0), B(2.5, 0.35, 0.2, 0, 0.4, 0.15), B(0.25, 1.4, 0.25, 1.05, 2.3, -2.1)],
      wheels: [...axle(0.52, 2.0, -1.2), ...dual(0.52, -4.7), ...dual(0.52, -5.95)],
    };
  }
  const MAKE = {
    motos: () => ({
      body: [B(0.36, 0.45, 1.5, 0, 0.42, -0.3)],
      glass: [B(0.42, 0.62, 0.4, 0, 0.85, -0.85), B(0.3, 0.3, 0.3, 0, 1.47, -0.9)],
      wheels: [W(0.31, 0.12, 0, -0.32), W(0.31, 0.12, 0, -1.78)],
      tail: [B(0.15, 0.08, 0.04, 0, 0.8, -2.05)],
    }),
    autos: () => ({
      body: [B(1.78, 0.68, 4.6, 0, 0.3, 0), B(1.56, 0.07, 2.0, 0, 1.48, -1.45)],
      glass: [B(1.62, 0.5, 2.25, 0, 0.98, -1.3)],
      wheels: [...axle(0.32, 1.56, -0.85, 0.22), ...axle(0.32, 1.56, -3.75, 0.22)],
      tail: tail(0.62, 0.78, -4.58),
    }),
    autobuses: () => ({
      body: [B(2.55, 2.3, 12, 0, 0.45, 0), B(2.4, 0.3, 4, 0, 3.6, -5)],
      glass: [B(2.57, 0.95, 11.2, 0, 1.75, -0.6), B(2.35, 1.3, 0.06, 0, 1.45, 0.02)],
      wheels: [...axle(0.5, 2.1, -2.4), ...dual(0.5, -9.3)],
      tail: tail(1.0, 0.9, -11.98),
    }),
    C2: () => ({
      body: [B(2.3, 1.7, 2.1, 0, 0.75, 0)],
      cargo: [B(2.5, 2.5, 6.0, 0, 1.0, -2.4)],
      glass: [B(2.1, 0.7, 0.06, 0, 1.6, 0.02), B(2.32, 0.6, 1.2, 0, 1.65, -0.5)],
      dark: [B(1.0, 0.35, 8.3, 0, 0.45, -0.1)],
      wheels: [...axle(0.48, 1.9, -1.2), ...dual(0.48, -6.6)],
      tail: tail(1.0, 0.8, -8.45),
    }),
    C3: () => ({
      body: [B(2.35, 1.8, 2.2, 0, 0.8, 0)],
      cargo: [B(2.5, 2.6, 8.0, 0, 1.05, -2.5)],
      glass: [B(2.15, 0.75, 0.06, 0, 1.7, 0.02), B(2.37, 0.6, 1.2, 0, 1.75, -0.5)],
      dark: [B(1.0, 0.35, 10.3, 0, 0.45, -0.1)],
      wheels: [...axle(0.5, 1.9, -1.3), ...dual(0.5, -7.8), ...dual(0.5, -9.05)],
      tail: tail(1.0, 0.85, -10.45),
    }),
    T3S2: () => {
      const t = tractor();
      return {
        ...t,
        cargo: [B(2.6, 2.85, 13.7, 0, 1.25, -6.8)],
        dark: [...t.dark, B(2.4, 0.3, 13.6, 0, 0.95, -6.85)],
        wheels: [...t.wheels, ...dual(0.5, -17.9), ...dual(0.5, -19.15)],
        tail: tail(1.05, 1.0, -20.48),
      };
    },
    T3S3: () => {
      const t = tractor();
      return {
        ...t,
        tank: [new T.CylinderGeometry(1.05, 1.05, 13.4, 22).rotateX(PI / 2).translate(0, 2.25, -14.2)],
        dark: [...t.dark, B(1.4, 0.4, 14, 0, 0.9, -7.2), B(2.3, 0.6, 0.4, 0, 0.9, -7.4)],
        wheels: [...t.wheels, ...dual(0.5, -17.5), ...dual(0.5, -18.75), ...dual(0.5, -20.0)],
        tail: tail(1.0, 1.0, -21.4),
      };
    },
    T3S2R4: () => {
      const t = tractor();
      return {
        ...t,
        cargo: [B(2.6, 2.85, 12.2, 0, 1.25, -6.6), B(2.6, 2.85, 10.4, 0, 1.25, -19.6)],
        dark: [...t.dark, B(2.4, 0.3, 12, 0, 0.95, -6.7), B(0.3, 0.3, 1.6, 0, 0.8, -18.4), B(2.4, 0.3, 10.2, 0, 0.95, -19.7)],
        wheels: [...t.wheels, ...dual(0.5, -16.6), ...dual(0.5, -17.85), ...dual(0.5, -20.6), ...dual(0.5, -21.85), ...dual(0.5, -27.6), ...dual(0.5, -28.85)],
        tail: tail(1.05, 1.0, -29.98),
      };
    },
    otros: () => ({
      body: [B(1.95, 1.75, 6.0, 0, 0.38, 0)],
      glass: [B(1.8, 0.62, 0.06, 0, 1.45, -0.62), B(1.97, 0.5, 2.4, 0, 1.55, -1.0)],
      wheels: [...axle(0.36, 1.66, -1.0, 0.24), ...axle(0.36, 1.66, -4.8, 0.24)],
      tail: tail(0.8, 1.2, -5.98),
    }),
  };
  const paint = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.38, envMapIntensity: 0.7 });
  const MATS = {
    body: paint,
    cargo: new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.6, envMapIntensity: 0.4 }),
    tank: new T.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.85, roughness: 0.25, envMapIntensity: 0.9 }),
    glass: new T.MeshStandardMaterial({ color: 0x1b232b, metalness: 0.4, roughness: 0.12, envMapIntensity: 1.0 }),
    dark: new T.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.4, roughness: 0.6 }),
    wheels: new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }),
    tail: new T.MeshStandardMaterial({ color: 0x7a0e0a, emissive: 0x6a0805, roughness: 0.4 }),
  };
  const COLORED = { body: true, cargo: true };
  // Colores de carrocería frecuentes en México (aprox.)
  const CAR_COLORS = [
    [0xf2f2f0, 30], [0xb9bdc2, 18], [0x7b8087, 14], [0x1c1d20, 12], [0xa3221c, 9], [0x274a86, 7], [0xc9b99a, 4], [0x2f5b3c, 3], [0x6b4a33, 3],
  ];
  const CARGO_COLORS = [[0xf0f0ec, 55], [0xd8d8d2, 20], [0x9fa5ab, 10], [0x2d5a8c, 6], [0xb4372c, 5], [0x2f6b45, 4]];
  const CAB_COLORS = [[0xf4f4f2, 30], [0xb32a22, 18], [0x1e3f78, 16], [0x1d1d1f, 12], [0xe2a21c, 8], [0x8c9298, 10], [0x2d6a3e, 6]];
  const BUS_COLORS = [[0xf3f3f1, 50], [0x1f7a8c, 20], [0xe6b31e, 15], [0x2c4f9c, 15]];
  const pick = (list, u) => {
    const tot = list.reduce((s, c) => s + c[1], 0);
    let acc = 0;
    for (const [c, w] of list) if ((acc += w / tot) >= u) return c;
    return list[list.length - 1][0];
  };

  // Mallas instanciadas por tipo y por pieza. Capacidad holgada para la fila más larga posible.
  const TYPES = COMP.map((c) => c.tipo);
  const CAP_TOTAL = 3200;
  const meshes = {};
  for (const c of COMP) {
    const parts = MAKE[c.tipo]();
    const cap = Math.ceil((c.pct / 100) * CAP_TOTAL * 1.6) + 60;
    meshes[c.tipo] = Object.entries(parts).map(([key, geos]) => {
      const im = new T.InstancedMesh(merge(geos), MATS[key], cap);
      im.count = 0;
      im.castShadow = key !== "tail" && key !== "glass";
      im.receiveShadow = key === "cargo" || key === "body";
      im.frustumCulled = false;
      if (COLORED[key]) im.setColorAt(0, new T.Color(1, 1, 1));
      S.world.add(im);
      return { key, im };
    });
  }
  // Camiones estacionados en el patio, con las mismas piezas.
  {
    const m4 = new T.Matrix4();
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), PI / 2);
    const types = ["T3S2", "T3S2", "T3S3", "T3S2R4", "T3S2", "C3", "T3S2", "T3S3"];
    types.forEach((tp, i) => {
      for (const { key, im } of meshes[tp]) {
        const geo = im.geometry;
        const mesh = new T.Mesh(geo, COLORED[key] ? MATS[key].clone() : MATS[key]);
        if (COLORED[key]) mesh.material.color.setHex(key === "cargo" ? pick(CARGO_COLORS, S.rnd()) : pick(CAB_COLORS, S.rnd()));
        m4.compose(new T.Vector3(-90 - (i % 4) * 30, 0, 32 + floor(i / 4) * 34 + (i % 2) * 2), q, new T.Vector3(1, 1, 1));
        mesh.applyMatrix4(m4);
        mesh.castShadow = true;
        S.world.add(mesh);
      }
    });
  }

  // ---------------- Microsimulación ----------------
  const STOP = CRUCE.detencion;
  const VF = 60 / 3.6; // velocidad libre en el Periférico (m/s)
  const BRAKE = 2.6; // desaceleración cómoda (m/s²)
  const S0 = 2150; // aparecen a 2.15 km de la vía
  const EXIT = 420; // desaparecen 420 m después de cruzar
  const HSAT = 3600 / CRUCE.saturacion; // s por auto equivalente en un carril (2 s)
  const GOLD = 0.6180339887498949;
  const cdf = [];
  {
    const tot = COMP.reduce((s, c) => s + c.pct, 0);
    let acc = 0;
    for (const c of COMP) cdf.push([(acc += c.pct / tot), c]);
  }
  const typeOf = (u) => cdf.find(([p]) => u <= p)?.[1] ?? COMP[COMP.length - 1];

  function makeDir(name, offset) {
    return {
      name,
      lam: 0.5,
      lanes: [[], [], []], // vehículos activos o programados por carril, en orden FIFO
      nextBase: 0, // próxima llegada (sin dispersión)
      n: 0,
      u: offset,
      lastRelease: [-1e9, -1e9, -1e9],
      lastArrival: [-1e9, -1e9, -1e9],
      queueTail: [[], [], []],
    };
  }
  const dirs = { sur: makeDir("sur", 0.13), norte: makeDir("norte", 0.71) };
  let event = null; // { t0, tc, tg }
  let simT = 0;

  // ¿Está el cruce cerrado al tiempo t (incluido el tiempo perdido al arrancar)?
  const blockedUntil = (t) => (event && t >= event.t0 && t < event.tg ? event.tg : null);

  // Programa la llegada i-ésima: tipo, carril, tiempo de llegada a la fila (a), liberación (d) y lugar en la fila.
  function schedule(D) {
    const i = D.n++;
    const jitter = (((i * 0.7548776662) % 1) - 0.5) * 0.5;
    const a = D.nextBase + jitter / D.lam;
    D.nextBase += 1 / D.lam;
    D.u = (D.u + GOLD) % 1;
    const c = typeOf(D.u);
    const lane = i % 3;
    const h = HSAT * c.eq;
    const bu = blockedUntil(a);
    let d = a;
    if (bu !== null) d = max(d, bu);
    d = max(d, D.lastRelease[lane] + h);
    D.lastRelease[lane] = d;
    D.lastArrival[lane] = a;
    const queued = d > a + 0.05;
    // lugar en la fila a la llegada: vehículos del carril que llegaron antes y siguen sin salir
    let p = STOP;
    if (queued) for (const v of D.lanes[lane]) if (v.a < a && v.d > a) p += v.len + AFORO.holgura;
    const spawn = queued ? a - (S0 - p) / VF - VF / (2 * BRAKE) : a - (S0 - STOP) / VF;
    const u2 = (i * 0.38196601 + 0.17) % 1;
    const v = {
      id: `${D.name}${i}`, type: c.tipo, len: c.largo, eq: c.eq, lane, a, d, queued, p, spawn,
      s: S0, v: VF, active: false, stopped: 0,
      c1: c.tipo === "autos" || c.tipo === "motos" ? pick(CAR_COLORS, u2) : c.tipo === "autobuses" ? pick(BUS_COLORS, u2) : c.tipo === "otros" ? pick(CAR_COLORS, (u2 * 0.4) % 1) : pick(CAB_COLORS, u2),
      c2: pick(CARGO_COLORS, (u2 * 7.31) % 1),
    };
    D.lanes[lane].push(v);
  }
  // Lugar en la fila al llegar y momento de aparecer, para que llegue a la cola justo en v.a.
  function placeInQueue(D, v) {
    let p = STOP;
    if (v.queued) for (const w of D.lanes[v.lane]) if (w !== v && w.a < v.a && w.d > v.a) p += w.len + AFORO.holgura;
    v.p = p;
    v.spawn = v.queued ? v.a - (S0 - p) / VF - VF / (2 * BRAKE) : v.a - (S0 - STOP) / VF;
  }
  // Recalcula liberaciones de lo programado a partir de un tiempo (al disparar un tren).
  function reschedule(D, from) {
    // reconstruye lastRelease desde los vehículos que ya llegaron antes de `from`
    for (let l = 0; l < 3; l++) {
      let lr = -1e9;
      for (const v of D.lanes[l]) {
        if (v.a < from) {
          lr = max(lr, v.d);
          continue;
        }
        const bu = blockedUntil(v.a);
        let d = v.a;
        if (bu !== null) d = max(d, bu);
        d = max(d, lr + HSAT * v.eq);
        v.d = d;
        v.queued = d > v.a + 0.05;
        lr = d;
        if (!v.active) placeInQueue(D, v);
      }
      D.lastRelease[l] = lr;
    }
  }

  function setRates(lamSur, lamNorte) {
    for (const [D, lam] of [[dirs.sur, lamSur], [dirs.norte, lamNorte]]) {
      if (abs(D.lam - lam) < 1e-9) continue;
      D.lam = max(lam, 1e-4);
      // lo programado que aún no aparece se vuelve a programar con el nuevo ritmo
      let first = Infinity;
      for (let l = 0; l < 3; l++) {
        const lane = D.lanes[l];
        const keep = lane.filter((v) => v.active);
        for (const v of lane) if (!v.active) first = min(first, v.a);
        D.lanes[l] = keep;
        D.lastRelease[l] = keep.length ? keep[keep.length - 1].d : -1e9;
      }
      if (first < Infinity) D.nextBase = first;
    }
  }

  // Llena el camino en régimen libre para que la escena empiece con tránsito.
  function warm(t) {
    for (const D of Object.values(dirs)) {
      D.nextBase = t - (S0 - STOP) / VF;
      while (D.nextBase < t + 200) schedule(D);
    }
  }

  function trigger(ev) {
    event = ev;
    for (const D of Object.values(dirs)) reschedule(D, ev.t0);
  }
  function clearEvent() {
    event = null;
  }

  function stepDir(D, t, dt) {
    while (D.nextBase < t + (S0 + 200) / VF + 10) schedule(D);
    for (const lane of D.lanes) {
      let leader = null;
      for (let k = 0; k < lane.length; k++) {
        const v = lane[k];
        if (!v.active) {
          if (t < v.spawn) break; // los de atrás aparecen después
          v.active = true;
          v.s = S0 - (t - v.spawn) * VF;
          v.v = VF;
        }
        let limit = -1e9;
        if (t < v.d && v.queued) limit = STOP;
        // separación: 1 m detenidos, más 0.9 s de la velocidad del de adelante
        if (leader) limit = max(limit, leader.s + leader.len + AFORO.holgura + leader.v * 0.9);
        const room = v.s - limit;
        if (room <= 0.02) {
          v.v = 0;
          v.s = max(v.s, limit);
        } else {
          const vAllow = sqrt(2 * BRAKE * room);
          const acc = v.len > 12 ? 0.9 : v.len > 7 ? 1.3 : 2.2;
          v.v = min(v.v + acc * dt, VF, vAllow);
          v.s -= v.v * dt;
          if (v.s < limit) {
            v.s = limit;
            v.v = 0;
          }
        }
        v.stopped = v.v < 0.3 ? 1 : 0;
        leader = v;
      }
      // salen de escena
      while (lane.length && lane[0].active && lane[0].s < -EXIT) lane.shift();
    }
  }
  function step(t, dt) {
    simT = t;
    const n = Math.ceil(dt / 0.2);
    for (let i = 1; i <= n; i++) for (const D of Object.values(dirs)) stepDir(D, t - dt + (dt * i) / n, dt / n);
  }

  // ---------------- Dibujo ----------------
  const m4 = new T.Matrix4();
  const qS = new T.Quaternion();
  const qN = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), PI);
  const pos = new T.Vector3();
  const one = new T.Vector3(1, 1, 1);
  const col = new T.Color();
  const counters = {};
  function draw() {
    for (const tp of TYPES) counters[tp] = 0;
    for (const D of Object.values(dirs)) {
      const sgn = D.name === "sur" ? -1 : 1;
      const lanesX = S.LANES[D.name];
      const q = D.name === "sur" ? qS : qN;
      for (let l = 0; l < 3; l++)
        for (const v of D.lanes[l]) {
          if (!v.active) break;
          const idx = counters[v.type]++;
          pos.set(lanesX[l], 0.0, sgn * v.s);
          m4.compose(pos, q, one);
          for (const { key, im } of meshes[v.type]) {
            if (idx >= im.instanceMatrix.count) continue;
            im.setMatrixAt(idx, m4);
            if (key === "body") im.setColorAt(idx, col.setHex(v.c1));
            else if (key === "cargo") im.setColorAt(idx, col.setHex(v.c2));
          }
        }
    }
    for (const tp of TYPES)
      for (const { im } of meshes[tp]) {
        im.count = min(counters[tp], im.instanceMatrix.count);
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
  }

  // Estado para la vista de la fila y los contadores.
  function snapshot() {
    const out = {};
    for (const D of Object.values(dirs)) {
      let stopped = 0;
      let tailMax = 0;
      const lanes = D.lanes.map((lane) =>
        lane.filter((v) => v.active && v.s > -60 && v.s < 1600).map((v) => {
          if (v.stopped && v.s >= STOP - 0.5) {
            stopped++;
            tailMax = max(tailMax, v.s + v.len);
          }
          return { s: v.s, len: v.len, type: v.type, stopped: v.stopped };
        }),
      );
      out[D.name] = { lanes, stopped, tailMax };
    }
    return out;
  }

  return { setRates, warm, step, draw, trigger, clearEvent, snapshot, dirs, VF };
};
