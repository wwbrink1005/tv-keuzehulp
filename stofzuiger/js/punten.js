// stofzuiger/js/punten.js — kaartinhoud voor resultaat- en favorietenpagina.
// Zelfde opzet als koelkast/js/punten.js; bouwstenen in shared/punten-basis.js.

import {
  esc, getal, cm,
  maakContext, vergelijk, zochtRegel, puntenLijst, prijsPunten, winkelVangnet, schoonSpecs,
} from "../../shared/punten-basis.js";

const LOOPTIJD_MINIMUM = { "60min": 60, "90min": 90 };

export function buildContext(lijst, naam) {
  return maakContext(lijst, naam, {
    geluid: (p) => p.geluidsniveauDb ?? NaN,
    gewicht: (p) => p.gewichtKg ?? NaN,
    looptijd: (p) => p.looptijdMinuten ?? NaN,
    stof: (p) => p.stofcapaciteitLiter ?? NaN,
    bereik: (p) => p.actieradiusMeter ?? NaN,
  });
}

/** "Waarom dit bij jou past": precies 4 punten. */
export function buildResultPoints(s, answers, ctx) {
  const p = puntenLijst();
  const a = answers || {};
  const isSteel = s.stofzuigerType === "Steelstofzuiger";

  // 1. Alle vervulde keuzes in één regel
  const delen = [];
  const vink = (onderwerp, tekst) => { delen.push(`<strong>${tekst}</strong>`); p.gebruikt.add(onderwerp); };
  if (a.vloertype === "tapijt" && s.geschiktTapijt) vink("vloer", "geschikt voor tapijt");
  else if (a.vloertype === "harde_vloer" && s.geschiktHardeVloer) vink("vloer", "geschikt voor harde vloeren");
  else if (a.vloertype === "allebei" && s.geschiktTapijt && s.geschiktHardeVloer) vink("vloer", "tapijt én harde vloer");
  if ((a.huisdieren === "huisdieren" || a.huisdieren === "allergie") && s.heeftHepaFilter) vink("hepa", "HEPA-filter");
  if (a.zak === "met_zak" && s.containerType === "Stofzak") vink("zak", "met stofzak");
  if (a.zak === "zonder_zak" && s.containerType === "Zakloos") vink("zak", "zakloos");
  if (LOOPTIJD_MINIMUM[a.looptijd] && s.looptijdMinuten >= LOOPTIJD_MINIMUM[a.looptijd]) vink("looptijd", `minstens ${LOOPTIJD_MINIMUM[a.looptijd]} minuten accu`);
  zochtRegel(p, delen);

  // 2. Wat deze kaart onderscheidt binnen de lijst
  vergelijk(p, ctx, "geluid", s.geluidsniveauDb ?? NaN, {
    laagBeter: true, overtreffend: "stilste", fmt: (x) => `<strong>${getal(x)} dB</strong>`,
    gemMin: 3, gemTekst: (d) => `${getal(d)} dB stiller dan gemiddeld`,
  });
  vergelijk(p, ctx, "gewicht", s.gewichtKg ?? NaN, {
    laagBeter: true, overtreffend: "lichtste", fmt: (x) => `<strong>${getal(x, 1)} kg</strong>`,
  });
  if (isSteel) {
    vergelijk(p, ctx, "looptijd", s.looptijdMinuten ?? NaN, {
      laagBeter: false, overtreffend: "langste", onderwerp: "looptijd",
      fmt: (x) => `<strong>${getal(x)} minuten</strong> accuduur`,
    });
  } else {
    vergelijk(p, ctx, "bereik", s.actieradiusMeter ?? NaN, {
      laagBeter: false, overtreffend: "grootste", onderwerp: "bereik",
      fmt: (x) => `<strong>${getal(x, 1)} meter</strong> bereik`,
    });
  }
  vergelijk(p, ctx, "stof", s.stofcapaciteitLiter ?? NaN, {
    laagBeter: false, overtreffend: "grootste", onderwerp: "stof",
    fmt: (x) => `<strong>${getal(x, 1)} liter</strong> stofbak`,
  });
  prijsPunten(p, s, ctx);

  // 4. Kenmerken waar niet om gevraagd is, en het vangnet
  if (s.heeftHepaFilter) p.voeg(40, "hepa", `<strong>HEPA-filter</strong>: houdt fijnstof en allergenen vast`);
  if (isSteel && Number.isFinite(s.looptijdMinuten)) p.voeg(41, "looptijd", `<strong>${getal(s.looptijdMinuten)} minuten</strong> op een acculading`);
  if (!isSteel && Number.isFinite(s.actieradiusMeter)) p.voeg(42, "bereik", `<strong>${getal(s.actieradiusMeter, 1)} meter</strong> bereik zonder stekker te verplaatsen`);
  p.voeg(90, "type", isSteel
    ? `<strong>Draadloos</strong>: licht en snel gepakt`
    : `<strong>Met snoer</strong>: krachtig en nooit een lege accu`);
  if (s.containerType) p.voeg(91, "zak", s.containerType === "Stofzak" ? `<strong>Met stofzak</strong>: stofvrij legen` : `<strong>Zakloos</strong>: geen stofzakken kopen`);
  if (Number.isFinite(s.geluidsniveauDb)) p.voeg(92, "geluid", `<strong>${getal(s.geluidsniveauDb)} dB</strong> geluidsniveau`);
  if (Number.isFinite(s.gewichtKg)) p.voeg(93, "gewicht", `Weegt <strong>${getal(s.gewichtKg, 1)} kg</strong>`);
  if (s.merk) p.voeg(94, "merk", `Van <strong>${esc(s.merk)}</strong>`);
  winkelVangnet(p, s);
  return p.top4();
}

