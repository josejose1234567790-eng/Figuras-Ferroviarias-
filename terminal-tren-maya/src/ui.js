// Interfaz de la operación: ficha de escena, reloj y contadores, controles de reproducción,
// lista de escenas y modos de cámara. Sobria, semitransparente y sin tapar la escena.
const $ = (s) => document.querySelector(s);
const hms = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
const hora = (s) => {
  const t = 9.5 * 3600 + s;
  const h = Math.floor(t / 3600) % 24;
  const m = Math.floor((t % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} h`;
};
const titulo = (sc) => {
  const a = sc.meta.actividad.split(/[;:.]/)[0];
  return a.length > 70 ? a.slice(0, 68) + "…" : a;
};

export function buildUI(D) {
  // lista de escenas
  const list = $("#lista-escenas");
  let fase = "";
  D.scenes.forEach((sc, i) => {
    if (sc.meta.fase !== fase) {
      fase = sc.meta.fase;
      const h = document.createElement("div");
      h.className = "lista-fase";
      h.innerHTML = `${fase}${sc.meta.propuesto ? ' <span class="prop">propuesto</span>' : ""}`;
      list.appendChild(h);
    }
    const b = document.createElement("button");
    b.className = "lista-item";
    b.dataset.i = i;
    b.innerHTML = `<b>${sc.meta.paso}</b><span>${titulo(sc)}</span>`;
    b.onclick = () => {
      D.seek(i, 0);
      D.playing = true;
      sync();
    };
    list.appendChild(b);
  });
  $("#btn-escenas").onclick = () => $("#panel-escenas").classList.toggle("abierto");
  $("#btn-play").onclick = () => {
    if (!D.playing && D.i === D.scenes.length - 1 && D.t >= D.scene.dur) D.seek(0, 0);
    D.playing = !D.playing;
    sync();
  };
  $("#btn-prev").onclick = () => {
    D.prev();
    sync();
  };
  $("#btn-next").onclick = () => {
    D.next();
    sync();
  };
  document.querySelectorAll("[data-vel]").forEach((b) => {
    b.onclick = () => {
      D.speed = Number(b.dataset.vel);
      sync();
    };
  });
  document.querySelectorAll("[data-cam]").forEach((b) => {
    b.onclick = () => {
      D.mode = b.dataset.cam;
      sync();
    };
  });
  const bar = $("#barra");
  bar.onclick = (e) => {
    const r = bar.getBoundingClientRect();
    D.seek(D.i, ((e.clientX - r.left) / r.width) * D.scene.dur);
    sync();
  };
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      $("#btn-play").click();
    } else if (e.code === "ArrowRight") $("#btn-next").click();
    else if (e.code === "ArrowLeft") $("#btn-prev").click();
  });

  function sync() {
    const sc = D.scene;
    const m = sc.meta;
    $("#esc-fase").textContent = m.fase;
    $("#esc-prop").hidden = !m.propuesto;
    $("#esc-paso").textContent = `Paso ${m.paso} de ${D.scenes.length}`;
    $("#esc-puesto").textContent = m.puesto;
    $("#esc-actividad").textContent = m.actividad;
    $("#esc-tiempo").textContent = m.tiempo;
    $("#esc-doc").textContent = m.documento;
    $("#btn-play").textContent = D.playing ? "❚❚ Pausa" : "▶ Reproducir";
    $("#btn-play").classList.toggle("activo", D.playing);
    document.querySelectorAll("[data-vel]").forEach((b) => b.classList.toggle("activo", Number(b.dataset.vel) === D.speed));
    document.querySelectorAll("[data-cam]").forEach((b) => b.classList.toggle("activo", b.dataset.cam === D.mode));
    document.querySelectorAll(".lista-item").forEach((b) => b.classList.toggle("activo", Number(b.dataset.i) === D.i));
  }
  D.on(sync);
  sync();

  // actualización por cuadro (reloj, barra, contadores)
  return () => {
    const W = D.W;
    $("#reloj").textContent = hms(D.clock());
    $("#hora").textContent = hora(D.clock());
    $("#barra-lleno").style.width = `${(100 * D.t) / D.scene.dur}%`;
    $("#barra-t").textContent = `${hms(D.t)} / ${hms(D.scene.dur)}`;
    $("#c-recibidos").textContent = W.cnt.recibidos;
    $("#c-pesados").textContent = W.cnt.pesados;
    $("#c-cargados").textContent = W.cnt.cargados;
    $("#c-despachados").textContent = W.cnt.despachados;
  };
}
