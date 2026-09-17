// shared/info-figuren.js — verbergt een foto-blok op de algemene pagina's
// (over-ons, hoe-werkt-het, ...) zodra de afbeelding niet geladen kan worden.
//
// Waarom: de teksten en de fotoposities zijn geschreven vóórdat de foto's zelf
// bestonden. Zonder dit script staat er op elke plek waar nog geen bestand
// ligt een gebroken-afbeelding-icoon. Nu valt zo'n blok simpelweg weg en leest
// de pagina alsof die foto er nooit gepland was — zodra het bestand er wél is,
// verschijnt de foto vanzelf zonder dat er iets aangepast hoeft te worden.
//
// Een .info-split verliest alleen zijn beeldkolom (de tekst ernaast blijft en
// gaat over de volle breedte); een losse .info-figure verdwijnt helemaal.

function verbergBlok(img) {
  const split = img.closest(".info-split");
  if (split) {
    split.style.gridTemplateColumns = "1fr";
    img.closest(".info-split-media")?.remove();
    return;
  }
  img.closest(".info-figure")?.remove();
}

document.querySelectorAll(".info-figure img, .info-split-media img").forEach((img) => {
  // Het script draait met `defer`, dus een snelle 404 kan al gebeurd zijn
  // voordat we een listener kunnen koppelen — vandaar ook de directe check.
  if (img.complete && img.naturalWidth === 0) {
    verbergBlok(img);
    return;
  }
  img.addEventListener("error", () => verbergBlok(img));
});
