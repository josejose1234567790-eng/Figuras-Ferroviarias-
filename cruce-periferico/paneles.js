// Paneles: cierre desglosado, resultados por sentido, franja de 24 h y tabla comparativa.
// Todo se calcula con window.MODELO; aquí solo se da formato.
(() => {
  const { CRUCE, AFORO, analisis, analisisPorHora } = window.MODELO;
  const $ = (id) => document.getElementById(id);
  const fmt = (x, d = 0) => x.toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
  const min1 = (s) => (isFinite(s) ? fmt(Math.round((s / 60) * 10) / 10, 1) : "—");
  const sec = (s) => fmt(Math.round(s));
  const hh = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
  const inRanges = (h, ranges) => ranges.some(([a, b]) => h < b && h + 1 > a);
  const within = (h, ranges) => ranges.some(([a, b]) => h >= a && h + 1 <= b);
  const NAME = {
    sur: ["Sentido sur", "Hacia el sur · fila en el lado norte de la vía"],
    norte: ["Sentido norte", "Hacia el norte · fila en el lado sur de la vía"],
  };

  function closure(R) {
    const c = R.cierre;
    $("cierreTot").textContent = `${min1(c.total)} min`;
    $("cPre").textContent = `${sec(c.preaviso)} s`;
    $("cPass").textContent = `${sec(c.paso)} s`;
    $("cPassTxt").textContent = `(${fmt(c.largo)} m + ${CRUCE.anchoCruce} m) ÷ ${R.vel} km/h`;
    $("cRe").textContent = `${sec(c.reapertura)} s`;
    $("cLost").textContent = `${CRUCE.tiempoPerdido} s → bloqueo ${sec(c.bloqueo)} s`;
    $("cbPre").style.flex = c.preaviso;
    $("cbPass").style.flex = c.paso;
    $("cbRe").style.flex = c.reapertura;
  }

  function hourInfo(h) {
    $("horaTxt").textContent = `${hh(h)}–${hh((h + 1) % 24)}`;
    const tags = [];
    if (inRanges(h, AFORO.pico)) tags.push(["pico", "hora pico"]);
    if (within(h, AFORO.bajo)) tags.push(["bajo", "tránsito bajo"]);
    if (within(h, AFORO.ventanas)) tags.push(["ventana", "ventana solicitada"]);
    const el = $("horaTag");
    el.innerHTML = "";
    el.className = "";
    for (const [k, t] of tags) {
      const s = document.createElement("em");
      s.className = "tag";
      s.dataset.k = k;
      s.textContent = t;
      el.appendChild(s);
      el.append(" ");
    }
  }

  function direction(R, dir) {
    const r = R[dir];
    const [name, sub] = NAME[dir];
    const sat = r.saturado;
    const stat = (label, value, unit, hot = false) =>
      `<div class="stat${hot ? " hot" : ""}"><span>${label}</span><b>${value}</b><small>${unit}</small></div>`;
    const first = r.accesos[0];
    const accRows = r.accesos
      .map((a) => {
        const st = a.alcanzado ? `<span class="bad">la fila lo rebasa por ${fmt(Math.round(a.excede))} m</span>` : `<span class="ok">libre · faltan ${fmt(Math.round(a.d - r.largoFila))} m</span>`;
        return `<div class="acc-row"><span>${a.nombre} <b>${fmt(a.d)} m</b></span>${st}</div>`;
      })
      .join("");
    $(dir === "sur" ? "resSur" : "resNorte").innerHTML = `
      <h3><span class="dot"></span>${name}</h3>
      <p class="sub">${sub}. Llegadas ${fmt(Math.round(r.llegadasH))} veh/h (${fmt(r.reparto * 100, 1)} % del aforo) · salida a flujo de saturación ${fmt(Math.round(R.derivados.salidaH))} veh/h.</p>
      <div class="stats">
        ${stat("Fila al reabrir", fmt(r.fila), "vehículos")}
        ${stat("Largo de la fila", fmt(Math.round(r.largoFila)), "metros desde la vía", first.alcanzado)}
        ${stat("Vehículos detenidos", sat ? "—" : fmt(Math.round(r.detenidos)), "en todo el evento")}
        ${stat("Se disipa en", sat ? "—" : min1(r.disipacion), "min después del arranque")}
        ${stat("Espera del primero", min1(r.esperaPrimero), "min (= cierre)")}
        ${stat("Espera del último", min1(r.esperaUltimo), "min (3 s + fila ÷ salida)")}
      </div>
      ${sat ? `<p class="warn">Las llegadas superan la salida: hay saturación de fondo, que no es atribuible al tren.</p>` : ""}
      <div class="acc">${accRows}</div>`;
  }

  // ---------------- Franja de 24 h ----------------
  const NS = "http://www.w3.org/2000/svg";
  function dayStrip(R, P) {
    const rows = analisisPorHora({ aforo: P.aforo, vel: P.vel, carros: P.carros });
    const W = 960;
    const H = 230;
    const L = 62;
    const Rr = 10;
    const top = 26;
    const base = 168;
    const cw = (W - L - Rr) / 24;
    const X = (h) => L + h * cw;
    const maxM = Math.max(400, ...rows.map((r) => Math.max(r.sur.largoFila, r.norte.largoFila)));
    const ymax = Math.ceil(maxM / 200) * 200;
    const Y = (m) => base - (m / ymax) * (base - top);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Largo de la fila por hora del día en cada sentido, con horas pico, tránsito bajo y ventanas de operación">`;
    // fondos: pico y tránsito bajo
    for (const [a, b] of AFORO.pico) s += `<rect x="${X(a)}" y="${top - 14}" width="${X(b) - X(a)}" height="${base - top + 14}" fill="var(--peak)" opacity="0.75"/>`;
    for (const [a, b] of AFORO.bajo) s += `<rect x="${X(a)}" y="${top - 14}" width="${X(b) - X(a)}" height="${base - top + 14}" fill="var(--low)" opacity="0.85"/>`;
    // ejes y rejilla
    for (let m = 0; m <= ymax; m += 200) {
      s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(m)}" y2="${Y(m)}" stroke="var(--line)" stroke-width="1"/>`;
      s += `<text x="${L - 6}" y="${Y(m) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${fmt(m)}</text>`;
    }
    s += `<text x="${L - 6}" y="${top - 18}" text-anchor="end" font-size="10.5" fill="var(--ink-3)">m</text>`;
    // accesos más cercanos
    const accS = CRUCE.accesos.sur[0];
    const accN = CRUCE.accesos.norte[0];
    for (const [a, col] of [[accS, "var(--sur)"], [accN, "var(--norte)"]]) {
      if (a.d > ymax) continue;
      s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(a.d)}" y2="${Y(a.d)}" stroke="${col}" stroke-dasharray="4 4" stroke-width="1.2"/>`;
      s += `<text x="${W - Rr - 2}" y="${Y(a.d) - 4}" text-anchor="end" font-size="10.5" fill="${col}">${a.nombre} ${fmt(a.d)} m</text>`;
    }
    // barras por hora
    rows.forEach((r, h) => {
      const sel = h === P.hora;
      const bw = cw * 0.32;
      const xs = X(h) + cw * 0.16;
      const xn = xs + bw + 1;
      s += `<g class="hr" data-h="${h}"><rect class="hit" x="${X(h)}" y="${top - 14}" width="${cw}" height="${H - top}" fill="transparent"/>`;
      if (sel) s += `<rect x="${X(h) + 1}" y="${top - 14}" width="${cw - 2}" height="${base - top + 14}" fill="none" stroke="var(--ink)" stroke-width="2" rx="3"/>`;
      s += `<rect x="${xs}" y="${Y(r.sur.largoFila)}" width="${bw}" height="${base - Y(r.sur.largoFila)}" fill="var(--sur)" rx="1.5"/>`;
      s += `<rect x="${xn}" y="${Y(r.norte.largoFila)}" width="${bw}" height="${base - Y(r.norte.largoFila)}" fill="var(--norte)" rx="1.5"/>`;
      s += `<text x="${X(h) + cw / 2}" y="${base + 14}" text-anchor="middle" font-size="10.5" fill="${sel ? "var(--ink)" : "var(--ink-3)"}" font-weight="${sel ? 700 : 400}">${String(h).padStart(2, "0")}</text>`;
      s += `<title>${hh(h)}–${hh((h + 1) % 24)}: fila sur ${fmt(Math.round(r.sur.largoFila))} m (${fmt(r.sur.fila)} veh), norte ${fmt(Math.round(r.norte.largoFila))} m (${fmt(r.norte.fila)} veh)</title></g>`;
    });
    s += `<line x1="${L}" x2="${W - Rr}" y1="${base}" y2="${base}" stroke="var(--ink-3)"/>`;
    // ventanas de operación solicitadas
    const wy = base + 24;
    s += `<text x="${L - 6}" y="${wy + 9}" text-anchor="end" font-size="10.5" fill="var(--win)">ventanas</text>`;
    for (const [a, b] of AFORO.ventanas) {
      s += `<rect x="${X(a) + 1}" y="${wy}" width="${X(b) - X(a) - 2}" height="12" rx="3" fill="var(--win)"/>`;
    }
    for (const [a, b, lbl] of [[9, 12, "09:00–12:00"], [15, 17, "15:00–17:00"], [22, 24, "22:00 →"], [0, 5, "→ 05:00"]]) {
      s += `<text x="${(X(a) + X(b)) / 2}" y="${wy + 26}" text-anchor="middle" font-size="10.5" fill="var(--win)" font-weight="600">${lbl}</text>`;
    }
    s += `</svg>`;
    $("dayStrip").innerHTML = s;
  }
  $("dayStrip").addEventListener("click", (e) => {
    const g = e.target.closest(".hr");
    if (!g || $("hora").disabled) return;
    window.__app.setHour(Number(g.dataset.h));
  });

  // ---------------- Tabla comparativa ----------------
  function table(R, P) {
    const conf = [];
    for (const carros of [20, 33]) for (const vel of CRUCE.velocidades) conf.push({ carros, vel });
    $("cmpTitle").textContent = `Comparación a las ${hh(P.hora)} con ${fmt(P.aforo)} veh/día`;
    const head = `<thead><tr><th>Tren · velocidad</th><th>Cierre</th><th class="c-sur">Fila sur</th><th class="c-sur">Largo sur</th><th class="c-sur">Detenidos sur</th><th class="c-sur">Disipación sur</th><th class="c-norte">Fila norte</th><th class="c-norte">Largo norte</th><th class="c-norte">Detenidos norte</th><th class="c-norte">Disipación norte</th></tr></thead>`;
    const body = conf
      .map(({ carros, vel }) => {
        const r = analisis({ aforo: P.aforo, hora: P.hora, vel, carros });
        const sel = carros === P.carros && vel === P.vel;
        const len = (x, dir) => {
          const over = x.largoFila - CRUCE.accesos[dir][0].d;
          return over > 0 ? `<span class="bad">${fmt(Math.round(x.largoFila))} m</span>` : `${fmt(Math.round(x.largoFila))} m`;
        };
        return `<tr class="${sel ? "sel" : ""}" data-carros="${carros}" data-vel="${vel}">
          <td>${carros} carros (${fmt(r.cierre.largo)} m) · ${vel} km/h${vel === 15 ? " ·  estudio" : ""}</td>
          <td><b>${min1(r.cierre.total)} min</b></td>
          <td>${fmt(r.sur.fila)} veh</td><td>${len(r.sur, "sur")}</td><td>${r.sur.saturado ? "—" : fmt(Math.round(r.sur.detenidos))}</td><td>${min1(r.sur.disipacion)} min</td>
          <td>${fmt(r.norte.fila)} veh</td><td>${len(r.norte, "norte")}</td><td>${r.norte.saturado ? "—" : fmt(Math.round(r.norte.detenidos))}</td><td>${min1(r.norte.disipacion)} min</td>
        </tr>`;
      })
      .join("");
    const foot = `<tfoot><tr><td colspan="10" style="text-align:left;color:var(--ink-3);font-size:12px;white-space:normal">En rojo, la fila que rebasa el acceso más cercano (${fmt(CRUCE.accesos.sur[0].d)} m en el lado norte, ${fmt(CRUCE.accesos.norte[0].d)} m en el lado sur). Toca una fila para verla en la simulación.</td></tr></tfoot>`;
    $("cmpTable").innerHTML = head + `<tbody>${body}</tbody>` + foot;
  }
  $("cmpTable").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-vel]");
    if (!tr || $("go").disabled) return;
    document.querySelector(`.seg[data-ctl="carros"] button[data-v="${tr.dataset.carros}"]`).click();
    document.querySelector(`.seg[data-ctl="vel"] button[data-v="${tr.dataset.vel}"]`).click();
  });

  window.__panels = (R, P) => {
    closure(R);
    hourInfo(P.hora);
    direction(R, "sur");
    direction(R, "norte");
    dayStrip(R, P);
    table(R, P);
  };
})();
