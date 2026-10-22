// De soundbar-vragenpagina in de 3D-woonkamer.
// Basisrender = de kamer (render/scene.py, --d 0.9); soundbar (3 breedtes) en
// subwoofer zijn losse transparante renders mét hun schaduw, die als lagen over
// de kamer vallen. De tv is net als in de tv-test een laag die we met dezelfde
// camera op ware grootte op de muur zetten. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn } from "../../shared/quiz3d.js";
import { tvGrootteToBreedteGroup, breedteGroepLabels, BUDGET_CAPS } from "../js/data.js";
import { matchSoundbars, heeftWens, voldoetAanSubwoofer, pastBreedte } from "../js/matching.js";
import { normalizeProducts, parsePrice } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -(0.9 + 2.45), shiftY: -0.14 });
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

// geometrie (meters, zoals in render/scene.py)
const TV_BOTTOM = 0.72, TV_Y = -0.035;
const TV_INCH = { "tot-43": 40, "43-55": 50, "55-plus": 65, "weet-ik-niet": 50 };
const tvDims = inch => ({ w: inch * 0.8716 * 0.0254, h: inch * 0.4903 * 0.0254 });
const BAR_W = { compact: 0.70, gemiddeld: 0.95, groot: 1.20 };
const BAR = { yf: -0.30, z0: 0.55, h: 0.064 };
const SCREEN = { tv: "normaal", films: "films", gaming: "gamen" };

