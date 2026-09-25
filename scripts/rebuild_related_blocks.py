"""
Herbouwt het "Meer over {categorie}"-cross-linkblok onderaan elk blogartikel:
altijd de 3 meest recente zusterartikelen (op datePublished), nooit meer dan 3.
Draai dit na elk nieuw blogartikel. Zie docs/nieuwe-keuzehulp.md.
"""
import os, re, glob
from collections import defaultdict

# werkt altijd vanaf de repo-root, ongeacht vanwaar je het script start
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

files = sorted(f.replace("\\", "/") for f in glob.glob("*/blog/*/index.html") if "keuzehulpen" not in f)

cat_label_map = {
    "tv": "tv's", "laptop": "laptops", "monitor": "monitoren", "desktop": "desktops",
    "printer": "printers", "wasmachine": "wasmachines", "koelkast": "koelkasten",
    "soundbar": "soundbars", "vriezer": "vriezers", "wasdroger": "wasdrogers",
    "vaatwasser": "vaatwassers", "robotstofzuiger": "robotstofzuigers", "stofzuiger": "stofzuigers",
    "airfryer": "airfryers", "beamer": "beamers", "koffiemachine": "koffiemachines",
}

PLACEHOLDER = ("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 "
               "viewBox=%220 0 400 300%22%3E%3Crect width=%22400%22 height=%22300%22 fill=%22%23f5f5f7%22/%3E"
               "%3Cg transform=%22translate(183,133)%22%3E%3Cpath d=%22m17 2-5 5-5-5%22 fill=%22none%22 "
               "stroke=%22%2364748b%22 stroke-width=%221.5%22/%3E%3Crect width=%2220%22 height=%2215%22 x=%222%22 "
               "y=%227%22 rx=%222%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%221.5%22/%3E%3C/g%3E%3C/svg%3E")

info = {}
cat_articles = defaultdict(list)
for f in files:
    html = open(f, encoding="utf-8").read()
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S).group(1).strip()
    m = re.search(r'"@type":\s*"Article".*?"datePublished":\s*"([\d-]+)"', html, re.S)
    date_published = m.group(1) if m else "1970-01-01"
    cat = f.split("/")[0]
    slug = f.split("/")[2]
    entry = {"title": h1, "url": f"{cat}/blog/{slug}/", "image": f"{cat}/blog/{slug}/images/{slug}.png",
              "date": date_published, "file": f}
    info[f] = entry
    cat_articles[cat].append(entry)

changed, skipped = [], []

for f in files:
    html = open(f, encoding="utf-8").read()
    orig = html
    cat = f.split("/")[0]
    cat_label = cat_label_map.get(cat, cat)

    siblings = [a for a in cat_articles[cat] if a["file"] != f]
    siblings.sort(key=lambda a: a["date"], reverse=True)
    top3 = siblings[:3]
    if not top3:
        skipped.append((f, "geen zusterartikelen"))
        continue

    cards_html = "\n".join(
        f'              <a class="article-related-card" href="{s["url"]}">\n'
        f'                <div class="article-related-card-img">\n'
        f'                  <img src="{s["image"]}" alt="" loading="lazy" '
        f'onerror="this.onerror=null;this.src=\'{PLACEHOLDER}\'" />\n'
        f'                </div>\n'
        f'                <h4>{s["title"]}</h4>\n'
        f'              </a>'
        for s in top3
    )

    pattern = re.compile(
        r'<div class="article-related">\s*<p class="article-related-title">.*?</p>\s*'
        r'<div class="article-related-grid">.*?</div>\s*</div>',
        re.S
    )
    replacement = (
        '<div class="article-related">\n'
        f'            <p class="article-related-title">Meer over {cat_label}</p>\n'
        '            <div class="article-related-grid">\n'
        f'{cards_html}\n'
        '            </div>\n'
        '          </div>'
    )
    new_html, n = pattern.subn(replacement, html, count=1)
    if n != 1:
        skipped.append((f, f"related-block patroon niet (1x) gevonden (n={n})"))
        continue

    if new_html != orig:
        open(f, "w", encoding="utf-8").write(new_html)
        changed.append(f)

print(f"Gewijzigd: {len(changed)} / {len(files)}")
if skipped:
    print(f"\nOvergeslagen ({len(skipped)}):")
    for f, r in skipped:
        print(f"  {f}: {r}")
