// Testversie van de soundbar-vragenpagina in de 3D-woonkamer.
// Basisrender = de kamer (render/scene.py, --d 0.9); soundbar (3 breedtes) en
// subwoofer zijn losse transparante renders mét hun schaduw, die als lagen over
// de kamer vallen. De tv is net als in de tv-test een laag die we met dezelfde
// camera op ware grootte op de muur zetten. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn } from "../../shared/quiz3d.js";
import { tvGrootteToBreedteGroup, breedteGroepLabels } from "../js/data.js";
import { calculateScores, matchSoundbars } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -(0.9 + 2.45), shiftY: -0.14 });
const productsPromise = fetchProducts().catch(() => null);

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
const BREEDTE_LABEL = { compact: "Compact, tot ongeveer 80 cm", gemiddeld: "Gemiddeld, ongeveer 80 tot 110 cm", groot: "Groot, 110 cm of breder", "weet-ik-niet": "Weet ik niet / maakt niet uit" };
const BREEDTE_PRICE = { compact: "€", gemiddeld: "€€", groot: "€€€", "weet-ik-niet": "€" };
const advised = st => tvGrootteToBreedteGroup[st.tvgrootte] || "gemiddeld";
const Q_BREEDTE = {
  id: "breedte", type: "radio",
  title: "Welke breedte past bij jouw soundbar?",
  sub: st => { const i = breedteGroepLabels[advised(st)]; return `Wij adviseren een ${i.naam} soundbar (${i.omschrijving}). Pas eventueel aan; de soundbar in beeld wisselt mee.`; },
  why: "Op basis van je tv-formaat laten we hier een geadviseerde soundbarbreedte zien. Een vuistregel: de soundbar is het mooist als hij even lang of iets korter is dan je tv. Je kunt dit advies opvolgen of zelf een andere breedte kiezen.",
  options: ["compact", "gemiddeld", "groot", "weet-ik-niet"].map(v => ({ v, label: BREEDTE_LABEL[v], price: BREEDTE_PRICE[v] })),
};
const Q_GEBRUIK = {
  id: "gebruik", type: "radio",
  title: "Waarvoor ga je de soundbar vooral gebruiken?",
  sub: "Op de tv zie je waar het bij elk gebruik om draait.",
  why: "Je belangrijkste gebruik bepaalt welk type soundbar het beste past. Vooral tv-kijken vraagt om een compacte bar die spraak beter verstaanbaar maakt. Films en series komen het best tot hun recht met veel kanalen en eventueel Dolby Atmos. Voor muziek is een breed, krachtig geluidsbeeld belangrijker. Gamen profiteert van surround-geluid om vijanden te kunnen lokaliseren.",
  options: [{ v: "tv", label: "Vooral tv-kijken, spraak beter verstaanbaar", price: "€" }, { v: "films", label: "Films & series met veel impact", price: "€€€" }, { v: "muziek", label: "Muziek luisteren", price: "€€" }, { v: "gaming", label: "Gamen", price: "€€€" }],
};
const Q_SUB = {
  id: "subwoofer", type: "radio",
  title: "Wil je een subwoofer erbij voor diepe bas?",
  sub: "De subwoofer verschijnt naast het meubel.",
  why: "Een subwoofer staat los en verbindt draadloos met de soundbar. Hij zorgt voor mooie, diepe bastonen, ideaal bij actiefilms, games of bas-zware muziek. Wil je juist een compacte opstelling zonder extra apparaat, dan kies je liever een soundbar zonder subwoofer.",
  options: [{ v: "ja", label: "Ja, graag stevige bas", price: "€€" }, { v: "maakt-niet-uit", label: "Maakt niet uit", price: "€" }, { v: "nee", label: "Liever compact, geen losse subwoofer", price: "€" }],
};
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen in beeld.",
  why: "Dolby Atmos/surround geeft een realistischer, omringend geluidsbeeld met hoogte-effecten, zoals in de bioscoop. Wandmontage is handig als je de soundbar niet op een meubel wilt neerzetten. WiFi/streaming laat je rechtstreeks muziek afspelen via Spotify Connect, AirPlay of Chromecast, zonder tussenkomst van je tv.",
  options: [{ v: "surround", label: "Realistisch, omringend geluid (Dolby Atmos)", price: "€€€" }, { v: "wandmontage", label: "Ik wil 'm aan de muur hangen", price: "€€" }, { v: "streaming", label: "WiFi/streaming (Spotify, AirPlay)", price: "€€" }, { v: "geen", label: "Geen van deze", price: "€" }],
};
const QUESTIONS = [Q_TV, Q_BREEDTE, Q_GEBRUIK, Q_SUB, Q_EXTRA];

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
  const key = st.q >= 2 ? st.gebruik : "films";
  const music = key === "muziek";
  musicEl.style.opacity = music ? "1" : "0";
  const src = `shared/img/scherm/scherm-${SCREEN[key] ?? "films"}.webp`;
  if (!music && scrImg.getAttribute("src") !== src) scrImg.src = src;
  glowEl.style.backgroundImage = `url("${src}")`;
  // geluidsgolven uit de soundbar vanaf de gebruiksvraag
  const c = ctx.toPx(0, BAR.yf, BAR.z0 + BAR.h / 2);
  const bw = ctx.toPx(BAR_W[barGroup(st)] / 2, BAR.yf, 0).x - c.x;
  Object.assign(wavesEl.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${bw * 2}px` });
  wavesEl.classList.toggle("is-on", st.q >= 2 && st.q <= 3);
}

createQuiz3D({
  camera,
  steps: 5,
  state: { tvgrootte: null, breedte: null, gebruik: null, subwoofer: null, extra: [] },
  imgPath: n => `soundbar/vragen/img/${n}.webp`,
  question: st => QUESTIONS[st.q],
  setup, afterRender,

  images(st) {
    const list = ["kamer"];
    if (st.q >= 1) list.push({ name: barGroup(st), opacity: st.breedte === "weet-ik-niet" ? 0.6 : 1 });
    if (st.q >= 3 && st.subwoofer && st.subwoofer !== "nee") list.push({ name: "sub", opacity: st.subwoofer === "ja" ? 1 : 0.5 });
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
    if (st.q === 4) {
      const bw = BAR_W[barGroup(st)];
      const pts = [];
      if (st.extra.includes("surround")) pts.push({ x: -bw / 4, y: BAR.yf, z: 0, label: "<b>Dolby Atmos</b>: geluid ook van boven" });
      if (st.extra.includes("streaming")) pts.push({ x: bw / 4, y: BAR.yf, z: 0, label: "<b>WiFi</b>: Spotify, AirPlay, Chromecast" });
      if (st.extra.includes("wandmontage")) pts.push({ x: 0, y: -0.02, z: 0, label: "Kan ook <b>aan de muur</b>, onder de tv" });
      const zb = BAR.z0 + BAR.h / 2;
      add(spotColumn(ctx, pts, { zBot: zb, zTop: zb, edgeX: Math.max(w / 2, bw / 2) + 0.12, edgeY: TV_Y }));
    }
    return { svg, html };
  },

  hideCaption: (st, mobile) => st.q === 4 && !mobile,

  caption(st) {
    const cm = Math.round(tvDims(inch(st)).w * 100);
    switch (st.q) {
      case 0:
        return st.tvgrootte ? [`Tv van ${inch(st)} inch`, `Rond de ${cm} cm breed. Een soundbar staat het mooist als hij even breed of iets smaller is.`]
          : ["Jouw tv", "Kies het formaat van je tv; de soundbar stemmen we daarop af."];
      case 1:
        if (st.breedte === "weet-ik-niet") return ["Geen voorkeur", "We tonen soundbars in alle breedtes. In beeld zie je ons advies."];
        return [BREEDTE_LABEL[barGroup(st)].split(",")[0], `De soundbar is ${breedteGroepLabels[barGroup(st)].omschrijving}; je tv is ${cm} cm breed.`];
      case 2:
        return {
          tv: ["Tv-kijken", "Een soundbar met spraakverbetering maakt stemmen duidelijk verstaanbaar, ook zachtjes."],
          films: ["Films en series", "Meer kanalen en eventueel Dolby Atmos geven echt bioscoopgevoel."],
          muziek: ["Muziek", "Een breed, vol geluidsbeeld en streaming via WiFi maken het af."],
          gaming: ["Gamen", "Surround helpt je te horen waar geluid vandaan komt."],
        }[st.gebruik] ?? ["Gebruik", "Kies waar je de soundbar het meest voor gebruikt."];
      case 3:
        return {
          ja: ["Met subwoofer", "Een losse, draadloze subwoofer voor diepe bas. Hij staat gewoon naast het meubel."],
          "maakt-niet-uit": ["Maakt niet uit", "We tonen soundbars met en zonder losse subwoofer."],
          nee: ["Zonder subwoofer", "Alles zit in één bar: strak en compact."],
        }[st.subwoofer] ?? ["Subwoofer", "Een subwoofer geeft diepe bas, maar is een extra apparaat in de kamer."];
      default:
        if (st.extra.some(e => e !== "geen")) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
        return ["Extra's", "Vink aan wat je belangrijk vindt."];
    }
  },

  onNext(st, id) { if (id === "tvgrootte" && !st.breedte) st.breedte = advised(st); },
  onBack(st) { if (st.q === 0) st.breedte = null; },
  onHash(st) { if (st.tvgrootte && !st.breedte) st.breedte = advised(st); },

  async finish(st) {
    const answers = { breedte: st.breedte ?? "", gebruik: st.gebruik ? [st.gebruik] : [], subwoofer: st.subwoofer ?? "", extraAnswers: st.extra };
    const scores = calculateScores(answers);
    const raw = await productsPromise;
    const result = matchSoundbars(normalizeProducts(raw ?? []), st.breedte, null, answers, scores);
    localStorage.setItem("soundbar_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("soundbar_bestType", result.bestType ?? "");
    localStorage.setItem("soundbar_scores", JSON.stringify(scores));
    localStorage.setItem("soundbar_filteredMatchedSoundbars", JSON.stringify(result.filteredMatchedSoundbars));
    localStorage.setItem("soundbar_answers", JSON.stringify(answers));
    localStorage.setItem("soundbar_selectedBreedteGroup", st.breedte ?? "");
    window.location.href = "soundbar/resultaat";
  },

  preload: ["kamer", "gemiddeld", "compact", "groot", "sub"],
});
