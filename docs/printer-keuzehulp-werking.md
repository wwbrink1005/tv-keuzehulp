# Hoe de printer-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met printers op de resultaatpagina.
Stand: 18 oktober 2026 (nieuwe opzet met budgetvraag en score per printer, zoals de tv).

---

## In één alinea

De bezoeker beantwoordt 7 vragen. Het budget bepaalt **welke printers mogen meedoen**. De
andere vragen bepalen **hoe goed elke printer past**: elke printer krijgt een score. Een
printer die een uitgesproken wens niet heeft (kleur, scannen, een extra), komt altijd onder de
printers die hem wel hebben. Bovenaan staat de **Beste match**: de printer die het best past,
en als meerdere printers ongeveer even goed passen de goedkoopste daarvan.

---

## 1. Waar de printers vandaan komen

- Alle printers staan in de database (Supabase, tabel `printers`), dagelijks bijgewerkt door de
  `keuzehulp-pipeline`: prijzen en links van de winkels, specificaties van Icecat.
- Sinds 18-10-2026 halen we meer specificaties op (migratie
  `keuzehulp-pipeline/migrations/printers_extra_specs.sql`): automatisch of handmatig
  dubbelzijdig, grootste papierformaat (A3), afmetingen, papierlade, printen zonder
  witranden, aanbevolen pagina's per maand, printen vanaf de telefoon, netwerkkabel.
- **Geen kantoorprinters en dus weggelaten:** kassa-, label-, matrix- en pasjesprinters en
  grote plotters (HP Designjet, Epson SureColor SC-T). Dat waren er zo'n 60.
- **Ook weggelaten: losse onderdelen en verbruiksartikelen** die in de feed staan, zoals een
  drum, fuser, invoerrol of losse cartridge (sinds 18-10-2026; een invoerrol van €19 kon
  anders Beste match worden).
- Ongeveer 460 printers doen mee; zo'n 126 daarvan zijn bij 2 of meer winkels te koop. Alleen
  die tonen we standaard (filter "2+ winkels").

### De soort printer

Elke printer is één van vier soorten. Dit is wat de vragen tegen elkaar afwegen, zoals het
schermtype bij de tv.

| Soort | Herkend aan | Voor de koper |
|---|---|---|
| Inkjet met cartridges | inkjet, geen tanknaam | Goedkoop in aanschaf, duur per pagina, inkt droogt in |
| Inkttankprinter | EcoTank, Smart Tank, MegaTank, SuperTank, InkBenefit, of modelreeks Epson ET-, Canon PIXMA G, Brother DCP-T/MFC-T | Duurder in aanschaf, heel goedkoop per pagina |
| Laserprinter zwart-wit | laser of LED, geen kleur | Goedkoop per pagina, droogt niet in, alleen zwart-wit |
| Laserprinter kleur | laser of LED, met kleur | Snel en voordelig, vooral voor kantoor |

Verder herkennen we:
- **Fotoprinter:** 5 of meer inktkleuren, of "Photo" in de productlijn (Envy Photo,
  Expression Photo, MegaTank Photo).
- **HP+ (Instant Ink):** HP-modellen waarvan het nummer op "e" eindigt (OfficeJet Pro 8122e,
  ENVY 6120e). Die werken alleen met een HP-account, internet en originele HP-cartridges.
  Dat staat eerlijk op de kaart; we sluiten ze niet uit.
- **Compact:** maximaal 41 × 37 × 23 cm (b × d × h), ongeveer het kleinste kwart.
- **Snelheid:** bij inkjets alleen de ISO-snelheid. De "standaard"-snelheid in Icecat is bij
  inkjets vaak de conceptstand (Epson WorkForce WF-2950: 33 tegenover 10 volgens ISO). Bij
  lasers kloppen beide.

*Code: `printer/js/data.js` en `printer/js/utils.js` (normalizeProducts).*

---

## 2. De 7 vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Waarvoor ga je de printer vooral gebruiken? | Privé / Vooral foto's / Voor mijn werk, ook als ik thuiswerk | Punten per soort, plus fotoprinter- en kantoorpunten |
| 2 | Wat wil je maximaal uitgeven? | Tot €X / Tot €Y / Geen voorkeur | **Harde grens** |
| 3 | Hoeveel print je? | Af en toe / Regelmatig / Veel | Punten per soort, plus snelheid |
| 4 | Print je in kleur of is zwart-wit genoeg? | Alleen zwart-wit / Soms in kleur / Vaak in kleur | Punten per soort; kleur is een **wens** |
| 5 | Wil je ook scannen en kopiëren? | Nee / Eén vel tegelijk / Ook een hele stapel in één keer (documentinvoer) | **Wens** |
| 6 | Wat vind je belangrijker? | Lage aanschafprijs / Goedkoop printen / Maakt niet uit | Punten per soort, plus hoe zwaar de prijs telt |
| 7 | Wat is nog meer belangrijk? (meerdere) | Automatisch dubbelzijdig / Compact / Grote papierlade / A3 | **Wensen** |

