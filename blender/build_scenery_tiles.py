import bpy, pathlib, sys, json, math
from mathutils import Vector
import numpy as np
args=sys.argv[sys.argv.index('--')+1:];source,output=map(pathlib.Path,args[:2]);output.mkdir(parents=True,exist_ok=True)
allowed={'zhubei-tsmc','zhubei-mediatek','erchong-tsmc','erchong-mediatek','guanxin-tsmc','guanxin-mediatek','tsmc-guanxin','mediatek-guanxin'}
assert source.stem in allowed and source.suffix=='.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source));bpy.context.view_layer.update()
# Generated house facades and distant signs are smaller on phones.  Reduce
# decoded texture memory before packing; geometry and mapped locations stay intact.
for image in bpy.data.images:
 w,h=image.size
 if w==256 and h>=384:image.scale(128,max(1,h//2))
 elif w>=1024:image.scale(512,max(1,round(h*512/w)))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];groups={};widest=0
for o in meshes:
 ancestry=[];parent=o.parent
 while parent is not None and len(ancestry)<8:ancestry.append(parent.name);parent=parent.parent
 if any('leaf' in name.lower() or '樹冠' in name for name in ancestry):
  for face in o.data.polygons:face.use_smooth=True
 if o.name.startswith(('關新路・灰色瀝青','關新路・路邊停車帶')) and len(o.data.loops):
  layer=o.data.uv_layers.active or o.data.uv_layers.new(name='road_uv');uv=np.empty((len(o.data.loops),2),np.float32)
  for i,loop in enumerate(o.data.loops):
   v=o.matrix_world @ o.data.vertices[loop.vertex_index].co;uv[i]=(v.x/6,-v.y/6)
  layer.data.foreach_set('uv',uv.reshape(-1))
 points=[o.matrix_world @ Vector(corner) for corner in o.bound_box]
 if not points:continue
 x0=min(p.x for p in points);x1=max(p.x for p in points);z0=min(-p.y for p in points);z1=max(-p.y for p in points)
 extent=max(x1-x0,z1-z0);key=('global','global') if extent>600 else (math.floor((x0+x1)/1000),math.floor((z0+z1)/1000));groups.setdefault(key,[]).append((o,o.matrix_world.copy()));widest=max(widest,extent)
print('SCENERY_OBJECTS',source.stem,len(meshes),'tiles',len(groups),'max_extent',round(widest),flush=True)
roots={}
for (x,z),objects in groups.items():
 root=bpy.data.objects.new('tile_%s_%s'%(x,z),None);bpy.context.collection.objects.link(root);roots[(x,z)]=root
 for o,matrix in objects:o.parent=root;o.matrix_world=matrix
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output/(source.stem+'-scenery.blend')))
tile_dir=output/'tiles'/source.stem;tile_dir.mkdir(parents=True,exist_ok=True);manifest={'id':source.stem,'tileSize':500,'tiles':[]}
for (x,z),objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT');roots[(x,z)].select_set(True)
 for o,_ in objects:o.select_set(True)
 filename='global.glb' if x=='global' else 'tile_%s_%s.glb'%(x,z)
 bpy.ops.export_scene.gltf(filepath=str(tile_dir/filename),export_format='GLB',export_apply=True,use_selection=True,export_gpu_instances=True,use_mesh_edges=True)
 if x=='global':manifest['global']=filename
 else:manifest['tiles'].append({'x':x,'z':z,'file':filename})
(tile_dir/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
print('SCENERY_EXPORTED',source.stem,len(manifest['tiles']),flush=True)
