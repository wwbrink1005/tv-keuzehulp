"""Woonkamer-scene voor de stofzuiger- en robotstofzuiger-keuzehulp test (één scène
voor beide, gebouwd op de soundbar-woonkamer): vloerkleed links, eiken vloer rechts,
camera laag en op de vloer gericht.

Aanroep:
  blender -b --factory-startup -P scene.py -- --assets DIR --d 1.3 --light day
          --layer none|cil-zak|cil-zakloos|steel|mand|robot-lidar|robot-basic|
                  robot-lidar-mop|robot-basic-mop|dock|dock-zelflegend
          --res 2000 --samples 256 --out render.png --json cam.json

--layer none = de kamer; elke andere laag rendert alleen dat object met transparante
achtergrond (de rest wordt shadow catcher). Staat identiek in stofzuiger/ en
robotstofzuiger/vragen-test/render/.
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

# ───────────────────────── stofzuiger-scène ─────────────────────────
# Zelfde woonkamer, zonder bank; camera laag en naar de vloer gericht. Links een
# wollen vloerkleed met fauteuil, rechts de eiken vloer. Eén scène voor zowel de
# stofzuiger- als de robotstofzuiger-keuzehulp.
# --layer none | cil-zak | cil-zakloos | steel | mand (hondenmand)
#         robot-lidar | robot-basic | robot-lidar-mop | robot-basic-mop | dock | dock-zelflegend
from mathutils import Matrix, geometry as mgeo
for o in list(bpy.data.objects):
    if o.name.startswith(("sofa", "pillow", "plaid")):
        bpy.data.objects.remove(o)
LAYER = A.layer

def mat(name, color, rough=0.4, metal=0.0, coat=0.0, emission=None, estrength=0.0, transmission=0.0, ior=1.45):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; b.inputs["Coat Weight"].default_value = coat
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission; b.inputs["IOR"].default_value = ior
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1); b.inputs["Emission Strength"].default_value = estrength
    return m

def smooth(o):
    for p in o.data.polygons: p.use_smooth = True
    return o

def ellipsoid(name, cx, cy, cz, rx, ry, rz, m, segs=64, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = name
    o.data.transform(Matrix.Diagonal((rx, ry, rz, 1))); o.location = (cx, cy, cz)
    o.data.materials.append(m); return smooth(o)

def tube_x(name, r, x0, x1, cy, cz, m, verts=48):
    """cilinder langs de x-as van x0 tot x1 (cyl() centreert het mesh, dus op het midden zetten)"""
    o = cyl(name, r, 0, x1 - x0, 0, 0, m, verts)
    o.data.transform(Matrix.Rotation(math.radians(90), 4, "Y")); o.location = ((x0 + x1) / 2, cy, cz)
    return smooth(o)

def tube_y(name, r, y0, y1, cx, cz, m, verts=48):
    o = cyl(name, r, 0, y1 - y0, 0, 0, m, verts)
    o.data.transform(Matrix.Rotation(math.radians(-90), 4, "X")); o.location = (cx, (y0 + y1) / 2, cz)
    return smooth(o)

def sweep(name, pts, r, m, rib=0.0, rib_len=0.012, ring=18):
    """buis langs een puntenreeks (parallel transport), optioneel geribbeld (slang)"""
    bm_ = bmesh.new(); rings_ = []
    P = [Vector(p) for p in pts]
    s = 0.0
    T = [(P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized() for i in range(len(P))]
    n = T[0].orthogonal().normalized()
    for i, p in enumerate(P):
        if i:
            s += (p - P[i - 1]).length
            axis = T[i - 1].cross(T[i])
            if axis.length > 1e-6:
                ang = T[i - 1].angle(T[i]); n = Matrix.Rotation(ang, 3, axis.normalized()) @ n
        b_ = T[i].cross(n)
        rr = r + (rib * math.sin(2 * math.pi * s / rib_len) if rib else 0)
        rings_.append([bm_.verts.new(p + rr * (math.cos(a) * n + math.sin(a) * b_))
                       for a in [2 * math.pi * k / ring for k in range(ring)]])
    for i in range(len(rings_) - 1):
        for k in range(ring):
            bm_.faces.new((rings_[i][k], rings_[i][(k + 1) % ring], rings_[i + 1][(k + 1) % ring], rings_[i + 1][k]))
    me = bpy.data.meshes.new(name); bm_.to_mesh(me)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); me.materials.append(m)
    return smooth(o)

def bez(p0, p1, p2, p3, n=120):
    return mgeo.interpolate_bezier(Vector(p0), Vector(p1), Vector(p2), Vector(p3), n)

def group(objs, loc, rot_z):
    """lokaal gebouwde objecten (oorsprong = voet) roteren en plaatsen"""
    M_ = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rot_z, 4, "Z")
    for o in objs:
        o.matrix_world = M_ @ o.matrix_world
    return objs

# ── v2-kamer: lichter en moderner ──
# Warm wit stucwerk, licht eiken visgraatparket, zonlicht door een raam links (buiten
# beeld) dat banen licht over de vloer legt, crème boucle-kleed, ronde lounge-fauteuil
# in boucle en een rond salontafeltje. Het karamel dressoir blijft (herkenbaar uit de
# andere tests).
M_WALL_V = pbr("wallv", "white_plaster_02", 1.3, base=(0.86, 0.83, 0.78), var=0.05, bump=0.1)
M_FLOOR_V = pbr("floorv", "herringbone_parquet", 1.15, tint=(1.42, 1.38, 1.32), tint_mix=1.0, bump=0.2, rough_add=0.12)
M_CEIL_V = flat("ceilv", (0.9, 0.89, 0.87), 0.9)
for o in list(bpy.data.objects):
    if o.name == "floor":
        o.data.materials.clear(); o.data.materials.append(M_FLOOR_V)
    elif o.name.startswith("wall"):
        o.data.materials.clear(); o.data.materials.append(M_WALL_V)
    elif o.name == "ceiling":
        o.data.materials.clear(); o.data.materials.append(M_CEIL_V)
    elif o.name.startswith("blocker"):
        bpy.data.objects.remove(o)
# raam in de linkerwand (buiten beeld): hoge opening tot bijna op de vloer, met een
# middenstijl en een kalf, zodat het zonlicht als herkenbare raamvlakken op de vloer valt
HXV = ROOM_X0 - 0.35
WY0, WY1, WZ0, WZ1 = -2.9, -0.55, 0.28, 2.45
for (y0, y1, z0, z1) in ((ROOM_Y_BACK - 2, WY0, -1, 5), (WY1, 2, -1, 5), (WY0, WY1, -1, WZ0), (WY0, WY1, WZ1, 5),
                         ((WY0 + WY1) / 2 - 0.035, (WY0 + WY1) / 2 + 0.035, WZ0, WZ1), (WY0, WY1, 1.62, 1.68)):
    shadow_only(box("blocker", HXV - 0.02, HXV, y0, y1, z0, z1, M_WALL_V))
for o in list(bpy.data.objects):
    if o.type == "LIGHT" and o.data.type == "SUN":
        o.data.energy = 7.5; o.data.angle = math.radians(2.5); o.data.color = (1.0, 0.94, 0.86)
        Lv = Vector((0.8, 0.12, -0.78)).normalized()
        o.rotation_euler = (-Lv).to_track_quat("Z", "Y").to_euler()
    elif o.type == "LIGHT" and o.name.startswith("fill"):
        o.data.energy *= 1.1

# crème boucle-kleed (dik, met lussen) onder de salontafel
M_RUGV = pbr("rugv", "curly_teddy_natural", 0.22, base=(0.92, 0.88, 0.8), var=0.35, bump=2.0, sheen=0.5, rough_add=0.35)
RUG = (-1.05, 0.35, -2.0, -0.6)      # x0, x1, y0, y1
rug = box("rug", RUG[0], RUG[1], RUG[2], RUG[3], 0, 0.018, M_RUGV, bevel=0.012, segs=4)

# ronde lounge-fauteuil in boucle, links naast het dressoir (raakt het niet)
M_BOUCLE = pbr("boucle", "wool_boucle", 0.14, base=(0.8, 0.76, 0.69), var=0.15, bump=1.0, sheen=0.55, rough_add=0.3)
chair = [box("lc_base", -0.42, 0.42, -0.4, 0.38, 0.0, 0.34, M_BOUCLE, bevel=0.14, segs=6),
         box("lc_back", -0.44, 0.44, 0.14, 0.4, 0.26, 0.76, M_BOUCLE, bevel=0.16, segs=6),
         box("lc_armL", -0.46, -0.28, -0.34, 0.36, 0.26, 0.56, M_BOUCLE, bevel=0.09, segs=6),
         box("lc_armR", 0.28, 0.46, -0.34, 0.36, 0.26, 0.56, M_BOUCLE, bevel=0.09, segs=6),
         box("lc_seat", -0.3, 0.3, -0.36, 0.2, 0.3, 0.45, M_BOUCLE, bevel=0.07, segs=6)]
for o in chair:
    soften(o, cast=0.12 if o.name != "lc_seat" else 0.05, disp=0.008, levels=2)
M_ = Matrix.Translation(Vector((-2.05, -1.0, 0.0))) @ Matrix.Rotation(math.radians(-38), 4, "Z")
for o in chair:
    o.matrix_world = M_ @ o.matrix_world

for o in append_model("potted_plant_02", (2.0, -0.4, 0), 0.4, 1.0):
    pass

# ── materialen apparaten ──
M_GRAPH = mat("graphite", (0.035, 0.037, 0.042), 0.32, coat=0.6)
M_GRAPH_M = mat("graphite_m", (0.05, 0.052, 0.058), 0.55)
M_COPPER = mat("copper", (0.72, 0.42, 0.27), 0.28, metal=1.0)
M_ALU = mat("alu", (0.78, 0.79, 0.8), 0.22, metal=1.0)
M_CHAMP = mat("champ", (0.74, 0.64, 0.5), 0.3, metal=1.0)
M_RUB = mat("rub", (0.03, 0.03, 0.032), 0.7)
M_HOSE = mat("hose", (0.06, 0.062, 0.068), 0.45)
M_CLEAR = mat("clear", (0.92, 0.94, 0.96), 0.02, transmission=1.0, ior=1.5)
M_CLEARTINT = mat("cleart", (0.55, 0.58, 0.62), 0.03, transmission=1.0, ior=1.5)
M_DUST = mat("dust", (0.42, 0.39, 0.35), 0.95)
M_WHITE = mat("robotwhite", (0.86, 0.86, 0.85), 0.25, coat=0.5)
M_WHITE_M = mat("robotwhite_m", (0.8, 0.8, 0.79), 0.5)
M_BLK = mat("robotblack", (0.02, 0.02, 0.022), 0.18, coat=0.8)
M_LEDG = mat("ledg", (0.1, 0.1, 0.1), 0.3, emission=(0.35, 0.9, 1.0), estrength=6)
M_LEDW = mat("ledw", (0.1, 0.1, 0.1), 0.3, emission=(1.0, 0.97, 0.9), estrength=5)
M_SAGE = mat("sage", (0.33, 0.41, 0.34), 0.4, coat=0.3)
M_MOP = pbr("mop", "knitted_fleece", 0.05, base=(0.55, 0.57, 0.6), var=0.2, bump=0.8, rough_add=0.3)
M_BRISTLE = mat("bristle", (0.12, 0.12, 0.13), 0.6)

objs = []

# ── moderne sledestofzuiger: laag, gestroomlijnd, wit met zwart glazen deksel ──
M_BODYW = mat("bodyw", (0.84, 0.84, 0.82), 0.22, coat=0.6)
M_GREYD = mat("greyd", (0.09, 0.095, 0.1), 0.5)
M_HUB = mat("hub", (0.62, 0.63, 0.64), 0.35, metal=0.6)
M_TITAN = mat("titan", (0.36, 0.37, 0.39), 0.3, metal=1.0)

def loft(name, secs, m, scale=1.0, n=3.2, ring=40):
    """romp uit doorsneden (x, halve breedte, halve hoogte, z-midden), superellips-profiel"""
    bm_ = bmesh.new(); rings_ = []
    e = 2.0 / n
    for (x, w, h, zc) in secs:
        r_ = []
        for k in range(ring):
            t = 2 * math.pi * k / ring
            c, s = math.cos(t), math.sin(t)
            y = w * scale * math.copysign(abs(c) ** e, c)
            z = zc + h * scale * math.copysign(abs(s) ** e, s)
            r_.append(bm_.verts.new((x * (scale if abs(x) > 0 else 1), y, z)))
        rings_.append(r_)
    for i in range(len(rings_) - 1):
        for k in range(ring):
            bm_.faces.new((rings_[i][k], rings_[i][(k + 1) % ring], rings_[i + 1][(k + 1) % ring], rings_[i + 1][k]))
    bm_.faces.new(list(reversed(rings_[0]))); bm_.faces.new(rings_[-1])
    me = bpy.data.meshes.new(name); bm_.to_mesh(me)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); me.materials.append(m)
    sub = o.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    return smooth(o)

def intersect(o, x0, x1, y0, y1, z0, z1):
    cutter = box("cut_" + o.name, x0, x1, y0, y1, z0, z1, M_GREYD)
    bo = o.modifiers.new("bool", "BOOLEAN"); bo.operation = "INTERSECT"; bo.object = cutter; bo.solver = "EXACT"
    bpy.context.view_layer.objects.active = o
    for m_ in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m_.name)
    bpy.data.objects.remove(cutter)
    return smooth(o)

BODY = [(-0.225, 0.12, 0.08, 0.125), (-0.2, 0.148, 0.103, 0.132), (-0.1, 0.158, 0.113, 0.136), (0.02, 0.152, 0.106, 0.131),
        (0.12, 0.134, 0.088, 0.119), (0.19, 0.105, 0.064, 0.104), (0.228, 0.062, 0.038, 0.096)]

def cylinder_vac(bagless):
    L = [loft("cv_body", BODY, M_BODYW)]
    # donkergrijze stootrand rondom onderaan
    L.append(intersect(loft("cv_bumper", BODY, M_GREYD, scale=1.012), -0.4, 0.4, -0.3, 0.3, 0.018, 0.062))
    if not bagless:
        # zwart glazen deksel over het stofzakvak, met greepuitsparing voorop
        L.append(intersect(loft("cv_lid", BODY, M_BLK, scale=1.006), -0.07, 0.205, -0.3, 0.3, 0.19, 0.4))
        L.append(box("cv_lidgrip", 0.15, 0.185, -0.035, 0.035, 0.2, 0.212, M_GREYD, bevel=0.005))
    else:
        # doorzichtig stofreservoir rechtop voorop, cycloon erin, stof onderin, donkere kap
        L.append(intersect(loft("cv_lid", BODY, M_GREYD, scale=1.006), -0.07, 0.205, -0.3, 0.3, 0.2, 0.4))
        L.append(smooth(cyl("cv_bin", 0.068, 0.2, 0.33, 0.07, 0, M_CLEAR, 64, bevel=0.01)))
        L.append(smooth(cyl("cv_cone", 0.028, 0.23, 0.33, 0.07, 0, M_CLEARTINT, 32)))
        L.append(smooth(cyl("cv_dust", 0.063, 0.202, 0.222, 0.07, 0, M_DUST, 48)))
        L.append(smooth(cyl("cv_bincap", 0.071, 0.33, 0.346, 0.07, 0, M_GREYD, 64, bevel=0.006)))
        L.append(box("cv_binlatch", 0.13, 0.145, -0.012, 0.012, 0.3, 0.34, M_CHAMP, bevel=0.004))
    # draaiknop achterop met champagne rand
    for nm, r_, h0, h1, m_ in (("cv_dialring", 0.034, 0, 0.006, M_CHAMP), ("cv_dial", 0.029, 0.004, 0.016, M_GREYD)):
        d = smooth(cyl(nm, r_, h0, h1, 0, 0, m_, 64, bevel=0.003))
        d.rotation_euler = (0, math.radians(-38), 0); d.location = (-0.17, 0, 0.212); L.append(d)
    L.append(box("cv_dialmark", -0.004, 0.004, -0.002, 0.002, 0.2, 0.2, M_CHAMP))
    L[-1].rotation_euler = (0, math.radians(-38), 0); L[-1].location = (-0.155, 0, 0.228)
    L[-1].scale = (1, 1, 1)
    # grote achterwielen, half in de romp, lichtgrijze naaf
    for sy in (-1, 1):
        L.append(tube_y("cv_wheel", 0.083, 0, 0.034, -0.12, 0.083, M_GREYD, 64)); L[-1].location.y = sy * 0.155
        L.append(tube_y("cv_hub", 0.05, 0, 0.004, -0.12, 0.083, M_HUB, 64)); L[-1].location.y = sy * 0.174
    L.append(ellipsoid("cv_caster", 0.15, 0, 0.02, 0.022, 0.022, 0.02, M_GREYD, 24, 12))
    # slangaansluiting in de neus
    L.append(tube_x("cv_conn", 0.028, 0.215, 0.262, 0, 0.098, M_GREYD))
    L.append(tube_x("cv_connring", 0.03, 0.236, 0.244, 0, 0.098, M_CHAMP))
    # zuigmond op de vloer achter de romp, buis rechtop in de parkeerstand
    bx = -0.3
    L.append(box("cv_nozzle", bx - 0.035, bx + 0.035, -0.16, 0.16, 0.004, 0.038, M_GREYD, bevel=0.014, segs=4))
    L.append(box("cv_nozzlestrip", bx - 0.036, bx - 0.03, -0.15, 0.15, 0.028, 0.034, M_CHAMP, bevel=0.002))
    L.append(ellipsoid("cv_nozzleneck", bx + 0.01, 0, 0.05, 0.028, 0.028, 0.028, M_GREYD, 32, 16))
    L.append(smooth(cyl("cv_tube_lo", 0.0145, 0.06, 0.5, bx + 0.01, 0, M_TITAN, 32)))
    L.append(smooth(cyl("cv_tube_hi", 0.0165, 0.48, 0.86, bx + 0.01, 0, M_TITAN, 32)))
    L.append(smooth(cyl("cv_tube_collar", 0.021, 0.47, 0.51, bx + 0.01, 0, M_GREYD, 32, bevel=0.004)))
    L.append(smooth(cyl("cv_tube_btn", 0.006, 0.487, 0.497, bx + 0.031, 0, M_CHAMP, 16)))
    L.append(box("cv_parkclip", bx + 0.02, -0.21, -0.02, 0.02, 0.13, 0.16, M_GREYD, bevel=0.008))
    # handgreep bovenaan, met de slang eraan
    hg = [(bx + 0.01 - 0.035 * math.sin(t * math.pi * 0.5), 0, 0.85 + 0.12 * t) for t in [i / 24 for i in range(25)]]
    L.append(sweep("cv_handle", hg, 0.019, M_GREYD))
    L.append(box("cv_handlebtn", bx - 0.004, bx + 0.012, -0.012, 0.012, 0.9, 0.93, M_CHAMP, bevel=0.004))
    # fijn geribbelde slang: uit de neus omlaag, over de vloer, en weer omhoog naar de greep
    top = (bx - 0.025, 0, 0.975)
    seg1 = bez((0.262, 0, 0.098), (0.36, 0.0, 0.08), (0.42, 0.12, 0.018), (0.3, 0.3, 0.018), 60)
    seg2 = bez((0.3, 0.3, 0.018), (0.2, 0.46, 0.018), (-0.18, 0.42, 0.02), (-0.33, 0.22, 0.05), 70)
    seg3 = bez((-0.33, 0.22, 0.05), (-0.42, 0.12, 0.2), (-0.4, 0.02, 0.8), top, 70)
    hp = list(seg1) + list(seg2)[1:] + list(seg3)[1:]
    L.append(sweep("cv_hose", hp, 0.0165, M_HOSE, rib=0.0012, rib_len=0.0085))
    return L

# ── steelstofzuiger, vrijstaand ──
def stick_vac():
    L = []
    # zuigmond met ledstrip voorop en borstelrol achter een venster
    L.append(box("sv_head", -0.13, 0.13, -0.06, 0.05, 0.004, 0.052, M_GRAPH, bevel=0.018, segs=5))
    L.append(box("sv_headtop", -0.12, 0.12, -0.045, 0.035, 0.05, 0.056, M_CLEARTINT, bevel=0.004))
    L.append(tube_x("sv_roll", 0.019, -0.115, 0.115, -0.005, 0.03, M_SAGE))
    L.append(box("sv_led", -0.11, 0.11, -0.062, -0.058, 0.012, 0.018, M_LEDG))
    L.append(tube_x("sv_wheel", 0.014, 0.06, 0.09, 0.04, 0.014, M_RUB))
    L.append(tube_x("sv_wheel2", 0.014, -0.09, -0.06, 0.04, 0.014, M_RUB))
    # scharnier en buis
    L.append(ellipsoid("sv_joint", 0, 0.03, 0.07, 0.03, 0.03, 0.03, M_GRAPH_M, 32, 16))
    L.append(smooth(cyl("sv_neck", 0.02, 0.07, 0.13, 0, 0.03, M_GRAPH_M, 32)))
    L.append(smooth(cyl("sv_tube", 0.0165, 0.12, 0.8, 0, 0.03, M_CHAMP, 32)))
    L.append(smooth(cyl("sv_tubeclip", 0.021, 0.78, 0.83, 0, 0.03, M_GRAPH_M, 32)))
    # doorzichtig stofreservoir in het verlengde van de buis, cycloon/motor erachter
    L.append(smooth(cyl("sv_bin", 0.05, 0.83, 1.02, 0, 0.03, M_CLEAR, 64)))
    L.append(smooth(cyl("sv_binbot", 0.052, 0.826, 0.84, 0, 0.03, M_SAGE, 64)))
    L.append(smooth(cyl("sv_dust", 0.046, 0.84, 0.865, 0, 0.03, M_DUST, 48)))
    L.append(smooth(cyl("sv_cyclone", 0.028, 0.88, 1.03, 0, 0.03, M_CLEARTINT, 32)))
    motor = smooth(cyl("sv_motor", 0.042, 1.0, 1.1, 0, 0.03, M_GRAPH, 64, bevel=0.01)); L.append(motor)
    for k in range(10):   # ventilatiesleuven
        a = 2 * math.pi * k / 10
        L.append(box("sv_vent", -0.0025, 0.0025, -0.0025, 0.0025, 1.06, 1.09, M_RUB))
        L[-1].location = (math.cos(a) * 0.041, 0.03 + math.sin(a) * 0.041, 0)
    # handgreep in een lus naar achteren, accu onder de greep, display bovenop naar de gebruiker
    hp = [(0, 0.03 + 0.14 * t, 1.08 + 0.1 * math.sin(math.pi * t * 0.9)) for t in [i / 40 for i in range(41)]]
    L.append(sweep("sv_grip", hp, 0.017, M_GRAPH_M))
    L.append(box("sv_batt", -0.03, 0.03, 0.08, 0.17, 0.93, 1.07, M_GRAPH, bevel=0.012, segs=4))
    L.append(box("sv_battstrip", -0.031, 0.031, 0.1, 0.104, 0.94, 1.06, M_SAGE))
    L.append(box("sv_trigger", -0.008, 0.008, 0.12, 0.14, 1.07, 1.1, M_SAGE, bevel=0.004))
    L.append(box("sv_screen", -0.02, 0.02, 0.012, 0.05, 1.1, 1.104, M_BLK, bevel=0.003))
    return L

# ── robotstofzuiger ──
def robot(lidar, mop):
    L = []
    R, H = 0.175, 0.078
    L.append(smooth(cyl("rb_base", R, 0.012, 0.03, 0, 0, M_GRAPH_M, 96, bevel=0.01)))
    L.append(smooth(cyl("rb_body", R - 0.002, 0.028, H, 0, 0, M_WHITE, 96, bevel=0.018)))
    L.append(smooth(cyl("rb_top", R - 0.03, H - 0.002, H + 0.002, 0, 0, M_WHITE_M, 96)))
    # stootrand voorop (halve ring, donker) — voorkant = -y
    bm_ = bmesh.new(); ring = []
    for k in range(49):
        a = math.radians(200 + k * (140 / 48))
        for z_ in (0.022, 0.07):
            ring.append(bm_.verts.new((math.cos(a) * (R + 0.003), math.sin(a) * (R + 0.003), z_)))
    for k in range(48):
        v = ring[2 * k:2 * k + 4]
        bm_.faces.new((v[0], v[2], v[3], v[1]))
    me = bpy.data.meshes.new("rb_bumper"); bm_.to_mesh(me)
    bp = bpy.data.objects.new("rb_bumper", me); scene.collection.objects.link(bp); me.materials.append(M_BLK)
    so_ = bp.modifiers.new("s", "SOLIDIFY"); so_.thickness = 0.006; L.append(smooth(bp))
    if lidar:
        L.append(smooth(cyl("rb_lidar", 0.042, H, H + 0.024, 0, 0.03, M_BLK, 64, bevel=0.006)))
        L.append(smooth(cyl("rb_lidarwin", 0.0425, H + 0.006, H + 0.015, 0, 0.03, M_GRAPH_M, 64)))
    else:
        L.append(box("rb_cam", -0.03, 0.03, -R + 0.02, -R + 0.05, H - 0.004, H + 0.003, M_BLK, bevel=0.004))
    for k, bx_ in enumerate((-0.022, 0.022)):   # twee knoppen met een ledje
        L.append(smooth(cyl("rb_btn", 0.011, H, H + 0.004, bx_, -0.06 if lidar else -0.02, M_WHITE_M, 32, bevel=0.002)))
    L.append(box("rb_led", -0.012, 0.012, -0.085 if lidar else -0.045, -0.082 if lidar else -0.042, H, H + 0.003, M_LEDW))
    # zijborstel linksvoor
    bxc, byc = -0.12, -0.12
    L.append(smooth(cyl("rb_brushhub", 0.014, 0.004, 0.014, bxc, byc, M_GRAPH_M, 24)))
    for k in range(3):
        a = math.radians(30 + k * 120)
        o = box("rb_bristles", 0, 0.075, -0.0015, 0.0015, 0.003, 0.006, M_BRISTLE)
        o.rotation_euler = (0, 0, a); o.location = (bxc, byc, 0)
        L.append(o)
    if mop:
        # twee ronde dweilpads onder de achterkant
        for sx in (-1, 1):
            L.append(smooth(cyl("rb_mop", 0.07, 0.0, 0.012, sx * 0.07, 0.1, M_MOP, 48, bevel=0.004)))
    return L

def dock(zelflegend):
    L = []
    if zelflegend:
        # basisstation met oprit, toren met stofzak achter een getint venster
        L.append(box("dk_ramp", -0.17, 0.17, -0.42, -0.08, 0.0, 0.018, M_GRAPH_M, bevel=0.008))
        L.append(box("dk_tower", -0.17, 0.17, -0.3, 0.0, 0.0, 0.43, M_WHITE, bevel=0.03, segs=5))
        L.append(box("dk_lid", -0.16, 0.16, -0.29, -0.01, 0.43, 0.445, M_WHITE_M, bevel=0.012))
        L.append(box("dk_win", -0.09, 0.09, -0.302, -0.296, 0.24, 0.38, M_CLEARTINT, bevel=0.01))
        L.append(box("dk_bag", -0.075, 0.075, -0.29, -0.25, 0.25, 0.36, M_DUST, bevel=0.02))
        L.append(box("dk_mouth", -0.08, 0.08, -0.302, -0.296, 0.05, 0.1, M_BLK, bevel=0.01))
        L.append(box("dk_led", -0.02, 0.02, -0.303, -0.3, 0.405, 0.41, M_LEDW))
    else:
        L.append(box("dk_base", -0.13, 0.13, -0.12, 0.0, 0.0, 0.09, M_WHITE, bevel=0.02, segs=4))
        L.append(box("dk_front", -0.12, 0.12, -0.124, -0.118, 0.012, 0.07, M_BLK, bevel=0.006))
        L.append(box("dk_led", -0.012, 0.012, -0.125, -0.12, 0.078, 0.082, M_LEDW))
        L.append(box("dk_plate", -0.12, 0.12, -0.2, -0.1, 0.0, 0.006, M_GRAPH_M, bevel=0.003))
    return L

# ── hondenmand (huisdieren) ──
def pet_bed():
    L = []
    M_BED = pbr("bed", "curly_teddy_natural", 0.12, base=(0.66, 0.6, 0.52), var=0.25, bump=1.2, sheen=0.6, rough_add=0.3)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.075, major_segments=96, minor_segments=24)
    t = bpy.context.active_object; t.name = "pb_rim"; t.scale = (1.0, 0.85, 1.0); t.location = (0, 0, 0.075)
    t.data.materials.append(M_BED); L.append(smooth(t))
    c = ellipsoid("pb_cushion", 0, 0, 0.045, 0.24, 0.2, 0.04, M_BED); L.append(c)
    ball = ellipsoid("pb_ball", 0.36, -0.12, 0.033, 0.033, 0.033, 0.033, mat("felt", (0.7, 0.78, 0.18), 0.9), 32, 16)
    L.append(ball)
    return L

POS_VAC = (0.88, -1.0)
POS_ROBOT = (0.62, -1.1)
POS_DOCK = (1.55, -0.02)
if LAYER in ("cil-zak", "cil-zakloos"):
    objs = group(cylinder_vac(LAYER == "cil-zakloos"), (*POS_VAC, 0), math.radians(200))
elif LAYER == "steel":
    objs = group(stick_vac(), (*POS_VAC, 0), math.radians(-35))
elif LAYER.startswith("robot-"):
    objs = group(robot("lidar" in LAYER, LAYER.endswith("mop")), (*POS_ROBOT, 0), math.radians(-25))
elif LAYER in ("dock", "dock-zelflegend"):
    objs = group(dock(LAYER == "dock-zelflegend"), (*POS_DOCK, 0), 0)
elif LAYER == "mand":
    objs = group(pet_bed(), (0.05, -0.85, 0.018), 0.2)

if LAYER != "none":
    keep = set(o.name for o in objs)
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name not in keep:
            o.is_shadow_catcher = True
    scene.render.film_transparent = True


# ───────────────────────── camera ─────────────────────────
cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 22; cam_d.sensor_width = 36; cam_d.sensor_fit = "HORIZONTAL"
cam_d.shift_x = -0.12; cam_d.shift_y = -0.17
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam)
CAM_Y = -3.4; CAM_Z = 1.25
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
