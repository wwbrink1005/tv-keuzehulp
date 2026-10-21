// De monitor-vragenpagina op de 3D-werkplek (zelfde bureau als de
// laptop-test, met toetsenbord en muis). Basisrender = het bureau; de monitor
// (24/27/32/34 inch, vlak of gebogen) is een transparante laag
// (render/scene.py). Beeld op het scherm zet placeQuad() er precies op.
// Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, placeQuad } from "../../shared/quiz3d.js";
import { matchMonitors, heeftWens, voldoetAanGame } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";
import { budgetCapsBySize, inMaatGroep } from "../js/data.js";

const camera = makeCamera({ camY: -2.15, camZ: 1.25, shiftY: -0.14 });
const productsPromise = fetchProducts().catch(() => null);

// Mislukt het ophalen (geen verbinding, database even onbereikbaar), dan één
// keer opnieuw. Lukt dat ook niet, dan meldt shared/quiz3d.js dat met een
// knop "Opnieuw proberen", in plaats van door te sturen naar een lege
// resultaatpagina.
async function productenOfFout() {
  const raw = (await productsPromise) ?? await fetchProducts().catch(() => null);
  if (!raw?.length) throw new Error("producten niet beschikbaar");
  return raw;
}

// schermmaten (m) zoals in render/scene.py
const MON = {
  compact:   { key: "24", w: 0.531, h: 0.299, inch: "24 inch" },
  standaard: { key: "27", w: 0.598, h: 0.336, inch: "27 inch" },
  groot:     { key: "32", w: 0.708, h: 0.398, inch: "32 inch" },
  ultrawide: { key: "34", w: 0.794, h: 0.340, inch: "34 inch ultrawide" },
};
const MY = -0.2, MZ0 = 0.86, R = 1.5, DZ = 0.75, RAND = 0.008;

