// Modelo del cruce a nivel PK 115+450 (Ramal Poxilá–Mérida × Anillo Periférico de Mérida).
// Traducción a JavaScript de simulacion_cruce.py (analisis_por_hora) con los datos de
// datos/cruce.json y datos/aforo.json. Fórmulas y datos sin cambios; todo lo que muestra
// la figura sale de aquí.

// ---------------- datos/cruce.json ----------------
export const CRUCE = {
  pk: "115+450",
  coordenadas: [20.927703, -89.690472],
  anchoCruce: 85, // m, 10 carriles que cruzan la vía
  carrilesCalculo: 3, // por sentido (supuesto conservador)
  carrilesReales: 5, // por sentido: lateral 2 + central 3
  detencion: 15, // m antes de la vía
  preaviso: 60, // s
  reapertura: 10, // s
  tiempoPerdido: 3, // s al arrancar
  saturacion: 1800, // veh/h por carril
  locomotora: 22, // m
  carro: 22, // m
  trenes: { 33: 33 * 22 + 22, 20: 20 * 22 + 22 }, // m: 748 y 462
  velocidades: [5, 10, 15], // km/h; 15 es la del estudio
  accesos: {
    // fila del sentido sur (lado norte)
    sur: [
      { d: 282, nombre: "Acceso de calle" },
      { d: 902, nombre: "Entrada 2B" },
      { d: 1270, nombre: "Semáforo" },
    ],
    // fila del sentido norte (lado sur)
    norte: [
      { d: 388, nombre: "Entrada 3A" },
      { d: 842, nombre: "Acceso" },
      { d: 983, nombre: "Entrada 1A" },
      { d: 1050, nombre: "Entrada 2A" },
    ],
  },
};

// ---------------- datos/aforo.json ----------------
export const AFORO = {
  referencia: 90000, // veh/día ambos sentidos: 62.5 veh/min × 60 × 24 (conteo km 48)
  sict2025: 41985,
  sict2026: 43446, // estimado, tendencia 3.48 % anual
  tendencia: 0.0348,
  sentidos: { sur: 20717, norte: 21268 }, // SICT 2025: sentido 1 (sur) y 2 (norte)
  perfil: [0.9, 0.6, 0.4, 0.4, 0.7, 1.9, 5.6, 7.4, 6.8, 5.2, 4.6, 4.8, 5.4, 6.6, 6.7, 5.5, 5.0, 5.6, 7.4, 7.0, 5.2, 3.4, 2.2, 1.2],
  pico: [[6, 9.5], [13, 15], [17.5, 20.5]],
  bajo: [[22.5, 24], [0, 5]],
  ventanas: [[9, 12], [15, 17], [22, 24], [0, 5]], // ventanas de operación solicitadas
  composicion: [
    // tipo, %, largo (m), equivalente en autos
    { tipo: "motos", nombre: "Motos", pct: 11.5, largo: 2.1, eq: 0.5 },
    { tipo: "autos", nombre: "Autos", pct: 74.85, largo: 4.6, eq: 1 },
    { tipo: "autobuses", nombre: "Autobuses", pct: 1.45, largo: 12, eq: 2 },
    { tipo: "C2", nombre: "C2", pct: 4.9, largo: 8.5, eq: 1.5 },
    { tipo: "C3", nombre: "C3", pct: 2.4, largo: 10.5, eq: 2 },
    { tipo: "T3S2", nombre: "T3S2", pct: 2.8, largo: 20.5, eq: 2.5 },
    { tipo: "T3S3", nombre: "T3S3", pct: 0.85, largo: 21.5, eq: 3 },
    { tipo: "T3S2R4", nombre: "T3S2R4", pct: 0.95, largo: 30, eq: 3.5 },
    { tipo: "otros", nombre: "Otros", pct: 0.3, largo: 6, eq: 1 },
  ],
  holgura: 1, // m entre vehículos detenidos: espacio = largo + 1
};

const r2 = (x) => Math.round(x * 100) / 100;

// Constantes derivadas de la composición.
export function derivados(C = CRUCE, A = AFORO) {
  const total = A.composicion.reduce((s, c) => s + c.pct, 0);
  // Espaciamiento medio en fila, al centímetro (m/veh).
  const espaciamiento = r2(A.composicion.reduce((s, c) => s + (c.pct / total) * (c.largo + A.holgura), 0));
  // Factor de pesados con equivalentes: 1 / Σ p·E.
  const eqMedio = A.composicion.reduce((s, c) => s + (c.pct / total) * c.eq, 0);
  const fhv = 1 / eqMedio;
  const salidaH = C.saturacion * C.carrilesCalculo * fhv; // veh/h por sentido (4,962)
  const sumaPerfil = A.perfil.reduce((s, p) => s + p, 0);
  return { espaciamiento, eqMedio, fhv, salidaH, salida: salidaH / 3600, sumaPerfil };
}

// Cierre del cruce al paso de un tren (s).
export function cierre(velKmh, carros, C = CRUCE) {
  const largo = C.trenes[carros] ?? carros * C.carro + C.locomotora;
  const v = velKmh / 3.6;
  const paso = (largo + C.anchoCruce) / v;
  const total = C.preaviso + paso + C.reapertura;
  return { largo, v, preaviso: C.preaviso, paso, reapertura: C.reapertura, total, bloqueo: total + C.tiempoPerdido };
}

// Un sentido ("sur" o "norte") a una hora, con un aforo diario dado.
function sentido(nombre, aforo, hora, ci, C, A, D) {
  const total = A.sentidos.sur + A.sentidos.norte;
  const reparto = A.sentidos[nombre] / total;
  const llegadas = (aforo * reparto * A.perfil[hora]) / D.sumaPerfil / 3600; // veh/s
  const saturado = llegadas >= D.salida;
  const fila = Math.round(llegadas * ci.bloqueo); // vehículos enteros
  const largoFila = C.detencion + (fila / C.carrilesCalculo) * D.espaciamiento;
  const disipacion = saturado ? Infinity : fila / (D.salida - llegadas);
  const detenidos = saturado ? Infinity : llegadas * (ci.bloqueo + disipacion);
  const accesos = C.accesos[nombre].map((a) => ({ ...a, excede: Math.max(0, largoFila - a.d), alcanzado: largoFila >= a.d }));
  return {
    sentido: nombre,
    reparto,
    llegadas,
    llegadasH: llegadas * 3600,
    saturado, // saturación de fondo: no es atribuible al tren
    fila,
    largoFila,
    disipacion,
    detenidos,
    esperaPrimero: ci.total,
    esperaUltimo: C.tiempoPerdido + fila / D.salida,
    accesos,
  };
}

// Análisis completo de un paso de tren a una hora.
export function analisis({ aforo = AFORO.referencia, hora = 10, vel = 15, carros = 33 } = {}, C = CRUCE, A = AFORO) {
  const D = derivados(C, A);
  const ci = cierre(vel, carros, C);
  return {
    aforo, hora, vel, carros,
    cierre: ci,
    derivados: D,
    sur: sentido("sur", aforo, hora, ci, C, A, D),
    norte: sentido("norte", aforo, hora, ci, C, A, D),
  };
}

// analisis_por_hora: las 24 horas del día con un tren dado.
export function analisisPorHora({ aforo = AFORO.referencia, vel = 15, carros = 33 } = {}, C = CRUCE, A = AFORO) {
  return A.perfil.map((_, hora) => analisis({ aforo, hora, vel, carros }, C, A));
}
