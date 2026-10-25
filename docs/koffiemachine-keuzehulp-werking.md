# Hoe de koffiemachine-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met koffiemachines op de resultaatpagina.
Stand: 25 oktober 2026 (nieuwe opzet met vragen per type, budget en score per machine).

---

## In één alinea

De bezoeker kiest eerst het type (volautomaat, halfautomaat, capsules/pads of filter); daarna
hangen de vragen af van dat type. Type, capsulesysteem en budget bepalen **welke machines mogen
meedoen**. De andere vragen bepalen **hoe goed elke machine past**. Een machine die een
uitgesproken wens niet heeft, komt altijd onder de machines die hem wel hebben. Bovenaan staat de
**Beste match**: de best passende, en als meerdere even goed passen de goedkoopste daarvan.

---

## 1. De gegevens

Zo'n 540 koffiemachines, bijna allemaal met Icecat-data: ~250 volautomaten, ~45 halfautomaten,
~175 capsule/padmachines, ~65 filterapparaten.

**Ook 1 winkel telt** (besluit okt. 2026, alleen bij koffiemachines). Winkels verkopen eigen
modelvarianten van volautomaten (Siemens EQ alleen bij Coolblue of alleen bij Expert als
"extraKlasse"). Met de 2-winkelregel bleven 21 van de 237 volautomaten over, zonder Siemens,
Gaggia, Miele, Saeco en KitchenAid. `MIN_WINKELS` in `js/data.js`.

**Ontbreekt in de feeds of in Icecat:** Jura, Melitta, Sage, Moccamaster, Smeg, Tassimo, Lavazza.

**Type** (`classificeerType` in `js/matching.js`), okt. 2026 aangescherpt:

| Regel | Waarom |
|---|---|
| Capsulesysteem in de naam (Nespresso, Vertuo, Dolce Gusto, Senseo, L'OR Barista) → capsules | Icecat noemt sommige "Espressomachine" |
| La Specialista / EC9xxx → halfautomaat | Stond als volautomaat |
| ECAM/EXAM/ETAM, Magnifica, Eletta, Dinamica, Rivelia, PrimaDonna, Philips EP, Siemens EQ, Krups EA8/EA9, Baristina → volautomaat | Icecat zegt soms "Half automatisch" (Magnifica S) |
| Braun KF → filter | De KF 1500 heet bij Icecat "Espressomachine" |
| Volautomaat zonder bonen en zonder molen → halfautomaat (pompdruk) of filter | De'Longhi Icona Vintage, Braun KF 1500 |

Losse koffiemolens en combinatiemachines (filter + espresso) doen niet mee.

**Capsulesysteem** uit de naam (`capsuleSysteemVan` in `js/data.js`); het Icecat-veld noemt een
Vertuo Pop gewoon "Nespresso" en een L'OR Barista "Nespresso".

**Melk** (`melkVan` in `js/data.js`): "auto" = cappuccino op één knop (melkreservoir/karaf,
LatteGo, LatteCrema, Lattissima, Aeroccino; Miele CM, Krups Evidence en Intuition Experience; bij
Dolce Gusto via melkcapsules), "stoom" = stoompijpje, "geen", of onbekend (~50 volautomaten, vooral
Krups). Bij capsulemachines betekent Icecat's "melk toevoegen: handmatig" zelf melk erbij doen,
geen stoompijpje.

**Nieuw uit Icecat:** twee kopjes tegelijk (of 2 uitlopen), thermoskan/glazen kan, timer.
*Migratie: `keuzehulp-pipeline/migrations/koffiemachines_extra_specs.sql`.*

---

## 2. De vragen

| Type | Vragen |
|---|---|
| Volautomaat | Melk (één knop / stoompijpje / alleen zwart) → Budget → Extra's (2 kopjes tegelijk, app, 8+ koffiesoorten, geen) |
| Halfautomaat | Bonenmaler (ja / nee / maakt niet uit) → Budget |
| Capsules/pads | Systeem (Nespresso / Vertuo / Dolce Gusto / Senseo / L'OR / maakt niet uit) → Melk (ja / nee) → Budget |
| Filter | Kopjes per kan (paar mensen / 12+) → Budget → Extra's (thermoskan, timer, bonenmaler, geen) |

**Vervallen:** watertank (zegt kopers weinig), touch, automatisch ontkalken (3 bekend), thee (heet
water heeft vrijwel elke volautomaat). Touch, display e.d. staan nog als filter.

**Budgetbedragen** (`budgetCaps`): volautomaat €450/€700, halfautomaat €200/€400, capsules
€90/€130, filter €50/€75, plus Geen voorkeur.

**Grijze opties.** Grijs als geen machine binnen type, systeem en budget het zeker heeft, samen met
de eerdere keuzes, met de reden erbij ("Samen met je andere keuzes pas vanaf €999.").

---

## 3. De score per machine

| Situatie | Punten |
|---|---|
| Wens (melk, bonenmaler, extra) die hij niet heeft / onbekend | −150 / −40 |
| Filter: minder kopjes per kan dan gevraagd | −3 per kopje (onbekend −6) |
| Prijs | de duurste in de lijst verliest tot 5 punten |

"Zelf opschuimen" is ook goed met een machine die het op één knop doet.

*Code: `koffiemachine/js/matching.js` (scoreKoffiemachines).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30. Beste match: van de machines tot 4
punten onder de top de goedkoopste.

---

## 5. "Meer budget?", metingen

Zelfde als bij de andere keuzehulpen. Metingen: `quiz_stap`, `resultaat_getoond` (budget, type,
systeem, melk, bonenmaler, extra's, aantal, merk van de Beste match), `budget_kaart`,
`filter_gebruikt`, `sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 165 routes × budgetten (25-10-2026): 0 keer leeg, altijd minstens 5 (als die er
zijn), 0 keer boven budget, nooit een machine van een ander type; in alle combinaties waarin een
machine aan alle wensen voldeed, was de Beste match zo'n machine.

Philips is vaak Beste match (36%, bij 17% van het aanbod): de Philips 2200 (EP2220, €269) is de
goedkoopste volautomaat met cappuccino op één knop. De'Longhi (24% van het aanbod, 4% Beste match),
Gaggia, Miele, Saeco en KitchenAid zijn binnen hun type duurder.
