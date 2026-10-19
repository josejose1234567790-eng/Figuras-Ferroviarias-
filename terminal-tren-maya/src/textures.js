// Texturas generadas por código: color, rugosidad y normales con variación (nada de colores planos).
import * as THREE from "three";
import { rng, fbm, noise2, clamp } from "./util.js";

let ANISO = 8;
export function setAnisotropy(a) {
  ANISO = a;
}

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function tex(c, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Normal a partir de un campo de alturas (Float32Array w*h, 0..1)
function normalFrom(height, w, h, strength = 2) {
  const c = canvas(w, h);
  const g = c.getContext("2d");
  const img = g.createImageData(w, h);
  const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / len) * 127 + 128;
      img.data[i + 1] = (dy / len) * 127 + 128;
      img.data[i + 2] = (1 / len) * 127 + 128;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

function fieldTexture(w, fn) {
  // fn(u, v) -> [r, g, b, height, rough]
  const col = canvas(w);
  const rough = canvas(w);
  const gc = col.getContext("2d");
  const gr = rough.getContext("2d");
  const ic = gc.createImageData(w, w);
  const ir = gr.createImageData(w, w);
  const height = new Float32Array(w * w);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, hgt, ro] = fn(x / w, y / w, x, y);
      const i = (y * w + x) * 4;
      ic.data[i] = r;
      ic.data[i + 1] = g;
      ic.data[i + 2] = b;
      ic.data[i + 3] = 255;
      const rr = clamp(ro, 0, 1) * 255;
      ir.data[i] = rr;
      ir.data[i + 1] = rr;
      ir.data[i + 2] = rr;
      ir.data[i + 3] = 255;
      height[y * w + x] = hgt;
    }
  gc.putImageData(ic, 0, 0);
  gr.putImageData(ir, 0, 0);
  return { col, rough, height };
}

// Convierte un lienzo con transparencia en DataTexture con el color "sangrado" bajo las zonas
// transparentes; así los mipmaps no oscurecen las orillas de hojas, pasto o malla.
export function bleed(c) {
  const w = c.width;
  const h = c.height;
  const d = c.getContext("2d").getImageData(0, 0, w, h).data;
  const rgb = new Float32Array(w * h * 3);
  const a = new Uint8Array(w * h);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    a[i] = d[i * 4 + 3];
    if (a[i] > 8) {
      rgb[i * 3] = d[i * 4];
      rgb[i * 3 + 1] = d[i * 4 + 1];
      rgb[i * 3 + 2] = d[i * 4 + 2];
      sr += d[i * 4];
      sg += d[i * 4 + 1];
      sb += d[i * 4 + 2];
      n++;
    } else rgb[i * 3] = -1;
  }
  // dilatación de color hacia los vacíos
  for (let pass = 0; pass < 4; pass++) {
    const src = rgb.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i * 3] >= 0) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let k = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (src[j * 3] < 0) continue;
          r += src[j * 3];
          g += src[j * 3 + 1];
          b += src[j * 3 + 2];
          k++;
        }
        if (k) {
          rgb[i * 3] = r / k;
          rgb[i * 3 + 1] = g / k;
          rgb[i * 3 + 2] = b / k;
        }
      }
  }
  const out = new Uint8Array(w * h * 4);
  const avg = n ? [sr / n, sg / n, sb / n] : [128, 128, 128];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = ((h - 1 - y) * w + x) * 4; // DataTexture: fila 0 abajo
      const has = rgb[i * 3] >= 0;
      out[o] = has ? rgb[i * 3] : avg[0];
      out[o + 1] = has ? rgb[i * 3 + 1] : avg[1];
      out[o + 2] = has ? rgb[i * 3 + 2] : avg[2];
      out[o + 3] = a[i];
    }
  return dataTex(out, w, h);
}

