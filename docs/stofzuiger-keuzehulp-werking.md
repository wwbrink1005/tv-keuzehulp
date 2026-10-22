# Hoe de stofzuiger-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met stofzuigers op de resultaatpagina.
Stand: 22 oktober 2026 (nieuwe opzet met budget en score per stofzuiger, zoals de andere
keuzehulpen).

---

## In één alinea

De bezoeker beantwoordt 6 vragen (5 bij een steelstofzuiger). Het type (met snoer of steel) en
het budget bepalen **welke stofzuigers mogen meedoen**. De andere vragen bepalen **hoe goed elke
stofzuiger past**. Een stofzuiger die een uitgesproken wens niet heeft, komt altijd onder de
stofzuigers die hem wel hebben. Bovenaan staat de **Beste match**: de best passende, en als
meerdere even goed passen de goedkoopste daarvan.

---

## 1. De gegevens

Zo'n 140 stofzuigers bij 2+ winkels: ~97 met snoer (€89-448) en ~44 steelstofzuigers (€114-999).
Bosch (57) en Miele (30) staan niet in Icecat; hun gegevens komen van de eigen sites. **Dyson zit
niet in de feeds**, ook niet bij 1 winkel.

**Uit de productnaam** (vooral voor Bosch en Miele), aangevuld met Icecat voor de andere merken:

| Kenmerk | Uit de naam | Uit Icecat |
|---|---|---|
| Voor huisdierharen | Animal, ProAnimal, Cat & Dog, PET (Bosch: BCS711PET) | turbo-/huisdierborstel |
| Filter voor allergie | Allergy, Hygienic, HYG (Bosch ProHygienic) | HEPA, hygiënefilter |
| Parketborstel | Parquet, Hardfloor, Parket | parketborstel |
| Ook dweilen | Aqua | "Soort reiniging: Droog en nat" |
| Extra of wisselbare accu | Bosch Unlimited (Power for ALL), Miele HX3 Plus ("2 x 70 min") | "Verwijderbare batterij" |

Een naam zonder zo'n woord zegt niet dat het ontbreekt: dat telt als **onbekend**, niet als "nee".

**Uit het aanbod gehaald:** twee Bosch-robotstofzuigers (horen bij de robotstofzuiger-keuzehulp)
en een AEG-kruimelzuiger.

**Vervallen:** de vloervraag. "Reinigt ondergronden" is bij Bosch en Miele nooit bekend, dus een
vloerfilter liet die ongemerkt vallen; bovendien werkt vrijwel elke stofzuiger op beide vloeren.
Het echte verschil (parketborstel) is nu een extra.

*Migratie: `keuzehulp-pipeline/migrations/stofzuigers_extra_specs.sql`.*

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Wat voor stofzuiger? | Met snoer / Steelstofzuiger | **Harde grens** |
| 2 | Wat wil je maximaal uitgeven? | snoer: tot €150 / €250; steel: tot €300 / €500; Geen voorkeur | **Harde grens** |
| 3 | Hoe groot is je woning? | Appartement / Gemiddeld / Groot of met trappen | Snoer: bereik 8 / 10 / 12 m. Steel: accu 30 / 45 / 60 min |
| 4 | Met of zonder stofzak? *(alleen snoer)* | Met / Zonder / Geen voorkeur | **Wens** |
| 5 | Is stil belangrijk? | Ja / Nee | Ja: −3 per dB boven het gemiddelde van het type |
| 6 | Wat nog meer? | Huisdieren, Allergie, Parketborstel; bij steel ook Dweilen, Extra accu | **Wensen** |

**Grijze opties.** Grijs als geen stofzuiger bij 2+ winkels binnen type en budget het zeker heeft,
samen met je eerdere keuzes, met de reden erbij.

---

## 3. De score per stofzuiger

| Situatie | Punten |
|---|---|
| Wens (zak, extra) die hij niet heeft / onbekend | −150 / −40 |
| Snoer: bereik korter dan nodig | −6 per meter (onbekend −5) |
| Steel: accu korter dan nodig | −1,5 per minuut (onbekend −15) |
| Stil gewenst | −3 per dB boven het gemiddelde van het type |
| Prijs | de duurste in de lijst verliest tot 5 punten |

*Code: `stofzuiger/js/matching.js` (scoreStofzuigers).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
stofzuigers tot 4 punten onder de top de goedkoopste.

Filters: o.a. prijs, gewicht, met/zonder zak, merk, functies (allergiefilter, huisdieren,
parketborstel, dweilen, extra accu). De vloertype-kaart staat uit.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen; de kaart noemt wat je met meer budget krijgt (bv. een
wisselbare accu of een langere accuduur). Metingen: `quiz_stap`, `resultaat_getoond` (budget, type,
woning, extra's, aantal, merk van de Beste match), `budget_kaart`, `filter_gebruikt`, `sorteren`,
`affiliate_klik`.

---

## 6. Controleren

Simulatie van 666 antwoordcombinaties (22-10-2026): 0 keer leeg, altijd minstens 5 bij 2+ winkels,
0 keer boven budget; in alle combinaties waarin een stofzuiger aan alle wensen voldeed, was de
Beste match zo'n stofzuiger.

Philips is vaak Beste match (zo'n 45%, bij 7% van het aanbod): Philips is goedkoop én in Icecat
volledig beschreven (de XC3031 van €187 is de goedkoopste steelstofzuiger met huisdierborstel,
parketborstel en wisselbare accu). Bosch en Miele staan niet in Icecat; wat niet uit hun naam
blijkt, blijft onbekend en scoort daardoor iets lager bij aangevinkte extra's.
