"""Bijkeuken-scene voor de wasdroger-keuzehulp test: wasmachine onderop, stapelkit,
warmtepompdroger erbovenop (gebouwd op de wasmachine-scene).

Aanroep:
  blender -b --factory-startup -P scene.py -- --assets DIR --d 1.3 --light day --type none
          --layer none|wd-7|wd-9|wd-10|mand1|mand2|mand3 --res 2000 --samples 256
          --out render.png --json cam.json

--layer none = de ruimte met de wasmachine; elke andere laag rendert alleen dat object
met transparante achtergrond (de rest wordt shadow catcher).
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

# ── bijkeuken (droger): wasmachine met stapelkit en wasdroger erop, hoge kast, plank met handdoeken, wasmanden ──
# --layer none | wd-7|wd-9|wd-10 | mand1|mand2|mand3  (de wasmachine eronder is vast decor)
from mathutils import Matrix
M_FLOOR_T = pbr("floor_t", "concrete_tiles_02", 1.3, tint=(1.85, 1.75, 1.6), tint_mix=1.0, bump=0.35, rough_add=0.1)
for o in list(bpy.data.objects):
    if o.name == "floor":
        o.data.materials.clear(); o.data.materials.append(M_FLOOR_T)

def mat(name, color, rough=0.4, metal=0.0, coat=0.0, grain=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links; b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; b.inputs["Coat Weight"].default_value = coat
    if grain:
        tc = N.new("ShaderNodeTexCoord"); nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1200
        bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = grain; bu.inputs["Distance"].default_value = 0.0004
        L.new(tc.outputs["Object"], nz.inputs["Vector"]); L.new(nz.outputs["Fac"], bu.inputs["Height"]); L.new(bu.outputs["Normal"], b.inputs["Normal"])
    return m

M_ENAMEL = mat("enamel", (0.86, 0.86, 0.85), 0.22, coat=0.4)
M_TOPSLAB = mat("topslab", (0.84, 0.84, 0.83), 0.45, grain=0.08)
M_PANEL = mat("wpanel", (0.8, 0.8, 0.8), 0.3, coat=0.3)
M_BLACKGLASS = mat("blackglass", (0.01, 0.01, 0.012), 0.05, coat=1.0)
M_CHROME = mat("chrome", (0.8, 0.8, 0.82), 0.12, metal=1.0)
M_SILVER = mat("silver", (0.62, 0.63, 0.65), 0.3, metal=0.8)
M_RUBBER = mat("rubber", (0.06, 0.06, 0.065), 0.65)
M_SEAM = mat("wseam", (0.12, 0.12, 0.13), 0.7)
M_DRUM = bpy.data.materials.new("drum"); M_DRUM.use_nodes = True
_N = M_DRUM.node_tree.nodes; _L = M_DRUM.node_tree.links; _b = _N["Principled BSDF"]
_b.inputs["Metallic"].default_value = 1.0; _b.inputs["Roughness"].default_value = 0.22
_v = _N.new("ShaderNodeTexVoronoi"); _v.inputs["Scale"].default_value = 75; _v.feature = "F1"
_c = _N.new("ShaderNodeMath"); _c.operation = "LESS_THAN"; _c.inputs[1].default_value = 0.2
_tc = _N.new("ShaderNodeTexCoord"); _L.new(_tc.outputs["Object"], _v.inputs["Vector"])
_L.new(_v.outputs["Distance"], _c.inputs[0])
_mx = _N.new("ShaderNodeMix"); _mx.data_type = "RGBA"; _mx.inputs[6].default_value = (0.85, 0.86, 0.88, 1); _mx.inputs[7].default_value = (0.03, 0.03, 0.03, 1)
_L.new(_c.outputs[0], _mx.inputs[0]); _L.new(_mx.outputs[2], _b.inputs["Base Color"])
M_GLASS_D = bpy.data.materials.new("doorglass"); M_GLASS_D.use_nodes = True
_g = M_GLASS_D.node_tree.nodes["Principled BSDF"]
_g.inputs["Base Color"].default_value = (0.78, 0.8, 0.84, 1); _g.inputs["Roughness"].default_value = 0.02
_g.inputs["Transmission Weight"].default_value = 1.0; _g.inputs["IOR"].default_value = 1.45
M_FRAME = mat("doorframe", (0.03, 0.031, 0.034), 0.38)
M_LCD_W = flat("wlcd", (0.01, 0.01, 0.012), 0.05)

# ── vast decor: hoge kast links, plank met handdoeken en plant, fles wasmiddel ──
M_LAKW = pbr("lakw", "white_oak_veneer", 0.7, base=(0.40, 0.22, 0.125), var=0.16, bump=0.02, rough_add=0.3)
M_OAKW = pbr("oakw", "white_oak_veneer", 0.8, base=(0.46, 0.34, 0.22), var=0.22, bump=0.03, rough_add=0.2)
box("tall_cab", -1.2, -0.62, -0.6, 0, 0, 2.1, M_LAKW, bevel=0.003)
box("tall_cab_seam", -0.912, -0.908, -0.602, -0.598, 0.05, 2.08, M_SEAM)
box("tall_cab_seam2", -1.18, -0.64, -0.602, -0.598, 1.3, 1.304, M_SEAM)
for gx0, gx1 in ((-1.19, -0.915), (-0.905, -0.63)):   # greeplijst boven de onderdeuren
    box("tall_grip", gx0, gx1, -0.605, -0.598, 1.255, 1.3, M_DARK)
append_model("potted_plant_01", (-1.55, -0.35, 0), 0.6, 0.9)
box("tall_plinth", -1.2, -0.62, -0.55, 0, 0, 0.06, M_DARK)
box("shelf_w", 0.5, 1.4, -0.26, 0, 1.36, 1.39, M_OAKW, bevel=0.003)
towel_cols = [(0.72, 0.68, 0.6), (0.36, 0.42, 0.33), (0.82, 0.8, 0.76)]
for s_, sx in enumerate((0.63, 0.87)):
    for i in range(3):
        c = towel_cols[(i + s_) % 3]
        t_ = box("towel", sx - 0.14 + 0.004 * i, sx + 0.14 - 0.004 * i, -0.23, -0.03, 1.39 + i * 0.045, 1.39 + (i + 1) * 0.045 - 0.003,
                 pbr(f"tw{s_}{i}", "knitted_fleece", 0.15, base=c, var=0.15, bump=0.9, sheen=0.6, rough_add=0.3), bevel=0.018, segs=4)
append_model("potted_plant_04", (1.23, -0.13, 1.39), 0.4, 1.1)
bot = cyl("bottle", 0.045, 1.39, 1.58, 1.09, -0.12, mat("bottle", (0.95, 0.95, 0.93), 0.3, coat=0.5), 48, bevel=0.012)
cyl("bottle_cap", 0.022, 1.58, 1.61, 1.09, -0.12, mat("cap", (0.36, 0.42, 0.33), 0.4), 32, bevel=0.004)

WM = []
lay = A.layer

def ring(name, cx, cy, cz, r_major, r_minor, mat_, flat_y=0.45):
    bpy.ops.mesh.primitive_torus_add(major_radius=r_major, minor_radius=r_minor, major_segments=96, minor_segments=16, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = name
    o.data.transform(Matrix.Scale(flat_y, 4, (0, 0, 1)))
    o.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
    o.location = (cx, cy, cz)
    o.data.materials.append(mat_)
    for p in o.data.polygons: p.use_smooth = True
    return o

def disc(name, r, y0, y1, cx, cz, mat_, verts=96):
    o = cyl(name, r, 0, y1 - y0, 0, 0, mat_, verts)
    o.data.transform(Matrix.Rotation(math.radians(-90), 4, "X"))
    o.location = (cx, (y0 + y1) / 2, cz)
    return o

def dome(name, r, depth, cx, cy, cz, mat_):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = name
    o.data.transform(Matrix.Diagonal((r, depth, r, 1)))
    o.location = (cx, cy, cz)
    o.data.materials.append(mat_)
    for p in o.data.polygons: p.use_smooth = True
    return o

def frontloader(depth, door_r):
    w, h = 0.60, 0.85
    x0, x1 = -w / 2, w / 2
    yb = -0.03; yf = yb - depth
    out = []
    body = box("wm_body", x0, x1, yf + 0.006, yb, 0.035, h - 0.02, M_ENAMEL, bevel=0.018, segs=6)
    # ronde opening in de voorkant, zodat je door het glas de trommel ziet
    cut = cyl("wm_cut", door_r - 0.06, 0, 0.2, 0, 0, M_ENAMEL, 96)
    cut.data.transform(Matrix.Rotation(math.radians(-90), 4, "X")); cut.location = (0, yf + 0.05, 0.40)
    bo = body.modifiers.new("hole", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cut; bo.solver = "EXACT"
    bpy.context.view_layer.objects.active = body
    for m_ in list(body.modifiers):
        bpy.ops.object.modifier_apply(modifier=m_.name)
    bpy.data.objects.remove(cut)
    out.append(body)
    out.append(box("wm_top", x0 - 0.002, x1 + 0.002, yf + 0.002, yb, h - 0.022, h, M_TOPSLAB, bevel=0.006, segs=3))
    # plint met naad en onderhoudsluikje, stelvoetjes
    out.append(box("wm_kick", x0 + 0.01, x1 - 0.01, yf + 0.004, yf + 0.03, 0.035, 0.11, M_ENAMEL, bevel=0.004))
    out.append(box("wm_kick_seam", x0 + 0.012, x1 - 0.012, yf + 0.003, yf + 0.008, 0.108, 0.112, M_SEAM))
    out.append(box("wm_hatch", 0.16, 0.27, yf + 0.002, yf + 0.006, 0.045, 0.098, M_ENAMEL, bevel=0.004))
    out.append(box("wm_hatch_seam", 0.158, 0.272, yf + 0.004, yf + 0.0055, 0.043, 0.1, M_SEAM))
    for fx in (x0 + 0.04, x1 - 0.04):
        for fy in (yf + 0.04, yb - 0.04):
            out.append(cyl("wm_foot", 0.018, 0, 0.035, fx, fy, M_RUBBER, 24))
    # bedieningsstrook
    bz0, bz1 = 0.69, 0.81
    out.append(box("wm_band", x0 + 0.006, x1 - 0.006, yf - 0.002, yf + 0.01, bz0, bz1, M_PANEL, bevel=0.006, segs=3))
    out.append(box("wm_band_seam", x0 + 0.006, x1 - 0.006, yf - 0.001, yf + 0.004, bz0 - 0.005, bz0 - 0.002, M_SEAM))
    # zeeplade links met greepuitsparing en vakverdeling
    out.append(box("wm_drawer", x0 + 0.02, x0 + 0.2, yf - 0.006, yf, bz0 + 0.012, bz1 - 0.012, M_ENAMEL, bevel=0.005, segs=3))
    out.append(box("wm_drawer_grip", x0 + 0.05, x0 + 0.17, yf - 0.0065, yf - 0.004, bz0 + 0.014, bz0 + 0.024, M_SEAM, bevel=0.003))
    # programmaknop met chromen rand, indicatorstreep en streepjes rondom
    kx, kz = -0.02, (bz0 + bz1) / 2
    out.append(disc("wm_knob_rim", 0.038, yf - 0.02, yf, kx, kz, M_CHROME))
    out.append(disc("wm_knob", 0.032, yf - 0.03, yf - 0.018, kx, kz, M_ENAMEL))
    out.append(box("wm_knob_ind", kx - 0.002, kx + 0.002, yf - 0.031, yf - 0.029, kz + 0.012, kz + 0.028, M_SEAM))
    for i in range(14):
        a = math.radians(-120 + i * (240 / 13))
        tx, tz = kx + math.sin(a) * 0.05, kz + math.cos(a) * 0.05
        out.append(box("wm_tick", tx - 0.0012, tx + 0.0012, yf - 0.003, yf - 0.0015, tz - 0.004, tz + 0.004, M_SEAM))
    # display (inhoud tekent de pagina) + knoppen
    out.append(box("wm_dpanel", 0.045, x1 - 0.02, yf - 0.003, yf, bz0 + 0.015, bz1 - 0.015, M_FRAME, bevel=0.004))
    out.append(box("wm_display", 0.07, 0.2, yf - 0.004, yf - 0.001, kz - 0.022, kz + 0.022, M_BLACKGLASS, bevel=0.003))
    for i in range(3):
        bx = 0.215 + i * 0.024
        out.append(box("wm_btn", bx, bx + 0.016, yf - 0.0045, yf - 0.002, kz - 0.008, kz + 0.008, M_SILVER, bevel=0.004, segs=3))
        out.append(box("wm_btn_dot", bx + 0.006, bx + 0.01, yf - 0.0055, yf - 0.005, kz + 0.01, kz + 0.013, M_SEAM))
    out.append(box("wm_logo", x0 + 0.03, x0 + 0.1, yf - 0.001, yf + 0.001, 0.64, 0.652, M_SILVER))
    # deur: ring, bolle getinte glazen koepel, manchet, trommel erachter
    dz = 0.40
    out.append(ring("wm_door_ring", 0, yf - 0.02, dz, door_r - 0.018, 0.02, M_CHROME, 0.8))
    out.append(ring("wm_door_frame", 0, yf - 0.03, dz, door_r - 0.05, 0.032, M_FRAME, 0.9))
    out.append(ring("wm_door_inner", 0, yf - 0.035, dz, door_r - 0.08, 0.008, M_SILVER, 0.8))
    out.append(dome("wm_glass", door_r - 0.07, 0.05, 0, yf - 0.005, dz, M_GLASS_D))
    out.append(ring("wm_gasket", 0, yf + 0.01, dz, door_r - 0.085, 0.022, M_RUBBER, 1.0))
    drum = disc("wm_drum", door_r - 0.09, yf + 0.25, yf + 0.26, 0, dz, M_DRUM)
    out.append(drum)
    tube = cyl("wm_drum_side", door_r - 0.09, 0, 0.24, 0, 0, M_DRUM, 64)
    tube.data.transform(Matrix.Rotation(math.radians(-90), 4, "X")); tube.location = (0, yf + 0.13, dz)
    out.append(tube)
    # binnenlampje in de trommel (onzichtbaar), anders is de trommel zwart
    bpy.ops.object.light_add(type="POINT", location=(0, yf + 0.12, dz + 0.05))
    dl = bpy.context.active_object; dl.data.energy = 14; dl.data.shadow_soft_size = 0.08
    dl.data.color = (1.0, 0.95, 0.88)
    dl.visible_camera = False; dl.visible_glossy = False; dl.visible_transmission = False
    for k in range(3):   # meenemers in de trommel
        a = math.radians(90 + k * 120)
        px, pz = math.cos(a) * (door_r - 0.105), math.sin(a) * (door_r - 0.105)
        out.append(box("wm_paddle", px - 0.012, px + 0.012, yf + 0.02, yf + 0.25, dz + pz - 0.012, dz + pz + 0.012, M_SILVER, bevel=0.008))
    # greep rechts in de ring
    out.append(box("wm_handle", door_r - 0.02, door_r + 0.004, yf - 0.05, yf - 0.02, dz - 0.05, dz + 0.05, M_SILVER, bevel=0.01, segs=4))
    return out

M_GLASS_T = bpy.data.materials.new("smokeglass"); M_GLASS_T.use_nodes = True
_g2 = M_GLASS_T.node_tree.nodes["Principled BSDF"]
_g2.inputs["Base Color"].default_value = (0.5, 0.51, 0.53, 1); _g2.inputs["Roughness"].default_value = 0.03
_g2.inputs["Transmission Weight"].default_value = 1.0; _g2.inputs["IOR"].default_value = 1.5
M_DRUM2 = mat("drum2", (0.75, 0.76, 0.78), 0.28, metal=1.0, grain=0.4)
M_LINT = mat("lint", (0.72, 0.73, 0.74), 0.5)

def dryer(depth, door_r, z0=0.0):
    """Warmtepompdroger: rookglazen deur met pluizenfilter, condenswaterbak linksboven,
    brede onderklep voor de warmtewisselaar. Gebouwd op z=0 en daarna z0 omhoog."""
    w, h = 0.60, 0.85
    x0, x1 = -w / 2, w / 2
    yb = -0.03; yf = yb - depth
    out = []
    body = box("wd_body", x0, x1, yf + 0.006, yb, 0.035, h - 0.02, M_ENAMEL, bevel=0.018, segs=6)
    dz = 0.42
    cut = cyl("wd_cut", door_r - 0.05, 0, 0.2, 0, 0, M_ENAMEL, 96)
    cut.data.transform(Matrix.Rotation(math.radians(-90), 4, "X")); cut.location = (0, yf + 0.05, dz)
    bo = body.modifiers.new("hole", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cut; bo.solver = "EXACT"
    bpy.context.view_layer.objects.active = body
    for m_ in list(body.modifiers):
        bpy.ops.object.modifier_apply(modifier=m_.name)
    bpy.data.objects.remove(cut)
    out.append(body)
    out.append(box("wd_top", x0 - 0.002, x1 + 0.002, yf + 0.002, yb, h - 0.022, h, M_TOPSLAB, bevel=0.006, segs=3))
    # onderklep over de hele breedte (warmtewisselaar) met greepsleuf en naden
    out.append(box("wd_flap", x0 + 0.012, x1 - 0.012, yf - 0.002, yf + 0.02, 0.04, 0.15, M_ENAMEL, bevel=0.005))
    out.append(box("wd_flap_seam", x0 + 0.012, x1 - 0.012, yf - 0.0025, yf + 0.004, 0.148, 0.152, M_SEAM))
    out.append(box("wd_flap_seam2", x0 + 0.012, x1 - 0.012, yf - 0.0025, yf + 0.004, 0.038, 0.042, M_SEAM))
    out.append(box("wd_flap_grip", x0 + 0.04, x0 + 0.14, yf - 0.003, yf, 0.05, 0.058, M_SEAM, bevel=0.002))
    for fx in (x0 + 0.04, x1 - 0.04):
        for fy in (yf + 0.04, yb - 0.04):
            out.append(cyl("wd_foot", 0.018, 0, 0.035, fx, fy, M_RUBBER, 24))
    # bedieningsstrook: condenswaterbak links, knop, display, toetsen
    bz0, bz1 = 0.70, 0.81
    out.append(box("wd_band", x0 + 0.006, x1 - 0.006, yf - 0.002, yf + 0.01, bz0, bz1, M_PANEL, bevel=0.006, segs=3))
    out.append(box("wd_band_seam", x0 + 0.006, x1 - 0.006, yf - 0.001, yf + 0.004, bz0 - 0.005, bz0 - 0.002, M_SEAM))
    out.append(box("wd_tank", x0 + 0.02, x0 + 0.22, yf - 0.006, yf, bz0 + 0.012, bz1 - 0.012, M_ENAMEL, bevel=0.005, segs=3))
    out.append(box("wd_tank_grip", x0 + 0.06, x0 + 0.18, yf - 0.0065, yf - 0.004, bz0 + 0.014, bz0 + 0.024, M_SEAM, bevel=0.003))
    out.append(box("wd_tank_drop", x0 + 0.03, x0 + 0.046, yf - 0.0068, yf - 0.006, bz1 - 0.035, bz1 - 0.02, M_FRAME, bevel=0.004))
    kx, kz = 0.0, (bz0 + bz1) / 2
    out.append(disc("wd_knob_rim", 0.036, yf - 0.02, yf, kx, kz, M_CHROME))
    out.append(disc("wd_knob", 0.03, yf - 0.03, yf - 0.018, kx, kz, M_ENAMEL))
    out.append(box("wd_knob_ind", kx - 0.002, kx + 0.002, yf - 0.031, yf - 0.029, kz + 0.011, kz + 0.026, M_SEAM))
    for i in range(12):
        a = math.radians(-120 + i * (240 / 11))
        tx, tz = kx + math.sin(a) * 0.047, kz + math.cos(a) * 0.047
        out.append(box("wd_tick", tx - 0.0012, tx + 0.0012, yf - 0.003, yf - 0.0015, tz - 0.004, tz + 0.004, M_SEAM))
    out.append(box("wd_dpanel", 0.06, x1 - 0.02, yf - 0.003, yf, bz0 + 0.013, bz1 - 0.013, M_FRAME, bevel=0.004))
    out.append(box("wd_display", 0.08, 0.2, yf - 0.004, yf - 0.001, kz - 0.021, kz + 0.021, M_BLACKGLASS, bevel=0.003))
    for i in range(3):
        bx = 0.215 + i * 0.022
        out.append(box("wd_btn", bx, bx + 0.015, yf - 0.0045, yf - 0.002, kz - 0.008, kz + 0.008, M_SILVER, bevel=0.004, segs=3))
    out.append(box("wd_logo", x0 + 0.03, x0 + 0.1, yf - 0.001, yf + 0.001, 0.65, 0.662, M_SILVER))
    # deur: chromen ring, donkere rand, plat rookglas; erachter een gladde RVS-trommel
    out.append(ring("wd_door_ring", 0, yf - 0.02, dz, door_r - 0.018, 0.02, M_CHROME, 0.8))
    out.append(ring("wd_door_frame", 0, yf - 0.03, dz, door_r - 0.05, 0.032, M_FRAME, 0.9))
    out.append(dome("wd_glass", door_r - 0.07, 0.022, 0, yf - 0.02, dz, M_GLASS_T))
    out.append(ring("wd_opening", 0, yf + 0.006, dz, door_r - 0.058, 0.01, M_SILVER, 1.0))
    # pluizenfilter onderin de vulopening
    out.append(box("wd_lint", -0.11, 0.11, yf + 0.012, yf + 0.05, dz - door_r + 0.075, dz - door_r + 0.12, M_LINT, bevel=0.008))
    out.append(box("wd_lint_tab", -0.03, 0.03, yf + 0.008, yf + 0.014, dz - door_r + 0.1, dz - door_r + 0.125, M_SEAM, bevel=0.003))
    out.append(disc("wd_drum", door_r - 0.06, yf + 0.33, yf + 0.34, 0, dz, M_DRUM2))
    tube = cyl("wd_drum_side", door_r - 0.06, 0, 0.32, 0, 0, M_DRUM2, 64)
    tube.data.transform(Matrix.Rotation(math.radians(-90), 4, "X")); tube.location = (0, yf + 0.18, dz)
    out.append(tube)
    for k in range(3):
        a = math.radians(90 + k * 120)
        px, pz = math.cos(a) * (door_r - 0.08), math.sin(a) * (door_r - 0.08)
        out.append(box("wd_paddle", px - 0.014, px + 0.014, yf + 0.04, yf + 0.33, dz + pz - 0.014, dz + pz + 0.014, M_SILVER, bevel=0.01))
    out.append(box("wd_handle", door_r - 0.02, door_r + 0.004, yf - 0.05, yf - 0.02, dz - 0.05, dz + 0.05, M_SILVER, bevel=0.01, segs=4))
    bpy.ops.object.light_add(type="POINT", location=(0, yf + 0.15, dz + 0.05))
    dl = bpy.context.active_object; dl.data.energy = 22; dl.data.shadow_soft_size = 0.08
    dl.data.color = (1.0, 0.95, 0.88)
    dl.visible_camera = False; dl.visible_glossy = False; dl.visible_transmission = False
    for o in out + [dl]:
        o.location.z += z0
    return out

# stapelkit: dun frame met uittrekbaar legplankje tussen wasmachine en droger
def stackkit(yf_):
    return [box("sk_frame", -0.302, 0.302, yf_ + 0.01, -0.035, 0.85, 0.872, M_PANEL, bevel=0.004),
            box("sk_shelf", -0.2, 0.2, yf_ - 0.004, yf_ + 0.01, 0.855, 0.868, M_ENAMEL, bevel=0.003),
            box("sk_grip", -0.06, 0.06, yf_ - 0.005, yf_ - 0.003, 0.858, 0.864, M_SEAM)]


def toploader():
    w, h, d = 0.40, 0.90, 0.60
    x0, x1 = -w / 2, w / 2
    yb = -0.03; yf = yb - d
    out = [box("tl_body", x0, x1, yf, yb, 0.035, h - 0.03, M_ENAMEL, bevel=0.016, segs=6),
           box("tl_top", x0, x1, yf, yb, h - 0.032, h, M_TOPSLAB, bevel=0.01, segs=4),
           box("tl_lid", x0 + 0.03, x1 - 0.03, yf + 0.04, yb - 0.17, h - 0.001, h + 0.006, M_PANEL, bevel=0.008, segs=3),
           box("tl_lid_grip", -0.07, 0.07, yf + 0.035, yf + 0.05, h + 0.003, h + 0.012, M_SEAM, bevel=0.004),
           box("tl_panel", x0 + 0.01, x1 - 0.01, yb - 0.16, yb, h, h + 0.05, M_PANEL, bevel=0.01, segs=3),
           box("tl_display", -0.06, 0.08, yb - 0.161, yb - 0.159, h + 0.012, h + 0.036, M_BLACKGLASS),
           box("tl_kick", x0 + 0.01, x1 - 0.01, yf - 0.002, yf + 0.02, 0.035, 0.11, M_ENAMEL, bevel=0.004),
           box("tl_kick_seam", x0 + 0.012, x1 - 0.012, yf - 0.003, yf + 0.002, 0.108, 0.112, M_SEAM),
           box("tl_logo", -0.04, 0.04, yf - 0.001, yf + 0.001, h - 0.08, h - 0.07, M_SILVER)]
    k = disc("tl_knob", 0.026, yb - 0.172, yb - 0.158, x0 + 0.06, h + 0.025, M_CHROME)
    out.append(k)
    for fx in (x0 + 0.04, x1 - 0.04):
        for fy in (yf + 0.04, yb - 0.04):
            out.append(cyl("tl_foot", 0.018, 0, 0.035, fx, fy, M_RUBBER, 24))
    return out

def basket(name, cx, cy, fill_cols, rot=0.3):
    # echte rieten mand (Poly Haven), 1.8x = ca. 40 cm; was erin via een doeksimulatie
    objs = append_model("wicker_basket_02", (cx, cy, 0.038), rot, 1.8)
    out = []
    for o in objs:
        if "lid" in o.name:
            bpy.data.objects.remove(o)
        elif o.type == "MESH":
            out.append(o)
            cm = o.modifiers.new("col", "COLLISION"); o.collision.thickness_outer = 0.015
    fl = bpy.data.objects.get("floor")
    if fl: fl.modifiers.new("col", "COLLISION")
    cloths = []
    for i, c in enumerate(fill_cols):
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=44, y_subdivisions=44, size=0.46,
                                        location=(cx + ((i % 3) - 1) * 0.05, cy + ((i * 5) % 3 - 1) * 0.04, 0.5 + i * 0.08))
        o = bpy.context.active_object; o.name = f"{name}_cloth{i}"
        o.rotation_euler = (math.radians(8 * (i - 1)), math.radians(-6 + 7 * i), math.radians(25 + 40 * i))
        cl = o.modifiers.new("cloth", "CLOTH"); st = cl.settings
        st.quality = 6; st.mass = 0.2; st.tension_stiffness = 6; st.compression_stiffness = 6
        st.bending_stiffness = 0.08; st.air_damping = 1.5
        cl.collision_settings.use_self_collision = True; cl.collision_settings.distance_min = 0.012
        cl.collision_settings.self_distance_min = 0.004
        cl.point_cache.frame_start = 1; cl.point_cache.frame_end = 90
        o.data.materials.append(pbr(f"cloth{name}{i}", "rough_linen", 0.15, base=c, var=0.25, bump=0.6, sheen=0.0, rough_add=0.25))
        cloths.append(o)
    scene.frame_start = 1; scene.frame_end = 90
    for f in range(1, 91):
        scene.frame_set(f)
    for o in cloths:
        bpy.context.view_layer.objects.active = o
        for m_ in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m_.name)
        so_ = o.modifiers.new("th", "SOLIDIFY"); so_.thickness = 0.007
        o.modifiers.new("ss", "SUBSURF").levels = 1
        for p in o.data.polygons: p.use_smooth = True
        out.append(o)
    scene.frame_set(1)
    for o in out:
        for m_ in [m_ for m_ in o.modifiers if m_.type == "COLLISION"]:
            o.modifiers.remove(m_)
    if fl:
        for m_ in [m_ for m_ in fl.modifiers if m_.type == "COLLISION"]:
            fl.modifiers.remove(m_)
    return out

# vast decor: 9 kg-wasmachine onderop met stapelkit (in elke render; in de lagen schaduwvanger)
frontloader(0.58, 0.23)
stackkit(-0.03 - 0.58)
ZD = 0.872
if lay in ("wd-7", "wd-9", "wd-10"):
    depth, door_r = {"wd-7": (0.58, 0.225), "wd-9": (0.62, 0.235), "wd-10": (0.66, 0.245)}[lay]
    WM = dryer(depth, door_r, ZD)
elif lay == "mand1":
    WM = basket("m1", 0.55, -0.38, [(0.1, 0.17, 0.3), (0.8, 0.78, 0.73), (0.5, 0.24, 0.15), (0.28, 0.35, 0.26)])
elif lay == "mand2":
    WM = basket("m2", 0.93, -0.38, [(0.78, 0.76, 0.7), (0.3, 0.36, 0.27), (0.12, 0.12, 0.13), (0.6, 0.45, 0.35)])
elif lay == "mand3":
    WM = basket("m3", 1.31, -0.4, [(0.55, 0.26, 0.17), (0.82, 0.8, 0.75), (0.1, 0.17, 0.3), (0.62, 0.58, 0.5)])

if lay != "none" and WM:
    keep = set(o.name for o in WM)
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name not in keep:
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
fr_ = light("fill_r", "AREA", (1.7, -1.3, 2.3), 45, (1.0, 0.97, 0.93), target=(1.2, 0, 0.6), sx=1.2, sy=1.2)
fr_.visible_camera = False
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.4; sun.angle = math.radians(7)
sun.color = (1.0, 0.92, 0.82)
so = bpy.data.objects.new("sun", sun); scene.collection.objects.link(so)
Ld = Vector((0.6, 0.6, -0.35)).normalized()
so.rotation_euler = (-Ld).to_track_quat("Z", "Y").to_euler()


# ───────────────────────── camera ─────────────────────────
cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 22; cam_d.sensor_width = 36; cam_d.sensor_fit = "HORIZONTAL"
cam_d.shift_x = -0.08; cam_d.shift_y = -0.075
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam)
CAM_Y = -3.3; CAM_Z = 1.35
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
