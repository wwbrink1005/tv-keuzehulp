"""Moderniseert de bijkeuken-scène van de wasmachine- en wasdroger-keuzehulp (oktober 2026).

Patcht wasmachine/scene.py en wasdroger/scene.py in place:
- ruimte: lichte microcementvloer, verticaal gestapelde tegels achter de machines, een
  kastenwand in licht eiken zonder grepen met een open nis, zwevende eiken plank
- machines: naadloze witte behuizing, bedieningspaneel van zwart glas met lichtpuntjes
  rond de knop, grafietkleurige deurring met rookglas, verzonken greep
De posities en maten van de machines (en dus de overlays in vragen.js) blijven gelijk.

Aanroep vanuit tools/3d-render:  python washok_modern.py
"""
from pathlib import Path

DECOR = '''# ── vast decor: modern washok ──
# Lichte microcementvloer, verticaal gestapelde tegels achter de machines, een kastenwand in
# licht eiken zonder grepen met een open nis, een zwevende eiken plank met linnen en een plant.
STACK = {stack}
M_FLOOR_T = pbr("floor_t", "smooth_concrete_floor", 2.4, base=(0.76, 0.73, 0.68), var=0.12, bump=0.03, rough_add=0.18)
for o in list(bpy.data.objects):
    if o.name == "floor":
        o.data.materials.clear(); o.data.materials.append(M_FLOOR_T)

def tile_mat():
    """verticaal gestapelde tegels van 7,5 x 30 cm, glanzend gebroken wit met een lichte voeg"""
    m = bpy.data.materials.new("tiles"); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; b = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord"); sep = N.new("ShaderNodeSeparateXYZ"); comb = N.new("ShaderNodeCombineXYZ")
    L.new(tc.outputs["Object"], sep.inputs[0]); L.new(sep.outputs["X"], comb.inputs["X"]); L.new(sep.outputs["Z"], comb.inputs["Y"])
    br = N.new("ShaderNodeTexBrick"); br.offset = 0.0; br.squash = 1.0
    br.inputs["Scale"].default_value = 1.0; br.inputs["Mortar Size"].default_value = 0.0016
    br.inputs["Brick Width"].default_value = 0.075; br.inputs["Row Height"].default_value = 0.30
    br.inputs["Color1"].default_value = (0.87, 0.86, 0.82, 1); br.inputs["Color2"].default_value = (0.82, 0.81, 0.77, 1)
    br.inputs["Mortar"].default_value = (0.66, 0.65, 0.62, 1); br.inputs["Bias"].default_value = 0.0
    L.new(comb.outputs[0], br.inputs["Vector"]); L.new(br.outputs["Color"], b.inputs["Base Color"])
    # handgemaakte look: iets golvend oppervlak per tegel
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    mx = N.new("ShaderNodeMath"); mx.operation = "ADD"
    mm = N.new("ShaderNodeMath"); mm.operation = "MULTIPLY"; mm.inputs[1].default_value = 0.25
    L.new(nz.outputs["Fac"], mm.inputs[0]); L.new(br.outputs["Fac"], mx.inputs[0]); L.new(mm.outputs[0], mx.inputs[1])
    bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.35; bu.inputs["Distance"].default_value = 0.002
    bu.invert = True
    L.new(mx.outputs[0], bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.16; b.inputs["Coat Weight"].default_value = 0.5
    return m

M_TILE = tile_mat()
box("tilewall", -0.62, 2.4, -0.012, 0, 0.0, 1.22, M_TILE)
box("tilecap", -0.62, 2.4, -0.022, 0, 1.22, 1.232, mat("tilecap", (0.8, 0.79, 0.75), 0.3))

# kastenwand in licht eiken, grepen als smalle sleuf bovenin de fronten, open nis in de rechterkolom
M_OAKC = pbr("oakc", "white_oak_veneer", 0.6, base=(0.74, 0.62, 0.48), var=0.18, bump=0.02, rough_add=0.25)
M_OAKN = pbr("oakn", "white_oak_veneer", 0.6, base=(0.62, 0.5, 0.37), var=0.18, bump=0.02, rough_add=0.25)
M_GAPC = mat("gapc", (0.18, 0.15, 0.12), 0.8)
CX0, CX1, CZ1, CY = -2.2, -0.62, 2.3, -0.6
box("cab_carcass", CX0, CX1, CY + 0.02, 0, 0.08, CZ1, M_GAPC)
box("cab_plinth", CX0, CX1, CY + 0.06, 0, 0, 0.08, M_DARK)
box("cab_side", CX1 - 0.018, CX1, CY, 0, 0, CZ1, M_OAKC, bevel=0.002)
cols = [(CX0 + i * (CX1 - 0.018 - CX0) / 3, CX0 + (i + 1) * (CX1 - 0.018 - CX0) / 3) for i in range(3)]
for i, (a, b) in enumerate(cols):
    spans = [(0.085, 0.95), (1.4, CZ1 - 0.004)] if i == 2 else [(0.085, 1.18), (1.184, CZ1 - 0.004)]
    for (z0, z1) in spans:
        box("cab_front", a + 0.002, b - 0.002, CY, CY + 0.02, z0, z1, M_OAKC, bevel=0.002, segs=2)
        box("cab_grip", a + 0.02, b - 0.02, CY - 0.0005, CY + 0.004, z1 - 0.03, z1 - 0.022, M_GAPC)
a, b = cols[2]
box("niche_back", a, b, -0.03, -0.01, 0.95, 1.4, M_OAKN)
box("niche_shelf", a, b, CY + 0.02, -0.01, 0.95, 0.968, M_OAKN, bevel=0.002)
for i, c in enumerate([(0.78, 0.74, 0.66), (0.62, 0.6, 0.55), (0.86, 0.84, 0.79)]):
    box("niche_towel", a + 0.07 + 0.004 * i, b - 0.07 - 0.004 * i, CY + 0.08, -0.08, 0.968 + i * 0.045, 0.968 + (i + 1) * 0.045 - 0.003,
        pbr(f"nt{{i}}", "knitted_fleece", 0.15, base=c, var=0.15, bump=0.9, sheen=0.6, rough_add=0.3), bevel=0.018, segs=4)

# zwevende eiken plank met linnen, een plant en een fles wasmiddel van amberglas
OX = 0.95 if STACK else 0.0
M_OAKW = pbr("oakw", "white_oak_veneer", 0.8, base=(0.7, 0.58, 0.44), var=0.2, bump=0.03, rough_add=0.2)
box("shelf_w", -0.45 + OX, 0.45 + OX, -0.25, 0, 1.38, 1.42, M_OAKW, bevel=0.004)
towel_cols = [(0.8, 0.76, 0.68), (0.6, 0.58, 0.53), (0.88, 0.86, 0.81)]
for s_, sx in enumerate((-0.31 + OX, -0.07 + OX)):
    for i in range(3):
        c = towel_cols[(i + s_) % 3]
        box("towel", sx - 0.13 + 0.004 * i, sx + 0.13 - 0.004 * i, -0.22, -0.03, 1.42 + i * 0.045, 1.42 + (i + 1) * 0.045 - 0.003,
            pbr(f"tw{{s_}}{{i}}", "knitted_fleece", 0.15, base=c, var=0.15, bump=0.9, sheen=0.6, rough_add=0.3), bevel=0.018, segs=4)
append_model("potted_plant_04", (0.29 + OX, -0.13, 1.42), 0.4, 1.1)
M_AMBER = bpy.data.materials.new("amber"); M_AMBER.use_nodes = True
_ab = M_AMBER.node_tree.nodes["Principled BSDF"]
_ab.inputs["Base Color"].default_value = (0.42, 0.16, 0.03, 1); _ab.inputs["Roughness"].default_value = 0.08
_ab.inputs["Transmission Weight"].default_value = 0.7; _ab.inputs["IOR"].default_value = 1.5
cyl("bottle", 0.04, 1.42, 1.6, 0.13 + OX, -0.12, M_AMBER, 48, bevel=0.012)
cyl("bottle_pump", 0.014, 1.6, 1.64, 0.13 + OX, -0.12, M_DARK, 24)
box("bottle_nozzle", 0.13 + OX - 0.004, 0.13 + OX + 0.004, -0.165, -0.12, 1.634, 1.642, M_DARK)
append_model("potted_plant_01", (2.05, -0.4, 0), 0.6, 0.9)

'''

