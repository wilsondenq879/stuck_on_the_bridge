import bpy, json, pathlib, sys, base64
import numpy as np
source,out=map(pathlib.Path,sys.argv[sys.argv.index('--')+1:][:2]);out.mkdir(parents=True,exist_ok=True);d=json.loads(source.read_text());assert set(d)=={'id','objects'}
assert d['id'] in {'zhubei-tsmc','zhubei-mediatek','erchong-tsmc','erchong-mediatek','guanxin-tsmc','guanxin-mediatek','tsmc-guanxin','mediatek-guanxin'}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);groups={}
for obj in d['objects']:
 assert set(obj)=={'name','color','vertices','colors'} and isinstance(obj['color'],int)
 verts=np.frombuffer(base64.b64decode(obj['vertices'],validate=True),dtype='<f4').reshape((-1,3));assert len(verts)%3==0 and np.isfinite(verts).all()
 color=np.frombuffer(base64.b64decode(obj['colors'],validate=True),dtype='<f4').reshape((-1,3)) if obj['colors'] else None
 if color is not None:assert color.shape==verts.shape
 key=(obj['color'],color is not None);group=groups.setdefault(key,{'verts':[],'colors':[]});group['verts'].append(verts)
 if color is not None:group['colors'].append(color)
for (hexcol,vertex_colors),parts in groups.items():
 vertices=np.concatenate(parts['verts']);co=vertices[:,[0,2,1]].copy();co[:,1]*=-1
 mesh=bpy.data.meshes.new('terrain');mesh.vertices.add(len(co));mesh.vertices.foreach_set('co',co.reshape(-1));mesh.loops.add(len(co));mesh.loops.foreach_set('vertex_index',np.arange(len(co),dtype=np.int32));count=len(co)//3;mesh.polygons.add(count);mesh.polygons.foreach_set('loop_start',np.arange(count,dtype=np.int32)*3);mesh.polygons.foreach_set('loop_total',np.full(count,3,dtype=np.int32));mesh.update()
 def linear(v):
  v=v/255;return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
 mat=bpy.data.materials.new('terrain_color' if vertex_colors else 'terrain_%06x'%hexcol);mat.diffuse_color=(linear((hexcol>>16)&255),linear((hexcol>>8)&255),linear(hexcol&255),1);mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.98
 if vertex_colors:
  rgb=np.concatenate(parts['colors']);rgba=np.ones((len(rgb),4),np.float32);rgba[:,:3]=rgb;attr=mesh.color_attributes.new(name='TerrainColour',type='FLOAT_COLOR',domain='POINT');attr.data.foreach_set('color',rgba.reshape(-1));node=mat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='TerrainColour';mat.node_tree.links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
 else:bsdf.inputs['Base Color'].default_value=mat.diffuse_color
 o=bpy.data.objects.new('dem' if vertex_colors else 'terrain',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=str(out/(d['id']+'-terrain.blend')));bpy.ops.export_scene.gltf(filepath=str(out/(d['id']+'-terrain.glb')),export_format='GLB',export_apply=True)
print('TERRAIN_EXPORTED',d['id'],len(groups))
