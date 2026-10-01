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
ap.add_argument("--json"); ap.add_argument("--blend"); ap.add_argument("--layer", default="none")
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

# ───────────────────────── v2: rustige, moderne kamer ─────────────────────────
# Warm grijsbeige stuc, lichte gietvloer, een zwevend karamel tv-meubel en de bank.
# Geen raam in beeld: het zonlicht valt door een onzichtbaar "raamgat" links,
# zodat er één zachte lichtbaan over de muur valt.
M_WALL = pbr("wall2", "white_plaster_02", 1.3, base=(0.74, 0.645, 0.52), var=0.07, bump=0.12)
M_CEIL = flat("ceil2", (0.78, 0.74, 0.68), 0.9)
M_FLOOR = pbr("floor3", "laminate_floor_02", 1.7, tint=(1.06, 1.0, 0.93), tint_mix=1.0, bump=0.25, rough_add=0.1)
M_LAK = pbr("lak2", "white_oak_veneer", 0.7, base=(0.40, 0.22, 0.125), var=0.16, bump=0.02, rough_add=0.3)
M_LAK_IN = flat("lak_in", (0.12, 0.065, 0.035), 0.7)
M_GAP = flat("gap", (0.2, 0.18, 0.15), 0.9)
M_KNIT = pbr("knit", "knitted_fleece", 0.2, base=(0.72, 0.68, 0.6), var=0.15, bump=1.0, sheen=0.6, rough_add=0.3)
M_VASE = flat("vase", (0.012, 0.012, 0.012), 0.6)
M_SOFA = pbr("sofa2", "wool_boucle", 0.32, base=(0.33, 0.29, 0.235), var=0.12, bump=0.7, sheen=0.5, rough_add=0.3)
M_PIL = pbr("pil", "rough_linen", 0.25, base=(0.32, 0.16, 0.085), var=0.08, bump=0.4, sheen=0.4, rough_add=0.3)

T = 0.15
box("floor", ROOM_X0 - T, ROOM_X1 + T, ROOM_Y_BACK, 0.3, -T, 0, M_FLOOR)
box("ceiling", ROOM_X0 - T, ROOM_X1 + T, ROOM_Y_BACK, 0.3, CEIL, CEIL + T, M_CEIL)
box("wall_tv", ROOM_X0 - T, ROOM_X1 + T, 0, T, 0, CEIL, M_WALL)
box("wall_back", ROOM_X0 - T, ROOM_X1 + T, ROOM_Y_BACK - T, ROOM_Y_BACK, 0, CEIL, M_WALL)
box("wall_right", ROOM_X1, ROOM_X1 + T, ROOM_Y_BACK, 0, 0, CEIL, M_WALL)
wl_ = box("wall_left", ROOM_X0 - T, ROOM_X0, ROOM_Y_BACK, 0, 0, CEIL, M_WALL)
wl_.visible_shadow = False

def shadow_only(o):
    o.visible_camera = False; o.visible_diffuse = False; o.visible_glossy = False
    o.visible_transmission = False; o.visible_volume_scatter = False
HX = ROOM_X0 - 0.35
HY0, HY1, HZ0, HZ1 = -2.5, -0.85, 1.25, 2.75
for (y0, y1, z0, z1) in ((ROOM_Y_BACK - 2, HY0, -1, 5), (HY1, 2, -1, 5), (HY0, HY1, -1, HZ0), (HY0, HY1, HZ1, 5)):
    shadow_only(box("blocker", HX - 0.02, HX, y0, y1, z0, z1, M_WALL))

# zwevend tv-meubel, gelakt, vier vlakke fronten
SB_X, SB_Z0, SB_Z1, SB_D = 1.25, 0.2, 0.55, 0.42
box("sb_body", -SB_X, SB_X, -SB_D + 0.02, 0, SB_Z0 + 0.004, SB_Z1 - 0.004, M_LAK_IN)
box("sb_top", -SB_X, SB_X, -SB_D + 0.02, 0, SB_Z1 - 0.018, SB_Z1, M_LAK, bevel=0.002)
box("sb_bot", -SB_X, SB_X, -SB_D + 0.02, 0, SB_Z0, SB_Z0 + 0.018, M_LAK, bevel=0.002)
gap = 0.006
for i in range(4):
    x0 = -SB_X + i * (2 * SB_X) / 4 + gap / 2
    x1 = -SB_X + (i + 1) * (2 * SB_X) / 4 - gap / 2
    box(f"sb_door{i}", x0, x1, -SB_D, -SB_D + 0.02, SB_Z0 + 0.002, SB_Z1 - 0.002, M_LAK, bevel=0.002, segs=3)
led = box("sb_led", -SB_X + 0.1, SB_X - 0.1, -SB_D + 0.08, -0.06, SB_Z0 - 0.004, SB_Z0 - 0.001, M_LED)
led.visible_camera = False
for mid, loc, sc in (("ceramic_vase_01", (0.93, -0.2, SB_Z1), 0.62), ("ceramic_vase_03", (1.1, -0.17, SB_Z1), 0.52)):
    for o in append_model(mid, loc, 0.3, sc):
        if o.type == "MESH":
            o.data.materials.clear(); o.data.materials.append(M_VASE)

