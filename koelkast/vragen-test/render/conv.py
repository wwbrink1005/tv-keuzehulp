from PIL import Image, ImageEnhance
import glob, os
R = "C:/Users/Wwbri/OneDrive/Bureaublad/tv-keuzehulp/koelkast/vragen-test/img"
S = os.path.dirname(os.path.abspath(__file__))
def grade(im, gain, gamma, wb, sat):
    lut = lambda c: [min(255, int(255 * ((i / 255 * gain * c) ** gamma))) for i in range(256)]
    r, g, b = im.split()
    im = Image.merge("RGB", (r.point(lut(wb[0])), g.point(lut(wb[1])), b.point(lut(wb[2]))))
    return ImageEnhance.Color(im).enhance(sat)
for f in [f for f in glob.glob(S + "/r/*.png") if os.path.basename(f).startswith("K_")]:
    n = os.path.basename(f)[2:-4]
    grade(Image.open(f).convert("RGB"), 1.1, 0.9, (0.985, 1.0, 1.03), 1.0).save(f"{R}/{n}.webp", quality=88, method=6)
