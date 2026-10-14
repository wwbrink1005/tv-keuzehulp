# Hoe de tv-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met tv's op de resultaatpagina.
Stand: 14 oktober 2026 (nieuwe matching, commit c243b9c).

---

## In één alinea

De bezoeker beantwoordt 7 vragen. De maat en het budget bepalen **welke tv's mogen meedoen**.
De andere vragen bepalen **hoe goed elke tv past**: elke tv krijgt een score. Bovenaan staat de
**Beste match**: de tv die het best past, en als meerdere tv's ongeveer even goed passen de
goedkoopste daarvan. Daaronder staan de andere goed passende tv's, van goedkoop naar duur.

---

## 1. Waar de tv's vandaan komen

- Alle tv's staan in de database (Supabase, tabel `televisies`). Die wordt elke dag bijgewerkt
  door de `keuzehulp-pipeline`: prijzen en links van de winkels, specificaties van Icecat.
- Op dit moment zijn het er ruim 800.
- Een tv doet alleen mee als we de maat, het type, de scherpte, de Hz en minstens één winkel
  met een prijs weten.

### Het type wordt gecontroleerd

Icecat zet bij zo'n 15% van de tv's het verkeerde type (bijvoorbeeld een Mini LED-tv als "LED",
of een gewone Full HD-tv als "OLED"). Daarom kijkt de site ook naar de **productnamen bij de
winkels**:

- Staat er in een naam "Mini LED" of "RGB", dan is het een **Mini LED**.
- Noemt minstens de helft van de namen "OLED", dan is het een **OLED**.
- Noemt minstens de helft "QLED" of "QNED", dan is een "LED" eigenlijk een **QLED**.

De namen bij **bol tellen niet mee**: die zitten het vaakst naast (bol noemde de Philips
MLED910, een Mini LED uit 2025, "QLED" en "2026"). Zegt alleen bol iets, dan houden we wat
Icecat zegt.

Ook het **modeljaar** halen we uit de namen ("(2025)", "- 2026"): eerst uit de titel, anders
het jaar dat de meeste winkels noemen. Geen jaar bekend? Dan telt het jaar niet mee (geen
pluspunt, geen minpunt). De **HDR-formaten** (Dolby Vision, HDR10+) komen uit de database.

*Code: `tv/js/supabase.js` (typeUitNamen, jaarUitNamen) en `tv/js/utils.js`.*

---

## 2. De 7 vragen

| # | Vraag | Wat het doet |
|---|---|---|
| 1 | Hoe ver zit je van de tv? | Geeft een **advies** voor de maat |
| 2 | Welke grootte past bij jou? | **Harde grens**: alleen tv's van deze maat |
| 3 | Wat wil je maximaal uitgeven? | **Harde grens**: alleen tv's tot dit bedrag |
| 4 | Waar ga je de tv voor gebruiken? (max 2) | Punten per type, plus Hz en HDR |
| 5 | Hoe belangrijk is beeldkwaliteit? | Punten per type, plus 4K en prijs |
| 6 | Wanneer kijk je meestal? | Punten per type |
| 7 | Hoe kijk je meestal? | Punten per type |

### Vraag 1 en 2: de maat

| Kijkafstand | Advies |
|---|---|
| 1 meter | 24 tot 28 inch |
| 1,5 meter | 32 inch |
| 2 meter | 40 tot 43 inch |
| 2,5 meter | 48 tot 50 inch |
| 3 meter | 58 tot 65 inch |
| 3,5 meter | 70 tot 77 inch |
| 4 meter | 83 tot 86 inch |
| Thuisbioscoop | 97 tot 115 inch |

De bezoeker mag het advies volgen of zelf een andere maat kiezen. De gekozen maat is daarna
een harde grens.

### Vraag 3: het budget

Per maat zijn er drie opties: twee maximumbedragen en "Geen voorkeur".

| Maat | Opties |
|---|---|
| 24 tot 28 inch | tot €200, tot €300, geen voorkeur |
| 32 inch | tot €250, tot €350, geen voorkeur |
| 40 tot 43 inch | tot €350, tot €500, geen voorkeur |
| 48 tot 50 inch | tot €500, tot €800, geen voorkeur |
| 55 inch | tot €600, tot €1.000, geen voorkeur |
| 58 tot 65 inch | tot €800, tot €1.200, geen voorkeur |
| 70 tot 77 inch | tot €1.000, tot €1.500, geen voorkeur |
| 83 tot 86 inch | tot €1.500, tot €2.500, geen voorkeur |
| 97 tot 115 inch | tot €2.500, tot €4.000, geen voorkeur |

