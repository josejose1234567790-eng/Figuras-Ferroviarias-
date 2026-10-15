// Página: escena, controles y bucle. Todas las cifras salen de window.MODELO.
(() => {
  const { CRUCE, AFORO, analisis } = window.MODELO;
  const $ = (id) => document.getElementById(id);
  const S = window.crearEscena($("view"));

  // Accesos a lo largo del Periférico, con su etiqueta.
  const accLabels = { sur: [], norte: [] };
  for (const a of CRUCE.accesos.sur) {
    const z = -a.d;
    if (a.nombre === "Semáforo") S.signalGantry(z);
    else S.accessRoad(z, "west");
    const L = S.label(`${a.nombre} · ${a.d.toLocaleString("es-MX")} m`, [-46, 4, z], "lbl-acc lbl-sur");
    L.maxDist = 1700;
    accLabels.sur.push({ a, L });
  }
  for (const a of CRUCE.accesos.norte) {
    const z = a.d;
    S.accessRoad(z, "east");
    const L = S.label(`${a.nombre} · ${a.d.toLocaleString("es-MX")} m`, [46, 4, z], "lbl-acc lbl-norte");
    L.maxDist = 1700;
    accLabels.norte.push({ a, L });
  }
  const lblLat = S.label("Laterales: sin carga en el cálculo (supuesto conservador)", [-36.5, 1.5, -95], "lbl-note");
  lblLat.maxDist = 260;

  // Vistas
  const viewBtns = document.querySelectorAll(".views button");
  viewBtns.forEach((b) =>
    b.addEventListener("click", () => {
      viewBtns.forEach((x) => x.classList.toggle("on", x === b));
      S.goTo(b.dataset.view);
    }),
  );

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    S.stepCamera(dt);
    S.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__app = { S, analisis, AFORO };
})();
