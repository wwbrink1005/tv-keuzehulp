# Zet de renders (render/r/V_*.png) om naar WebP en verdeelt ze over de twee keuzehulpen.
import sys, os
sys.argv=[sys.argv[0]]
from PIL import Image
OUT=r"C:/Users/Wwbri/OneDrive/Bureaublad/tv-keuzehulp/wasmachine/vragen-test/img"
def grade(im, gain=1.1, gamma=0.9, wb=(0.985, 1.0, 1.03)):
    lut = lambda c: [min(255, int(255 * ((i / 255 * gain * c) ** gamma))) for i in range(256)]
    r, g, b = im.split()
    return Image.merge("RGB", (r.point(lut(wb[0])), g.point(lut(wb[1])), b.point(lut(wb[2]))))
import glob, shutil
R=r"C:/Users/Wwbri/OneDrive/Bureaublad/tv-keuzehulp"
for f in glob.glob(os.path.dirname(os.path.abspath(__file__)) + "/r/V_*.png"):
    n=os.path.basename(f)[2:-4]; n="woonkamer" if n=="none" else n
    cats=["stofzuiger","robotstofzuiger"] if n=="woonkamer" else (["robotstofzuiger"] if n.startswith(("robot","dock")) else ["stofzuiger"])
    OUT=f"{R}/{cats[0]}/vragen-test/img"
    im=Image.open(f).convert("RGBA"); rgb=grade(im.convert("RGB"))
    if im.getextrema()[3][0] < 255:
        a=im.getchannel("A"); mask=a.point(lambda v: 255 if v>6 else 0)
        rgb=Image.composite(rgb, Image.new("RGB", rgb.size,(0,0,0)), mask); rgb.putalpha(a.point(lambda v: 0 if v <= 6 else (v if v >= 24 else round((v - 6) * 24 / 18))))
        rgb.save(f"{OUT}/{n}.webp", quality=90, method=6)
    else: rgb.save(f"{OUT}/{n}.webp", quality=88, method=6)
    for c in cats[1:]: shutil.copy(f"{OUT}/{n}.webp", f"{R}/{c}/vragen-test/img/{n}.webp")
    print(n, cats, os.path.getsize(f"{OUT}/{n}.webp")//1024, "kB")
