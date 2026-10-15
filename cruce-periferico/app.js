// Página: escena, controles y bucle. Todas las cifras que se muestran salen de window.MODELO.
(() => {
  const { CRUCE, AFORO, analisis } = window.MODELO;
  const $ = (id) => document.getElementById(id);
  const fmt = (x, d = 0) => x.toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
  const mmss = (s) => {
    const m = Math.floor(s / 60);
    const r = Math.round(s - m * 60);
    return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, "0")}`;
  };
  const min1 = (s) => `${fmt(Math.round((s / 60) * 10) / 10, 1)} min`;
  const hh = (h) => `${String(h).padStart(2, "0")}:00`;

  const S = window.crearEscena($("view"));
  const T = S.T;
  const traffic = window.crearTrafico(S, window.MODELO);
  const train = window.crearTren ? window.crearTren(S, window.MODELO) : null;

  // ---------------- Estado ----------------
  const P = { aforo: AFORO.referencia, hora: 10, vel: 15, carros: 33, play: 10 };
  let R = analisis(P);
  let t = 0; // tiempo simulado (s)
  let clockBase = P.hora * 3600;
  let ev = null; // evento del tren en curso

  // ---------------- Accesos y marcas de fila en la vía ----------------
  const accLabels = { sur: [], norte: [] };
  for (const a of CRUCE.accesos.sur) {
    if (a.nombre === "Semáforo") S.signalGantry(-a.d);
    else S.accessRoad(-a.d, "west");
  }
  for (const a of CRUCE.accesos.norte) S.accessRoad(a.d, "east");
  const bandMat = {
    sur: new T.MeshBasicMaterial({ color: 0x1d63c9, transparent: true, opacity: 0.2, depthWrite: false }),
    norte: new T.MeshBasicMaterial({ color: 0xe06a0e, transparent: true, opacity: 0.2, depthWrite: false }),
  };
  const lineMat = {
    ok: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    bad: new T.MeshBasicMaterial({ color: 0xc8231b, transparent: true, opacity: 0.95, depthWrite: false }),
    sur: new T.MeshBasicMaterial({ color: 0x1d63c9, depthWrite: false }),
    norte: new T.MeshBasicMaterial({ color: 0xe06a0e, depthWrite: false }),
  };
  const markers = {};
  for (const dir of ["sur", "norte"]) {
    const xs = S.LANES[dir];
    const x0 = Math.min(...xs) - 1.75;
    const x1 = Math.max(...xs) + 1.75;
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    const sgn = dir === "sur" ? -1 : 1;
    const band = new T.Mesh(new T.PlaneGeometry(w, 1).rotateX(-Math.PI / 2), bandMat[dir]);
    band.renderOrder = 2;
    S.world.add(band);
    const endLine = new T.Mesh(new T.PlaneGeometry(w + 3, 1.6).rotateX(-Math.PI / 2), lineMat[dir]);
    endLine.renderOrder = 3;
    S.world.add(endLine);
    const pole = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 9, 8), lineMat[dir]);
    S.world.add(pole);
    const flag = new T.Mesh(new T.PlaneGeometry(2.6, 1.6), new T.MeshBasicMaterial({ color: dir === "sur" ? 0x1d63c9 : 0xe06a0e, side: T.DoubleSide }));
    S.world.add(flag);
    const lbl = S.label("", [cx, 10, 0], `lbl-q-${dir}`);
    lbl.maxDist = 3000;
    const acc = CRUCE.accesos[dir].map((a) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, 0.9).rotateX(-Math.PI / 2), lineMat.ok);
      m.position.set(cx, 0.03, sgn * a.d);
      m.renderOrder = 3;
      S.world.add(m);
      const L = S.label("", [dir === "sur" ? -47 : 47, 3, sgn * a.d], `lbl-acc lbl-${dir}`);
      L.maxDist = 2600;
      return { a, m, L };
    });
    markers[dir] = { band, endLine, pole, flag, lbl, acc, cx, w, sgn, x1, x0 };
  }
  const lblLat = S.label("Laterales: sin carga en el cálculo (supuesto conservador)", [-36.5, 1.5, -95], "lbl-note");
  lblLat.maxDist = 320;
  const lblDet = S.label("Detección del tren: preaviso de 60 s", [0, 3, 0], "lbl-note");
  lblDet.maxDist = 900;

  function updateMarkers() {
    for (const dir of ["sur", "norte"]) {
      const M = markers[dir];
      const r = R[dir];
      const L = r.largoFila;
      M.band.scale.z = L;
      M.band.position.set(M.cx, 0.025, (M.sgn * L) / 2);
      M.endLine.position.set(M.cx, 0.035, M.sgn * L);
      const px = dir === "sur" ? M.x0 - 2.2 : M.x1 + 2.2;
      M.pole.position.set(px, 4.5, M.sgn * L);
      M.flag.position.set(px + (dir === "sur" ? 1.3 : -1.3), 8.1, M.sgn * L);
      M.lbl.pos.set(px, 9.4, M.sgn * L);
      M.lbl.el.textContent = `Fila calculada ${fmt(Math.round(L))} m · ${fmt(r.fila)} veh`;
      for (const A of M.acc) {
        const over = L - A.a.d;
        A.m.material = over > 0 ? lineMat.bad : lineMat.ok;
        A.L.el.className = `lbl lbl-acc ${over > 0 ? "lbl-red" : `lbl-${dir}`}`;
        A.L.el.textContent = over > 0 ? `${A.a.nombre} · ${fmt(A.a.d)} m — la fila lo rebasa por ${fmt(Math.round(over))} m` : `${A.a.nombre} · ${fmt(A.a.d)} m`;
      }
    }
    // punto de detección: el tren lo pisa 60 s antes de llegar al cruce
    const xd = -CRUCE.anchoCruce / 2 - CRUCE.preaviso * R.cierre.v;
    lblDet.pos.set(xd, 3, 0);
    if (train) train.setDetection(xd);
  }

  // ---------------- Vista de la fila con escala comprimida (canvas 2D) ----------------
  const qWrap = $("queueView");
  const qCan = document.createElement("canvas");
  qWrap.appendChild(qCan);
  const qc = qCan.getContext("2d");
  let qW = 0;
  let qH = 0;
  const QROW = 104;
  function sizeQueue() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    qW = qWrap.clientWidth - 0;
    qH = 2 * QROW + 52;
    qCan.width = qW * dpr;
    qCan.height = qH * dpr;
    qCan.style.width = qW + "px";
    qCan.style.height = qH + "px";
    qc.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", sizeQueue);
  sizeQueue();
  const TYPE_INK = { motos: "#7d8590", autos: "#8e959e", autobuses: "#5c6a78", C2: "#626b75", C3: "#56606b", T3S2: "#3f4852", T3S3: "#3f4852", T3S2R4: "#2f3740", otros: "#7d8590" };
  const COL = { sur: "#1d63c9", norte: "#e06a0e", red: "#c8231b", ink: "#1b2027", ink2: "#4a525d", ink3: "#7a828c", line: "#dedbd3" };
  function drawQueue(snap) {
    const narrow = qW < 560;
    const left = narrow ? 34 : 128;
    const right = 14;
    const maxQ = Math.max(R.sur.largoFila, R.norte.largoFila);
    const Dmax = Math.max(1300, Math.ceil((maxQ + 60) / 100) * 100);
    const k = (qW - left - right) / Dmax; // px por metro
    const X = (d) => left + d * k;
    qc.clearRect(0, 0, qW, qH);
    qc.font = "11px system-ui, sans-serif";
    qc.textBaseline = "middle";
    const rows = [
      ["sur", "Sentido sur", "lado norte de la vía"],
      ["norte", "Sentido norte", "lado sur de la vía"],
    ];
    rows.forEach(([dir, name, side], ri) => {
      const y0 = 8 + ri * QROW;
      const laneY = y0 + 42;
      const lh = 7;
      const r = R[dir];
      const c = COL[dir];
      // rótulo
      if (!narrow) {
        qc.fillStyle = c;
        qc.font = "600 12.5px system-ui, sans-serif";
        qc.fillText(name, 8, laneY + 4);
        qc.fillStyle = COL.ink3;
        qc.font = "11px system-ui, sans-serif";
        qc.fillText(side, 8, laneY + 19);
      } else {
        qc.fillStyle = c;
        qc.font = "600 11px system-ui, sans-serif";
        qc.fillText(dir === "sur" ? "S" : "N", 8, laneY + 11);
      }
      // calzada de 3 carriles
      qc.fillStyle = "#e9e7e1";
      qc.fillRect(X(0), laneY - 2, Dmax * k, 3 * lh + 8);
      // fila calculada
      const L = r.largoFila;
      qc.fillStyle = dir === "sur" ? "rgba(29,99,201,0.16)" : "rgba(224,106,14,0.16)";
      qc.fillRect(X(0), laneY - 2, L * k, 3 * lh + 8);
      qc.fillStyle = c;
      qc.fillRect(X(L) - 1, laneY - 8, 2, 3 * lh + 20);
      // vía
      qc.fillStyle = COL.ink;
      qc.fillRect(X(0) - 1, laneY - 10, 2, 3 * lh + 24);
      // línea de alto
      qc.fillStyle = "#fff";
      qc.fillRect(X(CRUCE.detencion), laneY - 2, 1, 3 * lh + 8);
      // vehículos animados
      const lanes = snap[dir].lanes;
      for (let l = 0; l < 3; l++) {
        const yy = laneY + 2 + l * lh;
        for (const v of lanes[l]) {
          if (v.s < 0 || v.s > Dmax) continue;
          qc.fillStyle = v.stopped ? c : TYPE_INK[v.type];
          qc.globalAlpha = v.stopped ? 0.95 : 0.7;
          qc.fillRect(X(v.s), yy, Math.max(1, v.len * k), lh - 2);
        }
      }
      qc.globalAlpha = 1;
      // accesos: rótulos en dos alturas para que no se encimen
      const placed = [];
      for (const a of CRUCE.accesos[dir]) {
        const over = L - a.d;
        const xa = X(a.d);
        qc.strokeStyle = over > 0 ? COL.red : COL.ink2;
        qc.lineWidth = over > 0 ? 2 : 1;
        qc.setLineDash(over > 0 ? [] : [3, 3]);
        qc.beginPath();
        qc.moveTo(xa, y0 + 28);
        qc.lineTo(xa, laneY + 3 * lh + 8);
        qc.stroke();
        qc.setLineDash([]);
        qc.fillStyle = over > 0 ? COL.red : COL.ink2;
        qc.font = `${over > 0 ? "600 " : ""}11px system-ui, sans-serif`;
        const txt = narrow ? `${fmt(a.d)}` : `${a.nombre} ${fmt(a.d)} m`;
        const tw = qc.measureText(txt).width;
        let x0 = Math.min(qW - 4 - tw, Math.max(left, xa - tw / 2));
        let lvl = 0;
        while (placed.some((p) => p.lvl === lvl && x0 < p.x1 + 8 && x0 + tw > p.x0 - 8)) lvl++;
        placed.push({ x0, x1: x0 + tw, lvl });
        const ly = y0 + 22 - lvl * 13;
        qc.fillText(txt, x0, ly);
        qc.textAlign = "center";
        if (over > 0) qc.fillText(`+${fmt(Math.round(over))} m`, xa, laneY + 3 * lh + 18);
        qc.textAlign = "left";
      }
      // rótulo de la fila calculada
      qc.font = "600 11.5px system-ui, sans-serif";
      const lt = `Fila ${fmt(Math.round(L))} m · ${fmt(r.fila)} veh`;
      const tw = qc.measureText(lt).width;
      let lx = X(L) + 5;
      if (lx + tw > qW - 4) lx = X(L) - 5 - tw;
      qc.fillStyle = c;
      qc.fillText(lt, lx, laneY + 3 * lh + 18);
    });
    // regla y escala
    const yA = 8 + 2 * QROW + 4;
    qc.strokeStyle = COL.ink3;
    qc.fillStyle = COL.ink3;
    qc.lineWidth = 1;
    qc.beginPath();
    qc.moveTo(X(0), yA);
    qc.lineTo(X(Dmax), yA);
    qc.stroke();
    qc.textAlign = "center";
    qc.font = "10.5px system-ui, sans-serif";
    const step = k * 100 < 26 ? 200 : 100;
    for (let d = 0; d <= Dmax; d += 100) {
      const major = d % (step * 2) === 0 || step === 100;
      qc.beginPath();
      qc.moveTo(X(d), yA);
      qc.lineTo(X(d), yA + (major ? 5 : 3));
      qc.stroke();
      if (d % step === 0) {
        const lbl = d === 0 ? "vía" : fmt(d);
        const half = qc.measureText(lbl).width / 2;
        qc.fillText(lbl, Math.min(qW - 2 - half, X(d)), yA + 13);
      }
    }
    qc.textAlign = "left";
    // barra de escala
    const sb = 200 * k;
    const sx = qW - right - sb;
    const sy = yA + 30;
    qc.fillStyle = COL.ink;
    qc.fillRect(sx, sy, sb, 3);
    qc.fillRect(sx, sy - 3, 1, 9);
    qc.fillRect(sx + sb - 1, sy - 3, 1, 9);
    qc.font = "11px system-ui, sans-serif";
    qc.textAlign = "right";
    qc.fillText(narrow ? `200 m · 1 px ≈ ${fmt(1 / k, 1)} m` : `200 m  ·  escala comprimida: 1 px ≈ ${fmt(1 / k, 1)} m`, sx - 8, sy + 2);
    qc.textAlign = "left";
    qc.fillStyle = COL.ink3;
    if (!narrow) qc.fillText("distancia desde la vía (m)", X(0), sy + 2);
  }

  // ---------------- Evento del tren ----------------
  const APPROACH = 80; // m que recorre el tren a la vista antes de pisar el punto de detección
  function startTrain() {
    if (ev) return;
    const ci = R.cierre;
    const tPress = t;
    const t0 = tPress + APPROACH / ci.v;
    const tc = t0 + ci.total;
    const tg = tc + CRUCE.tiempoPerdido;
    const dis = Math.max(R.sur.disipacion, R.norte.disipacion);
    ev = { tPress, t0, tc, tg, tEnd: tg + (isFinite(dis) ? dis : 600), ci, R };
    traffic.trigger({ t0, tc, tg });
    if (train) train.start({ t0, ci, carros: P.carros });
    setLocked(true);
    layoutTimeline();
  }
  function phaseOf(time) {
    if (!ev) return ["libre", "Cruce abierto · tránsito libre"];
    const { t0, tc, tg, tEnd, ci } = ev;
    if (time < t0) return ["aprox", "Tren aproximándose al punto de detección"];
    if (time < t0 + ci.preaviso) return ["preaviso", `Preaviso: luces encendidas, bajan las barreras · ${mmss(time - t0)}`];
    if (time < tc - ci.reapertura) return ["tren", `Paso del tren · cruce cerrado ${mmss(time - t0)}`];
    if (time < tc) return ["reapertura", `Reapertura: suben las barreras · ${mmss(time - t0)}`];
    if (time < tg) return ["arranque", "Arranque: 3 s de tiempo perdido"];
    if (time < tEnd) return ["disipacion", `Disipación de la fila · ${mmss(time - tg)}`];
    return ["libre", "Tránsito normalizado"];
  }
  function layoutTimeline() {
    const r = ev ? ev.R : R;
    const ci = r.cierre;
    const dis = Math.max(r.sur.disipacion, r.norte.disipacion);
    const total = ci.total + 3 + (isFinite(dis) ? dis : 0);
    const w = (x) => `${(x / total) * 100}%`;
    $("tlPre").style.width = w(ci.preaviso);
    $("tlPass").style.width = w(ci.paso);
    $("tlRe").style.width = w(ci.reapertura);
    $("tlLost").style.width = w(3);
    $("tlDis").style.width = w(isFinite(dis) ? dis : 0);
    return total;
  }
  function updateTimeline() {
    const total = layoutTimeline();
    let f = 0;
    if (ev) f = Math.min(1, Math.max(0, (t - ev.t0) / total));
    $("tlCursor").style.left = `calc(${f * 100}% - 1px)`;
  }
  // Fila del modelo en un instante (cola vertical): llegadas × tiempo durante el bloqueo, luego se vacía a (salida − llegadas).
  function modelQueueAt(dir, time) {
    if (!ev) return 0;
    const r = ev.R[dir];
    const sal = ev.R.derivados.salida;
    if (time < ev.t0) return 0;
    if (time < ev.tg) return r.llegadas * (time - ev.t0);
    return Math.max(0, r.fila - (sal - r.llegadas) * (time - ev.tg));
  }

  // ---------------- Controles (básicos; los paneles completos van en la etapa 5) ----------------
  function setLocked(on) {
    $("go").disabled = on;
    $("go").textContent = on ? "Tren en curso…" : "Pasar tren";
    document.querySelectorAll('.seg[data-ctl="aforo"] button, .seg[data-ctl="vel"] button, .seg[data-ctl="carros"] button').forEach((b) => (b.disabled = on));
    $("hora").disabled = on;
  }
  function recompute() {
    R = analisis(P);
    traffic.setRates(R.sur.llegadas, R.norte.llegadas);
    updateMarkers();
    if (window.__panels) window.__panels(R, P);
  }
  document.querySelectorAll(".seg").forEach((seg) =>
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      P[seg.dataset.ctl] = Number(b.dataset.v);
      if (seg.dataset.ctl !== "play") recompute();
    }),
  );
  function setHour(h) {
    P.hora = h;
    $("hora").value = h;
    clockBase = h * 3600 - t;
    recompute();
  }
  $("hora").addEventListener("input", (e) => setHour(Number(e.target.value)));
  $("go").addEventListener("click", startTrain);
  const viewBtns = document.querySelectorAll(".views button");
  let follow = false;
  viewBtns.forEach((b) =>
    b.addEventListener("click", () => {
      viewBtns.forEach((x) => x.classList.toggle("on", x === b));
      follow = b.dataset.view === "tren";
      if (!follow) S.goTo(b.dataset.view);
    }),
  );
  S.controls.addEventListener("start", () => {
    if (follow) return;
    viewBtns.forEach((x) => x.classList.remove("on"));
  });

  // ---------------- Bucle ----------------
  recompute();
  traffic.warm(0);
  let last = performance.now();
  let lastUi = 0;
  function frame(now) {
    const wall = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dt = wall * P.play;
    t += dt;
    traffic.step(t, dt);
    traffic.draw();
    if (train) {
      train.update(t, now / 1000, ev);
      if (follow) train.follow(S.camera, S.controls, wall);
    }
    S.stepCamera(wall);
    S.render();
    if (now - lastUi > 66) {
      lastUi = now;
      const snap = traffic.snapshot();
      drawQueue(snap);
      const [ph, txt] = phaseOf(t);
      $("phase").dataset.phase = ph;
      $("phase").textContent = txt;
      const c = (((clockBase + t) % 86400) + 86400) % 86400;
      $("clock").textContent = `Hora simulada ${String(Math.floor(c / 3600)).padStart(2, "0")}:${String(Math.floor((c % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(c % 60)).padStart(2, "0")} · ×${P.play}`;
      const qs = Math.round(modelQueueAt("sur", t));
      const qn = Math.round(modelQueueAt("norte", t));
      $("readout").textContent = ev && t >= ev.t0 ? `Fila del modelo en este instante: sur ${fmt(qs)} veh · norte ${fmt(qn)} veh` : `Llegadas: sur ${fmt(Math.round(R.sur.llegadasH))} veh/h · norte ${fmt(Math.round(R.norte.llegadasH))} veh/h`;
      $("queueReadout").textContent = `Sur ${fmt(Math.round(R.sur.largoFila))} m · Norte ${fmt(Math.round(R.norte.largoFila))} m`;
      updateTimeline();
      if (ev && t > ev.tEnd + 5) {
        ev = null;
        traffic.clearEvent();
        setLocked(false);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Avanza el tiempo simulado sin dibujar (para pruebas y capturas).
  function advance(sec) {
    for (let k = 0; k < sec / 0.5; k++) {
      t += 0.5;
      traffic.step(t, 0.5);
      if (train) train.update(t, performance.now() / 1000, ev);
    }
    lastUi = 0;
  }
  window.__app = { advance, S, traffic, P, get R() { return R; }, get t() { return t; }, startTrain, setHour, modelQueueAt, get ev() { return ev; } };
})();
