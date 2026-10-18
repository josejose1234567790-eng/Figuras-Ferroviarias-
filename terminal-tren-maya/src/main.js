// Simulador visual 3D · Terminal ferroviaria de carga · Tren Maya — Etapa 1: patio estático.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createRenderer, createSky, createCSM, setupMaterials, createComposer } from "./render.js";
import { buildTerrain, buildCanopy, heightAt } from "./terrain.js";
import { buildTrack } from "./track.js";
import { buildVegetation, WIND } from "./vegetation.js";
import { buildFacilities } from "./buildings.js";
import { setAnisotropy } from "./textures.js";
import { INFO, PUESTOS } from "./info.js";
import { buildFleet } from "./consist.js";
import { buildPeople, Labels } from "./people.js";
import { buildScript } from "./guion.js";
import { Director } from "./director.js";
import { evalScene, vehPose } from "./scenario.js";
import { buildUI } from "./ui.js";
import { Exhaust } from "./smoke.js";
import { RAIL_TOP } from "./layout.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let quality = params.get("calidad") === "media" ? "media" : localStorageGet("tm-calidad") || "alta";

function localStorageGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function localStorageSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
}

const T0 = performance.now();
const progress = (t) => {
  console.log(`[${((performance.now() - T0) / 1000).toFixed(1)} s] ${t}`);
  const el = $("#carga-texto");
  if (el) el.textContent = t;
};
const tick = () => new Promise((r) => setTimeout(r, 30));