Onder de vraag ziet de bezoeker hoeveel tv's binnen het bedrag vallen ("53 van de 148 tv's").
Past er in die maat **niets** binnen het budget, dan laten we toch de best passende tv's zien,
met een melding.

*Bedragen staan in `tv/js/data.js` (budgetCapsBySize). Herzien als de prijzen flink
verschuiven.*

---

## 3. De score per tv

Elke tv die door maat en budget komt, begint met **100 punten**. Daarna gaat er iets af of
komt er iets bij.

### Stap A: welk type past het best?

Elk antwoord geeft punten aan de vier types. Hoe hoger, hoe beter dat type past.

| Antwoord | LED | Mini LED | QLED | OLED |
|---|---|---|---|---|
| **Gebruik:** films en series | 5 | 8 | 7 | 10 |
| sport | 7 | 9 | 9 | 7 |
| gamen | 6 | 9 | 8 | 9 |
| normale tv | 8 | 5 | 7 | 5 |
| beetje van alles | 6 | 8 | 8 | 8 |
| **Kwaliteit:** het beste | 4 | 8 | 7 | 10 |
| belangrijk, niet het beste | 6 | 9 | 8 | 7 |
| prima is goed | 9 | 4 | 5 | 2 |
| **Wanneer:** 's avonds | 7 | 8 | 6 | 10 |
| overdag | 8 | 9 | 10 | 5 |
| beide | 8 | 9 | 9 | 8 |
| niet belangrijk | 9 | 5 | 5 | 5 |
| **Hoe:** 1 of 2 mensen recht ervoor | 8 | 8 | 8 | 9 |
| meerdere mensen, schuin | 6 | 8 | 7 | 10 |
| niet belangrijk | 0 | 0 | 0 | 0 |

- Bij kleine tv's krijgt LED extra punten (24 tot 32 inch: +10, 40 tot 43 inch: +3), omdat je
  het verschil met duurdere types daar nauwelijks ziet.
- Neo QLED (Samsung) telt als het beste van QLED en Mini LED.

**Dan:** het type met de meeste punten is het "ideale type". Een tv van een ander type verliest
**3 punten per punt dat zijn type achterligt**.

> Voorbeeld: films, beste beeld, 's avonds, meerdere mensen.
> OLED 40, Mini LED 32, QLED 27, LED 22.
> Een OLED houdt 100 punten, een Mini LED gaat 8 × 3 = 24 omlaag, een LED 18 × 3 = 54.

**Het verschil met vroeger:** vroeger won het beste type alles en vielen alle andere types
weg, ook als het maar 1 punt scheelde. Nu kan een tv van een ander type nog steeds hoog
eindigen als hij verder goed past.

### Stap B: past de tv bij de wensen?

| Wens | Wat telt | Punten |
|---|---|---|
| Kwaliteit "het beste" | Geen 4K | −30 |
| Kwaliteit "belangrijk" | Alleen HD Ready | −20 |
| Gamen | 120 Hz of meer: 0, 100 Hz: −12, lager: −25 | |
| Sport (zonder gamen) | Onder 100 Hz | −15 |
| Kwaliteit "het beste" (geen sport of gamen) | Onder 100 Hz | −4 |
| Films of "het beste" | Dolby Vision | +3 |
| Films of "het beste" | HDR10+ | +1 |
| Modeljaar | Dit of vorig jaar: +2, twee jaar oud: 0, ouder: −3 | |

### Stap C: de prijs

| Kwaliteit | Effect |
|---|---|
| Prima is goed | Goedkoper is beter: de duurste tv in de lijst verliest tot 8 punten |
| Belangrijk | Een beetje: tot 3 punten eraf voor de duurste |
| Het beste | Binnen hetzelfde type krijgt een duurder model tot 4 punten erbij, omdat dat meestal de betere serie is |

*Code: `tv/js/matching.js` (scoreTVs). Alle getallen staan bovenaan die functie.*

---

## 4. Van scores naar de lijst

1. **Welke tv's komen in de lijst?** Alle tv's tot **10 punten onder de beste score**.
2. **Minimaal 5:** zijn dat er minder dan 5 die bij 2 of meer winkels te koop zijn, dan vullen
   we aan met de volgende beste, tot er 5 zijn (als ze er zijn).
3. **Maximaal 30:** nooit meer dan 30 tv's, anders wordt het weer een catalogus.
4. **De Beste match:** van alle tv's tot **4 punten onder de beste score** (die passen "even
   goed") kiezen we de **goedkoopste**. Een duurdere tv wint alleen als hij echt iets beter past.
