import bpy, sys, math
a = sys.argv[sys.argv.index("--")+1:]
src, out, yaw, pitch, lens, res = a[0], a[1], float(a[2]), float(a[3]), float(a[4]), int(a[5])
sc = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
n = w.node_tree.nodes; env = n.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(src)
w.node_tree.links.new(env.outputs[0], n["Background"].inputs[0])
cd = bpy.data.cameras.new("c"); cd.lens = lens; cd.sensor_width = 36
c = bpy.data.objects.new("c", cd); sc.collection.objects.link(c); sc.camera = c
c.rotation_euler = (math.radians(90 + pitch), 0, math.radians(yaw))
sc.render.engine = "CYCLES"; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.render.resolution_x = res; sc.render.resolution_y = round(res * 9 / 16)
sc.view_settings.view_transform = "Standard"
sc.render.filepath = out; sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 92
bpy.ops.render.render(write_still=True)
