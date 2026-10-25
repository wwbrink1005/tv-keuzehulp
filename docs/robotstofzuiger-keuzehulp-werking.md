# Hoe de robotstofzuiger-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met robots op de resultaatpagina.
Stand: 25 oktober 2026 (nieuwe opzet met budget en score per robot, zoals de andere
keuzehulpen).

---

## In één alinea

De bezoeker beantwoordt 6 vragen. Het budget bepaalt **welke robots mogen meedoen**. De andere
vragen bepalen **hoe goed elke robot past**. Een robot die een uitgesproken wens niet heeft (een
station dat iets niet kan, een extra), komt altijd onder de robots die hem wel hebben. Bovenaan
staat de **Beste match**: de best passende, en als meerdere even goed passen de goedkoopste
daarvan.

---

## 1. De gegevens

Zo'n 56 robots bij 2+ winkels (€189-1.199), vooral Roborock (19), Dreame (17) en Ecovacs (12).
**iRobot zit niet in de feeds.**

**Vervallen als vraag**, omdat vrijwel elke robot het heeft: LiDAR-navigatie, dweilen, wifi/app,
Alexa en Google. Ze staan nog wel als filter op de resultaatpagina.

**Het basisstation** (`station` in `js/utils.js`):

| Station | Hoe herkend |
|---|---|
| Alles (wast dweilpads, vult water bij) | Icecat "Capaciteit schoonwaterreservoir (basis)", of de naam: Omni, Ultra, Qrevo, Saros, Matrix, X50, Combo, Complete, L10s-L50s |
| Zelflegend | Icecat "Zelflegend" of "Stofcapaciteit (basis)", of een "+"/"Plus" in de naam |
| Alleen opladen | Icecat "Zelflegend: Nee" |
| Onbekend | geen van de bovenstaande (Rowenta, Imou, AEG) |

**Nieuw uit Icecat:** stofcapaciteit en waterreservoir van het station, een dweilpad dat omhoog gaat
op tapijt ("Ophefbare dweil"), en de drempelhoogte ("Over drempelhoogte (max)", anders
"Obstakeloverbrugging"). Drempels buiten 1-9 cm zijn datafouten en tellen als onbekend; looptijden
boven 600 minuten ook.

*Migratie: `keuzehulp-pipeline/migrations/robotstofzuigers_extra_specs.sql`.*

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Wat moet het basisstation doen? | Alles automatisch / Zelflegend / Maakt niet uit | **Wens** (een volledig station telt ook als zelflegend) |
| 2 | Wat wil je maximaal uitgeven? | Tot €400 / Tot €700 / Geen voorkeur | **Harde grens** |
| 3 | Hoeveel vloer per beurt? | Weinig / Gemiddeld / Veel | Minstens 0 / 150 / 250 min looptijd |
| 4 | Wat voor vloeren? | Vooral harde vloer / Vooral tapijt / Allebei | Zuigkracht en dweilpad omhoog (tapijt), dweilen (harde vloer) |
| 5 | Is stil belangrijk? | Ja / Nee | Ja: −2 per dB boven het gemiddelde |
| 6 | Wat nog meer? | Huisdieren (20.000 Pa+), Past onder lage meubels (max 9 cm), Hoge drempels (4 cm+), Geen | **Wensen** |

**Grijze opties.** Grijs als geen robot bij 2+ winkels binnen het budget het zeker heeft, samen met
het gekozen station en de al aangevinkte extra's, met de reden erbij ("Niet tot €400; wel vanaf
€648."). Bij de stationvraag kan nog niets grijs, want die komt vóór het budget.

---

## 3. De score per robot

| Situatie | Punten |
|---|---|
| Wens (station, extra) die hij niet heeft / onbekend | −150 / −40 |
| Looptijd korter dan nodig | −2 per 10 minuten (onbekend −5) |
| Tapijt: zuigkracht onder 10.000 / 20.000 Pa | −10 / −4 (onbekend −3) |
| Tapijt: dweilpad gaat niet omhoog | −6 |
| Harde vloer: kan niet dweilen | −10 |
| "Allebei" | de vloerpunten hierboven tellen half |
| Tapijt + dweilpad omhoog / harde vloer + volledig station | +2 |
| Stil gewenst | −2 per dB boven het gemiddelde (onbekend −4) |
| Prijs | de duurste in de lijst verliest tot 5 punten |

*Code: `robotstofzuiger/js/matching.js` (scoreRobots).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
robots tot 4 punten onder de top de goedkoopste.

Filters: o.a. prijs, merk, hoogte robot en station, functies (station wast dweilpads, zelflegend,
past onder lage meubels, over hoge drempels, dweilpad omhoog, obstakeldetectie, HEPA, wifi,
Alexa, Google).

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen; de kaart noemt wat je met meer budget krijgt (bv. een station
dat ook de dweilpads wast, of een robot die onder lage meubels past). Metingen: `quiz_stap`,
`resultaat_getoond` (budget, station, vloer, extra's, aantal, merk van de Beste match),
`budget_kaart`, `filter_gebruikt`, `sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 1.296 antwoordcombinaties (25-10-2026): 0 keer leeg, altijd minstens 5 bij 2+
winkels, 0 keer boven budget; in alle combinaties waarin een robot aan alle wensen voldeed, was de
Beste match zo'n robot.

Ecovacs is vaak Beste match (zo'n 49%, bij 21% van het aanbod): de Deebot T30e Omni (€269) en T50
Omni Gen 3 (€378) zijn de goedkoopste robots met een volledig station en veel zuigkracht. Bij Ecovacs
ontbreekt de drempelhoogte vaak in Icecat; hun robots komen over zo'n 2 cm, dus bij "hoge drempels"
maakt dat in de praktijk niet uit.
