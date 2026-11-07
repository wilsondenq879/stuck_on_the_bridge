import bpy, math, json, pathlib, sys
from mathutils import Vector
source,out=map(pathlib.Path,sys.argv[sys.argv.index('--')+1:][:2]);p=json.loads(source.read_text());assert p=={'schema':1,'id':'bike_asset','kind':'scooter','width':.72,'length':1.82,'height':1.88};out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough;return m
paint=mat('bike_paint_0',(.64,.68,.67),.28,.35);dark=mat('bike_plain_rubber',(.025,.03,.033),0,.82);metal=mat('bike_plain_metal',(.38,.42,.42),.7,.3);skin=mat('bike_plain_skin',(.48,.32,.23),0,.8);pants=mat('bike_plain_pants',(.065,.075,.082),0,.83);helmet=mat('bike_plain_helmet',(.18,.2,.2),.15,.25);red=mat('bike_brake_5',(.8,.08,.035),.05,.4);white=mat('bike_plain_lamp',(.9,.88,.73),.1,.25);delivery=mat('bike_delivery_4',(.8,.15,.30),0,.55)
root=bpy.data.objects.new('bike_asset',None);bpy.context.collection.objects.link(root)
def cube(name,loc,scale,material,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('rounded edges','BEVEL');mod.width=bevel;mod.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(material);o.parent=root;return o
def ellipsoid(name,loc,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material);o.parent=root
 for f in o.data.polygons:f.use_smooth=True
 return o
def wheel(y):
 bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.27,depth=.15,location=(0,y,.28),rotation=(0,math.pi/2,0));o=bpy.context.object;o.name='wheel';o.data.materials.append(dark);o.parent=root
 for x in [-.078,.078]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.13,depth=.012,location=(x,y,.28),rotation=(0,math.pi/2,0));o=bpy.context.object;o.data.materials.append(metal);o.parent=root
def bar(name,a,b,r,material):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(material);o.parent=root;return o
for y in [-.67,.67]:wheel(y)
ellipsoid('rear_fairing',(0,-.43,.53),(.27,.46,.30),paint);ellipsoid('front_fairing',(0,.53,.66),(.23,.30,.42),paint)
cube('footboard',(0,.04,.37),(.46,.85,.10),dark);cube('seat',(0,-.25,.81),(.43,.58,.12),dark,.05)
bar('handlebar',(-.34,.68,1.04),(.34,.68,1.04),.035,metal)
for x in [-.34,.34]:
 bar('mirror_stem',(x,.68,1.04),(x*1.35,.71,1.27),.018,metal);ellipsoid('mirror',(x*1.35,.71,1.28),(.10,.04,.065),dark)
cube('taillight',(0,-.875,.65),(.22,.035,.12),red,.015);cube('headlight',(0,.83,.78),(.22,.03,.14),white,.02)
# Helmet, torso, arms and legs are modelled separately to avoid a single pillar silhouette.
ellipsoid('rider_torso',(0,-.20,1.19),(.23,.17,.33),paint);ellipsoid('helmet',(0,-.19,1.72),(.22,.21,.23),helmet)
cube('visor',(0,.007,1.76),(.31,.025,.105),dark,.02)
for x in [-.16,.16]:
 bar('arm',(x,-.13,1.38),(x*1.8,.57,1.07),.07,paint);ellipsoid('glove',(x*1.8,.58,1.07),(.065,.08,.055),dark)
 bar('thigh',(x,-.22,.94),(x,.23,.69),.095,pants);bar('leg',(x,.23,.69),(x,.27,.43),.075,pants);cube('shoe',(x,.34,.41),(.14,.27,.09),dark,.03)
cube('delivery_box',(0,-.69,1.05),(.48,.42,.47),delivery,.035)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'bike.blend'));bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(out/'bike.glb'),export_format='GLB',use_selection=True,export_apply=True);print('SCOOTER_EXPORTED',flush=True)
