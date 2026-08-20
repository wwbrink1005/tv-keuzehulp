// shared/mobile-filter-fab.js — zwevende "Filters"-knop op mobiel, verschijnt
// zodra de originele filterknop (.filter-toggle in de title-bar) buiten
// beeld is gescrolld. Hergebruikt gewoon een klik op die bestaande knop
// (elke categorie verbindt die zelf al aan het openen van #filtersPanel,
// zie result-ui.js) — hier wordt alleen zichtbaarheid + de knop zelf
// toegevoegd, geen eigen open/dicht-logica.
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var filterToggle = document.querySelector(".filter-toggle");
    if (!filterToggle) return;

    var fab = document.createElement("button");
    fab.type = "button";
    fab.className = "mobile-filter-fab";
    fab.setAttribute("aria-label", "Open filters");
    fab.innerHTML =
      '<i data-lucide="sliders-horizontal" aria-hidden="true"></i><span>Filters</span>';
    fab.addEventListener("click", function (event) {
      // Zonder dit borrelt de klik door naar document, waar result-ui.js een
      // "klik buiten het paneel sluit het weer"-listener heeft die deze knop
      // niet als onderdeel van het paneel herkent — het paneel ging daardoor
      // open en meteen weer dicht binnen dezelfde klik.
      event.stopPropagation();
      filterToggle.click();
    });
    document.body.appendChild(fab);

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }

    if (!("IntersectionObserver" in window)) return;

    var observer = new IntersectionObserver(
      function (entries) {
        var visible = entries[0].isIntersecting;
        fab.classList.toggle("is-visible", !visible);
      },
      { threshold: 0 }
    );
    observer.observe(filterToggle);
  });
})();
