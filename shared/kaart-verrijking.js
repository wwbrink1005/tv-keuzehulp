// shared/kaart-verrijking.js — zet het hartje (favorieten) en "Alle
// specificaties" in de al gerenderde resultaatkaarten.
//
// De genormaliseerde producten (uit localStorage of uit result-filters.js)
// hebben geen EAN en missen ruwe velden die het specificatieblok wel wil
// tonen. Daarom koppelen we elk product via zijn winkellinks (per product
// uniek) aan de ruwe rij uit fetchProducts(). fetchProducts() is per
// categorie gememoiseerd, dus dit kost geen extra download naast die van
// result-filters.js.

import { favKnopHtml } from "./favorieten.js";
import { plaatsAlleSpecs } from "./alle-specs.js";

/**
 * @param {object} o
 * @param {string} o.categorie            sleutel in de favorieten ("koelkast")
 * @param {() => Promise<object[]>} o.fetchProducts
 * @param {(k:object, raw:object|null) => object[]} o.buildAlleSpecs
 */
export function maakVerrijker({ categorie, fetchProducts, buildAlleSpecs }) {
  let ruwPerUrl = null;
  const klaar = fetchProducts()
    .then((rows) => {
      ruwPerUrl = new Map();
      for (const row of rows || []) {
        for (const a of row.aanbieders || []) if (a?.url) ruwPerUrl.set(a.url, row);
      }
    })
    .catch(() => { ruwPerUrl = new Map(); });

  function ruwVoor(product) {
    if (!ruwPerUrl) return null;
    for (const a of product.aanbieders || []) {
      const row = ruwPerUrl.get(a.url);
      if (row) return row;
    }
    return null;
  }

  /** Verrijkt elke kaart (article.rcard[data-match-index]) in de container. */
  function verrijk(container, lijst) {
    container.querySelectorAll("article.rcard").forEach((kaart) => {
      const product = lijst[Number(kaart.dataset.matchIndex)];
      if (!product || kaart.dataset.verrijkt) return;
      const raw = ruwVoor(product);
      kaart.dataset.verrijkt = "1";
      if (raw?.ean) kaart.insertAdjacentHTML("afterbegin", favKnopHtml(categorie, raw.ean, product.naam));
      plaatsAlleSpecs(kaart, buildAlleSpecs(product, raw));
    });
  }

  return {
    klaar,
    ruwVoor,
    verrijk,
    /** true zodra de ruwe catalogus binnen is (of definitief mislukt). */
    get isKlaar() { return ruwPerUrl !== null; },
  };
}
