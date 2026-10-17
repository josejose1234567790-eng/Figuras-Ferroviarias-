// Iluminación y presentación: cielo físico, sol de las 9:30 en Yucatán, ambiente PMREM, sombras CSM,
// bruma azulada, oclusión ambiental GTAO, MSAA, viñeta mínima y tono ACES Filmic.
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { CSMShader } from "three/examples/jsm/csm/CSMShader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";

// Sol: 9:30 h (UTC-5) en Yucatán ≈ 8:40 h solar; elevación ~33°, azimut ~110° (ESE)
export const SUN = { elev: 33, azim: 110 };
export function sunDir() {
  const e = THREE.MathUtils.degToRad(SUN.elev);
  const a = THREE.MathUtils.degToRad(SUN.azim);
  // x = oriente, z = sur
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

export const FOG_COLOR = new THREE.Color().setRGB(0.4, 0.53, 0.76); // lineal

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.78;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

// Cielo propio: degradado azul con bruma en el horizonte (mismo color que la niebla), halo solar
// y cúmulos de buen tiempo; así el horizonte no muestra costuras con el terreno lejano.
const SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FS = /* glsl */ `
  uniform vec3 uSun, uZenith, uHorizon, uGround;
  uniform float uTime, uClouds, uDisc;
  varying vec3 vDir;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * n(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    float t = pow(clamp(y, 0.0, 1.0), 0.42);
    vec3 col = mix(uHorizon, uZenith, t);
    // dispersión hacia el sol y halo
    float mu = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.86, 0.66) * (pow(mu, 8.0) * 0.35 + pow(mu, 64.0) * 0.6) * (0.4 + 0.6 * (1.0 - t));
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.99985, 0.99995, mu) * 40.0 * uDisc;
    // cúmulos: capa plana proyectada
    if (y > 0.0 && uClouds > 0.0) {
      vec2 uv = d.xz / (y + 0.06) * 1.6 + vec2(uTime * 0.002, uTime * 0.0006);
      float c = fbm(uv * 0.9);
      float cov = smoothstep(0.56, 0.78, c) * uClouds;
      float shade = fbm(uv * 0.9 + uSun.xz * 0.06);
      vec3 cc = mix(vec3(0.74, 0.77, 0.82), vec3(1.25, 1.22, 1.16), clamp((c - shade) * 4.0 + 0.6, 0.0, 1.0));
      cc += vec3(1.0, 0.9, 0.75) * pow(mu, 6.0) * 0.4;
      float fade = smoothstep(0.02, 0.25, y);
      col = mix(col, mix(uHorizon, cc, 0.85), cov * fade);
    }
    if (y < 0.0) col = mix(uHorizon, uGround, smoothstep(0.0, -0.08, y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function makeSkyMaterial({ disc = 1, clouds = 1 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    uniforms: {
      uSun: { value: sunDir() },
      uZenith: { value: new THREE.Color(0.075, 0.2, 0.56) },
      uHorizon: { value: FOG_COLOR.clone() },
      uGround: { value: FOG_COLOR.clone().multiplyScalar(0.85) },
      uTime: { value: 0 },
      uClouds: { value: clouds },
      uDisc: { value: disc },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

export function createSky(scene, renderer) {
  const mat = makeSkyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.name = "cielo";
  sky.onBeforeRender = (r, sc, cam) => {
    sky.position.copy(cam.position);
    sky.updateMatrixWorld();
  };
  scene.add(sky);
  // ambiente PMREM a partir del mismo cielo (sin disco) con suelo cálido: rebote de tierra roja y caliza
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial({ disc: 0, clouds: 0.6 }));
  envScene.add(envSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.5, 0.38) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  const env = pmrem.fromScene(envScene, 0.03).texture;
  renderer.toneMapping = tm;
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00033);
  return { sky, env };
}

// El fragmento de luces de CSM está desfasado respecto a three r186 (le falta la tabla DFG de
// multidispersión y los metales salen negros): se injerta sólo su bloque direccional en el fragmento actual.
const CORE_LIGHTS = THREE.ShaderChunk.lights_fragment_begin;
function patchCSMChunk() {
  const csm = CSMShader.lights_fragment_begin;
  const a = csm.indexOf("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && defined( USE_CSM )");
  const b = csm.indexOf("#if ( NUM_RECT_AREA_LIGHTS > 0 )");
  const oa = CORE_LIGHTS.indexOf("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )");
  const ob = CORE_LIGHTS.indexOf("#if ( NUM_RECT_AREA_LIGHTS > 0 )");
  if (a < 0 || b < 0 || oa < 0 || ob < 0) return;
  THREE.ShaderChunk.lights_fragment_begin = CORE_LIGHTS.slice(0, oa) + csm.slice(a, b) + CORE_LIGHTS.slice(ob);
}

export function createCSM(scene, camera, quality) {
  const csm = new CSM({
    maxFar: quality === "alta" ? 900 : 600,
    cascades: 3,
    mode: "practical",
    parent: scene,
    shadowMapSize: quality === "alta" ? 2048 : 1024,
    lightDirection: sunDir().negate(),
    camera,
    lightIntensity: 3.6,
    lightNear: 1,
    lightFar: 4000,
    lightMargin: 250,
    shadowBias: -0.00012,
  });
  csm.fade = true;
  patchCSMChunk();
  for (const l of csm.lights) {
    l.shadow.normalBias = 0.035;
    l.color.setHSL(0.11, 0.35, 0.96);
  }
  return csm;
}

// Integra CSM con los parches propios de cada material
export function setupMaterials(scene, csm) {
  const done = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m || done.has(m) || m.userData.csmDone || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) continue;
      done.add(m);
      m.userData.csmDone = true;
      const hooks = m.userData.hooks || [];
      csm.setupMaterial(m);
      const csmHook = m.onBeforeCompile;
      m.onBeforeCompile = (s, r) => {
        csmHook(s, r);
        hooks.forEach((h) => h(s, r));
      };
      m.customProgramCacheKey = () => `${m.userData.hookKey || ""}|csm`;
      m.needsUpdate = true;
    }
  });
}

export function createComposer(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depth = new THREE.DepthTexture(size.x, size.y);
  depth.type = THREE.UnsignedIntType;
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
  const composer = new EffectComposer(renderer, rt);
  composer.renderTarget2.depthTexture = depth; // ambas memorias comparten profundidad para el GTAO
  const render = new RenderPass(scene, camera);
  composer.addPass(render);
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.setGBuffer(depth); // usa la profundidad del render principal (respeta el follaje recortado) y reconstruye normales
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.6, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.85;
  gtao.enabled = quality === "alta";
  composer.addPass(gtao);
  const bokeh = new BokehPass(scene, camera, { focus: 30, aperture: 0.00006, maxblur: 0.006 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());
  const vig = new ShaderPass(VignetteShader);
  vig.uniforms.offset.value = 0.95;
  vig.uniforms.darkness.value = 0.55;
  composer.addPass(vig);
  return { composer, gtao, bokeh, vig, rt, depth };
}
