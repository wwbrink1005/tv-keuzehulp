import json, os, sys, urllib.request, concurrent.futures as cf
ROOT = sys.argv[1]
def get(u): 
    req = urllib.request.Request(u, headers={"User-Agent": "producthulp-render/1.0"})
    return urllib.request.urlopen(req, timeout=120).read()
def fetch(u, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "wb").write(get(u))
jobs = []
models = ["modern_arm_chair_01","potted_plant_02","potted_plant_04","ceramic_vase_01","ceramic_vase_03","decorative_book_set_01","standing_picture_frame_02","wooden_bowl_01"]
for m in models:
    f = json.loads(get(f"https://api.polyhaven.com/files/{m}"))
    b = f["blend"]["2k"]["blend"]
    jobs.append((b["url"], f"{ROOT}/models/{m}/{m}.blend"))
    for rel, inc in b.get("include", {}).items():
        jobs.append((inc["url"], f"{ROOT}/models/{m}/{rel}"))
texs = ["herringbone_parquet","white_plaster_02","wool_boucle","white_oak_veneer","hessian_230","rough_linen","poly_wool_herringbone"]
for t in texs:
    f = json.loads(get(f"https://api.polyhaven.com/files/{t}"))
    for key in ["Diffuse","nor_gl","Rough","Displacement","AO"]:
        if key in f and "2k" in f[key]:
            e = f[key]["2k"]; fmt = "jpg" if "jpg" in e else list(e)[0]
            jobs.append((e[fmt]["url"], f"{ROOT}/tex/{t}/{t}_{key}.{fmt}"))
for h in ["symmetrical_garden","qwantani_dusk_2","kloofendal_48d_partly_cloudy"]:
    f = json.loads(get(f"https://api.polyhaven.com/files/{h}"))
    jobs.append((f["hdri"]["2k"]["hdr"]["url"], f"{ROOT}/hdri/{h}_2k.hdr"))
with cf.ThreadPoolExecutor(12) as ex:
    list(ex.map(lambda j: fetch(*j), jobs))
print(len(jobs), "files ok")
