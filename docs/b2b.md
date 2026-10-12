# B2B: de keuzehulp op de site van een winkel (embed)

Technische naslag. Het zakelijke plan (prijzen, aanpak, risico's) staat in
`strategie/b2b-keuzehulp.md` (buiten git). De pipelinekant staat in
`klantfeeds/README.md` van de `keuzehulp-pipeline`-repo.

## In het kort

Een winkel plakt een iframe naar `embed/<categorie>/?klant=<id>` plus een klein
hoogtescript. De embed is dezelfde keuzehulp als op producthulp.nl, in "klantmodus":
eigen databron (tabel in het aparte Supabase-project "b2b"), eigen kleuren/logo,
uitgezette opties, productlinks naar de winkel zelf. Geen prijsvergelijking, geen
affiliatelinks, geen menu/footer/cookiebanner, geen meting (consent.js/analytics.js
worden bewust niet geladen).

Nu omgebouwd: **alleen koelkast**.

## Bestanden

| Bestand | Rol |
|---|---|
| `shared/klant.js` | Leest `?klant=<id>` en `klanten/<id>.json`. Exporteert `klant`, `sleutel()`, `isUitgezet()`, `zetUit()`, `productLink()`, `pagina()`, plus URL en anon-sleutel van project b2b. Zet de huisstijl op de CSS-variabelen. Top-level await. |
| `shared/embed-modus.js` | Alleen `isEmbed` (pad bevat `/embed/`), zonder await. Voor gedeelde code van ALLE categorieën (zoals `resultaat-kaart.js`). |
| `shared/embed.css` | Layoutmaten (anders uit `menu.css`), laadtint foto's, `position: fixed`-correcties, winkelfilters verborgen. |
| `shared/embed-hoogte.js` | Meldt de hoogte van de inhoud aan de winkelpagina via `postMessage` (`producthulp-keuzehulp-hoogte`). |
| `embed/koelkast/`, `embed/koelkast/resultaat/` | De embed-pagina's. Resultaatpagina is afgeleid van `koelkast/resultaat/index.html`. |
| `klanten/<id>.json` | Instellingen per klant (zie hieronder). |
| `klanten/logos/` | Logo's. |
| `klanten/plaatsingen/` | Intern overzicht: de klantcode in zeven plaatsingen. Noindex. |
| `klanten/testdata/` | Droge pipeline-uitvoer om lokaal zonder Supabase te testen (gitignored). |
| `zakelijk/` | Verkooppagina's voor winkels, incl. `demo/` met de echte embed. Noindex. |

## Instellingenbestand

```json
{
  "naam": "Demo Witgoed",
  "categorie": "koelkast",
  "kleuren": { "accent": "#C8102E", "accentDonker": "#9B0C23" },
  "logo": "klanten/logos/demowitgoed.svg",
  "uitgezet": ["verszone"],
  "databron": "klant_demowitgoed_koelkasten",
  "productlink": "{url}?utm_source=producthulp&utm_medium=keuzehulp"
}
```

`databron` is een tabelnaam in project b2b, of een `.json`-pad (statische demo). Lokaal
kan `?bron=<pad>.json` de databron overschrijven (alleen op localhost/127.0.0.1).

## Regels die je niet mag breken

- **Klantmodus alleen onder `/embed/`.** Op producthulp.nl zelf doet `?klant=` niets.
- **Nooit terugvallen op de eigen catalogus.** Embed zonder geldige klant: melding en stop
  (`throw` in `shared/klant.js`), anders verschijnen affiliatelinks op de site van een winkel.
- **Gedeelde code van alle categorieën importeert `embed-modus.js`, niet `klant.js`.** De top-level
  await in `klant.js` laat modules ná DOMContentLoaded starten; code die op dat moment wacht
  (zoals `koelkast/js/main.js` vóór de fix) start dan nooit. Elke `main.js` die klantmodus
  krijgt: starten met `readyState`-controle, niet alleen een DOMContentLoaded-listener.
- **Geen `samenvoegDuplicaten` op EAN in klantmodus** (klantdata heeft `klant_id` en soms
  geen EAN).
- **Productlinks `target="_top"`** in klantmodus.
- **Geen `position: fixed` in de embed zonder correctie**: de iframe groeit mee en scrolt
  zelf niet, dus "vast" betekent vast t.o.v. de hele (lange) pagina. Zie `embed.css`.
- **Hoogte meten tot het einde van de inhoud**, niet `scrollHeight` (krimpt nooit).
- **Kleuren alleen via variabelen** (`--accent`, `--accent-dark`, `--c-accent`, ...).
  Doorzichtige tinten als `color-mix(in srgb, var(--accent) N%, transparent)`, pixelgelijk met
  het oude `rgba(9,84,163,…)`. `shared/quiz.css` (alleen tv-vragen) is nog niet omgezet.

## Een categorie omzetten naar klantmodus

Voorbeeld: koelkast. Per categorie:
1. `js/supabase.js`: tabel en sleutel uit `klant.js`, `.json`-databron, `productLink()` op de
   aanbieder-URL, geen EAN-samenvoegen in klantmodus.
2. `js/data.js`: de "voldoet aan wens"-regels op één plek (`EXTRA_CHECKS`), gebruikt door de
   matching én het automatisch uitzetten.
3. `js/matching.js`: uitgezette opties niet in de USP-punten.
4. `js/result.js`, `js/result-filters.js`: `sleutel()` voor localStorage, uitgezette opties
   uit de filters.
5. `js/result-ui.js`: herstartknop via `document.body.dataset.vragenUrl`.
6. `js/main.js`: robuust starten (zie hierboven).
7. `vragen/vragen.js`: opties met `when: !isUitgezet(...)`, uitlegtekst uit losse stukjes per
   optie, automatisch uitzetten bij < 3 passende producten, `sleutel()` en `pagina()` in
   `finish`.
8. `embed/<categorie>/` en `embed/<categorie>/resultaat/` (let op `<base href>`: 2 resp. 3 keer
   omhoog).
9. Pipeline: `klantfeeds/categorieen/<categorie>.py`.

## Testen

Lokaal: server op de root van deze map (`python -m http.server 8766`), dan
`/embed/koelkast/?klant=demowitgoed` of `/zakelijk/demo/`. Headless-screenshots van Chrome zijn
onbetrouwbaar bij iframes van een ander domein; gebruik Playwright (staat op deze machine).
Na elke wijziging aan een categorie: de embed één keer doorklikken vóór het pushen, en
controleren dat producthulp.nl zelf gelijk blijft.