MAT_OLD = 'M_ENAMEL = mat("enamel", (0.86, 0.86, 0.85), 0.22, coat=0.4)\nM_TOPSLAB = mat("topslab", (0.84, 0.84, 0.83), 0.45, grain=0.08)'
MAT_NEW = '''M_ENAMEL = mat("enamel", (0.88, 0.88, 0.87), 0.3, coat=0.35)
M_TOPSLAB = mat("topslab", (0.88, 0.88, 0.87), 0.32, coat=0.25)'''
GLASS_OLD = '_g.inputs["Base Color"].default_value = (0.78, 0.8, 0.84, 1)'
GLASS_NEW = '_g.inputs["Base Color"].default_value = (0.36, 0.38, 0.41, 1)'
EXTRA_MATS = '''M_FRAME = mat("doorframe", (0.03, 0.031, 0.034), 0.38)
M_SEAM_L = mat("wseaml", (0.56, 0.56, 0.56), 0.6)
M_GRAPH = mat("graph", (0.045, 0.046, 0.05), 0.32, coat=0.4)
M_LED = mat("led", (0.2, 0.2, 0.2), 0.4)
_ln = M_LED.node_tree.nodes["Principled BSDF"]
_ln.inputs["Emission Color"].default_value = (0.8, 0.9, 1.0, 1); _ln.inputs["Emission Strength"].default_value = 1.2'''