5. **Volgorde:** de Beste match staat bovenaan, met een blauwe rand en een badge. De rest staat
   op prijs, van laag naar hoog.

### Wat de bezoeker daarna nog kan doen

- **Filters** (links, of de knop "Filters" op mobiel): prijs, maat, merk, paneeltype,
  resolutie, Hz, HDMI-poorten, **HDR**, **modeljaar**, kleur, winkel en aantal winkels.
- **Standaard staat "2+ winkels" aan**, zodat er alleen tv's staan die je kunt vergelijken.
- Na elke filterkeuze wordt de **Beste match opnieuw gekozen** uit wat er overblijft. Kies je
  bijvoorbeeld alleen Samsung, dan krijgt de best passende Samsung de badge.
- **Sorteren** op prijs hoog-laag kan ook; dan staat de Beste match gewoon op zijn plek.

---

## 5. De "Meer budget?"-kaart

Heeft de bezoeker een maximumbedrag gekozen, dan kijken we ook naar tv's **boven** dat budget.
Passen die duidelijk beter (minstens 4 punten hoger, zonder het prijsdeel), dan verschijnt
direct na de eerste tv een kaart:

> **Meer budget? Dan past een OLED nog beter bij je wensen**
> Diep zwart, rijk contrast en een brede kijkhoek. Vanaf €1.399, €599 boven je budget.

Met de knop wissel je naar die duurdere tv's, en weer terug. Bij het wisselen gaan de filters
terug naar standaard.

*Code: `tv/js/result-filters.js` (initBudgetNote).*

---

## 6. "Waarom dit bij jou past" op elke kaart

Elke kaart toont punten die terugkomen op de antwoorden, bijvoorbeeld:

- "Sterk beeld voor **films en series**"
- "**144 Hz**: vloeiend gamen op een console of pc"
- "**Dolby Vision**: films en series zoals de maker ze bedoelde"
- "Diep zwart **'s avonds in het donker**"
- "€ 60 goedkoper dan het gemiddelde van je 5 resultaten"

Er zijn altijd precies 4 punten; de kaart toont er 3. Onder "Alle specificaties" staan onder
meer paneel, scherpte, Hz, HDR-formaten en modeljaar.

*Code: `tv/js/punten.js`.*

---

## 7. Wat we (nog) niet gebruiken, en waarom

| Gegeven | Waarom niet |
|---|---|
| Helderheid (nits) | Bij maar 24% van de tv's bekend |
| Kijkhoek | Bij maar 22% bekend; we gebruiken het type (OLED is goed van opzij) |
| HDMI 2.1, FreeSync | Niet in onze database. Gamen loopt via Hz: 120 Hz of meer gaat in de praktijk samen met HDMI 2.1 |
| Geluid, besturingssysteem, energielabel | Wel bekend, maar geen vraag over; kunnen later een filter worden |

---

## 8. Controleren of het nog klopt

Er is een simulatie die **alle 14.580 antwoordcombinaties** (elke maat × elk budget × alle
antwoorden) doorrekent tegen de live catalogus. Laatste uitkomst (14-10-2026):

- 0 keer een lege lijst
- 0 keer een tv boven het budget
- 0 keer minder dan 5 tv's terwijl er wel 5 bestonden (vroeger: 20% van de gevallen maar 1 tv)
- Een ander antwoord op de kwaliteitsvraag geeft in 72% van de gevallen een andere Beste match

Draai die opnieuw als:
- de budgetbedragen of de punten in `data.js` veranderen;
- de punten in `matching.js` veranderen;
- de catalogus flink is veranderd (nieuwe winkel, nieuw seizoen).

Vraag het aan Claude: "draai de simulatie van de tv-matching opnieuw".

---

## Snelle verwijzing: welk bestand doet wat

| Bestand | Wat erin staat |
|---|---|
| `tv/vragen/vragen.js` | De vragenpagina (3D), opslaan van de antwoorden |
| `tv/js/data.js` | Maten, budgetbedragen, punten per type |
| `tv/js/supabase.js` | Tv's ophalen, type controleren, jaar uit de naam |
| `tv/js/matching.js` | Score per tv, de lijst, de Beste match |
| `tv/js/result.js` | Resultaatpagina tekenen, Beste match bovenaan |
| `tv/js/result-filters.js` | Filters, "Meer budget?"-kaart |
| `tv/js/punten.js` | "Waarom dit bij jou past" en de specificaties |
