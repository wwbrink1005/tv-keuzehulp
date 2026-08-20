# Runbook: een nieuwe keuzehulp bouwen

Dit document is bedoeld voor een AI (of ontwikkelaar) die de opdracht krijgt: **"maak een
[categorie]-keuzehulp"**. Volg dit stap voor stap. Alle bestaande keuzehulpen (tv, laptop,
monitor, desktop, printer, wasmachine, koelkast, vriezer, soundbar) volgen exact dit
patroon — gebruik ze als referentie-implementatie, kopieer niet blind maar begrijp waarom
elk stuk er zo uitziet. **Koelkast en vriezer zijn de meest volwassen referentie voor de
matching-architectuur** (dynamische vraag 2, doorgedreven gracieuze degradatie, geen
Icecat-veldnaam-bugs) — gebruik die als basis voor `matching.js`/`data.js` bij een nieuwe
categorie zonder natuurlijke prijs/prestatie-tier, en **monitor** voor het generieke
`result-filters.js`-patroon (zie stap 4).

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

Met de bestaande Icecat-API-credentials uit de pipeline (`keuzehulp-pipeline/.env`,
`ICECAT_USERNAME`/`ICECAT_APP_KEY`):
1. Zoek de juiste Icecat-categorie-ID voor de nieuwe productcategorie.
2. Vraag de featurelijst voor die categorie op (`Content=All` in de live API-call geeft de
   volledige `FeaturesGroups`-lijst per product).
3. Test tegen een paar echte producten welke features daadwerkelijk gevuld zijn.
4. Pas dezelfde vuistregel toe als bij filters (zie stap 6): alleen features meenemen
   die "zo goed als volledig" gevuld zijn én genoeg variatie hebben om nuttig te zijn.

### 3a. De "plausibele veldnaam"-valkuil (kostte dit project 5+ losse bugs in 1 sessie)

**Zet nooit een Icecat-veldnaam in `config.py`'s `spec_mapping` omdat hij logisch klinkt.**
Icecat gebruikt zelden de voor de hand liggende naam, en splitst concepten vaak op in
meerdere deelvelden i.p.v. 1 samenvattend veld. Dit project had, verspreid over
tv/laptop/desktop/monitor, minstens 5 `spec_mapping`-entries die een veld noemden dat
in Icecat's data helemaal niet bestaat — allemaal maandenlang onopgemerkt, want een
niet-bestaand Icecat-veld levert **nooit een foutmelding**, alleen een permanent lege
Supabase-kolom (die de matching-logica dan stilletjes als "Nee"/afwezig behandelt).
Concrete, echt gebeurde voorbeelden:

- `"Grafische adapter"` bestaat niet voor laptops/desktops (0-1× aanwezig in een
  steekproef van 400 producten). Het juiste veld is `"Discreet grafische adapter model"`
  (geeft direct de GPU-modelnaam terug, bv. "NVIDIA GeForce RTX 4070"; 85-94% dekking;
  leeg bij alleen geïntegreerde graphics — dus meteen ook het "heeft dedicated GPU"-signaal).
- `"USB Type-C"` bestaat niet als los Ja/Nee-veld. Het signaal moet samengesteld worden
  uit meerdere subvelden: bij laptops `"USB Type-C DisplayPort alternatieve modus"` +
  `"USB Type-C-oplaadpoort"` + Thunderbolt-poorttellingen; bij monitoren `"Aantal USB
  Type-C-upstreampoorten"` + `"...downstreampoorten"` + dezelfde DisplayPort-alt-mode-vlag.
- `"Automatisch ontdooien (koelkast)"` heet bij vriezers anders:
  `"Automatische ontdooiing ( diepvries )"` — inclusief de rare spaties in de haakjes,
  exact zoals Icecat het zelf levert. **Kopieer nooit een `spec_mapping`-entry 1-op-1 naar
  een nieuwe, verwante categorie** zonder 'm apart te verifiëren.

Een aanverwant patroon: een kolom kán al in Supabase bestaan (bv. van een oudere
pipeline-versie) zonder dat de huidige pipeline hem ooit vult — de kolom bestaat dus
technisch, queries erop slagen, maar leveren altijd `null`. Dit zag je bij desktop's
`gpu_apart`/`rgb`/`waterkoeling`: die velden stonden al in `supabase.js` maar geen regel
code in `merge_publish.py` schreef er ooit iets naar, waardoor 97,5% van alle desktops
altijd als "Budget"-GPU-tier werd geclassificeerd, ongeacht de daadwerkelijke videokaart.

