# Hoe de airfryer-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met airfryers op de resultaatpagina.
Stand: 25 oktober 2026 (nieuwe opzet met budget en score per airfryer, zoals de andere
keuzehulpen).

---

## In één alinea

De bezoeker beantwoordt 4 vragen. Het budget bepaalt **welke airfryers mogen meedoen**. De andere
vragen bepalen **hoe goed elke airfryer past**. Een airfryer die een uitgesproken wens niet heeft,
komt altijd onder de airfryers die hem wel hebben. Bovenaan staat de **Beste match**: de best
passende, en als meerdere even goed passen de goedkoopste daarvan.

---

## 1. De gegevens

**Het aanbod is smal:** 155 airfryers van maar 5 merken (Tefal, Philips, Moulinex, Cosori, Braun),
waarvan 42 bij 2+ winkels. **Ninja, Princess, Inventum en Tristar ontbreken** (okt. 2026). Dat moet
in de pipeline opgelost worden; de keuzehulp rekent alles uit de live data, dus nieuwe merken doen
vanzelf mee. Herbereken dan wel de budgetbedragen.

**Kijkglas en stomen**: ja, nee of onbekend (`js/utils.js`). Leeg telde eerst stil als "nee".
Stomen ook uit de naam ("Met Stoomfunctie"). Kijkglas is bij 27 van de 42 onbekend, vooral bij
Tefal: met "kijkglas" aangevinkt komen die onder de airfryers waarvan het zeker is.

**Compact**: breedte × diepte = de ruimte op het aanrecht (in dm²).

**Uit het aanbod gehaald:** zonder inhoud én zonder type is het een accessoire (Philips HD9959/00).

**Vervallen:** de vraag "Wat wil je er vooral mee doen?" Grillen en braden stonden bij de helft niet
ingevuld (terwijl vrijwel elke airfryer het kan), drogen bij Tefal bijna nooit. Display en
vaatwasserbestendig hebben vrijwel alle airfryers. Ze staan nog wel als filter.

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Voor hoeveel personen? | 1-2 / 3-4 / 5+ | Minstens 0 / 5 / 8 liter, als score |
| 2 | Twee gerechten tegelijk? | Dubbele mand / 1 mand / Maakt niet uit | **Wens** |
| 3 | Wat wil je maximaal uitgeven? | 1 mand €100/€120, dubbel €150/€200, maakt niet uit €110/€140, Geen voorkeur | **Harde grens** |
| 4 | Nog iets belangrijk? | Kijkglas, Ook stomen, Compact, Geen | Kijkglas en stomen: **wensen**; compact: score |

**Grijze opties.** Grijs als geen airfryer bij 2+ winkels binnen mand en budget het zeker heeft,
met de reden erbij ("Niet tot €100; wel vanaf €219.").

---

## 3. De score per airfryer

| Situatie | Punten |
|---|---|
| Wens (mand, kijkglas, stomen) die hij niet heeft / onbekend | −150 / −40 |
| Te weinig inhoud | −3 per liter (onbekend −6) |
| Compact gewenst | −1,5 per dm² boven de kleinste van de lijst (onbekend −6) |
| Prijs | de duurste in de lijst verliest tot 5 punten |

*Code: `airfryer/js/matching.js` (scoreAirfryers).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels. Beste match: van de
airfryers tot 4 punten onder de top de goedkoopste.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen. Metingen: `quiz_stap`, `resultaat_getoond` (budget, personen,
mand, extra's, aantal, merk van de Beste match), `budget_kaart`, `filter_gebruikt`, `sorteren`,
`affiliate_klik`.

---

## 6. Controleren

Simulatie van 216 antwoordcombinaties (25-10-2026): 0 keer leeg, altijd minstens 5 bij 2+ winkels,
0 keer boven budget; in alle combinaties waarin een airfryer aan alle wensen voldeed, was de Beste
match zo'n airfryer.

Philips is vaak Beste match (53%, bij 29% van het aanbod): de Philips Airfryer L (€78) is de
goedkoopste met een zeker kijkglas, en Philips heeft de enige stoommodellen. Tefal (55% van het
aanbod, 29% Beste match) mist vaak het kijkglas in de data.
