"""Woonkamer-scene voor de tv-keuzehulp test.

Aanroep:
  blender -b --factory-startup -P scene.py -- --assets DIR --d 3 --light day
          --res 800 --samples 64 --out render.png --json cam.json

Coordinaten: tv-muur is het vlak y=0, de kamer ligt bij y<0, vloer z=0.
De camera kijkt recht (+y) naar de tv-muur zonder pitch; kadrering gaat
via lens-shift zodat de muur evenwijdig aan het beeldvlak blijft en een
tv op de muur in beeld een exacte rechthoek is.
"""
import bpy, bmesh, math, sys, json, os, argparse
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser()
ap.add_argument("--assets"); ap.add_argument("--d", type=float, default=3.0)
ap.add_argument("--light", default="day"); ap.add_argument("--res", type=int, default=800)
ap.add_argument("--samples", type=int, default=64); ap.add_argument("--out")
ap.add_argument("--json"); ap.add_argument("--blend")
ap.add_argument("--type", default="standaard"); ap.add_argument("--finish", default="rvs")
ap.add_argument("--open", type=int, default=0); ap.add_argument("--nis", type=int, default=178); ap.add_argument("--size", default="middel")
A = ap.parse_args(argv)
ASSETS = A.assets
D = A.d
NIGHT = A.light == "night"

ROOM_X0, ROOM_X1 = -2.7, 2.4       # linkermuur / raamwand
ROOM_Y_BACK = -8.0
CEIL = 2.7
WIN_Y0, WIN_Y1, WIN_TOP = -4.4, -0.55, 2.45

scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

# ───────────────────────── materialen ─────────────────────────
def tex_path(name, key):
    for ext in ("jpg", "png", "exr"):
        p = f"{ASSETS}/tex/{name}/{name}_{key}.{ext}"
        if os.path.exists(p):
            return p
    return None

def img(nodes, path, noncolor=False):
    n = nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        n.image.colorspace_settings.name = "Non-Color"
    n.projection = "BOX"; n.projection_blend = 0.25
    return n

