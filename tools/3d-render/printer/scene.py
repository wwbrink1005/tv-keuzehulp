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
ap.add_argument("--open", type=int, default=0); ap.add_argument("--nis", type=int, default=178); ap.add_argument("--layer", default="none")
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

from mathutils import Matrix
# ── werkplek: eiken bureau, plank, stoel ──
# --layer none|13|15|17 : basis of alleen de laptop (rest als shadow catcher)
M_DESK = pbr("desk", "white_oak_veneer", 0.8, base=(0.3, 0.2, 0.12), var=0.22, bump=0.03, rough_add=0.2)
M_METAL = flat("metal_black", (0.025, 0.025, 0.027), 0.35, 1.0)
M_CHAIR = pbr("chair", "wool_boucle", 0.3, base=(0.28, 0.15, 0.085), var=0.12, bump=0.7, sheen=0.5, rough_add=0.3)
M_MUG = flat("mug", (0.75, 0.72, 0.66), 0.35)

DZ = 0.75                      # bureauhoogte
DX0, DX1, DY0, DY1 = -0.7, 0.7, -0.72, -0.03
box("desk_top", DX0, DX1, DY0, DY1, DZ - 0.028, DZ, M_DESK, bevel=0.003, segs=3)
for lx in (DX0 + 0.05, DX1 - 0.05):
    for ly in (DY0 + 0.05, DY1 - 0.05):
        box("desk_leg", lx - 0.013, lx + 0.013, ly - 0.013, ly + 0.013, 0, DZ - 0.028, M_METAL, bevel=0.003)
    box("desk_rail", lx - 0.01, lx + 0.01, DY0 + 0.05, DY1 - 0.05, DZ - 0.07, DZ - 0.05, M_METAL)

# plank met vazen boven het bureau
box("shelf", -0.62, 0.12, -0.22, 0, 1.24, 1.265, M_DESK, bevel=0.002)
for mid, loc, sc in (("ceramic_vase_01", (-0.4, -0.11, 1.265), 0.55), ("ceramic_vase_03", (-0.24, -0.1, 1.265), 0.45)):
    for o in append_model(mid, loc, 0.3, sc):
        if o.type == "MESH":
            o.data.materials.clear(); o.data.materials.append(M_VASE)
# plantje en mok op het bureau
append_model("potted_plant_04", (-0.52, -0.2, DZ), 0.6, 1.0)
# (geen mok: daar staat in deze scène de printer)

# stoel, iets naar rechts weggeschoven en gedraaid
chair = []
cx, cy = 0.42, -0.74
chair.append(box("chair_seat", -0.23, 0.23, -0.23, 0.23, 0.42, 0.48, M_CHAIR, bevel=0.03, segs=4))
chair.append(box("chair_back", -0.22, 0.22, -0.23, -0.17, 0.5, 0.82, M_CHAIR, bevel=0.03, segs=4))
for sx in (-0.19, 0.19):
    for sy in (-0.19, 0.19):
        chair.append(box("chair_leg", sx - 0.014, sx + 0.014, sy - 0.014, sy + 0.014, 0, 0.42, M_DESK, bevel=0.004))
ang = math.radians(-12)
for o in chair:
    px_, py_ = o.location.x, o.location.y
    o.data.transform(Matrix.Rotation(ang, 4, "Z"))
    o.location = (cx + px_ * math.cos(ang) - py_ * math.sin(ang), cy + px_ * math.sin(ang) + py_ * math.cos(ang), o.location.z)

