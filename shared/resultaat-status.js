// shared/resultaat-status.js — wat de resultaatpagina toont als er (nog) geen
// resultaten zijn. Tijdens het laden staan er grijze voorbeeldkaarten in de
// HTML (.rcard-skelet); die vervangt result.js door de echte kaarten.

/**
 * Er staat geen quizuitslag in deze browser (pagina direct geopend, of de
 * opslag is gewist): uitleg en een knop naar de vragen, in plaats van
 * voorbeeldkaarten die blijven laden.
 */
export function toonGeenUitslag() {
  const grid = document.querySelector("#otherMatchesGrid");
  if (!grid) return;
  const vragen = document.querySelector(".restart-link")?.getAttribute("href")
    || document.body.dataset.vragenUrl
    || "./";
  grid.innerHTML = `
    <div class="resultaat-melding">
      <p class="resultaat-melding-titel">Nog geen resultaten</p>
      <p>Beantwoord eerst de vragen. Daarna zie je hier de producten die bij je passen.</p>
      <a class="resultaat-melding-knop" href="${vragen}">Naar de vragen</a>
    </div>`;
  const teller = document.querySelector("#resultMatchCount");
  if (teller) teller.textContent = "";
}

/**
 * De gekozen filters samen leveren niets op (bv. een merk dat net niet bij de
 * gekozen winkel ligt). Net als bij grote webwinkels: zeggen wat er aan de
 * hand is en één klik om de filters te wissen.
 * @param {HTMLElement} container  #otherMatchesGrid
 * @param {string} meervoud        "tv's", "koelkasten", ...
 */
export function toonGeenFilterResultaat(container, meervoud) {
  if (!container) return;
  container.innerHTML = `
    <div class="resultaat-melding">
      <p class="resultaat-melding-titel">Geen ${meervoud} met deze filters</p>
      <p>Deze combinatie van filters levert niets op. Zet een filter uit, of begin opnieuw met alle ${meervoud} die bij je passen.</p>
      <button type="button" class="resultaat-melding-knop" data-wis-filters>Wis alle filters</button>
    </div>`;
  container.querySelector("[data-wis-filters]")?.addEventListener("click", () => {
    document.querySelector("#clearFiltersBtn")?.click();
  });
}
