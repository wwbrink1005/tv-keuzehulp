# Runbook: een nieuwe keuzehulp bouwen

Dit document is bedoeld voor een AI (of ontwikkelaar) die de opdracht krijgt: **"maak een
[categorie]-keuzehulp"** (bijv. wasmachine, koelkast, soundbar). Volg dit stap voor stap.
Alle bestaande keuzehulpen (tv, laptop, monitor, desktop, printer, wasmachine, koelkast)
volgen exact dit patroon —
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

## 4. Website: nieuwe map `{categorie}/`

Elke keuzehulp staat als eigen map direct onder de repo-root (bijv. `wasmachine/`) —
**geen** `keuzehulpen/`-laag ervoor (die is bewust verwijderd voor kortere URL's:
`producthulp.nl/wasmachine/vragen/` i.p.v. `producthulp.nl/keuzehulpen/wasmachine/vragen/`).
Kopieer de structuur van een bestaande keuzehulp (bij voorkeur **monitor** als
basis voor `result-filters.js` — die gebruikt een generieke `renderAllFilters()`-stijl,
in tegenstelling tot tv/laptop/desktop's verbose per-filter-functie-stijl, die dit
project meermaals bugs heeft opgeleverd bij onderhoud):

- `vragen/index.html` en `resultaat/index.html` zitten 2 mappen diep vanaf de repo-root
  (`{categorie}/vragen/index.html`), dus `<base href="../../">` (2x omhoog) — de gidspagina
  (`{categorie}/index.html`, zie stap 10) zit 1 map diep (`<base href="../">`), en
  blogartikelen (`{categorie}/blog/{slug}/index.html`) zitten 3 mappen diep
  (`<base href="../../../">`). Dit is de meest voorkomende fout bij het kopiëren van een
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
- **Lange antwoordenlijsten (6+ opties) ogen te vol/dicht op elkaar op desktop.**
  Referentie voor "nog net goed": 5 korte, niet-wrappende opties (bijv.
  desktop-keuzehulp Q1). **Eerste stap is altijd verkorten, niet scrollen:** kort het
  vraagtitel/antwoordlabel in tot het op 1 regel past (5 opties × 58px item-hoogte +
  4 × 15px gap = 350px — bij een label dat wrapt komt dat er snel overheen). Pas als
  verkorten niet volstaat (6+ opties, zoals koelkast se nishoogte-vraag), begrens
  `.answers-container` op desktop met een scrollbare box — gebruik `372px` als
  max-height (ruim boven de 350px van 5 rechte regels, zodat een lijst die na
  verkorten wél past geen onnodige/minimale scroll krijgt) — patroon (uit de
  koelkast-keuzehulp, `#question-2 .answers-container`, binnen
  `@media (min-width: 901px)`):
  ```css
  #question-N .answers-container {
    max-height: calc(372px * var(--scale));
    overflow-y: auto;
    padding-right: calc(8px * var(--scale));
    scrollbar-width: thin;
    scrollbar-color: rgba(9,84,163,.35) transparent;
  }
  #question-N .answers-container::-webkit-scrollbar { width: 6px; }
  #question-N .answers-container::-webkit-scrollbar-thumb { background: rgba(9,84,163,.35); border-radius: 100px; }
  #question-N .answers-container::-webkit-scrollbar-track { background: transparent; }
  ```
  **Verplicht erbij:** `padding-right: 8px` (ruimte voor de scrollbar) maakt de
  vakken 8px breder dan de `.background-container` toestaat — die heeft
  `overflow: hidden`, dus zonder compensatie wordt de rechterrand van elk vak
  zichtbaar afgesneden (echte bug geweest, pas ontdekt nadat scroll al op 4
  plekken stond). Verklein `.answer-option`'s breedte in dezelfde media query met
  exact die 8px:
  ```css
  #question-N .answer-option {
    width: calc(358.968px * var(--scale)); /* 366.968px basis min 8px scrollbar-padding */
  }
  ```
  **Ook verplicht:** `.answer-option:hover` (shared/quiz.css) tilt het vak `1px` op
  met `transform: translateY(-1px)` plus een bredere box-shadow. Zonder
  bovenmarge clipt `overflow-y: auto` dat effect weg bij het BOVENSTE item in de
  lijst (zichtbaar als een afgesneden rand bij hover — echte bug geweest, pas
  gevonden nadat de breedte-fix hierboven al live stond). Geef de container
  een kleine `padding-top` en compenseer die met een even grote negatieve
  `margin-top` (zodat de doosje niet lager komt te staan t.o.v. de vraagtitel):
  ```css
  #question-N .answers-container {
    padding-top: calc(6px * var(--scale));
    margin-top: calc(-6px * var(--scale));
  }
  ```
  (Koelkast Q2 gebruikt bewust nog `330px` max-height omdat die vraag altijd 6
  opties heeft en het scroll-hintje daar gewenst is — niet aanpassen.)
  Geen JS-aanpassing nodig: `positionElements()` in `quiz.js` leest de werkelijke
  `offsetHeight` van `.answers-container` om de knoppen te positioneren, dus die volgen
  automatisch de begrensde hoogte. Let op: dit patroon gaat ervan uit dat de vraag de
  standaard verticale 1-koloms `.answers-container`-layout gebruikt — sommige vragen
  (bijv. tv's Q1/Q2 met een vaste 2-koloms grid) hebben een eigen, compactere layout en
  hebben dit niet nodig, ook niet bij 6+ opties.

## 4b. €-indicatoren op elk antwoord (verplicht, geen losse taak)

Elke bestaande keuzehulp (tv/laptop/monitor/desktop/printer/wasmachine/koelkast) geeft
**elk** antwoord een `<span class="price-indicator">€</span>` (€/€€/€€€) die aangeeft of die
keuze vaker naar een voordeliger of duurdere prijs leidt — puur indicatief, er wordt niets
mee weggefilterd. Dit hoort standaard bij een nieuwe keuzehulp, niet als losse vervolgstap.
**Ook neutrale opties** ("weet ik niet", "maakt niet uit", "geen extra wensen") krijgen
altijd precies één `€` — nooit weglaten (bevestigd bij desktop's "Maakt niet uit" en
monitor's "Geen extra wensen").

**Vergeet de CSS niet:** elke keuzehulp definieert `.answer-option .price-indicator` los in
het eigen `<style>`-blok van `vragen/index.html` (staat niet in `shared/quiz.css`). Zonder
die regel oogt de € lelijk en ongestyled. Kopieer 'm uit een bestaande keuzehulp, vlak vóór
`.answer-option input[type="radio"]`:
```css
.answer-option .price-indicator {
      margin-left: auto;
      padding-left: calc(8px * var(--scale));
      font-size: calc(11.5px * var(--scale));
      font-weight: 700;
      letter-spacing: 0.5px;
      color: var(--c-text-3);
      opacity: .55;
      white-space: nowrap;
      flex-shrink: 0;
    }
```

Voeg ook een zin toe aan de "Hoe werkt het?"-uitleg (desktop én mobiel blok): "Bij sommige
antwoorden zie je €-tekens: die geven aan of een keuze vaker naar een voordeliger (€) of
duurdere (€€€) {categorie} leidt, puur ter indicatie, we filteren er niets mee weg."

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
  url: "wasmachine/vragen",
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

Elke nieuwe keuzehulp moet vanaf dag 1 dezelfde SEO-basis hebben als de bestaande zeven —
dit hoort er standaard bij, niet als los, later toe te voegen werk. Titels/beschrijvingen
altijd als natuurlijke zin schrijven, **geen streepje (–) als verbindingsteken** (leest als
AI-gegenereerd) — gebruik een punt, komma, dubbele punt of verbindend woord.

- **`<title>`** op `vragen/index.html`: actiegericht, patroon `"Start de {Categorie}
  Keuzehulp en ontvang direct persoonlijk advies"`.
- **`<meta name="description">`** op `vragen/index.html`: actiegericht, sluit aan bij de
  titel (bijv. "Doe de gratis {Categorie} Keuzehulp: beantwoord een paar korte vragen over
  ... en ontvang direct een persoonlijk advies op maat.").
- **Gidspagina (`{categorie}/index.html`)** — een losse SEO-landingspagina vóór de
  keuzehulp, puur bedoeld voor zoekverkeer (interne navigatie linkt nog altijd rechtstreeks
  naar `vragen/`, deze pagina staat dus **niet** in het hoofdmenu/footer). Bevat: H1 met de
  kernzoekterm (bijv. "Welke wasmachine moet je kopen? Vind in 1 minuut de wasmachine die
  bij jou past"), `<title>`/`<meta description>` op zoekintentie geschreven (vraag-vorm,
  bijv. "Welke wasmachine moet je kopen? Praktisch advies en tips"), 3 "Binnenkort"-
  blogteaser-kaarten, een FAQ-sectie (4 vragen) met bijpassende `FAQPage` JSON-LD, en een
  `BreadcrumbList` (`Home → {Categorie's}`). Zie een bestaande gidspagina als sjabloon.
- **`vragen/index.html`'s `BreadcrumbList`** uitbreiden met de gidspagina als tussenstap:
  `Home → {Categorie's} → {Categorie} Keuzehulp` (3 niveaus, niet 2) — voorkomt dat de
  gidspagina en de keuzehulp-pagina op dezelfde zoekterm gaan concurreren.
- **3 blogartikelen per categorie** (`{categorie}/blog/{slug}/index.html`) — onderwerpen
  eerst valideren tegen echte zoekresultaten (niet blind verzinnen), korte educatieve
  artikelen (~500-700 woorden, geen streepjes), met `Article` + `BreadcrumbList` JSON-LD en
  een CTA terug naar de keuzehulp. Koppel de "Binnenkort"-teasers op de gidspagina zodra het
  artikel klaar is, en voeg het toe aan `blog/index.html`'s `BLOG_ARTICLES`-array (plus een
  nieuwe filterchip als het de eerste keer is dat deze categorie in de blog-hub verschijnt).
  Geef bij elk artikel een losse AI-beeldprompt aan de eigenaar (zelfde stijl: flat vector,
  lichtgrijze achtergrond, blauw/groen accent, geen tekst) — de afbeelding wordt zelf
  gegenereerd en later toegevoegd; tot die tijd toont een ingebouwde SVG-placeholder
  (`onerror`-fallback) netjes iets in plaats van een kapotte afbeelding.
- **`sitemap.xml`**: nieuwe `<url>`-entries voor de gidspagina (`https://producthulp.nl/{categorie}/`,
  prioriteit 0.9), de keuzehulp (`.../{categorie}/vragen/`, prioriteit 0.7) en elk
  blogartikel (`.../{categorie}/blog/{slug}/`, prioriteit 0.6). De `resultaat/`-pagina hoort
  **niet** in de sitemap (client-side gerenderd, geen indexeringsdoel).
- **`robots.txt`**: geen wijziging nodig — de bestaande regel `Disallow: /*/resultaat/`
  dekt automatisch elke nieuwe categorie.
- Na livegang: elke nieuwe URL indienen via **Google Search Console** → URL-inspectie →
  "Indexering aanvragen", zodat niet hoeft te wachten tot een crawler het toevallig
  tegenkomt.