// Sinds okt. 2026: budget als vraag 2, de gamevraag alleen bij "Gamen", en de
// extra's opgesplitst in beeld en werkplek (zie docs/monitor-keuzehulp-werking.md).
const Q = [
  {
    id: "schermgrootte", type: "radio",
    title: "Hoe groot wil je het scherm?",
    sub: "De monitor op het bureau wisselt mee.",
    why: "De schermgrootte bepaalt hoeveel werkruimte je hebt. Een 24\" monitor is compact en past op elk bureau. Een 27\" is de populairste maat voor thuis en kantoor. Een 32\" biedt extra ruimte voor multitasking. Een ultrawide (34\"+) geeft een breed panoramisch beeld, ideaal voor meerdere vensters naast elkaar.",
    options: [{ v: "compact", label: "Compact, 24 inch", price: "€" }, { v: "standaard", label: "Standaard, 27 inch", price: "€€" }, { v: "groot", label: "Groot, 32 inch of groter", price: "€€" }, { v: "ultrawide", label: "Extra breed scherm (ultrawide), 34 inch of breder", price: "€€€" }],
  },
  {
    id: "budget", type: "radio",
    title: "Wat wil je maximaal uitgeven?",
    sub: st => `Bedragen voor een monitor van ${mon(st).inch}. Je krijgt de beste monitor binnen je budget.`,
    why: "Met je budget zoeken we de beste monitor die je ook echt wilt kopen. Past een monitor die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
    options: [],   // per maat, zie question() hieronder
  },
  {
    id: "gebruik", type: "check", max: 2, exclusive: "algemeen",
    title: "Waarvoor gebruik je de monitor?",
    sub: "Kies er maximaal 2. Het scherm laat zien wat je doet.",
    why: "Voor thuiswerk telt vooral een scherp scherm dat je op de goede hoogte zet. Gamers hebben baat bij een hoge verversingssnelheid; daar vragen we hierna naar. Voor foto- en videobewerking kijken we naar een scherp scherm met een groot kleurbereik.",
    options: [{ v: "thuiswerk", label: "Thuiswerken of kantoorwerk", price: "€" }, { v: "gaming", label: "Gamen", price: "€€" }, { v: "creatief", label: "Creatief werk, zoals foto- of videobewerking", price: "€€€" }, { v: "algemeen", label: "Algemeen gebruik, een beetje van alles", price: "€" }],
  },
  {
    id: "game", type: "radio",
    title: "Hoe game je?",
    sub: "Zie hoeveel tussenbeelden je per beweging krijgt.",
    why: "De verversingssnelheid (Hz) bepaalt hoe vloeiend bewegend beeld eruitziet. Voor rustige games is 120 Hz al heel soepel. Bij snelle shooters en racegames helpt 144 tot 180 Hz. Competitieve gamers kiezen 240 Hz of meer. Een PlayStation 5 of Xbox Series X haalt 120 beelden per seconde alleen via HDMI 2.1; met een oudere HDMI-poort blijft het bij 60.",
    options: [{ v: "console", label: "Op een PlayStation 5 of Xbox", price: "€€" }, { v: "rustig", label: "Op de pc, rustige games zoals avontuur of strategie", price: "€€" }, { v: "snel", label: "Op de pc, snelle games zoals shooters of racegames", price: "€€" }, { v: "competitief", label: "Competitief, elke milliseconde telt", price: "€€€" }],
  },
  {
    id: "beeld", type: "check", exclusive: "geen",
    title: "Wat vind je belangrijk aan het beeld?",
    sub: "Je keuzes verschijnen op de monitor.",
    why: "4K geeft superscherpe tekst en foto's, vooral op 27 inch en groter. OLED geeft echt zwart en felle kleuren, mooi voor films en games. Een gebogen scherm omringt je blikveld; bij een ultrawide is dat standaard, bij 24 en 27 inch bestaat het nauwelijks.",
    options: [{ v: "4k", label: "Extra scherp beeld (4K)", price: "€€€" }, { v: "oled", label: "Diep zwart en felle kleuren (OLED)", price: "€€€" }, { v: "gebogen", label: "Gebogen scherm", price: "€€", when: st => st.schermgrootte === "groot" }, { v: "geen", label: "Geen voorkeur", price: "€" }],
  },
  {
    id: "extra", type: "check", exclusive: "geen",
    title: "Wat moet de monitor nog meer kunnen?",
    sub: "Je keuzes verschijnen op de monitor.",
    why: "Met USB-C sluit je een laptop aan met één kabel voor beeld en opladen; dan moet de monitor wel genoeg stroom leveren (60 W of meer). Een in hoogte verstelbare voet zet het scherm op ooghoogte, fijn als je er de hele dag achter zit. Een ingebouwde webcam scheelt een losse camera bij videobellen. Ingebouwde speakers zijn handig, maar klinken eenvoudig.",
    options: [{ v: "usbc", label: "Laptop aansluiten en opladen via USB-C", price: "€€" }, { v: "hoogte", label: "In hoogte verstelbaar", price: "€€" }, { v: "webcam", label: "Ingebouwde webcam", price: "€€" }, { v: "speakers", label: "Ingebouwde speakers", price: "€" }, { v: "geen", label: "Geen extra wensen", price: "€" }],
  },
];
// De gamevraag bestaat alleen als je "Gamen" kiest.
const vragen = st => Q.filter(q => q.id !== "game" || (st.gebruik ?? []).includes("gaming"));
const QID = st => vragen(st)[st.q]?.id;

