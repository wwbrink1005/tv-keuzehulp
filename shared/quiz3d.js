// Gedeelde motor voor de 3D-vragenpagina's (…/vragen-test/).
//
// Elke keuzehulp levert een config met zijn vragen, welke render(s) bij een
// antwoord horen en wat er over het beeld getekend wordt. De motor regelt de
// rest: vraagkaart, validatie, beeldwissel, transparante lagen, mobiele
// uitsnede, uitleg-chip, maatlijnen en labels.
//
// De renders komen uit Blender met een camera die recht op de achterwand kijkt
// (zonder kanteling, kadrering via lens-shift). Daardoor is project() hieronder
// exact dezelfde projectie als in Blender en vallen lijnen en labels precies op
// het object in de render.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function makeCamera({ imgW = 2000, imgH = 1015, lens = 22, sensor = 36, shiftX = -0.12, shiftY = -0.08, camZ = 1.62, camY, camX = 0 }) {
  const aspect = imgW / imgH, f = lens / sensor;
  return {
    imgW, imgH,
    project(x, y, z) {
      const depth = y - camY;
      return { u: 0.5 - shiftX + f * (x - camX) / depth, v: 0.5 + shiftY * aspect - f * aspect * (z - camZ) / depth };
    },
  };
}

// Maatlijn tussen twee wereldpunten met eindstreepjes en een label in het midden.
export function dimLine(ctx, a, b, label, side = 1) {
  const pa = ctx.toPx(...a), pb = ctx.toPx(...b);
  const horiz = Math.abs(pa.y - pb.y) < Math.abs(pa.x - pb.x);
  const t = 5;
  let svg = `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`;
  svg += horiz
    ? `<line x1="${pa.x}" y1="${pa.y - t}" x2="${pa.x}" y2="${pa.y + t}"/><line x1="${pb.x}" y1="${pb.y - t}" x2="${pb.x}" y2="${pb.y + t}"/>`
    : `<line x1="${pa.x - t}" y1="${pa.y}" x2="${pa.x + t}" y2="${pa.y}"/><line x1="${pb.x - t}" y1="${pb.y}" x2="${pb.x + t}" y2="${pb.y}"/>`;
  const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
  const style = horiz ? `left:${mx}px;top:${my - 8}px` : `left:${mx + side * 44}px;top:${my + 12}px`;
  return { svg, html: `<div class="tag is-on" style="${style}">${label}</div>` };
}

// Zet een element van w×h px in perspectief op vier schermpunten (linksboven,
// rechtsboven, rechtsonder, linksonder), bijv. beeld op een schuin laptopscherm.
// Het element moet position:absolute; left:0; top:0; transform-origin:0 0 hebben.
export function placeQuad(el, w, h, [p0, p1, p2, p3]) {
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + hh * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + hh * p3.y, f = p0.y;
  el.style.width = `${w}px`; el.style.height = `${h}px`;
  el.style.transform = `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${c},${f},0,1)`;
}

