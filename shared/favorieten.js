// shared/favorieten.js — favorieten (hartjes) op de resultaatpagina's en de
// favorietenpagina (favorieten/).
//
// Alles staat in de browser van de bezoeker zelf (localStorage), zonder
// account en zonder server. Per favoriet bewaren we alleen categorie + EAN +
// naam: de naam zodat een product dat uit de catalogus verdwijnt nog
// herkenbaar in de lijst blijft staan, de EAN om prijzen en winkels op de
// favorietenpagina altijd vers op te halen (nooit een verouderde prijs).
//
// Het hartje met teller in de menubalk zit in shared/menu.js (op elke
// pagina); die leest dezelfde opslagsleutel.

export const FAV_SLEUTEL = "ph_favorieten";
const HART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** @returns {{cat:string, ean:string, naam:string, toegevoegd:number}[]} */
export function leesFavorieten() {
  try {
    const lijst = JSON.parse(localStorage.getItem(FAV_SLEUTEL) || "[]");
    return Array.isArray(lijst) ? lijst.filter((f) => f && f.cat && f.ean) : [];
  } catch {
    return [];
  }
}

function schrijf(lijst) {
  try {
    localStorage.setItem(FAV_SLEUTEL, JSON.stringify(lijst));
  } catch {
    // Privénavigatie of volle opslag: de knop werkt dan alleen voor deze
    // paginaweergave. Geen foutmelding, de rest van de pagina werkt gewoon.
  }
  werkTellerBij();
}

export function isFavoriet(cat, ean) {
  return leesFavorieten().some((f) => f.cat === cat && f.ean === String(ean));
}

/** Voegt toe of haalt weg; geeft terug of het product nu favoriet is. */
export function toggleFavoriet(cat, ean, naam) {
  const lijst = leesFavorieten();
  const i = lijst.findIndex((f) => f.cat === cat && f.ean === String(ean));
  if (i >= 0) {
    lijst.splice(i, 1);
    schrijf(lijst);
    return false;
  }
  lijst.unshift({ cat, ean: String(ean), naam: String(naam || ""), toegevoegd: Date.now() });
  schrijf(lijst);
  return true;
}

export function voegToe(items) {
  const lijst = leesFavorieten();
  for (const it of items) {
    if (!lijst.some((f) => f.cat === it.cat && f.ean === String(it.ean))) {
      lijst.push({ cat: it.cat, ean: String(it.ean), naam: String(it.naam || ""), toegevoegd: Date.now() });
    }
  }
  schrijf(lijst);
}

/** Hartjesknop voor op een resultaatkaart. */
export function favKnopHtml(cat, ean, naam) {
  if (!ean) return "";
  const aan = isFavoriet(cat, ean);
  const label = aan ? "Verwijder uit favorieten" : "Bewaar in favorieten";
  return `<button type="button" class="fav-btn${aan ? " is-on" : ""}" data-fav-cat="${esc(cat)}" data-fav-ean="${esc(ean)}" data-fav-naam="${esc(naam)}" aria-pressed="${aan}" aria-label="${label}" title="${label}">${HART}</button>`;
}

/** Werkt elke favorieten-teller op de pagina bij (data-fav-teller, data-fav-link). */
export function werkTellerBij() {
  const n = leesFavorieten().length;
  document.querySelectorAll("[data-fav-teller]").forEach((el) => {
    el.textContent = String(n);
  });
  document.querySelectorAll("[data-fav-link]").forEach((el) => {
    el.classList.toggle("has-items", n > 0);
    el.setAttribute("aria-label", n > 0 ? `Favorieten (${n})` : "Favorieten");
  });
}

function toast(tekst) {
  let el = document.querySelector(".fav-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "fav-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.innerHTML = tekst;
  el.classList.add("is-open");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("is-open"), 2600);
}

let gekoppeld = false;

/** Eenmalige, gedelegeerde klikafhandeling voor alle hartjesknoppen. */
export function initFavorieten({ opWijziging } = {}) {
  werkTellerBij();
  if (gekoppeld) return;
  gekoppeld = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".fav-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const aan = toggleFavoriet(btn.dataset.favCat, btn.dataset.favEan, btn.dataset.favNaam);
    document.querySelectorAll(`.fav-btn[data-fav-ean="${CSS.escape(btn.dataset.favEan)}"]`).forEach((b) => {
      b.classList.toggle("is-on", aan);
      b.setAttribute("aria-pressed", String(aan));
      b.setAttribute("aria-label", aan ? "Verwijder uit favorieten" : "Bewaar in favorieten");
      b.title = b.getAttribute("aria-label");
    });
    if (aan) {
      // Kaarthartje én menuhartje even laten oppoppen: zo zie je meteen
      // waar je favorieten naartoe gaan.
      [btn, document.querySelector(".menu-fav")].forEach((el) => {
        if (!el) return;
        el.classList.remove("is-pop");
        void el.offsetWidth;
        el.classList.add("is-pop");
      });
    }
    toast(aan
      ? 'Bewaard in je favorieten · <a href="favorieten/">Bekijk</a>'
      : "Verwijderd uit je favorieten");
    opWijziging?.(btn.dataset.favEan, aan);
  });
}
