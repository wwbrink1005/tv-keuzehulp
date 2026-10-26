# Hoe de vaatwasser-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met vaatwassers op de resultaatpagina.
Stand: 25 oktober 2026 (nieuwe opzet met maat, budget en score per vaatwasser, zoals de andere
keuzehulpen).

---

## In één alinea

De bezoeker beantwoordt 4 vragen. Inbouw of vrijstaand, de maat en het budget bepalen **welke
vaatwassers mogen meedoen**. De extra's bepalen **hoe goed elke vaatwasser past**. Een vaatwasser
die een uitgesproken wens niet heeft, komt altijd onder de vaatwassers die hem wel hebben. Bovenaan
staat de **Beste match**: de best passende, en als meerdere even goed passen de goedkoopste daarvan.

---

## 1. De gegevens

Zo'n 170 vaatwassers bij 2+ winkels: ~105 inbouw, ~65 vrijstaand. Bosch, Siemens en Miele (zo'n
120) komen van de eigen sites, de rest uit Icecat. 12 zijn 45 cm breed; bij inbouw zijn 19 XXL
(86-87 cm hoog).

**Waarom de oude extra's weg zijn:** per merk wel of niet ingevuld, dus een filter liet hele merken
stil vallen. Kinderslot alleen bij Beko en Miele, invertermotor alleen bij AEG, wifi onbekend bij
Miele/Beko/Whirlpool, AquaStop hebben Bosch/Siemens/Miele allemaal. De afwasprogramma's: eco,
intensief en snel heeft vrijwel elke vaatwasser, en Miele noemt "stil" en "glas" niet. Ze staan nog
wel als filter op de resultaatpagina.

**Afgeleid** (`js/data.js`):

| Kenmerk | Hoe |
|---|---|
| Maat | breedte onder 50 cm = smal; inbouw vanaf 84,5 cm hoog = XXL |
| Droogt beter | automatische deuropening, of droogsysteem EfficientDry, PerfectDry, Zeolith, AirDry of autoOpen |
| Besteklade | besteksysteem "Lade" of "Mand & lade" |
| Plaatsing zonder data | de naam: geïntegreerd, inbouw, onderbouw, SCi/SCU (vier Miele-modellen vielen eerst weg) |

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Wat voor vaatwasser? | Inbouw / Vrijstaand | **Harde grens** |
| 2 | Maat (inbouw) | 60 cm standaardnis (82 cm) / 60 cm hoge nis (87 cm) / 45 cm smal / Weet ik nog niet | **Harde grens**: XXL past niet in een standaardnis; in een hoge nis past alles van 60 cm |
| 2 | Maat (vrijstaand) | 60 cm / 45 cm smal / Maakt niet uit | **Harde grens** |
| 3 | Wat wil je maximaal uitgeven? | Inbouw €750/€950, vrijstaand €600/€750, Geen voorkeur | **Harde grens** |
| 4 | Wat nog meer? | Stiller dan de meeste, Zo zuinig mogelijk, Droogt beter, Besteklade, 15+ couverts (niet bij smal), Geen | Stil en zuinig: score; de rest: **wensen** |

**Vervallen:** personen (82% van de 60 cm-modellen heeft 13 of 14 couverts; groot gezin is nu
"15+ couverts", klein huishouden "45 cm smal"), geluid en energie als aparte vraag, afwasprogramma's.

**Grijze opties.** Grijs als geen vaatwasser bij 2+ winkels binnen plaatsing, maat en budget het
zeker heeft, met de reden erbij.

---

## 3. De score per vaatwasser

| Situatie | Punten |
|---|---|
| Wens (droogt beter, besteklade, 15+ couverts) die hij niet heeft / onbekend | −150 / −40 |
| Zuinig gewenst | −5 per labelstap boven de zuinigste van de lijst (onbekend −15) |
| Stil gewenst | −2 per dB boven de stilste van de lijst (onbekend −6) |
| Prijs | de duurste in de lijst verliest tot 5 punten |

Stil telt vanaf de stilste, niet vanaf het gemiddelde: met het gemiddelde won een vaatwasser van
44 dB op prijs van een van 38 dB. Een onbekend label telt als drie stappen, zodat het niet wint van
een bekend label C.

*Code: `vaatwasser/js/matching.js` (scoreVaatwassers).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 20 bij 2+ winkels (smal: er zijn er maar
6). Beste match: van de vaatwassers tot 4 punten onder de top de goedkoopste.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen. Metingen: `quiz_stap`, `resultaat_getoond` (budget,
plaatsing, maat, extra's, aantal, merk van de Beste match), `budget_kaart`, `filter_gebruikt`,
`sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 576 antwoordcombinaties (25-10-2026): 0 keer leeg, altijd minstens 5 bij 2+ winkels
(als die er zijn), 0 keer boven budget; in alle combinaties waarin een vaatwasser aan alle wensen
voldeed, was de Beste match zo'n vaatwasser.

Whirlpool (10% van het aanbod) en Beko (9%) zijn samen in zo'n 80% van de combinaties Beste match:
ze zijn binnen elk type het goedkoopst (mediaan €571 en €449, tegen Bosch €749 en Miele €1.249) en in
Icecat volledig beschreven. Bosch, Siemens, Miele en AEG staan bij gerichte wensen (droogt beter,
besteklade, stil) wel in de lijst.