async function start() {
  const canvas = $("#escena");
  const renderer = createRenderer(canvas);
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.3, 30000);
  camera.filmGauge = 36;
  const pr = () => (quality === "alta" ? Math.min(devicePixelRatio, 1.5) : 1);
  renderer.setPixelRatio(pr());
  renderer.setSize(innerWidth, innerHeight);

  progress("Cielo y luz de las 9:30 h…");
  await tick();
  createSky(scene, renderer);
  const csm = createCSM(scene, camera, quality);

  progress("Terreno: k'ankab, caliza y pasto seco…");
  await tick();
  const terrain = buildTerrain(scene);
  buildCanopy(scene);

  progress("Vías, cambios y balasto…");
  await tick();
  const track = buildTrack(scene, quality);

  progress("Instalaciones del patio…");
  await tick();
  const facilities = buildFacilities(scene);

  progress("Equipo rodante…");
  await tick();
  const equipo = buildFleet(scene);

  progress("Personal…");
  await tick();
  const labels = new Labels(document.body);
  const personal = buildPeople(scene, labels);
  const humo = { [equipo.loco.id]: new Exhaust(scene, equipo.loco, equipo.types.LOCO.stack, { rate: 1 }), [equipo.yard.id]: new Exhaust(scene, equipo.yard, equipo.types.LOCO.stack, { rate: 0.6 }) };
  const occluders = [equipo.fleet.group];

  progress("Guion de la operación (19 escenas)…");
  await tick();
  const scenes = buildScript(equipo);

  progress("Selva baja y vegetación…");
  await tick();
  const veg = buildVegetation(scene, terrain.splatAt, quality);

  setupMaterials(scene, csm);
  const post = createComposer(renderer, scene, camera, quality);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 2;
  controls.maxDistance = 2500;
  controls.screenSpacePanning = false;

  const byId = {};
  for (const v of equipo.fleet.vehicles) byId[v.id] = v;
  const director = new Director({ scenes, fleet: equipo.fleet, byId, people: personal.people, turnouts: track.turnouts, refs: facilities.userData.refs, smokes: humo, camera, controls, post, quality: () => quality });
  director.update(0);
  for (let i = 0; i < 150; i++) Object.values(humo).forEach((h) => h.update(1 / 30));
  const uiTick = buildUI(director);
  controls.addEventListener("start", () => {
    if (director.mode !== "libre") {
      director.mode = "libre";
      director.emit();
    }
  });

  // Vistas fijas de cámara (focales en mm sobre sensor de 36 mm) para revisión y capturas
  const VIEWS = {
    dron: { pos: [-820, 210, 300], target: [-240, 0, -10], f: 28, nombre: "Dron: vista general" },
    entrada: { pos: [-905, 5.5, 14], target: [-700, 2, -4], f: 50, nombre: "Entrada y señal de mástil" },
    bascula: { pos: [-447, 2.1, -15], target: [-474, 0.8, -4], f: 35, nombre: "Báscula de vía" },
    cambio: { pos: [-548, 1.5, -6.6], target: [-500, 0.4, -14], f: 35, nombre: "Nivel de vía: cambios" },
    llenadera: { pos: [-62, 9, -12], target: [40, 5, -38], f: 35, nombre: "Llenadera" },
    servicios: { pos: [-170, 7, 30], target: [-40, 3, 6], f: 35, nombre: "Servicios: fosa, arenero y combustible" },
    patio: { pos: [-260, 26, -78], target: [-120, 0, -10], f: 35, nombre: "Haz de vías" },
    caseta: { pos: [-612, 3.2, 52], target: [-645, 3, 26], f: 35, nombre: "Caseta del jefe de patio y bodega" },
    selva: { pos: [-1040, 1.7, 110], target: [-900, 4, 40], f: 85, nombre: "Orilla de selva y cerca" },
  };
  let anim = null;
  const setView = (name, instant = true) => {
    const v = VIEWS[name];
    if (!v) return;
    director.mode = "libre";
    if (instant) {
      camera.position.set(...v.pos);
      controls.target.set(...v.target);
      camera.setFocalLength(v.f);
      camera.updateProjectionMatrix();
      controls.update();
    } else {
      anim = { t: 0, from: { p: camera.position.clone(), t: controls.target.clone(), f: camera.getFocalLength() }, to: { p: new THREE.Vector3(...v.pos), t: new THREE.Vector3(...v.target), f: v.f } };
    }
    document.querySelectorAll("[data-vista]").forEach((b) => b.classList.toggle("activo", b.dataset.vista === name));
  };



  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr());
    renderer.setSize(innerWidth, innerHeight);
    post.composer.setPixelRatio(pr());
    post.composer.setSize(innerWidth, innerHeight);
    post.gtao.setSize(innerWidth * pr(), innerHeight * pr());
    csm.updateFrustums();
  };
  addEventListener("resize", resize);

  const applyQuality = () => {
    post.gtao.enabled = quality === "alta";
    for (const m of track.clipMeshes) m.visible = quality === "alta";
    const size = quality === "alta" ? 2048 : 1024;
    for (const l of csm.lights) {
      if (l.shadow.mapSize.x !== size) {
        l.shadow.mapSize.set(size, size);
        l.shadow.map?.dispose();
        l.shadow.map = null;
      }
    }
    for (const m of veg.grassMeshes) m.visible = true;
    document.querySelectorAll("[data-calidad]").forEach((b) => b.classList.toggle("activo", b.dataset.calidad === quality));
    resize();
  };
  document.querySelectorAll("[data-calidad]").forEach((b) => {
    b.onclick = () => {
      quality = b.dataset.calidad;
      localStorageSet("tm-calidad", quality);
      applyQuality();
    };
  });

  // Captura en alta resolución (2x la pantalla)
  const screenshot = (scale = 2) => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setPixelRatio(scale);
    renderer.setSize(w, h);
    post.composer.setPixelRatio(scale);
    post.composer.setSize(w, h);
    post.gtao.setSize(w * scale, h * scale);
    csm.update();
    post.composer.render();
    const url = renderer.domElement.toDataURL("image/png");
    resize();
    const a = document.createElement("a");
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    a.download = `terminal-tren-maya-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
    a.href = url;
    a.click();
    return url;
  };
  $("#btn-captura").onclick = () => screenshot(2);
  $("#btn-etiquetas").onclick = (e) => {
    labels.visible = !labels.visible;
    e.currentTarget.classList.toggle("activo", labels.visible);
  };
  $("#btn-pantalla").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };
  document.addEventListener("fullscreenchange", () => document.body.classList.toggle("presentacion", !!document.fullscreenElement));

  // Ficha informativa al hacer clic
  const ray = new THREE.Raycaster();
  const pickables = [facilities, track.group, equipo.fleet.group, personal.group];
  let down = null;
  canvas.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  canvas.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(p, camera);
    const hits = ray.intersectObjects(pickables, true);
    let key = null;
    const card = $("#ficha");
    card.dataset.extra = "";
    for (const h of hits) {
      let po = h.object;
      while (po && !po.userData.person) po = po.parent;
      if (po) {
        key = "persona";
        card.dataset.extra = "";
        INFO.persona = { titulo: po.userData.person.nombre, texto: PUESTOS[po.userData.person.role] || "" };
        break;
      }
      const veh = equipo.fleet.vehicleFromHit(h);
      if (veh) {
        key = veh.type.info;
        card.dataset.extra = veh.id;
        break;
      }
      let o = h.object;
      while (o && !o.userData.info) o = o.parent;
      if (o) {
        key = o.userData.info;
        break;
      }
      if (h.object.name === "riel" || h.object.name === "durmiente" || h.object.name === "balasto") {
        key = "via";
        break;
      }
    }
    if (!key || !INFO[key]) {
      card.hidden = true;
      return;
    }
    $("#ficha-titulo").textContent = INFO[key].titulo + (card.dataset.extra ? ` · ${card.dataset.extra}` : "");
    $("#ficha-texto").textContent = INFO[key].texto;
    card.hidden = false;
  });
  $("#ficha-cerrar").onclick = () => ($("#ficha").hidden = true);

  if (params.get("vista")) setView(params.get("vista"));
  if (params.get("escena")) director.seek(Number(params.get("escena")) - 1, Number(params.get("t") || 0));
  director.snap = true;
  applyQuality();
  setupMaterials(scene, csm);

  const clock = new THREE.Clock();
  let frames = 0;
  let acc = 0;
  const fpsEl = $("#fps");
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    WIND.value += dt;
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / 2.2);
      const k = anim.t * anim.t * (3 - 2 * anim.t);
      camera.position.lerpVectors(anim.from.p, anim.to.p, k);
      controls.target.lerpVectors(anim.from.t, anim.to.t, k);
      camera.setFocalLength(anim.from.f + (anim.to.f - anim.from.f) * k);
      if (anim.t >= 1) anim = null;
    }
    director.update(dt);
    uiTick();
    if (director.mode === "libre") controls.update();
    labels.update(camera, occluders);
    const gy = heightAt(camera.position.x, camera.position.z) + 1.2;
    if (camera.position.y < gy) camera.position.y = gy;
    csm.update();
    post.composer.render();
    frames++;
    acc += dt;
    if (acc > 1) {
      fpsEl.textContent = `${Math.round(frames / acc)} fps`;
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(loop);
  };
  progress("Compilando sombreadores…");
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  progress("Primer cuadro…");
  $("#carga").classList.add("oculto");
  if (params.get("sinui")) document.body.classList.add("sin-ui");
  if (params.get("captura")) {
    // modo de captura: sólo dibuja cuando se pide (navegadores sin GPU)
    window.TM_RENDER = (dt = 0) => {
      director.update(dt);
      uiTick();
      if (director.mode === "libre") controls.update();
      labels.forceOcclusion = true;
      labels.update(camera, occluders);
      csm.update();
      post.composer.render();
    };
    window.TM_RENDER();
  } else loop();
  progress("Listo");

  occluders.push(facilities);
  labels.forceOcclusion = true;
  window.TM = { evalScene, vehPose, director, scenes, personal, labels, equipo, THREE, scene, camera, controls, renderer, setView, screenshot, VIEWS, csm, post, facilities, track, ready: true };
}

start().catch((e) => {
  console.error(e);
  console.log("[pila] " + e.stack);
  progress(`Error al iniciar: ${e.message}`);
});
