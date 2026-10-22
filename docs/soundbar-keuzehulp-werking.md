# Hoe de soundbar-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met soundbars op de resultaatpagina.
Stand: 22 oktober 2026 (nieuwe opzet met budget en score per soundbar, zoals tv, printer,
laptop, wasmachine en monitor).

---

## In één alinea

De bezoeker beantwoordt 6 vragen. De breedte (als maximum) en het budget bepalen **welke
soundbars mogen meedoen**. De andere vragen bepalen **hoe goed elke soundbar past**. Een
soundbar die een uitgesproken wens niet heeft, komt altijd onder de soundbars die hem wel
hebben. Bovenaan staat de **Beste match**: de best passende, en als meerdere even goed passen
de goedkoopste daarvan.

---

## 1. De gegevens

Het aanbod is klein: zo'n 50 soundbars bij 2+ winkels. 38 daarvan staan in Icecat; Sonos, Sony
en een paar Denons niet.

**Losse subwoofer.** Icecat's "Meegeleverde subwoofer" staat ook op "Ja" bij soundbars met de
bas ín de bar (TCL S45H, Hisense HS2000). Sinds oktober 2026 halen we ook "Subwoofer locatie",
"Gewicht subwoofer" en "Subwoofer-connectiviteit" op; die zeggen of hij echt los staat. Een
leeg veld telde vroeger als "geen subwoofer"; nu als onbekend.

**Achterspeakers.** Uit "Gewicht van de achterluidspreker", plus vaste kenmerken (JBL Bar
800/1000/1300 MK2 met afneembare achterspeakers, Samsung Q990, Sony Theatre System 6). Met
minder dan 4 hoofdkanalen (2.x, 3.x) zijn er nooit losse achterspeakers.

**Dolby Atmos.** Uit de decoderlijst, of uit hoogtekanalen in de kanalen (x.x.2, x.x.4).

**Vaste kenmerken** voor modellen zonder (volledige) Icecat-gegevens staan in
`soundbar/js/utils.js` (VAST), nagekeken bij fabrikant en winkels op 22-10-2026: Sonos
Ray/Beam/Arc (geen losse subwoofer, WiFi), Sony Bravia Theatre Bar 6 (losse subwoofer, geen
WiFi), Bar 8/9 (geen subwoofer, WiFi), System 6 (subwoofer en achterspeakers), HT-S2000 (bas
in de bar, geen WiFi), Denon DHT-S316/S517 (losse subwoofer, geen WiFi), Denon Home Soundbar
(WiFi, geen subwoofer), LG Sound Suite (subwoofer los te koop), Hisense HS2000 (bas in de bar).

*Migratie: `keuzehulp-pipeline/migrations/soundbars_extra_specs.sql`.*

**Regel:** wat onbekend is, telt nooit als "nee". In de matching kost onbekend minder punten,
en een optie in de vragen wordt alleen grijs als het zeker niet kan.

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Hoe groot is je tv? | Tot 43 / 43-55 / 55+ inch / Weet ik niet | Geeft het breedte-advies |
| 2 | Welke breedte past? | Tot 80 cm / Tot 110 cm / 110 cm of breder / Maakt niet uit | **Harde grens als maximum** (bij 110+ geen maximum). Hoe dichter bij het advies, hoe beter |
| 3 | Wat wil je maximaal uitgeven? | Tot €250 / Tot €500 / Geen voorkeur | **Harde grens** |
| 4 | Waarvoor vooral? | Tv-kijken / Films / Muziek / Gamen | Voorkeuren, zie de score |
| 5 | Subwoofer erbij? | Ja / Maakt niet uit / Nee | **Wens** (losse subwoofer wel/niet) |
| 6 | Wat nog meer? | Dolby Atmos, Losse achterspeakers, WiFi-streaming, Geen | **Wensen** |

"Aan de muur hangen" is vervallen: dat kan bij vrijwel elke soundbar (41 van de 41 waarvan
het bekend is).

**Grijze opties.** Een optie wordt grijs als geen soundbar bij 2+ winkels binnen breedte en
budget hem zeker heeft, samen met je eerdere keuzes. De reden staat eronder ("Niet tot €250;
wel vanaf €391", "Niet in deze breedte").

---

## 3. De score per soundbar

Elke soundbar begint met **100 punten**.

| Situatie | Punten |
|---|---|
| Wens (subwoofer ja/nee, Atmos, achterspeakers, WiFi) die hij niet heeft | −150 |
| Wens die onbekend is | −50 |
| Smaller dan het geadviseerde vak (80-110 of 110+ cm) | −3 per 10 cm, max −15 |
| Tv-kijken: geen middenkanaal / onbekend | −8 / −3 |
| Films: geen Atmos / onbekend; geen losse subwoofer / onbekend | −10 / −4; −6 / −3 |
| Films: losse achterspeakers | +4 |
| Muziek: geen WiFi / onbekend; geen losse subwoofer / onbekend | −8 / −3; −4 / −2 |
| Muziek: AirPlay of Spotify Connect | +2 |
| Gamen: geen Atmos / onbekend | −8 / −3 |
| Prijs | de duurste in de lijst verliest tot 6 punten |

Wie zelf "geen losse subwoofer" kiest, krijgt bij films en muziek geen aftrek voor het
ontbreken ervan.

*Code: `soundbar/js/matching.js` (scoreSoundbars).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
soundbars tot 4 punten onder de top de goedkoopste. Daarna van goedkoop naar duur.

Filters: prijs, merk, geluidservaring, **functies** (losse subwoofer, Dolby Atmos/DTS:X, losse
achterspeakers, WiFi-streaming, AirPlay, Spotify Connect; meerdere = alle tegelijk), HDMI,
breedte, winkel en aantal winkels.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen: de kaart verschijnt als soundbars boven het budget
duidelijk beter passen dan wat je binnen budget ziet, en noemt de wens die je met meer budget
krijgt (bv. losse achterspeakers). Metingen: `quiz_stap`, `resultaat_getoond` (budget, breedte,
gebruik, subwoofer, aantal, merk van de Beste match), `budget_kaart`, `filter_gebruikt`,
`sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 1.152 antwoordcombinaties (22-10-2026): 0 keer leeg, altijd minstens 5 bij 2+
winkels, 0 keer boven budget of breder dan gekozen; in alle 704 combinaties waarin een
soundbar aan alle wensen voldeed, was de Beste match zo'n soundbar. Samsung is vaak Beste
match (55%, bij 23% van het aanbod): Samsung heeft de meeste betaalbare soundbars met losse
subwoofer en is bij gelijke score meestal de goedkoopste.
