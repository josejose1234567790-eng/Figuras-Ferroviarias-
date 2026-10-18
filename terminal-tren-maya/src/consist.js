// Equipo en el patio al inicio: tren de 33 carros-tanque con la TMY 2002 en la vía de recibo,
// la TMY 2008 en la vía de stock y carros de fondo en las vías de clasificación.
import { TRACKS } from "./layout.js";
import { Fleet, SlotAtlas, placeConsist } from "./fleet.js";
import { tankCarType, locoType, boxcarType, gondolaType, hopperType } from "./rolling.js";

export const track = (id) => TRACKS.find((t) => t.id === id);

// abscisa del trazo más cercana a una x dada (vías de patio, casi paralelas al eje x)
export function sAtX(tr, x) {
  const P = tr.path;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    if ((a.p[0] - x) * (b.p[0] - x) <= 0) {
      const f = (x - a.p[0]) / (b.p[0] - a.p[0] || 1);
      return a.s + (b.s - a.s) * f;
    }
  }
  return x < P[0].p[0] ? 0 : tr.length;
}

const numberSlot = (atlas, text, color = "#f2efe6", size = 54) =>
  atlas.draw((g, w, h) => {
    g.fillStyle = color;
    g.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
  });

export function buildFleet(scene) {
  const fleet = new Fleet(scene);
  const atlasTank = new SlotAtlas(33);
  const atlasLoco = new SlotAtlas(2);
  const atlasBg = new SlotAtlas(40);
  const TANK = tankCarType(atlasTank);
  const LOCO = locoType(atlasLoco);
  const BOX = boxcarType(atlasBg);
  const GON = gondolaType(atlasBg);
  const HOP = hopperType(atlasBg);

  const loco = fleet.add(LOCO, { id: "TMY 2002", slot: numberSlot(atlasLoco, "TMY 2002", "#f2efe6", 60), meta: { kind: "loco", nombre: "Tsíimin K'áak" } });
  const yard = fleet.add(LOCO, { id: "TMY 2008", slot: numberSlot(atlasLoco, "TMY 2008", "#f2efe6", 60), meta: { kind: "loco" } });
  const cars = [];
  for (let i = 1; i <= 33; i++) {
    const id = `TMY 2001${String(i).padStart(2, "0")}`;
    cars.push(fleet.add(TANK, { id, slot: numberSlot(atlasTank, id, "#e9e7df", 46), load: 0, flip: i % 3 === 0, meta: { kind: "tanque", pos: i } }));
  }
  const bg = [];
  const addBg = (T, n, prefix, color) => {
    const list = [];
    for (let i = 0; i < n; i++) {
      const id = `${prefix} ${String(400100 + bg.length * 7 + i * 13)}`;
      const v = fleet.add(T, { id, slot: numberSlot(atlasBg, id, color, 40), load: T === GON ? 1 : 0.6, flip: i % 2 === 1, meta: { kind: "fondo" } });
      list.push(v);
      bg.push(v);
    }
    return list;
  };
  const boxes = addBg(BOX, 12, "TMY", "#f0ede4");
  const gons = addBg(GON, 10, "TMY", "#f0ede4");
  const hops = addBg(HOP, 9, "TMY", "#1a1a1a");
  fleet.build();

  const rec = track("recibo");
  placeConsist(rec, sAtX(rec, 470), 1, [loco, ...cars], 0.0);
  const st = track("stock");
  placeConsist(st, sAtX(st, -195), 1, [yard]);
  const c1 = track("clasif1");
  placeConsist(c1, c1.length - 4, 1, boxes);
  const c2 = track("clasif2");
  placeConsist(c2, c2.length - 4, 1, gons);
  const c3 = track("clasif3");
  placeConsist(c3, c3.length - 30, 1, hops);
  fleet.update(true);
  return { fleet, loco, yard, cars, bg, types: { TANK, LOCO, BOX, GON, HOP } };
}
