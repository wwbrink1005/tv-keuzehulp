# Runbook: een nieuwe keuzehulp bouwen

Dit document is bedoeld voor een AI (of ontwikkelaar) die de opdracht krijgt: **"maak een
[categorie]-keuzehulp"** (bijv. wasmachine, koelkast, soundbar). Volg dit stap voor stap.
Alle bestaande keuzehulpen (tv, laptop, monitor, desktop) volgen exact dit patroon —
gebruik ze als referentie-implementatie, kopieer niet blind maar begrijp waarom elk stuk
er zo uitziet.

## 0. Wat een mens moet aanleveren (kan de AI niet zelf)

- **Achtergrondafbeelding** voor de vragen-pagina (`.background-container`) — creatieve
  keuze, geen data-taak.
- **Supabase-migratie uitvoeren.** De AI kan het `CREATE TABLE`-script schrijven, maar
  heeft alleen de publieke anon (read-only) key. Uitvoeren vereist de Supabase
  service-key/dashboard-toegang van de eigenaar.
- **Een feed-sample of feed-URL** voor de nieuwe categorie (Coolblue/Expert affiliate
  export). De kolomstructuur van deze feeds is niet ergens gedocumenteerd — de AI kan de
  mapping zelf afleiden zodra hij een echt voorbeeld ziet, maar niet uit het niets.

Alles hieronder kan een AI met repo-toegang (en voor Supabase-uitvoering: een
service-key) zelfstandig doen.

## 1. Supabase — nieuw schema

Maak een tabel `{categorie}` (bijv. `wasmachines`) met dit patroon, gebaseerd op de
bestaande tabellen (`televisies`, `laptops`, `monitoren`, `desktops`):

- `ean` (primary key-achtig, tekst)
- `merk`
- `coolblue_naam`, `coolblue_prijs`, `coolblue_affiliate_link`, `coolblue_levertijd`,
  `coolblue_bezorgkosten`, `coolblue_afbeelding`
- `expert_naam`, `expert_prijs`, `expert_affiliate_link`, `expert_levertijd`,
  `expert_bezorgkosten`, `expert_afbeelding`
- `icecat_afbeelding`, `icecat_afbeeldingen` (array)
- Categorie-specifieke spec-kolommen — bepaal deze via Icecat (zie stap 3), niet vooraf
  verzinnen.

De anon (read-only) key staat al in elke `js/supabase.js` — die mag herbruikt worden voor
lees-queries tijdens onderzoek. Voor het aanmaken van de tabel is de service-key nodig
(zit als GitHub-secret bij de pipeline-repo, niet in deze repo).

## 2. Pipeline-repo (`keuzehulp-pipeline`, los van deze repo)

1. **`config.py`**: nieuwe categorie toevoegen met:
   - feed-bronnen (Coolblue/Expert export-URLs voor deze categorie)
   - `spec_mapping` (feed-kolom → Supabase-kolom)
   - `categorie_filter` (welke feed-rijen horen bij deze categorie)
   - eventueel `categorie_veld_naam` als er, net als bij desktops, een aparte
     productcategorie-classificatie nodig is
2. **`enrich_icecat.py`**: Icecat-categorie-ID opzoeken en de features/specs bepalen
   (zie stap 3 hieronder — dit kan de AI zelf via de Icecat-API).
3. **`fetch_feeds.py`, `merge_publish.py`, `run_pipeline.py`** zijn generiek/config-
   gedreven — normaliter geen wijzigingen nodig, ze pikken de nieuwe categorie automatisch
   op uit `config.py`.
4. **`.github/workflows/pipeline.yml`**: checken of de nieuwe categorie in de
   cron-matrix/lijst moet worden opgenomen.

## 3. Icecat-specs bepalen (grotendeels AI-zelfstandig)

Met de bestaande Icecat-API-credentials uit de pipeline:
1. Zoek de juiste Icecat-categorie-ID voor de nieuwe productcategorie.
2. Vraag de featurelijst voor die categorie op.
3. Test tegen een paar echte producten welke features daadwerkelijk gevuld zijn.
4. Pas dezelfde vuistregel toe als bij filters (zie stap 6): alleen features meenemen
   die "zo goed als volledig" gevuld zijn én genoeg variatie hebben om nuttig te zijn.

