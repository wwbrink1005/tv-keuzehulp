# Hoe de laptop-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met laptops op de resultaatpagina.
Stand: 19 oktober 2026 (nieuwe opzet met budgetvraag, besturingssysteem en score per laptop,
zoals tv en printer).

---

## In één alinea

De bezoeker beantwoordt 7 vragen. Het formaat en het budget bepalen **welke laptops mogen
meedoen**. De andere vragen bepalen **hoe goed elke laptop past**: elke laptop krijgt een score.
Een laptop die een uitgesproken wens niet heeft (Mac of Windows, videokaart bij gamen, opslag,
een extra), komt altijd onder de laptops die hem wel hebben. Bovenaan staat de **Beste match**:
de laptop die het best past, en als meerdere ongeveer even goed passen de goedkoopste daarvan
(bij zwaar gebruik eerst de krachtigste processorklasse daarvan).

---

## 1. Waar de laptops vandaan komen

- Supabase, tabel `laptops`, dagelijks bijgewerkt door de `keuzehulp-pipeline` (prijzen van de
  winkels, specificaties van Icecat, MacBooks via de Apple-scraper).
- Ruim 1.850 laptops doen mee; ongeveer 300 zijn bij 2 of meer winkels te koop. Alleen die tonen
  we standaard (filter "2+ winkels").
- Sinds 19-10-2026 halen we extra op (migratie `keuzehulp-pipeline/migrations/laptops_extra_specs.sql`):
  batterijcapaciteit (Wh), verversing (Hz), numeriek toetsenblok, vingerafdruklezer en soort
  laptop (Chromebook, 2-in-1, workstation). De Hz stond hiervoor bij elke laptop vast op 60.

### Wat we per laptop afleiden

| Kenmerk | Hoe |
|---|---|
| Processorklasse | Budget / Mid / Krachtig / Topklasse uit de processorfamilie (Core Ultra 7 = Krachtig); Apple: M = Mid, M Pro = Krachtig, M Max = Topklasse, A-chip = Budget |
| Besturingssysteem | Icecat; Apple is altijd macOS, een Chromebook ChromeOS |
| Losse videokaart | Icecat-veld met het model (leeg of "Niet beschikbaar" = geen) |
| Lange accuduur | Minstens 15 uur volgens de fabrikant (alle MacBooks), of minstens 60 Wh zonder losse videokaart (mediaan: 58 Wh). Met losse videokaart: nee |
| Scherp scherm | OLED, of hoger dan Full HD (QHD, QHD+, 4K) |

*Code: `laptop/js/data.js`, `laptop/js/supabase.js` en `laptop/js/utils.js`.*

---

## 2. De 7 vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Hoe gebruik je je laptop het liefst? | 13–14 / 15–16 / 17–18 inch | **Harde grens** |
| 2 | Wat wil je maximaal uitgeven? | Tot €X / Tot €Y / Geen voorkeur | **Harde grens** |
| 3 | Windows, Mac of Chromebook? | Windows / Mac / Chromebook / Maakt niet uit | **Harde grens** zodra dat systeem er is; bestaat het niet in formaat en budget, dan is de optie grijs met de reden |
| 4 | Waar ga je je laptop voor gebruiken? (max 2) | Dagelijks / Studie of werk / Creatief / Gamen / Een beetje van alles | Punten per klasse; gamen en creatief: videokaart is een **wens** |
| 5 | Hoe zwaar ga je de laptop gebruiken? | Licht / Normaal / Zwaar / Zeer zwaar | Punten per klasse, werkgeheugen, prijs |
| 6 | Hoeveel opslagruimte heb je nodig? | 256 GB / 512 GB / 1 TB of meer | **Wens** |
| 7 | Wat is nog meer belangrijk? (meerdere) | Lange accuduur / Touchscreen / Scherp scherm / Numeriek toetsenblok / Vingerafdruklezer | **Wensen** |

USB-C is geen wens meer: 210 van de 212 laptops laden via USB-C.

### Vraag 2: het budget

| Formaat | Opties |
|---|---|
| 13–14 inch | tot €800, tot €1.300, geen voorkeur |
| 15–16 inch | tot €800, tot €1.300, geen voorkeur |
| 17–18 inch | tot €800, tot €1.300, geen voorkeur |

