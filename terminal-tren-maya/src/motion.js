// Perfil de marcha: aceleración y frenado graduales, límites de velocidad por zona y holgura entre carros.
export const KMH = 1 / 3.6;
export const V_PATIO = 10 * KMH;
export const V_LENTA = 5 * KMH;
const SLACK = 0.15; // recorrido de holgura por enganche (compresión → tensión), m

// Integra la marcha de la cabeza: devuelve tabla tiempo→distancia
export function profile(D, { vmax = V_PATIO, a = 0.12, b = 0.16, v0 = 0, vEnd = 0, zones = [] } = {}) {
  const dt = 0.25;
  const tab = [[0, 0, v0]];
  let d = 0;
  let v = v0;
  let t = 0;
  const lim = (x) => {
    let l = vmax;
    for (const z of zones) if (x >= z.from && x <= (z.to ?? 1e9)) l = Math.min(l, z.v);
    return l;
  };
  let guard = 0;
  while (d < D - 0.005 && guard++ < 200000) {
    // velocidad permitida considerando frenado hacia el final y hacia zonas más lentas adelante
    let allow = Math.min(lim(d), Math.sqrt(vEnd * vEnd + 2 * b * Math.max(0, D - d)));
    for (const z of zones) if (z.from > d) allow = Math.min(allow, Math.sqrt(z.v * z.v + 2 * b * (z.from - d)));
    if (v < allow) v = Math.min(allow, v + a * dt);
    else v = Math.max(allow, v - b * dt);
    v = Math.max(v, 0.05);
    d = Math.min(D, d + v * dt);
    t += dt;
    tab.push([t, d, v]);
  }
  return { tab, T: t, D };
}

export function distAt(pr, t) {
  const tab = pr.tab;
  if (t <= 0) return 0;
  if (t >= pr.T) return pr.D;
  const i = Math.min(tab.length - 2, Math.floor(t / 0.25));
  const f = (t - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
  return tab[i][1] + (tab[i + 1][1] - tab[i][1]) * f;
}
export function speedAt(pr, t) {
  if (t <= 0 || t >= pr.T) return 0;
  const i = Math.min(pr.tab.length - 1, Math.floor(t / 0.25));
  return pr.tab[i][2];
}

// Desplazamiento de un vehículo a k enganches de la locomotora: arranca cuando se toma su holgura
// y al parar se comprime con un pequeño retraso, de modo que en reposo conserva su posición relativa.
export function slackDisp(pr, t, k, { noSlack = false, startStretched = false, endStretched = false } = {}) {
  const d = distAt(pr, t);
  if (noSlack || k === 0) return d;
  const lag = k * SLACK;
  const q = endStretched ? 0 : Math.max(0, Math.min(1, (t - (pr.T - 1.2) - k * 0.12) / 0.9));
  if (startStretched) return Math.min(pr.D + lag, d + lag * q);
  return Math.max(0, Math.min(pr.D, d - lag * (1 - q)));
}
export const slackEnd = (pr, n) => pr.T + n * 0.12 + 1.0;
