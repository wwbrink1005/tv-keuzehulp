"""Keuken-scene voor de vaatwasser-keuzehulp test (gebouwd op de koelkast-keuken).

Aanroep:
  blender -b --factory-startup -P scene.py -- --assets DIR --d 1.3 --light day --type standaard
          --finish rvs --layer none|kast|ib-dicht|ib-kier|ib-open-{klein,gemiddeld,groot}|
                               vs-dicht|vs-open-{klein,gemiddeld,groot}
          --res 2000 --samples 256 --out render.png --json cam.json

--layer none = de keuken met een lege nis rechts in het keukenblok; elke andere laag
rendert alleen dat object met transparante achtergrond (de rest wordt shadow catcher).
ib = inbouw achter een keukenfront in de nis, vs = vrijstaand naast de koelkast.
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

# ── onderkasten + werkblad ──
CD = 0.62                 # diepte keukenblok
X0 = ROOM_X0              # keuken begint tegen de linkermuur
XK = -0.3                 # einde van het keukenblok (60 cm nis voor de vaatwasser)
XE = XK
TOP_Z = 0.9
if KTYPE == "tafelmodel" or (KTYPE == "inbouw" and A.nis <= 95):
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

# ── koelkast ──
from mathutils import Matrix
OPEN = A.open == 1
NIS = A.nis
M_TRIM = flat("trim", (0.35, 0.36, 0.37), 0.4)
M_CLEAR = bpy.data.materials.new("clear"); M_CLEAR.use_nodes = True
_cb = M_CLEAR.node_tree.nodes["Principled BSDF"]
_cb.inputs["Base Color"].default_value = (0.9, 0.95, 0.97, 1); _cb.inputs["Roughness"].default_value = 0.15
_cb.inputs["Transmission Weight"].default_value = 0.85
M_SCR = flat("scr", (0.1, 0.1, 0.1), 0.3, emission=(0.55, 0.75, 1.0), estrength=0.8)

def swing(objs, hinge, deg):
    """Draai objecten (in gesloten stand gemodelleerd) om een verticale scharnieras."""
    hv = Vector(hinge)
    for o in objs:
        o.data.transform(Matrix.Translation(o.location - hv))
        o.location = hv
        o.rotation_euler = (0, 0, math.radians(deg))

def interior(x0, x1, yf, yb, z0, z1, light=True):
    """Holle, verlichte binnenkant: wanden, glazen schappen, groentelades."""
    t = 0.015
    box("liner_back", x0, x1, yb - t, yb, z0, z1, M_LINER)
    box("liner_l", x0, x0 + t, yf, yb, z0, z1, M_LINER)
    box("liner_r", x1 - t, x1, yf, yb, z0, z1, M_LINER)
    box("liner_bot", x0, x1, yf, yb, z0, z0 + 0.02, M_LINER)
    box("liner_top", x0, x1, yf, yb, z1 - 0.02, z1, M_LINER)
    h = z1 - z0
    drawer_h = min(0.26, h * 0.28) if h > 0.5 else 0
    if drawer_h:
        xm = (x0 + x1) / 2
        for (a, b) in ((x0 + t + 0.005, xm - 0.004), (xm + 0.004, x1 - t - 0.005)):
            box("drawer", a, b, yf + 0.01, yb - 0.03, z0 + 0.025, z0 + 0.025 + drawer_h, M_CLEAR, bevel=0.01, segs=3)
            box("drawer_grip", a + 0.02, b - 0.02, yf + 0.005, yf + 0.02, z0 + drawer_h - 0.04, z0 + drawer_h, M_TRIM, bevel=0.004)
    zs0 = z0 + drawer_h + 0.05
    n = max(1, int((z1 - 0.06 - zs0) / 0.33))
    for i in range(n):
        z = zs0 + (i + 1) * (z1 - 0.06 - zs0) / (n + 0.4)
        box("glass", x0 + t, x1 - t, yf + 0.04, yb - 0.02, z, z + 0.006, M_CLEAR)
        box("trim", x0 + t, x1 - t, yf + 0.025, yf + 0.045, z - 0.012, z + 0.012, M_TRIM, bevel=0.003)
    box("fled", x0 + 0.03, x1 - 0.03, yb - 0.2, yb - 0.03, z1 - 0.03, z1 - 0.02, M_FRIDGE_LED)
    if light:
        li = bpy.data.lights.new("fridge_in", "AREA"); li.energy = 16 * (x1 - x0) / 0.54; li.color = (0.95, 0.97, 1.0)
        li.shape = "RECTANGLE"; li.size = x1 - x0 - 0.06; li.size_y = max(0.2, yb - yf - 0.1)
        lo = bpy.data.objects.new("fridge_in", li); scene.collection.objects.link(lo)
        lo.location = ((x0 + x1) / 2, (yf + yb) / 2, z1 - 0.035); lo.visible_camera = False

def door_set(x0, x1, z0, z1, y_front, finish_mat, handle_x=None, thick=0.035):
    """Deur (gesloten stand) + binnenpaneel + deurvakken + greep. Geeft de objecten terug."""
    objs = [box("door", x0, x1, y_front, y_front + thick, z0, z1, finish_mat, bevel=0.008, segs=4)]
    if OPEN:
        objs.append(box("door_in", x0 + 0.02, x1 - 0.02, y_front + thick, y_front + thick + 0.03, z0 + 0.03, z1 - 0.03, M_LINER, bevel=0.004))
        h = z1 - z0
        for k in range(max(1, int(h / 0.45))):
            z = z0 + 0.12 + k * 0.45
            if z + 0.08 < z1 - 0.05:
                objs.append(box("rack", x0 + 0.05, x1 - 0.05, y_front + thick + 0.03, y_front + thick + 0.1, z, z + 0.08, M_CLEAR, bevel=0.006, segs=2))
    if handle_x is not None:
        hz0, hz1 = z0 + max(0.06, (z1 - z0) * 0.12), min(z1 - 0.06, z0 + (z1 - z0) * 0.62)
        if z1 - z0 < 1.0:
            hz0, hz1 = z1 - 0.34, z1 - 0.06
        objs.append(box("handle", handle_x - 0.008, handle_x + 0.008, y_front - 0.036, y_front - 0.004, hz0, hz1, M_ALU, bevel=0.004, segs=3))
        for z in (hz0 + 0.03, hz1 - 0.03):
            objs.append(box("hfoot", handle_x - 0.006, handle_x + 0.006, y_front - 0.006, y_front, z - 0.01, z + 0.01, M_ALU))
    return objs

def shell(x0, x1, yf, yb, z0, z1):
    """Buitenkast van het compartiment (zijkanten, achter, boven) in de afwerking."""
    t = 0.02
    box("sh_l", x0, x0 + t, yf, yb, z0, z1, M_FIN, bevel=0.006)
    box("sh_r", x1 - t, x1, yf, yb, z0, z1, M_FIN, bevel=0.006)
    box("sh_b", x0, x1, yb - t, yb, z0, z1, M_FIN)
    box("sh_t", x0, x1, yf, yb, z1 - t, z1, M_FIN, bevel=0.006)

FX0 = XK + 0.03
DIMS = {"standaard": (0.60, 1.86, 0.66), "breed": (0.70, 2.00, 0.70), "amerikaans": (0.91, 1.78, 0.70), "tafelmodel": (0.55, 0.84, 0.57)}
g = 0.005
if KTYPE in DIMS:
    W, H, Dp = DIMS[KTYPE]
    fx0, fx1 = FX0, FX0 + W
    yb_ = -0.04 if KTYPE != "tafelmodel" else -0.06
    yf_ = yb_ - Dp
    ybody = yf_ + 0.035                      # voorkant van de kast, achter de deuren
    box("feet", fx0 + 0.04, fx1 - 0.04, yf_ + 0.08, yb_ - 0.05, 0, 0.03, M_DARK)
    if KTYPE in ("standaard", "breed"):
        zs = 0.72 if KTYPE == "standaard" else 0.78
        box("body_lo", fx0, fx1, ybody, yb_, 0.02, zs, M_FIN, bevel=0.01, segs=4)
        door_set(fx0, fx1, 0.03, zs - g / 2, yf_, M_FIN, handle_x=fx0 + 0.045)
        if OPEN:
            shell(fx0, fx1, ybody, yb_, zs, H)
            interior(fx0 + 0.02, fx1 - 0.02, ybody, yb_ - 0.02, zs + 0.01, H - 0.02)
            swing(door_set(fx0, fx1, zs + g / 2, H, yf_, M_FIN, handle_x=fx0 + 0.045), (fx1, ybody, 0), 96)
        else:
            box("body_hi", fx0, fx1, ybody, yb_, zs, H, M_FIN, bevel=0.01, segs=4)
            door_set(fx0, fx1, zs + g / 2, H, yf_, M_FIN, handle_x=fx0 + 0.045)
    elif KTYPE == "amerikaans":
        xm = (fx0 + fx1) / 2
        box("body_l", fx0, xm, ybody, yb_, 0.02, H, M_FIN, bevel=0.01, segs=4)
        door_set(fx0, xm - g / 2, 0.03, H, yf_, M_FIN, handle_x=xm - 0.035)
        box("disp", fx0 + 0.09, xm - 0.09, yf_ - 0.002, yf_ + 0.02, 1.0, 1.32, M_DARK, bevel=0.006, segs=3)
        box("disp_scr", fx0 + 0.15, xm - 0.15, yf_ - 0.004, yf_ - 0.001, 1.35, 1.37, M_SCR)
        if OPEN:
            shell(xm, fx1, ybody, yb_, 0.02, H)
            interior(xm + 0.02, fx1 - 0.02, ybody, yb_ - 0.02, 0.05, H - 0.02)
            swing(door_set(xm + g / 2, fx1, 0.03, H, yf_, M_FIN, handle_x=xm + 0.035), (fx1, ybody, 0), 96)
        else:
            box("body_r", xm, fx1, ybody, yb_, 0.02, H, M_FIN, bevel=0.01, segs=4)
            door_set(xm + g / 2, fx1, 0.03, H, yf_, M_FIN, handle_x=xm + 0.035)
    else:  # tafelmodel onder het doorlopende werkblad
        if OPEN:
            shell(fx0, fx1, ybody, yb_, 0.02, H)
            interior(fx0 + 0.02, fx1 - 0.02, ybody, yb_ - 0.02, 0.05, H - 0.02)
            swing(door_set(fx0, fx1, 0.03, H, yf_, M_FIN, handle_x=fx1 - 0.045), (fx0, ybody, 0), -96)
        else:
            box("body", fx0, fx1, ybody, yb_, 0.02, H, M_FIN, bevel=0.01, segs=4)
            door_set(fx0, fx1, 0.03, H, yf_, M_FIN, handle_x=fx1 - 0.045)
elif KTYPE == "inbouw":
    cx0, cx1 = XK + 0.03, XK + 0.63
    yfc = -CD - 0.02
    if NIS <= 95:
        # onderbouw: koelkast onder het doorlopende werkblad, achter een keukenfront
        nz0, nz1 = 0.1, TOP_Z - 0.03
        box("ub_plinth", cx0, cx1, -CD + 0.06, 0, 0, 0.1, M_DARK)
        box("ub_side", cx1 - 0.02, cx1, yfc, 0, 0, TOP_Z - 0.03, M_LAK, bevel=0.002)
        box("ub_back", cx0, cx1, -0.02, 0, 0.1, nz1, M_DARK)
        interior(cx0 + 0.02, cx1 - 0.04, -CD + 0.03, -0.03, nz0 + 0.02, nz1 - 0.03)
        front = door_set(cx0 + 0.002, cx1 - 0.002, nz0, nz1 - 0.04, yfc, M_LAK)
        swing(front, (cx0, -CD, 0), -96)
    else:
        top = 2.2
        nz0, nz1 = 0.1, 0.1 + NIS / 100
        box("col_back", cx0, cx1, -0.02, 0, 0, top, M_DARK)
        box("col_side_r", cx1 - 0.02, cx1, yfc, 0, 0, top, M_LAK, bevel=0.002)
        box("col_side_l", cx0, cx0 + 0.02, yfc, 0, 0, top, M_LAK, bevel=0.002)
        box("col_top", cx0, cx1, yfc, 0, top - 0.02, top, M_LAK, bevel=0.002)
        box("col_plinth", cx0 + 0.02, cx1 - 0.02, -CD + 0.06, 0, 0, 0.1, M_DARK)
        box("col_shelf", cx0 + 0.02, cx1 - 0.02, -CD, 0, nz1 + 0.005, nz1 + 0.025, M_DARK)
        interior(cx0 + 0.03, cx1 - 0.03, -CD + 0.03, -0.03, nz0 + 0.02, nz1 - 0.02)
        swing(door_set(cx0 + 0.002, cx1 - 0.002, nz0, nz1, yfc, M_LAK), (cx0, -CD, 0), -96)
        # kastdeur boven de nis (dicht)
        box("col_door_top", cx0 + 0.002, cx1 - 0.002, yfc, -CD, nz1 + 0.03, top - 0.022, M_LAK, bevel=0.002)


# ───────────────────────── vaatwasser-scène ─────────────────────────
# Zelfde keuken als de koelkast-test. De rechterkast van het keukenblok is een nis
# voor de inbouwvaatwasser; een vrijstaande vaatwasser staat rechts naast de koelkast.
# --layer none | kast | ib-dicht | ib-kier | ib-open-{klein,gemiddeld,groot}
#               | vs-dicht | vs-open-{klein,gemiddeld,groot}
from mathutils import geometry as mgeo
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

def sweep(name, pts, r, m, ring=16):
    bm_ = bmesh.new(); rings_ = []
    P = [Vector(p) for p in pts]
    T = [(P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized() for i in range(len(P))]
    n = T[0].orthogonal().normalized()
    for i, p in enumerate(P):
        if i:
            axis = T[i - 1].cross(T[i])
            if axis.length > 1e-6:
                n = Matrix.Rotation(T[i - 1].angle(T[i]), 3, axis.normalized()) @ n
        b_ = T[i].cross(n)
        rings_.append([bm_.verts.new(p + r * (math.cos(a) * n + math.sin(a) * b_)) for a in [2 * math.pi * k / ring for k in range(ring)]])
    for i in range(len(rings_) - 1):
        for k in range(ring):
            bm_.faces.new((rings_[i][k], rings_[i][(k + 1) % ring], rings_[i + 1][(k + 1) % ring], rings_[i + 1][k]))
    me = bpy.data.meshes.new(name); bm_.to_mesh(me)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); me.materials.append(m)
    return smooth(o)

def rod(name, p0, p1, r, m):
    """dunne staaf (draad van een korf) tussen twee punten"""
    return sweep(name, [p0, p1], r, m, ring=6)

def disc_axis(name, r, thick, center, axis, m, verts=48, tilt=None):
    """schijf (bord) met as langs 'x' of 'y'"""
    o = cyl(name, r, -thick / 2, thick / 2, 0, 0, m, verts, bevel=min(0.004, thick / 3))
    if axis == "x": o.data.transform(Matrix.Rotation(math.radians(90), 4, "Y"))
    else: o.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
    o.location = center
    if tilt: o.rotation_euler = tilt
    return smooth(o)

# ── materialen ──
M_STEEL = mat("tubsteel", (0.8, 0.81, 0.82), 0.3, metal=1.0)
M_RACK = mat("rack", (0.74, 0.75, 0.77), 0.38)
M_RACKD = mat("rackd", (0.3, 0.31, 0.33), 0.45)
M_PORC = mat("porc", (0.93, 0.93, 0.91), 0.12, coat=0.6)
M_PORC2 = mat("porc2", (0.33, 0.42, 0.38), 0.18, coat=0.5)     # salie-groene schaaltjes
M_GLASS = mat("glassv", (0.95, 0.97, 0.98), 0.02, transmission=1.0, ior=1.5)
M_CUTL = mat("cutl", (0.78, 0.78, 0.8), 0.18, metal=1.0)
M_PANELD = mat("paneld", (0.05, 0.05, 0.055), 0.3, coat=0.5)
M_LCD = mat("lcd", (0.01, 0.01, 0.012), 0.05, coat=1.0)
M_WHITEA = mat("whitea", (0.85, 0.85, 0.84), 0.25, coat=0.5)
M_GREYS = mat("greys", (0.55, 0.56, 0.57), 0.4)
M_SINK = mat("sink", (0.06, 0.06, 0.065), 0.55)
M_TAP = mat("tap", (0.04, 0.04, 0.045), 0.35, metal=0.6)

# ── keukenblok: rechterkast wordt de nis (x -0.9 .. -0.3) ──
NX0, NX1 = XK - 0.6, XK
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.name.split(".")[0] in ("carcass", "front", "grip"):
        xs = [(o.matrix_world @ Vector(c)).x for c in o.bound_box]
        if min(xs) >= NX0 - 0.01:
            bpy.data.objects.remove(o)
box("niche_back", NX0, NX1, -0.03, 0, 0.1, TOP_Z - 0.03, M_DARK)
box("niche_side", NX0 - 0.002, NX0 + 0.016, -CD + 0.02, 0, 0.1, TOP_Z - 0.03, M_DARK)

# ── spoelbak (opbouw, zwart composiet) en zwarte kraan ──
SX = -1.62
wt = [o for o in bpy.data.objects if o.name.startswith("worktop")][0]
cut = box("sinkcut", SX - 0.23, SX + 0.23, -0.5, -0.13, TOP_Z - 0.2, TOP_Z + 0.1, M_SINK)
bo = wt.modifiers.new("hole", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cut; bo.solver = "EXACT"
bpy.context.view_layer.objects.active = wt
for m_ in list(wt.modifiers): bpy.ops.object.modifier_apply(modifier=m_.name)
bpy.data.objects.remove(cut)
basin = box("basin", SX - 0.23, SX + 0.23, -0.5, -0.13, TOP_Z - 0.2, TOP_Z - 0.005, M_SINK, bevel=0.02, segs=4)
bm_ = bmesh.new(); bm_.from_mesh(basin.data)
for f in [f for f in bm_.faces if f.normal.z > 0.9 and f.calc_center_median().z > TOP_Z - 0.03]:
    bm_.faces.remove(f)
bm_.to_mesh(basin.data); bm_.free()
for p in basin.data.polygons: p.flip()
sol = basin.modifiers.new("s", "SOLIDIFY"); sol.thickness = 0.01
box("sinkdrain", SX - 0.04, SX + 0.04, -0.355, -0.275, TOP_Z - 0.199, TOP_Z - 0.195, M_GREYS, bevel=0.01)
cyl("tapbase", 0.026, TOP_Z, TOP_Z + 0.05, SX, -0.06, M_TAP, 48, bevel=0.004)
tp = [(SX, -0.06, TOP_Z + 0.04 + 0.3 * t) for t in [i / 10 for i in range(11)]]
tp += [(SX, -0.06 - 0.1 * (1 - math.cos(a)) , TOP_Z + 0.34 + 0.1 * math.sin(a)) for a in [math.pi * i / 24 for i in range(1, 25)]]
tp += [(SX, -0.26, TOP_Z + 0.34 - 0.06 * t) for t in [i / 6 for i in range(1, 7)]]
sweep("tapneck", tp, 0.013, M_TAP, ring=24)
box("taplever", SX + 0.02, SX + 0.09, -0.07, -0.05, TOP_Z + 0.2, TOP_Z + 0.21, M_TAP, bevel=0.004)

# ── vaatwasser ──
HZ = 0.1                       # onderkant deur / scharnier
DOOR_H = 0.73                  # tot de bovenrand (0.83)
def tub(x0, x1, yf, z0, z1):
    """RVS kuip met open voorkant, sproeiarm onderin"""
    L = []
    t = 0.01
    L.append(box("tub_back", x0, x1, -0.05, -0.04, z0, z1, M_STEEL))
    L.append(box("tub_l", x0, x0 + t, yf, -0.04, z0, z1, M_STEEL))
    L.append(box("tub_r", x1 - t, x1, yf, -0.04, z0, z1, M_STEEL))
    L.append(box("tub_top", x0, x1, yf, -0.04, z1 - t, z1, M_STEEL))
    L.append(box("tub_bot", x0, x1, yf, -0.04, z0, z0 + t, M_STEEL))
    cx = (x0 + x1) / 2
    # licht in de kuip (onzichtbaar), anders is de RVS binnenkant van de nis donker
    bpy.ops.object.light_add(type="AREA", location=(cx, (yf - 0.04) / 2, z1 - 0.03))
    tl = bpy.context.active_object; tl.data.energy = 9; tl.data.size = 0.4; tl.data.color = (1.0, 0.97, 0.93)
    tl.visible_camera = False; tl.visible_glossy = False
    L.append(smooth(cyl("sump", 0.06, z0 + t, z0 + 0.03, cx, (yf - 0.04) / 2, M_GREYS, 48)))
    L.append(box("sprayarm", cx - 0.22, cx + 0.22, (yf - 0.04) / 2 - 0.018, (yf - 0.04) / 2 + 0.018, z0 + 0.035, z0 + 0.05, M_GREYS, bevel=0.008))
    for sy in (-1, 1):   # rails voor de korven
        for zz in (z0 + 0.06, z0 + 0.39):
            L.append(box("rail", x0 + t, x0 + t + 0.012, yf, -0.06, zz, zz + 0.012, M_GREYS))
            L.append(box("rail", x1 - t - 0.012, x1 - t, yf, -0.06, zz, zz + 0.012, M_GREYS))
    return L

def rack(x0, x1, y0, y1, z0, h, name, tines_x=None):
    """draadkorf: rand boven en onder, staanders, bodemrooster, optioneel plaatstijlen"""
    L = []
    r = 0.0025
    for zz in (z0, z0 + h):
        for (a, b) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            L.append(rod(name + "_rim", (a[0], a[1], zz), (b[0], b[1], zz), r * 1.6, M_RACK))
    nx = int((x1 - x0) / 0.04); ny = int((y1 - y0) / 0.04)
    for i in range(nx + 1):
        x = x0 + (x1 - x0) * i / nx
        L.append(rod(name + "_v", (x, y0, z0), (x, y0, z0 + h), r, M_RACK))
        L.append(rod(name + "_v", (x, y1, z0), (x, y1, z0 + h), r, M_RACK))
        L.append(rod(name + "_floor", (x, y0, z0), (x, y1, z0), r, M_RACK))
    for j in range(ny + 1):
        y = y0 + (y1 - y0) * j / ny
        L.append(rod(name + "_v", (x0, y, z0), (x0, y, z0 + h), r, M_RACK))
        L.append(rod(name + "_v", (x1, y, z0), (x1, y, z0 + h), r, M_RACK))
        L.append(rod(name + "_floor", (x0, y, z0), (x1, y, z0), r, M_RACK))
    if tines_x:   # plaatstijlen: rijen korte stijlen dwars
        xa, xb = tines_x
        for j in range(1, ny):
            y = y0 + (y1 - y0) * j / ny
            for i in range(int((xb - xa) / 0.035) + 1):
                x = xa + i * 0.035
                L.append(rod(name + "_tine", (x, y, z0), (x, y + 0.004, z0 + 0.1), r, M_RACK))
    for (x, y) in ((x0 + 0.03, y0), (x1 - 0.03, y0), (x0 + 0.03, y1), (x1 - 0.03, y1)):   # wieltjes
        L.append(smooth(cyl(name + "_wheel", 0.014, 0, 0.008, 0, 0, M_RACKD, 24)))
        L[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "Y")); L[-1].location = (x, y, z0 - 0.006)
    return L

def load(x0, x1, y0, y1, zl, zu, size):
    """vaat: borden en schaaltjes onder, glazen en kopjes boven; groot = met besteklade"""
    L = []
    n_pl = {"klein": 6, "gemiddeld": 10, "groot": 12}[size]
    n_bowl = {"klein": 2, "gemiddeld": 4, "groot": 5}[size]
    n_gl = {"klein": 4, "gemiddeld": 6, "groot": 8}[size]
    n_cup = {"klein": 2, "gemiddeld": 3, "groot": 4}[size]
    w = x1 - x0
    # borden staan rechtop in een rij van voor naar achter, aan de linkerkant
    for i in range(n_pl):
        y = y0 + 0.04 + i * (y1 - y0 - 0.08) / max(n_pl - 1, 1)
        r_ = 0.12 if i % 3 else 0.105
        L.append(disc_axis("plate", r_, 0.012, (x0 + 0.17, y, zl + r_ + 0.012), "y", M_PORC, 64,
                           tilt=(math.radians(8), 0, 0)))
    # schaaltjes schuin rechts achter
    for i in range(n_bowl):
        y = y0 + 0.08 + i * 0.075
        b = disc_axis("bowl", 0.075, 0.05, (x0 + w * 0.68, y, zl + 0.08), "y", M_PORC2, 48, tilt=(math.radians(25), 0, 0))
        L.append(b)
    # bestekmand rechtsvoor met handvatten omhoog
    bx0, bx1, by0, by1 = x1 - 0.17, x1 - 0.04, y0 + 0.02, y0 + 0.12
    L.append(box("cbasket", bx0, bx1, by0, by1, zl + 0.005, zl + 0.13, M_RACKD, bevel=0.006))
    for i in range(6 if size != "klein" else 3):
        x = bx0 + 0.015 + i * 0.02
        L.append(box("cutl", x - 0.004, x + 0.004, by0 + 0.03 + (i % 2) * 0.03, by0 + 0.036 + (i % 2) * 0.03, zl + 0.1, zl + 0.2, M_CUTL, bevel=0.002))
    # glazen ondersteboven en kopjes in de bovenkorf
    for i in range(n_gl):
        x = x0 + 0.06 + (i % 4) * 0.075; y = y0 + 0.07 + (i // 4) * 0.11
        L.append(smooth(cyl("glass", 0.032, zu + 0.01, zu + 0.12, x, y, M_GLASS, 48)))
    for i in range(n_cup):
        x = x1 - 0.07 - (i % 2) * 0.08; y = y0 + 0.08 + (i // 2) * 0.1
        L.append(smooth(cyl("cup", 0.038, zu + 0.01, zu + 0.08, x, y, M_PORC, 48, bevel=0.006)))
    return L

def dishwasher(kind, state, size=None):
    """kind 'ib' (inbouw in de nis) of 'vs' (vrijstaand naast de koelkast); state dicht|kier|open"""
    L = []
    if kind == "ib":
        x0, x1, yf = NX0 + 0.005, NX1 - 0.005, -CD + 0.02
        top = TOP_Z - 0.035
    else:
        x0, x1, yf = FX0 + 0.66, FX0 + 1.26, -0.64
        top = 0.84
        # behuizing als schaal (zijkanten, achterkant, bodem): de kuip zit erin
        L.append(box("vs_side_l", x0, x0 + 0.012, yf + 0.02, -0.03, 0.02, top, M_WHITEA, bevel=0.004))
        L.append(box("vs_side_r", x1 - 0.012, x1, yf + 0.02, -0.03, 0.02, top, M_WHITEA, bevel=0.004))
        L.append(box("vs_back", x0, x1, -0.045, -0.03, 0.02, top, M_WHITEA))
        L.append(box("vs_bottom", x0, x1, yf + 0.02, -0.03, 0.02, HZ, M_GREYS))
        L.append(box("vs_top", x0 - 0.004, x1 + 0.004, yf + 0.01, -0.03, top, top + 0.025, M_WHITEA, bevel=0.008, segs=4))
        L.append(box("vs_kick", x0 + 0.01, x1 - 0.01, yf + 0.015, yf + 0.04, 0.02, HZ - 0.004, M_GREYS, bevel=0.004))
        for fx in (x0 + 0.04, x1 - 0.04):
            L.append(smooth(cyl("vs_foot", 0.016, 0, 0.022, fx, yf + 0.06, M_RACKD, 24)))
    opened = state == "open"
    if state != "dicht":
        L += tub(x0 + 0.01, x1 - 0.01, yf + 0.02, HZ, top - 0.01)
        zl, zu = HZ + 0.07, HZ + 0.4
        ry0, ry1 = yf + 0.04, -0.07
        out_l = 0.34 if opened else 0.0; out_u = 0.14 if opened else 0.0
        L += rack(x0 + 0.03, x1 - 0.03, ry0 - out_l, ry1 - out_l, zl, 0.17, "lower", tines_x=(x0 + 0.07, x0 + 0.3))
        L += rack(x0 + 0.03, x1 - 0.03, ry0 - out_u, ry1 - out_u, zu, 0.15, "upper")
        if opened and size:
            L += load(x0 + 0.03, x1 - 0.03, ry0 - out_l, ry1 - out_l, zl, zu, size)
            # glazen/kopjes horen bij de bovenkorf: die schuift minder ver uit
            for o in [o for o in L if o.name.split(".")[0] in ("glass", "cup")]:
                o.location.y += out_l - out_u
            if size == "groot":   # besteklade bovenin
                L += rack(x0 + 0.03, x1 - 0.03, ry0 - 0.2, ry1 - 0.2, top - 0.075, 0.035, "drawer")
                for i in range(9):
                    x = x0 + 0.08 + i * 0.05
                    L.append(box("cutl3", x - 0.006, x + 0.006, ry0 - 0.18, ry0 + 0.04, top - 0.068, top - 0.062, M_CUTL, bevel=0.002))
    # deur (gesloten modelleren, dan om het onderste scharnier kantelen)
    door = []
    thick = 0.045
    dz1 = HZ + DOOR_H
    door.append(box("door_inner", x0 + 0.005, x1 - 0.005, yf - 0.02, yf + 0.005, HZ, dz1, M_STEEL, bevel=0.004))
    door.append(box("dispenser", (x0 + x1) / 2 - 0.08, (x0 + x1) / 2 + 0.06, yf + 0.004, yf + 0.016, HZ + 0.4, HZ + 0.5, M_GREYS, bevel=0.006))
    door.append(box("dispenser_lid", (x0 + x1) / 2 - 0.072, (x0 + x1) / 2 - 0.005, yf + 0.014, yf + 0.018, HZ + 0.41, HZ + 0.49, M_GREYS, bevel=0.004))
    if kind == "ib":
        # karamel keukenfront zoals de andere kastjes, met bedieningsstrook op de bovenrand
        door.append(box("door_front", x0 - 0.003, x1 + 0.003, -CD, -CD + 0.02, HZ, TOP_Z - 0.07, M_LAK, bevel=0.002, segs=3))
        door.append(box("door_strip", x0, x1, -CD + 0.002, yf + 0.004, TOP_Z - 0.07, TOP_Z - 0.04, M_PANELD, bevel=0.003))
        pz = TOP_Z - 0.04
        door.append(box("panel_disp", x0 + 0.24, x1 - 0.22, -CD + 0.012, -CD + 0.04, pz, pz + 0.002, M_LCD, bevel=0.002))
        for i in range(5):
            bx = x0 + 0.04 + i * 0.035
            door.append(box("panel_btn", bx, bx + 0.018, -CD + 0.016, -CD + 0.034, pz, pz + 0.0025, M_GREYS, bevel=0.002))
        door.append(box("panel_pwr", x1 - 0.06, x1 - 0.04, -CD + 0.016, -CD + 0.034, pz, pz + 0.0025, M_GREYS, bevel=0.002))
    else:
        door.append(box("door_front", x0 + 0.002, x1 - 0.002, yf - 0.045, yf - 0.02, HZ, dz1, M_WHITEA, bevel=0.006, segs=3))
        door.append(box("door_strip", x0 + 0.002, x1 - 0.002, yf - 0.047, yf - 0.044, dz1 - 0.09, dz1 - 0.01, M_PANELD, bevel=0.004))
        door.append(box("panel_disp", x0 + 0.24, x0 + 0.38, yf - 0.049, yf - 0.047, dz1 - 0.07, dz1 - 0.03, M_LCD, bevel=0.002))
        for i in range(4):
            bx = x0 + 0.05 + i * 0.04
            door.append(smooth(cyl("panel_btn", 0.009, 0, 0.003, 0, 0, M_GREYS, 24)))
            door[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "X")); door[-1].location = (bx, yf - 0.049, dz1 - 0.05)
        door.append(box("door_grip", x0 + 0.15, x1 - 0.15, yf - 0.05, yf - 0.046, dz1 - 0.115, dz1 - 0.1, M_GREYS, bevel=0.004))
        door.append(box("door_logo", x1 - 0.12, x1 - 0.05, yf - 0.048, yf - 0.046, dz1 - 0.06, dz1 - 0.05, M_GREYS))
    ang = {"dicht": 0, "kier": 14, "open": 90}[state]
    hy = -CD if kind == "ib" else yf - 0.045
    Mrot = Matrix.Translation(Vector((0, hy, HZ))) @ Matrix.Rotation(math.radians(ang), 4, "X") @ Matrix.Translation(Vector((0, -hy, -HZ)))
    for o in door:
        o.matrix_world = Mrot @ o.matrix_world
    if kind == "ib" and state == "dicht":
        # dichte inbouw: alleen het front; het apparaat zit erachter (achterwand donker)
        # (weghalen, niet als schaduwvanger laten staan: ze vallen samen met het front en zouden het verbergen)
        weg = [o for o in door if o.name.startswith(("door_inner", "dispenser"))]
        door = [o for o in door if o not in weg]
        for o in weg:
            bpy.data.objects.remove(o)
    return L + door

def kastje():
    a, b = NX0, NX1
    return [box("kast_front", a + 0.002, b - 0.002, -CD, -CD + 0.02, 0.1, TOP_Z - 0.07, M_LAK, bevel=0.002, segs=3),
            box("kast_grip", a + 0.002, b - 0.002, -CD + 0.005, -CD + 0.03, TOP_Z - 0.07, TOP_Z - 0.03, M_DARK)]

objs = []
if LAYER == "kast":
    objs = kastje()
elif LAYER.startswith(("ib-", "vs-")):
    parts = LAYER.split("-")
    objs = dishwasher(parts[0], parts[1], parts[2] if len(parts) > 2 else None)
    if parts[0] == "ib" and parts[1] == "dicht":
        objs += [box("ib_grip", NX0 + 0.002, NX1 - 0.002, -CD + 0.005, -CD + 0.03, TOP_Z - 0.07, TOP_Z - 0.03, M_DARK)]
if LAYER != "none":
    keep = set(o.name for o in objs)
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
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.4; sun.angle = math.radians(7)
sun.color = (1.0, 0.92, 0.82)
so = bpy.data.objects.new("sun", sun); scene.collection.objects.link(so)
Ld = Vector((0.6, 0.6, -0.35)).normalized()
so.rotation_euler = (-Ld).to_track_quat("Z", "Y").to_euler()


# ───────────────────────── camera ─────────────────────────
cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 22; cam_d.sensor_width = 36; cam_d.sensor_fit = "HORIZONTAL"
cam_d.shift_x = -0.15; cam_d.shift_y = -0.18
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam)
CAM_Y = -3.6; CAM_Z = 1.35
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