export function buildSpecChips(s) {
  const specs = [s.stofzuigerType === "Steelstofzuiger" ? "Steelstofzuiger" : "Cilinderstofzuiger"];
  if (s.containerType) specs.push(s.containerType === "Stofzak" ? "Met stofzak" : "Zonder stofzak");
  if (s.merk) specs.push(s.merk);
  return specs;
}

export function buildAlleSpecs(s, raw) {
  const r = raw || {};
  const mm = (n) => (Number.isFinite(n) && n > 0 ? `${cm(n)} cm` : null);
  const jaNee = (b) => (b === true ? "Ja" : b === false ? "Nee" : null);
  return schoonSpecs([
    { titel: "Zuigen", rijen: [
      ["Type", s.stofzuigerType], ["Opvang", s.containerType],
      ["Stofinhoud", Number.isFinite(s.stofcapaciteitLiter) ? `${getal(s.stofcapaciteitLiter, 1)} liter` : null],
      ["Vermogen", Number.isFinite(s.vermogenWatt) ? `${getal(s.vermogenWatt)} watt` : null],
      ["Filter", r.luchtfiltering || (s.heeftHepaFilter ? "HEPA" : null)],
    ] },
    { titel: "Gebruik", rijen: [
      ["Stroom", r.stroombron],
      ["Accuduur", Number.isFinite(s.looptijdMinuten) ? `${getal(s.looptijdMinuten)} minuten` : null],
      ["Bereik", Number.isFinite(s.actieradiusMeter) ? `${getal(s.actieradiusMeter, 1)} meter` : null],
      ["Geluid", Number.isFinite(s.geluidsniveauDb) ? `${getal(s.geluidsniveauDb)} dB` : null],
      ["Tapijt", jaNee(s.geschiktTapijt)], ["Harde vloer", jaNee(s.geschiktHardeVloer)],
    ] },
    { titel: "Afmetingen en overig", rijen: [
      ["Hoogte", mm(s.hoogteMm)], ["Breedte", mm(s.breedteMm)], ["Diepte", mm(s.diepteMm)],
      ["Gewicht", Number.isFinite(s.gewichtKg) ? `${getal(s.gewichtKg, 1)} kg` : null],
      ["Kleur", s.kleur], ["Merk", s.merk], ["EAN", r.ean],
    ] },
  ]);
}
