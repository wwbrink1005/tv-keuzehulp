# Hoe de wasmachine-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met wasmachines op de resultaatpagina.
Stand: 20 oktober 2026 (nieuwe opzet met budget en score per wasmachine, zoals tv, printer en
laptop).

---

## In één alinea

De bezoeker beantwoordt 6 vragen. Het huishouden (minimale trommelinhoud) en het budget
bepalen **welke wasmachines mogen meedoen**. De andere vragen bepalen **hoe goed elke wasmachine
past**. Een wasmachine die een uitgesproken wens niet heeft, komt altijd onder de wasmachines die
hem wel hebben. Bovenaan staat de **Beste match**: de best passende, en als meerdere even goed
passen de goedkoopste daarvan.

---

## 1. Eerlijke gegevens voor elk merk

Bosch, Siemens en Miele (samen bijna de helft van het aanbod) staan niet in Icecat; hun
gegevens komen van de eigen websites (scrapers in `keuzehulp-pipeline`). Tot oktober 2026 lazen
die scrapers maar een klein deel: bij elke Bosch en Siemens stond hetzelfde ingekorte lijstje
programma's, en motor, dosering, app en droogklasse ontbraken. Wie "stoom" of "invertermotor"
koos, kreeg daardoor nooit een van die merken.

Wat er nu is:

| Merk(en) | Bron | Wat we hebben |
|---|---|---|
| AEG, Samsung, Hisense, LG, Beko, Whirlpool, Haier | Icecat | Droogklasse, programma's, dosering, app, stoom, AquaStop (die laatste drie niet altijd vermeld) |
| Bosch, Siemens | eigen website (`bsh_wasmachine.py`) | Volledige programmalijst, droogklasse, i-DOS/intelligentDosing, Home Connect, stoom, invertermotor, AquaStop |
| Miele | eigen website weigert automatische browsers | Uit de productnaam (TwinDos, SteamCare), vaste Miele-kenmerken (inverter, uitgestelde start), droogklasse uit het toerental (1600 = A, 1400 = B). App en programmalijst: onbekend |

Uit de productnaam halen we ook bij andere merken: i-DOS, TwinDos, AutoDose, ezDispense
(dosering), Steam/stoom, Home Connect/SmartThings/ThinQ (app).

**Regel:** wat onbekend is, telt nooit als "nee". In de matching kost onbekend minder punten, en
een optie in de vragen wordt alleen grijs als het zeker niet kan.

*Migratie: `keuzehulp-pipeline/migrations/wasmachines_extra_specs.sql`.*

---

## 2. De 6 vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Voor hoeveel personen was je? | 1-2 / 3-4 / 5+ of veel was | **Harde ondergrens**: minstens 6 / 8 / 9 kg. Ideaal 7-9 / 8-10 / 10+ kg weegt mee |
| 2 | Wat wil je maximaal uitgeven? | Tot €X / Tot €Y / Geen voorkeur | **Harde grens** |
| 3 | Staat de wasmachine op een plek waar je last hebt van lawaai? | Ja / Nee, het geluid maakt niet uit | Ja: −4 punten per dB boven 70 dB |
| 4 | Wil je dat je was zo droog mogelijk uit de machine komt? | Ja (lijn of rek) / Nee, ik gebruik een droger of het maakt niet uit | Ja: droogklasse B −20, C −40, onbekend −10 |
| 5 | Welke wasprogramma's wil je zeker hebben? | Allergie/hygiëne, Sport, Outdoor/impregneren, Dekbed/dons, Snelwas | **Wensen** |
| 6 | Wat is nog meer belangrijk? | Automatische dosering, Stoom, App, AquaStop | **Wensen** |

Weggelaten, omdat ze geen verschil maken of niet eerlijk te bepalen zijn: energiezuinig (137 van
de 139 hebben label A), uitgestelde start en kinderslot (heeft vrijwel elke wasmachine),
invertermotor en bovenlader (3 stuks), bijvullen tijdens het wassen (niet in Icecat).

| Huishouden | Budgetopties |
|---|---|
| 1-2 en 3-4 personen | tot €600, tot €900, geen voorkeur |
| 5+ of veel was | tot €800, tot €1.100, geen voorkeur |

*Bedragen in `wasmachine/js/data.js` (budgetCapsByCapaciteit).*

---

## 3. De score per wasmachine

Elke wasmachine begint met **100 punten**.

| Situatie | Punten |
|---|---|
| Wens (programma of extra) die hij niet heeft | −150 |
| Wens die onbekend is (bv. Miele-programma's) | −40 |
| Stil gewenst | −4 per dB boven 70 |
| Droog gewenst | B −20, C of slechter −40, onbekend −10 |
| Trommel kleiner dan ideaal | −20 per kg |
| Trommel groter dan ideaal | −4 per kg |
| Prijs | de duurste in de lijst verliest tot 5 punten |

Een programmalijst met minder dan 5 programma's telt als onvolledig: daar zegt "staat er niet
in" niets over.

*Code: `wasmachine/js/matching.js` (scoreWasmachines).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
wasmachines tot 4 punten onder de top de goedkoopste. Daarna van goedkoop naar duur.

Filters: prijs, capaciteit, merk, type, energielabel, toerental, kleur, **functies** (droogklasse
A, automatische dosering, stoom, app, AquaStop; meerdere = alle tegelijk), wasprogramma's,
afmetingen, winkel en aantal winkels.

---

## 5. "Meer budget?", metingen

Zelfde als bij tv, printer en laptop: de kaart verschijnt als wasmachines boven het budget
duidelijk beter passen dan wat je binnen budget ziet. Metingen: `quiz_stap`,
`resultaat_getoond` (budget, huishouden, aantal, merk van de Beste match), `budget_kaart`,
`filter_gebruikt`, `sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 6.336 antwoordcombinaties (20-10-2026): 0 keer leeg, altijd minstens 5 bij 2+
winkels, 0 keer boven budget; in 5.610 van de 5.616 combinaties waarin een wasmachine aan alle
wensen voldeed, was de Beste match zo'n wasmachine.