// Labels bij punten op een object: punten gelijk verdeeld over [zBot, zTop] (in
// de opgegeven volgorde, bovenste eerst), labels in een kolom rechts van edgeX
// met een lijntje naar hun punt, zodat ze nooit over elkaar vallen.
export function spotColumn(ctx, points, { zBot, zTop, edgeX, edgeY }) {
  let svg = "", html = "";
  if (!points.length) return { svg, html };
  const n = points.length;
  const placed = points.map((p, i) => {
    const z = zTop - (i + 0.5) * (zTop - zBot) / n;   // bij één punt: midden van het bereik
    return { ...p, px: ctx.toPx(p.x, p.y, z) };
  });
  // labels rechts van het object; is daar geen ruimte, dan links ervan (rechts uitgelijnd)
  let labelX = ctx.toPx(edgeX, edgeY, 1).x + 22;
  const flip = labelX > ctx.width - 250;
  if (flip) labelX = Math.min(...placed.map(d => d.px.x)) - 22;
  const gap = ctx.mobile ? 26 : 32;
  const ys = placed.map(d => d.px.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  const overflow = ys[ys.length - 1] - (ctx.height - 20);
  if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  placed.forEach((d, i) => {
    svg += `<line x1="${d.px.x}" y1="${d.px.y}" x2="${labelX}" y2="${ys[i]}" class="leader"/>`;
    html += `<div class="spot is-on" style="left:${d.px.x}px;top:${d.px.y}px"></div>`;
    const pos = flip ? `right:${ctx.width - labelX}px` : `left:${labelX}px`;
    html += `<div class="spot-label is-on" style="${pos};top:${ys[i]}px">${d.label}</div>`;
  });
  return { svg, html };
}

export function createQuiz3D(cfg) {
  const cam = cfg.camera;
  const stage = $("#stage"), scene = $("#scene"), caption = $("#caption");
  const fx = $("#fx"), tags = $("#tags");
  const rooms = [$("#roomA"), $("#roomB")];
  const mobileQuery = window.matchMedia("(max-width: 900px)");
  const st = { q: 0, ...cfg.state };
  // aantal vragen mag afhangen van de antwoorden (bijv. een vraag die alleen bij een tower bestaat)
  const steps = () => (typeof cfg.steps === "function" ? cfg.steps(st) : cfg.steps);

  // transparante lagen (bijv. soundbar, subwoofer) boven de basisrender
  const layerBox = document.createElement("div");
  layerBox.className = "layers";
  rooms[1].after(layerBox);
  const layerImgs = new Map();

  const cache = new Map();
  const loadImg = src => {
    if (!cache.has(src)) cache.set(src, new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src; }));
    return cache.get(src);
  };

  cfg.setup?.(scene, st);

  // ───────── beeld: cover-uitsnede, op mobiel gericht op het onderwerp ─────────
  function layout() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const mobile = mobileQuery.matches;
    // focus: op mobiel via cfg.focus, op desktop optioneel via cfg.focusDesktop (bijv.
    // inzoomen op een klein object). anchorX = waar in het podium het punt komt.
    const focus = (mobile ? cfg.focus?.(st) : cfg.focusDesktop?.(st)) ?? null;
    const zoom = focus?.zoom ?? 1;
    const s = Math.max(sw / cam.imgW, sh / cam.imgH) * zoom;
    const dw = cam.imgW * s, dh = cam.imgH * s;
    let fu = cfg.focusU ?? 0.63, fv = 0.47, ax = 0.5;
    if (focus) { const c = cam.project(focus.x, focus.y, focus.z); fu = c.u; fv = c.v; ax = focus.anchorX ?? 0.5; }
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    return { x0: clamp(sw * ax - fu * dw, sw - dw, 0), y0: clamp(sh / 2 - fv * dh, sh - dh, 0), dw, dh, sw, sh, mobile };
  }

  let roomState = { name: null, front: 0 };
  function setRoom(name) {
    if (roomState.name === name) return;
    roomState.name = name;
    loadImg(cfg.imgPath(name)).then(ok => {
      if (!ok || roomState.name !== name) return;
      const back = rooms[1 - roomState.front], front = rooms[roomState.front];
      back.src = cfg.imgPath(name);
      back.classList.add("is-on"); front.classList.remove("is-on");
      roomState.front = 1 - roomState.front;
      $("#loading")?.classList.add("is-done");
    });
  }

  function setLayers(list, L) {
    // laag = "naam" of { name, opacity, filter } (filter bijv. om een daglicht-render te verdonkeren)
    const want = new Map(list.map(l => (typeof l === "string" ? [l, { opacity: 1 }] : [l.name, { opacity: l.opacity ?? 1, filter: l.filter }])));
    want.forEach((op, name) => {
      if (!layerImgs.has(name)) {
        const img = document.createElement("img");
        img.className = "room layer"; img.alt = ""; img.decoding = "async";
        layerBox.appendChild(img);
        layerImgs.set(name, img);
        loadImg(cfg.imgPath(name)).then(ok => { if (ok) { img.src = cfg.imgPath(name); render(); } });
      }
    });
    layerImgs.forEach((img, name) => {
      Object.assign(img.style, { left: `${L.x0}px`, top: `${L.y0}px`, width: `${L.dw}px`, height: `${L.dh}px` });
      const on = want.has(name) && img.src;
      img.style.opacity = on ? String(want.get(name).opacity) : "0";
      img.style.filter = on ? (want.get(name).filter ?? "") : "";
    });
  }

  // ───────── uitleg-chip: op desktop in het beeld, op mobiel in de kaart ─────────
  // cfg.captionInCard: uitleg ook op desktop in de kaart (voor scènes waar het onderwerp
  // laag en rechts in beeld staat, zodat de uitleg er nooit overheen valt)
  function placeCaption() {
    if (mobileQuery.matches || cfg.captionInCard) { if (caption.parentElement !== $("#card")) $("#step").after(caption); }
    else if (caption.parentElement !== stage) stage.insertBefore(caption, $("#loading"));
  }
  function setCaption() {
    const [t, s] = cfg.caption(st) ?? ["", ""];
    const html = `<strong>${t}</strong>${s}`;
    caption.style.display = cfg.hideCaption?.(st, mobileQuery.matches) ? "none" : "";
    if (caption.innerHTML === html) return;
    caption.classList.add("is-swap");
    setTimeout(() => { caption.innerHTML = html; caption.classList.remove("is-swap"); }, 160);
  }

  // cfg.captionTop: uitleg-chip op desktop vast rechtsboven i.p.v. rechtsonder (voor scènes
  // waar het onderwerp laag in beeld staat, zoals de stofzuigers); true of een functie van de state
  function placeCaptionCorner() {
    const top = typeof cfg.captionTop === "function" ? cfg.captionTop(st) : !!cfg.captionTop;
    caption.classList.toggle("is-top", top && !mobileQuery.matches);
  }

  function render() {
    const L = layout();
    rooms.forEach(img => Object.assign(img.style, { left: `${L.x0}px`, top: `${L.y0}px`, width: `${L.dw}px`, height: `${L.dh}px` }));
    const [base, ...layers] = cfg.images(st);
    setRoom(base);
    setLayers(layers, L);
    const ctx = {
      st, L, mobile: L.mobile, width: L.sw, height: L.sh, project: cam.project,
      toPx: (x, y, z) => { const p = cam.project(x, y, z); return { x: L.x0 + p.u * L.dw, y: L.y0 + p.v * L.dh }; },
    };
    const o = cfg.overlays?.(ctx) ?? {};
    fx.innerHTML = o.svg ?? "";
    tags.innerHTML = o.html ?? "";
    cfg.afterRender?.(ctx);
    setCaption();
    placeCaptionCorner();
    $("#progress").style.width = `${((st.q + 1) / steps()) * 100}%`;
  }

  // ───────── vraagkaart ─────────
  function renderQuestion() {
    const Q = cfg.question(st);
    const body = $("#qBody");
    body.classList.add("is-out");
    setTimeout(() => {
      $("#step").textContent = `Vraag ${st.q + 1} van ${steps()}`;
      const sel = st[Q.id];
      const checked = v => Array.isArray(sel) ? sel.includes(v) : sel === v;
      const opts = Q.options.filter(o => !o.when || o.when(st));
      body.innerHTML = `
        <h2 class="q-title">${Q.title}</h2>
        ${Q.sub ? `<p class="q-sub">${typeof Q.sub === "function" ? Q.sub(st) : Q.sub}</p>` : ""}
        <button class="why" type="button" aria-expanded="false">Waarom deze vraag? <span aria-hidden="true">›</span></button>
        <p class="why-text">${Q.why}</p>
        <div class="answers ${Q.two ? "two" : ""}">
          ${opts.map(o => `
            <label class="opt ${Q.type === "check" ? "is-check" : ""}">
              <input type="${Q.type === "check" ? "checkbox" : "radio"}" name="${Q.id}" value="${o.v}" ${checked(o.v) ? "checked" : ""}>
              <span class="dot" aria-hidden="true"></span>
              <span>${o.label}</span>
              ${o.badge ? `<span class="advised">${o.badge}</span>` : o.price ? `<span class="price">${o.price}</span>` : ""}
            </label>`).join("")}
        </div>
        <p class="hint" id="hint"></p>
        <div class="nav">
          ${st.q > 0 ? `<button class="btn btn-back" type="button" id="back">Terug</button>` : ""}
          <button class="btn btn-next" type="button" id="next">${st.q === steps() - 1 ? "Bekijk mijn advies" : "Volgende"}</button>
        </div>`;
      body.classList.remove("is-out");
      const why = $(".why", body), whyText = $(".why-text", body);
      why.addEventListener("click", () => { const o = whyText.classList.toggle("is-open"); why.setAttribute("aria-expanded", o); });
      $$("input", body).forEach(i => i.addEventListener("change", () => onAnswer(Q, i)));
      $("#next", body).addEventListener("click", next);
      $("#back", body)?.addEventListener("click", back);
    }, 150);
  }

  function onAnswer(Q, inp) {
    const hint = $("#hint");
    hint.textContent = "";
    if (Q.type === "radio") {
      st[Q.id] = inp.value;
    } else {
      let arr = $$(`input[name="${Q.id}"]:checked`).map(i => i.value);
      const ex = Q.exclusive;
      if (ex && inp.checked && inp.value === ex) arr = [ex];
      else if (ex && inp.checked) arr = arr.filter(v => v !== ex);
      if (Q.max && arr.filter(v => v !== ex).length > Q.max) {
        arr = arr.filter(v => v !== inp.value);
        hint.textContent = `Je kunt maximaal ${Q.max} antwoorden kiezen.`;
      }
      $$(`input[name="${Q.id}"]`).forEach(i => { i.checked = arr.includes(i.value); });
      st[Q.id] = arr;
    }
    cfg.onAnswer?.(st, Q.id, inp.value);
    render();
  }

  function next() {
    const Q = cfg.question(st);
    const v = st[Q.id];
    if (v === null || v === undefined || (Array.isArray(v) && !v.length)) {
      $("#hint").textContent = Q.type === "check" ? "Kies minimaal 1 antwoord." : "Kies een antwoord om verder te gaan.";
      return;
    }
    if (st.q === steps() - 1) {
      const btn = $("#next");
      btn.disabled = true; btn.textContent = "Advies berekenen…";
      return cfg.finish(st);
    }
    cfg.onNext?.(st, Q.id);
    st.q += 1;
    renderQuestion(); render();
  }

  function back() {
    const Q = cfg.question(st);
    st[Q.id] = Array.isArray(st[Q.id]) ? [] : null;
    st.q -= 1;
    cfg.onBack?.(st);
    renderQuestion(); render();
  }

  // Alleen voor het testen van losse stappen: #q=2&plaatsing=vrijstaand&extra=a,b
  if (location.hash.length > 1) {
    const h = new URLSearchParams(location.hash.slice(1));
    h.forEach((v, k) => {
      if (k === "q") return;
      st[k] = Array.isArray(cfg.state[k]) ? v.split(",").filter(Boolean) : v;
    });
    cfg.onHash?.(st);
    st.q = Math.max(0, Math.min(steps() - 1, (parseInt(h.get("q"), 10) || 1) - 1));
  }

  placeCaption();
  mobileQuery.addEventListener("change", () => { placeCaption(); render(); });
  renderQuestion();
  render();
  window.addEventListener("load", () => {
    const names = cfg.preload ?? [];
    let i = 0;
    const nextOne = () => { if (i < names.length) loadImg(cfg.imgPath(names[i++])).then(nextOne); };
    nextOne(); nextOne();
  });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 60); });

  return { st, render };
}
