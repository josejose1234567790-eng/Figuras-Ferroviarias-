// Materiales PBR compartidos y parches de sombreado (polvo de caliza en partes bajas, viento, terreno).
import * as THREE from "three";
import * as T from "./textures.js";

export const ALL = new Set();

// Encadena modificaciones al sombreador; CSM añade la suya al final (ver render.js).
export function hook(m, key, fn) {
  m.userData.hooks = m.userData.hooks || [];
  m.userData.hooks.push(fn);
  m.userData.hookKey = (m.userData.hookKey || "") + key;
  m.customProgramCacheKey = () => m.userData.hookKey;
  m.onBeforeCompile = (s, r) => m.userData.hooks.forEach((h) => h(s, r));
  return m;
}

const NOISE_GLSL = /* glsl */ `
float tmHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tmNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(tmHash(i), tmHash(i+vec2(1,0)), f.x), mix(tmHash(i+vec2(0,1)), tmHash(i+vec2(1,1)), f.x), f.y); }
`;
export { NOISE_GLSL };

// Polvo blanco de caliza que se acumula en lo bajo (bogíes, bases, durmientes, columnas)
export function dust(m, { height = 1.2, amount = 0.55, color = [0.78, 0.75, 0.68] } = {}) {
  return hook(m, `dust${height}${amount}`, (s) => {
    s.uniforms.uDust = { value: new THREE.Vector3(height, amount, 0) };
    s.uniforms.uDustCol = { value: new THREE.Color().setRGB(...color, THREE.SRGBColorSpace) };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDustW;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        dwp = instanceMatrix * dwp;
        #endif
        vDustW = (modelMatrix * dwp).xyz;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vDustW;\nuniform vec3 uDust;\nuniform vec3 uDustCol;\n${NOISE_GLSL}`)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float dN = tmNoise(vDustW.xz * 1.7 + vDustW.y * 2.3) * 0.6 + tmNoise(vDustW.xz * 9.0) * 0.4;
        float dH = 1.0 - smoothstep(0.0, uDust.x, vDustW.y + (dN - 0.5) * uDust.x * 0.5);
        float dA = clamp(dH * uDust.y * (0.55 + 0.6 * dN), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uDustCol, dA);`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, dA);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, dA);");
  });
}

function std(params) {
  const m = new THREE.MeshStandardMaterial(params);
  ALL.add(m);
  return m;
}
export { std };

let cache;
export function M() {
  if (cache) return cache;
  const conc = T.concrete(1, [166, 164, 158]);
  const conc2 = T.concrete(5, [178, 175, 168]);
  const rust = T.rust(2);
  const ball = T.ballast();
  const steel = (hex, opt = {}) => {
    const p = T.paint(hex, { seed: opt.seed || 3, grime: opt.grime ?? 0.35 });
    return std({ map: p.map, roughnessMap: p.rough, roughness: opt.rough ?? 0.8, metalness: opt.metal ?? 0.35, color: 0xffffff });
  };
  cache = {
    railBody: dust(std({ map: rust.map, roughnessMap: rust.rough, normalMap: rust.normal, normalScale: new THREE.Vector2(0.6, 0.6), metalness: 0.55, roughness: 1 }), { height: 0.75, amount: 0.35 }),
    railHead: std({ color: 0xb9bcbf, metalness: 1, roughness: 0.32 }),
    tie: dust(std({ map: conc.map, roughnessMap: conc.rough, normalMap: conc.normal, roughness: 1, metalness: 0 }), { height: 0.75, amount: 0.5 }),
    ballast: std({ map: ball.map, normalMap: ball.normal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.96, metalness: 0 }),
    fastening: dust(std({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), { height: 0.7, amount: 0.3 }),
    darkSteel: dust(steel("#3b3d3f", { seed: 4, grime: 0.5 }), { height: 1.0, amount: 0.45 }),
    structure: dust(steel("#8a9093", { seed: 11, grime: 0.4, rough: 0.7, metal: 0.3 }), { height: 1.2, amount: 0.5 }),
    galv: dust(std({ color: 0x9fa4a6, metalness: 0.85, roughness: 0.48, map: T.paint("#d8dbdc", { seed: 9, grime: 0.25 }).map }), { height: 0.9, amount: 0.35 }),
    yellow: dust(steel("#e0a913", { seed: 5, grime: 0.3, rough: 0.6, metal: 0.2 }), { height: 0.9, amount: 0.4 }),
    red: steel("#a3201d", { seed: 6, grime: 0.25, rough: 0.55, metal: 0.15 }),
    green: steel("#155b4e", { seed: 7, grime: 0.25, rough: 0.6, metal: 0.2 }),
    white: steel("#e9e8e2", { seed: 8, grime: 0.3, rough: 0.7, metal: 0.05 }),
    black: steel("#1b1c1d", { seed: 10, grime: 0.2, rough: 0.6, metal: 0.3 }),
    concrete: dust(std({ map: conc.map, roughnessMap: conc.rough, normalMap: conc.normal, roughness: 1 }), { height: 0.5, amount: 0.35 }),
    concrete2: dust(std({ map: conc2.map, roughnessMap: conc2.rough, normalMap: conc2.normal, roughness: 1 }), { height: 0.5, amount: 0.35 }),
    rubber: std({ color: 0x1a1a1a, roughness: 0.9, metalness: 0 }),
    glass: std({ color: 0x1d2a30, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.2 }),
    rustSteel: dust(std({ map: rust.map, roughnessMap: rust.rough, normalMap: rust.normal, metalness: 0.5, roughness: 1 }), { height: 0.8, amount: 0.4 }),
  };
  return cache;
}