# ── laptop ──
LAPTOP = {"13": (0.300, 0.212, 0.286, 0.179), "15": (0.358, 0.245, 0.345, 0.194), "17": (0.398, 0.268, 0.383, 0.215)}
M_SPACE = flat("spacegrey", (0.32, 0.32, 0.33), 0.32, 1.0)
M_KEYS = flat("keys", (0.03, 0.03, 0.032), 0.55)
M_PAD = flat("pad", (0.28, 0.28, 0.29), 0.25, 1.0)
M_SCRN = flat("scrn", (0.005, 0.005, 0.007), 0.06)
LY = -0.33                      # midden van de laptopvoet
TILT = math.radians(18)         # scherm leunt 18 graden naar achteren
lap = []
if A.layer in LAPTOP:
    bw, bd, sw_, sh_ = LAPTOP[A.layer]
    t = 0.016
    y0, y1 = LY - bd / 2, LY + bd / 2
    lap.append(box("lap_base", -bw / 2, bw / 2, y0, y1, DZ, DZ + t, M_SPACE, bevel=0.004, segs=3))
    lap.append(box("lap_keys", -bw / 2 + 0.02, bw / 2 - 0.02, y1 - bd * 0.55, y1 - 0.015, DZ + t - 0.001, DZ + t + 0.0005, M_KEYS))
    lap.append(box("lap_pad", -bw * 0.18, bw * 0.18, y0 + 0.015, y0 + bd * 0.38, DZ + t - 0.0005, DZ + t + 0.0004, M_PAD, bevel=0.003))
    lid_h = sh_ + 0.03
    lid = [box("lap_lid", -bw / 2, bw / 2, 0, 0.006, 0.004, 0.004 + lid_h, M_SPACE, bevel=0.003, segs=3),
           box("lap_screen", -sw_ / 2, sw_ / 2, -0.0008, 0.0, 0.004 + 0.012, 0.004 + 0.012 + sh_, M_SCRN)]
    for o in lid:
        o.location = (o.location.x, o.location.y + y1 - 0.004, o.location.z + DZ + t)
        o.rotation_euler = (-TILT, 0, 0)
        # draaien om de scharnierlijn: oorsprong naar het scharnier
        hv = Vector((0, y1 - 0.004, DZ + t))
        o.data.transform(Matrix.Translation(o.location - hv))
        o.location = hv
    lap += lid

# ── printer-scène: kleine laptop in het midden (deel van de basis), printer rechts ──
# --layer none | thuis|foto|zakelijk (+ "-aio") | tank-thuis|tank-foto|tank-zakelijk | adf-thuis|adf-foto
# Laptop 13" als vast decor (hoort bij de basisrender, dus niet in 'lap').
_bw, _bd, _sw, _sh = LAPTOP["13"]
_t = 0.016; _LX = -0.12; _LY = -0.33
_y0, _y1 = _LY - _bd / 2, _LY + _bd / 2
box("dec_lap_base", _LX - _bw / 2, _LX + _bw / 2, _y0, _y1, DZ, DZ + _t, M_SPACE, bevel=0.004, segs=3)
box("dec_lap_keys", _LX - _bw / 2 + 0.02, _LX + _bw / 2 - 0.02, _y1 - _bd * 0.55, _y1 - 0.015, DZ + _t - 0.001, DZ + _t + 0.0005, M_KEYS)
_lid = [box("dec_lap_lid", _LX - _bw / 2, _LX + _bw / 2, 0, 0.006, 0.004, 0.004 + _sh + 0.03, M_SPACE, bevel=0.003, segs=3),
        box("dec_lap_screen", _LX - _sw / 2, _LX + _sw / 2, -0.0008, 0.0, 0.016, 0.016 + _sh, flat("dec_scr", (0.05, 0.12, 0.25), 0.1, emission=(0.15, 0.3, 0.6), estrength=0.6))]
for o in _lid:
    o.location = (o.location.x, o.location.y + _y1 - 0.004, o.location.z + DZ + _t)
    o.rotation_euler = (-TILT, 0, 0)
    hv = Vector((0, _y1 - 0.004, DZ + _t))
    o.data.transform(Matrix.Translation(o.location - hv))
    o.location = hv

# ── printers, gemodelleerd naar echte apparaten ──
# inkjet (thuis/foto): onderkast + scannerunit met naad, gestructureerd deksel,
#   kantelbaar bedieningspaneel met kleurenscherm, uitvoerlade met verlengstuk en
#   papierstop, papierinvoer achterop die schuin omhoog steekt.
# laser (zakelijk): papierlade onderin, uitvoerruimte onder de scanner (die op een
#   zijkolom rust), documentinvoer bovenop, schuin touchscreen.
PX = 0.44
YB = -0.06

