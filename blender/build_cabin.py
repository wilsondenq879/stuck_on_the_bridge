import bpy,pathlib,json,sys
p,out=map(pathlib.Path,sys.argv[sys.argv.index('--')+1:][:2]);d=json.loads(p.read_text());assert d=={'schema':1,'id':'cabin_asset','kind':'car_cabin','width':2.2,'height':1.2,'depth':1.7};out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,c,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough;return m
soft=mat('cabin_dashboard',(.075,.09,.085),0,.8);dark=mat('cabin_dark',(.018,.025,.026),.05,.72);trim=mat('cabin_trim',(.24,.27,.25),.55,.3);screen=mat('cabin_screen',(.018,.035,.04),.18,.25)
root=bpy.data.objects.new('cabin_asset',None);bpy.context.collection.objects.link(root)
def box(name,loc,dimensions,material,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dimensions;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('soft corners','BEVEL');m.width=bevel;m.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 o.data.materials.append(material);o.parent=root;return o
box('upper dash',(0,1.08,.75),(2.2,.65,.24),soft,.07);box('windshield shelf',(0,1.21,.91),(2.15,.9,.09),dark,.025);box('lower dash',(0,2.05,.82),(1.83,1.6,.10),soft,.04)
box('centre display',(.43,.93,1.00),(.53,.08,.27),dark,.025);box('display glass',(.43,.88,1.00),(.47,.015,.21),screen,.015)
for x in [-.87,-.55,.70,.94]:
 box('vent frame',(x,.76,.83),(.22,.035,.11),trim,.015)
 for z in [.80,.83,.86]:box('vent blade',(x,.735,z),(.19,.018,.012),dark,.003)
box('accent trim',(0,.73,.70),(1.94,.025,.035),trim,.01)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'cabin.blend'));bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(out/'cabin.glb'),export_format='GLB',use_selection=True,export_apply=True);print('CABIN_EXPORTED',flush=True)
