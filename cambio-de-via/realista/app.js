// Cambio de vía sencillo en 3D con proporciones reales. Unidades: metros. Ejes: x a lo largo de la vía,
// y hacia arriba, z transversal (la vía desviada se separa hacia +z).
(() => {
  const T = THREE;
  const { PI, sin, cos, tan, atan, atan2, asin, sqrt, hypot, min, max, abs } = Math;
  const clamp = (v, a, b) => min(b, max(a, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const smooth = (a, b, x) => ease(clamp((x - a) / (b - a), 0, 1));

  // ---------------- Datos reales ----------------
  const GAUGE = 1.435; // trocha estándar, entre caras activas de los hongos
  const g = GAUGE / 2;
  // Carril 115 lb/yd (AREMA 115RE): alto 168,3 mm, patín 139,7 mm, hongo 69 mm, alma 15,9 mm.
  const RAIL = { height: 0.1683, base: 0.1397, head: 0.069, web: 0.0159 };
  const hH = RAIL.head / 2;
  const FLANGEWAY = 0.048; // canal de paso de pestaña: 1 7/8"
  const FROG_N = 10; // corazón del n.º 10
  const FROG_ANGLE = 2 * atan(1 / (2 * FROG_N)); // 5,725°
  const R = (g * (1 + cos(FROG_ANGLE))) / (1 - cos(FROG_ANGLE)); // radio del eje de la desviada (≈ 287 m)
  const X_FROG = 2 * sqrt(R * g); // punto teórico del corazón desde la punta de agujas (≈ 28,7 m)
  const SWITCH_LEN = 5.03; // aguja de 16'6"
  const THROW = 0.121; // carrera en punta de aguja: 4 3/4" (valor típico)
  const TIE = { len: 2.59, width: 0.28, top: 0.23, height: 0.23, spacing: 0.61 }; // durmiente de concreto de 8'6"
  const Y_GROUND = 0;
  const Y_BALLAST = 0.38;
  const Y_TIE_BOTTOM = 0.22;
  const Y_TIE_TOP = Y_TIE_BOTTOM + TIE.height;
  const Y_RAIL = Y_TIE_TOP + 0.008; // placa de asiento de 8 mm
  const Y_TOP = Y_RAIL + RAIL.height;
  const XA = -170;
  const XB = 270;
  const TH_ARC = (8 * PI) / 180; // la curva sigue hasta 8° y luego la desviada es recta
  const X_ARC = R * sin(TH_ARC);
  const Z_ARC = R * (1 - cos(TH_ARC));

  // ---------------- Trazado ----------------
  // Eje de la desviada parametrizado por su x: punto y tangente.
  function divC(u) {
    if (u <= 0) return { x: u, z: 0, tx: 1, tz: 0 };
    if (u <= X_ARC) {
      const th = asin(u / R);
      return { x: u, z: R * (1 - cos(th)), tx: cos(th), tz: sin(th) };
    }
    return { x: u, z: Z_ARC + (u - X_ARC) * tan(TH_ARC), tx: cos(TH_ARC), tz: sin(TH_ARC) };
  }
  // Punto desplazado d del eje de la desviada (d > 0 hacia el centro de la curva, +z).
  const divOff = (u, d) => {
    const c = divC(u);
    return [c.x - d * c.tz, c.z + d * c.tx];
  };
  // z de la línea desplazada d de la desviada en una x dada.
  function zDiv(d, x) {
    let u = x;
    for (let i = 0; i < 6; i++) u = x + d * divC(u).tz;
    return divOff(u, d)[1];
  }
  const solve = (f, lo, hi) => {
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (f(lo) * f(m) <= 0) hi = m;
      else lo = m;
    }
    return (lo + hi) / 2;
  };
  const sample = (x0, x1, f, step) => {
    const n = max(1, Math.ceil(abs(x1 - x0) / step));
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / n;
      return [x, f(x)];
    });
  };
  const xDivEnd = XB - 10;

  const X_TIP = solve((x) => zDiv(-g, x) - g - 0.013, X_FROG - 2, X_FROG + 2); // punta real (13 mm)
  const Z_WING_A = g - FLANGEWAY - hH; // pata de liebre junto a la punta recta
  const D_WING_B = -g + FLANGEWAY + hH; // pata de liebre junto a la punta desviada (desplazamiento)
  const X_KNUCKLE_A = solve((x) => zDiv(-(g + hH), x) - Z_WING_A, SWITCH_LEN, X_FROG);
  const X_KNUCKLE_B = solve((x) => zDiv(D_WING_B, x) - (g + hH), SWITCH_LEN, X_FROG);
  const X_WING_END = X_FROG + 1.7;
  const X_SEP = solve((x) => divC(x).z - 2.75, 20, 80); // aquí ya caben dos durmientes normales

  // ---------------- Renderizador, cielo y luz ----------------
  const canvas = document.getElementById("view");
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(min(window.devicePixelRatio, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = false;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 0.05, 3000);
  camera.position.set(-5.5, 3.6, 6.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(2.6, 0.45, 0.1);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = PI * 0.495;
  controls.minDistance = 1.2;
  controls.maxDistance = 220;
  controls.screenSpacePanning = false;

  const sun = new T.Vector3();
  const SUN_ELEV = 38;
  const SUN_AZ = 215;
  {
    const phi = T.MathUtils.degToRad(90 - SUN_ELEV);
    const theta = T.MathUtils.degToRad(SUN_AZ);
    sun.setFromSphericalCoords(1, phi, theta);
  }
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const su = sky.material.uniforms;
  su.turbidity.value = 5;
  su.rayleigh.value = 1.4;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.82;
  su.sunPosition.value.copy(sun);
  scene.add(sky);
  {
    // reflejos: mapa de entorno sacado del propio cielo
    const pmrem = new T.PMREMGenerator(renderer);
    const skyScene = new T.Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(4500);
    Object.assign(skyCopy.material.uniforms.turbidity, { value: 5 });
    skyCopy.material.uniforms.rayleigh.value = 1.4;
    skyCopy.material.uniforms.mieCoefficient.value = 0.004;
    skyCopy.material.uniforms.mieDirectionalG.value = 0.82;
    skyCopy.material.uniforms.sunPosition.value.copy(sun);
    skyScene.add(skyCopy);
    scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
  }
  scene.fog = new T.Fog(0xc9d6e2, 120, 900);

  const sunLight = new T.DirectionalLight(0xfff1dc, 3.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  const SH = 34;
  Object.assign(sunLight.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 260 });
  sunLight.shadow.bias = -0.00025;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight, sunLight.target);
  scene.add(new T.HemisphereLight(0xcfe3ff, 0x6b5a45, 0.55));

  // ---------------- Texturas procedurales ----------------
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  function canvasTex(size, draw, { repeat = [1, 1], srgb = true } = {}) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.encoding = T.sRGBEncoding;
    return t;
  }
  function normalFromHeight(hc, strength) {
    const size = hc.width;
    const src = hc.getContext("2d").getImageData(0, 0, size, size).data;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
        const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
        const l = hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
        img.data[i + 2] = (1 / l) * 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  // Balasto: piedra machacada de 30–60 mm. Color y relieve de cada piedra en dos lienzos.
  function ballastMaps() {
    const size = 1024;
    const col = document.createElement("canvas");
    const hgt = document.createElement("canvas");
    col.width = col.height = hgt.width = hgt.height = size;
    const cc = col.getContext("2d");
    const hc = hgt.getContext("2d");
    cc.fillStyle = "#4b4640";
    cc.fillRect(0, 0, size, size);
    hc.fillStyle = "#000";
    hc.fillRect(0, 0, size, size);
    for (let n = 0; n < 2600; n++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 9 + rnd() * 15;
      const sides = 5 + Math.floor(rnd() * 4);
      const pts = Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * PI * 2 + rnd() * 0.5;
        const rr = r * (0.65 + rnd() * 0.45);
        return [x + cos(a) * rr, y + sin(a) * rr];
      });
      const tone = 95 + rnd() * 90;
      const warm = rnd() * 14;
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        cc.beginPath();
        hc.beginPath();
        pts.forEach(([px, py], i) => {
          (i ? cc.lineTo : cc.moveTo).call(cc, px + ox, py + oy);
          (i ? hc.lineTo : hc.moveTo).call(hc, px + ox, py + oy);
        });
        cc.closePath();
        hc.closePath();
        const grd = cc.createLinearGradient(x - r + ox, y - r + oy, x + r + ox, y + r + oy);
        grd.addColorStop(0, `rgb(${tone + 30 + warm},${tone + 28},${tone + 22})`);
        grd.addColorStop(1, `rgb(${tone - 35 + warm},${tone - 36},${tone - 40})`);
        cc.fillStyle = grd;
        cc.fill();
        cc.strokeStyle = "rgba(20,18,15,0.6)";
        cc.lineWidth = 1.4;
        cc.stroke();
        const hg = hc.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        hg.addColorStop(0, "#fff");
        hg.addColorStop(1, "#555");
        hc.fillStyle = hg;
        hc.fill();
      }
    }
    const map = new T.CanvasTexture(col);
    map.encoding = T.sRGBEncoding;
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return { map, normalMap: normalFromHeight(hgt, 4) };
  }
  const BALLAST = ballastMaps();
  const concreteTex = canvasTex(512, (c, s) => {
    c.fillStyle = "#b8b3a9";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 26000; i++) {
      const v = 150 + rnd() * 70;
      c.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.25 + rnd() * 0.4})`;
      c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }
    for (let i = 0; i < 600; i++) {
      c.fillStyle = `rgba(70,66,60,${0.25 + rnd() * 0.4})`;
      c.beginPath();
      c.arc(rnd() * s, rnd() * s, 0.8 + rnd() * 1.6, 0, PI * 2);
      c.fill();
    }
  });
  const grassTex = canvasTex(
    512,
    (c, s) => {
      c.fillStyle = "#5d6b3a";
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 30000; i++) {
        const gr = 80 + rnd() * 70;
        c.strokeStyle = `rgba(${gr - 20 + rnd() * 40},${gr + 25},${40 + rnd() * 25},${0.35 + rnd() * 0.4})`;
        const x = rnd() * s;
        const y = rnd() * s;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6);
        c.stroke();
      }
      for (let i = 0; i < 160; i++) {
        c.fillStyle = `rgba(110,92,62,${0.15 + rnd() * 0.2})`;
        c.beginPath();
        c.arc(rnd() * s, rnd() * s, 6 + rnd() * 26, 0, PI * 2);
        c.fill();
      }
    },
    { repeat: [260, 260] },
  );

  // ---------------- Materiales PBR ----------------
  const M = {
    railTop: new T.MeshStandardMaterial({ color: 0xd2d3d6, metalness: 1, roughness: 0.16 }),
    railSide: new T.MeshStandardMaterial({ color: 0x6a4a35, metalness: 0.45, roughness: 0.78 }),
    steel: new T.MeshStandardMaterial({ color: 0x55585c, metalness: 0.85, roughness: 0.42 }),
    steelDark: new T.MeshStandardMaterial({ color: 0x2f3134, metalness: 0.8, roughness: 0.5 }),
    manganese: new T.MeshStandardMaterial({ color: 0x8b8e92, metalness: 0.9, roughness: 0.3 }),
    clip: new T.MeshStandardMaterial({ color: 0x3c3f42, metalness: 0.7, roughness: 0.45 }),
    pad: new T.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0, roughness: 0.9 }),
    concrete: new T.MeshStandardMaterial({ map: concreteTex, color: 0x9d9890, metalness: 0, roughness: 0.92 }),
    ballast: new T.MeshStandardMaterial({ map: BALLAST.map, color: 0xb8b2aa, normalMap: BALLAST.normalMap, normalScale: new T.Vector2(1.3, 1.3), metalness: 0, roughness: 0.95 }),
    stone: new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.9, flatShading: true }),
    grass: new T.MeshStandardMaterial({ map: grassTex, metalness: 0, roughness: 1 }),
    castIron: new T.MeshStandardMaterial({ color: 0x2b2d2f, metalness: 0.75, roughness: 0.55 }),
    lever: new T.MeshStandardMaterial({ color: 0x1f2124, metalness: 0.8, roughness: 0.4 }),
    weight: new T.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.5 }),
    handle: new T.MeshStandardMaterial({ color: 0xe8b21c, metalness: 0.2, roughness: 0.45 }),
    targetRed: new T.MeshStandardMaterial({ color: 0xc8231b, metalness: 0.1, roughness: 0.5 }),
    targetGreen: new T.MeshStandardMaterial({ color: 0x1f8a3a, metalness: 0.1, roughness: 0.5 }),
  };

  // ---------------- Carril barrido ----------------
  // Perfil 115RE en mm (u transversal, y vertical), con hongo asimétrico para las agujas cepilladas.
  function railProfile(hL = 34.5, hR = 34.5, bL = 69.85, bR = 69.85) {
    const side = (h, b) => {
      h = max(h, 8.5);
      return [[b, 0], [b, 11], [min(22, b), 28], [7.95, 42], [7.95, 118], [min(20, h), 126], [h, 129.5], [h, 161], [max(h - 3, 7.95), 166.6], [max(h * 0.55, 4), 168.3]];
    };
    const r = side(hR, bR);
    const l = side(hL, bL).map(([u, y]) => [-u, y]).reverse();
    return [...r, ...l].map(([u, y]) => [u / 1000, y / 1000]);
  }
  const STD = railProfile();

  // Barre un perfil (o una función de perfil) a lo largo de una polilínea en planta.
  function sweep(pts, profileAt, yBase, offsetAt = () => 0) {
    const top = [];
    const side = [];
    const n = pts.length;
    const frames = pts.map((p, i) => {
      const a = pts[max(0, i - 1)];
      const b = pts[min(n - 1, i + 1)];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = hypot(dx, dz) || 1;
      return { x: p[0], z: p[1], tx: dx / l, tz: dz / l, nx: -dz / l, nz: dx / l };
    });
    const profs = frames.map((f, i) => (typeof profileAt === "function" ? profileAt(f.x, i / (n - 1)) : profileAt));
    const world = (f, u, y, off) => [f.x + (u + off) * f.nx, yBase + y, f.z + (u + off) * f.nz];
    const offs = frames.map((f) => offsetAt(f.x));
    for (let i = 0; i < n - 1; i++) {
      const f0 = frames[i];
      const f1 = frames[i + 1];
      const p0 = profs[i];
      const p1 = profs[i + 1];
      const m = p0.length;
      for (let j = 0; j < m; j++) {
        const k = (j + 1) % m;
        const du = p0[k][0] - p0[j][0];
        const dy = p0[k][1] - p0[j][1];
        const l = hypot(du, dy) || 1;
        const nu = dy / l;
        const ny = -du / l;
        const nrm = [nu * f0.nx, ny, nu * f0.nz];
        const A0 = world(f0, p0[j][0], p0[j][1], offs[i]);
        const B0 = world(f0, p0[k][0], p0[k][1], offs[i]);
        const A1 = world(f1, p1[j][0], p1[j][1], offs[i + 1]);
        const B1 = world(f1, p1[k][0], p1[k][1], offs[i + 1]);
        const bucket = ny > 0.55 && p0[j][1] > 0.15 ? top : side;
        // cara vista desde fuera: A0 → A1 → B1, A0 → B1 → B0
        bucket.push(...A0, ...nrm, ...A1, ...nrm, ...B1, ...nrm, ...A0, ...nrm, ...B1, ...nrm, ...B0, ...nrm);
      }
    }
    // tapas en los dos extremos
    for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
      const f = frames[i];
      const prof = profs[i];
      const tris = T.ShapeUtils.triangulateShape(prof.map(([u, y]) => new T.Vector2(u, y)), []);
      const nrm = [sgn * f.tx, 0, sgn * f.tz];
      for (const t of tris) {
        const [a, b, c] = t.map((j) => world(f, prof[j][0], prof[j][1], offs[i]));
        const area = (prof[t[1]][0] - prof[t[0]][0]) * (prof[t[2]][1] - prof[t[0]][1]) - (prof[t[2]][0] - prof[t[0]][0]) * (prof[t[1]][1] - prof[t[0]][1]);
        const flip = (area > 0) === (sgn > 0);
        side.push(...a, ...nrm, ...(flip ? c : b), ...nrm, ...(flip ? b : c), ...nrm);
      }
    }
    const geo = new T.BufferGeometry();
    const all = new Float32Array([...side, ...top]);
    const count = all.length / 6;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set(all.subarray(i * 6, i * 6 + 3), i * 3);
      nor.set(all.subarray(i * 6 + 3, i * 6 + 6), i * 3);
    }
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new T.BufferAttribute(nor, 3));
    geo.addGroup(0, side.length / 6, 0);
    geo.addGroup(side.length / 6, top.length / 6, 1);
    geo.computeBoundingSphere();
    return geo;
  }
  const railMesh = (geo) => {
    const m = new T.Mesh(geo, [M.railSide, M.railTop]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const track = new T.Group();
  scene.add(track);
  const addRail = (pts, profile = STD) => track.add(railMesh(sweep(pts, profile, Y_RAIL)));

  // ---------------- Carriles fijos ----------------
  const ctr = (d) => (x) => zDiv(d, x); // eje de un carril de la desviada desplazado d
  const out = (z) => () => z;
  const C = g + hH; // del eje de vía al eje del carril
  // contraaguja recta (lado −z): continua
  addRail(sample(XA, XB, out(-C), 10));
  // contraaguja curva (lado +z): recta hasta la punta, luego hilo interior de la desviada
  addRail([...sample(XA, 0, out(C), 10), ...sample(0.25, xDivEnd, ctr(C), 0.5)]);
  // carriles de cierre: de talón de aguja al corazón, con sus patas de liebre
  const flareA = (x) => 0.075 * smooth(X_WING_END - 0.5, X_WING_END, x);
  addRail(sample(SWITCH_LEN, X_WING_END, (x) => min(zDiv(-C, x), Z_WING_A) - flareA(x), 0.25));
  addRail(sample(SWITCH_LEN, X_WING_END, (x) => (x < X_KNUCKLE_B ? C : zDiv(D_WING_B + flareA(x), x)), 0.25));
  // punta del corazón: dos carriles que salen de la punta real y se unen en V
  const tipProfile = (side) => (x) => {
    // cerca de la punta, la cara exterior de cada pata se rebaja para formar la V
    const w = clamp(34.5 + (x - X_TIP) * 160, 12, 34.5);
    return side > 0 ? railProfile(34.5, w) : railProfile(w, 34.5);
  };
  addRail(sample(X_TIP - 0.02, XB, out(C), 0.2).filter((p, i, a) => i < 30 || i === a.length - 1), tipProfile(1));
  addRail([...sample(X_TIP - 0.02, X_TIP + 6, ctr(-C), 0.2), ...sample(X_TIP + 6.5, xDivEnd, ctr(-C), 0.5)], tipProfile(-1));
  // contrarriles frente al corazón, con los extremos abocinados
  const guard = (xc, zf, dir) => {
    const L = 3.4;
    return sample(xc - L / 2, xc + L / 2, (x) => zf(x) + dir * 0.06 * (smooth(xc - L / 2 + 0.45, xc - L / 2, x) + smooth(xc + L / 2 - 0.45, xc + L / 2, x)), 0.1);
  };
  const GUARD_PROFILE = railProfile(34.5, 34.5, 40, 40);
  addRail(guard(X_FROG, out(-g + FLANGEWAY + hH), 1), GUARD_PROFILE);
  const X_GUARD_D = X_FROG * ((R - g) / (R + g));
  addRail(guard(X_GUARD_D, (x) => zDiv(g - FLANGEWAY - hH, x), -1), GUARD_PROFILE);
  // tacos de los contrarriles (bloques entre carril y contrarriel)
  {
    const blockGeo = new T.BoxGeometry(0.18, 0.09, FLANGEWAY + 0.02);
    for (const [xc, zf] of [[X_FROG, (x) => -g + FLANGEWAY / 2], [X_GUARD_D, (x) => zDiv(g - FLANGEWAY / 2, x)]])
      for (const dx of [-1.1, 0, 1.1]) {
        const b = new T.Mesh(blockGeo, M.steelDark);
        b.position.set(xc + dx, Y_RAIL + 0.09, zf(xc + dx));
        b.castShadow = true;
        track.add(b);
      }
  }
  // placa de asiento del corazón
  {
    const shape = new T.Shape();
    const x0 = X_KNUCKLE_A - 1.6;
    const x1 = X_WING_END + 1.2;
    shape.moveTo(x0, -(Z_WING_A - 0.22));
    shape.lineTo(x1, -(Z_WING_A - 0.22));
    shape.lineTo(x1, -(zDiv(-C, x1) + 0.24));
    shape.lineTo(x0, -(C + 0.22));
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    geo.rotateX(-PI / 2);
    const m = new T.Mesh(geo, M.manganese);
    m.position.y = Y_TIE_TOP - 0.012;
    m.receiveShadow = m.castShadow = true;
    track.add(m);
  }

  // ---------------- Agujas, tirantes y varilla (móviles) ----------------
  // p = 1 desviada: aguja −z acoplada; p = 0 directa: aguja +z acoplada.
  const switchGroup = new T.Group();
  track.add(switchGroup);
  const tOf = (x) => clamp(x / SWITCH_LEN, 0, 1);
  const shiftA = (p) => (x) => (1 - p) * THROW * (1 - tOf(x));
  const shiftB = (p) => (x) => -p * THROW * (1 - tOf(x));
  // ancho de hongo disponible entre la línea activa de la aguja y la cara activa de su contraaguja
  const widthA = (x) => clamp((zDiv(-g, x) + g) * 1000, 0, 69);
  const widthB = (x) => clamp((zDiv(g, x) - g) * 1000, 0, 69);
  const bladePts = sample(0, SWITCH_LEN, () => 0, 0.08).map(([x]) => [x, 0]);
  const bladeA_pts = bladePts.map(([x]) => [x, zDiv(-g, x) - hH]);
  const bladeB_pts = bladePts.map(([x]) => [x, g + hH]);
  const bladeProfA = (x) => railProfile(clamp(widthA(x) - 34.5, 0, 34.5), 34.5, 48, 48);
  const bladeProfB = (x) => railProfile(34.5, clamp(widthB(x) - 34.5, 0, 34.5), 48, 48);
  let bladeA = null;
  let bladeB = null;
  const rodParts = new T.Group();
  switchGroup.add(rodParts);
  const HEAD_RODS = [0.0, 1.83];
  const STAND = { x: 0, z: -2.65 };
  const bar = (x, z0, z1, y, w, h, mat) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, abs(z1 - z0)), mat);
    m.position.set(x, y, (z0 + z1) / 2);
    m.castShadow = true;
    return m;
  };
  function buildSwitch(p) {
    for (const b of [bladeA, bladeB]) if (b) { switchGroup.remove(b); b.geometry.dispose(); }
    bladeA = railMesh(sweep(bladeA_pts, bladeProfA, Y_RAIL, shiftA(p)));
    bladeB = railMesh(sweep(bladeB_pts, bladeProfB, Y_RAIL, shiftB(p)));
    switchGroup.add(bladeA, bladeB);
    rodParts.traverse((o) => o.geometry && o.geometry.dispose());
    rodParts.clear();
    for (const [i, x] of HEAD_RODS.entries()) {
      const za = zDiv(-g, x) - hH + shiftA(p)(x) - 0.02;
      const zb = g + hH + shiftB(p)(x) + 0.02;
      rodParts.add(bar(x, za - 0.03, zb + 0.03, Y_RAIL + 0.03, 0.06, 0.016, M.steel));
      for (const z of [za, zb]) rodParts.add(bar(x, z - 0.035, z + 0.035, Y_RAIL + 0.05, 0.09, 0.07, M.steelDark));
      if (i === 0) {
        // varilla de mando desde la palanca hasta el tirante de punta
        const rod = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, abs(za - (STAND.z + 0.3)), 12), M.steel);
        rod.rotation.x = PI / 2;
        rod.position.set(x + 0.12, Y_RAIL + 0.035, (za + STAND.z + 0.3) / 2);
        rod.castShadow = true;
        rodParts.add(rod);
        rodParts.add(bar(x + 0.12, za - 0.05, za + 0.01, Y_RAIL + 0.035, 0.05, 0.04, M.steelDark));
      }
    }
  }

  // ---------------- Durmientes de concreto, sujeciones y placas ----------------
  {
    const tieGeo = new T.BoxGeometry(1, TIE.height, TIE.width, 1, 1, 1);
    const pa = tieGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) pa.setZ(i, pa.getZ(i) * (TIE.top / TIE.width)); // sección trapecial
    tieGeo.computeVertexNormals();
    const ties = [];
    const addTie = (x, z, len, dirx = 0, dirz = 1, offset = 0) => ties.push({ x, z, len, dirx, dirz, offset });
    for (let k = Math.ceil((XA - 0.305) / TIE.spacing); ; k++) {
      const x = 0.305 + k * TIE.spacing;
      if (x > XB) break;
      if (x < -2.2 || x > X_SEP) {
        addTie(x, 0, TIE.len);
      } else {
        // durmientes largos del aparato: cubren las dos vías
        const zmax = max(1.295, divC(x + 0.14).z + 1.295);
        let zmin = -1.295;
        if (abs(x - 0.305) < 0.01 || abs(x + 0.305) < 0.01) zmin = STAND.z - 0.75; // durmientes de la palanca
        addTie(x, (zmin + zmax) / 2, zmax - zmin);
      }
    }
    // durmientes propios de la desviada, perpendiculares a su eje
    {
      let u = X_SEP + 0.6;
      while (u < xDivEnd) {
        const c = divC(u);
        addTie(c.x, c.z, TIE.len, -c.tz, c.tx);
        u += TIE.spacing * c.tx;
      }
    }
    const inst = new T.InstancedMesh(tieGeo, M.concrete, ties.length);
    const m4 = new T.Matrix4();
    const q = new T.Quaternion();
    const yAxis = new T.Vector3(0, 1, 0);
    ties.forEach((t, i) => {
      q.setFromAxisAngle(yAxis, atan2(-t.dirz, t.dirx));
      m4.compose(new T.Vector3(t.x, Y_TIE_BOTTOM + TIE.height / 2, t.z), q, new T.Vector3(t.len, 1, 1));
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    track.add(inst);

    // asientos: placa de goma, dos espaldones y dos clips elásticos por carril y durmiente
    const seats = [];
    const lines = [
      { from: XA, to: XB, z: out(-C) },
      { from: XA, to: xDivEnd, z: (x) => (x < 0 ? C : zDiv(C, x)) },
      { from: SWITCH_LEN, to: X_KNUCKLE_A - 1.6, z: ctr(-C) },
      { from: SWITCH_LEN, to: X_KNUCKLE_B - 1.2, z: out(C) },
      { from: X_WING_END + 1.2, to: XB, z: out(C) },
      { from: X_WING_END + 1.2, to: X_SEP, z: ctr(-C) },
    ];
    const slide = [];
    for (const t of ties) {
      if (t.dirx !== 0) {
        // durmiente de la desviada
        for (const d of [-C, C]) {
          const u = t.x;
          const [x, z] = divOff(u, d);
          seats.push({ x, z, ax: -t.dirz, az: t.dirx });
        }
        continue;
      }
      const x = t.x;
      if (x >= -0.4 && x <= SWITCH_LEN + 0.3) {
        // zona de agujas: placas de deslizamiento bajo contraaguja y aguja
        slide.push({ x, z0: -C - 0.11, z1: zDiv(-g, x) + THROW + 0.06 });
        slide.push({ x, z0: g - THROW - 0.06 - (x < SWITCH_LEN ? 0 : 0), z1: zDiv(C, x) + 0.11 });
        continue;
      }
      for (const L of lines) if (x >= L.from && x <= L.to) seats.push({ x, z: L.z(x), ax: 1, az: 0 });
    }
    const padGeo = new T.BoxGeometry(0.17, 0.008, 0.2);
    const shoulderGeo = new T.BoxGeometry(0.11, 0.06, 0.05);
    const clipGeo = new T.TorusGeometry(0.035, 0.009, 6, 12, PI * 1.25);
    const pads = new T.InstancedMesh(padGeo, M.pad, seats.length);
    const shoulders = new T.InstancedMesh(shoulderGeo, M.castIron, seats.length * 2);
    const clips = new T.InstancedMesh(clipGeo, M.clip, seats.length * 2);
    seats.forEach((s, i) => {
      const yaw = atan2(-s.az, s.ax); // a lo largo del carril
      const lat = [-s.az, s.ax]; // transversal, a lo largo del durmiente
      q.setFromAxisAngle(yAxis, yaw);
      m4.compose(new T.Vector3(s.x, Y_TIE_TOP + 0.004, s.z), q, new T.Vector3(1, 1, 1));
      pads.setMatrixAt(i, m4);
      for (const [j, sgn] of [[0, -1], [1, 1]]) {
        m4.compose(new T.Vector3(s.x + sgn * 0.105 * lat[0], Y_TIE_TOP + 0.03, s.z + sgn * 0.105 * lat[1]), q, new T.Vector3(1, 1, 1));
        shoulders.setMatrixAt(i * 2 + j, m4);
        // clip elástico: arco vertical que aprieta el patín desde el espaldón
        const cq = new T.Quaternion().setFromAxisAngle(yAxis, yaw + PI / 2 + (sgn > 0 ? PI : 0));
        m4.compose(new T.Vector3(s.x + sgn * 0.078 * lat[0], Y_RAIL + 0.014, s.z + sgn * 0.078 * lat[1]), cq, new T.Vector3(1, 1, 1));
        clips.setMatrixAt(i * 2 + j, m4);
      }
    });
    for (const im of [pads, shoulders, clips]) {
      im.castShadow = true;
      im.receiveShadow = true;
      track.add(im);
    }
    const slideGeo = new T.BoxGeometry(0.2, 0.018, 1);
    const slides = new T.InstancedMesh(slideGeo, M.steel, slide.length);
    slide.forEach((s, i) => {
      m4.compose(new T.Vector3(s.x, Y_TIE_TOP + 0.009, (s.z0 + s.z1) / 2), new T.Quaternion(), new T.Vector3(1, 1, abs(s.z1 - s.z0)));
      slides.setMatrixAt(i, m4);
    });
    slides.receiveShadow = slides.castShadow = true;
    track.add(slides);
  }

  // ---------------- Balasto y terreno ----------------
  const BED_HALF = 1.6; // medio ancho de la plataforma de balasto
  const bedHeight = (d) => (d <= BED_HALF ? Y_BALLAST : max(Y_GROUND - 0.12, Y_BALLAST - (d - BED_HALF) / 1.5)); // fuera del talud se hunde bajo el terreno
  function distDiv(x, z) {
    if (x < -2) return 1e9;
    let u = x;
    for (let i = 0; i < 4; i++) {
      const c = divC(u);
      u += (x - c.x) * c.tx + (z - c.z) * c.tz;
    }
    const c = divC(u);
    return hypot(x - c.x, z - c.z);
  }
  {
    // malla de alturas en la zona del aparato
    const x0 = -40, x1 = 95, z0 = -4.5, z1 = 16;
    const sx = 0.2, sz = 0.12;
    const nx = Math.round((x1 - x0) / sx);
    const nz = Math.round((z1 - z0) / sz);
    const geo = new T.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
    geo.rotateX(-PI / 2);
    const pa = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i) + (x0 + x1) / 2;
      const z = pa.getZ(i) + (z0 + z1) / 2;
      pa.setX(i, x);
      pa.setZ(i, z);
      const d = min(abs(z), distDiv(x, z));
      pa.setY(i, bedHeight(d) + (rnd() - 0.5) * 0.012);
      uv.setXY(i, x / 1.4, z / 1.4);
    }
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, M.ballast);
    m.receiveShadow = true;
    track.add(m);
    // fuera de esa zona, una banda de balasto barrida a lo largo de cada vía
    const band = (pts) => {
      const across = [-5, -3.4, -2.6, -2.1, -1.6, -1.2, -0.6, 0, 0.6, 1.2, 1.6, 2.1, 2.6, 3.4, 5];
      const pos = [];
      const uvs = [];
      const idx = [];
      let s = 0;
      pts.forEach((p, i) => {
        const a = pts[max(0, i - 1)];
        const b = pts[min(pts.length - 1, i + 1)];
        const l = hypot(b[0] - a[0], b[1] - a[1]);
        const nx2 = -(b[1] - a[1]) / l;
        const nz2 = (b[0] - a[0]) / l;
        if (i) s += hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
        for (const u of across) {
          pos.push(p[0] + u * nx2, bedHeight(abs(u)), p[1] + u * nz2);
          uvs.push(s / 1.4, u / 1.4);
        }
      });
      const w = across.length;
      for (let i = 0; i < pts.length - 1; i++)
        for (let j = 0; j < w - 1; j++) {
          const a = i * w + j;
          idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
        }
      const geo2 = new T.BufferGeometry();
      geo2.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      geo2.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
      geo2.setIndex(idx);
      geo2.computeVertexNormals();
      const mm = new T.Mesh(geo2, M.ballast);
      mm.receiveShadow = true;
      track.add(mm);
    };
    band(sample(XA, x0 + 0.1, () => 0, 2));
    band(sample(x1 - 0.1, XB, () => 0, 2));
    band(sample(x1 - 0.5, xDivEnd + 4, (x) => divC(x).z, 2).map(([x]) => [divC(x).x, divC(x).z]));
    // piedras sueltas sobre la banqueta y entre durmientes, cerca del aparato
    const rockGeo = new T.IcosahedronGeometry(1, 0);
    const N_ROCKS = 14000;
    const rocks = new T.InstancedMesh(rockGeo, M.stone, N_ROCKS);
    const col = new T.Color();
    const q = new T.Quaternion();
    const m4 = new T.Matrix4();
    let placed = 0;
    while (placed < N_ROCKS) {
      const x = -14 + rnd() * 62;
      const z = -2.6 + rnd() * 9;
      const d = min(abs(z), distDiv(x, z));
      if (d > 2.6) continue;
      const y = bedHeight(d);
      const r = 0.014 + rnd() * 0.022;
      q.setFromEuler(new T.Euler(rnd() * PI, rnd() * PI, rnd() * PI));
      m4.compose(new T.Vector3(x, y + r * 0.3, z), q, new T.Vector3(r * (0.8 + rnd() * 0.6), r * (0.6 + rnd() * 0.4), r * (0.8 + rnd() * 0.6)));
      rocks.setMatrixAt(placed, m4);
      const v = 0.16 + rnd() * 0.2;
      rocks.setColorAt(placed, col.setRGB(v + 0.02, v, v - 0.03));
      placed++;
    }
    rocks.receiveShadow = true;
    track.add(rocks);
    // terreno
    const ground = new T.Mesh(new T.PlaneGeometry(3000, 3000), M.grass);
    ground.rotation.x = -PI / 2;
    ground.position.y = Y_GROUND - 0.03;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ---------------- Palanca de contrapeso ----------------
  const stand = new T.Group();
  stand.position.set(STAND.x, Y_TIE_TOP, STAND.z);
  track.add(stand);
  const leverPivot = new T.Group();
  const target = new T.Group();
  {
    const add = (geo, mat, x, y, z, parent = stand) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add(new T.BoxGeometry(0.95, 0.04, 0.62), M.castIron, 0, 0.02, 0); // placa base sobre los dos durmientes
    for (const [x, z] of [[-0.4, -0.24], [0.4, -0.24], [-0.4, 0.24], [0.4, 0.24]]) add(new T.CylinderGeometry(0.022, 0.022, 0.05, 6), M.steel, x, 0.055, z);
    add(new T.BoxGeometry(0.5, 0.36, 0.34), M.castIron, 0, 0.22, 0); // caja de la manivela
    add(new T.BoxGeometry(0.42, 0.04, 0.4), M.castIron, 0, 0.42, 0);
    add(new T.CylinderGeometry(0.035, 0.035, 0.12, 16), M.steel, 0, 0.48, 0.25).rotation.x = PI / 2; // eje de la palanca
    // banderín de posición en un vástago que gira con el cambio
    add(new T.CylinderGeometry(0.025, 0.025, 1.0, 12), M.steel, 0, 0.92, 0);
    target.position.set(0, 1.38, 0);
    stand.add(target);
    const disc = (mat, rot) => {
      const d = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.012, 32), mat);
      d.rotation.z = PI / 2;
      d.rotation.y = rot;
      d.castShadow = true;
      target.add(d);
    };
    disc(M.targetGreen, 0);
    disc(M.targetRed, PI / 2);
    // palanca: brazo, contrapeso y empuñadura; gira en el plano paralelo a la vía
    leverPivot.position.set(0, 0.48, 0.3);
    stand.add(leverPivot);
    const arm = add(new T.BoxGeometry(0.05, 1.15, 0.04), M.lever, 0, 0.5, 0, leverPivot);
    arm.castShadow = true;
    add(new T.SphereGeometry(0.14, 24, 16), M.weight, 0, 0.82, 0, leverPivot).scale.set(1, 1.25, 1);
    add(new T.CylinderGeometry(0.03, 0.03, 0.22, 12), M.handle, 0, 1.17, 0, leverPivot);
    add(new T.BoxGeometry(0.1, 0.06, 0.06), M.lever, 0, -0.02, 0, leverPivot);
  }
  const LEVER_ANGLE = (65 * PI) / 180;

  // ---------------- Tren de carga ----------------
  function routeOf(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    return { pts: points, cum, len: cum[cum.length - 1] };
  }
  const ROUTES = {
    straight: routeOf(sample(XA, XB, () => 0, 1)),
    diverging: routeOf([...sample(XA, 0, () => 0, 1), ...sample(0.5, xDivEnd, (x) => divC(x).z, 0.5)]),
  };
  function at(route, s) {
    const { pts, cum } = route;
    s = clamp(s, 0, route.len);
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m;
      else hi = m;
    }
    const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    const x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t;
    const z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
    return { x, z, yaw: atan2(-(pts[hi][1] - pts[lo][1]), pts[hi][0] - pts[lo][0]) };
  }
  const paint = (color, metal = 0.35, rough = 0.55) => new T.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
  const TM = {
    blue: paint(0x1d3557),
    yellow: paint(0xf2b705, 0.3, 0.5),
    black: paint(0x151515, 0.5, 0.55),
    gray: paint(0x8c9196, 0.45, 0.5),
    oxide: paint(0x7a2e1d, 0.3, 0.7),
    green: paint(0x2f5d3a, 0.3, 0.65),
    glass: new T.MeshStandardMaterial({ color: 0x0b1420, metalness: 1, roughness: 0.05 }),
    light: new T.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff1c0, emissiveIntensity: 2 }),
    truck: paint(0x1a1a1a, 0.7, 0.6),
    wheel: new T.MeshStandardMaterial({ color: 0x3a3634, metalness: 0.9, roughness: 0.45 }),
    tread: new T.MeshStandardMaterial({ color: 0xbfc0c2, metalness: 1, roughness: 0.25 }),
    rail: paint(0xf2b705, 0.3, 0.5),
  };
  const WHEEL_R = 0.457; // rueda de 36"
  const box = (w, h, d, mat, x, y, z, parent) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cyl = (r, len, mat, x, y, z, parent, axis = "x", seg = 20) => {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg), mat);
    if (axis === "x") m.rotation.z = PI / 2;
    if (axis === "z") m.rotation.x = PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  function makeTruck(axles, wb) {
    const truck = new T.Group();
    const wheelsets = [];
    const offs = axles === 3 ? [-wb, 0, wb] : [-wb / 2, wb / 2];
    for (const ax of offs) {
      const ws = new T.Group();
      ws.position.set(ax, WHEEL_R, 0);
      cyl(0.075, 1.9, TM.wheel, 0, 0, 0, ws, "z", 14);
      for (const sz of [-1, 1]) {
        cyl(WHEEL_R, 0.13, TM.wheel, 0, 0, sz * 0.755, ws, "z", 28);
        cyl(WHEEL_R + 0.028, 0.03, TM.wheel, 0, 0, sz * 0.672, ws, "z", 28); // pestaña
        const tread = cyl(WHEEL_R + 0.001, 0.1, TM.tread, 0, 0, sz * 0.765, ws, "z", 28);
        tread.scale.set(1, 1, 1);
        cyl(0.13, 0.05, TM.truck, 0, 0, sz * 0.84, ws, "z", 16); // cubo de la rueda
      }
      truck.add(ws);
      wheelsets.push(ws);
    }
    const span = (axles === 3 ? 2 * wb : wb) + 1.2;
    for (const sz of [-1, 1]) {
      box(span, 0.32, 0.14, TM.truck, 0, WHEEL_R + 0.05, sz * 0.98, truck);
      for (const ax of offs) box(0.36, 0.3, 0.2, TM.truck, ax, WHEEL_R, sz * 1.0, truck);
      cyl(0.11, 0.3, TM.gray, 0, WHEEL_R + 0.02, sz * 0.98, truck, "y", 12); // muelles
    }
    box(0.5, 0.28, 1.8, TM.truck, 0, WHEEL_R + 0.12, 0, truck);
    return { truck, wheelsets };
  }
  function vehicle(len, truckCentre, axles, wb, buildBody) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const trucks = [makeTruck(axles, wb), makeTruck(axles, wb)];
    for (const t of trucks) scene.add(t.truck);
    buildBody(body);
    // enganches y testeros
    for (const sx of [-1, 1]) {
      box(0.6, 0.22, 0.3, TM.black, sx * (len / 2 + 0.2), 1.05, 0, body);
      box(0.15, 0.3, 0.32, TM.black, sx * (len / 2 + 0.45), 1.05, 0, body);
    }
    scene.add(root);
    return { root, body, trucks, len, tc: truckCentre };
  }
  const DECK = 1.25;
  const loco = vehicle(18.0, 4.6, 2, 2.6, (b) => {
    box(17.6, 0.32, 3.1, TM.black, 0, DECK, 0, b); // bastidor
    box(17.6, 0.12, 3.12, TM.yellow, 0, DECK + 0.1, 0, b);
    // capó largo
    box(10.4, 2.35, 2.2, TM.blue, -2.6, DECK + 1.36, 0, b);
    for (let i = 0; i < 8; i++) box(0.9, 1.2, 0.02, TM.black, -6.8 + i * 1.15, DECK + 1.15, 1.11, b);
    for (let i = 0; i < 8; i++) box(0.9, 1.2, 0.02, TM.black, -6.8 + i * 1.15, DECK + 1.15, -1.11, b);
    box(3.0, 0.2, 2.25, TM.gray, -6.2, DECK + 2.62, 0, b); // ventiladores del radiador
    for (const x of [-7.0, -5.4]) cyl(0.5, 0.05, TM.black, x, DECK + 2.74, 0, b, "y", 24);
    cyl(0.12, 0.45, TM.black, -1.0, DECK + 2.75, 0, b, "y", 12); // chimenea
    // cabina
    box(3.0, 2.9, 3.0, TM.blue, 4.2, DECK + 1.6, 0, b);
    box(3.2, 0.14, 3.15, TM.black, 4.2, DECK + 3.1, 0, b);
    box(0.04, 0.85, 2.3, TM.glass, 5.71, DECK + 2.25, 0, b);
    for (const sz of [-1, 1]) box(1.6, 0.8, 0.04, TM.glass, 4.4, DECK + 2.25, sz * 1.5, b);
    // capó corto con los faros
    box(2.4, 1.5, 2.2, TM.blue, 6.9, DECK + 0.92, 0, b);
    box(0.06, 0.4, 2.2, TM.yellow, 8.12, DECK + 0.45, 0, b);
    for (const sz of [-0.35, 0.35]) cyl(0.11, 0.06, TM.light, 8.14, DECK + 1.3, sz, b, "x", 16);
    cyl(0.11, 0.06, TM.light, -7.84, DECK + 2.2, 0, b, "x", 16);
    // depósito de combustible entre bogies
    box(6.0, 1.0, 2.5, TM.black, 0, DECK - 0.7, 0, b);
    // barandillas del pasillo
    for (const sz of [-1.5, 1.5]) {
      cyl(0.02, 15.6, TM.rail, -0.6, DECK + 1.05, sz, b, "x", 6);
      for (let x = -8.2; x <= 7.2; x += 1.75) cyl(0.02, 0.95, TM.rail, x, DECK + 0.62, sz, b, "y", 6);
    }
  });
  const CARS = [
    vehicle(15.6, 5.8, 2, 1.75, (b) => {
      // vagón cerrado (furgón)
      box(15.4, 0.35, 3.0, TM.black, 0, DECK, 0, b);
      box(15.2, 3.3, 3.1, TM.oxide, 0, DECK + 1.82, 0, b);
      for (let x = -6.9; x <= 6.95; x += 1.15) for (const sz of [-1, 1]) box(0.08, 3.2, 0.05, TM.oxide, x, DECK + 1.82, sz * 1.57, b);
      for (const sz of [-1, 1]) box(3.0, 3.0, 0.06, paint(0x5e2416, 0.35, 0.65), 0.6, DECK + 1.75, sz * 1.6, b);
      box(15.2, 0.12, 0.6, TM.gray, 0, DECK + 3.55, 0, b);
    }),
    vehicle(17.8, 6.6, 2, 1.75, (b) => {
      // tolva cubierta: perfil lateral con tres bolsillos, extruido a lo ancho
      const s = new T.Shape();
      s.moveTo(-8.6, 0.3);
      const pockets = [-5.2, 0, 5.2];
      let x = -8.6;
      for (const p of pockets) {
        s.lineTo(p - 2.2, 0.3);
        s.lineTo(p - 0.5, -0.9);
        s.lineTo(p + 0.5, -0.9);
        s.lineTo(p + 2.2, 0.3);
        x = p + 2.2;
      }
      s.lineTo(8.6, 0.3);
      s.lineTo(8.6, 3.2);
      s.quadraticCurveTo(0, 3.65, -8.6, 3.2);
      s.closePath();
      const geo = new T.ExtrudeGeometry(s, { depth: 3.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
      geo.translate(0, 0, -1.55);
      const m = new T.Mesh(geo, TM.gray);
      m.position.y = DECK + 0.1;
      m.castShadow = m.receiveShadow = true;
      b.add(m);
      for (let i = -6; i <= 6; i += 1.5) for (const sz of [-1, 1]) box(0.06, 2.6, 0.04, TM.gray, i, DECK + 1.8, sz * 1.6, b);
      box(15, 0.08, 0.5, TM.black, 0, DECK + 3.62, 0, b);
    }),
    vehicle(17.4, 6.4, 2, 1.75, (b) => {
      // vagón cisterna
      box(17.2, 0.3, 2.6, TM.black, 0, DECK, 0, b);
      cyl(1.45, 15.4, TM.black, 0, DECK + 1.6, 0, b, "x", 40);
      for (const sx of [-1, 1]) {
        const cap = new T.Mesh(new T.SphereGeometry(1.45, 32, 16, 0, PI * 2, 0, PI / 2), TM.black);
        cap.rotation.z = -sx * PI / 2;
        cap.scale.set(1, 0.35, 1);
        cap.position.set(sx * 7.7, DECK + 1.6, 0);
        cap.castShadow = true;
        b.add(cap);
      }
      cyl(0.5, 0.5, TM.black, 0, DECK + 3.1, 0, b, "y", 24);
      box(2.4, 0.06, 1.6, TM.gray, 0, DECK + 3.0, 0, b);
      for (const x of [-4, 4]) for (const sz of [-1, 1]) box(0.08, 0.3, 0.08, TM.black, x, DECK + 0.32, sz * 1.1, b);
    }),
    vehicle(15.6, 5.8, 2, 1.75, (b) => {
      box(15.4, 0.35, 3.0, TM.black, 0, DECK, 0, b);
      box(15.2, 3.3, 3.1, TM.green, 0, DECK + 1.82, 0, b);
      for (let x = -6.9; x <= 6.95; x += 1.15) for (const sz of [-1, 1]) box(0.08, 3.2, 0.05, TM.green, x, DECK + 1.82, sz * 1.57, b);
      for (const sz of [-1, 1]) box(3.0, 3.0, 0.06, paint(0x22442b, 0.35, 0.65), -0.6, DECK + 1.75, sz * 1.6, b);
      box(15.2, 0.12, 0.6, TM.gray, 0, DECK + 3.55, 0, b);
    }),
  ];
  const TRAIN = [loco, ...CARS];
  const GAP = 1.1; // de testero a testero, con los enganches
  const TRAIN_LEN = TRAIN.reduce((a, v) => a + v.len + GAP, 0);
  function placeTrain(route, sFront, spin) {
    let s = sFront;
    for (const v of TRAIN) {
      const sc = s - v.len / 2;
      const f = at(route, sc + v.tc);
      const r = at(route, sc - v.tc);
      v.root.position.set((f.x + r.x) / 2, Y_TOP, (f.z + r.z) / 2);
      v.root.rotation.y = atan2(-(f.z - r.z), f.x - r.x);
      for (const [i, p] of [f, r].entries()) {
        const tr = v.trucks[i];
        tr.truck.position.set(p.x, Y_TOP, p.z);
        tr.truck.rotation.y = p.yaw;
        for (const ws of tr.wheelsets) ws.rotation.z = -spin / WHEEL_R;
      }
      s -= v.len + GAP;
    }
  }
  const showTrain = (on) => TRAIN.forEach((v) => { v.root.visible = on; v.trucks.forEach((t) => (t.truck.visible = on)); });

  // ---------------- Estado y secuencia ----------------
  const ui = {
    button: document.getElementById("throw"),
    follow: document.getElementById("follow"),
    route: document.getElementById("route"),
    state: document.getElementById("state"),
    gapA: document.getElementById("gapA"),
    gapB: document.getElementById("gapB"),
    bar: document.getElementById("bar"),
    fast: document.getElementById("fast"),
  };
  const S = {
    p: 0, // posición de las agujas: 0 directa, 1 desviada
    from: 0,
    to: 0,
    phase: "idle", // idle → throw → lock → train → idle
    t: 0,
    train: null,
  };
  const THROW_TIME = 4.5; // cámara lenta: el cambio real dura alrededor de 1 s
  const LOCK_TIME = 0.8;
  const SPEED = { straight: 16, diverging: 9 }; // m/s; por la desviada de un n.º 10 se circula despacio
  let built = -1;
  function applySwitch() {
    if (abs(S.p - built) > 1e-4) {
      buildSwitch(S.p);
      built = S.p;
    }
    leverPivot.rotation.x = 0;
    leverPivot.rotation.z = -LEVER_ANGLE + 2 * LEVER_ANGLE * S.p;
    target.rotation.y = (PI / 2) * S.p;
    const openA = (1 - S.p) * THROW * 1000;
    const openB = S.p * THROW * 1000;
    ui.gapA.textContent = `${Math.round(openA)} mm`;
    ui.gapB.textContent = `${Math.round(openB)} mm`;
    ui.bar.style.width = `${(S.p * 100).toFixed(1)}%`;
  }
  function setPhase(phase) {
    S.phase = phase;
    S.t = 0;
    const route = S.to >= 0.5 ? "desviada" : "directa";
    ui.route.textContent = route;
    ui.state.textContent = {
      idle: "agujas enclavadas · listo",
      throw: "moviendo agujas (cámara lenta)",
      lock: "comprobando y enclavando",
      train: `tren de carga por la vía ${route}`,
    }[phase];
    ui.state.dataset.phase = phase;
    ui.button.disabled = phase !== "idle";
  }
  ui.button.addEventListener("click", () => {
    if (S.phase !== "idle") return;
    S.from = S.p;
    S.to = S.p >= 0.5 ? 0 : 1;
    setPhase("throw");
  });
  function step(dt) {
    S.t += dt;
    if (S.phase === "throw") {
      const u = clamp(S.t / THROW_TIME, 0, 1);
      S.p = S.from + (S.to - S.from) * ease(u);
      if (u >= 1) setPhase("lock");
    } else if (S.phase === "lock") {
      if (S.t >= LOCK_TIME) {
        const route = S.to >= 0.5 ? "diverging" : "straight";
        S.train = { route, s: ROUTES[route].cum[0] + 75, v: SPEED[route], spin: 0 };
        showTrain(true);
        setPhase("train");
      }
    } else if (S.phase === "train") {
      const tr = S.train;
      const k = ui.fast.checked ? 3 : 1;
      tr.s += tr.v * dt * k;
      tr.spin += tr.v * dt * k;
      placeTrain(ROUTES[tr.route], tr.s, tr.spin);
      if (tr.s - TRAIN_LEN > ROUTES[tr.route].len - 40) {
        S.train = null;
        showTrain(false);
        setPhase("idle");
      }
    }
    applySwitch();
  }

  // ---------------- Bucle ----------------
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const VIEWS = {
    points: { pos: [-5.5, 3.6, 6.2], target: [2.6, 0.45, 0.1] },
    frog: { pos: [X_FROG - 6, 3.2, 6.5], target: [X_FROG + 1, 0.5, 0.9] },
    overview: { pos: [-28, 22, 34], target: [16, 0, 2] },
  };
  let flight = null;
  for (const b of document.querySelectorAll("[data-view]"))
    b.addEventListener("click", () => {
      const v = VIEWS[b.dataset.view];
      ui.follow.checked = false;
      flight = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new T.Vector3(...v.pos), t1: new T.Vector3(...v.target) };
    });
  window.addEventListener("resize", resize);
  resize();
  showTrain(false);
  applySwitch();
  setPhase("idle");
  const clock = new T.Clock();
  const followOffset = new T.Vector3();
  function frame() {
    const dt = min(clock.getDelta(), 1 / 20);
    step(dt);
    if (flight) {
      flight.t = min(1, flight.t + dt / 1.2);
      const k = ease(flight.t);
      camera.position.lerpVectors(flight.p0, flight.p1, k);
      controls.target.lerpVectors(flight.t0, flight.t1, k);
      if (flight.t >= 1) flight = null;
    }
    if (ui.follow.checked && S.train) {
      // la cámara acompaña a la locomotora sin perder el ángulo que eligió el usuario
      const lp = loco.root.position;
      followOffset.subVectors(camera.position, controls.target);
      controls.target.lerp(new T.Vector3(lp.x, 1.5, lp.z), 0.08);
      camera.position.copy(controls.target).add(followOffset);
    }
    controls.update();
    // la sombra sigue a lo que se mira
    sunLight.target.position.copy(controls.target);
    sunLight.position.copy(controls.target).addScaledVector(sun, 120);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  // ganchos para pruebas automáticas: avanzar la simulación y colocar la cámara
  window.__scene = {
    S, X_FROG, R, X_TIP,
    advance(sec) { for (let t = 0; t < sec; t += 1 / 30) step(1 / 30); },
    look(pos, tgt) { flight = null; camera.position.set(...pos); controls.target.set(...tgt); controls.update(); },
  };
})();
