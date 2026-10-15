from PIL import Image, ImageEnhance
import glob, os, re, sys
# renders (F_day_3.png etc.) staan in de map die als argument wordt meegegeven, standaard tv/r/
S = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(S, "..", "..", "..", "tv", "vragen", "img")
IN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(S, "r")
def grade(im, gain, gamma, wb, sat):
    lut = lambda c: [min(255, int(255 * ((i / 255 * gain * c) ** gamma))) for i in range(256)]
    r, g, b = im.split()
    im = Image.merge("RGB", (r.point(lut(wb[0])), g.point(lut(wb[1])), b.point(lut(wb[2]))))
    return ImageEnhance.Color(im).enhance(sat)
for f in glob.glob(os.path.join(IN, "F_*.png")):
    m = re.match(r"F_(day|night)_([\d.]+)\.png", os.path.basename(f))
    if not m: continue
    im = Image.open(f).convert("RGB")
    im = grade(im, 1.1, 0.9, (0.985, 1.0, 1.03), 1.0) if m[1] == "day" else grade(im, 1.06, 0.96, (1.0, 1.0, 1.0), 1.0)
    out = f"{R}/kamer-{m[1]}-{m[2]}.webp"
    im.save(out, quality=88, method=6)
    print(os.path.basename(out), os.path.getsize(out) // 1024, "KB")