const Q_TV = {
  id: "tvgrootte", type: "radio", two: true,
  title: "Hoe groot is je tv?",
  sub: "De tv hangt op ware grootte boven het meubel.",
  why: "De meeste mensen weten het formaat van hun tv beter dan de gewenste breedte van een soundbar. Op basis van je tv-formaat berekenen we een advies voor de soundbarbreedte. In de volgende stap kun je dit advies zelf nog aanpassen.",
  options: [{ v: "tot-43", label: "Tot 43 inch" }, { v: "43-55", label: "43 tot 55 inch" }, { v: "55-plus", label: "55 inch of groter" }, { v: "weet-ik-niet", label: "Weet ik niet" }],
};
// Sinds okt. 2026 een maximum: een soundbar die iets smaller is, staat ook goed.
const BREEDTE_LABEL = { compact: "Compact, tot 80 cm", gemiddeld: "Gemiddeld, tot 110 cm", groot: "Groot, 110 cm of breder", "weet-ik-niet": "Weet ik niet / maakt niet uit" };
const BREEDTE_PRICE = { compact: "€", gemiddeld: "€€", groot: "€€€", "weet-ik-niet": "€" };
const advised = st => tvGrootteToBreedteGroup[st.tvgrootte] || "gemiddeld";
const Q_BREEDTE = {
  id: "breedte", type: "radio",
  title: "Welke breedte past bij jouw soundbar?",
  sub: st => { const i = breedteGroepLabels[advised(st)]; return `Wij adviseren een ${i.naam} soundbar (${i.omschrijving}). Pas eventueel aan; de soundbar in beeld wisselt mee.`; },
  why: "Op basis van je tv-formaat laten we hier een geadviseerde soundbarbreedte zien. Een vuistregel: de soundbar is het mooist als hij even lang of iets korter is dan je tv. De breedte die je kiest is een maximum: een iets smallere soundbar kan ook, maar hoe dichter bij het advies, hoe beter hij past.",
  options: ["compact", "gemiddeld", "groot", "weet-ik-niet"].map(v => ({ v, label: BREEDTE_LABEL[v], price: BREEDTE_PRICE[v] })),
};
const euro = n => "€" + Math.round(n).toLocaleString("nl-NL");
const Q_BUDGET = {
  id: "budget", type: "radio",
  title: "Wat wil je maximaal uitgeven?",
  sub: "Je krijgt de beste soundbar binnen je budget.",
  why: "Met je budget zoeken we de beste soundbar die je ook echt wilt kopen. Past een soundbar die nog beter bij je wensen past net niet binnen je bedrag, dan laten we dat op de resultaatpagina zien.",
  options: [...BUDGET_CAPS.map(c => ({ v: String(c), label: `Tot ${euro(c)}` })), { v: "geen", label: "Geen voorkeur" }],
};
const Q_GEBRUIK = {
  id: "gebruik", type: "radio",
  title: "Waarvoor ga je de soundbar vooral gebruiken?",
  sub: "Op de tv zie je waar het bij elk gebruik om draait.",
  why: "Je belangrijkste gebruik bepaalt welk type soundbar het beste past. Voor vooral tv-kijken is een eenvoudige, betaalbare soundbar al een grote stap vooruit: stemmen worden veel beter verstaanbaar. Films en series komen het best tot hun recht met meer kanalen en Dolby Atmos. Voor muziek kiezen we een soundbar met een middenkanaal of Atmos voor een vol geluidsbeeld. Bij gamen helpt Dolby Atmos om te horen waar geluid vandaan komt.",
  options: [{ v: "tv", label: "Vooral tv-kijken, spraak beter verstaanbaar", price: "€" }, { v: "films", label: "Films & series met veel impact", price: "€€€" }, { v: "muziek", label: "Muziek luisteren", price: "€€" }, { v: "gaming", label: "Gamen", price: "€€€" }],
};
const Q_SUB = {
  id: "subwoofer", type: "radio",
  title: "Wil je een subwoofer erbij voor diepe bas?",
  sub: "De subwoofer verschijnt naast het meubel.",
  why: "Een subwoofer staat los en verbindt draadloos met de soundbar. Hij zorgt voor mooie, diepe bastonen, ideaal bij actiefilms, games of bas-zware muziek. Sommige soundbars hebben de bas in de bar zelf; die tellen we niet als losse subwoofer. Wil je juist een compacte opstelling zonder extra apparaat, dan kies je liever een soundbar zonder subwoofer.",
  options: [{ v: "ja", label: "Ja, graag stevige bas", price: "€€" }, { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€" }, { v: "nee", label: "Liever compact, geen losse subwoofer", price: "€" }],
};
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen in beeld.",
  why: "Dolby Atmos geeft een omringend geluidsbeeld met hoogte-effecten, zoals in de bioscoop. Losse achterspeakers zet je achter de bank: dan komt het geluid echt van achteren, de grootste stap richting bioscoop. Met WiFi speel je muziek rechtstreeks af via Spotify Connect, AirPlay of Chromecast, zonder tussenkomst van je tv. Aan de muur hangen kan bij vrijwel elke soundbar.",
  options: [{ v: "surround", label: "Realistisch, omringend geluid (Dolby Atmos)", price: "€€€" }, { v: "achter", label: "Losse achterspeakers voor echt surround", price: "€€€" }, { v: "streaming", label: "WiFi/streaming (Spotify, AirPlay)", price: "€€" }, { v: "geen", label: "Geen van deze", price: "€" }],
};
const QUESTIONS = [Q_TV, Q_BREEDTE, Q_BUDGET, Q_GEBRUIK, Q_SUB, Q_EXTRA];
const QID = st => QUESTIONS[st.q]?.id;
const NA = (st, id) => st.q >= QUESTIONS.findIndex(q => q.id === id);   // deze vraag bereikt of voorbij

// ───────── live catalogus: budgettelling en grijze opties ─────────
// Telt de soundbars die je standaard ziet (2+ winkels) binnen de gekozen breedte.
let catalogus = null;
const capVan = v => (v && v !== "geen" ? Number(v) : null);
const binnenBreedte = st => (catalogus ?? []).filter(sb => (sb.aanbieders ?? []).length >= 2 && pastBreedte(sb, st.breedte));
function budgetCaption(st) {
  const cap = capVan(st.budget);
  if (!st.budget) return ["Jouw budget", "Kies wat je maximaal wilt uitgeven. Je krijgt de beste soundbar binnen dat bedrag, en op de resultaatpagina zie je wat meer budget oplevert."];
  if (!catalogus) return [cap ? `Tot ${euro(cap)}` : "Geen voorkeur", cap ? "We zoeken de beste soundbar binnen dit bedrag." : "We kiezen puur op je wensen."];
  const alle = binnenBreedte(st), prijzen = alle.map(sb => parsePrice(sb.prijs));
  const binnen = cap ? prijzen.filter(x => x <= cap) : prijzen;
  const maat = st.breedte === "compact" || st.breedte === "gemiddeld" ? " in deze breedte" : "";
  if (!cap) return ["Geen voorkeur", `Alle ${alle.length} soundbars${maat} doen mee, van ${euro(Math.min(...prijzen))} tot ${euro(Math.max(...prijzen))}. We kiezen puur op je wensen.`];
  if (!binnen.length) return [`Tot ${euro(cap)}`, `Binnen dit bedrag vonden we geen soundbar${maat}. We tonen dan de soundbars die het best bij je passen, net erboven.`];
  return [`Tot ${euro(cap)}`, `${binnen.length} van de ${alle.length} soundbars${maat} kosten ${euro(cap)} of minder, vanaf ${euro(Math.min(...binnen))}. We zoeken de beste die bij je wensen past.`];
}

// Grijs als er binnen breedte en budget geen soundbar bij 2+ winkels is die er
// zeker aan voldoet, samen met het subwooferantwoord en de al aangevinkte
// extra's. Zelfde regel als bij laptop, printer en monitor.
const EIS = {
  subwoofer: { ja: sb => voldoetAanSubwoofer(sb, "ja") === true, nee: sb => voldoetAanSubwoofer(sb, "nee") === true },
  extra: Object.fromEntries(["surround", "achter", "streaming"].map(v => [v, sb => heeftWens(sb, v) === true])),
};
function eisenVan(st, totId, zonder) {
  const eisen = [];
  for (const q of QUESTIONS) {
    // Bij een keuzerondje (subwoofer) is het eigen antwoord geen eis voor de andere opties
    const eigenRadio = q.id === totId && !Array.isArray(st[q.id]);
    if (EIS[q.id] && !eigenRadio) [].concat(st[q.id] ?? []).filter(v => EIS[q.id][v] && (q.id !== totId || v !== zonder)).forEach(v => eisen.push(EIS[q.id][v]));
    if (q.id === totId) break;
  }
  return eisen;
}
function metBeschikbaarheid(st, q) {
  if (!catalogus || !EIS[q.id]) return q;
  const cap = capVan(st.budget), vergelijkbaar = binnenBreedte(st);
  const binnen = cap ? vergelijkbaar.filter(sb => parsePrice(sb.prijs) <= cap) : vergelijkbaar;
  return { ...q, options: q.options.map(o => {
    const eis = EIS[q.id][o.v];
    if (!eis) return o;
    let andere = eisenVan(st, q.id, o.v);
    if (!binnen.some(sb => andere.every(f => f(sb)))) andere = [];
    if (binnen.some(sb => eis(sb) && andere.every(f => f(sb)))) return o;
    const erboven = vergelijkbaar.filter(sb => eis(sb) && andere.every(f => f(sb))).map(sb => parsePrice(sb.prijs));
    const note = cap && erboven.length ? `Niet tot ${euro(cap)}; wel vanaf ${euro(Math.min(...erboven))}.`
      : andere.length && vergelijkbaar.some(eis) ? "Niet in combinatie met je andere keuzes."
      : "Niet in deze breedte.";
    return { ...o, disabled: true, note };
  }) };
}
const WENS_NAAM = { surround: "Dolby Atmos", achter: "losse achterspeakers", streaming: "WiFi-streaming" };
function extraCaption(st) {
  const wensen = st.extra.filter(e => e !== "geen");
  if (!wensen.length) return st.extra.length ? ["Geen extra wensen", "We kiezen puur op je eerdere antwoorden."] : ["Extra's", "Vink aan wat je belangrijk vindt."];
  if (!catalogus) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
  const cap = capVan(st.budget);
  const lijst = binnenBreedte(st).filter(sb => !cap || parsePrice(sb.prijs) <= cap);
  const eisen = eisenVan(st, "extra", null);
  const n = lijst.filter(sb => eisen.every(f => f(sb))).length;
  const wat = eisen.length > 1 ? "alles wat je koos" : WENS_NAAM[wensen[0]];
  const bij = cap ? "breedte en budget" : "breedte";
  if (!n) return ["Jouw extra's", `Geen van de ${lijst.length} soundbars die bij je ${bij} passen heeft ${wat}. We tonen de soundbars die er het meest van hebben.`];
  return ["Jouw extra's", `${n} van de ${lijst.length} soundbars die bij je ${bij} passen ${n === 1 ? "heeft" : "hebben"} ${wat}.`];
}

// Bovenaanzicht van de kamer voor de achterspeakers: die staan achter de bank,
// buiten het camerabeeld. Schematisch, zonder merk of vorm van een bepaald model.
function plattegrond(st) {
  const sub = st.subwoofer && st.subwoofer !== "nee";
  const boog = (x, y, r, a0, a1) => { const p = a => [x + r * Math.cos(a), y + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path class="boog" d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}"/>`; };
  const golven = (x, y, a) => [10, 17, 24].map(r => boog(x, y, r, a - 0.6, a + 0.6)).join("");
  return `<div class="plan"><svg viewBox="0 0 200 160" aria-hidden="true">
    <rect class="muur" x="4" y="4" width="192" height="152" rx="6"/>
    <rect class="meubel" x="52" y="10" width="96" height="14" rx="2"/>
    <rect class="tvlijn" x="64" y="6" width="72" height="3" rx="1.5"/>
    <rect class="spk" x="72" y="14" width="56" height="6" rx="3"/>
    ${golven(100, 20, Math.PI / 2)}
    ${sub ? `<rect class="spk" x="156" y="12" width="14" height="14" rx="3"/>` : ""}
    <rect class="bank" x="56" y="96" width="88" height="22" rx="6"/>
    <rect class="bank rug" x="54" y="116" width="92" height="8" rx="4"/>
    <rect class="spk" x="30" y="134" width="12" height="12" rx="3"/><rect class="spk" x="158" y="134" width="12" height="12" rx="3"/>
    ${golven(36, 134, -Math.PI / 4)}${golven(164, 134, -3 * Math.PI / 4)}
  </svg><p><b>Bovenaanzicht</b>: de achterspeakers staan achter of naast je bank, draadloos verbonden met de soundbar.</p></div>`;
}

const barGroup = st => (st.breedte && st.breedte !== "weet-ik-niet" ? st.breedte : advised(st));
const inch = st => TV_INCH[st.tvgrootte || "43-55"];

// ───────── tv-laag (blijvende elementen, zodat formaatwissels animeren) ─────────
let tvEl, glowEl, scrImg, musicEl, wavesEl;
function setup(scene) {
  glowEl = document.createElement("div"); glowEl.className = "tv-glow";
  tvEl = document.createElement("div"); tvEl.className = "tv";
  tvEl.innerHTML = `<div class="screen"><img alt="" class="is-on"><div class="music"><div class="art"></div><div class="meta"><small>Nu aan het afspelen</small><b>Late Summer</b><span>Nordic Lights</span><i><em></em></i></div></div><div class="sheen"></div></div>`;
  wavesEl = document.createElement("div"); wavesEl.className = "waves"; wavesEl.innerHTML = "<i></i><i></i><i></i>";
  const layers = scene.querySelector(".layers") ?? scene.querySelector("#roomB");
  layers.after(glowEl, tvEl, wavesEl);
  scrImg = tvEl.querySelector("img"); musicEl = tvEl.querySelector(".music");
}

function afterRender(ctx) {
  const { st } = ctx;
  const { w, h } = tvDims(inch(st));
  const tl = ctx.toPx(-w / 2, TV_Y, TV_BOTTOM + h), br = ctx.toPx(w / 2, TV_Y, TV_BOTTOM);
  const pw = br.x - tl.x, ph = br.y - tl.y;
  Object.assign(tvEl.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${pw}px`, height: `${ph}px` });
  tvEl.style.setProperty("--bezel", `${Math.max(1.5, pw * 0.007)}px`);
  tvEl.style.boxShadow = `${-pw * 0.02}px ${pw * 0.022}px ${pw * 0.06}px rgba(55,40,25,.3)`;
  tvEl.classList.add("is-on");
  Object.assign(glowEl.style, { left: `${tl.x - pw * 0.28}px`, top: `${tl.y - ph * 0.35}px`, width: `${pw * 1.56}px`, height: `${ph * 1.7}px`, opacity: ".14" });
  const key = NA(st, "gebruik") && st.gebruik ? st.gebruik : "films";
  const music = key === "muziek";
  musicEl.style.opacity = music ? "1" : "0";
  const src = `shared/img/scherm/scherm-${SCREEN[key] ?? "films"}.webp`;
  if (!music && scrImg.getAttribute("src") !== src) scrImg.src = src;
  glowEl.style.backgroundImage = `url("${src}")`;
  // geluidsgolven uit de soundbar vanaf de gebruiksvraag
  const c = ctx.toPx(0, BAR.yf, BAR.z0 + BAR.h / 2);
  const bw = ctx.toPx(BAR_W[barGroup(st)] / 2, BAR.yf, 0).x - c.x;
  Object.assign(wavesEl.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${bw * 2}px` });
  wavesEl.classList.toggle("is-on", QID(st) === "gebruik" || QID(st) === "subwoofer");
}

const quiz = createQuiz3D({
  camera,
  steps: QUESTIONS.length,
  state: { tvgrootte: null, breedte: null, budget: null, gebruik: null, subwoofer: null, extra: [] },
  imgPath: n => `soundbar/vragen/img/${n}.webp`,
  question: st => metBeschikbaarheid(st, QUESTIONS[st.q]),
  setup, afterRender,

  images(st) {
    const list = ["kamer"];
    if (st.q >= 1) list.push({ name: barGroup(st), opacity: st.breedte === "weet-ik-niet" ? 0.6 : 1 });
    if (NA(st, "subwoofer") && st.subwoofer && st.subwoofer !== "nee") list.push({ name: "sub", opacity: st.subwoofer === "ja" ? 1 : 0.5 });
    return list;
  },

  focus: () => ({ x: 0.1, y: -0.1, z: 0.8, zoom: 1.2 }),

  overlays(ctx) {
    const { st } = ctx;
    let svg = "", html = "";
    const add = o => { svg += o.svg; html += o.html; };
    const { w, h } = tvDims(inch(st));
    if (st.q === 0 && st.tvgrootte) {
      add(dimLine(ctx, [-w / 2, TV_Y, TV_BOTTOM + h + 0.06], [w / 2, TV_Y, TV_BOTTOM + h + 0.06], `tv <b>${inch(st)} inch</b> · ${Math.round(w * 100)} cm breed`));
    }
    if (st.q === 1) {
      add(dimLine(ctx, [-w / 2, TV_Y, TV_BOTTOM + h + 0.06], [w / 2, TV_Y, TV_BOTTOM + h + 0.06], `tv <b>${Math.round(w * 100)} cm</b>`));
      const bw = BAR_W[barGroup(st)];
      const range = breedteGroepLabels[barGroup(st)].omschrijving;
      add(dimLine(ctx, [-bw / 2, -0.43, 0.42], [bw / 2, -0.43, 0.42], `soundbar <b>${range}</b>`));
    }
    if (QID(st) === "extra") {
      const bw = BAR_W[barGroup(st)];
      const pts = [];
      if (st.extra.includes("surround")) pts.push({ x: -bw / 4, y: BAR.yf, z: 0, label: "<b>Dolby Atmos</b>: geluid ook van boven" });
      if (st.extra.includes("streaming")) pts.push({ x: bw / 4, y: BAR.yf, z: 0, label: "<b>WiFi</b>: Spotify, AirPlay, Chromecast" });
      const zb = BAR.z0 + BAR.h / 2;
      add(spotColumn(ctx, pts, { zBot: zb, zTop: zb, edgeX: Math.max(w / 2, bw / 2) + 0.12, edgeY: TV_Y }));
      if (st.extra.includes("achter")) html += plattegrond(st);
    }
    return { svg, html };
  },

  caption(st) {
    const cm = Math.round(tvDims(inch(st)).w * 100);
    switch (QID(st)) {
      case "tvgrootte":
        return st.tvgrootte ? [`Tv van ${inch(st)} inch`, `Rond de ${cm} cm breed. Een soundbar staat het mooist als hij even breed of iets smaller is.`]
          : ["Jouw tv", "Kies het formaat van je tv; de soundbar stemmen we daarop af."];
      case "breedte":
        if (st.breedte === "weet-ik-niet") return ["Geen voorkeur", "We tonen soundbars in alle breedtes. In beeld zie je ons advies."];
        return [BREEDTE_LABEL[barGroup(st)].split(",")[0], `De soundbar is ${breedteGroepLabels[barGroup(st)].omschrijving}; je tv is ${cm} cm breed. Een iets smallere soundbar kan ook.`];
      case "budget": return budgetCaption(st);
      case "gebruik":
        return {
          tv: ["Tv-kijken", "Al een eenvoudige soundbar maakt stemmen veel beter verstaanbaar dan de speakers van je tv."],
          films: ["Films en series", "Meer kanalen en eventueel Dolby Atmos geven echt bioscoopgevoel."],
          muziek: ["Muziek", "Een breed, vol geluidsbeeld en streaming via WiFi maken het af."],
          gaming: ["Gamen", "Surround helpt je te horen waar geluid vandaan komt."],
        }[st.gebruik] ?? ["Gebruik", "Kies waar je de soundbar het meest voor gebruikt."];
      case "subwoofer":
        return {
          ja: ["Met subwoofer", "Een losse, draadloze subwoofer voor diepe bas. Hij staat gewoon naast het meubel."],
          "maakt-niet-uit": ["Maakt niet uit", "We tonen soundbars met en zonder losse subwoofer."],
          nee: ["Zonder subwoofer", "Alles zit in één bar: strak en compact."],
        }[st.subwoofer] ?? ["Subwoofer", "Een subwoofer geeft diepe bas, maar is een extra apparaat in de kamer."];
      default: return extraCaption(st);
    }
  },

  onNext(st, id) { if (id === "tvgrootte" && !st.breedte) st.breedte = advised(st); meetStap(st, id); },
  onBack(st) { if (st.q === 0) st.breedte = null; },
  onHash(st) { if (st.tvgrootte && !st.breedte) st.breedte = advised(st); },

  async finish(st) {
    meetStap(st, "extra");
    const answers = { breedte: st.breedte ?? "", budget: capVan(st.budget), gebruik: st.gebruik ? [st.gebruik] : [], subwoofer: st.subwoofer ?? "", extraAnswers: st.extra };
    const soundbars = normalizeProducts(await productenOfFout());
    // Beste match binnen het budget; past er niets binnen, dan zonder grens.
    let result = matchSoundbars(soundbars, st.breedte, answers.budget, answers);
    if (answers.budget && !result.bestMatch) result = matchSoundbars(soundbars, st.breedte, null, answers);
    localStorage.setItem("soundbar_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("soundbar_bestType", result.bestType ?? "");
    localStorage.removeItem("soundbar_scores");
    localStorage.setItem("soundbar_filteredMatchedSoundbars", JSON.stringify(result.filteredMatchedSoundbars));
    localStorage.setItem("soundbar_answers", JSON.stringify(answers));
    localStorage.setItem("soundbar_selectedBreedteGroup", st.breedte ?? "");
    window.location.href = "soundbar/resultaat/";
  },

  preload: ["kamer", "gemiddeld", "compact", "groot", "sub"],
});

// Meting: waar haken mensen af, en wat kiezen ze (o.a. de budgetvraag)
function meetStap(st, id) {
  const v = st[id];
  window.phTrackEvent?.("quiz_stap", {
    categorie: "soundbar", stap: id, nr: QUESTIONS.findIndex(q => q.id === id) + 1,
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
