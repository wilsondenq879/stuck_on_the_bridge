import bpy, json, pathlib, sys, base64
import numpy as np
args=sys.argv[sys.argv.index('--')+1:]; source, output = map(pathlib.Path,args[:2]);data=json.loads(source.read_text());output.mkdir(parents=True,exist_ok=True)
assert set(data)=={'id','tileSize','tiles'} and data['tileSize']==500
assert data['id'] in {'zhubei-tsmc','zhubei-mediatek','erchong-tsmc','erchong-mediatek','guanxin-tsmc','guanxin-mediatek','tsmc-guanxin','mediatek-guanxin','decathlon-sheraton'}
colors={'road':(0.061,0.08,0.082,1),'side':(0.31,0.35,0.30,1),'median':(0.55,0.55,0.42,1),'paint':(.76,.75,.59,1),'yellow':(.70,.46,.12,1),'metal':(.17,.21,.18,1),'leaf':(.12,.19,.11,1),'trunk':(.18,.16,.12,1)}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mats={}
for name,color in colors.items():
 mat=bpy.data.materials.new(name);mat.diffuse_color=color;mat.use_nodes=True
 p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=.9;mats[name]=mat
for tile in data['tiles']:
 assert set(tile)=={'x','z','meshes'} and isinstance(tile['x'],int) and isinstance(tile['z'],int)
 root=bpy.data.objects.new('tile_%s_%s'%(tile['x'],tile['z']),None);bpy.context.collection.objects.link(root);root.location=(tile['x']*500,-tile['z']*500,0)
 for m in tile['meshes']:
  assert set(m)=={'material','vertices'} and m['material'] in mats
  verts=np.frombuffer(base64.b64decode(m['vertices'],validate=True),dtype='<f4').reshape((-1,3));assert len(verts)%3==0 and np.isfinite(verts).all()
  co=verts[:,[0,2,1]].copy();co[:,1]*=-1
  mesh=bpy.data.meshes.new(m['material']);mesh.vertices.add(len(co));mesh.vertices.foreach_set('co',co.reshape(-1));mesh.loops.add(len(co));mesh.loops.foreach_set('vertex_index',np.arange(len(co),dtype=np.int32))
  polys=len(co)//3;mesh.polygons.add(polys);mesh.polygons.foreach_set('loop_start',np.arange(polys,dtype=np.int32)*3);mesh.polygons.foreach_set('loop_total',np.full(polys,3,dtype=np.int32));mesh.update()
  if m['material']=='road':
   uv=np.column_stack(((verts[:,0]+tile['x']*500)/6,(verts[:,2]+tile['z']*500)/6)).astype(np.float32)
   mesh.uv_layers.new(name='road_uv');mesh.uv_layers.active.data.foreach_set('uv',uv.reshape(-1))
  o=bpy.data.objects.new(m['material'],mesh);bpy.context.collection.objects.link(o);o.parent=root;o.data.materials.append(mats[m['material']])
bpy.ops.wm.save_as_mainfile(filepath=str(output/(data['id']+'.blend')))
tile_dir=output/'tiles'/data['id'];tile_dir.mkdir(parents=True,exist_ok=True)
manifest={'id':data['id'],'tileSize':500,'tiles':[]}
for tile in data['tiles']:
 root=bpy.data.objects['tile_%s_%s'%(tile['x'],tile['z'])];bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for obj in root.children:obj.select_set(True)
 filename='tile_%s_%s.glb'%(tile['x'],tile['z']);bpy.ops.export_scene.gltf(filepath=str(tile_dir/filename),export_format='GLB',export_apply=True,use_selection=True)
 manifest['tiles'].append({'x':tile['x'],'z':tile['z'],'file':filename})
(tile_dir/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
print('ROAD_BUILT',data['id'],len(data['tiles']))