## 4. Website: nieuwe map `keuzehulpen/{categorie}/`

Alle keuzehulpen staan onder de map `keuzehulpen/` (bijv. `keuzehulpen/wasmachine/`).
Kopieer de structuur van een bestaande keuzehulp (bij voorkeur **monitor** als
basis voor `result-filters.js` — die gebruikt een generieke `renderAllFilters()`-stijl,
in tegenstelling tot tv/laptop/desktop's verbose per-filter-functie-stijl, die dit
project meermaals bugs heeft opgeleverd bij onderhoud):

- `vragen/index.html` en `resultaat/index.html` zitten 3 mappen diep vanaf de repo-root
  (`keuzehulpen/{categorie}/vragen/index.html`), dus `<base href="../../../">`
  (3x omhoog, niet 2x) — dit is de meest voorkomende fout bij het kopiëren van een
  bestaande pagina.
- `vragen/index.html` — dunne pagina, `<link rel="stylesheet" href="shared/quiz.css">` (dankzij
  `<base href>` zijn alle relatieve paden in de pagina al t.o.v. de repo-root),
  categorie-specifieke vragen (gebruik, budget, formaat, etc.), "Keuzehulp uitleg"-tekst.
- `resultaat/index.html` — `<link>` naar `shared/resultaat.css`, filter-card-skeleton,
  lightbox-script (image-preview met thumbnails), "Over deze keuzehulp"-infokaart.
- `js/data.js` — scoringsysteem (`scoringSystem`), tier-namen (`TIER_ORDER`),
  prijsgroepen, size/type-classificatiefuncties.
- `js/supabase.js` — `adaptRow()` (ruwe Supabase-kolommen → interne vorm, met
  parse-helpers voor rommelige stringwaarden), `fetchProducts()` met paginering en
  EAN-deduplicatie (kopieer dit deel vrijwel 1-op-1, is generiek).
- `js/utils.js` — `normalizeProducts()` (validatie + shape), `computeDynamicPriceGroups()`
  (percentiel-gebaseerde prijsbucket-berekening — generiek, 1-op-1 te hergebruiken).
- `js/matching.js` — scoring + tier-cascade. **Kritiek:** bouw altijd een eindfallback in
  (zie stap 5) — dit was de bron van meerdere bugs dit project.
- `js/quiz.js` — vraag-navigatie, dynamische prijs-opties.
- `js/result.js` — kaart-rendering, best-match card. Gebruik de gedeelde
  `IMG_FALLBACK`-placeholder (inline SVG data-URI) met `onerror`-handler op alle
  product-`<img>`-tags — Icecat-afbeeldingen 404'en soms.
- `js/result-filters.js` — secundaire filters, zie stap 6.

## 5. Matching-logica: verplichte eindfallback

Elke `match{Categorie}()`-functie moet, na de tier-cascade, een fallback hebben voor het
geval geen enkele tier iets oplevert binnen de gekozen prijs/type-combinatie:

```js
if (matchedItems.length === 0) {
  let fallback = applyExtraFilter1(filtered, ...);
  fallback = applyExtraFilter2(fallback, ...);
  if (fallback.length === 0) fallback = [...filtered];
  matchedItems = fallback;
  bestType = "Algemeen";
}
```

