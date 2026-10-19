// Terreno: tierra roja k'ankab, caliza blanca compactada (patio y caminos), pasto seco y afloramientos.
import * as THREE from "three";
import { fbm, rng, clamp, smooth } from "./util.js";
import { SITE } from "./layout.js";
import * as TX from "./textures.js";
import { hook, std, NOISE_GLSL } from "./materials.js";

export const SPLAT = { size: 2048, half: 1200 };
const F = SITE.cerca;

// Distancia (m) hacia afuera del rectángulo de la cerca (negativa adentro)
export function outside(x, z) {
  const dx = Math.max(F.x0 - x, x - F.x1);
  const dz = Math.max(F.z0 - z, z - F.z1);
  if (dx > 0 && dz > 0) return Math.hypot(dx, dz);
  return Math.max(dx, dz);
}

export function heightAt(x, z) {
  const o = outside(x, z);
  const m = smooth(10, 160, o) * smooth(9, 50, Math.abs(z)) * (1 - smooth(2150, 2450, Math.max(Math.abs(x), Math.abs(z))));
  if (m <= 0) return 0;
  return (fbm(x / 420 + 7, z / 420 + 3, { seed: 5, octaves: 4 }) - 0.45) * 9 * m + (fbm(x / 60, z / 60, { seed: 6, octaves: 3 }) - 0.5) * 1.2 * m;
}

// Caminos de terracería blanca (polilíneas x,z y ancho)
export const ROADS = [
  { w: 7, pts: [[-660, 1300], [-660, 85], [-660, 40], [-640, 34]] },
  { w: 6, pts: [[-985, 76], [985, 76]] },
  { w: 6, pts: [[-985, -86], [985, -86]] },
  { w: 6, pts: [[-985, -86], [-985, 76]] },
  { w: 6, pts: [[985, -86], [985, 76]] },
  { w: 7, pts: [[-660, 40], [-660, -60], [-560, -62], [360, -62], [360, -86]] },
  { w: 7, pts: [[-300, 76], [-300, 56]] },
  { w: 7, pts: [[-470, 76], [-470, 14]] },
  { w: 6, pts: [[40, 76], [40, 28]] },
  { w: 6, pts: [[-40, 76], [-40, 16]] },
  { w: 6, pts: [[-120, 76], [-120, 12]] },
];

function paintSplat() {
  const { size, half } = SPLAT;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const k = size / (2 * half);
  const X = (x) => (x + half) * k;
  // base: pasto seco
  g.fillStyle = "rgb(0,255,0)";
  g.fillRect(0, 0, size, size);
  const blob = (x, z, r, col, a = 1) => {
    const grd = g.createRadialGradient(X(x), X(z), 0, X(x), X(z), r * k);
    grd.addColorStop(0, `rgba(${col},${a})`);
    grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(X(x), X(z), r * k, 0, Math.PI * 2);
    g.fill();
  };
  const r = rng(91);
  // franja desmontada junto a la cerca: tierra roja con pasto
  for (let i = 0; i < 1300; i++) {
    const side = r();
    let x;
    let z;
    if (side < 0.5) {
      x = -1030 + r() * 2060;
      z = r() < 0.5 ? F.z0 - r() * 30 : F.z1 + r() * 30;
    } else {
      z = -120 + r() * 230;
      x = r() < 0.5 ? F.x0 - r() * 30 : F.x1 + r() * 30;
    }
    blob(x, z, 4 + r() * 10, "0,40,0", 0.75);
  }
  // manchas de tierra roja dentro del predio y en el campo
  for (let i = 0; i < 900; i++) blob(-1150 + r() * 2300, -1150 + r() * 2300, 3 + r() * 14, "0,60,0", 0.55);
  for (let i = 0; i < 500; i++) blob(-1000 + r() * 2000, -95 + r() * 180, 2 + r() * 8, "0,30,0", 0.6);
  // patio: plataforma de caliza compactada con orillas irregulares
  const pad = (x0, x1, z0, z1) => {
    g.fillStyle = "rgb(255,0,0)";
    g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k);
    for (let x = x0; x <= x1; x += 6) {
      blob(x, z0, 4 + r() * 6, "255,0,0", 1);
      blob(x, z1, 4 + r() * 6, "255,0,0", 1);
    }
    for (let z = z0; z <= z1; z += 6) {
      blob(x0, z, 4 + r() * 6, "255,0,0", 1);
      blob(x1, z, 4 + r() * 6, "255,0,0", 1);
    }
  };
  pad(-640, 600, -42, 18); // haz de vías
  pad(-1000, 1000, -9, 9); // principal
  pad(-40, 200, -50, -28); // llenadera
  pad(-200, 180, 4, 34); // servicios y combustible
  pad(-660, -620, 18, 40); // caseta
  pad(-330, -270, 30, 60); // bodega
  pad(-482, -458, 2, 14); // caseta de báscula
  // caminos
  g.strokeStyle = "rgb(255,0,0)";
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const rd of ROADS) {
    g.lineWidth = rd.w * k;
    g.beginPath();
    rd.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
    g.stroke();
    // orillas con tierra roja por el paso de vehículos
    g.save();
    g.globalCompositeOperation = "destination-over";
    g.restore();
  }
  // rodadas y desgaste en caminos
  for (const rd of ROADS)
    for (let i = 1; i < rd.pts.length; i++) {
      const [x0, z0] = rd.pts[i - 1];
      const [x1, z1] = rd.pts[i];
      const L = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 0; s < L; s += 8) {
        const f = s / L;
        const x = x0 + (x1 - x0) * f + (r() - 0.5) * rd.w * 1.4;
        const z = z0 + (z1 - z0) * f + (r() - 0.5) * rd.w * 1.4;
        blob(x, z, 2 + r() * 4, "120,40,0", 0.6);
      }
    }
  // afloramientos de laja
  for (let i = 0; i < 700; i++) {
    const x = -1150 + r() * 2300;
    const z = -1150 + r() * 2300;
    if (Math.abs(z) < 40 && Math.abs(x) < 700) continue;
    blob(x, z, 1.5 + r() * 4, "0,0,255", 0.8);
  }
  return c;
}