def plastic(name, color, rough=0.45, grain=0.06, metal=0.0):
    """Kunststof met een fijne korrel (voorkomt het gladde 'CG'-uiterlijk)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links
    b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    tc = N.new("ShaderNodeTexCoord"); nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1400
    bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = grain; bu.inputs["Distance"].default_value = 0.0004
    L.new(tc.outputs["Object"], nz.inputs["Vector"]); L.new(nz.outputs["Fac"], bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])
    return m

M_SEAM = flat("p_seam", (0.015, 0.015, 0.016), 0.7)
M_SLOT = flat("p_slot", (0.008, 0.008, 0.009), 0.85)
M_GLOSS = flat("p_gloss", (0.02, 0.02, 0.022), 0.08)
M_PAPER = flat("p_paper", (0.93, 0.93, 0.91), 0.7)
M_LCD = flat("p_lcd", (0.02, 0.03, 0.05), 0.05, emission=(0.35, 0.6, 1.0), estrength=0.7)
M_LCD2 = flat("p_lcd2", (0.02, 0.03, 0.05), 0.05, emission=(0.9, 0.95, 1.0), estrength=0.5)
M_BTN = flat("p_btn", (0.2, 0.2, 0.21), 0.4)
M_PWR = flat("p_pwr", (0.1, 0.1, 0.1), 0.4, emission=(0.3, 0.8, 1.0), estrength=2)

def rot_x(objs, pivot, deg):
    pv = Vector(pivot)
    for o in objs:
        o.data.transform(Matrix.Translation(o.location - pv))
        o.location = pv
        o.rotation_euler = (math.radians(deg), 0, 0)

prn = []
lay = A.layer
aio = lay.endswith("-aio")
kind = lay.replace("-aio", "").replace("tank-", "").replace("adf-", "")

def inkjet(k, aio_, part):
    """part: 'body' | 'tank' | 'adf'"""
    foto = k == "foto"
    w, d = (0.45, 0.36) if foto else (0.43, 0.34)
    x0, x1 = PX - w / 2, PX + w / 2
    yf = YB - d
    hb = 0.125                         # hoogte onderkast
    top = DZ + hb + (0.052 if aio_ else 0.012)
    M_B = plastic("ink_body", (0.03, 0.03, 0.032) if foto else (0.82, 0.82, 0.8), 0.38 if foto else 0.45)
    M_A = plastic("ink_accent", (0.13, 0.13, 0.14) if foto else (0.36, 0.37, 0.38), 0.4)
    M_LID = plastic("ink_lid", (0.05, 0.05, 0.055) if foto else (0.7, 0.7, 0.69), 0.55, grain=0.25)
    out = []
    if part == "body":
        out.append(box("ink_base", x0, x1, yf, YB, DZ + 0.008, DZ + hb, M_B, bevel=0.016, segs=6))
        for fx in (x0 + 0.04, x1 - 0.04):
            for fy in (yf + 0.04, YB - 0.04):
                out.append(cyl("ink_foot", 0.012, DZ, DZ + 0.008, fx, fy, M_SEAM, 16))
        # accentband onderaan de voorkant
        out.append(box("ink_band", x0 + 0.01, x1 - 0.01, yf - 0.002, yf + 0.01, DZ + 0.012, DZ + 0.03, M_A, bevel=0.004))
        # uitvoeropening met lade, verlengstuk en papierstop
        out.append(box("ink_slot", PX - 0.155, PX + 0.155, yf - 0.003, yf + 0.03, DZ + 0.04, DZ + 0.066, M_SLOT, bevel=0.003))
        out.append(box("ink_tray", PX - 0.125, PX + 0.125, yf - 0.15, yf + 0.03, DZ + 0.041, DZ + 0.046, M_A, bevel=0.003, segs=2))
        out.append(box("ink_tray_ext", PX - 0.11, PX + 0.11, yf - 0.23, yf - 0.14, DZ + 0.042, DZ + 0.046, M_A, bevel=0.003, segs=2))
        out.append(box("ink_stop", PX - 0.04, PX + 0.04, yf - 0.232, yf - 0.226, DZ + 0.046, DZ + 0.066, M_A, bevel=0.002))
        # naad tussen onderkast en scanner, scannerunit en gestructureerd deksel
        if aio_:
            out.append(box("ink_seam", x0 + 0.006, x1 - 0.006, yf + 0.006, YB - 0.006, DZ + hb - 0.004, DZ + hb + 0.004, M_SEAM))
            out.append(box("ink_scan", x0 + 0.002, x1 - 0.002, yf + 0.004, YB, DZ + hb + 0.003, DZ + hb + 0.042, M_B, bevel=0.012, segs=5))
            out.append(box("ink_lid", x0 + 0.004, x1 - 0.004, yf + 0.006, YB - 0.002, DZ + hb + 0.041, top, M_LID, bevel=0.01, segs=4))
            out.append(box("ink_lidlip", PX - 0.06, PX + 0.06, yf + 0.003, yf + 0.012, top - 0.012, top - 0.004, M_SEAM, bevel=0.003))
        else:
            out.append(box("ink_cover", x0 + 0.01, x1 - 0.01, yf + 0.02, YB - 0.01, DZ + hb - 0.001, top, M_LID, bevel=0.008, segs=4))
        # bedieningspaneel: kantelbare strook linksvoor met kleurenscherm en knoppen
        pz = DZ + hb - 0.035
        panel = [box("ink_panel", x0 + 0.02, x0 + 0.17, yf - 0.03, yf + 0.004, pz, pz + 0.03, M_B if not foto else M_A, bevel=0.006, segs=4),
                 box("ink_lcd", x0 + 0.03, x0 + 0.1, yf - 0.031, yf - 0.029, pz + 0.006, pz + 0.025, M_LCD)]
        for i in range(3):
            bx = x0 + 0.115 + i * 0.017
            panel.append(box("ink_btn", bx - 0.0055, bx + 0.0055, yf - 0.034, yf - 0.03, pz + 0.01, pz + 0.021, M_BTN if i else M_PWR, bevel=0.002, segs=2))
        rot_x(panel, (0, yf, pz), -28)
        out += panel
        # papierinvoer achterop: schuine steun met papier erin
        feeder = [box("ink_feed", PX - 0.135, PX + 0.135, -0.004, 0.004, 0, 0.19, M_A, bevel=0.004, segs=3),
                  box("ink_feed_paper", PX - 0.105, PX + 0.105, -0.012, -0.004, 0.02, 0.2, M_PAPER),
                  box("ink_feed_guide", PX - 0.11, PX - 0.1, -0.02, -0.004, 0.0, 0.08, M_A, bevel=0.002)]
        for o in feeder:
            o.location = (o.location.x, o.location.y + YB - 0.03, o.location.z + top - 0.01)
        rot_x(feeder, (0, YB - 0.03, top - 0.01), -18)
        out += feeder
        # klein logoplaatje op de scanner-/bovenrand
        out.append(box("ink_logo", PX + 0.08, PX + 0.13, yf - 0.001, yf + 0.001, top - 0.03, top - 0.022, flat("logo", (0.45, 0.45, 0.46), 0.3, 1.0)))
    elif part == "tank":
        # geïntegreerd tankvenster rechtsvoor met vier (foto: zes) inktkleuren
        inks = [(0.02, 0.02, 0.02), (0.0, 0.55, 0.85), (0.85, 0.05, 0.45), (0.95, 0.8, 0.05)]
        if foto:
            inks += [(0.4, 0.75, 0.95), (0.95, 0.5, 0.75)]
        wx0 = x1 - 0.028 - 0.016 * len(inks); wx1 = x1 - 0.02
        out.append(box("tank_frame", wx0 - 0.008, wx1 + 0.008, yf - 0.006, yf + 0.004, DZ + 0.034, DZ + 0.118, plastic("tank_fr", (0.03, 0.03, 0.032), 0.35), bevel=0.004, segs=3))
        glass = bpy.data.materials.new("tank_glass"); glass.use_nodes = True
        g = glass.node_tree.nodes["Principled BSDF"]; g.inputs["Base Color"].default_value = (0.8, 0.82, 0.85, 1)
        g.inputs["Roughness"].default_value = 0.05; g.inputs["Transmission Weight"].default_value = 0.9
        for i, c in enumerate(inks):
            tx = wx0 + i * 0.016
            M_T = flat(f"ink{i}", c, 0.2)
            lvl = 0.035 + 0.035 * ((i * 37) % 10) / 10
            out.append(box(f"tank_ink{i}", tx + 0.002, tx + 0.013, yf - 0.008, yf - 0.004, DZ + 0.04, DZ + 0.04 + lvl, M_T))
            out.append(box(f"tank_win{i}", tx + 0.001, tx + 0.014, yf - 0.009, yf - 0.007, DZ + 0.038, DZ + 0.112, glass, bevel=0.002))
    elif part == "adf":
        # documentinvoer op het scannerdeksel, met invoerlade en een paar vellen
        out.append(box("adf_body", x0 + 0.04, x1 - 0.04, yf + 0.03, YB - 0.01, top, top + 0.05, M_B, bevel=0.012, segs=4))
        out.append(box("adf_tray", PX - 0.12, PX + 0.12, yf + 0.1, YB - 0.02, top + 0.05, top + 0.055, M_A, bevel=0.003))
        out.append(box("adf_paper", PX - 0.105, PX + 0.105, yf + 0.11, YB - 0.03, top + 0.055, top + 0.058, M_PAPER))
        out.append(box("adf_slot", PX - 0.12, PX + 0.12, yf + 0.028, yf + 0.032, top + 0.012, top + 0.028, M_SLOT))
    return out

def laser(aio_):
    w, d = 0.43, 0.43
    x0, x1 = PX - w / 2, PX + w / 2
    yf = YB - d
    M_B = plastic("las_body", (0.84, 0.84, 0.83), 0.45)
    M_A = plastic("las_accent", (0.28, 0.29, 0.3), 0.42)
    out = []
    body_top = DZ + (0.24 if aio_ else 0.28)
    out.append(box("las_body", x0, x1, yf + 0.004, YB, DZ + 0.008, body_top, M_B, bevel=0.012, segs=5))
    # papierlade onderin met greep en naden
    out.append(box("las_drawer", x0 + 0.012, x1 - 0.012, yf - 0.002, yf + 0.01, DZ + 0.015, DZ + 0.105, M_B, bevel=0.005, segs=3))
    out.append(box("las_drawer_seam", x0 + 0.01, x1 - 0.01, yf + 0.001, yf + 0.006, DZ + 0.105, DZ + 0.109, M_SEAM))
    out.append(box("las_grip", PX - 0.06, PX + 0.06, yf - 0.004, yf + 0.002, DZ + 0.085, DZ + 0.097, M_SLOT, bevel=0.004))
    out.append(box("las_frontpanel", x0 + 0.02, x1 - 0.02, yf - 0.001, yf + 0.004, DZ + 0.13, body_top - 0.02, M_B, bevel=0.004))
    out.append(box("las_frontseam", x0 + 0.02, x1 - 0.02, yf - 0.002, yf + 0.003, DZ + 0.125, DZ + 0.128, M_SEAM))
    for fx in (x0 + 0.04, x1 - 0.04):
        for fy in (yf + 0.04, YB - 0.04):
            out.append(cyl("las_foot", 0.012, DZ, DZ + 0.008, fx, fy, M_SEAM, 16))
    out.append(cyl("las_pwr", 0.006, 0, 0.003, 0, 0, M_PWR, 24))
    out[-1].rotation_euler = (math.radians(90), 0, 0); out[-1].location = (x1 - 0.035, yf - 0.002, DZ + 0.16)
    if aio_:
        # uitvoerruimte onder de scanner: vloer + zijkolom rechts + achterwand
        out.append(box("las_out_floor", x0 + 0.01, x1 - 0.07, yf + 0.03, YB - 0.02, body_top - 0.004, body_top + 0.002, M_A, bevel=0.003))
        out.append(box("las_column", x1 - 0.07, x1, yf + 0.004, YB, body_top - 0.01, DZ + 0.31, M_B, bevel=0.01, segs=4))
        out.append(box("las_back", x0, x1, YB - 0.07, YB, body_top - 0.01, DZ + 0.31, M_B, bevel=0.006))
        out.append(box("las_scan", x0 + 0.002, x1 - 0.002, yf + 0.006, YB, DZ + 0.305, DZ + 0.35, M_B, bevel=0.012, segs=5))
        out.append(box("las_scan_seam", x0 + 0.01, x1 - 0.01, yf + 0.006, YB - 0.01, DZ + 0.302, DZ + 0.306, M_SEAM))
        # documentinvoer (ADF) bovenop
        out.append(box("las_adf", x0 + 0.01, x1 - 0.01, yf + 0.03, YB - 0.004, DZ + 0.35, DZ + 0.405, M_B, bevel=0.012, segs=4))
        out.append(box("las_adf_hood", x0 + 0.02, x0 + 0.13, yf + 0.03, YB - 0.01, DZ + 0.4, DZ + 0.415, M_A, bevel=0.008, segs=3))
        out.append(box("las_adf_tray", x0 + 0.13, x1 - 0.03, yf + 0.08, YB - 0.02, DZ + 0.405, DZ + 0.41, M_A, bevel=0.003))
        out.append(box("las_adf_paper", x0 + 0.16, x1 - 0.05, yf + 0.09, YB - 0.03, DZ + 0.41, DZ + 0.414, M_PAPER))
        # schuin touchscreen vooraan
        pz = DZ + 0.315
        panel = [box("las_panel", PX + 0.04, PX + 0.17, yf - 0.045, yf + 0.004, pz, pz + 0.012, plastic("las_pnl", (0.06, 0.06, 0.065), 0.35), bevel=0.006, segs=3),
                 box("las_touch", PX + 0.05, PX + 0.16, yf - 0.04, yf - 0.004, pz + 0.012, pz + 0.0135, M_LCD)]
        rot_x(panel, (0, yf, pz), 22)
        out += panel
    else:
        # uitvoerbak in de bovenkant + klein bedieningspaneel rechts
        out.append(box("las_bin", PX - 0.13, PX + 0.07, yf + 0.06, YB - 0.1, body_top - 0.012, body_top + 0.001, M_A, bevel=0.004))
        out.append(box("las_bin_flap", PX - 0.08, PX + 0.02, yf + 0.058, yf + 0.062, body_top, body_top + 0.035, M_A, bevel=0.002))
        out.append(box("las_panel", PX + 0.1, x1 - 0.02, yf + 0.03, yf + 0.13, body_top - 0.002, body_top + 0.006, M_A, bevel=0.004))
        out.append(box("las_lcd", PX + 0.11, x1 - 0.03, yf + 0.045, yf + 0.09, body_top + 0.006, body_top + 0.0075, M_LCD))
    return out

if kind in ("thuis", "foto"):
    part = "tank" if lay.startswith("tank-") else "adf" if lay.startswith("adf-") else "body"
    prn = inkjet(kind, aio or part == "adf", part)
elif kind == "zakelijk":
    prn = laser(aio)
if prn:
    lap = prn

if A.layer != "none":
    keep = set(o.name for o in lap)
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name not in keep:
            if o.name.startswith("chair"):
                o.is_holdout = True
            else:
                o.is_shadow_catcher = True
    scene.render.film_transparent = True


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
cam_d.shift_x = -0.12; cam_d.shift_y = -0.14
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam)
CAM_Y = -2.15; CAM_Z = 1.25
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
