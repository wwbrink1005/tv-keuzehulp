// Testversie van de laptop-vragenpagina op een 3D-werkplek. Basisrender = het
// bureau (render/scene.py); de laptop (13/15/17 inch) is een transparante laag.
// Wat er op het scherm staat, zetten we met placeQuad() in perspectief op het
// schuine laptopscherm, met dezelfde camera als in Blender. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn, placeQuad } from "../../shared/quiz3d.js";
import { calculateScores, matchLaptops } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -2.15, camZ: 1.25, shiftY: -0.14 });
const productsPromise = fetchProducts().catch(() => null);

// laptopmaten (m) zoals in render/scene.py: voet breed×diep, scherm breed×hoog
const LAPTOP = {
  "licht-compact":  { key: "13", bw: 0.300, bd: 0.212, sw: 0.286, sh: 0.179, inch: "13 à 14", kg: "± 1,3 kg" },
  middenweg:        { key: "15", bw: 0.358, bd: 0.245, sw: 0.345, sh: 0.194, inch: "15 à 16", kg: "± 1,8 kg" },
  "groot-krachtig": { key: "17", bw: 0.398, bd: 0.268, sw: 0.383, sh: 0.215, inch: "17", kg: "± 2,5 kg" },
};
const DZ = 0.75, T = 0.016, LY = -0.33, TILT = 18 * Math.PI / 180;

// hoeken van het scherm in de wereld: het deksel draait 18° naar achteren om het scharnier
function screenCorners(l) {
  const hy = LY + l.bd / 2 - 0.004, hz = DZ + T;
  const at = (x, zl) => [x, hy + Math.sin(TILT) * zl, hz + Math.cos(TILT) * zl];
  const z0 = 0.016, z1 = 0.016 + l.sh;
  return [at(-l.sw / 2, z1), at(l.sw / 2, z1), at(l.sw / 2, z0), at(-l.sw / 2, z0)];
}

