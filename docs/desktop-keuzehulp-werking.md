# Hoe de desktop-keuzehulp werkt

Uitleg in gewone taal: van de eerste vraag tot de lijst met desktops op de resultaatpagina.
Stand: 22 oktober 2026 (nieuwe opzet met budget en score per desktop, zoals de laptop).

---

## In één alinea

De bezoeker beantwoordt 6 vragen. Het type behuizing, het budget en het systeem (Windows of
Mac) bepalen **welke desktops mogen meedoen**. De andere vragen bepalen **hoe goed elke desktop
past**: de processorklasse die bij het gebruik past, een losse videokaart als je gamet,
werkgeheugen en opslag. Bovenaan staat de **Beste match**: de best passende, en als meerdere
even goed passen de goedkoopste daarvan (bij intensief gebruik eerst de krachtigste klasse).

---

## 1. De gegevens

Zo'n 50 desktops bij 2+ winkels, vanaf €724; goedkope instappers zijn er niet.

**Processor.** De pipeline zocht het Icecat-veld "Processor", dat in de desktopcategorie niet
bestaat. Daardoor kende de keuzehulp tot oktober 2026 geen enkele processor (behalve bij Macs, via
de Apple-scraper) en koos hij alleen op de videokaart. Nu: "Processorfamilie", "Processormodel",
"Processorgeneratie" en "Aantal processorkernen" (geverifieerd tegen icecat_cache, 37 van de 39).
Zonder familie leiden we hem af uit het modelnummer (225 = Core Ultra 5, 265 = Core Ultra 7,
8500G = Ryzen 5). De klasse-indeling is die van de laptop (`laptop/js/data.js`,
getProcessorTier).

**Losse videokaart.** Uit "Discreet grafische adapter model" en "Aparte grafische adapter"; een
Mac heeft er nooit een. Maar 5 desktops hebben er een (gaming-pc's vanaf €1.769).

**Type.** Een paar HP's hebben alleen "Desktops" als type; dan zegt de naam het (OmniStudio =
all-in-one, OmniDesk = tower).

**Weggevallen:** de extra's-vraag (RGB, waterkoeling): bij 3 van de 48 bekend. Ze staan nog als
filter op de resultaatpagina.

---

## 2. De vragen

| # | Vraag | Antwoorden | Wat het doet |
|---|---|---|---|
| 1 | Welk type behuizing? | Tower / Mini-pc / All-in-one / Maakt niet uit | **Harde grens** |
| 2 | Wat wil je maximaal uitgeven? | twee bedragen per type + Geen voorkeur | **Harde grens** |
| 3 | Windows of Mac? | Windows / Mac / Maakt niet uit | **Harde grens** zodra het systeem er is; grijs als het binnen type en budget niet bestaat |
| 4 | Waarvoor? | Dagelijks / Werk / Gamen / Creatief / Van alles (max 2) | Processorklasse; gamen = **wens** losse videokaart; creatief = **wens** losse videokaart of krachtige processor |
| 5 | Hoe intensief? | Licht / Gemiddeld / Intensief | Processorklasse en werkgeheugen |
| 6 | Hoeveel opslag? | 512 GB / 1 TB / 2 TB+ | **Wens**; grijs als het binnen je keuzes niet bestaat |

| Type | Budgetopties |
|---|---|
| Tower | tot €1.000, tot €1.500 |
| All-in-one | tot €900, tot €1.300 |
| Mini-pc | tot €1.200, tot €1.500 |
| Maakt niet uit | tot €1.000, tot €1.500 |

*Bedragen in `desktop/js/data.js` (budgetCapsByType).*

---

## 3. De score per desktop

Elke desktop begint met **100 punten**.

| Situatie | Punten |
|---|---|
| Per punt dat de processorklasse achterloopt op de best passende klasse | −3 |
| Processor onbekend (gerekend als middenklasse) | −6 |
| Wens (opslag, krachtig genoeg voor creatief werk) niet waargemaakt / onbekend | −150 / −50 |
| Gamen zonder losse videokaart | −300 |
| Ander systeem dan gekozen | −1000 |
| Werkgeheugen: intensief onder 16 / onder 32 GB; gemiddeld onder 16 GB | −12 / −4; −8 |
| Prijs | de duurste in de lijst verliest tot 8 (licht), 4 (gemiddeld) of 1 (intensief) punt |

*Code: `desktop/js/matching.js` (scoreDesktops).*

---

## 4. Van scores naar de lijst

Alles tot 10 punten onder de top, minimaal 5 en maximaal 30 bij 2+ winkels (minder als er van
het gekozen type en systeem minder zijn, zoals een Windows-mini-pc). Beste match: van de desktops
tot 4 punten onder de top de goedkoopste; bij intensief gebruik eerst de krachtigste klasse.
Filters: o.a. processorklasse (vroeger "GPU Klasse"), losse videokaart, werkgeheugen, opslag.

---

## 5. "Meer budget?", metingen

De kaart verschijnt als desktops boven het budget duidelijk beter passen, en noemt wat je met
meer budget krijgt: een losse videokaart om te gamen, meer opslag of een krachtigere processor.
Metingen: `quiz_stap`, `resultaat_getoond` (budget, behuizing, systeem, aantal, klasse van de
Beste match), `budget_kaart`, `filter_gebruikt`, `sorteren`, `affiliate_klik`.

---

## 6. Controleren

Simulatie van 2.592 antwoordcombinaties (22-10-2026): 0 keer leeg, 0 keer boven budget, 0 keer
het verkeerde systeem; in alle combinaties waarin een desktop aan alle wensen voldeed, was de
Beste match zo'n desktop.