function dataTex(out, w, h, srgb = true) {
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

// ---------- texturas precalculadas (texturas.js): evitan generar todo en cada arranque
let BAKED = null;
const loadImg = async (url) => {
  const im = new Image();
  im.src = url;
  await im.decode();
  const c = canvas(im.width, im.height);
  c.getContext("2d").drawImage(im, 0, 0);
  return c;
};
async function des(e) {
  if (e && e.$t) {
    let t;
    if (e.d) {
      const [c1, c2] = await Promise.all([loadImg(e.rgb), loadImg(e.a)]);
      const d1 = c1.getContext("2d").getImageData(0, 0, e.w, e.h).data;
      const d2 = c2.getContext("2d").getImageData(0, 0, e.w, e.h).data;
      const out = new Uint8Array(e.w * e.h * 4);
      for (let i = 0; i < e.w * e.h; i++) {
        out[i * 4] = d1[i * 4];
        out[i * 4 + 1] = d1[i * 4 + 1];
        out[i * 4 + 2] = d1[i * 4 + 2];
        out[i * 4 + 3] = d2[i * 4];
      }
      t = dataTex(out, e.w, e.h, e.srgb);
    } else t = tex(await loadImg(e.img), { srgb: e.srgb });
    t.repeat.set(e.rep[0], e.rep[1]);
    if (!e.wrap) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  if (e && e.$c) return loadImg(e.$c);
  if (e && typeof e === "object") {
    const o = {};
    await Promise.all(Object.keys(e).map(async (k) => (o[k] = await des(e[k]))));
    return o;
  }
  return e;
}
export async function loadBaked(progress) {
  const src = typeof window !== "undefined" && window.TM_TEXTURAS;
  if (!src) return false;
  BAKED = {};
  const keys = Object.keys(src);
  let n = 0;
  await Promise.all(
    keys.map(async (k) => {
      BAKED[k] = await des(src[k]);
      n++;
      if (progress && n % 8 === 0) progress(`Texturas ${n}/${keys.length}…`);
    }),
  );
  return true;
}
function ser(v) {
  if (v && v.isTexture) {
    const base = { $t: 1, srgb: v.colorSpace === THREE.SRGBColorSpace, rep: [v.repeat.x, v.repeat.y], wrap: v.wrapS === THREE.ClampToEdgeWrapping ? 0 : 1 };
    if (v.isDataTexture) {
      const { data, width: w, height: h } = v.image;
      const c1 = canvas(w, h);
      const c2 = canvas(w, h);
      const i1 = c1.getContext("2d").createImageData(w, h);
      const i2 = c2.getContext("2d").createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        i1.data[i * 4] = data[i * 4];
        i1.data[i * 4 + 1] = data[i * 4 + 1];
        i1.data[i * 4 + 2] = data[i * 4 + 2];
        i1.data[i * 4 + 3] = 255;
        i2.data[i * 4] = i2.data[i * 4 + 1] = i2.data[i * 4 + 2] = data[i * 4 + 3];
        i2.data[i * 4 + 3] = 255;
      }
      c1.getContext("2d").putImageData(i1, 0, 0);
      c2.getContext("2d").putImageData(i2, 0, 0);
      return { ...base, d: 1, w, h, rgb: c1.toDataURL("image/jpeg", 0.92), a: c2.toDataURL("image/png") };
    }
    return { ...base, img: v.image.toDataURL("image/jpeg", 0.93) };
  }
  if (typeof HTMLCanvasElement !== "undefined" && v instanceof HTMLCanvasElement) return { $c: v.toDataURL("image/png") };
  if (v && typeof v === "object") {
    const o = {};
    for (const k in v) o[k] = ser(v[k]);
    return o;
  }
  return v;
}
export function bakeAll() {
  const out = {};
  for (const [k, v] of cache) out[k] = ser(v);
  return "window.TM_TEXTURAS = " + JSON.stringify(out) + ";\n";
}

const cache = new Map();
export const TEXTIME = {};
export function once(key, make) {
  if (!cache.has(key) && BAKED && BAKED[key] !== undefined) cache.set(key, BAKED[key]);
  if (!cache.has(key)) {
    const t0 = performance.now();
    cache.set(key, make());
    TEXTIME[key] = performance.now() - t0;
  }
  return cache.get(key);
}

// Balasto de caliza blanca triturada: piedras angulosas con luz y sombra
export function ballast() {
  return once("ballast", () => {
    const w = 1024;
    const col = canvas(w);
    const g = col.getContext("2d");
    const hgt = canvas(w);
    const gh = hgt.getContext("2d");
    g.fillStyle = "#6f6a62";
    g.fillRect(0, 0, w, w);
    gh.fillStyle = "#000";
    gh.fillRect(0, 0, w, w);
    const r = rng(7);
    const stones = 5200;
    for (let i = 0; i < stones; i++) {
      const cx = r() * w;
      const cy = r() * w;
      const size = 7 + r() * 17;
      const n = 5 + Math.floor(r() * 3);
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.6;
        const rr = size * (0.55 + r() * 0.45);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr * (0.7 + r() * 0.3)]);
      }
      const base = 170 + r() * 50;
      const warm = r() * 10;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w]]) {
        const x0 = cx + ox;
        const y0 = cy + oy;
        if (x0 < -40 || x0 > w + 40 || y0 < -40 || y0 > w + 40) continue;
        // sombra de contacto
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(x0 + px + 2, y0 + py + 3) : g.moveTo(x0 + px + 2, y0 + py + 3)));
        g.closePath();
        g.fillStyle = "rgba(40,36,30,0.35)";
        g.fill();
        // cara de la piedra con degradado de luz
        const grd = g.createLinearGradient(x0 - size, y0 - size, x0 + size, y0 + size);
        grd.addColorStop(0, `rgb(${base + 14},${base + 12 - warm * 0.2},${base + 6 - warm})`);
        grd.addColorStop(1, `rgb(${base - 46},${base - 48},${base - 52 - warm})`);
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(x0 + px, y0 + py) : g.moveTo(x0 + px, y0 + py)));
        g.closePath();
        g.fillStyle = grd;
        g.fill();
        // arista iluminada
        g.strokeStyle = `rgba(255,255,250,${0.15 + r() * 0.2})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x0 + pts[0][0], y0 + pts[0][1]);
        g.lineTo(x0 + pts[1][0], y0 + pts[1][1]);
        g.stroke();
        const hg = gh.createRadialGradient(x0, y0, 0, x0, y0, size);
        hg.addColorStop(0, "rgba(255,255,255,1)");
        hg.addColorStop(1, "rgba(255,255,255,0.2)");
        gh.beginPath();
        pts.forEach(([px, py], k) => (k ? gh.lineTo(x0 + px, y0 + py) : gh.moveTo(x0 + px, y0 + py)));
        gh.closePath();
        gh.fillStyle = hg;
        gh.fill();
      }
    }
    // polvo blanco fino encima
    const d = g.getImageData(0, 0, w, w);
    for (let i = 0; i < d.data.length; i += 4) {
      const x = (i / 4) % w;
      const y = Math.floor(i / 4 / w);
      const dust = fbm(x / 64, y / 64, { seed: 3, period: 16 }) * 22;
      d.data[i] = clamp(d.data[i] + dust, 0, 255);
      d.data[i + 1] = clamp(d.data[i + 1] + dust, 0, 255);
      d.data[i + 2] = clamp(d.data[i + 2] + dust * 0.9, 0, 255);
    }
    g.putImageData(d, 0, 0);
    const hd = gh.getImageData(0, 0, w, w).data;
    const height = new Float32Array(w * w);
    for (let i = 0; i < w * w; i++) height[i] = hd[i * 4] / 255;
    return { map: tex(col), normal: tex(normalFrom(height, w, w, 3.5), { srgb: false }) };
  });
}

// Concreto claro de durmientes, losas y bases
export function concrete(seed = 1, tint = [196, 193, 186]) {
  return once(`concrete${seed}${tint}`, () => {
    const t = fieldTexture(512, (u, v, x, y) => {
      const n = fbm(u * 8, v * 8, { seed, period: 8 });
      const fine = noise2(x / 2, y / 2, seed + 9, 256);
      const pits = noise2(x / 3.1, y / 3.1, seed + 4, 165) > 0.93 ? -40 : 0;
      const stain = fbm(u * 3, v * 3, { seed: seed + 2, period: 3 }) > 0.62 ? -18 : 0;
      const k = (n - 0.5) * 30 + (fine - 0.5) * 14 + pits + stain;
      return [tint[0] + k, tint[1] + k, tint[2] + k * 0.95, fine * 0.6 + n * 0.4, 0.82 + (fine - 0.5) * 0.15];
    });
    return { map: tex(t.col), rough: tex(t.rough, { srgb: false }), normal: tex(normalFrom(t.height, 512, 512, 1.2), { srgb: false }) };
  });
}

// Acero con óxido (alma y patín del riel, herrajes, bogíes)
export function rust(seed = 2) {
  return once(`rust${seed}`, () => {
    const t = fieldTexture(512, (u, v, x, y) => {
      const n = fbm(u * 6, v * 6, { seed, period: 6 });
      const m = fbm(u * 24, v * 24, { seed: seed + 5, period: 24 });
      const orange = clamp((n - 0.45) * 3, 0, 1);
      const r = 92 + orange * 70 + (m - 0.5) * 30;
      const g = 74 + orange * 30 + (m - 0.5) * 22;
      const b = 62 - orange * 10 + (m - 0.5) * 16;
      return [r, g, b, m, 0.75 + orange * 0.2];
    });
    return { map: tex(t.col), rough: tex(t.rough, { srgb: false }), normal: tex(normalFrom(t.height, 512, 512, 1.6), { srgb: false }) };
  });
}

// Pintura con brillo semimate y variación de tono (para estructuras y equipo)
export function paint(hex, { seed = 3, grime = 0.35, size = 512 } = {}) {
  return once(`paint${hex}${seed}${grime}`, () => {
    const c = new THREE.Color(hex);
    const base = [c.r * 255, c.g * 255, c.b * 255];
    const t = fieldTexture(size, (u, v, x, y) => {
      const n = fbm(u * 4, v * 4, { seed, period: 4 });
      const streak = fbm(u * 2, v * 22, { seed: seed + 1, period: 2 }) - 0.5;
      const spot = noise2(x / 6, y / 6, seed + 7, size / 6) > 0.9 ? 1 : 0;
      const k = (n - 0.5) * 18 - grime * (streak * 30 + spot * 22);
      return [base[0] + k, base[1] + k, base[2] + k, n, 0.45 + (n - 0.5) * 0.2 + grime * spot * 0.3];
    });
    return { map: tex(t.col), rough: tex(t.rough, { srgb: false }) };
  });
}

// Tierra roja k'ankab con piedrecillas
export function redEarth() {
  return once("redEarth", () => {
    const t = fieldTexture(512, (u, v, x, y) => {
      const n = fbm(u * 6, v * 6, { seed: 21, period: 6 });
      const fine = noise2(x / 1.5, y / 1.5, 22, 341);
      const pebble = noise2(x / 4, y / 4, 23, 128) > 0.86 ? 50 : 0;
      const k = (n - 0.5) * 40 + (fine - 0.5) * 22;
      return [124 + k + pebble, 66 + k * 0.7 + pebble * 1.1, 44 + k * 0.5 + pebble * 1.2, fine * 0.5 + n * 0.5 + pebble / 200, 0.95];
    });
    return { map: tex(t.col), normal: tex(normalFrom(t.height, 512, 512, 2.2), { srgb: false }) };
  });
}

// Detalle fino en escala de grises para multiplicar sobre el mapa del terreno
export function detailNoise() {
  return once("detail", () => {
    const t = fieldTexture(512, (u, v, x, y) => {
      const n = fbm(u * 16, v * 16, { seed: 31, period: 16 });
      const f = noise2(x / 1.3, y / 1.3, 32, 394);
      const k = 128 + (n - 0.5) * 70 + (f - 0.5) * 40;
      return [k, k, k, n * 0.6 + f * 0.4, 1];
    });
    return { map: tex(t.col, { srgb: false }), normal: tex(normalFrom(t.height, 512, 512, 2.6), { srgb: false }) };
  });
}

// Malla ciclónica (alfa)
export function chainLink() {
  return once("chain", () => {
    const w = 256;
    const c = canvas(w);
    const g = c.getContext("2d");
    g.clearRect(0, 0, w, w);
    g.strokeStyle = "rgba(170,172,170,1)";
    g.lineWidth = 3;
    const step = 32;
    for (let k = -w; k < 2 * w; k += step) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + w, w);
      g.stroke();
      g.beginPath();
      g.moveTo(k + w, 0);
      g.lineTo(k, w);
      g.stroke();
    }
    return bleed(c);
  });
}

export const foliageCanvas = (k) => foliage(k);
// Hojas: racimos para tarjetas con transparencia (selva baja caducifolia, temporada seca)
export function foliage(kind = 0) {
  return once(`fol${kind}`, () => {
    const w = 512;
    const c = canvas(w);
    const g = c.getContext("2d");
    const r = rng(100 + kind);
    const palettes = [
      [[74, 92, 44], [96, 112, 52], [58, 74, 36], [120, 124, 62]],
      [[88, 98, 50], [112, 116, 58], [70, 80, 40], [138, 130, 70]],
      [[60, 82, 42], [82, 104, 50], [48, 66, 34], [104, 118, 58]],
      [[112, 108, 60], [138, 126, 70], [92, 90, 52], [156, 140, 84]],
    ];
    const pal = palettes[kind % palettes.length];
    // forma general irregular del racimo
    for (let i = 0; i < 2600; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * w * 0.46 * (0.75 + 0.25 * Math.sin(a * 3 + kind));
      const x = w / 2 + Math.cos(a) * rad;
      const y = w / 2 + Math.sin(a) * rad * 0.85;
      const col = pal[Math.floor(r() * pal.length)];
      const shade = 0.65 + 0.35 * (1 - (y / w) * 0.8) + (r() - 0.5) * 0.15;
      g.fillStyle = `rgb(${col[0] * shade},${col[1] * shade},${col[2] * shade})`;
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI * 2);
      const L = 6 + r() * 9;
      g.beginPath();
      g.ellipse(0, 0, L, L * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // ramitas
    g.strokeStyle = "rgba(70,58,44,0.9)";
    g.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2;
      g.beginPath();
      g.moveTo(w / 2, w / 2 + 40);
      g.lineTo(w / 2 + Math.cos(a) * w * 0.38, w / 2 + Math.sin(a) * w * 0.3);
      g.stroke();
    }
    return c;
  });
}

export function bark() {
  return once("bark", () => {
    const t = fieldTexture(256, (u, v, x, y) => {
      const n = fbm(u * 4, v * 40, { seed: 41, period: 4 });
      const k = (n - 0.5) * 60;
      return [112 + k, 104 + k, 92 + k, n, 0.9];
    });
    return { map: tex(t.col), normal: tex(normalFrom(t.height, 256, 256, 3), { srgb: false }) };
  });
}

export function grassCard() {
  return once("grass", () => {
    const w = 256;
    const c = canvas(w, 128);
    const g = c.getContext("2d");
    const r = rng(55);
    for (let i = 0; i < 260; i++) {
      const x = r() * w;
      const h = 40 + r() * 86;
      const lean = (r() - 0.5) * 30;
      const dry = r();
      g.strokeStyle = dry > 0.45 ? `rgb(${168 + r() * 40},${150 + r() * 30},${92 + r() * 20})` : `rgb(${110 + r() * 30},${118 + r() * 20},${64})`;
      g.lineWidth = 1.2 + r();
      g.beginPath();
      g.moveTo(x, 128);
      g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
      g.stroke();
    }
    return bleed(c);
  });
}

// Lámina pintada de bodega (muros blancos con escurrimientos) y techo verde acanalado
export function wall() {
  return once("wall", () => {
    const t = fieldTexture(512, (u, v, x, y) => {
      const n = fbm(u * 4, v * 4, { seed: 51, period: 4 });
      const drip = Math.pow(clamp(fbm(u * 20, v * 1.5, { seed: 52, period: 20 }) - 0.35, 0, 1), 1.5) * 90 * v;
      const base = 226 + (n - 0.5) * 14 - drip;
      return [base, base - 1, base - 6, n, 0.85];
    });
    return { map: tex(t.col), rough: tex(t.rough, { srgb: false }) };
  });
}
export function roof() {
  return once("roof", () => {
    const w = 512;
    const t = fieldTexture(w, (u, v, x) => {
      const rib = 0.5 + 0.5 * Math.cos((x / w) * Math.PI * 2 * 8);
      const n = fbm(u * 3, v * 3, { seed: 61, period: 3 });
      const k = (n - 0.5) * 20 - rib * 14;
      return [46 + k, 104 + k, 72 + k, rib, 0.5 + n * 0.2];
    });
    return { map: tex(t.col), rough: tex(t.rough, { srgb: false }), normal: tex(normalFrom(t.height, w, w, 2), { srgb: false }) };
  });
}
export function grating() {
  return once("grating", () => {
    const w = 256;
    const c = canvas(w);
    const g = c.getContext("2d");
    g.clearRect(0, 0, w, w);
    g.fillStyle = "rgb(150,152,150)";
    for (let x = 0; x < w; x += 12) g.fillRect(x, 0, 7, w);
    for (let y = 0; y < w; y += 48) g.fillRect(0, y, w, 5);
    return bleed(c);
  });
}

// Suelo de pasto seco con tierra asomando (temporada de secas)
export function grassGround() {
  return once("grassGround", () => {
    const w = 512;
    const t = fieldTexture(w, (u, v, x, y) => {
      const n = fbm(u * 8, v * 8, { seed: 71, period: 8 });
      const blade = noise2(x / 1.2, y / 5.0, 72, 427);
      const blade2 = noise2(x / 4.0, y / 1.1, 73, 128);
      const bare = clamp((fbm(u * 5, v * 5, { seed: 74, period: 5 }) - 0.58) * 5, 0, 1);
      const k = (n - 0.5) * 34 + (blade - 0.5) * 40 + (blade2 - 0.5) * 18;
      const gr = [146 + k, 134 + k * 0.9, 92 + k * 0.6];
      const ea = [146 + k * 0.5, 76 + k * 0.4, 44 + k * 0.3];
      const f = bare * 0.7;
      return [gr[0] * (1 - f) + ea[0] * f, gr[1] * (1 - f) + ea[1] * f, gr[2] * (1 - f) + ea[2] * f, blade * 0.6 + n * 0.4, 0.95];
    });
    return { map: tex(t.col), normal: tex(normalFrom(t.height, w, w, 2.5), { srgb: false }) };
  });
}

// Dosel de selva baja visto de lejos: copas apretadas con luz y sombra
export function canopy() {
  return once("canopy", () => {
    const w = 1024;
    const col = canvas(w);
    const g = col.getContext("2d");
    const hc = canvas(w);
    const gh = hc.getContext("2d");
    g.fillStyle = "#4a4c34";
    g.fillRect(0, 0, w, w);
    gh.fillStyle = "#000";
    gh.fillRect(0, 0, w, w);
    const r = rng(81);
    const pal = [[92, 104, 58], [112, 118, 66], [78, 90, 48], [134, 124, 82], [150, 138, 106], [118, 108, 86], [70, 86, 46], [128, 132, 76], [160, 150, 124]];
    for (let i = 0; i < 2600; i++) {
      const cx = r() * w;
      const cy = r() * w;
      const rad = 10 + r() * 26;
      const c = pal[Math.floor(r() * pal.length)];
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w], [w, w], [-w, -w], [w, -w], [-w, w]]) {
        const x0 = cx + ox;
        const y0 = cy + oy;
        if (x0 < -50 || x0 > w + 50 || y0 < -50 || y0 > w + 50) continue;
        const grd = g.createRadialGradient(x0 - rad * 0.3, y0 - rad * 0.3, rad * 0.1, x0, y0, rad);
        grd.addColorStop(0, `rgb(${c[0] * 1.15},${c[1] * 1.15},${c[2] * 1.1})`);
        grd.addColorStop(0.7, `rgb(${c[0] * 0.85},${c[1] * 0.85},${c[2] * 0.85})`);
        grd.addColorStop(1, `rgba(${c[0] * 0.45},${c[1] * 0.45},${c[2] * 0.45},0.9)`);
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x0, y0, rad, 0, Math.PI * 2);
        g.fill();
        const hg = gh.createRadialGradient(x0, y0, 0, x0, y0, rad);
        hg.addColorStop(0, "rgba(255,255,255,0.9)");
        hg.addColorStop(1, "rgba(255,255,255,0)");
        gh.fillStyle = hg;
        gh.beginPath();
        gh.arc(x0, y0, rad, 0, Math.PI * 2);
        gh.fill();
      }
    }
    // textura fina de hojas
    const d = g.getImageData(0, 0, w, w);
    for (let i = 0; i < d.data.length; i += 4) {
      const x = (i / 4) % w;
      const y = Math.floor(i / 4 / w);
      const k = (noise2(x / 1.5, y / 1.5, 82, 683) - 0.5) * 40;
      d.data[i] = clamp(d.data[i] + k, 0, 255);
      d.data[i + 1] = clamp(d.data[i + 1] + k, 0, 255);
      d.data[i + 2] = clamp(d.data[i + 2] + k * 0.8, 0, 255);
    }
    g.putImageData(d, 0, 0);
    const hd = gh.getImageData(0, 0, w, w).data;
    const height = new Float32Array(w * w);
    for (let i = 0; i < w * w; i++) height[i] = hd[i * 4] / 255 + (noise2((i % w) / 1.5, Math.floor(i / w) / 1.5, 83, 683) - 0.5) * 0.1;
    return { map: tex(col), normal: tex(normalFrom(height, w, w, 4), { srgb: false }) };
  });
}

// Atlas 2x2 con los cuatro tipos de follaje
export function foliageAtlas() {
  return once("folAtlas", () => {
    const w = 1024;
    const c = canvas(w);
    const g = c.getContext("2d");
    for (let k = 0; k < 4; k++) {
      const src = foliage(k);
      g.drawImage(src, (k % 2) * 512 + 16, Math.floor(k / 2) * 512 + 16, 480, 480);
    }
    const t = bleed(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Normal de lámina acanalada vertical (muros de bodega)
export function ribs() {
  return once("ribs", () => {
    const w = 256;
    const height = new Float32Array(w * w);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const u = (x / w) * 4; // 4 crestas por mosaico
        const f = u - Math.floor(u);
        height[y * w + x] = f < 0.25 ? f / 0.25 : f < 0.45 ? 1 : f < 0.7 ? 1 - (f - 0.45) / 0.25 : 0;
      }
    return tex(normalFrom(height, w, w, 6), { srgb: false, repeat: [4, 1] });
  });
}
