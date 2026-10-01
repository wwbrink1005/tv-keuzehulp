// Testversie van de vriezer-vragenpagina in de 3D-keuken (dezelfde keuken als
// de koelkast-test). Renders: render/scene.py, --d 1.3. Motor: shared/quiz3d.js.
import { createQuiz3D, makeCamera, dimLine, spotColumn } from "../../shared/quiz3d.js";
import {
  nishoogteGroups, vrijstaandGrootteLabels, vrijstaandGrootteInhoud,
  vrieskistGrootteLabels, vrieskistGrootteInhoud,
} from "../js/data.js";
import { matchVriezers } from "../js/matching.js";
import { normalizeProducts } from "../js/utils.js";
import { fetchProducts } from "../js/supabase.js";

const camera = makeCamera({ camY: -(1.3 + 2.45) });
const productsPromise = fetchProducts().catch(() => null);

// Nishoogtes alleen tonen als er voorraad in die maat is (zelfde regel als de
// huidige keuzehulp); zolang de producten nog laden tonen we alle maten.
let availableNis = null;
productsPromise.then(raw => {
  const set = new Set(normalizeProducts(raw ?? []).filter(v => v.plaatsing === "inbouw" && v.nishoogteGroup).map(v => v.nishoogteGroup));
  if (set.size) availableNis = set;
});

// geometrie (meters, zoals in render/scene.py)
const X0 = -0.31;
const KAST = { klein: { w: 0.55, h: 0.84, yf: -0.63 }, middel: { w: 0.60, h: 1.45, yf: -0.64 }, groot: { w: 0.60, h: 1.86, yf: -0.64 } };
const KIST = { klein: { w: 0.80, h: 0.85, yf: -0.62 }, middel: { w: 1.10, h: 0.85, yf: -0.71 }, groot: { w: 1.50, h: 0.85, yf: -0.76 } };
const KIST_X0 = -0.29;
const INBOUW = { x0: -0.31, x1: 0.29, yf: -0.64, z0: 0.1 };

const Q_PLAATSING = {
  id: "plaatsing", type: "radio",
  title: "Zoek je een inbouw-, vrijstaande of vrieskist-vriezer?",
  sub: "Zie het verschil in dezelfde keuken.",
  why: "Een inbouwvriezer wordt weggewerkt achter een keukenkastje en moet fysiek passen in de nis die daarvoor bedoeld is. Een vrijstaande vriezer (kastmodel) staat rechtop los in de ruimte. Een vrieskist ligt plat, heeft een deksel in plaats van een deur, en is vooral geschikt voor grote hoeveelheden of onregelmatig gevormde etenswaren.",
  options: [
    { v: "inbouw", label: "Inbouw, wegwerken in een keukenkast", price: "€€" },
    { v: "vrijstaand", label: "Vrijstaand kastmodel, rechtop staand", price: "€" },
    { v: "vrieskist", label: "Vrieskist, liggend model", price: "€€" },
  ],
};
const Q_NIS = {
  id: "nishoogte", type: "radio", two: true,
  title: "Wat is de hoogte van je nis?",
  sub: "Meet de binnenhoogte van de opening in je keukenkast. De kast in beeld past zich aan.",
  why: "De hoogte van de nis bepaalt welke inbouwvriezers fysiek in je keukenkast passen. Meet de binnenhoogte van de nis waar de vriezer moet komen, van vloer tot bovenkant van de opening. Weet je het niet precies? Kies de dichtstbijzijnde maat.",
  options: [...nishoogteGroups.map(cm => ({ v: String(cm), label: `${cm} cm`, when: () => !availableNis || availableNis.has(cm) })), { v: "", label: "Weet ik nog niet" }],
};
const grootteQ = kist => ({
  id: "grootte", type: "radio",
  title: kist ? "Welke inhoud heb je nodig?" : "Welk formaat zoek je?",
  sub: "De vriezer wisselt in de keuken, met de maten op ware grootte.",
  why: kist
    ? "Vrieskisten variëren sterk in inhoud. Een kleine kist is prima voor incidenteel invriezen; een middelgrote of grote kist is handig als je structureel veel wilt invriezen of grote, onregelmatig gevormde etenswaren wilt bewaren."
    : "Een kleine/compacte vrieskast past ook in een kleine ruimte, zoals een bijkeuken of studio. Een middelgrote of grote vrieskast biedt meer opbergruimte voor een gezin.",
  options: ["klein", "middel", "groot"].map(v => ({
    v, label: `${(kist ? vrieskistGrootteLabels : vrijstaandGrootteLabels)[v]} <span class="muted">(${(kist ? vrieskistGrootteInhoud : vrijstaandGrootteInhoud)[v]})</span>`,
  })),
});
const Q_GEZIN = {
  id: "gezinsgrootte", type: "radio",
  title: "Voor hoeveel personen vries je in?",
  sub: "Kijk alvast naar binnen: hoeveel ruimte heb je nodig?",
  why: "Hoe meer personen in huis, hoe meer voorraad er meestal in de vriezer moet passen. We houden hiermee rekening bij de inhoud (in liters) die we adviseren, maar filteren nooit zo streng dat je geen passende vriezer meer te zien krijgt.",
  options: [{ v: "klein", label: "Klein huishouden, 1 tot 2 personen", price: "€" }, { v: "gemiddeld", label: "Gemiddeld huishouden, 3 tot 4 personen", price: "€€" }, { v: "groot", label: "Groot huishouden, 5 personen of meer", price: "€€€" }],
};
const Q_EXTRA = {
  id: "extra", type: "check", exclusive: "geen",
  title: "Wat is nog meer belangrijk voor jou?",
  sub: "Je keuzes verschijnen op de vriezer zelf.",
  why: "Energiezuinig betekent een lager verbruik op je energierekening. Stil in gebruik is prettig als de vriezer dicht bij een woon- of slaapkamer staat. No Frost betekent dat je nooit meer handmatig hoeft te ontdooien. Geschikt voor garage/schuur betekent dat de vriezer ook goed werkt in een onverwarmde ruimte.",
  options: [{ v: "energiezuinig", label: "Energiezuinig, laag energieverbruik", price: "€€" }, { v: "stil", label: "Stil in gebruik", price: "€€" }, { v: "nofrost", label: "Nooit ontdooien (No Frost)", price: "€€" }, { v: "garage", label: "Geschikt voor garage/schuur", price: "€" }, { v: "geen", label: "Geen extra wensen", price: "€" }],
};