Onder de vraag staat hoeveel laptops binnen het bedrag vallen ("26 van de 152 laptops van dit
formaat kosten €800 of minder"). Past er **niets** binnen, dan tonen we de best passende
laptops met een melding.

*Bedragen staan in `laptop/js/data.js` (budgetCapsBySize).*

---

## 3. De score per laptop

Elke laptop binnen formaat en budget begint met **100 punten**.

### Stap A: welke processorklasse past het best?

Gebruik, zwaarte en formaat geven punten aan de vier klassen (tabel `scoringSystem` in
`data.js`). Een laptop verliest **3 punten per punt** dat zijn klasse achterloopt op de best
passende klasse.

### Stap B: wensen eerst

| Wens | Niet vervuld | Onbekend |
|---|---|---|
| Besturingssysteem | −1.000 | −50 |
| Losse videokaart bij gamen | −300 | |
| Videokaart (of Apple M Pro/Max) bij creatief werk, **alleen bij zwaar of zeer zwaar gebruik** (sinds 26-10-2026; daarvoor kreeg ook licht creatief werk altijd een gamelaptop) | −150 | |
| Opslag (512 GB / 1 TB) | −150 | −50 |
| Elke extra wens | −150 | −50 |

Zo komt een laptop zonder een wens altijd onder de laptops die hem wel hebben. Botsen wensen
(een Mac om te gamen bestaat niet), dan wint het besturingssysteem; gamen weegt zwaarder dan
een extra wens.

### Stap C: voorkeuren

| Situatie | Punten |
|---|---|
| Normaal of zwaar gebruik, minder dan 16 GB werkgeheugen | −8 |
| Zeer zwaar, minder dan 16 GB / minder dan 32 GB | −12 / −6 |
| 13–14 inch: zwaarder dan 1,6 kg / 1,9 kg | −6 / −12 |
| 15–16 inch: zwaarder dan 2,2 kg | −6 |
| Zwaar gebruik met zuinige chip (U/P/V) | −6 |
| Licht of normaal gebruik met krachtige, warme chip (H/HX/HS) | −4 |
| Gamen: scherm onder 120 Hz / onbekend | −8 / −3 |
| Gamen: 144 Hz of meer | +2 |
| Creatief: scherp scherm | +3 |

### Stap D: de prijs

| Zwaarte | De duurste laptop in de lijst verliest tot |
|---|---|
| Licht | 8 punten |
| Normaal | 4 |
| Zwaar | 1 |
| Zeer zwaar | 0 |

*Code: `laptop/js/matching.js` (scoreLaptops).*

---

## 4. Van scores naar de lijst

1. Alle laptops tot **10 punten onder de beste score**.
2. **Minimaal 5** die bij 2 of meer winkels te koop zijn, **maximaal 30**.
3. **Beste match:** van de laptops tot 4 punten onder de top de goedkoopste; bij zwaar of zeer
   zwaar gebruik eerst de krachtigste klasse daarvan.
4. Beste match bovenaan met badge, de rest van goedkoop naar duur.

### Filters

Prijs, schermgrootte, merk, processor, paneel, werkgeheugen, resolutie, touchscreen,
**functies** (lange accuduur, losse videokaart, numeriek toetsenblok, vingerafdruklezer,
120 Hz of meer; meerdere = alle tegelijk), kleur, besturingssysteem, winkel en aantal winkels.

---

## 5. De "Meer budget?"-kaart

Passen laptops boven het budget duidelijk beter (minstens 4 punten, zonder het prijsdeel) dan
wat je binnen budget **ziet** (2+ winkels), dan staat direct na de eerste laptop een kaart.
Mist binnen budget de videokaart die gamen of creatief werk vraagt, dan zegt de kaart dat:

> **Meer budget? Dan krijg je een laptop met een losse videokaart, die je nodig hebt om te gamen**
> Binnen je budget is die er niet bij 2 of meer winkels. Vanaf €1.299, €499 boven je budget.

Onder €1.300 zijn gaminglaptops bijna altijd maar bij één winkel te koop; die staan onder
"Aantal winkels: Alle winkels".

*Code: `laptop/js/result-filters.js` (initBudgetNote).*

---

## 6. Controleren of het nog klopt

Simulatie van **76.032 antwoordcombinaties** (formaat × budget × besturingssysteem × gebruik ×
zwaarte × opslag × extra's tot 2) tegen de live catalogus. Uitkomst 19-10-2026:

- 0 keer een lege lijst, altijd minstens 5 laptops bij 2+ winkels, behalve als er van het
  gekozen systeem minder zijn (bv. 4 Macs tot €800): dan alleen die, nooit aangevuld met een
  ander systeem
- 0 keer een laptop boven het budget
- 0 keer een ander besturingssysteem terwijl het gevraagde er wel was
- In 12.012 van de 12.016 combinaties waarin een laptop aan álle wensen voldeed, was de Beste
  match zo'n laptop; de 4 andere gaan om een onbekend kenmerk (Icecat weet het niet)

Vraag Claude: "draai de simulatie van de laptop-matching opnieuw".

---

## 7. Wat we meten (Umami)

| Event | Wanneer | Extra gegevens |
|---|---|---|
| `quiz_stap` | Elke beantwoorde vraag | `stap`, nummer, `antwoord` |
| `resultaat_getoond` | Lijst staat klaar | `budget`, `formaat`, `os`, aantal, `beste_klasse` |
| `affiliate_klik` | Klik naar een winkel | winkel, prijs, `positie`, `beste_match`, `budget`, `lijst_soort` |
| `budget_kaart` | "Meer budget?"-kaart | getoond, klik_meer_budget, klik_terug, niets_binnen_budget |
| `filter_gebruikt` | Filter aangeklikt | `filter`, `waarde` |
| `sorteren` | Andere volgorde | `volgorde` |

---

## Snelle verwijzing

| Bestand | Wat erin staat |
|---|---|
| `laptop/vragen/vragen.js` | Vragenpagina (3D), budgetopties en live telling |
| `laptop/js/data.js` | Maten, budgetbedragen, klassepunten, processorklasse, accuduur |
| `laptop/js/supabase.js`, `utils.js` | Ophalen en afgeleide kenmerken |
| `laptop/js/matching.js` | Score per laptop, de lijst, de Beste match |
| `laptop/js/result.js` | Resultaatpagina, Beste match bovenaan |
| `laptop/js/result-filters.js` | Filters, "Meer budget?"-kaart, metingen |
| `laptop/js/punten.js` | "Waarom dit bij jou past" en de specificaties |