**Verplichte verificatiestap, vóór je een `spec_mapping`-entry schrijft (en sowieso
elke keer dat je een bestaande matching-functie voor een nieuwe categorie hergebruikt):**

1. Haal met de service-key (uit `keuzehulp-pipeline/.env`, nooit committen) een steekproef
   van ~300-400 rijen op uit `icecat_cache.specs` voor de categorie:
   ```js
   const rows = await fetch(`${SUPABASE_URL}/rest/v1/icecat_cache?ean=in.(${eansCsv})&select=ean,specs`,
     { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }).then(r => r.json());
   ```
   (`icecat_cache` heeft geen publieke leestoegang — de anon key uit `js/supabase.js` werkt
   hier niet, alleen de service-key.) Als de Supabase-tabel voor de categorie nog niet
   bestaat, haal de specs rechtstreeks op via de live Icecat-API voor een handvol
   handmatig gekozen EAN's.
2. Tel per kandidaat-veldnaam hoe vaak die **daadwerkelijk als key voorkomt**
   (`rows.filter(r => "Veldnaam" in r.specs).length`) — niet alleen of de naam logisch
   klinkt.
3. Als de voor de hand liggende naam 0 of bijna 0 hits geeft: zoek met een
   regex/substring-scan naar verwante velden (`/grafisch|gpu|graphics/i`,
   `/usb|type-c/i`, `/ontdooi/i`) over alle keys van alle opgehaalde specs heen — Icecat's
   eigen benaming vind je zo, in plaats van te blijven gokken.
