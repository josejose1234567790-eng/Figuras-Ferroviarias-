// Detalle ampliado de la pared del tanque para el modo de corte.
// Espesores de chaqueta, aislamiento y virola a 1.6 px/mm, en proporción real entre sí;
// boquilla, tapa, sumidero y válvula, esquemáticos.
const K = 1.6;
const J = 3 * K;
const I = 13 * K;
const SH = 14.3 * K;

function label(x, y, tx, ty, es, en, anchor = "start") {
  return `<path class="dl-lead" d="M${x} ${y}L${tx} ${ty}"/><circle class="dl-dot" cx="${x}" cy="${y}" r="1.6"/><text class="dl-t" x="${anchor === "start" ? tx + 4 : tx - 4}" y="${ty - 2}" text-anchor="${anchor}">${es}</text><text class="dl-en" x="${anchor === "start" ? tx + 4 : tx - 4}" y="${ty + 9}" text-anchor="${anchor}">${en}</text>`;
}

function top() {
  const y0 = 78;
  const yJ = y0 + J;
  const yI = yJ + I;
  const yS = yI + SH;
  const L = 18;
  const Rt = 402;
  const b0 = 176;
  const b1 = 244;
  const bands = [
    ["cx-jacket", y0, yJ],
    ["cx-insul", yJ, yI],
    ["cx-shell", yI, yS],
  ]
    .map(([c, a, b]) => `<path class="cx-sec ${c}" d="M${L} ${a}H${b0 - 8}V${b}H${L}Z M${b1 + 8} ${a}H${Rt}V${b}H${b1 + 8}Z"/>`)
    .join("");
  return `<svg class="dl-svg" viewBox="0 0 420 230" role="img" aria-label="Detalle: la boquilla de la entrada de hombre atraviesa chaqueta, aislamiento y virola.">
  <rect class="dl-vapor" x="${L}" y="${yS}" width="${Rt - L}" height="${230 - yS}"/>
  <rect class="dl-liquid" x="${L}" y="198" width="${Rt - L}" height="32"/>
  ${bands}
  <path class="cx-sec cx-steel" d="M130 ${y0 - 22}H${b0 - 8}V${y0}H130Z M${b1 + 8} ${y0 - 22}H290V${y0}H${b1 + 8}Z"/>
  <path class="cx-sec cx-steel" d="M${b0 - 8} ${y0 - 22}H${b0}V${yS + 8}H${b0 - 8}Z M${b1} ${y0 - 22}H${b1 + 8}V${yS + 8}H${b1}Z"/>
  <path class="cx-sec cx-steel" d="M150 ${y0 - 34}H270V${y0 - 22}H150Z"/>
  <path class="cx-sec dl-bolt" d="M138 ${y0 - 44}h6v22h-6Z M276 ${y0 - 44}h6v22h-6Z"/>
  <path class="cx-sec dl-bolt" d="M134 ${y0 - 38}h14v4h-14Z M272 ${y0 - 38}h14v4h-14Z"/>
  <path class="cx-sec dl-pipe" d="M213 ${y0 - 22}h12V230h-12Z"/>
  <path class="cx-sec dl-valve" d="M207 ${y0 - 34}v-20h24v20Z"/>
  ${label(60, (y0 + yJ) / 2, 30, 24, "Chaqueta 3 mm", "jacket, calibre 11")}
  ${label(80, (yJ + yI) / 2, 34, 150, "Aislamiento 13 mm", "thermal protection")}
  ${label(120, (yI + yS) / 2, 110, 176, "Virola 14.3 mm", "TC-128B shell")}
  ${label(282, y0 - 10, 330, 34, "Boquilla", "manway nozzle")}
  ${label(258, y0 - 28, 330, 62, "Tapa y tornillos", "manway cover")}
  ${label(225, 186, 300, 176, "Tubo buzo", "eduction pipe")}
  <text class="dl-cap" x="${L}" y="214">diésel</text>
</svg>`;
}

function bottom() {
  const y0 = 46;
  const yS = y0 + SH;
  const yI = yS + I;
  const yJ = yI + J;
  const L = 18;
  const Rt = 402;
  const s0 = 172;
  const s1 = 248;
  const bands = [
    ["cx-shell", y0, yS],
    ["cx-insul", yS, yI],
    ["cx-jacket", yI, yJ],
  ]
    .map(([c, a, b]) => `<path class="cx-sec ${c}" d="M${L} ${a}H${s0}V${b}H${L}Z M${s1} ${a}H${Rt}V${b}H${s1}Z"/>`)
    .join("");
  const cupBottom = yJ + 34;
  return `<svg class="dl-svg" viewBox="0 0 420 250" role="img" aria-label="Detalle: el sumidero atraviesa el fondo del tanque y sobre su brida se atornilla la válvula de salida inferior.">
  <rect class="dl-liquid" x="${L}" y="0" width="${Rt - L}" height="${y0}"/>
  <path class="dl-liquid" d="M${s0 + 8} ${y0}H${s1 - 8}V${cupBottom}H${s0 + 8}Z"/>
  ${bands}
  <path class="cx-sec cx-steel" d="M${s0} ${y0}h8V${cupBottom}h-8Z M${s1 - 8} ${y0}h8V${cupBottom + 8}h-8Z M${s0} ${cupBottom}H${s1}v8H${s0}Z"/>
  <path class="cx-sec cx-steel" d="M150 ${cupBottom + 8}H${200}v8H150Z M220 ${cupBottom + 8}H270v8H220Z"/>
  <path class="dl-liquid" d="M200 ${cupBottom}h20v16h-20Z"/>
  <path class="cx-sec dl-valve" d="M160 ${cupBottom + 16}H260v8H160Z M176 ${cupBottom + 24}H244V${cupBottom + 62}H176Z"/>
  <path class="cx-sec dl-valve" d="M196 ${cupBottom + 62}h28v24h-28Z M190 ${cupBottom + 86}h40v6h-40Z"/>
  <path class="cx-sec dl-pipe" d="M213 0h12V${cupBottom - 8}h-12Z"/>
  ${label(60, (y0 + yS) / 2, 40, 112, "Virola", "shell")}
  ${label(90, (yS + yI) / 2, 70, 140, "Aislamiento", "thermal protection")}
  ${label(120, (yI + yJ) / 2, 100, 168, "Chaqueta", "jacket")}
  ${label(s1 + 4, cupBottom - 10, 300, 126, "Sumidero", "sump")}
  ${label(266, cupBottom + 12, 300, 156, "Brida y empaque", "outlet flange")}
  ${label(244, cupBottom + 44, 300, 190, "Válvula inferior", "bottom outlet valve")}
  ${label(219, cupBottom - 14, 300, 22, "Punta del tubo buzo", "eduction pipe tip")}
  <text class="dl-cap" x="${L + 4}" y="16">diésel</text>
</svg>`;
}

export function detalleHtml() {
  return `<p class="ct-info-asm">Corte · detalle de pared</p><h3 class="ct-info-name">Capas del tanque <span>(longitudinal section)</span></h3><p>De afuera hacia adentro: chaqueta, aislamiento y virola. Arriba la boquilla atraviesa las tres capas; abajo, el sumidero, sobre cuya brida se atornilla la válvula inferior. Espesores a escala entre sí (1.6 px por mm); piezas esquemáticas.</p>${top()}${bottom()}`;
}