Zonder deze fallback kan een prijscategorie met wél voorraad toch "geen resultaten"
teruggeven. Elke sub-filter (opslag, extra's, formaat, …) moet zelf ook al gracieus
degraderen: "als deze wens 0 resultaten oplevert, sla 'm over" — nooit hard filteren tot
leeg.

## 6. Filter-uitbreiding (pas ná livegang, met echte data)

Volg dezelfde cyclus als bij de bestaande 4:
1. Bevraag de Supabase-tabel op vullingspercentage en waarde-variatie per kolom.
2. Stel kandidaten voor die "zo goed als volledig" zijn (~90%+) én genoeg variatie hebben
   (een kolom die 95%+ van de tijd dezelfde waarde heeft is geen nuttig filter).
3. Laat de eigenaar kiezen, implementeer daarna pas.

**Prijscategorieën in het filtermenu:**
- Alle prijsbuckets met minstens 1 match blijven altijd zichtbaar (nooit verbergen).
- Standaard geselecteerde bucket: als de gebruiker in de quiz een prijs koos → die
  (indien nog geldig). Zo niet (of "geen voorkeur") → de goedkoopste bucket die nog een
  product van de hoogst-scorende tier bevat (`getIdealTierSet`/`getIdealTypeSet` in
  `matching.js`) — dus je gebruiksantwoorden bepalen de prijsklasse, niet andersom.
- **Bereken prijsbuckets altijd vers op de resultaatpagina** vanuit de zojuist opgehaalde
  catalogus (`computeDynamicPriceGroups(items, ...)`), vertrouw nooit blind op de
  `localStorage`-snapshot van het quiz-moment — die kan te smal zijn geweest door een
  trage/gedeeltelijke fetch tijdens de quiz.

## 7. Homepage-integratie (`index.html`, `shared/menu.js`, `shared/footer.js`)

Voeg de nieuwe categorie toe op **alle** onderstaande plekken (grep op een bestaande
categorienaam zoals "desktop" om ze allemaal te vinden — dit raakt zowel `index.html` als
de gedeelde `shared/menu.js` en `shared/footer.js`):
- mobiele categorie-chips (`.mobile-cat-chip`)
- hero-categorieënlijst (`.hero-cat-item`)
- populaire-keuzehulpen kaarten (`.pop-card`)
- collage-tooltips (`.collage-tooltip-link`)
- categorieën-dropdown in de header (`shared/menu.js`)
- footer-link (`shared/footer.js`)
- kies een passend Lucide-icoon

## 8. Zoekbalk (`shared/zoekbalk.js`)

Voeg een nieuwe entry toe aan de `keuzehulpen`-array:

```js
{
  title: "Wasmachine keuzehulp",
  keywords: ["wasmachine", "wasmachines", "wasautomaat", "wasautomaten"],
  url: "keuzehulpen/wasmachine/vragen",
},
```

Denk aan synoniemen/varianten die mensen echt zouden typen (niet alleen de letterlijke
categorienaam) — de matching-functie (`matchesQuery`) zoekt op substring in zowel
keywords als titel, dus brede dekking in de keywords-lijst is de plek om dit goed te
doen.

## 9. Verificatie vóór oplevering

- Doorloop de quiz lokaal volledig (alle vragen, terug-knop, dynamische opties).
- Check dat de resultaatpagina dezelfde soort producten/filters toont als verwacht.
- Test minstens één "geen voorkeur"-scenario voor prijs: klopt de default-selectie?
- Test de zoekbalk met een paar synoniemen.
- Check mobiele weergave van de (mogelijk lange) filter-sidebar.

## 10. SEO-checklist (verplicht bij elke nieuwe categorie)

Elke nieuwe keuzehulp moet vanaf dag 1 dezelfde SEO-basis hebben als de bestaande zes —
dit hoort er standaard bij, niet als los, later toe te voegen werk:

- **`<title>`** op `vragen/index.html`: uniek, patroon `"{Categorie} Keuzehulp – Vind jouw
  perfecte {product}"`.
- **`<meta name="description">`**: op zoekintentie geschreven, vraag-vorm zoals mensen
  echt zoeken (bijv. "Welke wasmachine moet ik kopen?"), niet alleen merknamen. Circa
  150-160 tekens.
- **`sitemap.xml`**: nieuwe `<url>`-entry voor `https://producthulp.nl/keuzehulpen/{categorie}/vragen/`
  toevoegen (met `<lastmod>` op de dag van livegang). De `resultaat/`-pagina hoort **niet**
  in de sitemap (client-side gerenderd, geen indexeringsdoel — zie
  hieronder).
- **`robots.txt`**: geen wijziging nodig — de bestaande regel
  `Disallow: /keuzehulpen/*/resultaat/` dekt automatisch elke nieuwe categorie.
- **`BreadcrumbList` JSON-LD** op `vragen/index.html` (zie een bestaande keuzehulp als
  voorbeeld): `Home → {Categorie} Keuzehulp`, met de juiste `item`-URL.
- Na livegang: URL indienen via **Google Search Console** → URL-inspectie →
  "Indexering aanvragen", zodat de nieuwe pagina niet hoeft te wachten tot een crawler
  hem toevallig tegenkomt.