const SPOT_TEXT = { energiezuinig: "Laag <b>energieverbruik</b>", stil: "Stil: <b>38 dB</b> of minder", nofrost: "<b>No Frost</b>: nooit ontdooien", garage: "Werkt ook in <b>garage of schuur</b>" };
const LITERS = {
  klein: ["1 tot 2 personen", "Een kleine vriezer tot zo'n 150 liter is meestal ruim genoeg."],
  gemiddeld: ["3 tot 4 personen", "Reken op minimaal 150 liter, zodat er ook plek is voor een voorraadje."],
  groot: ["5 personen of meer", "Kies 250 liter of meer. Een grote vrieskast of vrieskist past dan het best."],
};

const size = st => st.grootte || "middel";
const nisCm = st => (st.nishoogte ? parseInt(st.nishoogte, 10) : 178);
const nisTop = st => (nisCm(st) <= 95 ? 0.87 : INBOUW.z0 + nisCm(st) / 100);
// het object in beeld: { x0, w, h, yf } in meters
function obj(st) {
  if (st.plaatsing === "inbouw") return { x0: INBOUW.x0, w: INBOUW.x1 - INBOUW.x0, h: nisTop(st), yf: INBOUW.yf, zb: INBOUW.z0 };
  if (st.plaatsing === "vrieskist") return { x0: KIST_X0, ...KIST[size(st)], zb: 0 };
  return { x0: X0, ...KAST[size(st)], zb: 0 };
}