def pbr(name, tex, size_m, tint=(1, 1, 1), tint_mix=0.0, rough_add=0.0,
        bump=0.25, rot90=False, sheen=0.0, base=None, var=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bsdf = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping")
    s = 1.0 / size_m
    mp.inputs["Scale"].default_value = (s, s, s)
    if rot90:
        mp.inputs["Rotation"].default_value = (0, 0, math.pi / 2)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    diff = img(N, tex_path(tex, "Diffuse"))
    L.new(mp.outputs[0], diff.inputs[0])
    col = diff.outputs[0]
    if tint_mix > 0:
        mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = tint_mix
        L.new(col, mix.inputs[6]); mix.inputs[7].default_value = (*tint, 1)
        col = mix.outputs[2]
    if base is not None:
        # effen kleur, met een vleugje van de textuur-luminantie voor levendigheid
        bw = N.new("ShaderNodeRGBToBW"); L.new(col, bw.inputs[0])
        mr = N.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.0; mr.inputs["From Max"].default_value = 1.0
        mr.inputs["To Min"].default_value = 1.0 - var; mr.inputs["To Max"].default_value = 1.0 + var
        L.new(bw.outputs[0], mr.inputs[0])
        mul = N.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        mul.inputs[6].default_value = (*base, 1)
        L.new(mr.outputs[0], mul.inputs[7])
        col = mul.outputs[2]
    L.new(col, bsdf.inputs["Base Color"])
    rp = tex_path(tex, "Rough")
    if rp:
        r = img(N, rp, True); L.new(mp.outputs[0], r.inputs[0])
        if rough_add:
            ma = N.new("ShaderNodeMath"); ma.operation = "ADD"; ma.use_clamp = True
            ma.inputs[1].default_value = rough_add
            L.new(r.outputs[0], ma.inputs[0]); L.new(ma.outputs[0], bsdf.inputs["Roughness"])
        else:
            L.new(r.outputs[0], bsdf.inputs["Roughness"])
    dp = tex_path(tex, "Displacement")
    if dp and bump > 0:
        dn = img(N, dp, True); L.new(mp.outputs[0], dn.inputs[0])
        bn = N.new("ShaderNodeBump"); bn.inputs["Strength"].default_value = bump
        bn.inputs["Distance"].default_value = 0.002
        L.new(dn.outputs[0], bn.inputs["Height"]); L.new(bn.outputs[0], bsdf.inputs["Normal"])
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
        bsdf.inputs["Sheen Roughness"].default_value = 0.6
    return m

def flat(name, color, rough=0.5, metal=0.0, emission=None, estrength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1)
        b.inputs["Emission Strength"].default_value = estrength
    return m

M_WALL = pbr("wall", "white_plaster_02", 1.6, base=(0.9, 0.87, 0.82), var=0.04, bump=0.05)
M_CEIL = flat("ceil", (0.88, 0.87, 0.85), 0.9)
M_FLOOR = pbr("floor", "herringbone_parquet", 3.4, tint=(1.45, 1.3, 1.12), tint_mix=1.0, bump=0.15, rough_add=0.1)
M_OAK = pbr("oak", "white_oak_veneer", 0.9, tint=(1.0, 0.95, 0.88), tint_mix=0.4, bump=0.05, rough_add=0.15)
M_SOFA = pbr("sofa", "wool_boucle", 0.32, base=(0.25, 0.33, 0.22), var=0.12, bump=0.7, sheen=0.5, rough_add=0.3)
M_RUG = pbr("rug", "poly_wool_herringbone", 0.55, base=(0.78, 0.75, 0.69), var=0.25, bump=0.8, sheen=0.3, rough_add=0.3)
M_BLACK = flat("blackmetal", (0.02, 0.02, 0.02), 0.35, 1.0)
M_SKIRT = flat("skirting", (0.9, 0.89, 0.87), 0.4)
M_SHADE = bpy.data.materials.new("shade"); M_SHADE.use_nodes = True
_b = M_SHADE.node_tree.nodes["Principled BSDF"]
_b.inputs["Base Color"].default_value = (0.92, 0.87, 0.78, 1)
_b.inputs["Transmission Weight"].default_value = 0.0
_b.inputs["Subsurface Weight"].default_value = 0.6
_b.inputs["Subsurface Radius"].default_value = (0.2, 0.15, 0.1)
_b.inputs["Roughness"].default_value = 0.8
M_LED = flat("led", (1, 1, 1), 0.5, emission=(1.0, 0.72, 0.42), estrength=(2 if NIGHT else 0))

# vitrage: half-transparante, lichtdoorlatende stof
M_SHEER = bpy.data.materials.new("sheer"); M_SHEER.use_nodes = True
nt = M_SHEER.node_tree; N = nt.nodes; Lk = nt.links
out = N["Material Output"]; N.remove(N["Principled BSDF"])
tr = N.new("ShaderNodeBsdfTransparent"); tl = N.new("ShaderNodeBsdfTranslucent")
tl.inputs[0].default_value = (0.97, 0.95, 0.92, 1)
df = N.new("ShaderNodeBsdfDiffuse"); df.inputs[0].default_value = (0.95, 0.93, 0.9, 1)
m1 = N.new("ShaderNodeMixShader"); m1.inputs[0].default_value = 0.5
Lk.new(tl.outputs[0], m1.inputs[1]); Lk.new(df.outputs[0], m1.inputs[2])
m2 = N.new("ShaderNodeMixShader"); m2.inputs[0].default_value = 0.55
Lk.new(tr.outputs[0], m2.inputs[1]); Lk.new(m1.outputs[0], m2.inputs[2])
Lk.new(m2.outputs[0], out.inputs[0])

# ───────────────────────── geometrie-helpers ─────────────────────────
def box(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.0, segs=3, subsurf=0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object; o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new("bev", "BEVEL"); b.width = bevel; b.segments = segs
        b.limit_method = "NONE"
    if subsurf:
        s = o.modifiers.new("sub", "SUBSURF"); s.levels = subsurf; s.render_levels = subsurf
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = bool(bevel or subsurf)
    return o

def cyl(name, r, z0, z1, x, y, mat, verts=64, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    o = bpy.context.active_object; o.name = name
    if bevel:
        b = o.modifiers.new("bev", "BEVEL"); b.width = bevel; b.segments = 3; b.limit_method = "ANGLE"
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def append_model(mid, loc, rot_z=0.0, scale=1.0):
    path = f"{ASSETS}/models/{mid}/{mid}.blend"
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = src.objects
    objs = [o for o in dst.objects if o]
    for o in objs:
        scene.collection.objects.link(o)
        if o.parent is None:
            o.location = Vector(loc) + o.location * scale
            o.rotation_euler = Euler((0, 0, rot_z))
            o.scale = (scale, scale, scale)
    # textuurpaden vastzetten op de map van het model
    for im in bpy.data.images:
        if im.filepath and not os.path.exists(bpy.path.abspath(im.filepath)):
            cand = f"{ASSETS}/models/{mid}/textures/{os.path.basename(im.filepath)}"
            if os.path.exists(cand):
                im.filepath = cand
    return objs

# ───────────────────────── keuken: zelfde huis als de woonkamer ─────────────────────────
# Grijsbeige stuc, eiken vloer, karamel fronten zonder grepen, dun eiken werkblad,
# één plank. Rechts van het werkblad staat de koelkast (of de inbouwkolom).
KTYPE = A.type
FIN = A.finish

M_WALL = pbr("wall2", "white_plaster_02", 1.3, base=(0.8, 0.72, 0.61), var=0.07, bump=0.12)
M_CEIL = flat("ceil2", (0.78, 0.74, 0.68), 0.9)
M_FLOOR = pbr("floor3", "laminate_floor_02", 1.7, tint=(1.06, 1.0, 0.93), tint_mix=1.0, bump=0.25, rough_add=0.1)
M_LAK = pbr("lak2", "white_oak_veneer", 0.7, base=(0.40, 0.22, 0.125), var=0.16, bump=0.02, rough_add=0.3)
M_TOP = pbr("top", "white_oak_veneer", 0.9, base=(0.62, 0.5, 0.36), var=0.25, bump=0.03, rough_add=0.2)
M_DARK = flat("dark", (0.03, 0.028, 0.026), 0.8)
M_GAP = flat("gap", (0.2, 0.18, 0.15), 0.9)
M_VASE = flat("vase", (0.012, 0.012, 0.012), 0.6)
M_ALU = flat("alu", (0.55, 0.55, 0.56), 0.3, 1.0)
M_LINER = flat("liner", (0.86, 0.87, 0.88), 0.35)
M_FRIDGE_LED = flat("fled", (1, 1, 1), 0.5, emission=(1.0, 0.97, 0.92), estrength=1.0)

def fridge_mat():
    m = bpy.data.materials.new("fin"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    if FIN == "rvs":
        b.inputs["Base Color"].default_value = (0.44, 0.44, 0.445, 1)
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.34
        try:
            b.inputs["Anisotropic"].default_value = 0.7
        except Exception:
            pass
    elif FIN == "wit":
        b.inputs["Base Color"].default_value = (0.82, 0.82, 0.81, 1)
        b.inputs["Roughness"].default_value = 0.22
        b.inputs["Coat Weight"].default_value = 0.4
    else:  # antraciet
        b.inputs["Base Color"].default_value = (0.045, 0.045, 0.05, 1)
        b.inputs["Metallic"].default_value = 0.35
        b.inputs["Roughness"].default_value = 0.42
    return m
M_FIN = fridge_mat()

T = 0.15
box("floor", ROOM_X0 - T, ROOM_X1 + T, ROOM_Y_BACK, 0.3, -T, 0, M_FLOOR)
box("ceiling", ROOM_X0 - T, ROOM_X1 + T, ROOM_Y_BACK, 0.3, CEIL, CEIL + T, M_CEIL)
box("wall_back_k", ROOM_X0 - T, ROOM_X1 + T, 0, T, 0, CEIL, M_WALL)
box("wall_behind_cam", ROOM_X0 - T, ROOM_X1 + T, ROOM_Y_BACK - T, ROOM_Y_BACK, 0, CEIL, M_WALL)
box("wall_right", ROOM_X1, ROOM_X1 + T, ROOM_Y_BACK, 0, 0, CEIL, M_WALL)
wl_ = box("wall_left", ROOM_X0 - T, ROOM_X0, ROOM_Y_BACK, 0, 0, CEIL, M_WALL)
wl_.visible_shadow = False
for (x0, x1, y0, y1) in ((ROOM_X0, ROOM_X1, -0.003, 0), (ROOM_X0, ROOM_X0 + 0.003, ROOM_Y_BACK, 0), (ROOM_X1 - 0.003, ROOM_X1, ROOM_Y_BACK, 0)):
    box("voeg_vloer", x0, x1, y0, y1, 0, 0.007, M_GAP)

def shadow_only(o):
    o.visible_camera = False; o.visible_diffuse = False; o.visible_glossy = False
    o.visible_transmission = False; o.visible_volume_scatter = False
HX = ROOM_X0 - 0.35
HY0, HY1, HZ0, HZ1 = -2.5, -0.85, 1.25, 2.75
for (y0, y1, z0, z1) in ((ROOM_Y_BACK - 2, HY0, -1, 5), (HY1, 2, -1, 5), (HY0, HY1, -1, HZ0), (HY0, HY1, HZ1, 5)):
    shadow_only(box("blocker", HX - 0.02, HX, y0, y1, z0, z1, M_WALL))

# ── onderkasten + werkblad ──
CD = 0.62                 # diepte keukenblok
X0 = ROOM_X0              # keuken begint tegen de linkermuur
XK = -0.34                # einde van het keukenblok
XE = XK
TOP_Z = 0.9
if (KTYPE == "kast" and A.size == "klein") or (KTYPE == "inbouw" and A.nis <= 95):
    XE = XK + 0.64        # werkblad loopt door boven het tafelmodel
box("plinth", X0, XK, -CD + 0.06, 0, 0, 0.1, M_DARK)
fx = X0
units = []
while fx < XK - 0.01:
    w = min(0.6, XK - fx)
    units.append((fx, fx + w)); fx += w
for (a, b) in units:
    box("carcass", a, b, -CD + 0.02, 0, 0.1, TOP_Z - 0.03, M_DARK)
    # front met greeplijst bovenin
    box("front", a + 0.002, b - 0.002, -CD, -CD + 0.02, 0.1, TOP_Z - 0.07, M_LAK, bevel=0.002, segs=3)
    box("grip", a + 0.002, b - 0.002, -CD + 0.005, -CD + 0.03, TOP_Z - 0.07, TOP_Z - 0.03, M_DARK)
box("worktop", X0, XE, -CD - 0.02, 0, TOP_Z - 0.03, TOP_Z, M_TOP, bevel=0.002, segs=2)
if KTYPE != "tafelmodel":
    box("endpanel", XE - 0.02, XE, -CD - 0.02, 0, 0, TOP_Z - 0.03, M_LAK, bevel=0.002)
else:
    box("endpanel", XE - 0.02, XE, -CD - 0.02, 0, 0, TOP_Z - 0.03, M_LAK, bevel=0.002)

# plank met een paar dingen
box("shelf", -2.3, -0.9, -0.24, 0, 1.52, 1.55, M_TOP, bevel=0.002)
for mid, loc, sc in (("ceramic_vase_01", (-1.25, -0.12, 1.55), 0.55), ("ceramic_vase_03", (-1.08, -0.1, 1.55), 0.45)):
    for o in append_model(mid, loc, 0.3, sc):
        if o.type == "MESH":
            o.data.materials.clear(); o.data.materials.append(M_VASE)
# snijplank tegen de muur + houten schaal
append_model("wooden_bowl_01", (-1.3, -0.3, TOP_Z), 0.4, 0.9)

# ── vriezer ──
# --type kast|kist|inbouw, --size klein|middel|groot (kast/kist), --nis (inbouw), --open 0/1
from mathutils import Matrix
OPEN = A.open == 1
NIS = A.nis
SIZE = A.size
M_TRIM = flat("trim", (0.35, 0.36, 0.37), 0.4)
M_FROST = bpy.data.materials.new("frost"); M_FROST.use_nodes = True
_fb = M_FROST.node_tree.nodes["Principled BSDF"]
_fb.inputs["Base Color"].default_value = (0.86, 0.9, 0.93, 1); _fb.inputs["Roughness"].default_value = 0.35
_fb.inputs["Transmission Weight"].default_value = 0.55
M_WHITE = flat("white_body", (0.82, 0.82, 0.81), 0.28)
M_WIRE = flat("wire", (0.6, 0.62, 0.64), 0.35, 0.8)

def swing(objs, hinge, deg, axis="z"):
    hv = Vector(hinge)
    for o in objs:
        o.data.transform(Matrix.Translation(o.location - hv))
        o.location = hv
        o.rotation_euler = (math.radians(deg), 0, 0) if axis == "x" else (0, 0, math.radians(deg))

def freezer_interior(x0, x1, yf, yb, z0, z1):
    """Holle binnenkant met doorzichtige vriesladen over de hele hoogte + lampje."""
    t = 0.015
    box("liner_back", x0, x1, yb - t, yb, z0, z1, M_LINER)
    box("liner_l", x0, x0 + t, yf, yb, z0, z1, M_LINER)
    box("liner_r", x1 - t, x1, yf, yb, z0, z1, M_LINER)
    box("liner_bot", x0, x1, yf, yb, z0, z0 + 0.02, M_LINER)
    box("liner_top", x0, x1, yf, yb, z1 - 0.02, z1, M_LINER)
    n = max(1, int((z1 - z0 - 0.08) / 0.21))
    hh = (z1 - z0 - 0.06) / n
    for i in range(n):
        a = z0 + 0.03 + i * hh
        box("drawer", x0 + t + 0.005, x1 - t - 0.005, yf + 0.01, yb - 0.03, a, a + hh - 0.02, M_FROST, bevel=0.01, segs=3)
        box("drawer_grip", x0 + 0.06, x1 - 0.06, yf + 0.004, yf + 0.018, a + hh - 0.06, a + hh - 0.035, M_TRIM, bevel=0.004)
        box("shelf", x0 + t, x1 - t, yf + 0.02, yb - 0.02, a + hh - 0.018, a + hh - 0.012, M_WIRE)
    li = bpy.data.lights.new("fridge_in", "AREA"); li.energy = 14 * (x1 - x0) / 0.54; li.color = (0.95, 0.97, 1.0)
    li.shape = "RECTANGLE"; li.size = x1 - x0 - 0.06; li.size_y = max(0.2, yb - yf - 0.1)
    lo = bpy.data.objects.new("fridge_in", li); scene.collection.objects.link(lo)
    lo.location = ((x0 + x1) / 2, (yf + yb) / 2, z1 - 0.035); lo.visible_camera = False

def door_set(x0, x1, z0, z1, y_front, mat, handle_x=None, thick=0.035):
    objs = [box("door", x0, x1, y_front, y_front + thick, z0, z1, mat, bevel=0.008, segs=4)]
    if OPEN:
        objs.append(box("door_in", x0 + 0.02, x1 - 0.02, y_front + thick, y_front + thick + 0.03, z0 + 0.03, z1 - 0.03, M_LINER, bevel=0.004))
    if handle_x is not None:
        hz0, hz1 = (z1 - 0.34, z1 - 0.06) if z1 - z0 < 1.0 else (z0 + (z1 - z0) * 0.35, z0 + (z1 - z0) * 0.8)
        objs.append(box("handle", handle_x - 0.008, handle_x + 0.008, y_front - 0.036, y_front - 0.004, hz0, hz1, M_ALU, bevel=0.004, segs=3))
        for z in (hz0 + 0.03, hz1 - 0.03):
            objs.append(box("hfoot", handle_x - 0.006, handle_x + 0.006, y_front - 0.006, y_front, z - 0.01, z + 0.01, M_ALU))
    return objs

def shell(x0, x1, yf, yb, z0, z1, mat):
    t = 0.02
    box("sh_l", x0, x0 + t, yf, yb, z0, z1, mat, bevel=0.006)
    box("sh_r", x1 - t, x1, yf, yb, z0, z1, mat, bevel=0.006)
    box("sh_b", x0, x1, yb - t, yb, z0, z1, mat)
    box("sh_t", x0, x1, yf, yb, z1 - t, z1, mat, bevel=0.006)
    box("sh_bot", x0, x1, yf, yb, z0, z0 + t, mat)

FX0 = XK + 0.03
if KTYPE == "kast":
    W, H = {"klein": (0.55, 0.84), "middel": (0.60, 1.45), "groot": (0.60, 1.86)}[SIZE]
    Dp = 0.6 if SIZE != "klein" else 0.57
    fx0, fx1 = FX0, FX0 + W
    yb_ = -0.04 if SIZE != "klein" else -0.06
    yf_ = yb_ - Dp
    ybody = yf_ + 0.035
    box("feet", fx0 + 0.04, fx1 - 0.04, yf_ + 0.08, yb_ - 0.05, 0, 0.03, M_DARK)
    if OPEN:
        shell(fx0, fx1, ybody, yb_, 0.02, H, M_FIN)
        freezer_interior(fx0 + 0.02, fx1 - 0.02, ybody, yb_ - 0.02, 0.05, H - 0.02)
        swing(door_set(fx0, fx1, 0.03, H, yf_, M_FIN, handle_x=fx1 - 0.045), (fx0, ybody, 0), -96)
    else:
        box("body", fx0, fx1, ybody, yb_, 0.02, H, M_FIN, bevel=0.01, segs=4)
        door_set(fx0, fx1, 0.03, H, yf_, M_FIN, handle_x=fx1 - 0.045)
elif KTYPE == "kist":
    W = {"klein": 0.8, "middel": 1.1, "groot": 1.5}[SIZE]
    Dp = {"klein": 0.56, "middel": 0.65, "groot": 0.7}[SIZE]
    H = 0.85
    kx0, kx1 = FX0 + 0.02, FX0 + 0.02 + W
    yb_ = -0.06; yf_ = yb_ - Dp
    box("kist_plinth", kx0 + 0.03, kx1 - 0.03, yf_ + 0.03, yb_ - 0.03, 0, 0.04, M_DARK)
    lid_z0 = H - 0.07
    if OPEN:
        shell(kx0, kx1, yf_, yb_, 0.04, lid_z0, M_WHITE)
        box("kist_front", kx0, kx1, yf_, yf_ + 0.02, 0.04, lid_z0, M_WHITE, bevel=0.006)
        box("kist_liner_bot", kx0 + 0.03, kx1 - 0.03, yf_ + 0.03, yb_ - 0.03, 0.12, 0.14, M_LINER)
        # twee draadmanden bovenin
        bw = (kx1 - kx0 - 0.1) / 2
        for i in range(2):
            a = kx0 + 0.05 + i * bw
            for (y0_, y1_, z0_, z1_) in ((yf_ + 0.05, yb_ - 0.05, lid_z0 - 0.17, lid_z0 - 0.165),):
                box("basket_bot", a + 0.01, a + bw - 0.01, y0_, y1_, z0_, z1_, M_WIRE)
            for x_ in (a + 0.01, a + bw - 0.01):
                box("basket_side", x_ - 0.004, x_ + 0.004, yf_ + 0.05, yb_ - 0.05, lid_z0 - 0.17, lid_z0 + 0.05, M_WIRE)
            box("basket_rim", a + 0.01, a + bw - 0.01, yf_ + 0.045, yf_ + 0.055, lid_z0 + 0.04, lid_z0 + 0.05, M_WIRE)
            box("basket_rim_b", a + 0.01, a + bw - 0.01, yb_ - 0.055, yb_ - 0.045, lid_z0 + 0.04, lid_z0 + 0.05, M_WIRE)
            box("basket_handle", a + bw / 2 - 0.08, a + bw / 2 + 0.08, yf_ + 0.04, yf_ + 0.06, lid_z0 + 0.05, lid_z0 + 0.09, M_WIRE, bevel=0.008)
        li = bpy.data.lights.new("kist_in", "AREA"); li.energy = 6 * W; li.color = (0.95, 0.97, 1.0)
        li.shape = "RECTANGLE"; li.size = W - 0.1; li.size_y = Dp - 0.1
        lo = bpy.data.objects.new("kist_in", li); scene.collection.objects.link(lo)
        lo.location = ((kx0 + kx1) / 2, (yf_ + yb_) / 2, lid_z0 + 0.35); lo.visible_camera = False
        lid = [box("lid", kx0, kx1, yf_ - 0.01, yb_, lid_z0, H, M_WHITE, bevel=0.012, segs=4),
               box("lid_in", kx0 + 0.03, kx1 - 0.03, yf_ + 0.03, yb_ - 0.03, lid_z0 - 0.03, lid_z0, M_LINER, bevel=0.006),
               box("lid_grip", (kx0 + kx1) / 2 - 0.12, (kx0 + kx1) / 2 + 0.12, yf_ - 0.03, yf_ - 0.01, lid_z0 + 0.01, lid_z0 + 0.045, M_TRIM, bevel=0.006)]
        swing(lid, (0, yb_, H), -72, axis="x")
    else:
        box("kist_body", kx0, kx1, yf_, yb_, 0.04, lid_z0, M_WHITE, bevel=0.01, segs=4)
        box("lid", kx0, kx1, yf_ - 0.01, yb_, lid_z0 + 0.004, H, M_WHITE, bevel=0.012, segs=4)
        box("lid_grip", (kx0 + kx1) / 2 - 0.12, (kx0 + kx1) / 2 + 0.12, yf_ - 0.03, yf_ - 0.01, lid_z0 + 0.01, lid_z0 + 0.045, M_TRIM, bevel=0.006)
        box("kist_led", kx1 - 0.12, kx1 - 0.06, yf_ - 0.001, yf_ + 0.001, lid_z0 - 0.06, lid_z0 - 0.045, flat("kled", (0.1, 0.1, 0.1), 0.3, emission=(0.3, 1.0, 0.45), estrength=2))
elif KTYPE == "inbouw":
    cx0, cx1 = XK + 0.03, XK + 0.63
    yfc = -CD - 0.02
    if NIS <= 95:
        nz0, nz1 = 0.1, TOP_Z - 0.03
        box("ub_plinth", cx0, cx1, -CD + 0.06, 0, 0, 0.1, M_DARK)
        box("ub_side", cx1 - 0.02, cx1, yfc, 0, 0, TOP_Z - 0.03, M_LAK, bevel=0.002)
        box("ub_back", cx0, cx1, -0.02, 0, 0.1, nz1, M_DARK)
        freezer_interior(cx0 + 0.02, cx1 - 0.04, -CD + 0.03, -0.03, nz0 + 0.02, nz1 - 0.03)
        swing(door_set(cx0 + 0.002, cx1 - 0.002, nz0, nz1 - 0.04, yfc, M_LAK), (cx0, -CD, 0), -96)
    else:
        top = 2.2
        nz0, nz1 = 0.1, 0.1 + NIS / 100
        box("col_back", cx0, cx1, -0.02, 0, 0, top, M_DARK)
        box("col_side_r", cx1 - 0.02, cx1, yfc, 0, 0, top, M_LAK, bevel=0.002)
        box("col_side_l", cx0, cx0 + 0.02, yfc, 0, 0, top, M_LAK, bevel=0.002)
        box("col_top", cx0, cx1, yfc, 0, top - 0.02, top, M_LAK, bevel=0.002)
        box("col_plinth", cx0 + 0.02, cx1 - 0.02, -CD + 0.06, 0, 0, 0.1, M_DARK)
        box("col_shelf", cx0 + 0.02, cx1 - 0.02, -CD, 0, nz1 + 0.005, nz1 + 0.025, M_DARK)
        freezer_interior(cx0 + 0.03, cx1 - 0.03, -CD + 0.03, -0.03, nz0 + 0.02, nz1 - 0.02)
        swing(door_set(cx0 + 0.002, cx1 - 0.002, nz0, nz1, yfc, M_LAK), (cx0, -CD, 0), -96)
        box("col_door_top", cx0 + 0.002, cx1 - 0.002, yfc, -CD, nz1 + 0.03, top - 0.022, M_LAK, bevel=0.002)

# licht (zelfde karakter als de woonkamer: zachte zon van linksboven)
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.75, 0.82, 1.0, 1); bg.inputs["Strength"].default_value = 1.0

def light(name, kind, loc, energy, color, size=None, target=None, sx=None, sy=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color
    if kind == "AREA":
        ld.shape = "RECTANGLE"; ld.size = sx; ld.size_y = sy
    o = bpy.data.objects.new(name, ld); scene.collection.objects.link(o)
    o.location = loc
    if target is not None:
        dvec = Vector(target) - Vector(loc)
        o.rotation_euler = dvec.to_track_quat("-Z", "Y").to_euler()
    return o
fill = light("fill_ceiling", "AREA", (-0.3, -D / 2 - 0.8, CEIL - 0.02), 110, (1.0, 0.97, 0.93),
             target=(-0.3, -D / 2 - 0.8, 0), sx=4.6, sy=2.6)
fill.visible_camera = False
# geen spiegeling van het vullicht in het RVS: de koelkast houdt zo zijn eigen contrast
fill.visible_glossy = False
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.4; sun.angle = math.radians(7)
sun.color = (1.0, 0.92, 0.82)
so = bpy.data.objects.new("sun", sun); scene.collection.objects.link(so)
Ld = Vector((0.6, 0.6, -0.35)).normalized()
so.rotation_euler = (-Ld).to_track_quat("Z", "Y").to_euler()


# ───────────────────────── camera ─────────────────────────
cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 22; cam_d.sensor_width = 36; cam_d.sensor_fit = "HORIZONTAL"
cam_d.shift_x = -0.12; cam_d.shift_y = -0.08
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam)
CAM_Y = -(D + 2.45); CAM_Z = 1.62
cam.location = (0, CAM_Y, CAM_Z)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam

# ───────────────────────── render-instellingen ─────────────────────────
W = A.res; H = round(A.res / 1.97133)
r = scene.render
r.engine = "CYCLES"; r.resolution_x = W; r.resolution_y = H; r.resolution_percentage = 100
r.filepath = A.out or "//render.png"
r.image_settings.file_format = "PNG"
c = scene.cycles
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev_type in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dev_type
        prefs.refresh_devices()
        gpus = [d for d in prefs.devices if d.type == dev_type]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == dev_type
            c.device = "GPU"
            print("DEVICE", dev_type, [d.name for d in gpus])
            break
    except Exception as e:
        print("dev err", dev_type, e)
c.samples = A.samples
c.use_adaptive_sampling = True; c.adaptive_threshold = 0.015
c.use_denoising = True; c.denoiser = "OPENIMAGEDENOISE"
c.max_bounces = 10; c.diffuse_bounces = 5; c.glossy_bounces = 4; c.transmission_bounces = 8
c.transparent_max_bounces = 12
c.sample_clamp_indirect = 4.0
c.caustics_reflective = False; c.caustics_refractive = False
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast" if NIGHT else "AgX - Base Contrast"
except Exception:
    pass
scene.view_settings.exposure = 0.6 if NIGHT else 1.1

if A.blend:
    bpy.ops.wm.save_as_mainfile(filepath=A.blend)

bpy.ops.render.render(write_still=True)

# ───────────────────────── camera-export voor de overlays ─────────────────────────
if A.json:
    from bpy_extras.object_utils import world_to_camera_view
    def proj(p):
        v = world_to_camera_view(scene, cam, Vector(p))
        return [round(v.x, 5), round(1 - v.y, 5)]
    data = {
        "d": D, "light": A.light, "w": W, "h": H,
        "cam": {"x": 0, "y": CAM_Y, "z": CAM_Z, "f_over_sw": cam_d.lens / cam_d.sensor_width,
                "shift_x": cam_d.shift_x, "shift_y": cam_d.shift_y, "aspect": W / H},
        "check": {"origin_wall": proj((0, 0, 1.0)), "wall_1m_right": proj((1, 0, 1.0)),
                  "floor_eye": proj((1.35, -D, 0))},
    }
    json.dump(data, open(A.json, "w"), indent=1)
