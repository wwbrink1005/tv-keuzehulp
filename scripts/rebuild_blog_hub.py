"""
Vult de handmatige BLOG_ARTICLES-lijst in blog/index.html aan met artikelen die
wel op schijf staan maar er nog niet in zitten.

Reden: die lijst is de enige bron voor de blog-hub (zoeken, filteren, paginering)
en werd met de hand bijgehouden. Bij het toevoegen van nieuwe artikelen werd hij
vergeten, waardoor artikelen wel bestonden maar nergens in het blogmenu te vinden
waren. Draai dit script na elk nieuw artikel, naast rebuild_related_blocks.py en
rebuild_all_articles_list.py.

Bestaande entries worden NOOIT aangepast: de excerpts daarin zijn met de hand
geschreven en vaak beter dan de meta-description. Nieuwe entries worden vooraan de
groep van hun eigen categorie ingevoegd, zodat ze bovenaan staan zodra je op die
categorie filtert.
"""
import os, re, glob

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HUB = "blog/index.html"
LABEL = {"tv": "Tv"}  # afwijkend; de rest is gewoon de mapnaam met hoofdletter


def label_for(cat):
    return LABEL.get(cat, cat.capitalize())


def js(s):
    """Maakt een string veilig voor een JS-stringliteral met dubbele quotes."""
    return s.replace("\\", "\\\\").replace('"', '\\"')


def artikel_info(path):
    html = open(path, encoding="utf-8").read()
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    desc = re.search(r'<meta name="description" content="(.*?)"', html, re.S)
    if not h1:
        return None
    title = re.sub(r"<[^>]+>", "", h1.group(1))
    title = re.sub(r"\s+", " ", title).strip()
    excerpt = re.sub(r"\s+", " ", desc.group(1)).strip() if desc else ""
    return title, excerpt


html = open(HUB, encoding="utf-8").read()
m = re.search(r"(const BLOG_ARTICLES = \[)(.*?)(\n      \];)", html, re.S)
if not m:
    raise SystemExit("BLOG_ARTICLES-blok niet gevonden in " + HUB)
kop, body, staart = m.groups()

# bestaande entries opdelen in losse blokken, met hun categorie
entries = re.findall(r"\n        \{.*?\n        \},", body, re.S)
if len(entries) * 1.0 == 0:
    raise SystemExit("geen entries gevonden; is het formaat veranderd?")

bestaand = set()
for e in entries:
    u = re.search(r'url:\s*"([^"]+)"', e)
    if u:
        bestaand.add(u.group(1).rstrip("/") + "/")

# wat staat er op schijf?
op_schijf = []
for f in sorted(glob.glob("*/blog/*/index.html")):
    f = f.replace("\\", "/")
    if f.startswith(("keuzehulpen/", "overige-paginas/")):
        continue
    cat, _, slug, _ = f.split("/")
    op_schijf.append((cat, slug, f))

ontbrekend = [(c, s, f) for c, s, f in op_schijf if f"{c}/blog/{s}/" not in bestaand]
if not ontbrekend:
    print(f"Blog-hub is compleet: {len(bestaand)} artikelen, niets toe te voegen.")
    raise SystemExit(0)

for cat, slug, f in ontbrekend:
    info = artikel_info(f)
    if not info:
        print(f"  !! geen <h1> in {f}, overgeslagen")
        continue
    title, excerpt = info
    url = f"{cat}/blog/{slug}/"
    nieuw = (
        "\n        {\n"
        f'          title: "{js(title)}",\n'
        f'          excerpt: "{js(excerpt)}",\n'
        f'          url: "{url}",\n'
        f'          image: "{url}images/{slug}.png",\n'
        f'          category: "{cat}",\n'
        f'          categoryLabel: "{label_for(cat)}",\n'
        "        },"
    )
    # vooraan de groep van dezelfde categorie invoegen
    idx = next((i for i, e in enumerate(entries)
                if re.search(rf'category:\s*"{re.escape(cat)}"', e)), len(entries))
    entries.insert(idx, nieuw)
    print(f"  toegevoegd: {url}")

nieuw_body = "".join(entries)
html = html[:m.start()] + kop + nieuw_body + staart + html[m.end():]
open(HUB, "w", encoding="utf-8").write(html)
print(f"\nBlog-hub bijgewerkt: {len(entries)} artikelen in de lijst.")