// Verversingssnelheid, eerlijk weergegeven: een animatie kan nooit sneller verversen
// dan het scherm van de bezoeker (meestal 60 Hz), dus we tonen de tussenbeelden
// stilstaand. Maat: het object beweegt met 960 px/s (de gangbare UFO-test); per
// verversing verspringt het 960/Hz px. Bij een bereik rekenen we met de ondergrens.
const HZ = {
  console:     ["120 Hz met HDMI 2.1", "Zo haalt een PS5 of Xbox 120 beelden per seconde", 120],
  rustig:      ["120 Hz of meer", "Rustige games lopen heel soepel", 120],
  snel:        ["144 tot 180 Hz", "Voor snelle games zoals shooters", 144],
  competitief: ["240 Hz of meer", "Voor competitief gamen", 240],
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
const bijWensen = st => QID(st) === "beeld" || QID(st) === "extra";
const curved = st => bijWensen(st) && st.beeld.includes("gebogen") && mon(st).key !== "24";
const webcam = st => QID(st) === "extra" && st.extra.includes("webcam");
const usages = st => (st.gebruik.includes("algemeen") || !st.gebruik.length ? ["algemeen", "thuiswerk", "creatief", "gaming"] : st.gebruik);

function corners(st) {
  const m = mon(st);
  const yEdge = curved(st) ? MY - (R - Math.sqrt(R * R - (m.w / 2) ** 2)) : MY;
  return [[-m.w / 2, yEdge, MZ0 + m.h], [m.w / 2, yEdge, MZ0 + m.h], [m.w / 2, yEdge, MZ0], [-m.w / 2, yEdge, MZ0]];
}

// Labels rechts van de monitor (of links als daar geen ruimte is), elk met een lijn
// naar zijn eigen punt. Zoals spotColumn in shared/quiz3d.js, maar elk punt houdt
// zijn eigen hoogte: van de webcam bovenop tot de voet op het bureau.
function labelKolom(ctx, points, edgeX) {
  let svg = "", html = "";
  if (!points.length) return { svg, html };
  const placed = points.map(p => ({ ...p, px: ctx.toPx(p.x, p.y, p.z) })).sort((a, b) => a.px.y - b.px.y);
  let labelX = ctx.toPx(edgeX, MY, MZ0).x + 22;
  // weinig ruimte rechts: alleen de naam; pas bij echt geen ruimte naar links
  const kort = ctx.mobile || ctx.width - labelX < 300, flip = ctx.width - labelX < 150;
  if (flip) labelX = Math.min(...placed.map(d => d.px.x)) - 22;
  const gap = ctx.mobile ? 26 : 32, ys = placed.map(d => d.px.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
  // op desktop staat rechtsonder het bijschrift: labels blijven daarboven
  const overflow = ys[ys.length - 1] - (ctx.height - (ctx.mobile ? 20 : 150));
  if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
  placed.forEach((d, i) => {
    svg += `<line x1="${d.px.x}" y1="${d.px.y}" x2="${labelX}" y2="${ys[i]}" class="leader"/>`;
    // zonder stip als die het onderdeel zelf zou bedekken (de webcam is maar 5 cm breed)
    if (!d.noSpot) html += `<div class="spot is-on" style="left:${d.px.x}px;top:${d.px.y}px"></div>`;
    const pos = flip ? `right:${ctx.width - labelX}px` : `left:${labelX}px`;
    html += `<div class="spot-label is-on" style="${pos};top:${ys[i]}px">${kort ? d.label.split(":")[0] : d.label}</div>`;
  });
  return { svg, html };
}

// ───────── budget ─────────
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const budgetOpties = g => [...(budgetCapsBySize[g] ?? budgetCapsBySize.standaard).map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }];
const capVan = v => (v && v !== "geen" ? Number(v) : null);
// De live catalogus (null zolang die laadt). Telt de monitoren die je
// standaard ziet (2+ winkels).
let catalogus = null;
const vanMaat = g => (catalogus ?? []).filter(m => inMaatGroep(m, g) && (m.aanbieders ?? []).length >= 2);
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste monitor binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste monitor binnen dit bedrag." : "We kiezen puur op je wensen."];
  const alle = vanMaat(st.schermgrootte), prijzen = alle.map(m => parsePrice(m.prijs)).filter(Number.isFinite);
  const binnen = cap ? prijzen.filter(p => p <= cap) : prijzen;
  if (!cap) return ["Geen voorkeur", `Alle ${alle.length} monitoren van ${mon(st).inch} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}. We kiezen puur op je wensen.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Binnen dit bedrag vonden we geen monitor van ${mon(st).inch}. We tonen dan de monitoren die het best bij je passen, net erboven.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${alle.length} monitoren van ${mon(st).inch} kosten ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}. We zoeken de beste die bij je wensen past.`];
}

