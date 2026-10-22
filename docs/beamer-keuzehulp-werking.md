# Hoe de beamer-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met beamers op de resultaatpagina.
Stand: 22 oktober 2026 (nieuwe opzet met budget en score per beamer, zoals de andere
keuzehulpen).

---

## In één alinea

De bezoeker beantwoordt 6 vragen. Het budget bepaalt **welke beamers mogen meedoen**. De andere
vragen bepalen **hoe goed elke beamer past**. Een beamer die een wens niet waarmaakt (te weinig
licht voor de kamer, niet scherp genoeg, te zwaar om mee te nemen, een extra die ontbreekt)
komt altijd onder de beamers die dat wel doen. Bovenaan staat de **Beste match**: de best
passende, en als meerdere even goed passen de goedkoopste daarvan.

---

## 1. De gegevens

Het aanbod is klein: 36 beamers bij 2+ winkels, van €139 tot €3.195.

**Helderheid.** Icecat's "Projector helderheid" (ANSI-lumen) ontbrak bij 7 beamers, vooral dure
lasermodellen. Sinds oktober 2026 halen we ook "Helderheid projector" op, maar gebruiken die
alleen als het ISO- of ANSI-lumen is: "LED-lumen" is een marketingmaat die 20 tot 40 keer te hoog
uitvalt (Aopen QH12a: 5.500 LED-lumen = 135 ANSI-lumen). De rest staat als vast kenmerk in
`beamer/js/utils.js` (LUMEN_VAST), nagekeken bij fabrikant en winkels op 22-10-2026: Hisense
C2 Ultra 3.000, C3 2.500, PT1 2.500, Samsung The Premiere LPF5D 500, Epson EF-21W 1.000,
EH-LS670 3.600.

**Smart tv.** "Smart TV" is maar bij de helft ingevuld. Een besturingssysteem (Google TV, VIDAA,
Tizen) of een lijst video-apps telt ook (nieuw veld "Video-apps"). Vaste kenmerken: Epson
EF-21/61/62/72 (Google TV) en BenQ-modellen met een "i" (meegeleverde Android TV-stick).

**Projectieafstand.** Icecat zet de Epson EH-LS670 op "normale projectieafstand"; het is een
ultrakorte (0,3 tot 0,7 m). Gecorrigeerd in utils.js.

*Migratie: `keuzehulp-pipeline/migrations/beamers_extra_specs.sql`.*

**Regel:** wat onbekend is, telt nooit als "nee". In de matching kost onbekend minder punten,
en een optie in de vragen wordt alleen grijs als het zeker niet kan.

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Waarvoor vooral? | Films / Gamen / Werk / Een beetje van alles | Voorkeuren, zie de score |
| 2 | Wat wil je maximaal uitgeven? | Tot €500 / Tot €1.000 / Geen voorkeur | **Harde grens** |
| 3 | Hoe licht is de ruimte? | Donker / Normaal verduisterd / Vaak licht | **Wens**: normaal 2.000+, licht 4.000+ lumen |
| 4 | Hoe scherp? | Zo scherp mogelijk / Gewoon prima / Maakt niet uit | **Wens**: 4K, of geen 720p/WXGA en lager |
| 5 | Mee te nemen? | Ja / Nee / Maakt niet uit | **Wens** bij ja: 2,5 kg of lichter |
| 6 | Nog iets belangrijk? | Smart TV, Laser, Stil (29 dB of minder), Dicht tegen de muur, Geen | **Wensen** |

"Ingebouwde speakers" is vervallen: 34 van de 36 beamers hebben ze.

**Grijze opties.** Een optie wordt grijs als geen beamer bij 2+ winkels binnen het budget hem
zeker waarmaakt, samen met je eerdere keuzes. De reden staat eronder ("Niet tot €1.000; wel
vanaf €1.359").

---

## 3. De score per beamer

Elke beamer begint met **100 punten**.

| Situatie | Punten |
|---|---|
| Wens (helderheid, scherpte, draagbaar, extra) die hij niet waarmaakt | −150 |
| Wens die onbekend is | −50 |
| Films: geen 4K / zakelijke beamer (bedrijf, onderwijs, grote zalen) | −4 / −6 |
| Gamen: geen 4K | −3 |
| Werk: minder dan 3.000 lumen | −6 |
| Niet om mee te nemen en minder dan 1.000 lumen | −6 |
| Films of gamen: HDR | +2 |
| Gamen: door Icecat als gamebeamer aangemerkt | +4 |
| Prijs | de duurste in de lijst verliest tot 6 punten |

Inputlag (belangrijk voor gamers) staat niet in de gegevens.

*Code: `beamer/js/matching.js` (scoreBeamers).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
beamers tot 4 punten onder de top de goedkoopste. Daarna van goedkoop naar duur.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen: de kaart verschijnt als beamers boven het budget duidelijk
beter passen, en noemt wat je met meer budget krijgt (bv. helder genoeg voor je kamer, 4K of
een laser). Metingen: `quiz_stap`, `resultaat_getoond` (budget, gebruik, licht, aantal, merk van
de Beste match), `budget_kaart`, `filter_gebruikt`, `sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 3.564 antwoordcombinaties (22-10-2026): 0 keer leeg, altijd minstens 5 bij 2+
winkels, 0 keer boven budget; in alle combinaties waarin een beamer aan alle wensen voldeed, was
de Beste match zo'n beamer. Merken als Beste match ongeveer in verhouding tot het aanbod (Epson
42% bij 33% van het aanbod, BenQ 29% bij 25%).