createQuiz3D({
  camera,
  steps: 4,
  state: { plaatsing: null, nishoogte: null, grootte: null, gezinsgrootte: null, extra: [] },
  imgPath: n => `vriezer/vragen/img/${n}.webp`,
  question: st => [Q_PLAATSING, st.plaatsing === "inbouw" ? Q_NIS : grootteQ(st.plaatsing === "vrieskist"), Q_GEZIN, Q_EXTRA][st.q],

  images(st) {
    if (st.plaatsing === "inbouw") return [`inbouw-${nisCm(st)}`];
    const kind = st.plaatsing === "vrieskist" ? "kist" : "kast";
    return [`${kind}-${size(st)}-${st.q === 2 ? "open" : "dicht"}`];
  },

  focus(st) {
    const o = obj(st);
    return { x: o.x0 + o.w / 2, y: o.yf, z: (o.zb + o.h) / 2, zoom: o.h > 1.2 || o.w > 1 ? 1 : 1.3 };
  },

  overlays(ctx) {
    const { st } = ctx;
    let svg = "", html = "";
    const add = r => { svg += r.svg; html += r.html; };
    const o = obj(st);
    const x1 = o.x0 + o.w;
    if (st.q === 1 && st.plaatsing !== "inbouw" && st.grootte) {
      add(dimLine(ctx, [o.x0, o.yf, o.h + 0.07], [x1, o.yf, o.h + 0.07], `<b>${Math.round(o.w * 100)} cm</b> breed`));
      add(dimLine(ctx, [x1 + 0.08, o.yf, 0], [x1 + 0.08, o.yf, o.h], `<b>${Math.round(o.h * 100)} cm</b> hoog`));
    }
    if (st.q === 1 && st.plaatsing === "inbouw" && st.nishoogte) {
      add(dimLine(ctx, [INBOUW.x1 + 0.08, INBOUW.yf, INBOUW.z0], [INBOUW.x1 + 0.08, INBOUW.yf, nisTop(st)], `nis <b>${nisCm(st)} cm</b>`));
    }
    if (st.q === 3) {
      const keys = ["energiezuinig", "nofrost", "stil", "garage"].filter(k => st.extra.includes(k));
      const inb = st.plaatsing === "inbouw";
      const x = o.x0 + o.w / 2, y = inb ? -0.45 : o.yf;
      add(spotColumn(ctx, keys.map(k => ({ x, y, z: 1, label: SPOT_TEXT[k] })), {
        zBot: o.zb + 0.1, zTop: o.h - 0.1, edgeX: x1, edgeY: o.yf,
      }));
    }
    return { svg, html };
  },

  hideCaption: (st, mobile) => st.q === 3 && !mobile,

  caption(st) {
    switch (st.q) {
      case 0:
        return {
          inbouw: ["Inbouw", "Weggewerkt achter een keukenfront. Hij moet passen in de nis van je keukenkast."],
          vrijstaand: ["Vrijstaand kastmodel", "Rechtop, met laden: overzichtelijk en makkelijk te vinden wat je zoekt."],
          vrieskist: ["Vrieskist", "Liggend met een deksel: veel ruimte, ook voor grote of onregelmatige dingen."],
        }[st.plaatsing] ?? ["Jouw keuken", "Kies het soort vriezer. De keuken verandert mee."];
      case 1:
        if (st.plaatsing === "inbouw") {
          if (st.nishoogte) return [`Nis van ${st.nishoogte} cm`, +st.nishoogte <= 95 ? "Een onderbouwvriezer onder het aanrecht: compact en helemaal weggewerkt." : "De kastkolom heeft een nis op deze hoogte. Alleen vriezers die precies passen tonen we."];
          if (st.nishoogte === "") return ["Nishoogte onbekend", "Geen probleem: we tonen dan alle inbouwvriezers, ongeacht hoogte."];
          return ["Hoogte van de nis", "Meet de binnenhoogte van de opening. De kast in beeld past zich aan je keuze aan."];
        }
        if (st.grootte) {
          const kist = st.plaatsing === "vrieskist";
          const o = obj(st);
          return [(kist ? vrieskistGrootteLabels : vrijstaandGrootteLabels)[st.grootte], `${(kist ? vrieskistGrootteInhoud : vrijstaandGrootteInhoud)[st.grootte]}, ongeveer ${Math.round(o.w * 100)} × ${Math.round(o.h * 100)} cm. Het aanrecht is 90 cm hoog.`];
        }
        return ["Formaat", "Kies een formaat en zie hoe groot hij in de keuken staat."];
      case 2:
        return st.gezinsgrootte ? LITERS[st.gezinsgrootte] : ["Kijk naar binnen", "Hoe meer mensen, hoe meer liter je nodig hebt. Kies je huishouden."];
      default:
        if (st.extra.some(e => e !== "geen")) return ["Jouw extra's", "De gemarkeerde punten laten zien waar je keuzes zitten."];
        return ["Extra's", "Vink aan wat je belangrijk vindt; het verschijnt op de vriezer."];
    }
  },

  onBack(st) { if (st.q === 0) { st.grootte = null; st.nishoogte = null; } },

  async finish(st) {
    const answers = {
      plaatsing: st.plaatsing ?? "",
      nishoogte: st.plaatsing === "inbouw" ? (st.nishoogte ?? "") : "",
      grootte: st.plaatsing !== "inbouw" ? (st.grootte ?? "") : "",
      gezinsgrootte: st.gezinsgrootte ?? "",
      extraAnswers: st.extra,
    };
    const raw = await productsPromise;
    const result = matchVriezers(normalizeProducts(raw ?? []), answers);
    localStorage.setItem("vriezer_bestMatch", JSON.stringify(result.bestMatch));
    localStorage.setItem("vriezer_bestType", result.bestType ?? "");
    localStorage.setItem("vriezer_filteredMatchedVriezers", JSON.stringify(result.filteredMatchedVriezers));
    localStorage.setItem("vriezer_answers", JSON.stringify(answers));
    window.location.href = "vriezer/resultaat";
  },

  preload: ["kast-middel-dicht", "inbouw-178", "kist-middel-dicht", "kast-klein-dicht", "kast-groot-dicht", "kist-klein-dicht", "kist-groot-dicht",
    "kast-middel-open", "kist-middel-open", ...nishoogteGroups.map(n => `inbouw-${n}`)],
});
