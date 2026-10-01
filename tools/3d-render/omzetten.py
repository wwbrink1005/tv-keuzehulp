"""Zet de 3D-testversie van een vragenpagina om naar de echte vragenpagina.

Gebruikt (eenmalig, oktober 2026) om {cat}/vragen-test/ naar {cat}/vragen/ te brengen:
- SEO uit de oude pagina blijft: <title>, description, canonical, broodkruimel-JSON-LD, H1,
  de "Hoe werkt het?"-tekst en alle vragen met hun uitleg (nu als gewone tekst onder de quiz).
- Meting blijft: shared/consent.js (Umami) en shared/analytics.js (quiz_gestart op /vragen/).
- De 3D-quiz komt uit de testpagina: stijl, podium, kaart en het script (nu vragen/vragen.js).

Aanroep vanuit de repo-root:  python tools/3d-render/omzetten.py wasmachine [koelkast ...]
"""
import html, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# de originele pagina's (oude vragenpagina + 3D-test) staan in deze commit
BRON = "a9e64e8"


def git_lees(path):
    return subprocess.run(["git", "show", f"{BRON}:{path}"], cwd=ROOT, capture_output=True, check=True).stdout.decode("utf-8")


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def oud_uitlezen(cat):
    s = git_lees(f"{cat}/vragen/index.html")
    one = lambda pat: re.search(pat, s, re.S).group(1).strip()
    head = {
        "title": one(r"<title>(.*?)</title>"),
        "description": one(r'<meta name="description" content="(.*?)"'),
        "canonical": one(r'<link rel="canonical" href="(.*?)"'),
        "ldjson": one(r'(<script type="application/ld\+json">.*?</script>)'),
        "h1": strip_tags(one(r"<h1[^>]*>(.*?)</h1>")),
        # meervoud uit de broodkruimel (positie 2), bv. "Wasmachines"
        "meervoud": re.search(r'"position": 2, "name": "([^"]+)"', s).group(1),
    }
    how = s[s.index('id="how-content"'):]
    head["how_p"] = strip_tags(re.search(r"<p>(.*?)</p>", how, re.S).group(1))
    head["steps"] = [(strip_tags(a), strip_tags(b)) for a, b in re.findall(
        r'quiz-how-step-label">(.*?)</div>\s*<div class="quiz-how-step-desc">(.*?)</div>', how, re.S)][:3]
    # elke uitleg hoort bij de dichtstbijzijnde vraag erboven (een tussenstap zonder eigen
    # vraagtitel, zoals de breedte-stap bij soundbar, komt zo bij de vorige vraag)
    vragen = []
    for m in re.finditer(r'<h2>(.*?)</h2>|<p class="question-popover-text">(.*?)</p>', s, re.S):
        if m.group(1) is not None:
            vragen.append([strip_tags(m.group(1)), ""])
        elif vragen:
            vragen[-1][1] = (vragen[-1][1] + " " + strip_tags(m.group(2))).strip()
    head["vragen"] = [tuple(v) for v in vragen]
    return head


def test_uitlezen(cat):
    s = git_lees(f"{cat}/vragen-test/index.html")
    style = re.search(r"( <style>.*?</style>)", s, re.S)
    preload = re.search(r'(<link rel="preload" as="image" href=".*?">)', s).group(1)
    stage = re.search(r'(  <div class="shell">.*?</section>\n  </div>)', s, re.S).group(1)
    return {"style": style.group(1) if style else "", "preload": preload, "stage": stage}


def bouw(cat):
    o, t = oud_uitlezen(cat), test_uitlezen(cat)
    e = lambda x: html.escape(x, quote=False)
    stappen = "\n".join(f'      <li><span class="nr">{i + 1}</span><div><strong>{e(a)}</strong><span>{e(b)}</span></div></li>'
                        for i, (a, b) in enumerate(o["steps"]))
    vragen = "\n".join(f'      <div class="vraag"><h3>{e(q)}</h3><p>{e(a)}</p></div>' for q, a in o["vragen"])
    pagina = f'''<!DOCTYPE html>
<html lang="nl">
<head>
 <meta charset="UTF-8">
 <base href="../../">
 <link rel="icon" type="image/svg+xml" href="logo's/logo_favicon.svg">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>{o["h1"].replace(" Keuzehulp", "")} keuzehulp – vind in een paar vragen de {o["h1"].replace(" Keuzehulp", "").lower()} die bij je past</title>
 <meta name="description" content="{o["description"]}">
 <link rel="canonical" href="{o["canonical"]}" />
 <link rel="preconnect" href="https://fonts.googleapis.com">
 <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
 <link rel="stylesheet" href="shared/menu.css">
 <link rel="stylesheet" href="shared/footer.css">
 <link rel="stylesheet" href="shared/quiz3d.css">
 <script src="https://unpkg.com/lucide@latest"></script>
 <script src="shared/menu.js" defer></script>
 <script src="shared/footer.js" defer></script>
 <script src="shared/consent.js" defer></script>
 <script src="shared/analytics.js" defer></script>
 {o["ldjson"]}
{t["style"]}
 {t["preload"].replace("/vragen-test/", "/vragen/")}
</head>
<body>

<header class="q3d-head">
  <h1>{e(o["h1"])}</h1>
  <p class="q3d-intro">Gratis en onafhankelijk: beantwoord een paar vragen en wij vergelijken alle {e(o["meervoud"].lower())} op prijs, specificaties en jouw wensen.</p>
</header>

<main class="wrap">
{t["stage"]}

<details class="uitleg">
  <summary>Hoe werkt het?</summary>
  <h2>Zo werkt de {e(o["h1"])}</h2>
  <p>{e(o["how_p"])}</p>
  <ol class="stappen">
{stappen}
  </ol>
  <h2>De vragen in deze keuzehulp</h2>
  <div class="vragen">
{vragen}
  </div>
</details>
</main>

<script type="module" src="{cat}/vragen/vragen.js"></script>
</body>
</html>
'''
    (ROOT / cat / "vragen" / "index.html").write_text(pagina, encoding="utf-8")
    print(cat, "vragen:", len(o["vragen"]), "stappen:", len(o["steps"]))


if __name__ == "__main__":
    for c in sys.argv[1:]:
        bouw(c)
