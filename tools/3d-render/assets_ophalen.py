"""Haalt alle Poly Haven-assets (CC0) op die de scènes gebruiken naar tools/3d-render/assets/.
Die map staat in .gitignore (groot, en altijd opnieuw op te halen).
Aanroep vanuit de repo-root:  python tools/3d-render/assets_ophalen.py
"""
import json, os, urllib.request, concurrent.futures as cf
from pathlib import Path
ROOT = Path(__file__).parent / "assets"
TEX = ["herringbone_parquet", "white_plaster_02", "wool_boucle", "white_oak_veneer", "hessian_230", "rough_linen",
       "poly_wool_herringbone", "knitted_fleece", "laminate_floor_02", "smooth_concrete_floor", "concrete_tiles_02",
       "interior_tiles", "terrazzo_tiles", "curly_teddy_natural", "faux_fur_geometric", "cotton_jersey"]
MODELS = ["modern_arm_chair_01", "potted_plant_01", "potted_plant_02", "potted_plant_04", "ceramic_vase_01", "ceramic_vase_03",
          "decorative_book_set_01", "standing_picture_frame_02", "wooden_bowl_01", "wicker_basket_01", "wicker_basket_02",
          "folding_wooden_stool", "sofa_03", "coffee_table_round_01", "side_table_01", "throw_pillows_01", "modern_coffee_table_01"]
HDRI = ["symmetrical_garden", "qwantani_dusk_2", "kloofendal_48d_partly_cloudy"]
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "producthulp-render/1.0"}), timeout=120).read()
def fetch(u, dst):
    dst = Path(dst)
    if dst.exists() and dst.stat().st_size > 0: return
    dst.parent.mkdir(parents=True, exist_ok=True); dst.write_bytes(get(u))
jobs = []
for m in MODELS:
    f = json.loads(get(f"https://api.polyhaven.com/files/{m}"))["blend"]["2k"]["blend"]
    jobs.append((f["url"], ROOT / "models" / m / f"{m}.blend"))
    for rel, inc in f.get("include", {}).items():
        jobs.append((inc["url"], ROOT / "models" / m / rel))
for t in TEX:
    f = json.loads(get(f"https://api.polyhaven.com/files/{t}"))
    for key in ("Diffuse", "nor_gl", "Rough", "Displacement", "AO"):
        if key in f and "2k" in f[key]:
            e = f[key]["2k"]; fmt = "jpg" if "jpg" in e else list(e)[0]
            jobs.append((e[fmt]["url"], ROOT / "tex" / t / f"{t}_{key}.{fmt}"))
for h in HDRI:
    jobs.append((json.loads(get(f"https://api.polyhaven.com/files/{h}"))["hdri"]["2k"]["hdr"]["url"], ROOT / "hdri" / f"{h}_2k.hdr"))
with cf.ThreadPoolExecutor(12) as ex:
    list(ex.map(lambda j: fetch(*j), jobs))
print(len(jobs), "bestanden in", ROOT)
