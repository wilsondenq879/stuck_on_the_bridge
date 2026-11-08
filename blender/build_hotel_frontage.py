"""Hotel frontage in game metres. OSM building 367537863; facade heights are approximate."""
from pathlib import Path
import math
import bpy
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Origin on the roadside facade. Local X points along Guangming 6th towards the junction.
axis=Vector((.937,-.349,0)); inward=Vector((.349,.937,0))
origin=Vector((181,381,0))
def pos(x,y,z):return origin+axis*x+inward*y+Vector((0,0,z))
def mat(name,rgb):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);return m
stone=mat('淡色石材',(.47,.40,.32));edge=mat('暖灰柱框',(.62,.58,.49))
glass=mat('藍灰帷幕玻璃',(.13,.225,.25));dark=mat('門廊金屬',(.075,.095,.10));gold=mat('暖金招牌',(.95,.73,.34))
pieces=[]
def box(name,x,y,z,width,depth,height,m):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos(x,y,z))
    o=bpy.context.object;o.name=name;o.rotation_euler.z=math.atan2(axis.y,axis.x)
    o.scale=(width,depth,height);o.data.materials.append(m);pieces.append(o)
def sign(name,x,y,z,size,m):
    curve=bpy.data.curves.new(name,'FONT');curve.body=name;curve.size=size;curve.font=font;curve.align_x='CENTER';curve.align_y='CENTER';curve.extrude=.018
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.location=pos(x,y,z)
    o.rotation_euler=(math.pi/2,0,math.atan2(axis.y,axis.x));o.data.materials.append(m)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);pieces.append(o)
font=bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')
for x,w,h in [(12,27,52),(44,27,57)]:
    box('客房塔樓',x,30,h/2,w,25,h,stone)
    box('面街窗帶',x,17.42,(h+18)/2,w-.8,.22,h-18,glass)
    for k in range(9):box('窗間豎框',x+(k-4)*(w-.8)/9,17.22,(h+18)/2,.38,.37,h-18,edge)
    for level in range(20,int(h),3):box('樓板線',x,17.17,level,w-.6,.46,.32,stone)
    box('冠頂',x,30,h+.35,w+.7,25.7,.7,edge)
box('迎賓雨棚',23,-3,5.55,22,9,.7,dark)
for x in (13.3,32.7):box('雨棚柱',x,-6,2.75,.6,.7,5.5,stone)
box('飯店門廊招牌',23,-7.55,6.65,21,.30,2.0,dark)
bpy.ops.object.select_all(action='DESELECT');sign('喜來燈大飯店',23,-7.73,6.72,1.48,gold)
box('屋頂招牌背板',44,17,52.7,21,.55,3.6,dark)
bpy.ops.object.select_all(action='DESELECT');sign('喜來燈',44,16.67,52.8,2.8,gold)
bpy.ops.object.select_all(action='DESELECT')
for o in pieces:o.select_set(True)
bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join()
bpy.context.object.name='光明六路・飯店門廊與雙塔'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/hotel-frontage.blend'),compress=True)
# The street district loader displays this landmark near the hotel.
import sys
bpy.ops.export_scene.gltf(filepath=str(Path(sys.argv[-1]).resolve()),export_format='GLB',export_animations=False)