const Q = [
  {
    id: "formaat", type: "radio",
    title: "Hoe gebruik je je laptop het liefst?",
    sub: "De laptop op het bureau wisselt mee van formaat.",
    why: "Het formaat en gewicht van je laptop bepalen hoeveel comfort je hebt onderweg en thuis. Een lichte compacte laptop (13 à 14 inch) is ideaal voor dagelijks meenemen. Een middenweg (15 à 16 inch) biedt een goede balans. Een grote krachtige laptop (17 inch) is het prettigst voor thuisgebruik met groot scherm.",
    options: [{ v: "licht-compact", label: "Licht en compact, 13 tot 14 inch", price: "€" }, { v: "middenweg", label: "Middenweg, 15 tot 16 inch", price: "€€" }, { v: "groot-krachtig", label: "Groot en krachtig, 17 inch", price: "€€€" }],
  },
  {
    id: "gebruik", type: "check", max: 2, exclusive: "allround",
    title: "Waar ga je je laptop voor gebruiken?",
    sub: "Kies er maximaal 2. Het scherm laat zien wat je doet.",
    why: "Het doel van je laptop bepaalt welk type processor, hoeveel werkgeheugen en welke grafische kaart je nodig hebt. Dagelijks gebruik vraagt om een snelle maar zuinige laptop. Creatief werk of gaming vragen om een krachtigere machine.",
    options: [{ v: "dagelijks", label: "Dagelijks gebruik, zoals surfen", price: "€" }, { v: "werk", label: "Studie of werk", price: "€€" }, { v: "creatief", label: "Creatief werk, foto's en video's", price: "€€" }, { v: "gaming", label: "Gamen", price: "€€€" }, { v: "allround", label: "Een beetje van alles", price: "€€" }],
  },
  {
    id: "intensiteit", type: "radio",
    title: "Hoe zwaar ga je de laptop gebruiken?",
    sub: "Zie hoe hard processor en geheugen moeten werken.",
    why: "Licht gebruik zoals surfen en e-mailen vraagt weinig rekenkracht. Normaal gebruik zoals kantoorwerk met meerdere tabbladen vraagt om een vlotte, energiezuinige laptop. Zwaar gebruik zoals fotobewerking vraagt om meer kracht. Zeer zwaar gebruik zoals videobewerking of gamen vereist de krachtigste processor en het meeste werkgeheugen.",
    options: [{ v: "licht", label: "Licht, zoals surfen en mailen", price: "€" }, { v: "normaal", label: "Normaal, zoals kantoorwerk", price: "€€" }, { v: "zwaar", label: "Zwaar, zoals fotobewerking", price: "€€" }, { v: "extreem", label: "Zeer zwaar, zoals videobewerking of gamen", price: "€€€" }],
  },
  {
    id: "opslag", type: "radio",
    title: "Hoeveel opslagruimte heb je nodig?",
    sub: "Zie wat er ongeveer in past.",
    why: "Opslag bepaalt hoeveel bestanden, programma's en media je lokaal kunt bewaren. Sla je alles op in de cloud? Dan is 256 GB voldoende. Heb je veel foto's, programma's of video's? Kies dan voor 512 GB of meer. Professionele gebruikers met grote projecten zijn het best geholpen met 1 TB of meer.",
    options: [{ v: "weinig", label: "Weinig, 256 GB", price: "€" }, { v: "gemiddeld", label: "Gemiddeld, 512 GB", price: "€€" }, { v: "veel", label: "Veel, 1 TB of meer", price: "€€€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat is nog meer belangrijk voor jou?",
    sub: "Je keuzes verschijnen op de laptop.",
    why: "Een touchscreen maakt bediening intuïtiever. USB-C is handig voor modern opladen en accessoires. Een scherp beeldscherm (OLED of hoge resolutie) is prettig voor foto's, video en lang werken.",
    options: [{ v: "touchscreen", label: "Touchscreen", price: "€€€" }, { v: "usb-c", label: "USB-C (data en opladen)", price: "€" }, { v: "scherp-beeldscherm", label: "Hoge resolutie scherm", price: "€€€" }, { v: "geen", label: "Geen extra wensen", price: "€" }],
  },
];

const LOAD = { licht: [15, 25], normaal: [35, 45], zwaar: [65, 70], extreem: [95, 92] };
const STORE = {
  weinig: ["256 GB", "Genoeg als je veel in de cloud bewaart: zo'n 60.000 foto's.", 70],
  gemiddeld: ["512 GB", "Ruimte voor programma's en een flinke fotobibliotheek: zo'n 120.000 foto's.", 48],
  veel: ["1 TB of meer", "Voor video, grote projecten en games: zo'n 250.000 foto's.", 26],
};

const lap = st => LAPTOP[st.formaat || "middenweg"];
const usages = st => (st.gebruik.includes("allround") || !st.gebruik.length ? ["dagelijks", "werk", "creatief", "gaming"] : st.gebruik);
let cycle = 0, cycleTimer = null;

// ───────── schermweergaven ─────────
const SW = 520;   // klein canvas = relatief grote, leesbare schermweergave
let scr, views;
function setup(scene) {
  scr = document.createElement("div");
  scr.className = "lscreen";
  scr.style.setProperty("--sw", SW);   // schaal van de game-HUD
  scr.innerHTML = `
    <div class="view" data-v="bureaublad"><div class="wall">
      <svg viewBox="0 0 520 330" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="wg0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2d52"/><stop offset=".55" stop-color="#0954a3"/><stop offset="1" stop-color="#3f7fc4"/></linearGradient>
          <linearGradient id="wg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9c9a8"/><stop offset="1" stop-color="#c49a78"/></linearGradient>
          <linearGradient id="wg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c6a45"/><stop offset="1" stop-color="#6e4428"/></linearGradient>
        </defs>
        <rect width="520" height="330" fill="url(#wg0)"/>
        <path d="M0 190 C 110 140, 210 250, 330 200 S 480 150, 520 175 L520 330 L0 330Z" fill="url(#wg1)" opacity=".92"/>
        <path d="M0 245 C 130 210, 250 300, 380 255 S 500 230, 520 240 L520 330 L0 330Z" fill="url(#wg2)" opacity=".9"/>
        <path d="M0 290 C 150 270, 300 320, 520 285 L520 330 L0 330Z" fill="#2b1a10" opacity=".55"/>
      </svg>
      <div class="clock">09:41<small>dinsdag 29 september</small></div>
      <div class="dock"><i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i><i class="a5"></i></div>
    </div></div>
    <div class="view" data-v="dagelijks"><div class="win"><div class="bar"><b></b><b></b><b></b><span class="url">nieuws.nl</span></div><div class="hero"><img class="fill" src="shared/img/scherm/scherm-normaal.webp" alt=""></div><div class="lines"><i></i><i></i><i></i><i></i></div></div></div>
    <div class="view" data-v="werk"><div class="win" style="background:#e9e9ee"><div class="bar"><b></b><b></b><b></b><span class="url">Scriptie hoofdstuk 3.docx</span></div><div class="doc"><h4>3. Resultaten</h4>${"<i></i>".repeat(14)}</div></div></div>
    <div class="view" data-v="creatief"><div class="editor"><div class="tools"></div><img class="photo" src="shared/img/scherm/scherm-films.webp" alt=""><div class="side"><i style="--p:70%"></i><i style="--p:35%"></i><i style="--p:55%"></i><i style="--p:80%"></i><i style="--p:20%"></i></div></div></div>
    <div class="view" data-v="gaming"><img class="fill" src="shared/img/scherm/scherm-gamen.webp" alt=""><div class="hud is-on"><div class="pos">P3<small>/ 12</small></div><div class="lap">Ronde 2 / 5</div><div class="speed"><b>187</b><small>KM/U</small></div></div></div>
    <div class="view" data-v="prestaties"><div class="perf"><h4>Prestaties</h4><div class="meter"><span>Processor <b id="cpuV"></b></span><i><em id="cpuB"></em></i></div><div class="meter"><span>Werkgeheugen <b id="ramV"></b></span><i><em id="ramB"></em></i></div></div></div>
    <div class="view" data-v="opslag"><div class="store"><h4 id="stT"></h4><p id="stP"></p><div class="sbar"><em style="background:#0954a3;width:18%"></em><em id="stPhotos" style="background:#c49a78"></em></div><div class="legend"><span><b style="background:#0954a3"></b>Apps</span><span><b style="background:#c49a78"></b>Foto's en video</span><span><b style="background:#e2e2e7"></b>Vrij</span></div></div></div>`;
  scene.querySelector(".layers").after(scr);
  views = [...scr.querySelectorAll(".view")];
}

function showView(v) { views.forEach(el => el.classList.toggle("is-on", el.dataset.v === v)); }

function afterRender(ctx) {
  const { st } = ctx;
  const l = lap(st);
  const pts = screenCorners(l).map(p => ctx.toPx(...p));
  placeQuad(scr, SW, Math.round(SW * l.sh / l.sw), pts);
  clearInterval(cycleTimer);
  if (st.q === 0) showView("bureaublad");
  else if (st.q === 1) {
    const u = usages(st);
    cycle %= u.length; showView(u[cycle]);
    if (u.length > 1) cycleTimer = setInterval(() => { cycle = (cycle + 1) % u.length; showView(u[cycle]); }, 2800);
  } else if (st.q === 2) {
    const [cpu, ram] = LOAD[st.intensiteit] ?? [20, 30];
    scr.querySelector("#cpuV").textContent = `${cpu}%`; scr.querySelector("#cpuB").style.width = `${cpu}%`;
    scr.querySelector("#ramV").textContent = `${ram}%`; scr.querySelector("#ramB").style.width = `${ram}%`;
    showView("prestaties");
  } else if (st.q === 3) {
    const [title, text, free] = STORE[st.opslag] ?? ["Opslag", "Kies hoeveel ruimte je nodig hebt.", 50];
    scr.querySelector("#stT").textContent = title; scr.querySelector("#stP").textContent = text;
    scr.querySelector("#stPhotos").style.width = `${82 - free}%`;
    showView("opslag");
  } else showView(usages(st)[0]);
}

createQuiz3D({
  camera,
  steps: 5,
  state: { formaat: null, gebruik: [], intensiteit: null, opslag: null, extra: [] },
  imgPath: n => `laptop/vragen/img/${n}.webp`,
  question: st => Q[st.q],
  setup, afterRender,
  images: st => ["bureau", lap(st).key],
  focus: st => ({ x: 0, y: LY, z: 0.85, zoom: st.q === 0 ? 1.9 : 2.4 }),
  // ingezoomd op de laptop; bij vraag 1 iets ruimer zodat je het formaat t.o.v. het bureau ziet
  focusDesktop: st => ({ x: 0.02, y: LY, z: 0.86, zoom: st.q === 0 ? 1.6 : 2.1, anchorX: 0.64 }),

  overlays(ctx) {
    const { st } = ctx;
    let svg = "", html = "";
    const add = r => { svg += r.svg; html += r.html; };
    const l = lap(st);
    if (st.q === 0 && st.formaat) {
      add(dimLine(ctx, [-l.bw / 2, LY - l.bd / 2 - 0.1, DZ + 0.002], [l.bw / 2, LY - l.bd / 2 - 0.1, DZ + 0.002], `<b>${l.inch} inch</b> · ${Math.round(l.bw * 100)} cm · ${l.kg}`));
    }
    if (st.q === 4) {
      const c = screenCorners(l);
      const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
      const pts = [];
      if (st.extra.includes("scherp-beeldscherm")) pts.push({ ...xyz(mid(c[0], c[1])), label: "<b>Hoge resolutie</b>: haarscherp beeld" });
      if (st.extra.includes("touchscreen")) pts.push({ ...xyz(mid(mid(c[0], c[2]), mid(c[1], c[3]))), label: "<b>Touchscreen</b>: bedienen met je vinger" });
      if (st.extra.includes("usb-c")) pts.push({ x: l.bw / 2, y: LY, z: DZ + 0.008, label: "<b>USB-C</b>: laden en data via één poort" });
      // punten liggen op verschillende hoogtes; daarom per punt een eigen bereik
      pts.forEach((p, i) => add(spotColumn(ctx, [p], { zBot: p.z, zTop: p.z, edgeX: l.bw / 2 + 0.03 + i * 0.001, edgeY: LY })));
    }
    return { svg, html };
  },

  hideCaption: (st, mobile) => st.q === 4 && !mobile,

  caption(st) {
    const l = lap(st);
    switch (st.q) {
      case 0: return st.formaat ? [`${l.inch} inch`, `Ongeveer ${Math.round(l.bw * 100)} cm breed en ${l.kg}. ${st.formaat === "licht-compact" ? "Makkelijk mee te nemen." : st.formaat === "middenweg" ? "Een goede balans tussen scherm en gewicht." : "Het meeste scherm, vooral voor thuis."}`] : ["Jouw werkplek", "Kies het formaat; de laptop op het bureau wisselt mee."];
      case 1: return st.gebruik.length ? ["Jouw gebruik", "Het scherm wisselt tussen wat je gekozen hebt. Zwaarder gebruik vraagt om meer rekenkracht."] : ["Gebruik", "Kies waar je de laptop voor gebruikt; het scherm laat het zien."];
      case 2: return {
        licht: ["Licht gebruik", "Surfen en mailen: een zuinige processor en 8 GB werkgeheugen zijn genoeg."],
        normaal: ["Normaal gebruik", "Kantoorwerk met veel tabbladen: een vlotte processor en 16 GB werkgeheugen."],
        zwaar: ["Zwaar gebruik", "Fotobewerking en veel programma's tegelijk: meer rekenkracht en geheugen."],
        extreem: ["Zeer zwaar", "Video, 3D of gamen: de snelste processor, veel geheugen en een losse videokaart."],
      }[st.intensiteit] ?? ["Belasting", "Kies hoe zwaar je de laptop gebruikt en zie de meters meelopen."];
      case 3: return st.opslag ? [STORE[st.opslag][0], STORE[st.opslag][1]] : ["Opslag", "Kies hoeveel ruimte je nodig hebt."];
      default: return st.extra.some(e => e !== "geen") ? ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
    }
  },

  onAnswer(st, id) { if (id === "gebruik") cycle = Math.max(0, st.gebruik.length - 1); },

  async finish(st) {
    const answers = { gebruik: st.gebruik, intensiteit: st.intensiteit ?? "", formaat: st.formaat ?? "", opslag: st.opslag ?? "", extraAnswers: st.extra };
    const scores = calculateScores(answers);
    const raw = await productsPromise;
    const result = matchLaptops(normalizeProducts(raw ?? []), st.formaat, null, answers, scores);
    localStorage.setItem("laptop_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("laptop_bestType", result.bestType ?? "");
    localStorage.setItem("laptop_scores", JSON.stringify(scores));
    localStorage.setItem("laptop_filteredMatchedLaptops", JSON.stringify(result.filteredMatchedLaptops));
    localStorage.setItem("laptop_answers", JSON.stringify(answers));
    localStorage.setItem("laptop_selectedSizeGroup", st.formaat ?? "");
    window.location.href = "laptop/resultaat/";
  },

  preload: ["bureau", "15", "13", "17"],
});

function xyz([x, y, z]) { return { x, y, z }; }
