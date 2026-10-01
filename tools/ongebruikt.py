"""Zoekt bestanden in de site die nergens meer gebruikt worden.

Start bij elke echte pagina (alle index.html/HTML-pagina's behalve bekende test-/ontwikkelpagina's)
en volgt alle verwijzingen: href/src in HTML, <base href>, url() in CSS, import/fetch en
padstrings in JavaScript. Een padstring met een ${...}-sjabloon (bijv. "wasmachine/vragen/img/${n}.webp")
telt de hele map als gebruikt. Wat overblijft, staat op de kandidatenlijst.

Bewust buiten de controle (geen sitebestanden): .git, docs/, strategie/, scripts/, tools/, CLAUDE.md,
README, .gitignore e.d.

Aanroep vanuit de repo-root:  python tools/ongebruikt.py
"""
import os, re, sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
NIET_CONTROLEREN = {".git", "docs", "strategie", "scripts", "tools", ".claude", "node_modules", "__pycache__"}
ALTIJD_HOUDEN = {"CNAME", "robots.txt", "sitemap.xml", ".nojekyll", "404.html", "CLAUDE.md", "README.md", ".gitignore",
                 "producthulp-keuzehulp-yv-375addcbe023.json", "ads.txt"}
TEXT_EXT = {".html", ".js", ".css", ".json", ".xml", ".txt", ".webmanifest", ".svg"}

alle = []
for dp, dns, fns in os.walk(ROOT):
    rel = Path(dp).relative_to(ROOT)
    if rel.parts and rel.parts[0] in NIET_CONTROLEREN:
        dns[:] = []
        continue
    for f in fns:
        alle.append((rel / f).as_posix())
alle_set = set(alle)


def resolve(base_dir, ref):
    ref = unquote(ref.split("#")[0].split("?")[0]).strip()
    if not ref or ref.startswith(("data:", "mailto:", "tel:", "javascript:", "//")):
        return None
    u = urlparse(ref)
    if u.scheme in ("http", "https"):
        if u.netloc.endswith("producthulp.nl"):
            ref = u.path
        else:
            return None
    if ref.startswith("/"):
        p = Path(ref.lstrip("/"))
    else:
        p = Path(base_dir) / ref
    parts = []
    for part in p.as_posix().split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts: parts.pop()
        else:
            parts.append(part)
    return "/".join(parts)


def expand(path):
    """map of pagina → index.html; exacte bestanden zoals ze zijn"""
    if path in alle_set:
        return [path]
    if (path + "/index.html").strip("/") in alle_set:
        return [(path + "/index.html").strip("/")]
    if path == "":
        return ["index.html"] if "index.html" in alle_set else []
    return []


gebruikt, mappen = set(), set()
todo = []


def markeer(path):
    for p in expand(path):
        if p not in gebruikt:
            gebruikt.add(p); todo.append(p)


# startpunten: elke HTML-pagina die geen test-/ontwikkelpagina is, plus vaste bestanden
for f in alle:
    name = Path(f).name
    if name in ALTIJD_HOUDEN and "/" not in f:
        markeer(f)
    if f.endswith(".html") and not re.search(r"(^|/)(vragen-test|.*-test\.html$|test/)", f):
        markeer(f)

while todo:
    f = todo.pop()
    if Path(f).suffix.lower() not in TEXT_EXT:
        continue
    try:
        s = (ROOT / f).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        continue
    d = Path(f).parent.as_posix()
    if d == ".": d = ""
    base = d
    if f.endswith(".html"):
        m = re.search(r'<base href="([^"]*)"', s)
        if m:
            base = resolve(d, m.group(1)) or ""
    refs = []
    if f.endswith((".html", ".svg", ".xml")):
        refs += re.findall(r'(?:href|src|content|poster|data-src)="([^"]+)"', s)
        refs += re.findall(r"<loc>([^<]+)</loc>", s)
        refs += re.findall(r"url\(['\"]?([^'\")]+)", s)
        # inline scripts: padstrings
        refs += re.findall(r"""["'`]([A-Za-z0-9_'./-]+\.(?:webp|png|jpe?g|svg|gif|js|css|json|mp4|webm|pdf|ico))["'`]""", s)
    if f.endswith(".css"):
        for r in re.findall(r"url\(['\"]?([^'\")]+)", s):
            p = resolve(d, r)
            if p: markeer(p)
        continue
    if f.endswith(".js"):
        # ES-imports en fetch zijn relatief aan het bestand
        for r in re.findall(r"""(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]""", s):
            p = resolve(d, r)
            if p: markeer(p)
        # overige padstrings zijn relatief aan de pagina (<base href> = repo-root bij alle keuzehulppagina's)
        for r in re.findall(r"""["'`]([A-Za-z0-9_'./${}-]+/[A-Za-z0-9_'./${}-]*)["'`]""", s):
            if "${" in r:
                pref = r.split("${")[0]
                if "/" in pref:
                    mappen.add(pref.rsplit("/", 1)[0].strip("/"))
                continue
            if re.search(r"\.(webp|png|jpe?g|svg|gif|js|css|json|mp4|webm|pdf|ico)$", r):
                for b in ("", d):
                    p = resolve(b, r)
                    if p: markeer(p)
            else:
                p = resolve("", r)
                if p: markeer(p)
        continue
    for r in refs:
        for b in (base, d):
            p = resolve(b, r)
            if p is not None:
                markeer(p)

for m in mappen:
    for f in alle:
        if f.startswith(m + "/"):
            markeer(f)
while todo:   # wat via mappen binnenkwam kan zelf weer verwijzen (bijv. html)
    f = todo.pop()

ongebruikt = sorted(f for f in alle if f not in gebruikt)
groepen = {}
for f in ongebruikt:
    top = f.split("/")[0] if "/" in f else "(root)"
    groepen.setdefault(top, []).append(f)
totaal = 0
for g, fs in sorted(groepen.items()):
    grootte = sum((ROOT / f).stat().st_size for f in fs)
    totaal += grootte
    print(f"\n## {g}  ({len(fs)} bestanden, {grootte / 1e6:.1f} MB)")
    for f in fs:
        print("  ", f)
print(f"\nTotaal: {len(ongebruikt)} bestanden, {totaal / 1e6:.1f} MB")
