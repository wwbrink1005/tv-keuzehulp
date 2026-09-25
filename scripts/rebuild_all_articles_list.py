"""
Bouwt op elke gidspagina ({categorie}/index.html) een statieke lijst met ALLE
blogartikelen van die categorie, direct onder de bestaande 3 kaarten.

Reden: de gidspagina toont altijd de 3 originele launch-artikelen en het
cross-linkblok in blogartikelen toont altijd de 3 meest recente. In categorieen
met meer dan 6 artikelen vallen de artikelen daartussenin buiten elke statieke
interne link (verweesd). Deze lijst dicht dat gat permanent.

Alleen categorieen met meer dan 3 artikelen krijgen de lijst; bij precies 3 zou
hij de kaarten er direct boven letterlijk dupliceren.

Idempotent: een bestaand .all-articles-blok wordt vervangen, niet gestapeld.
"""
import os, re, glob
from collections import defaultdict

# werkt altijd vanaf de repo-root, ongeacht vanwaar je het script start
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CAT_LABEL = {
    "tv": "tv's", "laptop": "laptops", "monitor": "monitoren", "desktop": "desktops",
    "printer": "printers", "wasmachine": "wasmachines", "koelkast": "koelkasten",
    "soundbar": "soundbars", "vriezer": "vriezers", "wasdroger": "wasdrogers",
    "vaatwasser": "vaatwassers", "robotstofzuiger": "robotstofzuigers",
    "airfryer": "airfryers", "beamer": "beamers", "koffiemachine": "koffiemachines",
    "stofzuiger": "stofzuigers",
}

CSS_BLOCK = """
      .all-articles { margin-top: 40px; }
      .all-articles-title {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        color: var(--color-text-secondary);
        margin: 0 0 16px;
      }
      .all-articles-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px 32px;
      }
      .all-articles-list a {
        display: inline-flex;
        align-items: baseline;
        gap: 9px;
        font-size: 14.5px;
        line-height: 1.45;
        color: var(--color-text);
        text-decoration: none;
        transition: color 0.2s ease;
      }
      .all-articles-list a::before {
        content: "\\2192";
        color: var(--color-primary);
        font-weight: 700;
        flex-shrink: 0;
      }
      .all-articles-list a:hover { color: var(--color-primary); }
      @media (max-width: 700px) {
        .all-articles-list { grid-template-columns: 1fr; }
      }
"""

# ── artikelen per categorie verzamelen ────────────────────────────────────────
articles = defaultdict(list)
for f in sorted(glob.glob("*/blog/*/index.html")):
    f = f.replace("\\", "/")
    if "keuzehulpen" in f:
        continue
    cat, _, slug, _ = f.split("/")
    html = open(f, encoding="utf-8").read()
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    if not h1:
        print(f"  !! geen <h1> in {f}, overgeslagen")
        continue
    title = re.sub(r"\s+", " ", h1.group(1)).strip()
    m = re.search(r'"@type":\s*"Article".*?"datePublished":\s*"([\d-]+)"', html, re.S)
    date = m.group(1) if m else "1970-01-01"
    articles[cat].append({"slug": slug, "title": title, "date": date})

changed = 0
skipped = 0
for cat, items in sorted(articles.items()):
    gids = f"{cat}/index.html"
    if not os.path.exists(gids):
        print(f"  !! geen gidspagina voor {cat}, overgeslagen")
        continue

    original = open(gids, encoding="utf-8").read()
    html = original

    # bestaand blok altijd eerst verwijderen, inclusief omliggende lege regels
    # (idempotent: verwijderen -> opnieuw opbouwen levert exact dezelfde output)
    html = re.sub(r'\n *<div class="all-articles">.*?\n *</div>\n+(?= *</div>)', "\n", html, flags=re.S)

    # de 3 artikelen die al als kaart in .blog-grid staan overslaan: die hebben op
    # deze pagina al een link, en een tweede link naar dezelfde URL telt bij Google
    # toch niet extra mee — herhalen oogt alleen maar dubbel.
    grid = re.search(r'<div class="blog-grid">.*?\n          </div>', html, re.S)
    carded = set(re.findall(rf'href="{cat}/blog/([^/"]+)/"', grid.group(0))) if grid else set()

    remaining = [a for a in items if a["slug"] not in carded]

    if not remaining:
        if html != original:
            open(gids, "w", encoding="utf-8").write(html)
            print(f"  {cat}: lijst verwijderd (alle {len(items)} artikelen staan al als kaart)")
            changed += 1
        else:
            skipped += 1
        continue

    ordered = sorted(remaining, key=lambda a: a["date"], reverse=True)
    lis = "\n".join(
        f'                <li><a href="{cat}/blog/{a["slug"]}/">{a["title"]}</a></li>'
        for a in ordered
    )
    block = (
        f'\n\n            <div class="all-articles">\n'
        f'              <p class="all-articles-title">Meer artikelen over {CAT_LABEL.get(cat, cat)}</p>\n'
        f'              <ul class="all-articles-list">\n{lis}\n'
        f'              </ul>\n'
        f'            </div>'
    )

    # invoegen direct na het sluiten van .blog-grid; de witruimte tussen blok en
    # het sluitende .wrap-div wordt vast op "\n" gezet zodat herhaald draaien
    # byte-identiek dezelfde output geeft
    pattern = re.compile(r'(<div class="blog-grid">.*?\n          </div>)\s*\n( *</div>)', re.S)
    if not pattern.search(html):
        print(f"  !! blog-grid-patroon niet gevonden in {gids}, overgeslagen")
        continue
    html = pattern.sub(lambda m: m.group(1) + block + "\n" + m.group(2), html, count=1)

    # CSS toevoegen als die er nog niet staat
    if ".all-articles {" not in html:
        anchor = "      .blog-grid {"
        if anchor not in html:
            print(f"  !! CSS-anker niet gevonden in {gids}")
        else:
            html = html.replace(anchor, CSS_BLOCK.strip("\n") + "\n\n" + anchor, 1)

    open(gids, "w", encoding="utf-8").write(html)
    print(f"  {cat}: lijst met {len(ordered)} artikelen geplaatst")
    changed += 1

print(f"\nGewijzigd: {changed}, ongewijzigd: {skipped}")