def modern_front(s, p):
    """vervang knop, paneel, toetsen en deur van een voorlader-/drogerfront (prefix p)"""
    import re
    # lichte naden op wit i.p.v. zwart
    for nm in ("band_seam", "kick_seam", "hatch_seam", "drawer_grip", "flap_seam", "flap_seam2", "flap_grip", "tank_grip"):
        s = re.sub(r'(box\("' + p + '_' + nm + r'"[^\n]*?)M_SEAM\)', lambda m: m.group(1) + "M_SEAM_L)", s)
    lines = s.split("\n")
    def idx(sub, start=0):
        for i in range(start, len(lines)):
            if sub in lines[i]:
                return i
        raise ValueError(sub)
    # knop: dun chromen randje, grafiet knop, lichtpuntjes rondom (i.p.v. streepjes)
    k0 = idx(f'disc("{p}_knob_rim"'); k1 = idx(f'box("{p}_dpanel"', k0)
    lines[k0:k1] = [
        f'    out.append(disc("{p}_knob_rim", 0.036, yf - 0.014, yf - 0.004, kx, kz, M_CHROME))',
        f'    out.append(disc("{p}_knob", 0.031, yf - 0.024, yf - 0.012, kx, kz, M_GRAPH))',
        f'    out.append(box("{p}_knob_ind", kx - 0.0015, kx + 0.0015, yf - 0.0245, yf - 0.023, kz + 0.014, kz + 0.026, M_CHROME))',
        '    for i in range(12):',
        '        a = math.radians(-120 + i * (240 / 11))',
        '        tx, tz = kx + math.sin(a) * 0.048, kz + math.cos(a) * 0.048',
        f'        out.append(disc("{p}_led", 0.0022, yf - 0.0052, yf - 0.0046, tx, tz, M_LED if i in (3, 4) else M_SEAM_L, 12))',
    ]
    # paneel van zwart glas rond knop en display
    d = idx(f'box("{p}_dpanel"')
    lines[d] = f'    out.append(box("{p}_dpanel", kx - 0.058, x1 - 0.018, yf - 0.0045, yf - 0.0005, bz0 + 0.01, bz1 - 0.01, M_BLACKGLASS, bevel=0.006, segs=3))'
    # display net voor het glas (de pagina tekent er de inhoud op)
    d = idx(f'box("{p}_display"')
    lines[d] = lines[d].replace("yf - 0.004, yf - 0.001,", "yf - 0.005, yf - 0.0042,")
    # aanraaktoetsen: vlakke lichte symbooltjes op het glas
    b0 = idx("    for i in range(3):", d); b1 = b0 + 1
    while lines[b1].startswith("        "):
        b1 += 1
    bx = lines[b0 + 1].strip()
    lines[b0:b1] = ["    for i in range(3):", "        " + bx,
                    f'        out.append(disc("{p}_btn", 0.006, yf - 0.0051, yf - 0.0046, bx + 0.008, kz, M_SEAM_L, 24))']
    s = "\n".join(lines)
    # deur: smal chromen randje, brede grafiet ring, rookglas, verzonken greep
    for old, new in (
        (f'out.append(ring("{p}_door_ring", 0, yf - 0.02, dz, door_r - 0.018, 0.02, M_CHROME, 0.8))',
         f'out.append(ring("{p}_door_ring", 0, yf - 0.016, dz, door_r - 0.01, 0.01, M_CHROME, 0.7))'),
        (f'out.append(ring("{p}_door_frame", 0, yf - 0.03, dz, door_r - 0.05, 0.032, M_FRAME, 0.9))',
         f'out.append(ring("{p}_door_frame", 0, yf - 0.022, dz, door_r - 0.042, 0.034, M_GRAPH, 0.55))'),
        (f'out.append(box("{p}_handle", door_r - 0.02, door_r + 0.004, yf - 0.05, yf - 0.02, dz - 0.05, dz + 0.05, M_SILVER, bevel=0.01, segs=4))',
         f'out.append(box("{p}_handle", door_r - 0.03, door_r - 0.008, yf - 0.042, yf - 0.03, dz - 0.045, dz + 0.045, M_DARK, bevel=0.006, segs=3))')):
        assert s.count(old) == 1, old[:50]
        s = s.replace(old, new)
    return s

