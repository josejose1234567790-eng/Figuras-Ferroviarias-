// Escena 3D del cruce a nivel PK 115+450. Unidades: metros.
// Ejes: x a lo largo de la vía (oriente +x), y hacia arriba, z a lo largo del Periférico (sur +z).
// La vía cruza en z = 0; el cruce ocupa |x| ≤ 42.5 (85 m, 10 carriles).
window.crearEscena = function crearEscena(canvas) {
  const T = THREE;
  const { PI, sin, cos, min, max, abs, floor, hypot } = Math;

  // ---------------- Geometría del Periférico (de poniente a oriente) ----------------
  const ROAD = {
    half: 42.5,
    lane: 3.5,
    // calzadas: [x0, x1] del asfalto con acotamientos
    latW: [-40.5, -32.5], // lateral poniente, 2 carriles hacia el sur
    cenW: [-25, -12], // central poniente, 3 carriles hacia el sur
    cenE: [12, 25], // central oriente, 3 carriles hacia el norte
    latE: [32.5, 40.5], // lateral oriente, 2 carriles hacia el norte
    sepW: [-32.5, -25],
    sepE: [25, 32.5],
    med: [-12, 12],
    walkW: [-42.5, -40.5],
    walkE: [40.5, 42.5],
    LEN: 2300, // el modelo se extiende 2.3 km a cada lado de la vía
  };
  // Ejes de carril. Sentido sur: central poniente; sentido norte: central oriente.
  const LANES = {
    sur: [-22.25, -18.75, -15.25],
    norte: [22.25, 18.75, 15.25],
    latSur: [-38.25, -34.75],
    latNorte: [38.25, 34.75],
  };
  const STOP = 15; // los vehículos se detienen 15 m antes de la vía
  const GATE_Z = 10.5;
  const TRACK = { half: 1500, gauge: 1.435, railTop: 0.03 };

  // ---------------- Render ----------------
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(min(window.devicePixelRatio, 1.75));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  const FOG = 0xd4dde4;
  scene.background = new T.Color(FOG);
  const camera = new T.PerspectiveCamera(38, 1, 0.5, 9000);
  camera.position.set(95, 55, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = PI * 0.47;
  controls.minDistance = 8;
  controls.maxDistance = 4200;
  controls.screenSpacePanning = false;

  const sun = new T.Vector3();
  sun.setFromSphericalCoords(1, T.MathUtils.degToRad(90 - 52), T.MathUtils.degToRad(160));
  const sky = new Sky();
  sky.scale.setScalar(8000);
  const su = sky.material.uniforms;
  su.turbidity.value = 6;
  su.rayleigh.value = 1.2;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.copy(sun);
  scene.add(sky);
  {
    const pmrem = new T.PMREMGenerator(renderer);
    const s2 = new T.Scene();
    const sk = new Sky();
    sk.scale.setScalar(8000);
    for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"]) sk.material.uniforms[k].value = su[k].value;
    sk.material.uniforms.sunPosition.value.copy(sun);
    s2.add(sk);
    scene.environment = pmrem.fromScene(s2, 0.02).texture;
  }
  scene.fog = new T.Fog(FOG, 500, 3600);

  const sunLight = new T.DirectionalLight(0xfff3e0, 2.7);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  const SH = 110;
  Object.assign(sunLight.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 900 });
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.08;
  scene.add(sunLight, sunLight.target);
  scene.add(new T.HemisphereLight(0xdbe8ff, 0x6a5c44, 0.5));
  // La sombra sigue al punto que se mira, para que el cruce y la fila cercana siempre la tengan.
  function placeSun() {
    const c = controls.target;
    sunLight.target.position.copy(c);
    sunLight.position.copy(c).addScaledVector(sun, 500);
    const d = camera.position.distanceTo(c);
    const s = Math.min(420, Math.max(70, d * 0.75));
    const sc = sunLight.shadow.camera;
    if (abs(sc.right - s) > 1) {
      sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
      sc.updateProjectionMatrix();
    }
  }

  // ---------------- Texturas procedurales ----------------
  let seed = 20927703;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = aniso;
    if (srgb) t.encoding = T.sRGBEncoding;
    return t;
  }
  function grain(c, w, h, n, base, spread, alpha) {
    for (let i = 0; i < n; i++) {
      const v = base + (rnd() - 0.5) * spread;
      c.fillStyle = `rgba(${v},${v},${v - 2},${alpha * (0.4 + rnd() * 0.6)})`;
      c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
  }
  // Asfalto con su señalización horizontal. La textura cubre todo el ancho de una calzada
  // y se repite a lo largo (15 m: raya de 5 m y hueco de 10 m).
  const PERIOD = 15;
  function roadTex(width, lanes, { dashed, leftYellow, worn = 0 }) {
    const pxm = 44; // px por metro
    const w = Math.round(width * pxm);
    const h = PERIOD * pxm;
    return canvasTex(w, h, (c) => {
      c.fillStyle = "#4a4c4f";
      c.fillRect(0, 0, w, h);
      grain(c, w, h, 26000, 92, 70, 0.55);
      // huellas de rodada, más oscuras
      for (const lx of lanes) {
        for (const off of [-0.85, 0.85]) {
          const g = c.createLinearGradient((lx + off - 0.4) * pxm, 0, (lx + off + 0.4) * pxm, 0);
          g.addColorStop(0, "rgba(30,30,32,0)");
          g.addColorStop(0.5, `rgba(30,30,32,${0.22 + worn})`);
          g.addColorStop(1, "rgba(30,30,32,0)");
          c.fillStyle = g;
          c.fillRect((lx + off - 0.4) * pxm, 0, 0.8 * pxm, h);
        }
      }
      const line = (x, col, wd = 0.15) => {
        c.fillStyle = col;
        c.fillRect((x - wd / 2) * pxm, 0, wd * pxm, h);
      };
      const edgeL = lanes[0] - 1.75;
      const edgeR = lanes[lanes.length - 1] + 1.75;
      line(edgeL, leftYellow ? "#e0b52a" : "#ecebe6");
      line(edgeR, "#ecebe6");
      for (let i = 1; i < lanes.length; i++) {
        const x = lanes[i] - 1.75;
        if (dashed) {
          c.fillStyle = "#ecebe6";
          c.fillRect((x - 0.075) * pxm, 0, 0.15 * pxm, 5 * pxm);
        } else line(x, "#ecebe6");
      }
      // desgaste de la pintura
      for (let i = 0; i < 1600; i++) {
        c.fillStyle = `rgba(74,76,79,${0.3 + rnd() * 0.5})`;
        c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
      }
    });
  }
  const concreteTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#b7b2a8";
    c.fillRect(0, 0, w, h);
    grain(c, w, h, 22000, 175, 60, 0.5);
    c.strokeStyle = "rgba(90,86,80,0.55)";
    c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      c.beginPath();
      c.moveTo(0, (i * h) / 4);
      c.lineTo(w, (i * h) / 4);
      c.stroke();
    }
  });
  const grassTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#5a6a33";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      const gr = 90 + rnd() * 60;
      c.strokeStyle = `rgba(${gr - 10 + rnd() * 40},${gr + 22},${45 + rnd() * 25},${0.3 + rnd() * 0.4})`;
      const x = rnd() * w;
      const y = rnd() * h;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 5);
      c.stroke();
    }
    for (let i = 0; i < 140; i++) {
      c.fillStyle = `rgba(150,128,92,${0.12 + rnd() * 0.18})`; // tierra caliza
      c.beginPath();
      c.arc(rnd() * w, rnd() * h, 5 + rnd() * 24, 0, PI * 2);
      c.fill();
    }
  });
  const soilTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#a99a7c";
    c.fillRect(0, 0, w, h);
    grain(c, w, h, 30000, 150, 70, 0.55);
    for (let i = 0; i < 300; i++) {
      c.fillStyle = `rgba(110,124,70,${0.15 + rnd() * 0.25})`;
      c.beginPath();
      c.arc(rnd() * w, rnd() * h, 3 + rnd() * 14, 0, PI * 2);
      c.fill();
    }
  });
  const ballastTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#6d675f";
    c.fillRect(0, 0, w, h);
    for (let n = 0; n < 2400; n++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 3 + rnd() * 6;
      const tone = 105 + rnd() * 90;
      c.fillStyle = `rgb(${tone + 8},${tone + 4},${tone - 4})`;
      c.beginPath();
      const k = 5 + floor(rnd() * 3);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * PI * 2 + rnd() * 0.5;
        const rr = r * (0.65 + rnd() * 0.45);
        c[i ? "lineTo" : "moveTo"](x + cos(a) * rr, y + sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(35,32,28,0.55)";
      c.stroke();
    }
  });
  const stripeTex = canvasTex(256, 16, (c, w, h) => {
    // barrera: franjas rojas y blancas de 40 cm
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? "#f4f2ee" : "#c8211b";
      c.fillRect((i * w) / 8, 0, w / 8, h);
    }
  });
  const crossbuckTex = canvasTex(512, 96, (c, w, h) => {
    c.fillStyle = "#f6f5f0";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#111";
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = "#111";
    c.font = "bold 54px Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("FERROCARRIL", w / 2, h / 2 + 3);
  });

  // ---------------- Materiales ----------------
  const std = (o) => new T.MeshStandardMaterial({ metalness: 0, roughness: 0.85, envMapIntensity: 0.35, ...o });
  const M = {
    concrete: std({ map: concreteTex, color: 0xd8d4cc }),
    curb: std({ color: 0xd9d6cf, roughness: 0.9 }),
    curbPaint: std({ color: 0xe9c43a, roughness: 0.8 }),
    grass: std({ map: grassTex, roughness: 1 }),
    soil: std({ map: soilTex, roughness: 1 }),
    ballast: std({ map: ballastTex, color: 0x9a948c, roughness: 0.95 }),
    sleeper: std({ color: 0x9c978e, roughness: 0.9 }),
    rail: new T.MeshStandardMaterial({ color: 0x6b5446, metalness: 0.5, roughness: 0.7 }),
    railTop: new T.MeshStandardMaterial({ color: 0xcfd0d3, metalness: 1, roughness: 0.2 }),
    steel: new T.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.35 }),
    galv: new T.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.7, roughness: 0.45 }),
    dark: std({ color: 0x24272b, roughness: 0.6 }),
    rubber: std({ color: 0x1a1a1a, roughness: 0.9 }),
    white: std({ color: 0xf2f1ed, roughness: 0.6 }),
    stripe: std({ map: stripeTex, roughness: 0.55 }),
    crossbuck: std({ map: crossbuckTex, roughness: 0.6 }),
    bark: std({ color: 0x6b5b48, roughness: 1 }),
    palmBark: std({ color: 0x7a6c58, roughness: 1 }),
    leaf: std({ color: 0x2c4518, roughness: 0.95 }),
    leaf2: std({ color: 0x3a541c, roughness: 0.95 }),
    scrub: std({ color: 0x34481e, roughness: 1, flatShading: true }),
    scrub2: std({ color: 0x415a22, roughness: 1, flatShading: true }),
    scrub3: std({ color: 0x55582e, roughness: 1, flatShading: true }),
    plant: std({ color: 0xe4e6e8, roughness: 0.7 }),
    plantBlue: std({ color: 0x6f8fae, roughness: 0.6 }),
    plantGrey: std({ color: 0xa4a9ae, roughness: 0.7 }),
    stackRed: std({ color: 0xc63a2c, roughness: 0.7 }),
    tank: std({ color: 0xeceae4, roughness: 0.5, metalness: 0.2 }),
    fence: std({ color: 0x8c9196, roughness: 0.6, metalness: 0.5, transparent: true, opacity: 0.55 }),
    paint: std({ color: 0xf1f0ea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
    sign: std({ color: 0x1f6f3c, roughness: 0.6 }),
  };

  const world = new T.Group();
  scene.add(world);
  const box = (w, h, d, mat, x, y, z, parent = world, { cast = true, recv = true } = {}) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = recv;
    parent.add(m);
    return m;
  };
  const cyl = (r0, r1, h, mat, x, y, z, parent = world, seg = 16) => {
    const m = new T.Mesh(new T.CylinderGeometry(r0, r1, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // Plano horizontal (x0..x1, z0..z1) a la altura y.
  function flat(x0, x1, z0, z1, y, mat, { repeat, recv = true } = {}) {
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-PI / 2);
    const m = new T.Mesh(g, mat);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = recv;
    if (repeat && mat.map) {
      mat.map = mat.map.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(repeat[0], repeat[1]);
    }
    world.add(m);
    return m;
  }

  // ---------------- Terreno ----------------
  {
    const g = new T.PlaneGeometry(9000, 9000);
    g.rotateX(-PI / 2);
    const mat = M.grass.clone();
    mat.map = grassTex.clone();
    mat.map.needsUpdate = true;
    mat.map.repeat.set(900, 900);
    const ground = new T.Mesh(g, mat);
    ground.position.y = -0.32;
    ground.receiveShadow = true;
    world.add(ground);
  }

  // ---------------- Calzadas ----------------
  // Cada calzada tiene un tramo junto al cruce con rayas continuas (no se cambia de carril)
  // y el resto con raya discontinua. Se interrumpen en la franja de la vía (|z| < 2.4).
  const CROSS_Z = 2.4;
  const SOLID_Z = 60;
  function carriageway([x0, x1], lanesX, leftYellowSide) {
    const width = x1 - x0;
    const local = lanesX.map((x) => x - x0).sort((a, b) => a - b);
    const mk = (dashed) => {
      const t = roadTex(width, local, { dashed, leftYellow: false });
      const mat = std({ map: t, roughness: 0.92 });
      return mat;
    };
    const dashedMat = mk(true);
    const solidMat = mk(false);
    // la raya amarilla va del lado del camellón: si el camellón queda al oriente (+x), se refleja la textura
    const flip = leftYellowSide === "east";
    for (const sgn of [-1, 1]) {
      for (const [za, zb, mat] of [
        [CROSS_Z, SOLID_Z, solidMat],
        [SOLID_Z, ROAD.LEN, dashedMat],
      ]) {
        const z0 = sgn < 0 ? -zb : za;
        const z1 = sgn < 0 ? -za : zb;
        const g = new T.PlaneGeometry(width, z1 - z0);
        g.rotateX(-PI / 2);
        const uv = g.attributes.uv;
        const reps = (z1 - z0) / PERIOD;
        for (let i = 0; i < uv.count; i++) {
          let u = uv.getX(i);
          if (flip) u = 1 - u;
          uv.setXY(i, u, uv.getY(i) * reps);
        }
        const m = new T.Mesh(g, mat);
        m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
        m.receiveShadow = true;
        world.add(m);
      }
    }
  }
  carriageway(ROAD.latW, LANES.latSur, "east");
  carriageway(ROAD.cenW, LANES.sur, "east");
  carriageway(ROAD.cenE, LANES.norte, "west");
  carriageway(ROAD.latE, LANES.latNorte, "west");
  // Superficie del cruce: losas de concreto en todo el ancho de 85 m.
  {
    // Una losa de 2.4 m (a lo largo de la vía) × 4.8 m: juntas, canal de pestaña y desgaste de rodada.
    const panelTex = canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = "#a9a49a";
      c.fillRect(0, 0, w, h);
      grain(c, w, h, 16000, 160, 70, 0.55);
      const zpx = (z) => ((z + CROSS_Z) / (2 * CROSS_Z)) * h; // v crece con z
      // manchas de aceite y rodadas a lo largo del Periférico (perpendiculares a la vía)
      for (let i = 0; i < 5; i++) {
        c.fillStyle = `rgba(60,58,54,${0.05 + rnd() * 0.08})`;
        c.fillRect(rnd() * w, 0, 18 + rnd() * 30, h);
      }
      c.fillStyle = "rgba(40,38,35,0.85)";
      c.fillRect(0, 0, 3, h); // junta entre losas
      for (const zr of [-TRACK.gauge / 2 - 0.035, TRACK.gauge / 2 + 0.035]) {
        const inner = zr < 0 ? zr + 0.06 : zr - 0.11;
        c.fillStyle = "#1e1d1b"; // canal de pestaña con hule
        c.fillRect(0, zpx(inner), w, (0.05 / (2 * CROSS_Z)) * h + 1);
      }
      c.fillStyle = "rgba(40,38,35,0.6)";
      c.fillRect(0, zpx(-1.2), w, 2);
      c.fillRect(0, zpx(1.2), w, 2);
    });
    panelTex.repeat.set(85 / 2.4, 1);
    const top = new T.Mesh(new T.PlaneGeometry(85, 2 * CROSS_Z).rotateX(-PI / 2), std({ map: panelTex, roughness: 0.9 }));
    top.position.y = 0.002;
    top.receiveShadow = true;
    world.add(top);
    box(85, 0.3, 2 * CROSS_Z, M.curb, 0, -0.152, 0, world, { cast: false });
  }
  // Camellones y separadores: guarnición pintada y pasto, con nariz redondeada junto a la vía.
  function median([x0, x1], { trees = "palm", curbYellow = true } = {}) {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    const zStart = CROSS_Z + 0.4;
    for (const sgn of [-1, 1]) {
      const len = ROAD.LEN - zStart;
      const zc = sgn * (zStart + len / 2);
      const mat = M.grass.clone();
      mat.map = grassTex.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(w / 4, len / 4);
      const top = new T.Mesh(new T.BoxGeometry(w - 0.4, 0.2, len), mat);
      top.position.set(cx, 0.1, zc);
      top.receiveShadow = true;
      world.add(top);
      for (const ex of [x0 + 0.1, x1 - 0.1]) box(0.22, 0.22, len, curbYellow ? M.curbPaint : M.curb, ex, 0.11, zc, world, { cast: false });
      // remate de la guarnición junto a la vía
      box(w, 0.22, 0.22, curbYellow ? M.curbPaint : M.curb, cx, 0.11, sgn * zStart, world, { cast: false });
    }
  }
  median(ROAD.med);
  median(ROAD.sepW, { curbYellow: false });
  median(ROAD.sepE, { curbYellow: false });
  // Banquetas
  for (const [x0, x1] of [ROAD.walkW, ROAD.walkE]) {
    for (const sgn of [-1, 1]) {
      const len = ROAD.LEN - CROSS_Z;
      const mat = M.concrete.clone();
      mat.map = concreteTex.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(1, len / 2);
      box(x1 - x0, 0.18, len, mat, (x0 + x1) / 2, 0.09, sgn * (CROSS_Z + len / 2), world, { cast: false });
    }
  }
  // Líneas de alto a 15 m de la vía y marca de cruce de ferrocarril ("X") en cada calzada de aproximación.
  const xMarkTex = canvasTex(256, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "#f1f0ea";
    c.lineWidth = 22;
    c.beginPath();
    c.moveTo(20, 20);
    c.lineTo(w - 20, h - 20);
    c.moveTo(w - 20, 20);
    c.lineTo(20, h - 20);
    c.stroke();
  });
  const xMarkMat = std({ map: xMarkTex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  function approachMarks([x0, x1], sgn) {
    const w = x1 - x0 - 0.6;
    const cx = (x0 + x1) / 2;
    const stop = new T.Mesh(new T.PlaneGeometry(w, 0.6).rotateX(-PI / 2), M.paint);
    stop.position.set(cx, 0.012, sgn * (STOP + 0.3));
    world.add(stop);
    const xm = new T.Mesh(new T.PlaneGeometry(min(w * 0.8, 7), 14).rotateX(-PI / 2), xMarkMat);
    xm.position.set(cx, 0.012, sgn * 40);
    world.add(xm);
  }
  approachMarks(ROAD.cenW, -1);
  approachMarks(ROAD.latW, -1);
  approachMarks(ROAD.cenE, 1);
  approachMarks(ROAD.latE, 1);

  // ---------------- Vía: balasto, durmientes y rieles ----------------
  const track = new T.Group();
  world.add(track);
  {
    // Terraplén de balasto (sección trapecial) fuera del ancho del cruce.
    const shape = new T.Shape();
    shape.moveTo(-3.1, -0.32);
    shape.lineTo(-1.75, -0.12);
    shape.lineTo(1.75, -0.12);
    shape.lineTo(3.1, -0.32);
    shape.closePath();
    for (const [xa, xb] of [[-TRACK.half, -ROAD.half], [ROAD.half, TRACK.half]]) {
      const len = xb - xa;
      const g = new T.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
      // UV a lo largo de la vía
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 1.5, pos.getZ(i) / 1.5);
      g.rotateY(PI / 2);
      const m = new T.Mesh(g, M.ballast);
      m.position.x = xa;
      m.receiveShadow = true;
      track.add(m);
    }
    // Durmientes de concreto cada 0.6 m (fuera del cruce, donde no los cubren las losas).
    const xs = [];
    for (let x = -TRACK.half + 0.3; x < TRACK.half; x += 0.6) if (abs(x) > ROAD.half + 0.3) xs.push(x);
    const tg = new T.BoxGeometry(0.26, 0.2, 2.6);
    const ties = new T.InstancedMesh(tg, M.sleeper, xs.length);
    const mm = new T.Matrix4();
    xs.forEach((x, i) => ties.setMatrixAt(i, mm.makeTranslation(x, -0.15, 0)));
    ties.receiveShadow = true;
    ties.castShadow = false;
    track.add(ties);
    // Rieles 115 lb/yd: patín, alma y hongo.
    const g = TRACK.gauge / 2 + 0.035;
    const L = 2 * TRACK.half;
    for (const z of [-g, g]) {
      box(L, 0.012, 0.14, M.rail, 0, -0.044, z, track, { cast: false });
      box(L, 0.1, 0.018, M.rail, 0, 0.0, z, track, { cast: false });
      box(L, 0.04, 0.07, M.railTop, 0, TRACK.railTop - 0.02, z, track, { cast: false });
    }
    // Contrarrieles en el cruce (canal de pestaña)
    for (const z of [-g + 0.09, g - 0.09]) box(85, 0.06, 0.05, M.rail, 0, 0.0, z, track, { cast: false });
  }

  // ---------------- Vegetación: camellón con palmas y árboles; monte bajo alrededor ----------------
  const vegGroup = new T.Group();
  world.add(vegGroup);
  function instanced(geo, mat, list, { cast = true } = {}) {
    const im = new T.InstancedMesh(geo, mat, list.length);
    const m4 = new T.Matrix4();
    const q = new T.Quaternion();
    const e = new T.Euler();
    list.forEach((p, i) => {
      e.set(p.rx || 0, p.ry || 0, p.rz || 0);
      q.setFromEuler(e);
      m4.compose(new T.Vector3(p.x, p.y, p.z), q, new T.Vector3(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = cast;
    im.receiveShadow = true;
    vegGroup.add(im);
    return im;
  }
  {
    // Palmas en el camellón central, cada 18 m, a 2 hileras.
    const palms = [];
    for (let z = 12; z < 1600; z += 18) for (const sgn of [-1, 1]) for (const px of [-5, 5]) palms.push({ x: px + (rnd() - 0.5) * 0.6, z: sgn * (z + (px > 0 ? 9 : 0)), h: 7 + rnd() * 4 });
    instanced(new T.CylinderGeometry(0.18, 0.28, 1, 7).translate(0, 0.5, 0), M.palmBark, palms.map((p) => ({ x: p.x, y: 0.2, z: p.z, sx: 1, sy: p.h, sz: 1 })));
    // frondas: 7 hojas arqueadas por palma
    const frond = new T.PlaneGeometry(0.9, 4.2, 1, 4);
    frond.translate(0, 2.1, 0);
    {
      const pos = frond.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const yy = pos.getY(i);
        pos.setZ(i, -0.06 * yy * yy);
        pos.setX(i, pos.getX(i) * (1 - yy / 5));
      }
      frond.computeVertexNormals();
    }
    const fronds = [];
    for (const p of palms)
      for (let k = 0; k < 7; k++) fronds.push({ x: p.x, y: p.h + 0.2, z: p.z, ry: (k / 7) * PI * 2 + rnd(), rx: -0.9 - rnd() * 0.4 });
    const fm = new T.MeshStandardMaterial({ color: 0x3f6224, roughness: 0.9, side: T.DoubleSide });
    const im = new T.InstancedMesh(frond, fm, fronds.length);
    const m4 = new T.Matrix4();
    const q = new T.Quaternion();
    fronds.forEach((f, i) => {
      // primero la inclinación (rx), luego el giro alrededor del tronco (ry)
      q.setFromEuler(new T.Euler(f.rx, f.ry, 0, "YXZ"));
      m4.compose(new T.Vector3(f.x, f.y, f.z), q, new T.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    vegGroup.add(im);
    // Árboles de copa (ramón, laurel) en los separadores laterales y en el centro del camellón.
    const trees = [];
    for (let z = 20; z < 1400; z += 26)
      for (const sgn of [-1, 1]) {
        for (const tx of [-28.75, 28.75]) if (rnd() > 0.25) trees.push({ x: tx + (rnd() - 0.5) * 2, z: sgn * (z + rnd() * 10), s: 2.4 + rnd() * 1.6 });
        if (rnd() > 0.5) trees.push({ x: (rnd() - 0.5) * 3, z: sgn * (z + 6), s: 2 + rnd() * 1.2 });
      }
    instanced(new T.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0), M.bark, trees.map((t) => ({ x: t.x, y: 0.2, z: t.z, sy: t.s * 1.3 })));
    const crown = new T.IcosahedronGeometry(1, 1);
    const crowns = [];
    for (const t of trees)
      for (let k = 0; k < 3; k++) crowns.push({ x: t.x + (rnd() - 0.5) * t.s * 0.8, y: t.s * 1.3 + 0.2 + t.s * (0.5 + rnd() * 0.3), z: t.z + (rnd() - 0.5) * t.s * 0.8, s: t.s * (0.6 + rnd() * 0.3), ry: rnd() * 6 });
    instanced(crown, M.leaf, crowns.filter((_, i) => i % 2 === 0));
    instanced(crown, M.leaf2, crowns.filter((_, i) => i % 2 === 1));
    // Monte bajo yucateco fuera del derecho de vía (evita la vía, la planta y el patio).
    const scrub = [];
    const free = (x, z) =>
      abs(x) > 50 && abs(z) > 10 && !(x > 85 && x < 455 && z < -65 && z > -455) && !(x < -55 && x > -215 && z > 14 && z < 150) &&
      !(abs(z - 67) < 8 && x < 0 && x > -60);
    // manchones: cada uno junta 6–20 arbustos y árboles bajos
    let tries = 0;
    while (scrub.length < 14000 && tries++ < 60000) {
      const cx = (rnd() - 0.5) * 2600;
      const cz = (rnd() - 0.5) * 4200;
      if (!free(cx, cz)) continue;
      const n = 6 + floor(rnd() * 14);
      const spread = 8 + rnd() * 22;
      for (let k = 0; k < n; k++) {
        const x = cx + (rnd() - 0.5) * spread * 2;
        const z = cz + (rnd() - 0.5) * spread * 2;
        if (!free(x, z)) continue;
        const sx = 1.6 + rnd() * 2.8;
        scrub.push({ x, y: 0.8 + rnd() * 2.2, z, sx, sy: 1.8 + rnd() * 2.6, sz: sx * (0.7 + rnd() * 0.5), ry: rnd() * 6 });
      }
    }
    const sg = new T.IcosahedronGeometry(1, 1);
    instanced(sg, M.scrub, scrub.filter((_, i) => i % 3 === 0), { cast: false });
    instanced(sg, M.scrub2, scrub.filter((_, i) => i % 3 === 1), { cast: false });
    instanced(sg, M.scrub3, scrub.filter((_, i) => i % 3 === 2), { cast: false });
  }

  // ---------------- Alumbrado público en el camellón ----------------
  {
    const poles = [];
    for (let z = 30; z < 1500; z += 40) for (const sgn of [-1, 1]) poles.push(sgn * z);
    const pg = new T.CylinderGeometry(0.09, 0.14, 12, 8).translate(0, 6, 0);
    instanced(pg, M.galv, poles.map((z) => ({ x: 0, y: 0.2, z })));
    const arm = new T.BoxGeometry(5, 0.1, 0.1);
    instanced(arm, M.galv, poles.map((z) => ({ x: 0, y: 12, z })));
    const lum = new T.BoxGeometry(0.7, 0.16, 0.35);
    const lums = [];
    for (const z of poles) for (const x of [-2.5, 2.5]) lums.push({ x, y: 11.95, z });
    instanced(lum, M.dark, lums);
  }

  // ---------------- Termoeléctrica Mérida II (ciclo combinado) ----------------
  const plant = new T.Group();
  world.add(plant);
  {
    const px = 270;
    const pz = -260;
    // plataforma y barda perimetral
    const lot = new T.Mesh(new T.BoxGeometry(360, 0.3, 380), M.concrete);
    lot.position.set(px, -0.15, pz);
    lot.receiveShadow = true;
    plant.add(lot);
    const fenceH = 2.6;
    for (const [w, d, x, z] of [[360, 0.2, px, pz - 190], [360, 0.2, px, pz + 190], [0.2, 380, px - 180, pz], [0.2, 380, px + 180, pz]])
      box(w, fenceH, d, M.fence, x, fenceH / 2, z, plant, { cast: false });
    // dos turbinas de gas con su recuperador de calor (HRSG) y chimenea con franjas de balizamiento
    for (const dz of [-60, 10]) {
      box(46, 12, 16, M.plant, px - 70, 6, pz + dz, plant); // nave de turbina de gas
      box(14, 16, 14, M.plantBlue, px - 100, 8, pz + dz, plant); // filtro de aire
      box(34, 28, 18, M.plantGrey, px - 20, 14, pz + dz, plant); // HRSG
      for (let k = 0; k < 6; k++) box(34.2, 0.4, 18.2, M.dark, px - 20, 4 + k * 4.4, pz + dz, plant, { cast: false });
      const sx = px + 6;
      cyl(3.2, 3.6, 58, M.plant, sx, 29, pz + dz, plant, 24);
      for (const h of [44, 50, 56]) cyl(3.25, 3.25, 2.6, M.stackRed, sx, h, pz + dz, plant, 24);
    }
    // nave de turbina de vapor y edificio de control
    box(70, 22, 30, M.plant, px + 70, 11, pz - 30, plant);
    box(70.4, 3, 30.4, M.plantBlue, px + 70, 20, pz - 30, plant);
    box(30, 9, 20, M.plant, px + 40, 4.5, pz + 70, plant);
    // torre de enfriamiento de tiro mecánico: 8 celdas con chimeneas de ventilador
    box(110, 14, 22, M.plantGrey, px + 60, 7, pz - 130, plant);
    for (let k = 0; k < 8; k++) cyl(5, 4.4, 4, M.plantGrey, px + 60 - 48 + k * 13.7, 16, pz - 130, plant, 20);
    // tanques
    for (const [tx, tz, r, h] of [[px - 130, pz - 140, 14, 13], [px - 95, pz - 140, 10, 11], [px - 140, pz + 120, 8, 9]]) cyl(r, r, h, M.tank, tx, h / 2, tz, plant, 32);
    // subestación: marcos de acero
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        const x = px + 110 + i * 9;
        const z = pz + 90 + j * 22;
        for (const dx of [-3, 3]) box(0.4, 12, 0.4, M.galv, x + dx, 6, z, plant);
        box(6.4, 0.4, 0.4, M.galv, x, 12, z, plant);
      }
  }
  // ---------------- Patio de camiones (junto al cruce, al surponiente) ----------------
  const yard = { x0: -210, x1: -60, z0: 18, z1: 145 };
  {
    const mat = M.concrete.clone();
    mat.map = concreteTex.clone();
    mat.map.needsUpdate = true;
    mat.map.repeat.set(30, 25);
    const lot = new T.Mesh(new T.BoxGeometry(yard.x1 - yard.x0, 0.3, yard.z1 - yard.z0), mat);
    lot.position.set((yard.x0 + yard.x1) / 2, -0.15, (yard.z0 + yard.z1) / 2);
    lot.receiveShadow = true;
    world.add(lot);
    box(24, 5, 12, M.plant, yard.x0 + 20, 2.5, yard.z1 - 12);
    box(24.4, 0.4, 12.4, M.plantBlue, yard.x0 + 20, 5.1, yard.z1 - 12);
    // acceso del patio a la lateral poniente
    flat(-60, ROAD.walkW[0], 60, 74, 0.005, std({ color: 0x55575a, roughness: 0.95 }));
  }

  // ---------------- Accesos a lo largo del Periférico ----------------
  // Lado norte (fila del sentido sur): accesos por el poniente. Lado sur (fila del sentido norte): por el oriente.
  const accessMat = std({ map: roadTex(8, [2, 6], { dashed: false }), roughness: 0.92 });
  function accessRoad(z, side) {
    const sgnX = side === "west" ? -1 : 1;
    const x0 = sgnX * ROAD.half;
    const len = 90;
    const g = new T.PlaneGeometry(len, 8);
    g.rotateX(-PI / 2);
    const m = new T.Mesh(g, accessMat);
    m.position.set(x0 + sgnX * len / 2, 0.004, z);
    m.receiveShadow = true;
    world.add(m);
  }
  // Semáforo a 1,270 m: pórtico sobre las calzadas poniente.
  function signalGantry(z) {
    box(0.3, 7, 0.3, M.galv, -43, 3.5, z);
    box(32, 0.3, 0.3, M.galv, -27.5, 7, z);
    for (const x of [-22, -18.5, -15]) {
      box(0.4, 1.1, 0.35, M.dark, x, 6.3, z);
    }
  }

  // ---------------- Etiquetas HTML ancladas a la escena ----------------
  const labelLayer = document.getElementById("labels");
  const labels = [];
  function label(text, pos, cls = "") {
    const el = document.createElement("div");
    el.className = `lbl ${cls}`;
    el.innerHTML = text;
    labelLayer.appendChild(el);
    const L = { el, pos: new T.Vector3(...pos), visible: true, maxDist: Infinity, minDist: 0 };
    labels.push(L);
    return L;
  }
  const v3 = new T.Vector3();
  function updateLabels() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const L of labels) {
      if (!L.visible) {
        L.el.style.display = "none";
        continue;
      }
      v3.copy(L.pos).project(camera);
      const d = camera.position.distanceTo(L.pos);
      const on = v3.z < 1 && v3.z > -1 && abs(v3.x) < 1.05 && abs(v3.y) < 1.05 && d < L.maxDist && d > L.minDist;
      L.el.style.display = on ? "" : "none";
      if (on) L.el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px)`;
    }
  }
  label("Termoeléctrica Mérida II", [250, 62, -255], "lbl-place");
  label("Patio de camiones", [-135, 8, 80], "lbl-place");
  const lblCross = label("Cruce PK 115+450", [0, 6, 0], "lbl-place lbl-small");
  lblCross.maxDist = 900;

  // ---------------- Cámaras ----------------
  const VIEWS = {
    cruce: { pos: [78, 46, 96], target: [-4, 0, 0] },
    filaSur: { pos: [-110, 150, 150], target: [-18, 0, -330] },
    filaNorte: { pos: [110, 150, -150], target: [18, 0, 330] },
    aerea: { pos: [1100, 1900, 60], target: [60, 0, 0] },
    nivel: { pos: [-60, 2.2, -70], target: [0, 1.5, 0] },
  };
  let tween = null;
  function goTo(name, dur = 1.4) {
    const v = VIEWS[name];
    if (!v) return;
    if (dur <= 0) {
      camera.position.set(...v.pos);
      controls.target.set(...v.target);
      tween = null;
      return;
    }
    tween = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: new T.Vector3(...v.pos), t1: new T.Vector3(...v.target) };
  }
  camera.position.set(...VIEWS.cruce.pos);
  controls.target.set(...VIEWS.cruce.target);
  const ease = (t) => t * t * (3 - 2 * t);
  function stepCamera(dt) {
    if (tween) {
      tween.t += dt / tween.dur;
      const k = ease(Math.min(1, tween.t));
      camera.position.lerpVectors(tween.p0, tween.p1, k);
      controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
  }
  controls.addEventListener("start", () => (tween = null));

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function render() {
    placeSun();
    renderer.render(scene, camera);
    updateLabels();
  }

  return {
    T, scene, camera, controls, renderer, world, M, ROAD, LANES, STOP, GATE_Z, TRACK, CROSS_Z,
    box, cyl, std, canvasTex, rnd, label, labels, goTo, stepCamera, render, resize,
    accessRoad, signalGantry, yard, stripeTex,
  };
};
