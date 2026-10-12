// shared/embed-modus.js — staat deze pagina in de B2B-embed (/embed/)?
//
// Bewust los van shared/klant.js: dat module wacht bij het laden op de
// klantinstellingen (top-level await). Gedeelde code die door ALLE
// categorieën gebruikt wordt (zoals shared/resultaat-kaart.js) hoeft alleen
// te weten óf het een embed is, en mag niet op een netwerkverzoek wachten:
// dan start de rest van de pagina pas ná DOMContentLoaded en blijft hij leeg.
export const isEmbed = location.pathname.includes("/embed/");