export function buildTerrain(scene) {
  const splatCanvas = TX.once("splat", paintSplat);
  const splatCtx = splatCanvas.getContext("2d");
  const splatData = splatCtx.getImageData(0, 0, SPLAT.size, SPLAT.size).data;
  const splatTex = TX.tex(splatCanvas, { srgb: false });
  splatTex.wrapS = splatTex.wrapT = THREE.ClampToEdgeWrapping;
  splatTex.anisotropy = 1;

  const S = 5000;
  const N = 250;
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  // malla fina adicional para el predio (sin escalones de 20 m en orillas de caminos)
  geo.computeVertexNormals();
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 5, -pos.getZ(i) / 5);

  const earth = TX.redEarth();
  const lime = TX.concrete(11, [170, 164, 150]);
  const grass = TX.grassGround();
  const rock = TX.concrete(13, [150, 146, 136]);
  const detail = TX.detailNoise();
  const ball = TX.ballast();
  const mat = std({ color: 0xffffff, roughness: 0.96, metalness: 0, normalMap: earth.normal, normalScale: new THREE.Vector2(0.9, 0.9) });
  mat.name = "terreno";
  const fosa = SITE.fosa;
  hook(mat, "terrain", (s) => {
    Object.assign(s.uniforms, {
      tSplat: { value: splatTex },
      tEarth: { value: earth.map },
      tLime: { value: lime.map },
      tGrass: { value: grass.map },
      tRock: { value: rock.map },
      tDetail: { value: detail.map },
      tBall: { value: ball.map },
      uHalf: { value: SPLAT.half },
      uPit: { value: new THREE.Vector4(fosa.x - fosa.len / 2, fosa.x + fosa.len / 2, 6 - 0.62, 6 + 0.62) },
    });
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTW;
        uniform sampler2D tSplat, tEarth, tLime, tGrass, tRock, tDetail, tBall;
        uniform float uHalf;
        uniform vec4 uPit;
        ${NOISE_GLSL}`,
      )
      .replace(
        "#include <map_fragment>",
        `
        if (vTW.x > uPit.x && vTW.x < uPit.y && vTW.z > uPit.z && vTW.z < uPit.w) discard;
        vec2 wp = vTW.xz;
        vec2 suv = (wp + uHalf) / (2.0 * uHalf);
        // ruido para romper las orillas de las capas
        float bn = tmNoise(wp * 0.35) * 0.6 + tmNoise(wp * 1.7) * 0.4;
        vec3 sp = texture2D(tSplat, vec2(suv.x, 1.0 - suv.y)).rgb;
        float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
        sp = mix(vec3(0.0, 0.85, 0.0), sp, inside);
        float wl = smoothstep(0.25, 0.75, sp.r + (bn - 0.5) * 0.5);
        float wr = smoothstep(0.3, 0.8, sp.b + (bn - 0.5) * 0.4);
        float wg = smoothstep(0.12, 0.42, sp.g + (bn - 0.5) * 0.3) * (1.0 - wl);
        vec3 cE = texture2D(tEarth, wp / 7.0).rgb * (0.85 + 0.3 * texture2D(tEarth, wp / 53.0).r);
        vec3 cG = texture2D(tGrass, wp / 6.0).rgb * (0.8 + 0.4 * texture2D(tDetail, wp / 90.0).r);
        // caliza compactada (sascab): grava fina cálida, poca variación de gran escala
        vec3 cream = vec3(0.37, 0.335, 0.27);
        vec3 cL = mix(cream, texture2D(tBall, wp / 1.7).rgb * vec3(0.8, 0.75, 0.66), 0.5);
        cL = mix(cL, texture2D(tLime, wp / 9.0).rgb * vec3(0.95, 0.9, 0.82), 0.2);
        cL *= 0.93 + 0.14 * texture2D(tDetail, wp / 55.0).r;
        cL *= 1.0 - 0.12 * smoothstep(0.55, 0.8, tmNoise(wp / 14.0));
        vec3 cR = texture2D(tRock, wp / 9.0).rgb;
        vec3 col = mix(cE, cG, wg);
        col = mix(col, cR, wr * (1.0 - wl));
        col = mix(col, cL, wl);
        // mancha roja de tierra en caminos (rodadas)
        col = mix(col, cE * 1.05, clamp(sp.g * 0.0 + (sp.r > 0.3 && sp.g > 0.1 ? sp.g * 0.8 : 0.0), 0.0, 0.7));
        col *= 0.9 + 0.2 * texture2D(tDetail, wp / 11.0).r;
        diffuseColor.rgb *= col;
        float terrRough = mix(0.97, 0.9, wl);
        `,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = terrRough;");
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "terreno";
  scene.add(mesh);

  const splatAt = (x, z) => {
    const u = Math.floor(((x + SPLAT.half) / (2 * SPLAT.half)) * SPLAT.size);
    const v = Math.floor(((z + SPLAT.half) / (2 * SPLAT.half)) * SPLAT.size);
    if (u < 0 || v < 0 || u >= SPLAT.size || v >= SPLAT.size) return [0, 0.85, 0];
    const i = (v * SPLAT.size + u) * 4;
    return [splatData[i] / 255, splatData[i + 1] / 255, splatData[i + 2] / 255];
  };
  return { mesh, splatAt };
}

// Dosel lejano de la selva baja (más allá de la franja de árboles individuales)
export function buildCanopy(scene) {
  const S = 5000;
  const N = 250;
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const o = outside(x, z);
    const corridor = smooth(13, 30, Math.abs(z)) * (z > 0 ? smooth(8, 20, Math.abs(x + 660)) : 1);
    const ramp = smooth(46, 56, o) * corridor;
    const edge = smooth(2150, 2450, Math.max(Math.abs(x), Math.abs(z)));
    const h = (7 + fbm(x / 70, z / 70, { seed: 9, octaves: 3 }) * 4.5) * (1 - edge) + 9 * edge;
    pos.setY(i, heightAt(x, z) + (ramp > 0 ? h * ramp - 3 * (1 - ramp) : -5));
    uv.setXY(i, x / 55, z / 55);
  }
  geo.computeVertexNormals();
  const c = TX.canopy();
  const mat = std({ map: c.map, normalMap: c.normal, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.92, metalness: 0 });
  mat.name = "dosel";
  hook(mat, "canopy", (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vCW;\n${NOISE_GLSL}`)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float big = tmNoise(vCW.xz / 260.0) * 0.6 + tmNoise(vCW.xz / 90.0) * 0.4;
        float dry = smoothstep(0.5, 0.75, big);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.25, 1.1, 0.95) + vec3(0.04, 0.03, 0.02), dry * 0.8);
        diffuseColor.rgb *= 0.82 + 0.36 * tmNoise(vCW.xz / 35.0);`,
      );
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = "selva";
  mesh.userData.info = "selva";
  scene.add(mesh);
  // anillo lejano (más allá de 2.5 km) hasta el horizonte
  const R = 24000;
  const ring = [];
  for (const [cx, cz, w, d] of [[0, -(R + 2500) / 2, 2 * R, R - 2500], [0, (R + 2500) / 2, 2 * R, R - 2500], [-(R + 2500) / 2, 0, R - 2500, 5000], [(R + 2500) / 2, 0, R - 2500, 5000]]) {
    const p = new THREE.PlaneGeometry(w, d, 1, 1);
    p.rotateX(-Math.PI / 2);
    p.translate(cx, 8.5, cz);
    const u = p.attributes.uv;
    const pp = p.attributes.position;
    for (let i = 0; i < u.count; i++) u.setXY(i, pp.getX(i) / 40, pp.getZ(i) / 40);
    ring.push(p);
  }
  for (const p of ring) {
    const m2 = new THREE.Mesh(p, mat);
    m2.receiveShadow = false;
    scene.add(m2);
  }
  return mesh;
}