4. Kies het veld met de hoogste dekking dat het gevraagde concept dekt. Dekt geen los veld
   het concept volledig, combineer meerdere velden met OR-logica (zie de USB-C/GPU-
   voorbeelden in `merge_publish.py`'s `_bouw_rij()`) — en documenteer in een comment
   welk percentage elk deelsignaal haalt, zodat een latere lezer niet opnieuw hoeft uit te
   zoeken waarom het zo samengesteld is.
5. **Test de gekozen velden ook nog los tegen realistische waarden** (bv. print een paar
   `specs["Discreet grafische adapter model"]`-waardes uit) — een veld kan wél vaak
   voorkomen maar toch de verkeerde soort waarde bevatten (categorie-naam i.p.v.
   modelnaam, of een booleaanse vlag i.p.v. een telling).

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

## 5. Matching-logica: ontwerpprincipes

Een `match{Categorie}()`-functie bestaat meestal uit 3 lagen, in deze volgorde: (1) een
harde partitie op een fysieke eigenschap die geen compromis toelaat (formaat, plaatsing,
schermgrootte — "je koopt geen inbouwkoelkast als je vrijstaand zocht"), (2) een
scoring-cascade die de resterende producten indeelt in tiers/types op basis van de
gebruiksvraag-antwoorden, en (3) een reeks gracieus degraderende zachte
voorkeursfilters (opslag, geluid, extra's) die alleen filteren als dat niet alles
wegvaagt. Sommige categorieën hebben geen natuurlijke tier-as (koelkast, vriezer, printer)
en slaan laag 2 over — dat is een bewuste, gedocumenteerde keuze, geen omissie (zie de
comment bovenaan `koelkast/js/matching.js`).

### 5.1 Tier-cascade: bij een gelijke stand NOOIT tiers samenvoegen

**Dit is de meest voorkomende, meest impactvolle bug die dit project herhaaldelijk trof**
(gevonden en gefixt bij monitor, laptop, soundbar én tv — allemaal onafhankelijk van
elkaar ontstaan, wat erop wijst dat dit de "voor de hand liggende" manier is om een
tier-cascade te schrijven, en dus extra oplettendheid verdient bij een nieuwe keuzehulp).

De **foute** versie: bepaal de hoogst scorende tier(s), en als er een gelijke stand is
tussen bv. "Mid" en "Krachtig", voeg beide tiers samen tot 1 grote pool:

```js
// FOUT — voegt tiers samen bij een gelijke stand
const topScore = sortedTiers[0][1];
const tiersWithTopScore = sortedTiers.filter(([, s]) => s === topScore).map(([t]) => t);
let candidates = filtered.filter(item => tiersWithTopScore.includes(getTier(item)));
```

Dit lijkt onschuldig (er komt tenminste íets uit), maar doet precies het tegenovergestelde
van wat een keuzehulp hoort te doen: hoe vaker antwoorden toevallig gelijk scoren, hoe
**breder** de resultatenlijst wordt — terwijl het doel juist is om te versmallen. Bij tv
bleek 15% van alle mogelijke antwoordcombinaties een gelijke stand te geven, met als
ergste geval een volledige 4-weg-gelijkspel tussen alle paneeltypes (174 tv's zonder enige
type-filtering). Bij soundbar gaf één enkel antwoord ("muziek": Allround en Premium scoren
toevallig allebei 8) een pool van 45 op de 117 producten in de catalogus.

De **juiste** versie: evalueer bij een gelijke stand elke getelde tier **apart** (incl.
alle overige filters van die stap), en kies de tier met de **kleinste niet-lege**
resultatenset — dat is de meest specifieke tier die nog steeds voorraad heeft:

```js
const sortedTiers = Object.entries(scores).sort((a, b) => Number(b[1]) - Number(a[1]));
let matchedItems = [], bestType = null;

for (const [, topScore] of sortedTiers) {
  const tiersWithTopScore = sortedTiers
    .filter(([, s]) => Number(s) === Number(topScore))
    .map(([t]) => t);

  let bestCandidates = null, bestTierName = null;
  for (const tier of tiersWithTopScore) {
    let candidates = filtered.filter(item => getTier(item) === tier);
    candidates = applySubFilter1(candidates, ...);
    candidates = applySubFilter2(candidates, ...);
    if (candidates.length === 0) continue;
    if (bestCandidates === null || candidates.length < bestCandidates.length) {
      bestCandidates = candidates;
      bestTierName = tier;
    }
  }
  if (bestCandidates === null) continue; // val terug op de eerstvolgende score-groep
  matchedItems = bestCandidates;
  bestType = bestTierName;
  break;
}
```

Let op het verschil met de foute versie: de sub-filters (opslag/resolutie/Hz/etc.) worden
nu **per kandidaat-tier apart** toegepast, niet pas nadat de tiers al samengevoegd zijn —
anders zou je nog steeds een grote, samengevoegde kandidatenpool aan de sub-filters
voeren. `bestType` wordt hierdoor ook altijd een enkele tier-naam i.p.v. een
"A / B"-samengevoegde string — controleer bij het overzetten van dit patroon of ergens
verderop in de code (resultaatpagina, filters) nog een `" / "`-split op `bestType`
verwacht wordt (kwam bij tv niet voor, maar check het altijd).

**Uitzondering — als het doel bewust "verbreden" is, niet versmallen:** desktop's
matching wijkt hier bewust van af (`matchDesktops()` in `desktop/js/matching.js`) — die
verbreedt juist tiers totdat een minimum van 5 resultaten is gehaald, omdat GPU-tiers bij
sommige behuizingstypen (mini-pc, all-in-one) zo schaars zijn dat een strikte kleinste-
tier-keuze een gebruiker op een niche-tier van 2 producten kan stranden terwijl er 35 prima
alternatieven in de net-iets-lagere tier staan. Dit is een expliciete, gedocumenteerde
ontwerpkeuze voor een categorie met een sterk scheve tier-verdeling — kopieer 'm niet
klakkeloos, maar overweeg 'm als de nieuwe categorie een vergelijkbaar scheve verdeling
heeft (zie 5.4 hieronder over hoe je dat vaststelt).

### 5.2 Verplichte eindfallback

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

### 5.3 Valideer de matching altijd tegen de live catalogus, niet alleen tegen handmatige voorbeelden

De architectuur kan volledig correct zijn (geen tie-merge-bug, wel een eindfallback) en
toch praktisch nutteloos matchen, puur omdat de **catalogus-samenstelling** een tier
onevenredig groot maakt. Dit is geen bug om te "fixen" in de code — het is iets wat je met
echte data moet meten voordat je kunt beoordelen of het een probleem is. Voorbeelden die
dit project trof: laptop's "Mid" en "Krachtig" processor-tiers bleken allebei ~40% van de
hele catalogus (i5/i7-klasse chips domineren de markt), waardoor zelfs een perfect
werkende tier-cascade nog altijd 200+ resultaten opleverde voor de populairste
antwoordcombinatie. Soundbar bleek voor 67% uit "Premium" (Atmos/DTS:X) te bestaan.

Werkwijze om dit te meten (schrijf een eenmalig Node-scriptje in de scratchpad-map, niet
in de repo): haal de volledige catalogus op via de anon-key, reproduceer
`calculateScores()` + de matching-cascade 1-op-1 in het script, en loop dan **alle**
realistische antwoordcombinaties door (geneste `for`-loops over elke vraag z'n
mogelijke waarden) om te zien: (a) hoe vaak een tie optreedt (zie 5.1), en (b) wat de
grootste resulterende resultatenset is over alle combinaties heen. Een paar honderd tot
laag-duizendtal combinaties doorrekenen kost seconden en geeft een veel eerlijker beeld
dan 3-4 handmatig gekozen scenario's, die het "typische" geval testen maar het "ergste"
geval missen.

Vind je hiermee een structureel te brede tier (zoals laptop's Mid/Krachtig): bespreek met
de eigenaar of dit acceptabel is (bewust: geen prijsvraag in de quiz, verdere verfijning
hoort bij het filtermenu — zie stap 6) of dat de vraag die op die tier scoort verfijnd
moet worden (bv. van 3 naar 4 antwoordopties, zoals bij monitor's Hz-vraag en laptop's
intensiteit-vraag) — voeg **niet blind een prijsvraag toe** om dit te compenseren, dat is
een bewuste, sitebrede designkeuze (zie CLAUDE.md) die niet per-categorie omzeild wordt.

### 5.4 Drempelwaardes altijd tegen live data valideren, nooit tegen aannames

Een "voor de hand liggende" drempel kan voor de ene categorie kloppen en voor de andere
volledig fout zijn. Concreet voorbeeld: een "energiezuinig"-extra die filtert op
energielabel A of B werkte prima bij wasmachines (86% van de catalogus haalt A/B) maar gaf
bij vriezers **0 resultaten, altijd** — de EU-energielabel-schaal is in 2021 verstrengd en
vriezers halen op de nieuwe schaal in de praktijk zelden hoger dan C. De checkbox deed dus
maandenlang niets, zonder ooit een fout te geven (gracieuze degradatie ving het stilletjes
op). Tel bij elke drempel/bucket-grens die je verzint (dB-niveau voor "stil", Hz-grens voor
"snel", RPM-grens voor "hoog toerental", energielabel-cutoff) hoeveel producten in de
**live** catalogus er daadwerkelijk aan voldoen, vóór je 'm vastlegt — een drempel die 0%
of 100% van de catalogus raakt, filtert in de praktijk niets.

### 5.5 `buildResultPoints()`: altijd 4 groene vinkjes garanderen (verplicht)

Elke resultaatkaart toont maximaal 4 USP-punten (groene vinkjes). `buildResultPoints()`
mag **nooit** minder dan 4 teruggeven — ook niet als een product weinig specs heeft of de
gebruiker weinig voorwaardelijke punten triggert. TV (`tv/js/matching.js`) is het
referentiepatroon: eerst een dichte set voorwaardelijke punten per antwoordcombinatie, dan
een generieke aanvulling met specs die (bijna) altijd aanwezig zijn, en als allerlaatste
vangnet één of twee puur generieke, altijd-ware zinnen (geen productdata nodig).

Bouw de aanvulling in 3 lagen, elke laag alleen aangeroepen als `points.length < 4`:

1. **Specifieke, voorwaardelijke punten** — de normale matching-logica (antwoord × spec).
2. **Generieke spec-punten** — velden die vrijwel altijd gevuld zijn (bv. schermgrootte,
   capaciteit, merk). Check de harde vereisten in `normalizeProducts()` (`utils.js`) om te
   weten welke velden echt gegarandeerd zijn.
3. **Pure vangnet-zin(nen)** — geen productdata nodig, bv. "Betrouwbare keuze voor
   dagelijks gebruik". **Reken uit wat het laagst-mogelijke aantal punten is vóórdat deze
   laag begint** (bv. bij desktop bleek dat soms slechts 2 te zijn) en voeg net zoveel
   vangnet-zinnen toe als nodig om altijd op 4 uit te komen — één vangnet-zin is vaak niet
   genoeg.

Test dit altijd tegen de volledige live catalogus (niet alleen handmatige voorbeelden):
roep `buildResultPoints()` aan met lege/minimale `answers` voor elk product en controleer
dat `points.length` nooit onder 4 zakt. Dat is het "worst case"-scenario (geen enkel
voorwaardelijk punt triggert) en dus de enige betrouwbare manier om de garantie te
verifiëren.

## 6. Filter-uitbreiding (pas ná livegang, met echte data)

Volg dezelfde cyclus als bij de bestaande categorieën:
1. Bevraag de Supabase-tabel (of, voor Icecat-brondata, `icecat_cache` — zie 3a) op
   vullingspercentage en waarde-variatie per kolom.
2. Stel kandidaten voor die "zo goed als volledig" zijn (~90%+) én genoeg variatie hebben
   (een kolom die 95%+ van de tijd dezelfde waarde heeft is geen nuttig filter — zie 5.4,
   hetzelfde principe geldt hier).
3. Laat de eigenaar kiezen, implementeer daarna pas.

### 6a. Elke nieuwe quizvraag/spec-fix moet ook het filtermenu bijwerken (verplichte check, geen losse taak)

**Dit werd dit project herhaaldelijk gemist**: een nieuwe vraag toevoegen aan de quiz, of
een kapot Icecat-veld repareren (zie 3a), levert waardevolle, nu-wél-betrouwbare data op —
maar `result-filters.js` op de resultaatpagina wordt daar niet automatisch van op de
hoogte gesteld. De quiz-matching en het filtermenu zijn twee losse plekken die hetzelfde
product-veld gebruiken, en alleen de eerste denkt men vanzelf aan. **Check bij elke nieuwe
of gerepareerde spec expliciet of `{categorie}/js/result-filters.js` er al een kaart voor
heeft; zo niet, voeg die toe** — anders zit de data er wel, maar kan de bezoeker er nooit
mee filteren.

Twee herbruikbare UI-patronen voor nieuwe filters:

- **"Functies"-consolidatie**: meerdere losse Ja/Nee-eigenschappen (bv. kinderslot,
  AquaStop, uitgestelde start, inverter) horen als aparte checkboxes in **1** kaart, niet
  als 1 losse kaart per eigenschap — dat laatste maakt het filterpaneel onnodig lang.
  Patroon (zie `FUNCTIE_DEFINITIES` in `monitor/desktop/wasmachine/koelkast/js/result-filters.js`):
  ```js
  const FUNCTIE_DEFINITIES = [
    { key: "kinderslot", label: "Kinderslot", check: item => item.kinderslot === "Ja" },
    { key: "aquastop",   label: "AquaStop",   check: item => item.aquastop === "Ja" },
  ];
  ```
  gecombineerd met AND-logica bij het filteren (alle aangevinkte functies moeten allemaal
  kloppen) — gebruik dit patroon voor generieke "wat wil je nog meer"-eigenschappen. Een
  eigenschap die specifiek is voor 1 vraag met veel variatie (zoals wasmachine's 6
  specifieke wasprogramma's, of een GPU-tier) verdient wél een **eigen** kaart, geen plek
  in "Functies" — de vuistregel: hoort de eigenschap bij de vraag "wat is verder nog fijn
  om te hebben" (generiek, binair) → Functies; is het een eigen, herkenbare dimensie
  (grootte, type, merk-achtig) → eigen kaart.
- **Conditionele zichtbaarheid**: sommige eigenschappen zijn alleen relevant bij een
  bepaald antwoord op een eerdere vraag (bv. een bovenlader-optie bestaat alleen bij
  "kleine" wasmachines; waterdispenser/ijsmaker komen bij koelkasten vrijwel uitsluitend
  voor bij het Amerikaanse/extra-brede type — **meet dit altijd eerst met live data** vóór
  je een optie conditioneel verstopt, zie 5.4). Patroon: geef het `<label>` in
  `vragen/index.html` een `data-{voorwaarde}-only`-attribuut, en verberg/toon die labels
  in `quiz.js` op basis van het eerdere antwoord (zie `updateExtraOptionsVisibility()` in
  `wasmachine/js/quiz.js` of `koelkast/js/quiz.js` voor het exacte patroon, inclusief het
  leegmaken van de checkbox als hij verborgen wordt).

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
- Levert de bucket-berekening voor de huidige matches 1 of 0 buckets op (dus niks om mee
  te verfijnen), verberg dan de **hele kaart** (`card.hidden = true`) i.p.v. een kaart met
  1 zinloze checkbox te tonen — geldt hieronder ook voor de afmetingen-buckets.

**Afmetingen (Breedte/Diepte/Hoogte) in het filtermenu — alleen wanneer relevant:**
- Voeg dit alléén toe bij categorieën waar de fysieke maat er echt toe doet voor de koper
  (koelkast, vriezer, wasmachine — "past het in mijn nis/hoek"). Bij twijfel of een nieuwe
  categorie dit nodig heeft: **vraag het de eigenaar** i.p.v. het zelfstandig toe te voegen
  of over te slaan. Sla het over bij categorieën waar iets anders al de fysieke maat dekt
  (tv/monitor/laptop/desktop/printer — schermgrootte of formaat-vraag is daar het
  eigenlijke signaal) of waar het te verwaarlozen is (bv. bij soundbars is alleen Breedte
  relevant — die bepaalt of hij onder de tv past — Diepte/Hoogte van een soundbar maakt in
  de praktijk niemand uit, dus die 2 zijn daar bewust weggelaten).
- Zelfde dynamische-bucket-aanpak als prijs, niet handmatig vaste cm-grenzen verzinnen (zie
  5.4): `computeDynamicDimensionGroups(items, "breedteMm")` in `{categorie}/js/utils.js`
  (kwantielen op de live catalogus, output in hele cm) — zie `wasmachine/koelkast/vriezer/
  soundbar/js/utils.js` voor de referentie-implementatie. Vereist dat de mm-waarde al
  genormaliseerd is als getal op het product-object (`breedteMm`/`diepteMm`/`hoogteMm`,
  of `breedte_mm` bij soundbar) — check eerst of dat al gebeurt in `normalizeProducts()`
  vóór je deze filter toevoegt; zo niet, voeg dat eerst toe (zie wasmachine, waar dit nog
  niet gebeurde en dus zowel `supabase.js`'s `adaptRow()` als `normalizeProducts()` een
  regel nodig hadden).
- Rendering/filteren volgt exact het prijsbucket-patroon: 1x per catalogus de buckets
  berekenen (in `initFilters()`), per render de tellingen opnieuw op de actuele matches
  (zelfde reden als bij prijs: buckets zelf hoeven niet bij elke klik te verschuiven, de
  tellingen erachter wel).

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
- **Draai de brute-force tie/resultaatgrootte-check uit 5.3** over alle antwoordcombinaties
  — dit is de enige betrouwbare manier om een tie-merge-bug (5.1) of een structureel te
  brede tier (te grote resultatenset) te vinden vóórdat een gebruiker het doet.
- **Verifieer elke `spec_mapping`-entry tegen `icecat_cache`** zoals beschreven in 3a,
  óók voor velden die "voor de hand liggend" leken — dit kost een paar minuten en heeft dit
  project herhaaldelijk een pas-maanden-later-ontdekte bug bespaard.
- **Loop het filtermenu-overzicht van stap 6a na**: heeft elke quizvraag/spec die je hebt
  toegevoegd ook een bijpassende kaart in `result-filters.js`?

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
- **"Lees ook"-blok op `resultaat/index.html`** (sinds augustus 2026 standaard, niet
  optioneel): voeg direct vóór de sluitende `</aside>`, na de laatste `.filter-card`, een
  `.filters-blog-block` toe met links naar alle 3 blogartikelen. Styling zit al gedeeld in
  `shared/resultaat.css` (`.filters-blog-block`/`.filters-blog-eyebrow`/`.filters-blog-link`/
  `.filters-blog-link-icon`), dus alleen de HTML-markup toevoegen — kopieer het patroon 1-op-1
  uit een recente categorie zoals koelkast of soundbar.
- **`sitemap.xml`**: nieuwe `<url>`-entries voor de gidspagina (`https://producthulp.nl/{categorie}/`,
  prioriteit 0.9), de keuzehulp (`.../{categorie}/vragen/`, prioriteit 0.7) en elk
  blogartikel (`.../{categorie}/blog/{slug}/`, prioriteit 0.6). De `resultaat/`-pagina hoort
  **niet** in de sitemap (client-side gerenderd, geen indexeringsdoel).
- **`robots.txt`**: geen wijziging nodig — de bestaande regel `Disallow: /*/resultaat/`
  dekt automatisch elke nieuwe categorie.
- Na livegang: elke nieuwe URL indienen via **Google Search Console** → URL-inspectie →
  "Indexering aanvragen", zodat niet hoeft te wachten tot een crawler het toevallig
  tegenkomt.

