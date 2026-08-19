# producthulp.nl / tv

Statische productvergelijkingswebsite met keuzehulpen (quiz-achtige productkeuze-tools):
tv, laptop, monitor, desktop, printer, wasmachine, koelkast, vriezer, soundbar. Geen
build-tool — kale HTML/CSS/JS, ES modules, gehost via GitHub Pages. Data komt uit Supabase,
gevuld door een losse `keuzehulp-pipeline`-repo.

## Nieuwe keuzehulp toevoegen

Krijg je de opdracht "maak een [categorie]-keuzehulp"? Volg **[docs/nieuwe-keuzehulp.md](docs/nieuwe-keuzehulp.md)**
stap voor stap — dat document bevat het volledige stappenplan (Supabase-schema,
pipeline-config, bestandsstructuur, homepage-integratie, zoekbalk) inclusief wat een mens
moet aanleveren (achtergrondafbeelding, feed-sample, Supabase-migratie uitvoeren) versus
wat zelfstandig te doen is. **Stap 3a en stap 5 zijn de belangrijkste secties** — die
bundelen de matching-/data-valkuilen die dit project herhaaldelijk (pas maanden later)
troffen: Icecat-veldnamen die logisch klinken maar niet bestaan (3a), een tier-cascade die
bij een gelijke stand tiers samenvoegt i.p.v. de kleinste niet-lege tier te kiezen (5.1),
en drempelwaardes/tier-verdelingen die nooit tegen de live catalogus zijn gevalideerd
(5.3-5.4). Deze secties zijn net zo relevant bij het **herzien van een bestaande**
keuzehulp als bij het bouwen van een nieuwe — pas dezelfde verificatiestappen toe.

## Kernarchitectuur

- `shared/quiz.css`, `shared/resultaat.css` — gedeelde design-CSS voor alle
  vragen-/resultaatpagina's; pagina-specifieke overrides staan in een inline
  `<style>`-blok dat NA de shared link geladen wordt.
- `shared/zoekbalk.js` — homepage-zoekbalk, matcht op keywords + titel per keuzehulp.
- Alle keuzehulpen staan direct onder de repo-root als `{categorie}/` (bijv. `tv/`,
  `wasmachine/`) — **geen** `keuzehulpen/`-laag meer (die is verwijderd om kortere,
  schonere URL's te krijgen: `producthulp.nl/wasmachine/vragen/` i.p.v.
  `producthulp.nl/keuzehulpen/wasmachine/vragen/`). Let op de nestingsdiepte in
  `<base href="../../">` op de vragen-/resultaatpagina's (2x omhoog), `<base href="../">`
  op de gidspagina (`{categorie}/index.html`, 1x omhoog), en `<base href="../../../">`
  op blogartikelen (`{categorie}/blog/{slug}/index.html`, 3x omhoog).
- Oude `keuzehulpen/{categorie}/...`-URL's die al door Google geïndexeerd waren, hebben
  een lichte redirect-stub gekregen op hun oude locatie (canonical + meta-refresh naar de
  nieuwe URL, zelfde patroon als de stubs voor `contact/`, `privacy/` etc. op de root).
- De vaste pagina's (contact, disclaimer, hoe-werkt-het, over-ons, privacy) staan direct
  onder de repo-root als `{pagina}/` (bijv. `contact/`, `privacy/`) met `<base href="../">`,
  net als de keuzehulp-gidspagina's. De oude `overige-paginas/{pagina}/`-locatie heeft een
  redirect-stub gekregen (zelfde patroon als de `keuzehulpen/`-stubs hierboven).
- Per keuzehulp (`{categorie}/`): `js/data.js` (scoring/tiers), `js/supabase.js`
  (fetch + adaptRow), `js/utils.js` (normalizeProducts/prijsbuckets), `js/matching.js`
  (scoring + tier-cascade met verplichte eindfallback), `js/quiz.js`, `js/result.js`,
  `js/result-filters.js` (secundaire filters op de resultaatpagina).

## Bekende valkuilen (kostte dit project meerdere bugs)

- **Matching mag nooit een lege resultatenlijst teruggeven als er voorraad is** in de
  gekozen prijs/type-combinatie. Elke sub-filter moet gracieus degraderen (0 resultaten
  → sla die wens over) en de tier-cascade moet een expliciete eindfallback hebben.
- **Tier-cascade mag bij een gelijke stand nooit tiers samenvoegen** — dat maakt de
  resultatenlijst juist breder i.p.v. specifieker (trof monitor/laptop/soundbar/tv
  onafhankelijk van elkaar). Kies bij een tie de kleinste niet-lege tier, zie stap 5.1 in
  [docs/nieuwe-keuzehulp.md](docs/nieuwe-keuzehulp.md).
- **Nooit een Icecat-veldnaam in `spec_mapping` zetten omdat hij logisch klinkt** —
  vaak bestaat die simpelweg niet (levert nooit een fout, alleen permanent lege data) of
  heet hij per categorie anders. Altijd verifiëren tegen `icecat_cache`, zie stap 3a in
  [docs/nieuwe-keuzehulp.md](docs/nieuwe-keuzehulp.md).
- **Prijsbuckets altijd vers berekenen op de resultaatpagina**, nooit blind vertrouwen op
  de `localStorage`-snapshot van het quiz-moment (kan te smal zijn door een
  trage/gedeeltelijke fetch tijdens de quiz).
- **Icecat-productafbeeldingen 404'en soms** — alle product-`<img>`'s hebben een
  `onerror`-fallback naar een inline SVG-placeholder (`IMG_FALLBACK` in `result.js`).
- tv/laptop/desktop's `result-filters.js` gebruiken een verbose per-filter-stijl; monitor
  gebruikt een generieke `renderAllFilters()`-stijl — gebruik bij nieuwe keuzehulpen het
  generieke patroon.
- **`buildResultPoints()` moet altijd exact 4 USP-punten teruggeven**, nooit minder — zie
  stap 5.5 in [docs/nieuwe-keuzehulp.md](docs/nieuwe-keuzehulp.md) voor het verplichte
  3-lagen-patroon (specifiek → generieke specs → puur generiek vangnet) en hoe dat te
  testen tegen de volledige live catalogus. TV is het referentiepatroon.
