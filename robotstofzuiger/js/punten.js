// robotstofzuiger/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, ja,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";
import { heeftLidarNavigatie, woninggrootteMinLooptijd } from "./data.js";
import { heeftExtra, heeftStation, lijst } from "./matching.js";

const STATION_TEKST = { alles: "station wast dweilpads en vult water bij", zelflegend: "station leegt de stofbak" };
const EXTRA_TEKST = { huisdieren: "veel zuigkracht voor huisdierharen", laag: "past onder lage meubels", drempel: "over hoge drempels" };
const WONING = { gemiddeld: "een hele begane grond", groot: "een grote, open leefruimte" };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidDb ?? NaN,
    looptijd: (p) => p.looptijdMin ?? NaN,
    zuigkracht: (p) => p.zuigkracht ?? NaN,
    hoogte: (p) => p.hoogteMm ?? NaN,
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(r, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const wensen = Array.isArray(a.extraAnswers) ? a.extraAnswers : [];
  const wil = (x) => wensen.includes(x);
  const lidar = heeftLidarNavigatie(r.navigatieType);

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if ((a.station === "zelflegend" || a.station === "alles") && heeftStation(r, a.station) === true) vink("zelflegend", STATION_TEKST[r.station]);
  if (a.vloer === "tapijt" && r.dweilOmhoog === true) vink("dweilen", "dweilpad gaat omhoog op tapijt");
  for (const e of lijst(a.extraAnswers)) if (heeftExtra(r, e) === true) vink(e, EXTRA_TEKST[e]);
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "looptijd", r.looptijdMin ?? NaN, {
    laagBeter: false, overtreffend: "langste", onderwerp: "looptijd",
    fmt: (x) => `<strong>${getal(x)} minuten</strong> accuduur`,
  });
  vergelijk(p, ctx, "geluid", r.geluidDb ?? NaN, {
    laagBeter: true, overtreffend: "stilste", fmt: (x) => `<strong>${getal(x)} dB</strong>`,
    gemMin: 3, gemTekst: (d) => `${getal(d)} dB stiller dan gemiddeld`,
  });
  vergelijk(p, ctx, "zuigkracht", r.zuigkracht ?? NaN, {
    laagBeter: false, overtreffend: "sterkste", onderwerp: "zuigkracht",
    fmt: (x) => `<strong>${getal(x)} Pa</strong> zuigkracht`,
  });
  vergelijk(p, ctx, "hoogte", r.hoogteMm ?? NaN, {
    laagBeter: true, overtreffend: "platste", fmt: (x) => `<strong>${getal(x / 10, 1)} cm</strong> hoog`,
  });
  prijsPunten(p, r, ctx);

  // 3. Accuduur vertaald naar de eigen woning
  const min = woninggrootteMinLooptijd[a.woninggrootte];
  if (WONING[a.woninggrootte] && Number.isFinite(r.looptijdMin) && r.looptijdMin >= min) {
    p.voeg(30, "looptijd", `<strong>${getal(r.looptijdMin)} minuten</strong> accuduur: genoeg voor ${WONING[a.woninggrootte]}`);
  }

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (r.station === "alles") p.voeg(39, "zelflegend", `<strong>Volledig station</strong>: leegt de stofbak en wast de dweilpads`);
  if (r.station === "zelflegend") p.voeg(40, "zelflegend", `<strong>Leegt zichzelf</strong> in het basisstation`);
  if (heeftExtra(r, "laag") === true) p.voeg(44, "hoogte", `<strong>${getal(r.hoogteMm / 10, 1)} cm hoog</strong>: past onder lage meubels`);
  if (lidar) p.voeg(41, "navigatie", `<strong>LiDAR-navigatie</strong>: maakt een plattegrond en zuigt systematisch`);
  if (ja(r.obstakeldetectie)) p.voeg(42, "obstakel", `<strong>Ontwijkt obstakels</strong> zoals snoeren en sokken`);
  if (ja(r.natDweilen)) p.voeg(43, "dweilen", `<strong>Zuigt én dweilt</strong>`);
  if (Number.isFinite(r.looptijdMin)) p.voeg(90, "looptijd", `<strong>${getal(r.looptijdMin)} minuten</strong> op een acculading`);
  if (Number.isFinite(r.zuigkracht)) p.voeg(91, "zuigkracht", `<strong>${getal(r.zuigkracht)} Pa</strong> zuigkracht`);
  if (ja(r.wifi)) p.voeg(92, "wifi", `<strong>Bediening via app</strong>, ook als je niet thuis bent`);
  if (r.merk) p.voeg(93, "merk", `Van <strong>${esc(r.merk)}</strong>`);
  winkelVangnet(p, r);
  return p.top4();
}

export function buildSpecChips(r) {
  const specs = [];
  if (r.natDweilen === "Ja") specs.push("Zuigen + dweilen");
  if (r.zuigkracht) specs.push(`${r.zuigkracht} Pa`);
  if (r.looptijdMin) specs.push(`${r.looptijdMin} min looptijd`);
  if (r.geluidDb) specs.push(`${r.geluidDb} dB`);
  return specs;
}

export function buildAlleSpecs(r, raw) {
  const w = raw || {};
  return schoonSpecs([
    { titel: "Schoonmaken", rijen: [
      ["Zuigkracht", Number.isFinite(r.zuigkracht) ? `${getal(r.zuigkracht)} Pa` : null],
      ["Dweilen", r.natDweilen], ["Stofbak", w.stofcapaciteit], ["HEPA-filter", r.hepaFilter],
      ["Leegt zichzelf", r.zelflegend],
    ] },
    { titel: "Navigatie en accu", rijen: [
      ["Navigatie", r.navigatieType], ["Obstakeldetectie", r.obstakeldetectie],
      ["Accuduur", Number.isFinite(r.looptijdMin) ? `${getal(r.looptijdMin)} minuten` : null],
      ["Accu", w.accuCapaciteit],
      ["Geluid", Number.isFinite(r.geluidDb) ? `${getal(r.geluidDb)} dB` : null],
    ] },
    { titel: "Bediening", rijen: [["Wifi/app", r.wifi], ["Alexa", r.alexa], ["Google Assistent", r.googleAssistent]] },
    { titel: "Afmetingen en overig", rijen: [
      ["Hoogte robot", Number.isFinite(r.hoogteMm) ? `${getal(r.hoogteMm / 10, 1)} cm` : null],
      ["Basisstation", w.basisstationAfmetingen],
      ["Kleur", r.kleur], ["Merk", r.merk], ["EAN", w.ean],
    ] },
  ]);
}
