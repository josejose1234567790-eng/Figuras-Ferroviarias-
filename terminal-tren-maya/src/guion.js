// Las 19 escenas de la operación (fases 1 a 3 según la guía "Arribo y recepción en destino";
// fases 4 y 5 como proceso propuesto). Coordenadas en metros sobre el trazo de la terminal.
import { Script, World, vehPose, routeS, standPos, DECK } from "./scenario.js";
import { trackRoute, sAtX } from "./routes.js";
import { V_PATIO, V_LENTA, KMH } from "./motion.js";
import { TRACKS, SITE, YARD } from "./layout.js";

const TR = (id) => TRACKS.find((t) => t.id === id);
const pad = (n) => String(n).padStart(2, "0");
export const CAR = (i) => `TMY 2001${pad(i)}`;
export const ROAD = "TMY 2002";
export const YARDL = "TMY 2008";
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const cars = (a, b) => range(a, b).map(CAR);

// ---- utilidades de cámara (funciones del estado)
const fV = (id, dy = 2.2) => (W) => {
  const v = vehPose(W, id);
  return { x: v.x, y: dy, z: v.z, tx: v.tx, tz: v.tz };
};
const fP = (key, dy = 1.3) => (W) => {
  const p = W.ppl[key];
  return { x: p.x, y: p.y + dy, z: p.z, tx: Math.cos(p.h), tz: -Math.sin(p.h) };
};
const fXYZ = (x, y, z) => () => ({ x, y, z, tx: 1, tz: 0 });
export const SHOT = {
  fixed: (pos, target, f = 35, dof = false) => () => ({ pos, target, f, dof }),
  orbit: (focus, { r = 30, h = 10, w = 0.03, a0 = 0, f = 35, dof = false } = {}) => (W, tl) => {
    const c = focus(W);
    const a = a0 + w * tl;
    return { pos: [c.x + Math.cos(a) * r, c.y + h, c.z + Math.sin(a) * r], target: [c.x, c.y, c.z], f, dof };
  },
  side: (focus, { d = 22, h = 3, along = 0, f = 35, side = 1, zSide = 0, look = 0, dof = false } = {}) => (W) => {
    const c = focus(W);
    // zSide fija el lado en coordenadas del mundo (+1 sur, -1 norte) sin importar el sentido de marcha
    const nx = zSide ? 0 : -c.tz * side;
    const nz = zSide ? zSide : c.tx * side;
    return { pos: [c.x + nx * d + c.tx * along, c.y + h, c.z + nz * d + c.tz * along], target: [c.x + c.tx * look, c.y, c.z + c.tz * look], f, dof };
  },
  dolly: (from, to, target, dur, f = 35, dof = false) => (W, tl) => {
    const k = Math.min(1, tl / dur);
    const e = k * k * (3 - 2 * k);
    return { pos: from.map((v, i) => v + (to[i] - v) * e), target, f, dof };
  },
  // grúa: sube y avanza mientras mira a un foco
  crane: (focus, { from, to, dur, f = 28 } = {}) => (W, tl) => {
    const c = focus(W);
    const k = Math.min(1, tl / dur);
    const e = k * k * (3 - 2 * k);
    return { pos: [c.x + from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, c.z + from[2] + (to[2] - from[2]) * e], target: [c.x, c.y, c.z], f };
  },
};

// Lateral sur de una vía en x (para personas que caminan junto al tren)
const SOUTH = (track, x, d = 2.4) => {
  const z = YARD[track]?.z ?? 0;
  return [x, z + d];
};
const NORTH = (track, x, d = 2.4) => {
  const z = YARD[track]?.z ?? 0;
  return [x, z - d];
};