// ───────── opties grijs als geen monitor ze waar kan maken ─────────
// Zelfde idee als bij laptop en printer: grijs als er binnen maat en budget
// geen monitor bij 2+ winkels is die er zeker aan voldoet, samen met je
// eerdere wensen (gamevraag, beeld) en de al aangevinkte opties van deze vraag.
// Alleen wat zeker is telt, net als in het bijschrift.
const EIS = {
  game: Object.fromEntries(Object.keys(HZ).map(v => [v, m => voldoetAanGame(m, v) === true])),
  beeld: Object.fromEntries(["4k", "oled", "gebogen"].map(v => [v, m => heeftWens(m, v) === true])),
  extra: Object.fromEntries(["usbc", "hoogte", "webcam", "speakers"].map(v => [v, m => heeftWens(m, v) === true])),
};
// Eisen uit de antwoorden van eerdere vragen (en van deze vraag, behalve `zonder`)
function eisenVan(st, totId, zonder) {
  const eisen = [];
  for (const q of vragen(st)) {
    if (!EIS[q.id]) continue;
    const gekozen = [].concat(st[q.id] ?? []).filter(v => EIS[q.id][v] && (q.id !== totId || v !== zonder));
    gekozen.forEach(v => eisen.push(EIS[q.id][v]));
    if (q.id === totId) break;
  }
  return eisen;
}
function metBeschikbaarheid(st, id, opties) {
  if (!catalogus || !EIS[id]) return opties;
  const cap = capVan(st.budget), vergelijkbaar = vanMaat(st.schermgrootte);
  const binnen = cap ? vergelijkbaar.filter(m => parsePrice(m.prijs) <= cap) : vergelijkbaar;
  return opties.map(o => {
    const eis = EIS[id][o.v];
    if (!eis) return o;
    let andere = eisenVan(st, id, o.v);
    // Eerdere wensen die samen al onmogelijk zijn, laat de matching toch vallen
    // (bv. OLED tot €200): dan tellen ze hier ook niet mee.
    if (!binnen.some(m => andere.every(f => f(m)))) andere = [];
    if (binnen.some(m => eis(m) && andere.every(f => f(m)))) return o;
    const erboven = vergelijkbaar.filter(m => eis(m) && andere.every(f => f(m))).map(m => parsePrice(m.prijs));
    const note = cap && erboven.length ? `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`
      : andere.length && vergelijkbaar.some(eis) ? "Niet in combinatie met je andere keuzes."
      : `Niet in ${mon(st).inch}.`;
    return { ...o, disabled: true, note };
  });
}

// Hoeveel monitoren binnen je eerdere keuzes alles hebben wat je aanvinkt
const WENS_NAAM = {
  "4k": "4K", oled: "een OLED-scherm", gebogen: "een gebogen scherm",
  usbc: "USB-C waarmee je een laptop oplaadt", hoogte: "een in hoogte verstelbare voet", webcam: "een ingebouwde webcam", speakers: "ingebouwde speakers",
};
function wensCaption(st, id) {
  const wensen = (st[id] ?? []).filter(e => e !== "geen");
  const leeg = id === "beeld" ? ["Beeld", "Vink aan wat je belangrijk vindt aan het beeld."] : ["Extra's", "Vink aan wat de monitor nog meer moet kunnen."];
  if (!wensen.length) return st[id]?.length ? [id === "beeld" ? "Geen voorkeur" : "Geen extra wensen", "We kiezen puur op je eerdere antwoorden."] : leeg;
  const titel = id === "beeld" ? "Jouw beeld" : "Jouw extra's";
  if (!catalogus) return [titel, "De punten op de monitor laten zien waar je keuzes zitten."];
  const cap = capVan(st.budget);
  const lijst = vanMaat(st.schermgrootte).filter(m => !cap || parsePrice(m.prijs) <= cap);
  const n = lijst.filter(m => eisenVan(st, id, null).every(f => f(m))).length;
  const bij = cap ? "maat en budget" : "maat";
  const wat = wensen.length > 1 || eisenVan(st, id, null).length > wensen.length ? "alles wat je koos" : WENS_NAAM[wensen[0]];
  if (!n) return [titel, `Geen van de ${lijst.length} monitoren die bij je ${bij} passen heeft ${wat}. We tonen de monitoren die er het meest van hebben.`];
  return [titel, `${n} van de ${lijst.length} monitoren die bij je ${bij} passen ${n === 1 ? "heeft" : "hebben"} ${wat}.`];
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
    <div class="view" data-v="oled"><img class="fill" src="shared/img/scherm/scherm-zwart.webp" alt=""></div>
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
  const id = QID(st);
  if (id === "schermgrootte" || id === "budget") showView("bureaublad");
  else if (id === "gebruik") {
    const u = usages(st);
    cycle %= u.length; showView(u[cycle]);
    if (u.length > 1) cycleTimer = setInterval(() => { cycle = (cycle + 1) % u.length; showView(u[cycle]); }, 2800);
  } else if (id === "game") {
    const [t, sub, hz] = HZ[st.game] ?? ["Verversingssnelheid", "Kies hoe je gamet", 60];
    scr.querySelector("#hzT").innerHTML = `${t}<small>${sub} · ${Math.round(hz * HZ_WINDOW)} beelden per 1/15 seconde</small>`;
    const run = SW - 140;
    scr.querySelector("#hzRow").innerHTML = `<em>${hz} Hz</em>` + frameRow(hz, run);
    const ref = scr.querySelector("#hzRef");
    ref.style.display = hz === 60 ? "none" : "";
    ref.innerHTML = "<em>60 Hz</em>" + frameRow(60, run);
    showView("hz");
  } else if (id === "beeld" && st.beeld.includes("oled")) showView("oled");
  else showView(usages(st)[0]);
}