# bank
yb = -D - 0.45
yf = yb + 0.98
W2 = 1.18
box("sofa_base", -W2, W2, yb, yf, 0.07, 0.40, M_SOFA, bevel=0.03, segs=4)
box("sofa_armL", -W2, -W2 + 0.2, yb, yf, 0.07, 0.63, M_SOFA, bevel=0.07, segs=5)
box("sofa_armR", W2 - 0.2, W2, yb, yf, 0.07, 0.63, M_SOFA, bevel=0.07, segs=5)
box("sofa_back", -W2 + 0.02, W2 - 0.02, yb, yb + 0.2, 0.30, 0.70, M_SOFA, bevel=0.08, segs=5)
iw = (2 * (W2 - 0.2)) / 2
for i in range(2):
    x0 = -W2 + 0.2 + i * iw + 0.006; x1 = x0 + iw - 0.012
    box(f"sofa_seat{i}", x0, x1, yb + 0.18, yf - 0.01, 0.40, 0.55, M_SOFA, bevel=0.06, segs=5, subsurf=1)
    c = box(f"sofa_cush{i}", x0 + 0.01, x1 - 0.01, yb + 0.16, yb + 0.36, 0.50, 0.86, M_SOFA, bevel=0.08, segs=5, subsurf=1)
    c.rotation_euler = (math.radians(-9), 0, 0)
for px_, rz in ((-0.7, 8), (0.74, -10)):
    p_ = box("pillow", px_ - 0.2, px_ + 0.2, yb + 0.36, yb + 0.48, 0.55, 0.93, M_PIL, bevel=0.07, segs=5, subsurf=2)
    p_.rotation_euler = (math.radians(-14), math.radians(rz), 0)
def soften(o, cast=0.1, disp=0.006, levels=3):
    for m in list(o.modifiers):
        if m.type == "SUBSURF": o.modifiers.remove(m)
    sub = o.modifiers.new("sub3", "SUBSURF"); sub.levels = levels; sub.render_levels = levels
    if cast:
        cm = o.modifiers.new("cast", "CAST"); cm.factor = cast
    tex = bpy.data.textures.new("n_" + o.name, "CLOUDS"); tex.noise_scale = 0.18
    dm = o.modifiers.new("disp", "DISPLACE"); dm.texture = tex; dm.strength = disp; dm.mid_level = 0.5
    dm.texture_coords = "GLOBAL"
for o in list(bpy.data.objects):
    if o.name.startswith(("sofa_seat", "pillow")):
        soften(o, cast=0.08)
    elif o.name.startswith("sofa_cush"):
        soften(o, cast=0.03, disp=0.005)
    elif o.name.startswith(("sofa_back", "sofa_arm", "sofa_base")):
        soften(o, cast=0.0, disp=0.004, levels=2)

# plaid over de linkerarmleuning
prof = [(-0.9, 0.7), (-1.02, 0.72), (-1.14, 0.71), (-1.21, 0.64), (-1.235, 0.48), (-1.24, 0.26)]
bm_ = bmesh.new(); ys = [yb + 0.12 + i * 0.05 for i in range(14)]
grid = [[bm_.verts.new((x, y, z)) for (x, z) in prof] for y in ys]
for i in range(len(ys) - 1):
    for j in range(len(prof) - 1):
        bm_.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
me_ = bpy.data.meshes.new("plaid"); bm_.to_mesh(me_)
pl = bpy.data.objects.new("plaid", me_); scene.collection.objects.link(pl); me_.materials.append(M_KNIT)
for f_ in me_.polygons: f_.use_smooth = True
so_ = pl.modifiers.new("sol", "SOLIDIFY"); so_.thickness = 0.016; so_.offset = 0
soften(pl, cast=0.0, disp=0.018, levels=2)

# strakke schaduwvoegen bij vloer en plafond
for (x0, x1, y0, y1) in ((ROOM_X0, ROOM_X1, -0.003, 0), (ROOM_X0, ROOM_X0 + 0.003, ROOM_Y_BACK, 0), (ROOM_X1 - 0.003, ROOM_X1, ROOM_Y_BACK, 0)):
    box("voeg_vloer", x0, x1, y0, y1, 0, 0.007, M_GAP)

for sx in (-1, 1):
    for sy in (yb + 0.08, yf - 0.08):
        cyl("sofa_leg", 0.018, 0.0, 0.07, sx * (W2 - 0.08), sy, M_BLACK, 24)

# licht
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.75, 0.82, 1.0, 1) if not NIGHT else (0.2, 0.25, 0.4, 1)
bg.inputs["Strength"].default_value = 1.0 if not NIGHT else 0.05