for cat, stack in (("wasmachine", False), ("wasdroger", True)):
    p = Path(__file__).parent / cat / "scene.py"
    s = p.read_text(encoding="utf-8")
    i0 = s.index('M_FLOOR_T = pbr("floor_t"')
    i1 = s.index("\ndef mat(")
    s = s[:i0] + s[i1 + 1:]
    a = s.index("# ── vast decor:"); b = s.index("WM = []")
    s = s[:a] + DECOR.format(stack=stack) + s[b:]
    for old, new in ((MAT_OLD, MAT_NEW), (GLASS_OLD, GLASS_NEW), ('M_FRAME = mat("doorframe", (0.03, 0.031, 0.034), 0.38)', EXTRA_MATS)):
        assert s.count(old) == 1, (cat, old[:40]); s = s.replace(old, new)
    s = modern_front(s, "wm")
    if stack:
        s = modern_front(s, "wd")
        s = s.replace('box("sk_frame", -0.302, 0.302, yf_ + 0.01, -0.035, 0.85, 0.872, M_PANEL', 'box("sk_frame", -0.302, 0.302, yf_ + 0.01, -0.035, 0.85, 0.872, M_ENAMEL')
        s = s.replace('box("sk_grip", -0.06, 0.06, yf_ - 0.005, yf_ - 0.003, 0.858, 0.864, M_SEAM)', 'box("sk_grip", -0.06, 0.06, yf_ - 0.005, yf_ - 0.003, 0.858, 0.864, M_SEAM_L)')
    p.write_text(s, encoding="utf-8")
    print(cat, "ok")
