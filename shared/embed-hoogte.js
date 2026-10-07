// shared/embed-hoogte.js — meldt de hoogte van de embed-pagina aan de site
// van de klant, zodat de iframe kan meegroeien in plaats van een eigen
// scrollbalk te tonen (vooral de resultatenlijst is langer dan het scherm).
//
// Werkt alleen als de klant naast de iframe-regel ook het kleine
// luisterscriptje plakt (zie klanten/proefsite/). Zonder dat script valt het
// terug op de vaste hoogte uit de iframe-regel, met scrollen binnen de iframe.
(function () {
  if (window.parent === window) return;
  let vorige = 0;
  function meld() {
    const hoogte = Math.ceil(document.documentElement.scrollHeight);
    if (Math.abs(hoogte - vorige) < 4) return;
    vorige = hoogte;
    window.parent.postMessage({ type: "producthulp-keuzehulp-hoogte", hoogte }, "*");
  }
  new ResizeObserver(meld).observe(document.documentElement);
  window.addEventListener("load", meld);
})();
