// Testversie van de desktop-vragenpagina op de 3D-werkplek. Basisrender = het
// bureau; de pc (tower met glazen zijpaneel, mini-pc of all-in-one) is een
// transparante laag (render/scene.py). De gewone 27"-monitor hergebruiken we uit
// de monitor-test. Vraag 5 (extra's) bestaat alleen bij een tower, net als in de
// huidige keuzehulp. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, spotColumn, placeQuad } from "../../shared/quiz3d.js";
import { calculateScores, matchDesktops } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -2.15, camZ: 1.25, shiftY: -0.14 });
const productsPromise = fetchProducts().catch(() => null);

// geometrie (m) zoals in render/scene.py
const SCREEN = { w: 0.598, h: 0.336, y: -0.2, z0: 0.86 };
const TOWER = { x0: 0.38, x1: 0.67, y0: -0.31, z0: 0.762, z1: 1.19 };
// eigen render van de 27"-monitor in deze scène (de laag uit de monitor-test bevatte
// nog een afdruk van de mok die daar op het bureau stond)
const MONITOR = "monitor27";

const isTower = st => st.behuizing === "tower";
const isMini = st => st.behuizing === "mini-pc";

const Q = [
  {
    id: "behuizing", type: "radio",
    title: "Welk type behuizing wil je?",
    sub: "De pc op het bureau wisselt mee.",
    why: "Het type behuizing bepaalt de grootte, uitbreidbaarheid en het stroomverbruik van je desktop. Een tower is uitbreidbaar en krachtig maar neemt meer ruimte in. Een mini-pc is compact en energiezuinig. Een all-in-one combineert pc en monitor in één apparaat.",
    options: [{ v: "tower", label: "Grote, uitbreidbare behuizing (tower)", price: "€€€" }, { v: "mini-pc", label: "Mini pc", price: "€" }, { v: "all-in-one", label: "Beeldscherm en computer in één", price: "€€" }, { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€" }],
  },
  {
    id: "gebruik", type: "check", max: 2, exclusive: "allround",
    title: "Waar ga je je desktop voor gebruiken?",
    sub: "Kies er maximaal 2. Het scherm laat zien wat je doet.",
    why: "Het doel van je desktop bepaalt welke grafische kaart, hoeveel werkgeheugen en welk type processor je nodig hebt. Dagelijks gebruik vraagt een efficiënte machine zonder losse videokaart. Gaming en creatief werk vereisen een krachtigere grafische kaart.",
    options: [{ v: "dagelijks", label: "Dagelijks gebruik, zoals surfen en mailen", price: "€" }, { v: "werk", label: "Werk of studie", price: "€€" }, { v: "gaming", label: "Gamen", price: "€€€" }, { v: "creatief", label: "Creatief werk", price: "€€€" }, { v: "allround", label: "Een beetje van alles", price: "€€" }],
  },
  {
    id: "intensiteit", type: "radio",
    title: "Hoe intensief ga je je desktop gebruiken?",
    sub: "Zie hoe hard processor en videokaart moeten werken.",
    why: "Licht gebruik zoals mailen en surfen vraagt weinig rekenkracht. Intensief gebruik zoals 4K-gaming, videorendering of 3D-modellering vereist een krachtige grafische kaart en meer werkgeheugen.",
    options: [{ v: "licht", label: "Licht gebruik", price: "€" }, { v: "gemiddeld", label: "Gemiddeld gebruik", price: "€€" }, { v: "intensief", label: "Intensief gebruik", price: "€€€" }],
  },
  {
    id: "opslag", type: "radio",
    title: "Hoeveel opslagruimte heb je nodig?",
    sub: "Zie wat er ongeveer in past.",
    why: "Opslag bepaalt hoeveel bestanden, games en programma's je lokaal kunt bewaren. Gebruik je veel cloudopslag? Dan is 512 GB voldoende. Heb je veel games, films of grote projecten? Kies dan voor 1 TB of meer. Professionele gebruikers met grote bestanden hebben minstens 2 TB nodig.",
    // bij een mini-pc is 512 GB de standaard en bestaat 2 TB niet (zelfde regel als de huidige keuzehulp)
    options: [
      { v: "weinig", label: "Weinig, 512 GB", price: "€", when: st => !isMini(st) },
      { v: "weinig", label: "Standaard, 512 GB", price: "€", when: isMini },
      { v: "gemiddeld", label: "Gemiddeld, 1 TB", price: "€€", when: st => !isMini(st) },
      { v: "gemiddeld", label: "Ruimer, 1 TB", price: "€€", when: isMini },
      { v: "veel", label: "Veel, 2 TB of meer", price: "€€€", when: st => !isMini(st) },
    ],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Het zijpaneel gaat eraf: je keuzes verschijnen in de tower.",
    why: "RGB-verlichting geeft je setup een stijlvolle uitstraling. Waterkoeling zorgt voor lagere temperaturen bij intensief gebruik. Wifi is handig als je geen kabel naar je router wilt trekken.",
    options: [{ v: "rgb", label: "Verlichting in de behuizing (RGB)", price: "€€" }, { v: "waterkoeling", label: "Waterkoeling", price: "€€€" }, { v: "wifi", label: "Ingebouwde wifi", price: "€" }, { v: "geen", label: "Geen extra wensen", price: "€" }],
  },
];

const LOAD = { licht: [15, 5, "Licht gebruik", "Surfen en mailen: een zuinige processor, geen losse videokaart nodig."], gemiddeld: [45, 35, "Gemiddeld gebruik", "Kantoorwerk, lichte foto's en af en toe een spelletje."], intensief: [90, 95, "Intensief gebruik", "4K-gaming, video en 3D: een krachtige videokaart en veel werkgeheugen."] };
const STORE = {
  weinig: ["512 GB", "Genoeg als je veel in de cloud bewaart: zo'n 120.000 foto's.", 60],
  gemiddeld: ["1 TB", "Ruimte voor games en een flinke bibliotheek: zo'n 250.000 foto's.", 40],
  veel: ["2 TB of meer", "Voor grote projecten, video en veel games: zo'n 500.000 foto's.", 22],
};
const usages = st => (st.gebruik.includes("allround") || !st.gebruik.length ? ["dagelijks", "werk", "creatief", "gaming"] : st.gebruik);
const VIEW = { dagelijks: "algemeen", werk: "thuiswerk", creatief: "creatief", gaming: "gaming" };

// dicht zijpaneel; pas bij de extra's-vraag gaat het eraf zodat je naar binnen kijkt
function towerLayer(st) {
  if (st.q < 4) return "tower";
  const r = st.extra.includes("rgb"), w = st.extra.includes("waterkoeling");
  return r && w ? "tower-rgb-water" : r ? "tower-rgb" : w ? "tower-water" : "tower-open";
}

// ───────── scherm (zelfde ontwerpen als de monitor-test) ─────────
const SW = 640;
let scr, views, cycle = 0, cycleTimer = null;
function setup(scene) {
  scr = document.createElement("div");
  scr.className = "lscreen";
  scr.style.setProperty("--sw", SW);   // schaal van de game-HUD
  scr.innerHTML = `
    <div class="view" data-v="bureaublad"><div class="wall"><svg viewBox="0 0 520 330" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wg0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2d52"/><stop offset=".55" stop-color="#0954a3"/><stop offset="1" stop-color="#3f7fc4"/></linearGradient><linearGradient id="wg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9c9a8"/><stop offset="1" stop-color="#c49a78"/></linearGradient><linearGradient id="wg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c6a45"/><stop offset="1" stop-color="#6e4428"/></linearGradient></defs><rect width="520" height="330" fill="url(#wg0)"/><path d="M0 190 C 110 140, 210 250, 330 200 S 480 150, 520 175 L520 330 L0 330Z" fill="url(#wg1)" opacity=".92"/><path d="M0 245 C 130 210, 250 300, 380 255 S 500 230, 520 240 L520 330 L0 330Z" fill="url(#wg2)" opacity=".9"/><path d="M0 290 C 150 270, 300 320, 520 285 L520 330 L0 330Z" fill="#2b1a10" opacity=".55"/></svg><div class="clock">09:41<small>dinsdag 29 september</small></div><div class="dock"><i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i><i class="a5"></i></div></div></div>
    <div class="view" data-v="algemeen"><div class="win"><div class="bar"><b></b><b></b><b></b><span class="url">nieuws.nl</span></div><div class="hero"><img class="fill" src="shared/img/scherm/scherm-normaal.webp" alt=""></div><div class="lines"><i></i><i></i><i></i><i></i></div></div></div>
    <div class="view" data-v="thuiswerk"><div class="win" style="background:#e9e9ee"><div class="bar"><b></b><b></b><b></b><span class="url">Werkstuk.docx</span></div><div class="doc"><h4>Werkstuk</h4>${"<i></i>".repeat(16)}</div></div></div>
    <div class="view" data-v="creatief"><div class="editor"><div class="tools"></div><img class="photo" src="shared/img/scherm/scherm-kleur.webp" alt=""><div class="side"><i style="--p:70%"></i><i style="--p:35%"></i><i style="--p:55%"></i><i style="--p:80%"></i><i style="--p:20%"></i></div></div></div>
    <div class="view" data-v="gaming"><img class="fill" src="shared/img/scherm/scherm-gamen.webp" alt=""><div class="hud is-on"><div class="pos">P3<small>/ 12</small></div><div class="lap">Ronde 2 / 5</div><div class="speed"><b>187</b><small>KM/U</small></div></div></div>
    <div class="view" data-v="prestaties"><div class="perf"><h4>Prestaties</h4><div class="meter"><span>Processor <b id="cpuV"></b></span><i><em id="cpuB"></em></i></div><div class="meter"><span>Videokaart <b id="gpuV"></b></span><i><em id="gpuB"></em></i></div></div></div>
    <div class="view" data-v="opslag"><div class="store"><h4 id="stT"></h4><p id="stP"></p><div class="sbar"><em style="background:#0954a3;width:18%"></em><em id="stPhotos" style="background:#c49a78"></em></div><div class="legend"><span><b style="background:#0954a3"></b>Apps</span><span><b style="background:#c49a78"></b>Foto's en games</span><span><b style="background:#e2e2e7"></b>Vrij</span></div></div></div>`;
  scene.querySelector(".layers").after(scr);
  views = [...scr.querySelectorAll(".view")];
}
const showView = v => views.forEach(el => el.classList.toggle("is-on", el.dataset.v === v));

function afterRender(ctx) {
  const { st } = ctx;
  const c = [[-SCREEN.w / 2, SCREEN.y, SCREEN.z0 + SCREEN.h], [SCREEN.w / 2, SCREEN.y, SCREEN.z0 + SCREEN.h], [SCREEN.w / 2, SCREEN.y, SCREEN.z0], [-SCREEN.w / 2, SCREEN.y, SCREEN.z0]];
  placeQuad(scr, SW, Math.round(SW * SCREEN.h / SCREEN.w), c.map(p => ctx.toPx(...p)));
  clearInterval(cycleTimer);
  if (st.q === 0) showView("bureaublad");
  else if (st.q === 1) {
    const u = usages(st).map(k => VIEW[k]);
    cycle %= u.length; showView(u[cycle]);
    if (u.length > 1) cycleTimer = setInterval(() => { cycle = (cycle + 1) % u.length; showView(u[cycle]); }, 2800);
  } else if (st.q === 2) {
    const [cpu, gpu] = LOAD[st.intensiteit] ?? [20, 10];
    scr.querySelector("#cpuV").textContent = `${cpu}%`; scr.querySelector("#cpuB").style.width = `${cpu}%`;
    scr.querySelector("#gpuV").textContent = `${gpu}%`; scr.querySelector("#gpuB").style.width = `${gpu}%`;
    showView("prestaties");
  } else if (st.q === 3) {
    const [t, p, free] = STORE[st.opslag] ?? ["Opslag", "Kies hoeveel ruimte je nodig hebt.", 50];
    scr.querySelector("#stT").textContent = t; scr.querySelector("#stP").textContent = p;
    scr.querySelector("#stPhotos").style.width = `${82 - free}%`;
    showView("opslag");
  } else showView(VIEW[usages(st)[0]]);
}

createQuiz3D({
  camera,
  steps: st => (isTower(st) ? 5 : 4),
  state: { behuizing: null, gebruik: [], intensiteit: null, opslag: null, extra: [] },
  imgPath: n => (n.includes("/") ? n : `desktop/vragen/img/${n}.webp`),
  question: st => Q[st.q],
  setup, afterRender,

  images(st) {
    const b = st.behuizing;
    if (b === "all-in-one") return ["bureau", "aio"];
    if (b === "mini-pc") return ["bureau", MONITOR, "mini"];
    if (b === "maakt-niet-uit") return ["bureau", MONITOR, { name: "tower", opacity: 0.4 }, { name: "mini", opacity: 0.4 }];
    return ["bureau", MONITOR, towerLayer(st)];
  },

  focus: () => ({ x: 0.15, y: -0.2, z: 1.0, zoom: 1.45 }),
  // bij de extra's de tower in het midden, zodat de labels er rechts naast passen
  focusDesktop: st => (st.q === 4 ? { x: 0.52, y: -0.2, z: 0.98, zoom: 1.45, anchorX: 0.5 } : { x: 0.17, y: -0.2, z: 1.0, zoom: 1.4, anchorX: 0.62 }),

  overlays(ctx) {
    const { st } = ctx;
    if (st.q === 4) {
      const pts = [];
      if (st.extra.includes("rgb")) pts.push({ x: 0.58, y: TOWER.y0, z: 0, label: "<b>RGB</b>: verlichting in de kast" });
      if (st.extra.includes("waterkoeling")) pts.push({ x: 0.5, y: TOWER.y0, z: 0, label: "<b>Waterkoeling</b>: koeler en stiller" });
      if (st.extra.includes("wifi")) pts.push({ x: 0.42, y: TOWER.y0, z: 0, label: "<b>Wifi</b> ingebouwd: geen kabel nodig" });
      return spotColumn(ctx, pts, { zBot: TOWER.z0 + 0.08, zTop: TOWER.z1 - 0.06, edgeX: TOWER.x1 + 0.03, edgeY: TOWER.y0 });
    }
    return {};
  },

  hideCaption: (st, mobile) => st.q === 4 && !mobile,

  caption(st) {
    switch (st.q) {
      case 0: return {
        tower: ["Tower", "Krachtig en uitbreidbaar: later een andere videokaart of meer geheugen erin is geen probleem."],
        "mini-pc": ["Mini-pc", "Klein, stil en zuinig. Ideaal als je weinig ruimte hebt en niet zwaar gamet."],
        "all-in-one": ["All-in-one", "Computer en beeldscherm in één: weinig kabels en een opgeruimd bureau."],
        "maakt-niet-uit": ["Maakt niet uit", "We kijken naar alle soorten desktops."],
      }[st.behuizing] ?? ["Jouw werkplek", "Kies een behuizing; de pc op het bureau wisselt mee."];
      case 1: return st.gebruik.length ? ["Jouw gebruik", "Het scherm wisselt tussen wat je gekozen hebt."] : ["Gebruik", "Kies waarvoor je de desktop gebruikt."];
      case 2: return st.intensiteit ? [LOAD[st.intensiteit][2], LOAD[st.intensiteit][3]] : ["Belasting", "Kies hoe intensief je de desktop gebruikt."];
      case 3: return st.opslag ? [STORE[st.opslag][0], STORE[st.opslag][1]] : ["Opslag", "Kies hoeveel ruimte je nodig hebt."];
      default: return st.extra.some(e => e !== "geen") ? ["Jouw extra's", "De tower laat zien wat je gekozen hebt."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
    }
  },

  onAnswer(st, id) { if (id === "gebruik") cycle = Math.max(0, st.gebruik.length - 1); },
  onBack(st) { if (st.q === 0) st.opslag = null; },

  async finish(st) {
    // zonder tower bestaat de extra's-vraag niet; de huidige keuzehulp vult dan "geen" in
    const answers = { gebruik: st.gebruik, behuizing: st.behuizing ?? "", intensiteit: st.intensiteit ?? "", opslag: st.opslag ?? "", extraAnswers: isTower(st) ? st.extra : ["geen"] };
    const scores = calculateScores(answers);
    const raw = await productsPromise;
    const result = matchDesktops(normalizeProducts(raw ?? []), st.behuizing, null, answers, scores);
    localStorage.setItem("desktop_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("desktop_bestType", result.bestType ?? "");
    localStorage.setItem("desktop_scores", JSON.stringify(scores));
    localStorage.setItem("desktop_filteredMatchedDesktops", JSON.stringify(result.filteredMatchedDesktops));
    localStorage.setItem("desktop_answers", JSON.stringify(answers));
    localStorage.setItem("desktop_selectedBehuizingType", st.behuizing ?? "");
    window.location.href = "desktop/resultaat/";
  },

  preload: ["bureau", MONITOR, "tower", "mini", "aio", "tower-open", "tower-rgb", "tower-water", "tower-rgb-water"],
});
