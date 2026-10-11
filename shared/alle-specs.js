// shared/alle-specs.js — uitklapbaar "Alle specificaties" onder een
// resultaatkaart. De groepen zelf komen uit buildAlleSpecs() in de
// categorie-eigen {categorie}/js/punten.js.
//
// Twee knoppen per kaart, één onder de spec-chips (desktop) en één onderaan
// de kaart (mobiel); CSS in resultaat.css toont per schermbreedte er één. Het
// blok zelf staat altijd onderaan de kaart over de volle breedte, want in de
// smalle kolom onder de afbeelding is geen ruimte voor de tabel.

import { esc } from "./punten-basis.js";

let specVolgnummer = 0;

/**
 * Zet knop en uitklapblok in een al gerenderde kaart.
 * @param {HTMLElement} kaart  article.rcard
 * @param {{titel:string, rijen:[string,string][]}[]} groepen
 */
export function plaatsAlleSpecs(kaart, groepen) {
  const aantal = (groepen || []).reduce((n, g) => n + g.rijen.length, 0);
  if (!aantal || !kaart || kaart.querySelector(".rspecs-body")) return;

  const id = `rspecs-${++specVolgnummer}`;
  const knop = (plek) => `
    <button type="button" class="rspecs-toggle is-${plek}" aria-expanded="false" aria-controls="${id}">
      <span>Alle specificaties</span>
      <span class="rspecs-count">${aantal}</span>
      <svg class="rspecs-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
    </button>`;

  kaart.querySelector(".rcard-left")?.insertAdjacentHTML("beforeend", knop("links"));

  // Mobiel: voetbalk onderaan de kaart met de twee "meer"-acties naast
  // elkaar. De vergelijkknop is een kopie van die in het winkelblok (zelfde
  // data-providers-id, dus dezelfde gedeelde klikafhandeling); op mobiel
  // verbergt de CSS het origineel, op desktop de hele voetbalk.
  // Kortere tekst dan het origineel: de knop is maar een halve kaart breed.
  const vergelijk = kaart.querySelector(".rcard-shops .rcard-compare");
  const aantalWinkels = vergelijk?.textContent.match(/\d+/)?.[0];
  const vergelijkKopie = vergelijk
    ? `<button type="button" class="rcard-compare rcard-foot-btn" data-providers-id="${esc(vergelijk.dataset.providersId)}">${aantalWinkels ? `Vergelijk ${aantalWinkels} winkels` : "Vergelijk winkels"}</button>`
    : "";
  kaart.insertAdjacentHTML("beforeend", `
    <div class="rcard-foot">${vergelijkKopie}${knop("onder")}</div>
    <div class="rspecs-body" id="${id}" hidden>
      ${groepen.map((g) => `
        <div class="rspecs-group">
          <p class="rspecs-group-title">${esc(g.titel)}</p>
          <dl>${g.rijen.map(([l, w]) => `<div><dt>${esc(l)}</dt><dd>${esc(w)}</dd></div>`).join("")}</dl>
        </div>`).join("")}
    </div>`);
}

let gekoppeld = false;

/** Eenmalige, gedelegeerde klikafhandeling voor alle specificatieknoppen. */
export function initAlleSpecs() {
  if (gekoppeld) return;
  gekoppeld = true;
  document.addEventListener("click", (e) => {
    const knop = e.target.closest(".rspecs-toggle");
    if (!knop) return;
    const blok = document.getElementById(knop.getAttribute("aria-controls"));
    if (!blok) return;
    const open = blok.hidden;
    blok.hidden = !open;
    document.querySelectorAll(`.rspecs-toggle[aria-controls="${blok.id}"]`).forEach((b) => {
      b.setAttribute("aria-expanded", String(open));
    });
  });
}
