import bpy, math, json, pathlib, sys
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
plan_path, output_dir = map(pathlib.Path,args[:2]); plan=json.loads(plan_path.read_text())
assert set(plan)=={'schema','models','landmarks'} and plan['schema']==1
assert len(plan['models'])==14 and len(plan['landmarks'])==1
allowed_ids={a+'_'+b for a in ('benz','bmw','toyota','nissan','tesla','honda','porsche') for b in ('sedan','suv')}
for m in plan['models']:
    assert set(m)=={'id','shape','profile','width','length','height'} and m['id'] in allowed_ids
    assert m['shape'] in ('sedan','suv') and m['profile'] in ('executive','sport','family','vshape','electric','compact','coupe')
    assert 1.7<=m['width']<=1.9 and 4.2<=m['length']<=4.6 and 1.3<=m['height']<=1.8
assert plan['landmarks']==[{'id':'restaurant_arch_pylon','shape':'double_arch','height':9.0}]
output_dir.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def mat(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
paint=mat('vehicle_paint',(0.72,.75,.75),.46,.27);glass=mat('vehicle_glass',(.055,.11,.14),.28,.18)
rubber=mat('rubber',(.025,.029,.033),0,.86);metal=mat('metal',(.47,.5,.49),.72,.28)
red=mat('brake_lamps',(.69,.025,.015),.12,.3);white=mat('head_lamps',(.83,.86,.76),.2,.25)
dark=mat('grille',(.035,.043,.042),.15,.55);yellow=mat('yellow_arch',(.98,.63,.025),.08,.35)
pole=mat('sign_post',(.45,.45,.42),.2,.6);burgundy=mat('sign_panel',(.57,.06,.035),.12,.5)

def parent(name):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o

def cube(parent,name,loc,dim,material,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft corners','BEVEL');mod.width=bevel;mod.segments=2
        mod2=o.modifiers.new('Corner normals','WEIGHTED_NORMAL');mod2.keep_sharp=True
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod2.name)
    o.data.materials.append(material);o.parent=parent;return o

def body_shape(root,name,stations,material):
    # y runs from rear to front; each cross section follows an eight-sided body.
    verts=[]
    for y,w,bottom,shoulder,top in stations:
        verts.extend([(-w*.43,y,bottom),(-w*.50,y,bottom+.13),(-w*.50,y,shoulder),(-w*.40,y,top),
                      (w*.40,y,top),(w*.50,y,shoulder),(w*.50,y,bottom+.13),(w*.43,y,bottom)])
    faces=[]
    for k in range(len(stations)-1):
        for i in range(8):faces.append((k*8+i,k*8+(i+1)%8,(k+1)*8+(i+1)%8,(k+1)*8+i))
    faces.extend([tuple(reversed(tuple(range(8)))),tuple((len(stations)-1)*8+i for i in range(8))])
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.parent=root;o.data.materials.append(material)
    bevel=o.modifiers.new('Soft body edges','BEVEL');bevel.width=.06;bevel.segments=2
    norm=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name);bpy.ops.object.modifier_apply(modifier=norm.name);o.select_set(False)
    return o

def wheel(root,x,y):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.32,depth=.21,location=(x,y,.34),rotation=(0,math.pi/2,0));o=bpy.context.object;o.name='wheel';o.data.materials.append(rubber);o.parent=root
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.17,depth=.216,location=(x,y,.34),rotation=(0,math.pi/2,0));o=bpy.context.object;o.name='wheel_rim';o.data.materials.append(metal);o.parent=root

