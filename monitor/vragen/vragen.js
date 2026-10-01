// Testversie van de monitor-vragenpagina op de 3D-werkplek (zelfde bureau als de
// laptop-test, met toetsenbord en muis). Basisrender = het bureau; de monitor
// (24/27/32/34 inch, vlak of gebogen) is een transparante laag
// (render/scene.py). Beeld op het scherm zet placeQuad() er precies op.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn, placeQuad } from "../../shared/quiz3d.js";
import { calculateScores, matchMonitors } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -2.15, camZ: 1.25, shiftY: -0.14 });
const productsPromise = fetchProducts().catch(() => null);

// schermmaten (m) zoals in render/scene.py
const MON = {
  compact:   { key: "24", w: 0.531, h: 0.299, inch: "24 inch" },
  standaard: { key: "27", w: 0.598, h: 0.336, inch: "27 inch" },
  groot:     { key: "32", w: 0.708, h: 0.398, inch: "32 inch" },
  ultrawide: { key: "34", w: 0.794, h: 0.340, inch: "34 inch ultrawide" },
};
const MY = -0.2, MZ0 = 0.86, R = 1.5;

const Q = [
  {
    id: "schermgrootte", type: "radio",
    title: "Hoe groot wil je het scherm?",
    sub: "De monitor op het bureau wisselt mee.",
    why: "De schermgrootte bepaalt hoeveel werkruimte je hebt. Een 24\" monitor is compact en past op elk bureau. Een 27\" is de populairste maat voor thuis en kantoor. Een 32\" biedt extra ruimte voor multitasking. Een ultrawide (34\"+) geeft een breed panoramisch beeld, ideaal voor meerdere vensters naast elkaar.",
    options: [{ v: "compact", label: "Compact, 24 inch", price: "€" }, { v: "standaard", label: "Standaard, 27 inch", price: "€€" }, { v: "groot", label: "Groot, 32 inch", price: "€€" }, { v: "ultrawide", label: "Extra breed scherm (ultrawide), 34 inch of breder", price: "€€€" }],
  },
  {
    id: "gebruik", type: "check", max: 2, exclusive: "algemeen",
    title: "Waarvoor gebruik je de monitor?",
    sub: "Kies er maximaal 2. Het scherm laat zien wat je doet.",
    why: "Voor thuiswerk en kantoor is een scherp IPS-scherm met nauwkeurige kleuren ideaal. Gamers profiteren van een hoge verversingssnelheid (144Hz+). Creatieve professionals hebben baat bij kleurnauwkeurige schermen met hoge resolutie.",
    options: [{ v: "thuiswerk", label: "Thuiswerken of kantoorwerk", price: "€" }, { v: "gaming", label: "Gamen", price: "€€" }, { v: "creatief", label: "Creatief werk, zoals foto- of videobewerking", price: "€€€" }, { v: "algemeen", label: "Algemeen gebruik, een beetje van alles", price: "€" }],
  },
  {
    id: "hz", type: "radio",
    title: "Hoe snel moet het beeld vernieuwen?",
    sub: "Zie hoeveel tussenbeelden je per beweging krijgt.",
    why: "De verversingssnelheid (Hz) bepaalt hoe vloeiend bewegend beeld eruitziet. Voor kantoorwerk en films is 60Hz prima. 75-100Hz is al merkbaar soepeler. Vanaf 120Hz krijg je een echte gaming-ervaring met minder invoervertraging. Competitief gamers kiezen voor 240Hz of meer.",
    options: [{ v: "rustig", label: "Rustig, 60Hz", price: "€" }, { v: "soepel", label: "Soepel, 75 tot 100Hz", price: "€€" }, { v: "vloeiend", label: "Vloeiend, goed voor gaming (120 tot 165Hz)", price: "€€" }, { v: "extreem", label: "Extreem vloeiend, voor competitieve gamers (240Hz+)", price: "€€€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Je keuzes verschijnen op de monitor.",
    why: "USB-C is handig om je laptop aan te sluiten én op te laden met één kabel. Een gebogen scherm zorgt voor een meeslependere ervaring. Ingebouwde speakers betekenen geen extra apparatuur. 4K geeft superscherpe tekst en beelden.",
    options: [{ v: "usb-c", label: "USB-C (beeld, data en opladen)", price: "€€" }, { v: "gebogen", label: "Gebogen scherm", price: "€€" }, { v: "speakers", label: "Ingebouwde speakers", price: "€" }, { v: "4k", label: "Extra scherp beeld (4K)", price: "€€€" }, { v: "geen", label: "Geen extra wensen", price: "€" }],
  },
];

// Verversingssnelheid, eerlijk weergegeven: een animatie kan nooit sneller verversen
// dan het scherm van de bezoeker (meestal 60 Hz), dus we tonen de tussenbeelden
// stilstaand. Maat: het object beweegt met 960 px/s (de gangbare UFO-test); per
// verversing verspringt het 960/Hz px. Bij een bereik rekenen we met de ondergrens.
const HZ = {
  rustig:   ["60 Hz", "Prima voor kantoorwerk en films", 60],
  soepel:   ["75 tot 100 Hz", "Merkbaar soepeler", 75],
  vloeiend: ["120 tot 165 Hz", "Echte gaming-ervaring", 120],
  extreem:  ["240 Hz of meer", "Voor competitief gamen", 240],
};
const HZ_WINDOW = 1 / 15;   // we tekenen één vijftiende seconde beweging
function frameRow(hz, runPx) {
  const n = Math.round(hz * HZ_WINDOW);           // aantal verversingen in dat tijdvak
  let s = "";
  // n stippen, onderlinge afstand ∝ 1/Hz (dezelfde schaal voor elke rij)
  for (let i = 0; i < n; i++) s += `<i style="left:${(i / n) * runPx}px;opacity:${(0.25 + 0.75 * i / Math.max(1, n - 1)).toFixed(2)}"></i>`;
  return s;
}

const mon = st => MON[st.schermgrootte || "standaard"];
const curved = st => st.q === 3 && st.extra.includes("gebogen") && mon(st).key !== "24";
const usages = st => (st.gebruik.includes("algemeen") || !st.gebruik.length ? ["algemeen", "thuiswerk", "creatief", "gaming"] : st.gebruik);

function corners(st) {
  const m = mon(st);
  const yEdge = curved(st) ? MY - (R - Math.sqrt(R * R - (m.w / 2) ** 2)) : MY;
  return [[-m.w / 2, yEdge, MZ0 + m.h], [m.w / 2, yEdge, MZ0 + m.h], [m.w / 2, yEdge, MZ0], [-m.w / 2, yEdge, MZ0]];
}

// ───────── schermweergaven ─────────
const SW = 640;
let scr, views, cycle = 0, cycleTimer = null;
function setup(scene) {
  scr = document.createElement("div");
  scr.className = "lscreen";
  scr.style.setProperty("--sw", SW);   // schaal van de game-HUD
  scr.innerHTML = `
    <div class="view" data-v="bureaublad"><div class="wall"><svg viewBox="0 0 520 330" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wg0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2d52"/><stop offset=".55" stop-color="#0954a3"/><stop offset="1" stop-color="#3f7fc4"/></linearGradient><linearGradient id="wg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9c9a8"/><stop offset="1" stop-color="#c49a78"/></linearGradient><linearGradient id="wg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c6a45"/><stop offset="1" stop-color="#6e4428"/></linearGradient></defs><rect width="520" height="330" fill="url(#wg0)"/><path d="M0 190 C 110 140, 210 250, 330 200 S 480 150, 520 175 L520 330 L0 330Z" fill="url(#wg1)" opacity=".92"/><path d="M0 245 C 130 210, 250 300, 380 255 S 500 230, 520 240 L520 330 L0 330Z" fill="url(#wg2)" opacity=".9"/><path d="M0 290 C 150 270, 300 320, 520 285 L520 330 L0 330Z" fill="#2b1a10" opacity=".55"/></svg><div class="clock">09:41<small>dinsdag 29 september</small></div><div class="dock"><i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i><i class="a5"></i></div></div></div>
    <div class="view" data-v="algemeen"><div class="win"><div class="bar"><b></b><b></b><b></b><span class="url">nieuws.nl</span></div><div class="hero"><img class="fill" src="shared/img/scherm/scherm-normaal.webp" alt=""></div><div class="lines"><i></i><i></i><i></i><i></i></div></div></div>
    <div class="view" data-v="thuiswerk"><div class="win" style="background:#e9e9ee"><div class="bar"><b></b><b></b><b></b><span class="url">Kwartaalrapport.docx</span></div><div class="doc"><h4>Kwartaalrapport</h4>${"<i></i>".repeat(16)}</div></div></div>
    <div class="view" data-v="creatief"><div class="editor"><div class="tools"></div><img class="photo" src="shared/img/scherm/scherm-kleur.webp" alt=""><div class="side"><i style="--p:70%"></i><i style="--p:35%"></i><i style="--p:55%"></i><i style="--p:80%"></i><i style="--p:20%"></i></div></div></div>
    <div class="view" data-v="gaming"><img class="fill" src="shared/img/scherm/scherm-gamen.webp" alt=""><div class="hud is-on"><div class="pos">P3<small>/ 12</small></div><div class="lap">Ronde 2 / 5</div><div class="speed"><b>187</b><small>KM/U</small></div></div></div>
    <div class="view" data-v="hz"><div class="hz"><div class="lab" id="hzT"></div><div class="row" id="hzRow" style="top:44%"><em id="hzE"></em></div><div class="row ref" id="hzRef" style="top:64%"><em>60 Hz</em></div><div class="note">Elke stip is één beeld van een bewegend object in 1/15 seconde. Meer Hz = meer tussenbeelden = vloeiender en scherper in beweging. Stilstaand getoond, omdat je eigen scherm hogere Hz niet kan laten zien.</div></div></div>`;
  scene.querySelector(".layers").after(scr);
  views = [...scr.querySelectorAll(".view")];
}
const showView = v => views.forEach(el => el.classList.toggle("is-on", el.dataset.v === v));

function afterRender(ctx) {
  const { st } = ctx;
  const m = mon(st);
  const H = Math.round(SW * m.h / m.w);
  placeQuad(scr, SW, H, corners(st).map(p => ctx.toPx(...p)));
  clearInterval(cycleTimer);
  if (st.q === 0) showView("bureaublad");
  else if (st.q === 1) {
    const u = usages(st);
    cycle %= u.length; showView(u[cycle]);
    if (u.length > 1) cycleTimer = setInterval(() => { cycle = (cycle + 1) % u.length; showView(u[cycle]); }, 2800);
  } else if (st.q === 2) {
    const [t, sub, hz] = HZ[st.hz] ?? ["Verversingssnelheid", "Kies een snelheid", 60];
    scr.querySelector("#hzT").innerHTML = `${t}<small>${sub} · ${Math.round(hz * HZ_WINDOW)} beelden per 1/15 seconde</small>`;
    const run = SW - 140;
    scr.querySelector("#hzRow").innerHTML = `<em>${hz} Hz</em>` + frameRow(hz, run);
    const ref = scr.querySelector("#hzRef");
    ref.style.display = hz === 60 ? "none" : "";
    ref.innerHTML = "<em>60 Hz</em>" + frameRow(60, run);
    showView("hz");
  } else showView(usages(st)[0]);
}

createQuiz3D({
  camera,
  steps: 4,
  state: { schermgrootte: null, gebruik: [], hz: null, extra: [] },
  imgPath: n => `monitor/vragen/img/${n}.webp`,
  question: st => Q[st.q],
  setup, afterRender,
  images: st => ["bureau", mon(st).key + (curved(st) ? "c" : "")],
  focus: () => ({ x: 0, y: MY, z: 1.0, zoom: 1.7 }),
  // bij de extra's de monitor iets naar links, zodat de labels er rechts naast passen
  focusDesktop: st => ({ x: 0.02, y: MY, z: 1.0, zoom: st.q === 0 ? 1.3 : st.q === 3 ? 1.35 : 1.5, anchorX: st.q === 3 ? 0.54 : 0.64 }),

  overlays(ctx) {
    const { st } = ctx;
    let svg = "", html = "";
    const add = r => { svg += r.svg; html += r.html; };
    const m = mon(st);
    if (st.q === 0 && st.schermgrootte) {
      add(dimLine(ctx, [-m.w / 2, MY, MZ0 + m.h + 0.05], [m.w / 2, MY, MZ0 + m.h + 0.05], `<b>${m.inch}</b> · ${Math.round(m.w * 100)} cm breed`));
    }
    if (st.q === 3) {
      const c = corners(st);
      const pts = [];
      if (st.extra.includes("4k")) pts.push({ x: 0, y: c[0][1], z: MZ0 + m.h * 0.8, label: "<b>4K</b>: vier keer zoveel pixels als Full HD" });
      if (st.extra.includes("gebogen")) pts.push({ x: m.w / 2 - 0.03, y: c[1][1], z: MZ0 + m.h * 0.5, label: m.key === "24" ? "<b>Gebogen</b>: vooral bij 27 inch en groter" : "<b>Gebogen</b>: omringt je blikveld" });
      if (st.extra.includes("speakers")) pts.push({ x: 0.1, y: MY, z: MZ0 - 0.005, label: "Ingebouwde <b>speakers</b>" });
      if (st.extra.includes("usb-c")) pts.push({ x: m.w / 2 - 0.02, y: MY + 0.02, z: MZ0 + 0.03, label: "<b>USB-C</b>: laptop aansluiten én opladen" });
      add(spotColumn(ctx, pts, { zBot: MZ0 + 0.02, zTop: MZ0 + m.h - 0.03, edgeX: m.w / 2 + 0.03, edgeY: MY }));
    }
    return { svg, html };
  },

  hideCaption: (st, mobile) => st.q === 3 && !mobile,

  caption(st) {
    const m = mon(st);
    switch (st.q) {
      case 0: return st.schermgrootte ? [m.inch, {
        compact: "Compact: past op elk bureau en houdt alles binnen je blikveld.",
        standaard: "De populairste maat: ruim genoeg voor twee vensters naast elkaar.",
        groot: "Extra ruimte voor multitasking, fijn met een diep bureau.",
        ultrawide: "Panoramisch breed: meerdere vensters naast elkaar zonder tweede scherm.",
      }[st.schermgrootte]] : ["Jouw werkplek", "Kies een schermgrootte; de monitor op het bureau wisselt mee."];
      case 1: return st.gebruik.length ? ["Jouw gebruik", "Het scherm wisselt tussen wat je gekozen hebt."] : ["Gebruik", "Kies waarvoor je de monitor gebruikt."];
      case 2: return st.hz ? [HZ[st.hz][0], `${HZ[st.hz][1]}. Meer Hz betekent meer tussenbeelden, dus vloeiender en scherper bewegend beeld.`] : ["Verversingssnelheid", "Kies een snelheid en zie hoeveel tussenbeelden je krijgt."];
      default: return st.extra.some(e => e !== "geen") ? ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
    }
  },

  onAnswer(st, id) { if (id === "gebruik") cycle = Math.max(0, st.gebruik.length - 1); },

  async finish(st) {
    const answers = { gebruik: st.gebruik, schermgrootte: st.schermgrootte ?? "", hz: st.hz ?? "", extraAnswers: st.extra };
    const scores = calculateScores(answers);
    const raw = await productsPromise;
    const result = matchMonitors(normalizeProducts(raw ?? []), st.schermgrootte, null, answers, scores);
    localStorage.setItem("monitor_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("monitor_bestType", result.bestType ?? "");
    localStorage.setItem("monitor_scores", JSON.stringify(scores));
    localStorage.setItem("monitor_filteredMatchedMonitors", JSON.stringify(result.filteredMatchedMonitors));
    localStorage.setItem("monitor_answers", JSON.stringify(answers));
    localStorage.setItem("monitor_selectedSizeGroup", st.schermgrootte ?? "");
    window.location.href = "monitor/resultaat/";
  },

  preload: ["bureau", "27", "24", "32", "34", "27c", "32c", "34c"],
});
