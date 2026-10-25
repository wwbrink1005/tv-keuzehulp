# Hoe de vriezer-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met vriezers op de resultaatpagina.
Stand: 25 oktober 2026 (nieuwe opzet met budget en score per vriezer, zoals de andere
keuzehulpen).

---

## In één alinea

De bezoeker beantwoordt 4 vragen. Het soort vriezer, de nis of het formaat en het budget bepalen
**welke vriezers mogen meedoen**. De extra's bepalen **hoe goed elke vriezer past**. Een vriezer
die een uitgesproken wens niet heeft, komt altijd onder de vriezers die hem wel hebben. Bovenaan
staat de **Beste match**: de best passende, en als meerdere even goed passen de goedkoopste daarvan.

---

## 1. De gegevens

Zo'n 110 vriezers bij 2+ winkels: ~80 vrieskasten, ~18 inbouw, ~10 vrieskisten. Liebherr, Bosch,
Siemens en Miele (ruim 60) staan niet in Icecat; hun gegevens komen van de eigen sites. Miele.nl
blokkeert scrapers sinds okt. 2026; daar volgt No Frost uit de modelnaam (FN = No Frost, F niet).

**Soort** (`classifyPlaatsing` in `js/data.js`), okt. 2026 aangescherpt:
- Icecat "Diepvrieskist" bij een smal tafelmodel (onder 65 cm breed) is een vrieskast.
- Icecat "Onderbouw" bij Beko-tafelmodellen is "past onder het aanrecht", geen inbouw.
- Geen plaatsing bekend (Bosch GUN, Siemens GU, Miele FNUS): "inbouw" in de naam telt.

**No Frost** komt uit Icecat "No Frost system" (eerst) of "Automatische ontdooiing"; die twee
verschillen soms (AEG OAG7M281: No Frost wel, automatische ontdooiing niet). Een vrieskist is nooit
No Frost.

**Garage**: ja als de vriezer tot 0 °C of kouder werkt (Icecat "Bedrijfstemperatuur", bv. −15 tot
43 °C) of "Freezerguard" heeft (Beko). Nee als alleen de klimaatklasse bekend is: SN begint bij
+10 °C, N bij +16 °C. Vroeger telde klimaatklasse SN-T als "geschikt"; dat gold voor 94 van de 109
vriezers en klopte niet. Nu zijn het er 3.

*Migratie: `keuzehulp-pipeline/migrations/vriezers_extra_specs.sql` (bedrijfstemperatuur).*

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Welk soort vriezer? | Inbouw / Vrijstaande vrieskast / Vrieskist | **Harde grens** |
| 2 | Nis of formaat | Nissen met aanbod + Weet ik nog niet / Klein (tafelmodel), Middel, Groot + Maakt niet uit | **Harde grens** (geen vriezer in die maat: alle van dit soort) |
| 3 | Wat wil je maximaal uitgeven? | 2 bedragen per soort/formaat + Geen voorkeur | **Harde grens** |
| 4 | Wat nog meer? | No Frost (niet bij een kist), Zo zuinig mogelijk, Stiller dan de meeste, Koude garage, Geen | No Frost en garage: **wensen**; zuinig en stil: score |

**Vervallen:** "Voor hoeveel personen?" Het formaat gaat al over liters; samen gaven ze
tegenstrijdige eisen. Het formaat noemt nu zelf voor hoeveel personen het ongeveer is.

**Budgetbedragen** (`budgetCaps` in `js/data.js`): rond een derde en twee derde van de prijzen.
Vrieskast klein €300/€600, middel €800/€1.100, groot €850/€1.000; vrieskist €400/€500; inbouw 88 cm
€700/€850, 178 cm €1.300/€1.550.

**Grijze opties.** Grijs als geen vriezer bij 2+ winkels binnen soort, maat en budget het zeker
heeft, met de reden erbij ("Niet tot €800; wel vanaf €999.", "Geen van deze vrieskisten kan dat.").

---

## 3. De score per vriezer

| Situatie | Punten |
|---|---|
| Wens (No Frost, garage) die hij niet heeft / onbekend | −150 / −40 |
| Zuinig gewenst | −5 per labelstap boven de zuinigste van de lijst (onbekend −15) |
| Stil gewenst | −2 per dB boven de stilste van de lijst (onbekend −6) |
| Prijs | de duurste in de lijst verliest tot 5 punten |

Een labelstap is bewust 5 punten, meer dan de marge van de Beste match (4): wie "zo zuinig
mogelijk" kiest, krijgt dan ook echt de zuinigste binnen zijn budget.

*Code: `vriezer/js/matching.js` (scoreVriezers).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels (als er zoveel zijn;
vrieskisten en inbouw zijn er maar weinig). Beste match: van de vriezers tot 4 punten onder de top
de goedkoopste.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen. Metingen: `quiz_stap`, `resultaat_getoond` (budget, soort,
formaat, extra's, aantal, merk van de Beste match), `budget_kaart`, `filter_gebruikt`, `sorteren`,
`affiliate_klik`.

---

## 6. Controleren

Simulatie van 480 antwoordcombinaties (25-10-2026): 0 keer leeg, altijd minstens 5 bij 2+ winkels
(als die er zijn), 0 keer boven budget; in alle combinaties waarin een vriezer aan alle wensen
voldeed, was de Beste match zo'n vriezer.

Beko is vaak Beste match (zo'n 49%, bij 17% van het aanbod): Beko is per formaat de goedkoopste met
No Frost, en heeft de enige garagebestendige vriezers. Liebherr (27% van het aanbod, 3% Beste match)
en Miele zitten binnen elk formaat in de duurdere helft; hun gegevens zijn compleet.