const quiz = createQuiz3D({
  camera,
  steps: st => vragen(st).length,
  state: { schermgrootte: null, budget: null, gebruik: [], game: null, beeld: [], extra: [] },
  imgPath: n => `monitor/vragen/img/${n}.webp`,
  question: st => {
    const q = vragen(st)[st.q];
    if (q.id === "budget") return { ...q, options: budgetOpties(st.schermgrootte) };
    return { ...q, options: metBeschikbaarheid(st, q.id, q.options) };
  },
  setup, afterRender,
  images: st => ["bureau", mon(st).key + (curved(st) ? "c" : "") + (webcam(st) ? "w" : "")],
  // de ultrawide is te breed voor de standaardzoom op een telefoon
  focus: st => ({ x: 0, y: MY, z: 1.0, zoom: mon(st).key === "34" ? 1.35 : 1.7 }),
  // bij de wensen de monitor iets naar links, zodat de labels er rechts naast passen
  focusDesktop: st => ({ x: 0.02, y: MY, z: 1.0, zoom: st.q === 0 ? 1.3 : bijWensen(st) ? 1.35 : 1.5, anchorX: bijWensen(st) ? 0.54 : 0.64 }),

  overlays(ctx) {
    const { st } = ctx;
    let svg = "", html = "";
    const add = r => { svg += r.svg; html += r.html; };
    const m = mon(st);
    if (st.q === 0 && st.schermgrootte) {
      add(dimLine(ctx, [-m.w / 2, MY, MZ0 + m.h + 0.05], [m.w / 2, MY, MZ0 + m.h + 0.05], `<b>${m.inch}</b> · ${Math.round(m.w * 100)} cm breed`));
    }
    if (bijWensen(st)) {
      const c = corners(st);
      const pts = [];
      if (QID(st) === "beeld") {
        if (st.beeld.includes("oled")) pts.push({ x: m.w * 0.3, y: c[0][1], z: MZ0 + m.h * 0.55, label: "<b>OLED</b>: elke pixel geeft zelf licht, zwart is echt zwart" });
        if (st.beeld.includes("4k")) pts.push({ x: 0, y: c[0][1], z: MZ0 + m.h * 0.8, label: "<b>4K</b>: vier keer zoveel pixels als Full HD" });
        if (st.beeld.includes("gebogen")) pts.push({ x: m.w / 2 - 0.03, y: c[1][1], z: MZ0 + m.h * 0.5, label: "<b>Gebogen</b>: omringt je blikveld" });
      } else {
        if (st.extra.includes("webcam")) pts.push({ x: 0.03, y: MY - 0.006, z: MZ0 + m.h + RAND + 0.0075, noSpot: true, label: "<b>Webcam</b>: videobellen zonder losse camera" });
        if (st.extra.includes("hoogte")) {
          // pijl langs de voet: zo ver gaat het scherm ongeveer omhoog en omlaag
          const a = ctx.toPx(-0.07, MY + 0.05, DZ + 0.03), b = ctx.toPx(-0.07, MY + 0.05, MZ0 - 0.01);
          svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="hoogte"/>`
            + `<path class="hoogte-kop" d="M${b.x - 6} ${b.y + 8} L${b.x} ${b.y} L${b.x + 6} ${b.y + 8} M${a.x - 6} ${a.y - 8} L${a.x} ${a.y} L${a.x + 6} ${a.y - 8}"/>`;
          pts.push({ x: 0.03, y: MY + 0.04, z: DZ + 0.06, label: "<b>In hoogte verstelbaar</b>: vaak zo'n 10 tot 15 cm" });
        }
        if (st.extra.includes("speakers")) pts.push({ x: 0.1, y: MY, z: MZ0 - 0.005, label: "Ingebouwde <b>speakers</b>" });
        if (st.extra.includes("usbc")) pts.push({ x: m.w / 2 - 0.02, y: MY + 0.02, z: MZ0 + 0.03, label: "<b>USB-C</b>: laptop aansluiten én opladen" });
      }
      add(labelKolom(ctx, pts, m.w / 2 + 0.03));
    }
    return { svg, html };
  },

  caption(st) {
    const m = mon(st);
    switch (QID(st)) {
      case "schermgrootte": return st.schermgrootte ? [m.inch, {
        compact: "Compact: past op elk bureau en houdt alles binnen je blikveld.",
        standaard: "De populairste maat: ruim genoeg voor twee vensters naast elkaar.",
        groot: "Extra ruimte voor multitasking, fijn met een diep bureau.",
        ultrawide: "Panoramisch breed: meerdere vensters naast elkaar zonder tweede scherm.",
      }[st.schermgrootte]] : ["Jouw werkplek", "Kies een schermgrootte; de monitor op het bureau wisselt mee."];
      case "budget": return budgetCaption(st);
      case "gebruik": return st.gebruik.length ? ["Jouw gebruik", "Het scherm wisselt tussen wat je gekozen hebt."] : ["Gebruik", "Kies waarvoor je de monitor gebruikt."];
      case "game": return st.game ? [HZ[st.game][0], `${HZ[st.game][1]}. Meer Hz betekent meer tussenbeelden, dus vloeiender en scherper bewegend beeld.`] : ["Gamen", "Kies hoe je gamet en zie hoeveel tussenbeelden je krijgt."];
      default: return wensCaption(st, QID(st));
    }
  },

  onAnswer(st, id) {
    if (id === "gebruik") {
      cycle = Math.max(0, st.gebruik.length - 1);
      if (!st.gebruik.includes("gaming")) st.game = null;
    }
    if (id === "schermgrootte") {
      // andere maat: een eerder gekozen bedrag of gebogen scherm hoort misschien niet meer bij de opties
      if (!budgetOpties(st.schermgrootte).some(o => o.v === st.budget)) st.budget = null;
      if (st.schermgrootte !== "groot") st.beeld = st.beeld.filter(v => v !== "gebogen");
    }
  },
  onNext(st, id) { meetStap(st, id); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = {
      schermgrootte: st.schermgrootte ?? "", budget: capVan(st.budget), gebruik: st.gebruik,
      game: st.gebruik.includes("gaming") ? st.game ?? "" : "", beeld: st.beeld, extraAnswers: st.extra,
    };
    const monitors = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchMonitors(monitors, st.schermgrootte, answers.budget, answers);
    if (answers.budget && !result.bestMatch) result = matchMonitors(monitors, st.schermgrootte, null, answers);
    localStorage.setItem("monitor_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("monitor_bestType", result.bestType ?? "");
    localStorage.setItem("monitor_filteredMatchedMonitors", JSON.stringify(result.filteredMatchedMonitors));
    localStorage.setItem("monitor_answers", JSON.stringify(answers));
    localStorage.setItem("monitor_selectedSizeGroup", st.schermgrootte ?? "");
    localStorage.removeItem("monitor_scores");
    window.location.href = "monitor/resultaat/";
  },

  preload: ["bureau", "27", "24", "32", "34", "27c", "32c", "34c", "27w", "24w", "32w", "34w", "32cw"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "monitor", stap: id, nr: vragen(st).findIndex(q => q.id === id) + 1,
    antwoord: Array.isArray(v) ? [...v].sort().join("+") : String(v ?? ""),
  });
}

// Grijze opties en live tellingen zodra de catalogus binnen is
productsPromise.then(raw => {
  if (!raw?.length) return;
  catalogus = normalizeProducts(raw);
  if (EIS[QID(quiz.st)]) quiz.renderQuestion();
  quiz.render();
});
