# Hoe de koelkast-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met koelkasten op de resultaatpagina.
Stand: 25 oktober 2026 (nieuwe opzet met budget, vriezervraag en score per koelkast, zoals de
andere keuzehulpen). Dezelfde code draait in de winkelversie (embed), zie `docs/b2b.md`.

---

## In één alinea

De bezoeker beantwoordt 6 vragen (5 bij een Amerikaanse of extra brede koelkast). Inbouw of
vrijstaand, het type of de nis en het budget bepalen **welke koelkasten mogen meedoen**. De andere
vragen bepalen **hoe goed elke koelkast past**. Een koelkast die een uitgesproken wens niet heeft,
komt altijd onder de koelkasten die hem wel hebben. Bovenaan staat de **Beste match**: de best
passende, en als meerdere even goed passen de goedkoopste daarvan.

---

## 1. De gegevens

Zo'n 390 koelkasten bij 2+ winkels. **Bosch, Siemens, Liebherr en Miele (zo'n 260) staan niet in
Icecat**; hun gegevens komen van de eigen sites (`bosch_scraper.py` enz. in de pipeline). Miele.nl
blokkeert scrapers sinds okt. 2026; daar komt het vriezertype uit de naam.

**Vriezer** (`vriezer` in `js/utils.js`, regels in `js/data.js` `vriezerSoort`):

| Soort | Hoe herkend |
|---|---|
| Aparte vriezer | inhoud vriezer 40 liter of meer, of in de naam: koel-vriescombinatie, combi, side-by-side, KFN/KF (Miele); Amerikaans altijd |
| Klein vriesvak | inhoud onder 40 liter, of "met vriesvak" in de naam |
| Zonder vriezer | inhoud 0 liter, of "zonder vriesvak/vriezer" in de naam |

De inhoud gaat vóór de naam: winkels zetten soms "zonder vriesvak" bij een koelkast die er wel een
heeft (Liebherr IRbi 3951: 16 liter). Bij zo'n 97% van de koelkasten is het type bekend.

**No Frost** gaat over de vriezer (`nofrost_vriezer`). Vroeger telde "automatisch ontdooien",
maar bij Icecat en Liebherr is dat het koelgedeelte, dat vrijwel altijd vanzelf ontdooit; bijna elke
koelkast was zo "No Frost". Siemens gaf juist "nee" bij modellen met alleen een No Frost-vriezer.

**Onbekend is niet "nee"**: verszone, waterdispenser en ijsmaker zonder gegevens tellen als
onbekend (vroeger stil als "Nee").

**Uit het aanbod gehaald:** wijnkoelkasten (vier Liebherr UW-modellen stonden in de tabel).

**Nissen:** 88, 102, 122, 140, 158, 178 en 194 cm. 102 en 158 zijn in okt. 2026 toegevoegd: 22
inbouwkoelkasten vielen in geen groep en verdwenen zodra je een nis koos. Er zijn geen renders van
die twee; de vragenpagina toont de kast van 122 en 140 cm.

*Migratie: `keuzehulp-pipeline/migrations/koelkasten_extra_specs.sql` (vriezer_l, nofrost_vriezer).*

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Inbouw of vrijstaand? | Inbouw / Vrijstaand | **Harde grens** |
| 2 | Nishoogte of type | 7 nissen + Weet ik nog niet / Standaard, Extra breed, Amerikaans, Tafelmodel | **Harde grens** (geen koelkast in die nis: alle inbouw) |
| 3 | Wat wil je maximaal uitgeven? | 2 bedragen per type of nis + Geen voorkeur | **Harde grens** |
| 4 | Moet er een vriezer in? *(niet bij Amerikaans/extra breed)* | Aparte vriezer / Vriesvak / Alleen koelen / Maakt niet uit | **Wens** (bij een tafelmodel geen "aparte vriezer") |
| 5 | Voor hoeveel personen? | 1-2 / 3-4 / 5+ | Minstens 0 / 250 / 350 liter koelruimte |
| 6 | Wat nog meer? | Energiezuinig (A-C), Stiller dan de meeste, No Frost (alleen met vriezer), Vers zone, Waterdispenser en IJsmaker (alleen Amerikaans/extra breed), Geen | **Wensen**; stil is een score |

**Budgetbedragen** (`budgetCaps` in `js/data.js`): rond een derde en twee derde van de prijzen per
type of nis. Bijvoorbeeld standaard €700/€950, Amerikaans €1.150/€1.700, nis 178 cm €1.000/€1.650.

**Grijze opties.** Grijs als geen koelkast bij 2+ winkels binnen type/nis en budget het zeker
heeft, samen met de vriezerkeuze en de al aangevinkte extra's, met de reden erbij ("Niet tot €600;
wel vanaf €607.", "Niet bij een nis van 102 cm.").

---

## 3. De score per koelkast

| Situatie | Punten |
|---|---|
| Wens (vriezer, extra) die hij niet heeft / onbekend | −150 / −40 |
| Koelruimte kleiner dan nodig | −1,5 per 10 liter (onbekend −5) |
| Stil gewenst | −3 per dB boven het gemiddelde van de lijst (onbekend −4) |
| Prijs | de duurste in de lijst verliest tot 5 punten |

*Code: `koelkast/js/matching.js` (scoreKoelkasten).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 zichtbaar (2+ winkels; in de
winkelversie telt elke koelkast). Beste match: van de koelkasten tot 4 punten onder de top de
goedkoopste.

Filters: prijs, plaatsing, merk, inhoud, energielabel, geluid, **vriezer** (nieuw), functies (No
Frost-vriezer, vers zone, waterdispenser, ijsmaker), afmetingen, winkel.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen; de kaart noemt wat je met meer budget krijgt (bv. een
No Frost-vriezer of genoeg koelruimte). Metingen: `quiz_stap`, `resultaat_getoond` (budget,
plaatsing, type/nis, vriezer, extra's, aantal, merk van de Beste match), `budget_kaart`,
`filter_gebruikt`, `sorteren`, `affiliate_klik`. In de winkelversie wordt niets gemeten.

---

## 6. Controleren

Simulatie van 3.897 antwoordcombinaties (25-10-2026): 0 keer leeg, altijd minstens 5 bij 2+
winkels (als die er zijn), 0 keer boven budget; in alle combinaties waarin een koelkast aan alle
wensen voldeed, was de Beste match zo'n koelkast. De winkelversie (`?klant=demowitgoed`) is
doorgeklikt.

Merken in de Beste match: Liebherr 26% (33% van het aanbod), Siemens 19% (8%), Beko 14% (7%), LG
13% (6%), Hisense 11% (6%), Bosch 6% (17%), Miele bijna 0% (7%). Siemens wint vooral bij de nis van
158 cm, waar het een van de drie koelkasten heeft. Bosch en Miele zijn binnen hun type vaak duurder;
hun gegevens zijn net zo volledig als die van de rest.
