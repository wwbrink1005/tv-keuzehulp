# Hoe de monitor-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met monitoren op de resultaatpagina.
Stand: 21 oktober 2026 (nieuwe opzet met budget en score per monitor, zoals tv, printer,
laptop en wasmachine).

---

## In één alinea

De bezoeker beantwoordt 5 vragen, of 6 als hij gamet. De maat en het budget bepalen **welke
monitoren mogen meedoen**. De andere vragen bepalen **hoe goed elke monitor past**. Een
monitor die een uitgesproken wens niet heeft, komt altijd onder de monitoren die hem wel
hebben. Bovenaan staat de **Beste match**: de best passende, en als meerdere even goed passen
de goedkoopste daarvan.

---

## 1. De gegevens

Alles komt uit Icecat. Sinds oktober 2026 halen we er zes velden extra uit
(`keuzehulp-pipeline/migrations/monitoren_extra_specs.sql`):

| Kolom | Icecat-veld | Bij 2+ winkels ingevuld |
|---|---|---|
| hoogte_verstelbaar | In hoogte verstelbaar | 268 van 294 |
| usb_pd_watt | USB Power Delivery tot max. | 103 (vrijwel alle monitoren met USB-C) |
| webcam | Ingebouwde camera | 241 (15x ja) |
| hdmi_versie | HDMI versie | 258 (95x 2.1) |
| srgb_dekking | sRGB-dekking (gemiddeld) | 203 |
| dci_p3_dekking | Gleurengamma DCI-P3 (die tikfout zit echt zo in Icecat) | 115 |

Ook gerepareerd: Icecat noemt een gebogen scherm "Gebogen", maar de site herkende alleen
"curved". Gebogen monitoren zonder dat woord in de naam telden als vlak.

**Regel:** wat onbekend is, telt nooit als "nee". In de matching kost onbekend minder punten,
en een optie in de vragen wordt alleen grijs als het zeker niet kan.

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Hoe groot wil je het scherm? | 24 / 27 / 32 inch of groter / ultrawide | **Harde grens** (ultrawide gaat op beeldverhouding 21:9 of 32:9) |
| 2 | Wat wil je maximaal uitgeven? | Tot €X / Tot €Y / Geen voorkeur | **Harde grens** |
| 3 | Waarvoor gebruik je de monitor? | Thuiswerk / Gamen / Creatief / Een beetje van alles (max 2) | Voorkeuren, zie de score |
| 4 | Hoe game je? *(alleen bij Gamen)* | PS5 of Xbox / Pc, rustige games / Pc, snelle games / Competitief | **Wens**: 120 Hz + HDMI 2.1 / 120 Hz / 144 Hz / 240 Hz |
| 5 | Wat vind je belangrijk aan het beeld? | 4K, OLED, Gebogen, Geen voorkeur | **Wensen**. Gebogen staat bij elke maat (bij ultrawide met "Vrijwel elke ultrawide is gebogen"); wie hem niet aanvinkt, krijgt geen aftrek voor een gebogen of vlak scherm |
| 6 | Wat moet de monitor nog meer kunnen? | Laptop opladen via USB-C (60 W of meer), In hoogte verstelbaar, Webcam, Speakers, Geen | **Wensen** |

| Maat | Budgetopties |
|---|---|
| 24 inch | tot €150, tot €250, geen voorkeur |
| 27 inch | tot €200, tot €400, geen voorkeur |
| 32 inch en ultrawide | tot €400, tot €750, geen voorkeur |

*Bedragen in `monitor/js/data.js` (budgetCapsBySize): rond een derde en twee derde van de
prijzen bij 2+ winkels.*

**Grijze opties.** Een optie wordt grijs als geen monitor bij 2+ winkels binnen maat en budget
hem zeker heeft, samen met je eerdere wensen. De reden staat eronder: "Niet tot €400; wel vanaf
€649", "Niet in combinatie met je andere keuzes" of "Niet in 24 inch".

Bewust geen vraag: HDR (DisplayHDR 600+ is zeldzaam en slecht ingevuld), G-Sync/FreeSync en
flikkervrij (heeft vrijwel elke monitor), Ethernet/KVM/pivot (zakelijke niche, wel deels als
filter), smart monitor (een paar Samsungs).

---

## 3. De score per monitor

Elke monitor begint met **100 punten**.

| Situatie | Punten |
|---|---|
| Wens (gamevraag, beeld, extra) die hij niet heeft | −150 |
| Wens die onbekend is | −50 |
| Niet scherp genoeg voor de maat (24" Full HD, 27" QHD, 32" 4K, ultrawide 3440x1440) | −12 |
| Creatief: kleurbereik onder 99% sRGB en onder 90% DCI-P3 / onbekend | −15 / −6 |
| Creatief: lager dan QHD / VA- of TN-paneel | −8 / −6 |
| Gamen: reactietijd boven 4 ms | −4 |
| Thuiswerk: niet in hoogte verstelbaar / onbekend | −8 / −3 |
| 24 inch gekozen, scherm kleiner dan 23 inch | −6 |
| Gamen: 165 Hz of meer; competitief met 1 ms of sneller; console met 4K | +2 / +2 / +3 |
| Creatief: 95% DCI-P3 of meer | +3 |
| Prijs | de duurste in de lijst verliest tot 6 punten |

*Code: `monitor/js/matching.js` (scoreMonitors).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
monitoren tot 4 punten onder de top de goedkoopste. Daarna van goedkoop naar duur.

Filters: prijs, schermgrootte, merk, schermtype, resolutie, verversingssnelheid,
beeldverhouding, **functies** (in hoogte verstelbaar, laptop opladen via USB-C, USB-C, webcam,
speakers, gebogen, HDMI 2.1; meerdere = alle tegelijk), HDMI-poorten, winkel en aantal winkels.

---

## 5. "Meer budget?", metingen

Zelfde als bij tv, printer, laptop en wasmachine: de kaart verschijnt als monitoren boven het
budget duidelijk beter passen dan wat je binnen budget ziet. Heeft de beste daarvan een wens die
binnen je budget niet te krijgen is (bv. HDMI 2.1, 240 Hz, USB-C laden of de scherpte die bij de
maat hoort), dan noemt de kaart die. Metingen: `quiz_stap`, `resultaat_getoond` (budget, maat,
gebruik, aantal, merk van de Beste match), `budget_kaart`, `filter_gebruikt`, `sorteren`,
`affiliate_klik`.

---

## 6. Controleren

Simulatie van 10.032 antwoordcombinaties (21-10-2026): 0 keer leeg, altijd minstens 5 bij 2+
winkels, 0 keer boven budget; in alle 3.248 combinaties waarin een monitor aan alle wensen
voldeed, was de Beste match zo'n monitor. AOC is vaak Beste match (in ongeveer 40% van de
combinaties, terwijl AOC 15% van het aanbod is): AOC is bij gelijke score meestal de
goedkoopste, niet omdat andere merken gegevens missen.
