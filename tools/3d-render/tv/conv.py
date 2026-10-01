from PIL import Image, ImageEnhance
import glob, os, re
R = "C:/Users/Wwbri/OneDrive/Bureaublad/tv-keuzehulp/tv/vragen-test/img"
S = os.path.dirname(os.path.abspath(__file__))
def grade(im, gain, gamma, wb, sat):
    lut = lambda c: [min(255, int(255 * ((i / 255 * gain * c) ** gamma))) for i in range(256)]
    r, g, b = im.split()
    im = Image.merge("RGB", (r.point(lut(wb[0])), g.point(lut(wb[1])), b.point(lut(wb[2]))))
    return ImageEnhance.Color(im).enhance(sat)
for f in glob.glob(S + "/r/F_*.png"):
    m = re.match(r"F_(day|night)_([\d.]+)\.png", os.path.basename(f))
    if not m: continue
    im = Image.open(f).convert("RGB")
    im = grade(im, 1.1, 0.9, (0.985, 1.0, 1.03), 1.0) if m[1] == "day" else grade(im, 1.06, 0.96, (1.0, 1.0, 1.0), 1.0)
    out = f"{R}/kamer-{m[1]}-{m[2]}.webp"
    im.save(out, quality=88, method=6)
    print(os.path.basename(out), os.path.getsize(out) // 1024, "KB")
