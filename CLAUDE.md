# producthulp.nl / tv-keuzehulp

Statische productvergelijkingswebsite met keuzehulpen (quiz-achtige productkeuze-tools):
tv, laptop, monitor, desktop. Geen build-tool — kale HTML/CSS/JS, ES modules, gehost via
GitHub Pages. Data komt uit Supabase, gevuld door een losse `keuzehulp-pipeline`-repo.

## Nieuwe keuzehulp toevoegen

Krijg je de opdracht "maak een [categorie]-keuzehulp"? Volg **[docs/nieuwe-keuzehulp.md](docs/nieuwe-keuzehulp.md)**
stap voor stap — dat document bevat het volledige stappenplan (Supabase-schema,
pipeline-config, bestandsstructuur, matching-fallback-logica, homepage-integratie,
zoekbalk) inclusief wat een mens moet aanleveren (achtergrondafbeelding, feed-sample,
Supabase-migratie uitvoeren) versus wat zelfstandig te doen is.

## Kernarchitectuur

- `shared/quiz.css`, `shared/resultaat.css` — gedeelde design-CSS voor alle
  vragen-/resultaatpagina's; pagina-specifieke overrides staan in een inline
  `<style>`-blok dat NA de shared link geladen wordt.
- `shared/zoekbalk.js` — homepage-zoekbalk, matcht op keywords + titel per keuzehulp.
- Alle keuzehulpen staan onder `keuzehulpen/{categorie}-keuzehulp/` (bijv.
  `keuzehulpen/tv-keuzehulp/`) — let op de extra nestingsdiepte in `<base href="../../../">`
  op de vragen-/resultaatpagina's (3x omhoog i.p.v. 2x).
- De vaste pagina's (contact, disclaimer, hoe-werkt-het, over-ons, privacy) staan onder
  `overige-paginas/` met `<base href="../../">` (2x omhoog i.p.v. 1x).
- Per keuzehulp (`keuzehulpen/{categorie}-keuzehulp/`): `js/data.js` (scoring/tiers), `js/supabase.js`
  (fetch + adaptRow), `js/utils.js` (normalizeProducts/prijsbuckets), `js/matching.js`
  (scoring + tier-cascade met verplichte eindfallback), `js/quiz.js`, `js/result.js`,
  `js/result-filters.js` (secundaire filters op de resultaatpagina).

## Bekende valkuilen (kostte dit project meerdere bugs)

- **Matching mag nooit een lege resultatenlijst teruggeven als er voorraad is** in de
  gekozen prijs/type-combinatie. Elke sub-filter moet gracieus degraderen (0 resultaten
  → sla die wens over) en de tier-cascade moet een expliciete eindfallback hebben.
- **Prijsbuckets altijd vers berekenen op de resultaatpagina**, nooit blind vertrouwen op
  de `localStorage`-snapshot van het quiz-moment (kan te smal zijn door een
  trage/gedeeltelijke fetch tijdens de quiz).
- **Icecat-productafbeeldingen 404'en soms** — alle product-`<img>`'s hebben een
  `onerror`-fallback naar een inline SVG-placeholder (`IMG_FALLBACK` in `result.js`).
- tv/laptop/desktop's `result-filters.js` gebruiken een verbose per-filter-stijl; monitor
  gebruikt een generieke `renderAllFilters()`-stijl — gebruik bij nieuwe keuzehulpen het
  generieke patroon.