export function buildScript(equipo) {
  const byId = {};
  const len = {};
  for (const v of equipo.fleet.vehicles) {
    byId[v.id] = v;
    len[v.id] = v.length;
  }
  const S = new Script(byId, len);
  const W0 = S.cur;
  // ---------- estado inicial
  const PR = trackRoute("principal");
  let s = sAtX(TR("principal"), -1360);
  const train = [ROAD, ...cars(1, 33)];
  for (const id of train) {
    const L = len[id];
    const c = s - L / 2;
    const i = id === ROAD ? 0 : Number(id.slice(-2));
    W0.veh[id] = { route: PR, s: c, dir: i > 0 && i % 3 === 0 ? -1 : 1, load: 0, roll: 0 };
    s = c - L / 2;
  }
  const STK = trackRoute("stock");
  W0.veh[YARDL] = { route: STK, s: sAtX(TR("stock"), -195) - len[YARDL] / 2, dir: 1, load: 0, roll: 0 };
  const bgByTrack = { clasif1: [], clasif2: [], clasif3: [] };
  for (const v of equipo.bg) {
    const k = v.type.name === "Furgón" ? "clasif1" : v.type.name === "Góndola" ? "clasif2" : "clasif3";
    bgByTrack[k].push(v);
  }
  for (const [k, list] of Object.entries(bgByTrack)) {
    const r = trackRoute(k);
    let ss = r.length - (k === "clasif3" ? 30 : 4);
    list.forEach((v, i) => {
      const c = ss - v.length / 2;
      W0.veh[v.id] = { route: r, s: c, dir: i % 2 ? -1 : 1, load: v.type.name === "Góndola" ? 1 : 0.6, roll: 0 };
      ss = c - v.length / 2;
    });
  }
  const P = (x, y, z, h, g = null, vis = true) => ({ x, y, z, h, g, vis, gait: 0, moving: false });
  const N = Math.PI / 2; // mirando al norte (hacia las vías)
  W0.ppl = {
    jefe: P(-641, 0, 22.4, N, "radio"),
    mayordomo: P(-636.5, 0, 23.2, N),
    maqPatio: P(-199, 0, 13.4, N),
    garPatio: P(-552, 0, 7.6, N),
    inspector: P(-640, 0, 20.5, N),
    bascula: P(-468.6, 0.33, 4.4, N),
    maqCamino: P(0, 0, 0, 0, null, false),
    garCamino: P(0, 0, 0, 0, null, false),
    llenadera: P(-20, DECK, -37.4, 0),
  };
  W0.smoke = { [ROAD]: 2.0, [YARDL]: 0.6 };

  const DOC = {
    edi: "EDI 417 · EDI 418 · CONSIST",
    od14: "OD-14 · tarjeta de entrada",
  };
  const F1 = "Fase 1 · Arribo";
  const F2 = "Fase 2 · Recepción";
  const F3 = "Fase 3 · Clasificación";
  const F4 = "Fase 4 · Carga";
  const F5 = "Fase 5 · Formación y salida";

  // ============ FASE 1 ============
  S.scene({ fase: F1, paso: 1, puesto: "Jefe de patio", actividad: "Coordina la recepción y asigna la vía de llegada (vía de recibo) con la información EDI 417 y EDI 418.", tiempo: "5 min", documento: DOC.edi, nominal: 5 }, (sc) => {
    sc.cam(SHOT.dolly([-664, 5, 0], [-652, 2.2, 12], [-640, 1.5, 22.8], 40, 50, true), 0);
    sc.focus(fP("jefe"), 0);
    sc.gesture("jefe", "radio", 120, { keep: true });
    sc.gesture("mayordomo", "escribir", 200, { at: 10, keep: true, advance: false });
    sc.cam(SHOT.orbit(fP("jefe", 1.2), { r: 7.5, h: 1.0, w: 0.02, a0: 1.2, f: 50, dof: true }), 60);
    sc.cam(SHOT.fixed([-720, 60, 140], [-1300, 0, 0], 28), 160);
    sc.focus(fV(ROAD), 160);
  });

  S.scene({ fase: F1, paso: 2, puesto: "Jefe de patio · Maquinista de camino", actividad: "El tren de 33 carros-tanque vacíos se aproxima por la vía principal; se alinean los cambios y la señal de entrada pasa a verde.", tiempo: "3–5 min", documento: DOC.edi, nominal: 0 }, (sc) => {
    sc.focus(fV(ROAD), 0);
    sc.cam(SHOT.side(fV(ROAD), { d: 26, h: 7, along: 40, f: 35, side: 1 }), 0);
    sc.switchTo("cambio-ladera-poniente", 1, 20);
    sc.switchTo("cambio-recibo-poniente", 1, 26);
    sc.signal("entrada", "verde", 40);
    const m = sc.move(train, [{ track: "principal", fromX: -2000, toX: -700 }], { headTo: { track: "principal", x: -785 }, v0: 20 * KMH, vmax: 20 * KMH, vEnd: V_PATIO });
    sc.cam(SHOT.fixed([-742, 2.0, 9.5], [-830, 2.6, 0], 50), m.t1 - 70);
  });

  S.scene({ fase: F1, paso: 3, puesto: "Maquinista de camino", actividad: "Posiciona el tren en la vía de recibo asignada; cruza la báscula a 5 km/h y se detiene con la locomotora al extremo oriente.", tiempo: "10–60 min", documento: DOC.edi, nominal: 20 }, (sc) => {
    sc.focus(fV(ROAD), 0);
    sc.cam(SHOT.side(fV(ROAD), { d: 18, h: 3, along: 25, f: 35, side: 1 }), 0);
    const m = sc.move(train, [{ track: "principal", fromX: -1700 }, { track: "carga" }, { track: "recibo", toX: 520 }], {
      headTo: { track: "recibo", x: 470 },
      v0: V_PATIO,
      startStretched: true,
      zones: [{ at: { track: "recibo", x: -505 }, v: V_LENTA }],
    });
    sc.signal("entrada", "rojo", m.t0 + 260);
    // indicador de la báscula en movimiento
    const sx = SITE.bascula.x;
    sc.live(
      (W) => {
        let txt = "0 kg";
        for (const id of train) {
          const v = vehPose(W, id);
          if (Math.abs(v.x - sx) < 9 && Math.abs(v.z - YARD.recibo.z) < 2) txt = `${id === ROAD ? "LOC " + id : id} · ${weight(id, W.veh[id].load)} kg`;
        }
        W.scale = txt;
      },
      m.t0,
      m.t1,
    );
    sc.set((W) => (W.scale = "0 kg"), m.t1);
    sc.cam(SHOT.fixed([-455, 2.0, 2.5], [-470, 1.5, -6], 35), m.t0 + 140);
    sc.cam(SHOT.side(fV(CAR(30)), { d: 30, h: 9, along: 0, f: 35, side: 1 }), m.t0 + 420);
    sc.cam(SHOT.orbit(fV(ROAD), { r: 40, h: 14, w: 0.01, a0: 0.9, f: 35 }), m.T - 60);
  });

  S.scene({ fase: F1, paso: 4, puesto: "Mayordomo de patio", actividad: "Registra la llegada, verifica la cantidad de carros contra el CONSIST y comunica la recepción.", tiempo: "10–20 min", documento: "CONSIST · registro de llegada", nominal: 15 }, (sc) => {
    sc.place("mayordomo", -170, 0, -3.6, 0);
    sc.focus(fP("mayordomo"), 0);
    sc.cam(SHOT.side(fP("mayordomo"), { d: 7, h: 0.9, along: 9, f: 35, zSide: 1, dof: true }), 0);
    const t0 = sc.t;
    const t1 = sc.walk("mayordomo", [[455, -3.6]], { speed: 1.3 });
    sc.counter("recibidos", 0, 33, t0 + 12, t1 - 4);
    sc.gesture("mayordomo", "radio", 40, { keep: true });
    sc.cam(SHOT.orbit(fP("mayordomo"), { r: 7.5, h: 1.0, w: 0.03, a0: -0.6, f: 50, dof: true }), t1);
  });

  // ============ FASE 2 ============
  S.scene({ fase: F2, paso: 5, puesto: "Garrotero de camino", actividad: "Cierra las llaves angulares, desacopla la locomotora de camino y esta se dirige a la vía de servicios para repostaje (en paralelo).", tiempo: "15–25 min", documento: "Orden de movimiento", nominal: 22 }, (sc) => {
    const cx = vehPose(sc.cur, ROAD).x - len[ROAD] / 2;
    sc.place("garCamino", cx + 6, 0, -3.6, Math.PI, null);
    sc.focus(fP("garCamino"), 0);
    sc.cam(SHOT.fixed([cx + 4, 1.4, 1.5], [cx, 0.9, -5.4], 50, true), 0);
    sc.walk("garCamino", [[cx + 0.4, -4.2]], { speed: 1.1, endH: Math.PI / 2 });
    sc.gesture("garCamino", "llave", 10);
    sc.gesture("garCamino", "perno", 8);
    sc.walk("garCamino", [[cx + 8, -3.6], [cx + 18, -3.4]], { speed: 1.2 });
    sc.hide("garCamino");
    sc.wait(4);
    sc.cam(SHOT.side(fV(ROAD), { d: 20, h: 4, along: 18, f: 35, side: 1 }));
    sc.focus(fV(ROAD));
    sc.move([ROAD], [{ track: "recibo", fromX: 380 }, { track: "ladera-oriente" }, { track: "principal", toX: 720 }], { headTo: { track: "principal", x: 640 } });
    sc.wait(10);
    sc.move([ROAD], [{ track: "principal", fromX: 720, toX: -600 }], { headTo: { track: "principal", x: -470 } });
    sc.wait(10);
    sc.cam(SHOT.fixed([10, 9, 34], [40, 2, 6], 35));
    const m = sc.move([ROAD], [{ track: "principal", fromX: -560 }, { track: "stock" }, { track: "servicios", toX: 150 }], { headTo: { track: "servicios", x: 40 + 11.15 } });
    sc.smoke(ROAD, 0.8, m.t1 + 2);
    sc.cam(SHOT.orbit(fV(ROAD), { r: 26, h: 8, w: 0.02, a0: 1.3, f: 35 }), m.t1);
  });

  S.scene({ fase: F2, paso: 6, puesto: "Inspector de U. de A.", actividad: "Recorre el tren revisando condiciones visibles, daños, frenos y acopladores con lista de verificación.", tiempo: "20–30 min", documento: "Lista de verificación de U. de A.", nominal: 25 }, (sc) => {
    sc.place("inspector", 452, 0, -8.5, Math.PI);
    sc.focus(fP("inspector"), 0);
    sc.cam(SHOT.side(fP("inspector"), { d: 8, h: 1.4, along: -9, f: 35, zSide: -1, dof: true }), 0);
    const W = sc.cur;
    for (let i = 1; i <= 33; i++) {
      const v = vehPose(W, CAR(i));
      sc.walk("inspector", [[v.x + 7.0, -8.5]], { speed: 1.15 });
      sc.gesture("inspector", i % 4 === 0 ? "inspeccion" : "lampara", 5);
      sc.walk("inspector", [[v.x - 7.0, -8.5]], { speed: 1.15 });
      sc.gesture("inspector", "lampara", 3);
    }
    sc.gesture("inspector", "escribir", 30, { keep: true });
    sc.cam(SHOT.side(fP("inspector"), { d: 8, h: 1.2, along: 7, f: 50, zSide: -1, dof: true }), 300);
  });

  S.scene({ fase: F2, paso: 7, puesto: "Operador de báscula", actividad: "Concilia el peso de cada carro registrado al paso por la báscula y lo compara con la tarjeta de entrada.", tiempo: "≈ 60 min", documento: DOC.od14, nominal: 60 }, (sc) => {
    sc.place("bascula", -468.6, 0.33, 4.4, N, "escribir");
    sc.focus(fXYZ(-470, 2, 2), 0);
    sc.cam(SHOT.dolly([-448, 3.5, 16], [-457, 2.2, 10], [-468, 2.6, 3.5], 60, 35), 0);
    const dur = 58 * 60;
    sc.live(
      (W, tl) => {
        const k = Math.min(32, Math.floor((tl / dur) * 33));
        W.scale = `OD-14 · ${CAR(k + 1)} · ${weight(CAR(k + 1), 0)} kg ✓`;
        W.cnt.pesados = Math.min(33, Math.floor((tl / dur) * 33) + (tl >= dur ? 1 : 0));
        W.ppl.bascula.g = "escribir";
      },
      10,
      10 + dur,
    );
    sc.cam(SHOT.orbit(fP("bascula"), { r: 7.5, h: 1.0, w: 0.004, a0: 2.2, f: 50, dof: true }), 400);
    sc.cam(SHOT.fixed([-470 + 14, 4.6, 4.4 + 12], [-470 + 12, 4.0, 4.4], 50), 1600);
  });

  S.scene({ fase: F2, paso: 8, puesto: "Jefe de patio", actividad: "Define y comunica la secuencia de movimientos y las vías de destino: loteo en 3 cortes de 11 carros hacia las vías de clasificación.", tiempo: "5–10 min", documento: "Plan de movimientos", nominal: 8 }, (sc) => {
    sc.set((W) => (W.scale = "0 kg"), 0);
    sc.focus(fP("jefe"), 0);
    sc.cam(SHOT.orbit(fP("jefe", 1.3), { r: 7.5, h: 1.0, w: 0.02, a0: 0.4, f: 50, dof: true }), 0);
    sc.gesture("jefe", "radio", 300, { keep: true });
    sc.cam(SHOT.fixed([-560, 140, 170], [-280, 0, -12], 24), 120);
  });

  S.scene({ fase: F3, paso: 9, puesto: "Mayordomo de patio", actividad: "Clasifica los carros según su destino con la boleta de báscula y prepara la lista de cortes.", tiempo: "5–10 min", documento: "Boleta de báscula", nominal: 8 }, (sc) => {
    sc.place("mayordomo", -637.5, 0, 22.6, N + 0.4, "escribir");
    sc.focus(fP("mayordomo"), 0);
    sc.cam(SHOT.orbit(fP("mayordomo", 1.2), { r: 7.5, h: 1.0, w: 0.015, a0: 0.2, f: 50, dof: true }), 0);
    sc.gesture("mayordomo", "escribir", 420, { keep: true });
  });

  S.scene({ fase: F3, paso: 10, puesto: "Maquinista de patio", actividad: "Recibe la autorización por radio; la locomotora de patio TMY 2008 sale de la vía de stock y se acopla al tren en la vía de recibo.", tiempo: "10–15 min", documento: "Autorización de movimiento", nominal: 12 }, (sc) => {
    sc.focus(fP("maqPatio"), 0);
    sc.cam(SHOT.orbit(fP("maqPatio", 1.2), { r: 6, h: 0.6, w: 0.02, a0: 0.8, f: 50, dof: true }), 0);
    sc.gesture("maqPatio", "radio", 20);
    sc.walk("maqPatio", [[-199, 12.9]], { speed: 1 });
    sc.hide("maqPatio");
    sc.smoke(YARDL, 2);
    sc.wait(6);
    sc.focus(fV(YARDL));
    sc.cam(SHOT.side(fV(YARDL), { d: 20, h: 4, along: -15, f: 35, side: 1 }));
    sc.move([YARDL], [{ track: "stock", fromX: -170 }, { track: "principal", toX: -720 }], { headTo: { track: "principal", x: -600 } });
    sc.wait(8);
    sc.place("garPatio", -548, 0, 7.6, N);
    const m = sc.move([YARDL], [{ track: "principal", fromX: -640 }, { track: "carga" }, { track: "recibo", toX: 60 }], { couple: CAR(33) });
    sc.cam(SHOT.fixed([vehPose(sc.cur, CAR(33)).x - 22, 1.6, -2.5], [vehPose(sc.cur, CAR(33)).x - 9, 1.0, -6], 50, true), m.T - 40);
  });

  S.scene({ fase: F3, paso: 11, puesto: "Garrotero de patio", actividad: "Alinea los herrajes (las banderolas cambian) y realiza el loteo: el tren se divide en 3 cortes de 11 carros que se colocan en las vías de clasificación 1, 2 y 3.", tiempo: "40–60 min", documento: "Lista de cortes", nominal: 0 }, (sc) => {
    const lots = [
      { ids: cars(23, 33), cut: [CAR(22), CAR(23)], dest: "clasif1" },
      { ids: cars(12, 22), cut: [CAR(11), CAR(12)], dest: "clasif2" },
      { ids: cars(1, 11), cut: null, dest: "clasif3" },
    ];
    sc.focus(fP("garPatio"), 0);
    lots.forEach((lot, k) => {
      const W = sc.cur;
      // corte: el garrotero cierra llaves y levanta el perno entre los carros indicados
      if (lot.cut) {
        const a = vehPose(W, lot.cut[0]);
        const b = vehPose(W, lot.cut[1]);
        const cx = (a.x + b.x) / 2;
        sc.place("garPatio", cx - 14, 0, -3.6, 0);
        sc.cam(SHOT.fixed([cx - 5, 1.5, 1.2], [cx, 0.9, -5.4], 50, true));
        sc.walk("garPatio", [[cx - 0.3, -4.2]], { speed: 1.2, endH: N });
        sc.gesture("garPatio", "llave", 9);
        sc.gesture("garPatio", "perno", 7);
        sc.walk("garPatio", [[cx - 6, -3.4]], { speed: 1.2 });
      }
      // banderolas: el garrotero cambia los herrajes del haz
      const st1 = standPos("cambio-recibo-poniente");
      sc.place("garPatio", st1[0] - 10, 0, st1[1] + 2, 0);
      sc.cam(SHOT.fixed([st1[0] - 9, 1.7, st1[1] + 8], [st1[0], 0.9, st1[1]], 35, true));
      sc.walk("garPatio", [[st1[0] - 0.8, st1[1] + 0.6]], { speed: 1.3, endH: 0 });
      sc.gesture("garPatio", "palanca", 6);
      sc.switchTo("cambio-recibo-poniente", 1, sc.t - 3);
      // arrastre hacia la principal
      const loco = YARDL;
      sc.focus(fV(loco));
      sc.cam(SHOT.side(fV(loco), { d: 30, h: 8, along: 20, f: 35, side: 1 }));
      const pull = sc.move([loco, ...lot.ids], [{ track: "recibo", fromX: 480 }, { track: "carga" }, { track: "principal", toX: -1100 }], { tailClear: { track: "recibo", s: 0 } });
      sc.ride("garPatio", lot.ids[0], 1, pull.t0, pull.t1, 1);
      sc.wait(6);
      // empuje (lanzamiento) a la vía de clasificación con el garrotero en el estribo delantero
      const dest = lot.dest;
      const push = sc.move([loco, ...lot.ids], [{ track: "principal", fromX: -1100 }, { track: "carga" }, { track: dest, toX: 100 }], { headTo: { track: dest, x: -10 }, slowLast: 30 });
      sc.ride("garPatio", lot.ids[0], 1, push.t0, push.t1, 1);
      sc.cam(SHOT.side(fV(lot.ids[0]), { d: 16, h: 3.5, along: 18, f: 35, side: 1 }), push.t0);
      // desacoplar la locomotora del corte
      const W2 = sc.cur;
      const westCar = lot.ids[lot.ids.length - 1];
      const lw = vehPose(W2, westCar);
      const ex = lw.x - len[westCar] / 2;
      const zt = YARD[dest].z;
      sc.place("garPatio", ex + 3, 0, zt + 2.4, Math.PI);
      sc.walk("garPatio", [[ex + 0.4, zt + 1.8]], { speed: 1.1, endH: N });
      sc.cam(SHOT.fixed([ex + 6, 1.5, zt + 6], [ex, 0.9, zt], 50, true));
      sc.gesture("garPatio", "llave", 8);
      sc.gesture("garPatio", "perno", 6);
      sc.walk("garPatio", [[ex + 5, zt + 2.6]], { speed: 1.2 });
      if (k < 2) {
        // regreso de la locomotora sola por el siguiente corte
        sc.cam(SHOT.side(fV(loco), { d: 25, h: 6, along: 0, f: 35, side: 1 }));
        sc.move([loco], [{ track: dest, fromX: 0 }, { track: "carga" }, { track: "principal", toX: -900 }], { headTo: { track: "principal", x: -600 } });
        sc.wait(6);
        const next = lots[k + 1];
        const target = next.ids[next.ids.length - 1];
        sc.move([loco], [{ track: "principal", fromX: -640 }, { track: "carga" }, { track: "recibo", toX: 480 }], { couple: target });
      }
    });
    sc.cam(SHOT.fixed([-470, 90, 95], [-250, 0, -20], 28));
  });

  // ============ FASE 4 (propuesta) ============
  const L = SITE.llenadera;
  const step = (L.x1 - L.x0) / L.posiciones;
  const posX = (i) => L.x0 + step * (i + 0.5);
  const lots = [cars(23, 33), cars(12, 22), cars(1, 11)];
  const clas = ["clasif1", "clasif2", "clasif3"];
  const toLlenadera = (sc, k) => {
    const ids = lots[k];
    const loco = YARDL;
    sc.focus(fV(loco));
    sc.cam(SHOT.side(fV(loco), { d: 25, h: 6, along: 10, f: 35, side: -1 }));
    // la locomotora sale de donde esté hacia la principal
    const W = sc.cur;
    const lp = vehPose(W, loco);
    const here = nearestTrack(lp.x, lp.z);
    if (here !== "principal") sc.move([loco], [{ track: here, fromX: lp.x + 30 }, ...(here === "carga" ? [] : [{ track: "carga" }]), { track: "principal", toX: -900 }], { headTo: { track: "principal", x: -600 } });
    sc.wait(5);
    sc.move([loco], [{ track: "principal", fromX: -640 }, { track: "carga" }, { track: clas[k], toX: 100 }], { couple: ids[ids.length - 1] });
    sc.wait(10);
    sc.move([loco, ...ids], [{ track: clas[k], fromX: 100 }, { track: "carga" }, { track: "principal", toX: -1100 }], { tailClear: { track: clas[k], s: 0 } });
    sc.wait(6);
    sc.cam(SHOT.side(fV(ids[0]), { d: 18, h: 6, along: 20, f: 35, side: -1 }));
    sc.focus(fV(ids[0]));
    const m = sc.move([loco, ...ids], [{ track: "principal", fromX: -1100 }, { track: "carga", toX: 260 }], { headTo: { track: "carga", x: L.x1 - 0.1 }, zones: [{ at: { track: "carga", x: L.x0 - 20 }, v: V_LENTA }], slowLast: 15, vSlow: 1.5 * KMH });
    // desacoplar y retirar la locomotora
    sc.wait(20);
    sc.move([loco], [{ track: "carga", fromX: 0, toX: -350 }], { dist: 60 });
    return m;
  };
  const loadCut = (sc, k, { full = true } = {}) => {
    const ids = lots[k];
    const W = sc.cur;
    // carro más cercano a cada posición de llenado
    const centers = ids.map((id) => ({ id, x: vehPose(W, id).x })).sort((a, b) => a.x - b.x);
    sc.set((W2) => centers.forEach((c, i) => (W2.armX[i] = c.x)));
    sc.place("llenadera", posX(0) - 6, DECK, -37.2, 0);
    sc.focus(fP("llenadera"));
    sc.cam(SHOT.side(fP("llenadera"), { d: 7, h: 1.6, along: 8, f: 35, zSide: -1, dof: true }));
    const connected = [];
    for (let i = 0; i < 11; i++) {
      sc.walk("llenadera", [[posX(i) - 1.0, -37.0]], { speed: 1.25, endH: N, y: DECK });
      sc.ramp((W2, f) => (W2.gw[i] = f), sc.t, 4);
      sc.gesture("llenadera", "señalar", 4);
      sc.ramp((W2, f) => (W2.arms[i] = f), sc.t, 14);
      sc.gesture("llenadera", "sellar", 14);
      connected.push(sc.t);
      if (i === 2) sc.cam(SHOT.orbit(fXYZ(posX(2), DECK + 1.2, -35), { r: 13, h: 3.5, w: 0.01, a0: 0.3, f: 35 }));
    }
    const loadDur = full ? 30 * 60 : 30 * 60;
    const done = [];
    connected.forEach((t, i) => {
      sc.load([centers[i].id], t, loadDur);
      done.push(t + loadDur);
    });
    const before = k * 11;
    sc.live(
      (W2, tl, t) => {
        W2.cnt.cargados = before + done.filter((d) => t >= d).length;
      },
      connected[0],
      done[done.length - 1] + 1,
    );
    sc.cam(SHOT.fixed([posX(5) - 40, 14, -12], [posX(5), 4, -36], 35), connected[10] + 20);
    sc.t = done[done.length - 1] + 5;
    // desconexión, pasarelas arriba y sellos en el domo
    sc.cam(SHOT.side(fP("llenadera"), { d: 7, h: 1.4, along: -8, f: 50, zSide: -1, dof: true }));
    for (let i = 10; i >= 0; i--) {
      sc.walk("llenadera", [[posX(i) - 1.0, -37.0]], { speed: 1.25, endH: N, y: DECK });
      sc.ramp((W2, f) => (W2.arms[i] = 1 - f), sc.t, 10);
      sc.gesture("llenadera", "sellar", 10);
      sc.ramp((W2, f) => (W2.gw[i] = 1 - f), sc.t, 4);
      sc.wait(4);
    }
  };
  const inspectCut = (sc, k, dwell = 6) => {
    const ids = lots[k];
    const W = sc.cur;
    const xs = ids.map((id) => vehPose(W, id).x).sort((a, b) => b - a);
    sc.place("inspector", xs[0] + 12, 0, -31.5, Math.PI);
    sc.focus(fP("inspector"));
    sc.cam(SHOT.side(fP("inspector"), { d: 9, h: 1.8, along: -9, f: 35, zSide: 1, dof: true }));
    for (const x of xs) {
      sc.walk("inspector", [[x, -31.5]], { speed: 1.15 });
      sc.gesture("inspector", "inspeccion", dwell);
    }
    sc.gesture("inspector", "escribir", 15);
  };
  const toDespacho = (sc, k) => {
    const ids = lots[k];
    const loco = YARDL;
    sc.focus(fV(loco));
    sc.cam(SHOT.side(fV(loco), { d: 22, h: 5, along: 0, f: 35, side: -1 }));
    sc.move([loco], [{ track: "carga", fromX: -400, toX: 300 }], { couple: ids[ids.length - 1] });
    sc.wait(10);
    sc.move([loco, ...ids], [{ track: "carga", fromX: 260 }, { track: "principal", toX: -1150 }], { tailClear: { track: "despacho", s: 0 } });
    sc.wait(6);
    const ahead = k === 0 ? null : lots[k - 1][lots[k - 1].length - 1];
    sc.cam(SHOT.side(fV(ids[0]), { d: 20, h: 6, along: 15, f: 35, side: 1 }));
    sc.move([loco, ...ids], [{ track: "principal", fromX: -1150 }, { track: "carga" }, { track: "despacho", toX: 300 }], ahead ? { couple: ahead } : { headTo: { track: "despacho", x: 146 }, slowLast: 25 });
    sc.wait(20);
  };

  S.scene({ fase: F4, propuesto: true, paso: 12, puesto: "Maquinista y garrotero de patio", actividad: "La locomotora de patio lleva los carros a la llenadera en cortes de 11 carros; primer corte desde la vía de clasificación 1.", tiempo: "20–30 min por corte", documento: "Orden de carga", nominal: 0 }, (sc) => {
    toLlenadera(sc, 0);
    sc.cam(SHOT.fixed([60, 26, 10], [70, 3, -36], 28));
  });

  S.scene({ fase: F4, propuesto: true, paso: 13, puesto: "Operador de llenadera", actividad: "Conecta tierra física, baja pasarelas y brazos, carga cada carro, desconecta y coloca sellos en domo y válvulas. Se repite con los cortes 2 y 3.", tiempo: "≈ 45 min por corte", documento: "Orden de carga", nominal: 0 }, (sc) => {
    loadCut(sc, 0);
    inspectCut(sc, 0, 3);
    toDespacho(sc, 0);
    toLlenadera(sc, 1);
    loadCut(sc, 1);
    inspectCut(sc, 1, 3);
    toDespacho(sc, 1);
    toLlenadera(sc, 2);
    loadCut(sc, 2);
  });

  S.scene({ fase: F4, propuesto: true, paso: 14, puesto: "Inspector de U. de A. · Operador de llenadera", actividad: "Inspección de sellos y válvulas antes de liberar el corte.", tiempo: "10–15 min por corte", documento: "Certificado de carga", nominal: 12 }, (sc) => {
    inspectCut(sc, 2, 8);
  });

  // ============ FASE 5 (propuesta) ============
  S.scene({ fase: F5, propuesto: true, paso: 15, puesto: "Maquinista y garrotero de patio", actividad: "La locomotora de patio forma el nuevo convoy de 33 carros cargados en la vía de despacho y regresa a la vía de stock.", tiempo: "20–30 min", documento: "Certificado de carga", nominal: 0 }, (sc) => {
    toDespacho(sc, 2);
    const loco = YARDL;
    sc.cam(SHOT.side(fV(loco), { d: 22, h: 5, along: 0, f: 35, side: 1 }));
    sc.move([loco], [{ track: "despacho", fromX: -300 }, { track: "carga" }, { track: "principal", toX: -900 }], { headTo: { track: "principal", x: -600 } });
    sc.wait(6);
    sc.move([loco], [{ track: "principal", fromX: -640 }, { track: "stock", toX: -150 }], { headTo: { track: "stock", x: -195 } });
    sc.smoke(loco, 0.6);
    sc.place("maqPatio", -199, 0, 12.9, -N);
    sc.walk("maqPatio", [[-199, 14.5]], { speed: 1 });
    sc.cam(SHOT.fixed([-450, 70, 95], [-150, 0, -12], 28));
  });

  S.scene({ fase: F5, propuesto: true, paso: 16, puesto: "Maquinista de camino", actividad: "La locomotora de camino, ya repostada, sale de servicios y se acopla al convoy en la vía de despacho.", tiempo: "15–20 min", documento: "Orden de movimiento", nominal: 0 }, (sc) => {
    sc.smoke(ROAD, 2);
    sc.focus(fV(ROAD));
    sc.cam(SHOT.side(fV(ROAD), { d: 22, h: 5, along: 10, f: 35, side: 1 }));
    sc.move([ROAD], [{ track: "servicios", fromX: 120 }, { track: "stock" }, { track: "principal", toX: -900 }], { headTo: { track: "principal", x: -600 } });
    sc.wait(6);
    const west = lots[2][lots[2].length - 1];
    const m = sc.move([ROAD], [{ track: "principal", fromX: -640 }, { track: "carga" }, { track: "despacho", toX: 0 }], { couple: west });
    const v = vehPose(sc.cur, west);
    const ex = v.x - len[west] / 2;
    sc.cam(SHOT.fixed([ex - 6, 1.6, -7.5], [ex, 1.0, -11], 50, true), m.T - 30);
    sc.place("garCamino", ex + 4, 0, -8.6, Math.PI);
    sc.walk("garCamino", [[ex + 0.3, -9.0]], { speed: 1.1, endH: -N });
    sc.gesture("garCamino", "llave", 10);
  });

  S.scene({ fase: F5, propuesto: true, paso: 17, puesto: "Inspector de U. de A. · Mayordomo de patio", actividad: "Prueba de frenos del convoy y entrega de la documentación de salida a la tripulación de camino.", tiempo: "20–30 min", documento: "Certificado de carga · documentación de salida", nominal: 25 }, (sc) => {
    const W = sc.cur;
    const xs = [...lots[2], ...lots[1], ...lots[0]].map((id) => vehPose(W, id).x).sort((a, b) => a - b);
    sc.place("inspector", xs[0] - 6, 0, -8.6, 0);
    sc.focus(fP("inspector"));
    sc.cam(SHOT.side(fP("inspector"), { d: 9, h: 1.6, along: 9, f: 35, zSide: -1, dof: true }));
    xs.forEach((x, i) => {
      sc.walk("inspector", [[x, -8.6]], { speed: 1.3 });
      if (i % 3 === 0) sc.gesture("inspector", "lampara", 4);
    });
    sc.gesture("inspector", "escribir", 12);
    const loco = vehPose(sc.cur, ROAD);
    sc.place("mayordomo", loco.x + 30, 0, -8.6, Math.PI);
    sc.place("maqCamino", loco.x + 4, 0, -8.6, 0);
    sc.focus(fP("mayordomo"));
    sc.cam(SHOT.fixed([loco.x + 9, 1.7, -4.5], [loco.x + 6, 1.3, -8.8], 50, true));
    sc.walk("mayordomo", [[loco.x + 6.2, -8.6]], { speed: 1.2, endH: Math.PI });
    sc.gesture("mayordomo", "entregar", 8, { advance: false });
    sc.gesture("maqCamino", "entregar", 8);
    sc.walk("maqCamino", [[loco.x + 1, -9.0]], { speed: 1 });
    sc.hide("maqCamino");
    sc.hide("garCamino");
  });

  S.scene({ fase: F5, propuesto: true, paso: 18, puesto: "Jefe de patio · Maquinista de camino", actividad: "El jefe de patio autoriza; la señal de salida pasa a verde y el tren de 33 carros cargados sale de la terminal.", tiempo: "10–15 min", documento: "Documentación de salida", nominal: 0 }, (sc) => {
    sc.focus(fP("jefe"), 0);
    sc.cam(SHOT.orbit(fP("jefe", 1.2), { r: 7.5, h: 1.0, w: 0.02, a0: 0.6, f: 50, dof: true }), 0);
    sc.gesture("jefe", "radio", 25, { keep: true });
    const departing = [ROAD, ...lots[2], ...lots[1], ...lots[0]];
    sc.cam(SHOT.fixed([-676, 3.5, -14], [-650, 4.2, -3.6], 50));
    sc.signal("salida", "verde", sc.t + 6);
    sc.wait(20);
    sc.focus(fV(ROAD));
    const m = sc.move(departing, [{ track: "despacho", fromX: 300 }, { track: "carga" }, { track: "principal", toX: -2000 }], { headTo: { track: "principal", x: -1950 }, zones: [{ at: { track: "principal", x: -1100 }, v: 20 * KMH }] });
    sc.live(
      (W) => {
        let n = 0;
        for (const id of departing.slice(1)) if (vehPose(W, id).x < -650 && Math.abs(vehPose(W, id).z) < 1) n++;
        W.cnt.despachados = n;
      },
      m.t0,
      m.t1,
    );
    sc.cam(SHOT.side(fV(ROAD), { d: 28, h: 6, along: -25, f: 35, side: -1 }), m.t0);
    sc.cam(SHOT.fixed([-690, 5, 12], [-640, 2.5, 0], 35), m.t0 + 140);
    sc.cam(SHOT.fixed([-1060, 80, 160], [-1300, 0, 0], 28), m.t0 + 420);
    sc.signal("salida", "rojo", m.t1);
  });

  S.scene({ fase: F5, propuesto: true, paso: 19, puesto: "Mayordomo de patio", actividad: "Cierre: notifica la disponibilidad de la vía y del equipo y cierra el registro de la operación.", tiempo: "10 min", documento: "Registro de operación", nominal: 10 }, (sc) => {
    sc.place("mayordomo", -637.5, 0, 22.6, N + 0.4, "escribir");
    sc.focus(fP("mayordomo"));
    sc.cam(SHOT.fixed([-760, 230, 330], [-200, 0, -10], 24), 0);
    sc.gesture("mayordomo", "escribir", 300, { keep: true });
    sc.cam(SHOT.orbit(fP("mayordomo", 1.2), { r: 7.5, h: 1.0, w: 0.015, a0: 0.2, f: 50, dof: true }), 200);
  });

  return S.scenes;
}

// peso aparente de un carro: tara de 40 800 kg ± variación propia; carga de 88 200 kg de gasolina
export function weight(id, load) {
  if (id === ROAD || id === YARDL) return "195 200";
  const n = Number(id.slice(-2)) || 1;
  const kg = 40800 + ((n * 7919) % 600) - 300 + Math.round(load * 84500);
  return kg.toLocaleString("es-MX").replace(/,/g, " ");
}

function nearestTrack(x, z) {
  // vía de patio más cercana (por z en el tramo recto) o principal
  if (Math.abs(z) < 1.5) return "principal";
  let best = "principal";
  let bd = 1e9;
  for (const [k, v] of Object.entries(YARD)) {
    const d = Math.abs(v.z - z);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}
