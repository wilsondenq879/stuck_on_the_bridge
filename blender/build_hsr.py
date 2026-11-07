"""Blender -b --factory-startup -P blender/build_hsr.py. Metres, +X along track."""
import bpy, math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
# One vertex-painted mesh per reusable part: shared, untextured, one draw per batch.
mat=bpy.data.materials.new('Mineral concrete and train enamel')
mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF'); att=mat.node_tree.nodes.new('ShaderNodeVertexColor');att.layer_name='Livery'
mat.node_tree.links.new(att.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.62
vs=[];faces=[];cols=[]
def solid(rings, colour, bands=None):
    base=len(vs);n=len(rings[0]);vs.extend(v for ring in rings for v in ring)
    def face(ix,c):faces.append(tuple(base+i for i in ix));cols.append(c)
    face(range(n-1,-1,-1),colour)
    for k in range(len(rings)-1):
        for j in range(n):
            i=k*n+j;t=k*n+(j+1)%n;face((i,t,t+n,i+n),(bands or {}).get(j,colour))
    face(range((len(rings)-1)*n,len(rings)*n),colour)
def ribbon(lo,hi,section,c,bands=None):
    solid([[(x,y,z) for y,z in section] for x in (lo,hi)],c,bands)
def box(x,y,z,dx,dy,dz,c):
    ribbon(x-dx/2,x+dx/2,[(y-dy/2,z-dz/2),(y+dy/2,z-dz/2),(y+dy/2,z+dz/2),(y-dy/2,z+dz/2)],c)
def finish(name):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat)
    attr=mesh.color_attributes.new(name='Livery',type='BYTE_COLOR',domain='CORNER');mesh.color_attributes.active_color=attr
    for p,c in zip(mesh.polygons,cols):
        col=tuple(int(c[i:i+2],16)/255 for i in (0,2,4))+(1.,)
        for j in p.loop_indices:attr.data[j].color_srgb=col
    vs.clear();faces.clear();cols.clear();return obj
stone='b6b6ac';edge='d4d2c5';metal='8c9491'
# Forty metre segment: box girder, inspection kerb, twin rails, electrification.
ribbon(-20,20,[(-3.7,8.25),(3.7,8.25),(4.5,10.1),(6.25,10.55),(6.25,11),(-6.25,11),(-6.25,10.55),(-4.5,10.1)],stone,{0:'969a91',4:'8b8e85'})
for side in [-1,1]:
    box(0,side*6.02,11.44,40,.38,.88,edge);box(0,side*6.02,11.91,40,.47,.10,'e2dfd3')
    for offset in [-.7175,.7175]:box(0,side*3+offset,11.15,40,.13,.16,metal)
    box(-18,side*5.6,14.4,.16,.16,6.8,metal);box(-18,side*4.24,17.45,.13,2.85,.14,metal)
    box(0,side*3,16.91,40,.043,.045,'59605f')
    box(-18,side*3,17.19,.055,.055,.58,'424b49')
span=finish('Span')
box(-20,0,4,2.9,3.7,8.4,'aaa99f')
ribbon(-21.65,-18.35,[(-1.85,6.2),(1.85,6.2),(4.25,7.8),(4.25,8.24),(-4.25,8.24),(-4.25,7.8)],stone)
pier=finish('Pier')
white='f5f3e8';orange='ed6b21';glass='253d4b'
def carriage(cab):
    rings=[]
    slices=[(-12.2,1,1),(-11.8,1,1),(4.6,1,1),(6.6,.97,.94),(8.25,.87,.74),(10,.73,.48),(11.8,.45,.32),(12.35,.12,.22)] if cab else [(-12.2,.97,.99),(-11.85,1,1),(11.85,1,1),(12.2,.97,.99)]
    section=[(-1.45,.32),(1.45,.32),(1.65,.78),(1.68,1.22),(1.68,1.67),(1.65,2.94),(1.38,3.48),(.95,3.64),(-.95,3.64),(-1.38,3.48),(-1.65,2.94),(-1.68,1.67),(-1.68,1.22),(-1.65,.78)]
    for x,w,h in slices:rings.append([(x,y*w,.34+(z-.34)*h) for y,z in section])
    solid(rings,white,{0:'555955',1:'9ca6a4',3:orange,11:orange,13:'9ca6a4'})
    for side in (-1,1):
        for i in range(11 if cab else 15):
            x=-9.85+i*1.39
            # Side glazing tapers towards the roof, as does the body.
            ribbon(x-.48,x+.48,[(side*1.68,1.95),(side*1.69,1.95),(side*1.67,2.78),(side*1.66,2.78)],glass)
        for x in ([-11,3.8] if cab else [-11,11]):
            box(x,side*1.685,2.22,.8,.018,1.53,'bac2bf');box(x,side*1.701,2.4,.59,.024,.64,glass)
        if cab:
            solid([[(5,side*.18,3.65),(5,side*1.14,3.56),(6.9,side*1.27,3.21),(8.4,side*.85,2.76),(8.3,side*.12,2.81)]],glass)
            box(10,side*.99,1.65,.72,.16,.13,'fff4c8')
    for x in (-8.7,8):box(x,0,.34,2.6,2.5,.60,'404846')
    if not cab:box(0,0,3.7,4,1.9,.15,'a2a5a1')
    return finish('Cab' if cab else 'Coach')
cab=carriage(True);coach=carriage(False)
# Keep modules separated in the editable source; runtime uses their local meshes.
cab.location.y=13;coach.location.y=20
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'blender'/'hsr.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(root/'dist/assets/hsr.glb'),export_format='GLB',export_yup=True,export_animations=False)