Printen vanaf de telefoon is geen vraag: dat kan bij bijna elke printer (96% heeft wifi).

### Vraag 2: het budget

| Gebruik | Opties |
|---|---|
| Thuis | tot €100, tot €200, geen voorkeur |
| Foto's | tot €200, tot €300, geen voorkeur |
| Voor mijn werk | tot €200, tot €350, geen voorkeur |

Onder de vraag ziet de bezoeker hoeveel printers binnen het bedrag vallen ("69 van de 126
printers kosten €200 of minder, vanaf €49"). Past er **niets** binnen het budget, dan laten we
toch de best passende printers zien, met een melding.

*Bedragen staan in `printer/js/data.js` (budgetCapsByGebruik). Herzien als de prijzen flink
verschuiven.*

---

## 3. De score per printer

Elke printer die binnen het budget valt, begint met **100 punten**.

### Stap A: welke soort past het best?

Elk antwoord geeft punten aan de vier soorten. De soort met de meeste punten is de "ideale
soort"; een printer van een andere soort verliest **3 punten per punt achterstand**.

| Antwoord | Cartridges | Inkttank | Laser zw | Laser kleur |
|---|---|---|---|---|
| **Gebruik:** thuis | 8 | 8 | 7 | 5 |
| foto's | 9 | 9 | 0 | 3 |
| kantoor | 3 | 6 | 9 | 9 |
| **Hoeveel:** af en toe | 6 | 5 | 9 | 7 |
| regelmatig | 6 | 9 | 9 | 8 |
| veel | 2 | 9 | 10 | 9 |
| **Kleur:** alleen zwart-wit | 3 | 3 | 10 | 4 |
| soms | 8 | 8 | 0 | 8 |
| vaak | 8 | 10 | 0 | 7 |
| **Belangrijker:** lage aanschafprijs | 10 | 3 | 8 | 4 |
| goedkoop printen | 2 | 10 | 9 | 8 |
| maakt niet uit | 0 | 0 | 0 | 0 |

> Voorbeeld: thuis, af en toe, alleen zwart-wit, lage aanschafprijs.
> Laser zw 34, cartridges 27, laser kleur 20, inkttank 19. Advies: een zwart-witlaser.

### Stap B: wensen eerst

Een wens die de printer niet heeft kost **150 punten**, een onbekend kenmerk **50**. Zo komt een
printer zonder die wens altijd onder de printers die hem wel hebben, wat de soort ook zegt.

| Wens | Telt als niet vervuld |
|---|---|
| Soms of vaak in kleur | Printer kan geen kleur |
| Scannen, losse vellen | Geen all-in-one |
| Scannen, stapels | Geen all-in-one of geen documentinvoer |
| Automatisch dubbelzijdig | Alleen handmatig of helemaal niet |
| Compact | Groter dan 41 × 37 × 23 cm |
| Grote papierlade | Minder dan 250 vel |
| A3 | Grootste formaat is A4 |

### Stap C: kleinere plus- en minpunten

| Situatie | Punten |
|---|---|
| Foto's: echte fotoprinter | +15 |
| Foto's: printen zonder witranden | +3 |
| Veel printen: langzamer dan 20 pagina's per minuut | −10 |
| Veel printen: aanbevolen minder dan 1.000 pagina's per maand | −6 |
| Regelmatig printen: langzamer dan 10 pagina's per minuut | −4 |
| Kantoor: geen automatisch dubbelzijdig | −10 |
| Kantoor: langzamer dan 15 pagina's per minuut | −6 |
| Kantoor: gemaakt voor minder dan 3.000 pagina's per maand (thuisprinter) | −10 |
| Kantoor: 3.000 tot 10.000 pagina's per maand | −4 |
| Kantoor: geen gegevens over het aantal pagina's per maand | −5 |
| Kantoor: gemaakt voor 15.000 of meer pagina's per maand | +4 |
| Kantoor: printer voor bedrijven | +2 |
| Thuis: zware printer voor bedrijven | −4 |
| Sublimatie/ZINK (alleen kleine fotootjes), niet bij foto's | −40 |

### Stap D: de prijs

| Belangrijker | Effect |
|---|---|
| Lage aanschafprijs | De duurste printer in de lijst verliest tot 8 punten |
| Maakt niet uit | Tot 3 punten |
| Goedkoop printen | Tot 1 punt (een duurdere tank- of laserprinter mag) |

*Code: `printer/js/matching.js` (scorePrinters). Alle getallen staan bij de functies.*

---

## 4. Van scores naar de lijst

1. Alle printers tot **10 punten onder de beste score**.
2. **Minimaal 5** die bij 2 of meer winkels te koop zijn (aangevuld met de volgende beste).
3. **Maximaal 30.**
4. **De Beste match:** van de printers tot **4 punten onder de beste score** de **goedkoopste**.
5. **Volgorde:** Beste match bovenaan (blauwe rand, badge), daarna van goedkoop naar duur.

### Filters

Prijs, merk, printsnelheid, soort printer, kleur behuizing, functies (automatisch
dubbelzijdig, scannen en kopiëren, documentinvoer, compact, papierlade 250+, A3, zonder
witranden, netwerkkabel), winkel en aantal winkels. Bij functies betekent meerdere aanvinken
"alle tegelijk". Na elke filterkeuze wordt de Beste match opnieuw gekozen uit wat overblijft.

---

## 5. De "Meer budget?"-kaart

Heeft de bezoeker een maximumbedrag gekozen, dan kijken we ook naar printers **boven** dat
budget. Passen die duidelijk beter (minstens 4 punten hoger, zonder het prijsdeel), dan staat
direct na de eerste printer:

> **Meer budget? Dan past een printer met navulbare inkttanks nog beter bij je wensen**
> Veel goedkoper per pagina, ideaal als je veel print. Vanaf €167, €67 boven je budget.

Met de knop wissel je naar die duurdere printers en weer terug; de filters gaan dan terug naar
standaard.

*Code: `printer/js/result-filters.js` (initBudgetNote).*

---

## 6. De kaart

- "Waarom dit bij jou past": altijd 4 punten, de kaart toont er 3. De eerste regel bevestigt de
  vervulde wensen ("Precies wat je zocht: print in kleur, ook scannen en kopiëren en navulbare
  inkttanks").
- **HP+-printers** krijgen eronder een grijze regel: "HP+ printer: werkt alleen met een
  HP-account, internet en originele HP-cartridges."
- Onder "Alle specificaties" staan onder meer soort, dubbelzijdig, papierformaat, papierlade,
  afmetingen, gewicht, printen vanaf de telefoon en HP+.

*Code: `printer/js/punten.js`.*

---

## 7. Controleren of het nog klopt

Simulatie van **alle 11.664 antwoordcombinaties** (gebruik × budget × alle antwoorden) tegen de
live catalogus. Uitkomst 18-10-2026:

- 0 keer een lege lijst, altijd minstens 5 printers bij 2+ winkels
- 0 keer een printer boven het budget
- 0 keer een Beste match zonder kleur terwijl je kleur wilt, of zonder scanner terwijl je wilt
  scannen
- In alle 6.075 combinaties met extra wensen waarin een printer bestond die aan álle wensen
  voldeed, was de Beste match zo'n printer (vóór de herziening: zwart-witlasers zonder scanner
  wonnen van all-in-ones)

Vroeger: "foto" was een aparte groep van 9 vergelijkbare printers, en 80 van de 128
fotocombinaties gaven 1 printer.

Draai de simulatie opnieuw als de budgetbedragen, de punten of de catalogus flink veranderen.
Vraag het aan Claude: "draai de simulatie van de printer-matching opnieuw".

---

## 8. Wat we meten (Umami)

| Event | Wanneer | Extra gegevens |
|---|---|---|
| `quiz_stap` | Elke beantwoorde vraag | `stap`, nummer, `antwoord` |
| `resultaat_getoond` | Lijst staat klaar | `budget`, `gebruik`, aantal (`lijst`), `beste_soort` |
| `affiliate_klik` | Klik naar een winkel | winkel, prijs, `positie`, `beste_match`, `budget`, `lijst`, `lijst_soort` |
| `budget_kaart` | "Meer budget?"-kaart | `actie`: getoond, klik_meer_budget, klik_terug, niets_binnen_budget |
| `filter_gebruikt` | Filter aangeklikt | `filter`, `waarde` |
| `sorteren` | Andere volgorde | `volgorde` |

Plus de algemene `quiz_gestart` en `quiz_voltooid`. Zelf testen zonder mee te tellen: open de
site één keer met `?nietmeten` erachter.

---

## Snelle verwijzing: welk bestand doet wat

| Bestand | Wat erin staat |
|---|---|
| `printer/vragen/vragen.js` | De vragenpagina (3D), live telling bij het budget, opslaan van de antwoorden |
| `printer/js/data.js` | Budgetbedragen, soorten, punten per soort, herkenning (tank, foto, HP+, compact) |
| `printer/js/supabase.js` | Printers ophalen |
| `printer/js/utils.js` | Afgeleide kenmerken per printer |
| `printer/js/matching.js` | Score per printer, de lijst, de Beste match |
| `printer/js/result.js` | Resultaatpagina tekenen, Beste match bovenaan |
| `printer/js/result-filters.js` | Filters, "Meer budget?"-kaart, metingen |
| `printer/js/punten.js` | "Waarom dit bij jou past", HP+-regel en de specificaties |
