// shared/embed-hoogte.js — meldt de hoogte van de embed-pagina aan de site
// van de klant, zodat de iframe kan meegroeien in plaats van een eigen
// scrollbalk te tonen (vooral de resultatenlijst is langer dan het scherm).
//
// Werkt alleen als de klant naast de iframe-regel ook het kleine
// luisterscriptje plakt (zie klanten/proefsite/). Zonder dat script valt het
// terug op de vaste hoogte uit de iframe-regel, met scrollen binnen de iframe.
//
// Gemeten wordt waar de inhoud ophoudt (een onzichtbaar markeerpunt onderaan
// de body), NIET document.scrollHeight: die is nooit kleiner dan de iframe
// zelf, waardoor een eenmaal lange iframe (na de resultatenlijst) nooit meer
// kon krimpen en er een groot leeg vlak onder de vragen bleef staan.
(function () {
  if (window.parent === window) return;

  const eind = document.createElement("div");
  eind.setAttribute("aria-hidden", "true");
  eind.style.cssText = "display:block;clear:both;height:0;margin:0;padding:0;";

  let vorige = 0;
  function meld() {
    if (eind.parentNode !== document.body) document.body.appendChild(eind);
    const hoogte = Math.ceil(eind.getBoundingClientRect().top + window.scrollY);
    if (!hoogte || Math.abs(hoogte - vorige) < 4) return;
    vorige = hoogte;
    window.parent.postMessage({ type: "producthulp-keuzehulp-hoogte", hoogte }, "*");
  }

  function start() {
    document.body.appendChild(eind);
    // body groeit en krimpt mee met de inhoud (documentElement niet altijd).
    new ResizeObserver(meld).observe(document.body);
    // Inhoud die verschijnt zonder dat body van maat verandert (bv. een
    // uitklapblok in een element met vaste hoogte) toch oppikken.
    new MutationObserver(() => requestAnimationFrame(meld))
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
    window.addEventListener("load", meld);
    meld();
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
