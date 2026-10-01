"""Keuken-scene voor de koffiemachine-keuzehulp test (zelfde werkblad als de airfryer).

Aanroep:
  blender -b --factory-startup -P scene.py -- --assets DIR --d 1.3 --light day --type standaard
          --finish rvs --layer none|{vol,half,caps}[-auto|-stoom]|filter|kopjes-{klein,gemiddeld,groot}
          --res 2000 --samples 256 --out render.png --json cam.json

--layer none = de keuken; elke andere laag rendert alleen dat object met transparante
achtergrond (de rest wordt shadow catcher). Camera staat op x = -0.72 (zie makeCamera camX).
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
XK = -0.3                 # einde van het keukenblok
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


# ───────────────────────── koffiemachine-scène ─────────────────────────
# Zelfde keuken als de koelkast/vaatwasser-test, camera dicht op het werkblad. De
# airfryer staat rechts op het werkblad naast de koelkast; eten op een plank ervoor.
# --layer none | {vol,half,caps}[-auto|-stoom] | filter | kopjes-{klein,gemiddeld,groot}
import random
LAYER = A.layer

def mat(name, color, rough=0.4, metal=0.0, coat=0.0, emission=None, estrength=0.0, transmission=0.0, ior=1.45, var=0.0, bump=0.0, scale=60):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; Lk = m.node_tree.links; b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; b.inputs["Coat Weight"].default_value = coat
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission; b.inputs["IOR"].default_value = ior
    if emission:
        b.inputs["Emission Color"].default_value = (*emission, 1); b.inputs["Emission Strength"].default_value = estrength
    if var or bump:
        tc = N.new("ShaderNodeTexCoord"); nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale
        nz.inputs["Detail"].default_value = 6
        Lk.new(tc.outputs["Object"], nz.inputs["Vector"])
        if var:   # kleurvariatie: donkerder/lichter gebakken plekjes
            mr = N.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = 1 - var; mr.inputs["To Max"].default_value = 1 + var
            Lk.new(nz.outputs["Fac"], mr.inputs[0])
            mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1
            mx.inputs[6].default_value = (*color, 1); Lk.new(mr.outputs[0], mx.inputs[7]); Lk.new(mx.outputs[2], b.inputs["Base Color"])
        if bump:
            bu = N.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = bump; bu.inputs["Distance"].default_value = 0.002
            Lk.new(nz.outputs["Fac"], bu.inputs["Height"]); Lk.new(bu.outputs["Normal"], b.inputs["Normal"])
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

def ellipsoid(name, cx, cy, cz, rx, ry, rz, m, segs=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = name
    o.data.transform(Matrix.Diagonal((rx, ry, rz, 1))); o.location = (cx, cy, cz)
    o.data.materials.append(m); return smooth(o)

def cut(obj, x0, x1, y0, y1, z0, z1):
    c = box("cut_" + obj.name, x0, x1, y0, y1, z0, z1, M_DARK)
    bo = obj.modifiers.new("hole", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = c; bo.solver = "EXACT"
    bpy.context.view_layer.objects.active = obj
    for m_ in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m_.name)
    bpy.data.objects.remove(c)
    return obj

# ── spoelbak en kraan (zelfde als de vaatwasser-keuken) ──
M_SINK = mat("sink", (0.06, 0.06, 0.065), 0.55)
M_TAP = mat("tap", (0.04, 0.04, 0.045), 0.35, metal=0.6)
M_GREYS = mat("greys", (0.55, 0.56, 0.57), 0.4)
SX = -1.62
wt = [o for o in bpy.data.objects if o.name.startswith("worktop")][0]
cut(wt, SX - 0.23, SX + 0.23, -0.5, -0.13, TOP_Z - 0.2, TOP_Z + 0.1)
basin = box("basin", SX - 0.23, SX + 0.23, -0.5, -0.13, TOP_Z - 0.2, TOP_Z - 0.005, M_SINK, bevel=0.02, segs=4)
bm_ = bmesh.new(); bm_.from_mesh(basin.data)
for f in [f for f in bm_.faces if f.normal.z > 0.9 and f.calc_center_median().z > TOP_Z - 0.03]:
    bm_.faces.remove(f)
bm_.to_mesh(basin.data); bm_.free()
for p in basin.data.polygons: p.flip()
basin.modifiers.new("s", "SOLIDIFY").thickness = 0.01
cyl("tapbase", 0.026, TOP_Z, TOP_Z + 0.05, SX, -0.06, M_TAP, 48, bevel=0.004)
tp = [(SX, -0.06, TOP_Z + 0.04 + 0.3 * t) for t in [i / 10 for i in range(11)]]
tp += [(SX, -0.06 - 0.1 * (1 - math.cos(a)), TOP_Z + 0.34 + 0.1 * math.sin(a)) for a in [math.pi * i / 24 for i in range(1, 25)]]
tp += [(SX, -0.26, TOP_Z + 0.34 - 0.06 * t) for t in [i / 6 for i in range(1, 7)]]
sweep("tapneck", tp, 0.013, M_TAP, ring=24)
box("taplever", SX + 0.02, SX + 0.09, -0.07, -0.05, TOP_Z + 0.2, TOP_Z + 0.21, M_TAP, bevel=0.004)
# wat keukenspul tegen de muur: snijplank en een pot met lepels
box("cutboard", -1.25, -1.0, -0.06, -0.035, TOP_Z, TOP_Z + 0.36, pbr("cbw", "white_oak_veneer", 0.5, base=(0.6, 0.45, 0.3), var=0.25, bump=0.03), bevel=0.01)
jar = smooth(cyl("utensil_jar", 0.05, TOP_Z, TOP_Z + 0.15, -1.33, -0.12, mat("jar", (0.82, 0.8, 0.76), 0.3, coat=0.4), 48, bevel=0.008))
for k in range(3):
    sweep("utensil", [(-1.33 + (k - 1) * 0.015, -0.12, TOP_Z + 0.03), (-1.33 + (k - 1) * 0.03, -0.12 - 0.01 * k, TOP_Z + 0.3)], 0.006, pbr(f"ut{k}", "white_oak_veneer", 0.3, base=(0.55, 0.4, 0.26), var=0.2, bump=0.02))

# ── koffiemachines ──
# --layer none | {vol,half,caps}[-auto|-stoom] | filter | kopjes-{klein,gemiddeld,groot}
M_BLK = mat("kblack", (0.008, 0.008, 0.009), 0.42, bump=0.03, scale=900)
M_GLOSSK = mat("kgloss", (0.004, 0.004, 0.005), 0.28, coat=0.25)
M_STEELK = mat("ksteel", (0.75, 0.76, 0.77), 0.22, metal=1.0, bump=0.02, scale=300)
M_CHROMEK = mat("kchrome", (0.85, 0.86, 0.88), 0.08, metal=1.0)
M_GREYK = mat("kgrey", (0.12, 0.12, 0.13), 0.4)
M_LCDK = mat("klcd", (0.005, 0.005, 0.006), 0.05, coat=1.0)
M_GLASSK = mat("kglass", (0.95, 0.97, 0.98), 0.02, transmission=1.0, ior=1.5)
M_SMOKE = mat("ksmoke", (0.35, 0.3, 0.26), 0.05, transmission=1.0, ior=1.5)
M_COFFEE = mat("coffee", (0.06, 0.025, 0.01), 0.15, coat=0.4)
M_MILK = mat("milk", (0.93, 0.92, 0.88), 0.35)
M_FOAM = mat("foam", (0.78, 0.6, 0.42), 0.6, var=0.2, scale=120)
M_CUP = mat("cupk", (0.94, 0.94, 0.92), 0.12, coat=0.6)
M_BEANS = mat("beans", (0.16, 0.07, 0.03), 0.35, var=0.4, bump=0.6, scale=220, coat=0.3)
M_WATER = mat("waterk", (0.88, 0.93, 0.96), 0.02, transmission=1.0, ior=1.33)
M_RED = mat("kred", (0.45, 0.04, 0.03), 0.3, coat=0.5)

KX, KYB, Z0 = -0.66, -0.07, TOP_Z

def cup(name, cx, cy, z, r=0.034, h=0.06, saucer=True, fill=M_COFFEE, handle=True):
    L = []
    if saucer:
        L.append(smooth(cyl(name + "_saucer", r * 1.9, z, z + 0.008, cx, cy, M_CUP, 48, bevel=0.003)))
        z += 0.008
    # hol kopje: open bovenkant met wanddikte, zodat je de koffie erin ziet
    c = smooth(cyl(name, r, z, z + h, cx, cy, M_CUP, 48))
    bm_ = bmesh.new(); bm_.from_mesh(c.data)
    for f in [f for f in bm_.faces if f.normal.z > 0.9]:
        bm_.faces.remove(f)
    bm_.to_mesh(c.data); bm_.free()
    so_ = c.modifiers.new("s", "SOLIDIFY"); so_.thickness = 0.003; so_.offset = -1
    L.append(c)
    L.append(smooth(cyl(name + "_fill", r - 0.0035, z + h - 0.009, z + h - 0.006, cx, cy, fill, 48)))
    if handle:
        hp = [(cx + r + 0.012 * math.sin(a), cy, z + h * 0.5 + 0.018 * math.cos(a)) for a in [math.pi * i / 16 for i in range(17)]]
        L.append(sweep(name + "_handle", hp, 0.004, M_CUP, ring=10))
    return L

def latte_glass(name, cx, cy, z):
    return [smooth(cyl(name, 0.032, z, z + 0.11, cx, cy, M_GLASSK, 48)),
            smooth(cyl(name + "_milk", 0.029, z + 0.004, z + 0.06, cx, cy, M_MILK, 48)),
            smooth(cyl(name + "_coffee", 0.029, z + 0.06, z + 0.085, cx, cy, mat("lattec", (0.42, 0.24, 0.12), 0.4), 48)),
            smooth(cyl(name + "_foam", 0.029, z + 0.085, z + 0.1, cx, cy, M_FOAM, 48))]

def steam_wand(x, yf, ztop, zbot):
    pts = [(x, yf + 0.02, ztop), (x + 0.01, yf - 0.02, ztop - 0.02)] + [(x + 0.015, yf - 0.03, ztop - 0.03 - (ztop - zbot - 0.04) * t) for t in [i / 10 for i in range(1, 11)]]
    L = [sweep("wand", pts, 0.0055, M_CHROMEK, ring=14), smooth(cyl("wand_tip", 0.006, zbot, zbot + 0.02, x + 0.015, yf - 0.03, M_GREYK, 16))]
    L.append(smooth(cyl("wand_knob", 0.016, 0, 0.02, 0, 0, M_BLK, 32))); L[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "Y")); L[-1].location = (x + 0.01, yf + 0.05, ztop + 0.02)
    return L

def pitcher(cx, cy, z):
    L = [smooth(cyl("pitcher", 0.04, z, z + 0.1, cx, cy, M_STEELK, 48, bevel=0.004))]
    hp = [(cx - 0.04 - 0.02 * math.sin(a), cy, z + 0.05 + 0.03 * math.cos(a)) for a in [math.pi * i / 16 for i in range(17)]]
    L.append(sweep("pitcher_handle", hp, 0.005, M_STEELK, ring=10))
    L.append(box("pitcher_spout", cx + 0.03, cx + 0.05, cy - 0.01, cy + 0.01, z + 0.085, z + 0.1, M_STEELK, bevel=0.004))
    return L

def frother(cx, cy, z):
    """automatische melkopschuimer (kan op een voet)"""
    return [smooth(cyl("fr_base", 0.055, z, z + 0.02, cx, cy, M_BLK, 48, bevel=0.006)),
            smooth(cyl("fr_jug", 0.045, z + 0.02, z + 0.15, cx, cy, M_STEELK, 48, bevel=0.006)),
            smooth(cyl("fr_lid", 0.047, z + 0.15, z + 0.165, cx, cy, M_BLK, 48, bevel=0.006)),
            box("fr_handle", cx + 0.045, cx + 0.065, cy - 0.012, cy + 0.012, z + 0.04, z + 0.13, M_BLK, bevel=0.008)]

def volautomaat(milk):
    w, d, h = 0.24, 0.40, 0.37
    x0, x1, yf = KX - w / 2, KX + w / 2, KYB - d
    L = [box("vol_body", x0, x1, yf + 0.02, KYB, Z0 + 0.01, Z0 + h, M_BLK, bevel=0.025, segs=6)]
    L.append(box("vol_side", x0 - 0.002, x0 + 0.004, yf + 0.06, KYB - 0.04, Z0 + 0.05, Z0 + h - 0.04, M_STEELK, bevel=0.003))
    L.append(box("vol_side2", x1 - 0.004, x1 + 0.002, yf + 0.06, KYB - 0.04, Z0 + 0.05, Z0 + h - 0.04, M_STEELK, bevel=0.003))
    # bovenkant: bonenreservoir met getint deksel
    L.append(smooth(cyl("vol_hopper", 0.065, Z0 + h - 0.004, Z0 + h + 0.012, KX, KYB - 0.13, M_SMOKE, 64, bevel=0.006)))
    L.append(smooth(cyl("vol_beans", 0.058, Z0 + h - 0.006, Z0 + h + 0.004, KX, KYB - 0.13, M_BEANS, 48)))
    # bedieningspaneel met display bovenaan de voorkant
    L.append(box("vol_panel", x0 + 0.015, x1 - 0.015, yf + 0.008, yf + 0.022, Z0 + h - 0.11, Z0 + h - 0.02, M_GLOSSK, bevel=0.008))
    L.append(box("vol_display", KX - 0.06, KX + 0.06, yf + 0.0065, yf + 0.009, Z0 + h - 0.095, Z0 + h - 0.035, M_LCDK, bevel=0.003))
    for i in range(3):
        for sx in (-1, 1):
            L.append(smooth(cyl("vol_icon", 0.005, 0, 0.0015, 0, 0, M_GREYK, 20))); L[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
            L[-1].location = (KX + sx * 0.085, yf + 0.006, Z0 + h - 0.09 + i * 0.022)
    # uitloop (verstelbaar) met twee tuitjes
    L.append(box("vol_spout", KX - 0.04, KX + 0.04, yf - 0.03, yf + 0.03, Z0 + 0.17, Z0 + 0.22, M_GLOSSK, bevel=0.012, segs=4))
    for sx in (-1, 1):
        L.append(smooth(cyl("vol_nozzle", 0.006, Z0 + 0.155, Z0 + 0.172, KX + sx * 0.015, yf - 0.005, M_CHROMEK, 16)))
    # lekbak met rooster
    L.append(box("vol_tray", x0 + 0.01, x1 - 0.01, yf - 0.05, yf + 0.04, Z0 + 0.005, Z0 + 0.04, M_GREYK, bevel=0.01))
    L.append(box("vol_grid", x0 + 0.02, x1 - 0.02, yf - 0.045, yf + 0.02, Z0 + 0.04, Z0 + 0.043, M_STEELK, bevel=0.003))
    if milk == "auto":
        # melkkaraf links naast de uitloop, slangetje naar het tuitje; latte glas eronder
        cxk, cyk = x0 - 0.06, yf + 0.04
        L.append(smooth(cyl("carafe", 0.045, Z0, Z0 + 0.16, cxk, cyk, M_GLASSK, 48, bevel=0.006)))
        L.append(smooth(cyl("carafe_milk", 0.041, Z0 + 0.004, Z0 + 0.1, cxk, cyk, M_MILK, 48)))
        L.append(smooth(cyl("carafe_lid", 0.047, Z0 + 0.16, Z0 + 0.185, cxk, cyk, M_BLK, 48, bevel=0.006)))
        L.append(sweep("milk_tube", [(cxk + 0.02, cyk, Z0 + 0.185), (cxk + 0.05, cyk - 0.02, Z0 + 0.22), (KX - 0.04, yf - 0.01, Z0 + 0.2)], 0.004, mat("tube", (0.85, 0.85, 0.82), 0.3, transmission=0.5)))
        L += latte_glass("vol_latte", KX, yf - 0.012, Z0 + 0.043)
    elif milk == "stoom":
        L += steam_wand(x1 - 0.03, yf, Z0 + 0.25, Z0 + 0.09)
        L += pitcher(x1 + 0.07, yf - 0.02, Z0)
        L += cup("vol_cup", KX, yf - 0.012, Z0 + 0.043, saucer=False)
    else:
        L += cup("vol_cup", KX, yf - 0.012, Z0 + 0.043, r=0.028, h=0.05, saucer=False)
    return L

def halfautomaat(milk):
    w, d, h = 0.28, 0.30, 0.38
    x0, x1, yf = KX - w / 2, KX + w / 2, KYB - d
    L = [box("half_body", x0, x1, yf, KYB, Z0 + 0.04, Z0 + h, M_STEELK, bevel=0.012, segs=4)]
    L.append(box("half_top", x0 + 0.01, x1 - 0.01, yf + 0.01, KYB - 0.01, Z0 + h, Z0 + h + 0.012, M_STEELK, bevel=0.004))
    for i in range(2):   # kopjeswarmer met twee kopjes
        L += cup(f"half_topcup{i}", KX - 0.05 + i * 0.1, KYB - 0.15, Z0 + h + 0.012, r=0.026, h=0.045, saucer=False, fill=M_CUP)
    L.append(box("half_feet", x0 + 0.01, x1 - 0.01, yf + 0.02, KYB - 0.02, Z0, Z0 + 0.04, M_GREYK))
    # manometer en knoppen
    L.append(smooth(cyl("gauge_rim", 0.032, 0, 0.012, 0, 0, M_CHROMEK, 64))); L[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "X")); L[-1].location = (KX, yf - 0.005, Z0 + h - 0.075)
    L.append(smooth(cyl("gauge_face", 0.027, 0, 0.002, 0, 0, mat("gface", (0.95, 0.94, 0.9), 0.3), 64))); L[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "X")); L[-1].location = (KX, yf - 0.0115, Z0 + h - 0.075)
    L.append(box("gauge_needle", KX - 0.001, KX + 0.001, yf - 0.0125, yf - 0.012, Z0 + h - 0.075, Z0 + h - 0.055, M_RED))
    L[-1].rotation_euler = (0, math.radians(35), 0)
    for i, sx in enumerate((-1, 1)):
        L.append(smooth(cyl("half_btn", 0.011, 0, 0.012, 0, 0, M_BLK, 32))); L[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "X")); L[-1].location = (KX + sx * 0.075, yf - 0.006, Z0 + h - 0.075)
    # zetgroep met portafilter (handgreep schuin naar voren)
    L.append(smooth(cyl("group", 0.04, Z0 + 0.2, Z0 + 0.25, KX, yf - 0.03, M_CHROMEK, 64, bevel=0.004)))
    L.append(smooth(cyl("porta", 0.038, Z0 + 0.175, Z0 + 0.2, KX, yf - 0.03, M_CHROMEK, 64, bevel=0.004)))
    L.append(sweep("porta_handle", [(KX, yf - 0.06, Z0 + 0.19), (KX + 0.02, yf - 0.12, Z0 + 0.188), (KX + 0.035, yf - 0.17, Z0 + 0.185)], 0.012, M_BLK, ring=18))
    L.append(box("half_tray", x0 + 0.02, x1 - 0.02, yf - 0.06, yf + 0.03, Z0, Z0 + 0.04, M_STEELK, bevel=0.006))
    L.append(box("half_grid", x0 + 0.03, x1 - 0.03, yf - 0.055, yf + 0.01, Z0 + 0.04, Z0 + 0.042, M_GREYK, bevel=0.002))
    L += cup("half_cup", KX, yf - 0.03, Z0 + 0.042, r=0.028, h=0.05, saucer=False)
    L += steam_wand(x1 - 0.025, yf, Z0 + h - 0.06, Z0 + 0.12)
    if milk == "auto":
        L += frother(x1 + 0.09, yf + 0.05, Z0)
    elif milk == "stoom":
        L += pitcher(x1 + 0.07, yf - 0.03, Z0)
    return L

def capsule(milk):
    w, d, h = 0.14, 0.32, 0.27
    x0, x1, yf = KX - w / 2, KX + w / 2, KYB - d
    L = [box("caps_body", x0, x1, yf + 0.03, KYB, Z0 + 0.01, Z0 + h, M_GLOSSK, bevel=0.03, segs=6)]
    L.append(box("caps_head", x0 + 0.005, x1 - 0.005, yf, yf + 0.12, Z0 + h - 0.09, Z0 + h - 0.005, M_GLOSSK, bevel=0.025, segs=6))
    L.append(box("caps_band", x0 - 0.002, x1 + 0.002, yf + 0.01, KYB - 0.01, Z0 + h - 0.1, Z0 + h - 0.092, M_CHROMEK, bevel=0.002))
    # hendel bovenop
    L.append(box("caps_lever", x0 + 0.015, x1 - 0.015, yf + 0.005, yf + 0.15, Z0 + h - 0.002, Z0 + h + 0.012, M_CHROMEK, bevel=0.006))
    L.append(smooth(cyl("caps_spout", 0.009, Z0 + h - 0.12, Z0 + h - 0.09, KX, yf + 0.03, M_GREYK, 24)))
    for i in range(2):
        L.append(smooth(cyl("caps_btn", 0.009, Z0 + h - 0.001, Z0 + h + 0.004, KX - 0.03 + i * 0.06, KYB - 0.04, M_CHROMEK, 32)))
    # watertank achterop (doorzichtig met water)
    L.append(box("caps_tank", x0 + 0.01, x1 - 0.01, KYB - 0.08, KYB + 0.0, Z0 + 0.03, Z0 + h - 0.02, M_GLASSK, bevel=0.01))
    L.append(box("caps_water", x0 + 0.014, x1 - 0.014, KYB - 0.076, KYB - 0.004, Z0 + 0.035, Z0 + h * 0.6, M_WATER))
    L.append(box("caps_tray", x0 + 0.005, x1 - 0.005, yf - 0.02, yf + 0.06, Z0 + 0.03, Z0 + 0.05, M_GREYK, bevel=0.008))
    L.append(box("caps_grid", x0 + 0.012, x1 - 0.012, yf - 0.015, yf + 0.04, Z0 + 0.05, Z0 + 0.052, M_CHROMEK, bevel=0.002))
    L += cup("caps_cup", KX, yf + 0.01, Z0 + 0.052, r=0.026, h=0.05, saucer=False)
    if milk == "auto":
        L += frother(x1 + 0.08, yf + 0.06, Z0)
    elif milk == "stoom":
        L += pitcher(x1 + 0.07, yf + 0.0, Z0)
    return L

def filter_machine():
    w, d, h = 0.21, 0.26, 0.37
    x0, x1, yf = KX - w / 2, KX + w / 2, KYB - d
    L = [box("flt_back", x0, x1, KYB - 0.1, KYB, Z0 + 0.01, Z0 + h, M_BLK, bevel=0.02, segs=5)]
    L.append(box("flt_base", x0, x1, yf, KYB - 0.08, Z0 + 0.01, Z0 + 0.06, M_BLK, bevel=0.015, segs=4))
    L.append(box("flt_top", x0, x1, yf, KYB - 0.08, Z0 + h - 0.12, Z0 + h, M_BLK, bevel=0.02, segs=5))
    L.append(box("flt_topband", x0 - 0.001, x1 + 0.001, yf + 0.01, KYB - 0.02, Z0 + h - 0.125, Z0 + h - 0.118, M_STEELK))
    L.append(smooth(cyl("flt_plate", 0.07, Z0 + 0.06, Z0 + 0.064, KX, yf + 0.09, M_GREYK, 64)))
    # glazen kan met koffie, deksel en greep
    cxk, cyk = KX, yf + 0.09
    L.append(smooth(cyl("flt_jug", 0.068, Z0 + 0.064, Z0 + 0.2, cxk, cyk, M_GLASSK, 64, bevel=0.01)))
    L.append(smooth(cyl("flt_coffee", 0.063, Z0 + 0.068, Z0 + 0.15, cxk, cyk, M_COFFEE, 64)))
    L.append(smooth(cyl("flt_jlid", 0.06, Z0 + 0.2, Z0 + 0.22, cxk, cyk, M_BLK, 48, bevel=0.006)))
    L.append(box("flt_jhandle", cxk + 0.065, cxk + 0.085, cyk - 0.012, cyk + 0.012, Z0 + 0.09, Z0 + 0.2, M_BLK, bevel=0.008))
    # display met klok/timer
    L.append(box("flt_display", KX - 0.045, KX + 0.045, yf - 0.0025, yf + 0.0, Z0 + h - 0.085, Z0 + h - 0.045, M_LCDK, bevel=0.003))
    L.append(smooth(cyl("flt_btn", 0.01, 0, 0.006, 0, 0, M_CHROMEK, 24))); L[-1].data.transform(Matrix.Rotation(math.radians(90), 4, "X")); L[-1].location = (x1 - 0.03, yf - 0.002, Z0 + 0.035)
    # waterpeilvenster opzij
    L.append(box("flt_window", x1 - 0.002, x1 + 0.001, KYB - 0.085, KYB - 0.03, Z0 + 0.1, Z0 + h - 0.06, M_SMOKE))
    return L

def kopjes(n):
    # dienblaadje met kopjes (zoveel mensen als koffie per keer) links voor de machine
    L = [box("tray", -1.16, -0.86, -0.56, -0.36, Z0, Z0 + 0.014, pbr("trayw", "white_oak_veneer", 0.4, base=(0.6, 0.45, 0.3), var=0.25, bump=0.03), bevel=0.006)]
    pos = [(-1.08, -0.42), (-0.95, -0.42), (-1.08, -0.5), (-0.95, -0.5), (-1.02, -0.46), (-0.89, -0.47)][:n]
    if n == 6:
        pos = [(-1.11, -0.42), (-1.01, -0.42), (-0.91, -0.42), (-1.11, -0.5), (-1.01, -0.5), (-0.91, -0.5)]
    for i, (x, y) in enumerate(pos):
        L += cup(f"tray_cup{i}", x, y, Z0 + 0.014, r=0.028, h=0.05, saucer=False, fill=M_COFFEE if i % 2 == 0 else M_FOAM)
    return L

def glass_shadowless(objs):
    """glas laat licht door: geen schaduw, anders zijn melk en water erachter zwart"""
    for o in objs:
        if o.data.materials and o.data.materials[0] in (M_GLASSK, M_SMOKE, M_WATER):
            o.visible_shadow = False
    return objs

objs = []
if LAYER.startswith(("vol", "half", "caps")):
    p = LAYER.split("-"); milk = p[1] if len(p) > 1 else None
    objs = {"vol": volautomaat, "half": halfautomaat, "caps": capsule}[p[0]](milk)
elif LAYER == "filter":
    objs = filter_machine()
elif LAYER.startswith("kopjes-"):
    objs = kopjes({"klein": 2, "gemiddeld": 4, "groot": 6}[LAYER.split("-")[1]])
glass_shadowless([o for o in objs if o.type == "MESH"])
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
cam_d.shift_x = -0.12; cam_d.shift_y = -0.12
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam)
CAM_X = -0.72; CAM_Y = -1.9; CAM_Z = 1.42
cam.location = (CAM_X, CAM_Y, CAM_Z)
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
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
scene.view_settings.exposure = 0.55

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
