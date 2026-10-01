# Zet de wasmachine-renders om naar WebP; lagen behouden hun alfakanaal (schaduw).
from PIL import Image, ImageEnhance
import glob, os, sys
R = sys.argv[1]
S = os.path.dirname(os.path.abspath(__file__))
PREFIX = sys.argv[2]
def grade(im, gain=1.1, gamma=0.9, wb=(0.985, 1.0, 1.03)):
    lut = lambda c: [min(255, int(255 * ((i / 255 * gain * c) ** gamma))) for i in range(256)]
    r, g, b = im.split()
    return Image.merge("RGB", (r.point(lut(wb[0])), g.point(lut(wb[1])), b.point(lut(wb[2]))))
for f in [f for f in glob.glob(S + "/r/*.png") if os.path.basename(f).startswith(PREFIX)]:
    n = os.path.basename(f)[len(PREFIX):-4]
    im = Image.open(f).convert("RGBA")
    rgb = grade(im.convert("RGB"))
    if im.getextrema()[3][0] < 255:
        a = im.getchannel("A")
        # (bijna) transparante pixels leeg maken: de schaduwvanger geeft een waas van 1-3% over
        # het hele beeld die onzichtbaar is maar de bestanden 2x zo groot maakt
        mask = a.point(lambda v: 255 if v > 6 else 0)
        rgb = Image.composite(rgb, Image.new("RGB", rgb.size, (0, 0, 0)), mask)
        rgb.putalpha(a.point(lambda v: 0 if v <= 6 else (v if v >= 24 else round((v - 6) * 24 / 18))))
        rgb.save(f"{R}/{n}.webp", quality=90, method=6)
    else:
        rgb.save(f"{R}/{n}.webp", quality=88, method=6)
