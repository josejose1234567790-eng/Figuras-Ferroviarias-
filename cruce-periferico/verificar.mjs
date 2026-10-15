// Comprueba el modelo contra los valores de la exposición (90,000 veh/día, 10:00).
import { analisis, derivados } from "./modelo.mjs";

const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const min = (s) => f1(s / 60);
const m0 = (x) => String(Math.round(x));
const casos = [
  { vel: 5, carros: 33, cierre: "11.2", sur: { fila: "380", m: "850" }, norte: { fila: "390", m: "872" } },
  { vel: 10, carros: 33, cierre: "6.2", sur: { fila: "211", m: "478" }, norte: { fila: "216", m: "489" } },
  {
    vel: 15, carros: 33, cierre: "4.5",
    sur: { fila: "154", m: "353", det: "261", dis: "3.2", pri: "4.5", ult: "1.9" },
    norte: { fila: "158", m: "362", det: "273", dis: "3.3" },
  },
  { vel: 15, carros: 20, cierre: "3.4" },
];
let fallas = 0;
const check = (que, got, want) => {
  const ok = got === want;
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${que.padEnd(36)} ${got.padStart(6)}  (esperado ${want})`);
};
const D = derivados();
console.log(`espaciamiento ${D.espaciamiento} m · salida ${D.salidaH.toFixed(1)} veh/h · suma perfil ${D.sumaPerfil}`);
check("salida por sentido (veh/h)", m0(D.salidaH), "4962");
for (const c of casos) {
  const r = analisis({ aforo: 90000, hora: 10, vel: c.vel, carros: c.carros });
  const tag = `${c.carros} carros, ${c.vel} km/h:`;
  check(`${tag} cierre (min)`, min(r.cierre.total), c.cierre);
  for (const s of ["sur", "norte"]) {
    const w = c[s];
    if (!w) continue;
    const x = r[s];
    check(`${tag} ${s} fila (veh)`, m0(x.fila), w.fila);
    check(`${tag} ${s} fila (m)`, m0(x.largoFila), w.m);
    if (w.det) check(`${tag} ${s} detenidos`, m0(x.detenidos), w.det);
    if (w.dis) check(`${tag} ${s} disipación (min)`, min(x.disipacion), w.dis);
    if (w.pri) check(`${tag} ${s} espera primero (min)`, min(x.esperaPrimero), w.pri);
    if (w.ult) check(`${tag} ${s} espera último (min)`, min(x.esperaUltimo), w.ult);
  }
}
console.log(fallas ? `\n${fallas} valores no coinciden` : "\nverificación: todos los valores coinciden");
process.exit(fallas ? 1 : 0);
