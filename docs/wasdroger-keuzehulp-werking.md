# Hoe de wasdroger-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met wasdrogers op de resultaatpagina.
Stand: 22 oktober 2026 (nieuwe opzet met budget en score per droger, zoals de wasmachine).

---

## In één alinea

De bezoeker beantwoordt 5 vragen. Het huishouden (minimale trommelinhoud) en het budget bepalen
**welke drogers mogen meedoen**. De andere vragen bepalen **hoe goed elke droger past**. Een
droger die een uitgesproken wens niet heeft, komt altijd onder de drogers die hem wel hebben.
Bovenaan staat de **Beste match**: de best passende, en als meerdere even goed passen de
goedkoopste daarvan.

---

## 1. De gegevens

Zo'n 100 drogers bij 2+ winkels, €399 tot €2.519, vrijwel allemaal warmtepomp en 8 of 9 kg.
59 komen uit Icecat, de rest van de eigen sites (Bosch, Siemens, Miele).

| Gegeven | Bekend bij | Opmerking |
|---|---|---|
| Capaciteit, prijs, geluid, energielabel | alle 100 | |
| Droogprogramma's | 89 | AEG mist bij 9 van de 14 (niet te scrapen: de lijst staat alleen in de handleiding); bij Miele vult de scraper de vaste basislijst in, dus wat daar niet in staat (hygiëne, sport) is onbekend |
| Bediening met app | 88 + uit de naam (HomeWhiz, Home Connect, ...) | |
| Stoom | uit de programmalijst, of uit de naam (Miele "Steam", Beko "SteamCure") | |

**Bewust niet gevraagd:**
- uitgestelde start, vochtsensor en kinderslot: vrijwel elke droger heeft ze, alleen staat het
  er niet altijd bij;
- anti-kreuk: idem, en bij Bosch en Siemens vult de scraper onterecht "Nee" in terwijl de
  kreukbeschermingsfase standaard is.

Ze staan nog wel als filter op de resultaatpagina.

**Regel:** wat onbekend is, telt nooit als "nee". In de matching kost onbekend minder punten,
en een optie in de vragen wordt alleen grijs als het zeker niet kan.

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Voor hoeveel personen droog je? | 1-2 / 3-4 / 5+ | **Ondergrens** 7 / 8 / 9 kg; ideaal 7-9 / 8-10 / 10-12 kg weegt mee |
| 2 | Wat wil je maximaal uitgeven? | Tot €700 / Tot €900 / Geen voorkeur | **Harde grens** |
| 3 | Staat de droger op een plek waar je last hebt van lawaai? | Ja / Nee | Ja: −4 punten per dB boven 62 dB |
| 4 | Welke droogprogramma's wil je zeker hebben? | Wol, Sport en outdoor, Stoom, Allergie/hygiëne, Beddengoed en dons | **Wensen** |
| 5 | Wat is nog meer belangrijk? | Extra zuinig (energielabel A), Bediening met een app | **Wensen** |

**Grijze opties.** Grijs als geen droger bij 2+ winkels binnen maat en budget het zeker heeft,
samen met je eerdere keuzes. De reden staat eronder: "Niet tot €700; wel vanaf €759", of, als
de optie op zich wel binnen het budget bestaat maar niet samen met je andere keuzes, "Samen met
je andere keuzes pas vanaf €759".

---

## 3. De score per droger

Elke droger begint met **100 punten**.

| Situatie | Punten |
|---|---|
| Wens (programma of extra) die hij niet heeft | −150 |
| Wens die onbekend is | −40 |
| Stil gewenst | −4 per dB boven 62 |
| Energielabel (altijd) | −1,5 per klasse onder A |
| Trommel kleiner dan ideaal / groter dan ideaal | −20 / −4 per kg |
| Prijs | de duurste in de lijst verliest tot 5 punten |

Het energielabel weegt bewust licht: een C-droger kost zo'n €15 per jaar meer stroom dan een
A-droger, dus een C-droger die €200 goedkoper is, is ook over 10 jaar nog voordeliger. Wie zuinig
belangrijk vindt, vinkt "Extra zuinig" aan.

Programmalijst met minstens 5 programma's = volledig (wat er niet in staat heeft hij niet), behalve
bij Miele (zie boven).

*Code: `wasdroger/js/matching.js` (scoreWasdrogers).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
drogers tot 4 punten onder de top de goedkoopste. Daarna van goedkoop naar duur.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen; de kaart noemt wat je met meer budget krijgt (bv. een
stoomprogramma of energielabel A). Metingen: `quiz_stap`, `resultaat_getoond` (budget,
huishouden, stil, aantal, merk en energielabel van de Beste match), `budget_kaart`,
`filter_gebruikt`, `sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 1.152 antwoordcombinaties (22-10-2026): 0 keer leeg, altijd minstens 5 bij 2+
winkels, 0 keer boven budget; in alle 970 combinaties waarin een droger aan alle wensen voldeed,
was de Beste match zo'n droger.

Hisense is vaak Beste match (zo'n 60%, bij 9% van het aanbod). Dat is terecht: de DH3S802
(€439-449) heeft een volledige programmalijst inclusief stoom, en de DH5I104 is energielabel A en
60 dB voor €679. Bosch en Siemens zijn bij gelijke kenmerken duurder en winnen daardoor zelden.