def car(spec):
    name=spec['id'];root=parent('car_'+name);suv=spec['shape']=='suv';style=spec['profile'];W=spec['width'];H=spec['height'];L=spec['length']
    rear_width={'executive':.84,'sport':.88,'family':.83,'vshape':.84,'electric':.82,'compact':.85,'coupe':.91}[style]
    nose_height={'executive':.70,'sport':.66,'family':.64,'vshape':.65,'electric':.61,'compact':.64,'coupe':.59}[style]
    stations=[(-L*.5,W*rear_width,.27,.64,.75),(-L*.35,W*.98,.27,.72,.89),(-L*.17,W,.27,.73,.90),(L*.23,W,.27,.73,.88),(L*.41,W*.94,.27,.65,.78),(L*.5,W*.83,.3,.58,nose_height)]
    body_shape(root,'paint_body',stations,paint)
    roofback=(-.65 if suv else -.46)+{'executive':0,'sport':-.07,'family':.06,'vshape':0,'electric':.19,'compact':-.05,'coupe':.24}[style]
    roofend=(.61 if suv else .46)+{'executive':.04,'sport':-.08,'family':.09,'vshape':.03,'electric':-.02,'compact':.07,'coupe':-.10}[style]
    stations2=[(-1.15,W*.78,.79,.88,.92),(roofback,W*.76,.83,H-.10,H),(roofend,W*.76,.83,H-.10,H),(1.17,W*.78,.79,.88,.92)]
    body_shape(root,'windows',stations2,glass)
    cube(root,'paint_roof',(0,(roofback+roofend)/2,H+.015),(W*.77,roofend-roofback+.08,.06),paint,.02)
    for x in (-W*.485,W*.485):
        for y in (-1.38,1.38):wheel(root,x,y)
        cube(root,'side_sill',(x,0,.37),(.05,3.1,.1),dark,.02)
        cube(root,'mirror',(x*1.13,.75,1.03),(.19,.28,.12),paint,.03)
        cube(root,'door_handle',(x*1.01,-.05,.78),(.035,.26,.04),metal,.01)
        cube(root,'window_pillar',(x*.78,-.03,1.08),(.04,.06,.56),dark)
    cube(root,'rear_window_strip',(0,-L*.505,.76),(1.48,.035,.1),dark,.01)
    for x in (-.62,.62):
        cube(root,'brake_lamps',(x,-L*.508,.72),(.43,.05,.14),red,.025)
        cube(root,'head_lamps',(x,L*.503,nose_height-.025),(.43,.05,.10),white,.02)
        if style in ('sport','compact'):
            cube(root,'rear_light_leg',(x+(-.16 if x<0 else .16),-L*.51,.78),(.10,.035,.20),red,.015)
    if style=='sport':
        for x in (-.21,.21):
            cube(root,'front_grille_frame',(x,L*.507,.52),(.36,.04,.27),metal,.03)
            cube(root,'front_grille',(x,L*.513,.52),(.29,.04,.21),dark,.02)
    elif style=='vshape':
        cube(root,'front_grille',(0,L*.507,.51),(.80,.04,.21),dark,.03)
        for x in (-.42,.42):cube(root,'front_grille_edge',(x,L*.514,.51),(.06,.035,.25),metal,.02)
    elif style!='electric':
        cube(root,'front_grille',(0,L*.505,.51),(1.05,.04,.18),dark,.02)
        if style in ('executive','family','compact'):
            for z in (.46,.52,.58):cube(root,'grille_strip',(0,L*.515,z),(1.02,.025,.025),metal,.005)
    if style in ('electric','coupe'):
        cube(root,'rear_light_bar',(0,-L*.51,.74),(1.28,.035,.07),red,.01)
    if style=='compact':
        for x in (-.7,.7):cube(root,'rear_light_vertical',(x,-L*.51,.81),(.09,.035,.27),red,.01)
    cube(root,'plate',(0,-L*.513,.48),(.40,.03,.14),white,.01)
    cube(root,'front_plate',(0,L*.513,.43),(.40,.03,.14),white,.01)
    return root

roots=[car(m) for m in plan['models']]
# Standalone gold double-arch pylon, origin at ground and dimensions in metres.
arch=parent('restaurant_arch_pylon');cube(arch,'sign_post',(0,0,3.6),(.34,.34,7.2),pole,.04)
cube(arch,'sign_panel',(0,0,7.35),(3.1,.32,1.15),burgundy,.06)
for side in (-1,1):
    # Thin tube arches remain recognizable from either side of the road.
    pts=[]
    for i in range(17):
        t=math.pi*i/16;pts.append((side*.72+.72*math.cos(t),0,7.48+1.55*math.sin(t)))
    curve=bpy.data.curves.new('arch_curve','CURVE');curve.dimensions='3D';curve.bevel_depth=.12;curve.bevel_resolution=2
    spline=curve.splines.new('POLY');spline.points.add(len(pts)-1)
    for p,co in zip(spline.points,pts):p.co=(*co,1)
    o=bpy.data.objects.new('gold_arch',curve);bpy.context.collection.objects.link(o);o.parent=arch;o.data.materials.append(yellow)
roots.append(arch)
# Store the editable asset library with an actual orthographic render setup.
for o in bpy.context.scene.objects:
    if o.type in ('MESH','CURVE') and o.parent and o.parent.name!='car_benz_sedan':o.hide_render=True
bpy.ops.object.light_add(type='AREA',location=(2,-4,8));bpy.context.object.data.energy=1100;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=8
bpy.ops.object.camera_add(location=(7,-8,4.1));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=7.6;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.world.color=(.28,.28,.28);scene.render.image_settings.file_format='PNG';scene.render.filepath=str(output_dir/'vehicle-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(output_dir/'commute-assets.blend'))
bpy.ops.render.render(write_still=True)
# Export only intended asset objects, without preview camera or light.
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for o in root.children:o.hide_render=False;o.hide_set(False);o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(output_dir/'commute-assets.glb'),export_format='GLB',use_selection=True,export_apply=True)
print('ASSETS_BUILT',len(plan['models']),'vehicles and sign')