def light(name, kind, loc, energy, color, size=None, target=None, sx=None, sy=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color
    if kind == "AREA":
        ld.shape = "RECTANGLE"; ld.size = sx; ld.size_y = sy
    if kind == "POINT" and size:
        ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld); scene.collection.objects.link(o)
    o.location = loc
    if target is not None:
        dvec = Vector(target) - Vector(loc)
        o.rotation_euler = dvec.to_track_quat("-Z", "Y").to_euler()
    return o

fill = light("fill_ceiling", "AREA", (-0.3, -D / 2 - 0.3, CEIL - 0.02), 32 if not NIGHT else 8,
             (1.0, 0.95, 0.88) if not NIGHT else (1.0, 0.75, 0.5), target=(-0.3, -D / 2 - 0.3, 0), sx=4.0, sy=max(1.5, D))
fill.visible_camera = False
if NIGHT:
    light("tvglow", "AREA", (0, -0.05, 1.05), 22, (0.7, 0.8, 1.0), target=(0, -3, 1.0), sx=1.2, sy=0.68)
    # warme wandverlichting uit een verborgen spot linksboven
    wash = light("wash", "SPOT", (-2.2, -1.2, 2.6), 60, (1.0, 0.7, 0.42), target=(-2.2, 0, 1.2))
    wash.data.spot_size = math.radians(70); wash.data.spot_blend = 1.0; wash.data.shadow_soft_size = 0.3
else:
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 2.3; sun.angle = math.radians(7)
    sun.color = (1.0, 0.92, 0.82)
    so = bpy.data.objects.new("sun", sun); scene.collection.objects.link(so)
    Ld = Vector((0.6, 0.6, -0.35)).normalized()
    so.rotation_euler = (-Ld).to_track_quat("Z", "Y").to_euler()

# ───────────────────────── soundbar-scène ─────────────────────────
# Zelfde woonkamer, zonder bank (de camera staat dichter op het tv-meubel).
# --layer none  : basisrender van de kamer
# --layer compact|gemiddeld|groot|sub : alleen de soundbar/subwoofer, met de rest
#                 van de kamer als shadow catcher → transparante laag mét schaduw.
for o in list(bpy.data.objects):
    if o.name.startswith(("sofa", "pillow", "plaid")):
        bpy.data.objects.remove(o)

LAYER = A.layer
M_SB = flat("sb_body", (0.018, 0.018, 0.02), 0.55)
M_GRILLE = pbr("grille", "knitted_fleece", 0.08, base=(0.03, 0.03, 0.032), var=0.2, bump=0.6, rough_add=0.4)
M_LOGO = flat("sb_logo", (0.5, 0.5, 0.5), 0.3, 1.0)
SB_W = {"compact": 0.70, "gemiddeld": 0.95, "groot": 1.20}
new_objs = []
if LAYER in SB_W:
    w = SB_W[LAYER]; h = 0.064; d = 0.1
    y1 = -0.2; y0 = y1 - d; z0 = SB_Z1
    new_objs.append(box("sb", -w / 2, w / 2, y0 + 0.004, y1, z0 + 0.004, z0 + h, M_SB, bevel=0.018, segs=6))
    new_objs.append(box("sb_grille", -w / 2 + 0.02, w / 2 - 0.02, y0, y0 + 0.006, z0 + 0.01, z0 + h - 0.008, M_GRILLE, bevel=0.004, segs=3))
    new_objs.append(box("sb_feet", -w / 2 + 0.06, w / 2 - 0.06, y0 + 0.02, y1 - 0.02, z0, z0 + 0.005, M_SB))
    new_objs.append(box("sb_logo", -0.02, 0.02, y0 - 0.001, y0 + 0.001, z0 + 0.02, z0 + 0.028, M_LOGO))
elif LAYER == "sub":
    sx0, sx1, sy1 = 1.4, 1.72, -0.06
    new_objs.append(box("sub", sx0, sx1, sy1 - 0.4, sy1, 0.012, 0.4, M_SB, bevel=0.012, segs=5))
    new_objs.append(box("sub_grille", sx0 + 0.018, sx1 - 0.018, sy1 - 0.406, sy1 - 0.4, 0.04, 0.37, M_GRILLE, bevel=0.004, segs=3))
    for fx_ in (sx0 + 0.04, sx1 - 0.04):
        for fy_ in (sy1 - 0.36, sy1 - 0.04):
            new_objs.append(cyl("sub_foot", 0.015, 0.0, 0.012, fx_, fy_, M_SB, 16))
if LAYER != "none":
    keep = set(o.name for o in new_objs)
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name not in keep:
            o.is_shadow_catcher = True
    scene.render.film_transparent = True

# ───────────────────────── camera ─────────────────────────
cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 22; cam_d.sensor_width = 36; cam_d.sensor_fit = "HORIZONTAL"
cam_d.shift_x = -0.12; cam_d.shift_y = -0.14
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
r.image_settings.file_format = "PNG"; r.image_settings.color_mode = "RGBA"
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
