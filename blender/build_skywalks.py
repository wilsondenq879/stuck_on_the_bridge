"""Build the Ciyun and Puding 1st Road pedestrian bridges, in game world coordinates.
OSM ways 1570541975, 1570541981, 1570541984, 1570541965 (ODbL).
Heights and cladding are visual approximations from street and city photos.
"""
from pathlib import Path
import gzip
import math
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
origin = (121.0258456, 24.8170552)
metres = 6371008.8 * math.pi / 180

def point(lon, lat):
    return Vector(((lon-origin[0])*metres*math.cos(math.radians(origin[1])),
                   (lat-origin[1])*metres, 0))

def material(name, hex_color, metallic=0):
    mat = bpy.data.materials.new(name)
    rgb = [int(hex_color[i:i+2], 16)/255 for i in (0,2,4)]
    linear = tuple(((v+.055)/1.055)**2.4 if v>.04045 else v/12.92 for v in rgb) + (1,)
    mat.diffuse_color = linear
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = linear
    shader.inputs['Roughness'].default_value = .74
    shader.inputs['Metallic'].default_value = metallic
    return mat

cream = material('霧米白烤漆', 'eae3cc')
light = material('米白折板', 'ded7bf')
steel = material('藍灰色鋼構', '354653', .28)
screen = material('銀灰欄杆', '98aeb4', .32)
slab = material('混凝土', 'bdb9aa')
roof = material('屋面', '939b98')
class Span:
    def __init__(self, name, a, b, width):
        self.name, self.origin, self.width = name, a, width
        self.axis = (b-a).normalized()
        self.side = Vector((-self.axis.y, self.axis.x, 0))
        self.length = (b-a).length
        self.vertices, self.faces, self.colors = [], [], []
    def world(self, x,y,z):
        return self.origin + x*self.axis + y*self.side + Vector((0,0,z))
    def solid(self, low, high, mat):
        # Parallel rings, with both caps. Normals are recalculated before export.
        base=len(self.vertices); count=len(low)
        self.vertices.extend(self.world(*p) for p in low+high)
        faces=[tuple(reversed(range(count))),tuple(range(count,2*count))]
        for j in range(count):
            k=(j+1)%count
            faces.append((j,k,count+k,count+j))
        for f in faces:
            self.faces.append(tuple(base+i for i in f)); self.colors.append(mat)
    def box(self,x0,x1,y0,y1,z0,z1,mat):
        self.solid([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0)],
                   [(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],mat)
    def plate(self, points, y, thickness, mat):
        self.solid([(x,y,z) for x,z in points],[(x,y+thickness,z) for x,z in points], mat)
    def diagonal(self,x0,z0,x1,z1,y,t):
        dx,dz=x1-x0,z1-z0
        n=math.hypot(dx,dz);u,v=-dz*t/n/2, dx*t/n/2
        self.plate([(x0+u,z0+v),(x1+u,z1+v),(x1-u,z1-v),(x0-u,z0-v)],y,t,steel)
    def panel(self, tri, y, cut, shade):
        if not cut:
            self.plate(tri,y,.08,shade);return
        cx=sum(p[0] for p in tri)/3;cz=sum(p[1] for p in tri)/3
        hole=[(cx+(x-cx)*cut,cz+(z-cz)*cut) for x,z in tri]
        for i in range(3):
            j=(i+1)%3
            self.plate([tri[i],tri[j],hole[j],hole[i]],y,.08,shade)
    def facade(self, side):
        # The large trapezoidal opening flares at the deck, with fine
        # perforations in the surrounding folded cladding.
        L=self.length;y=side*(self.width/2+.12)
        for lo,hi,lo_top,hi_top,cols in [(0,.28,0,.36,4),(.61,1,.55,1,6)]:
            def corner(i,j):
                u=i/cols;v=j/2
                x=((lo+(hi-lo)*u)*(1-v)+(lo_top+(hi_top-lo_top)*u)*v)*L
                return x,6.56+3.65*v
            for i in range(cols):
                for j in range(2):
                    a,b,c,d=corner(i,j),corner(i+1,j),corner(i+1,j+1),corner(i,j+1)
                    for k,tri in enumerate(([a,b,c],[a,c,d]) if (i+j)%2 else ([a,b,d],[b,c,d])):
                        cut=[0,.49,0,.36,.56,0,.28][(i*5+j*2+k)%7]
                        self.panel(tri,y,cut,light if (i+3*j+k)%9==0 else cream)
    def build(self, ornate, supports):
        L=self.length;w=self.width/2
        self.box(0,L,-w,w,6.12,6.54,steel)
        self.box(0,L,-w+.05,w-.05,6.54,6.66,slab)
        self.box(0,L,-w-.06,w+.06,10.02,10.21,roof)
        for edge in (-w,w):
            self.box(0,L,edge-.09,edge+.09,9.91,10.17,steel)
            self.box(0,L,edge-.065,edge+.065,7.77,7.86,screen)
            for i in range(1,math.ceil(L/.28)):
                x=i*.28
                self.box(x-.022,x+.022,edge-.024,edge+.024,6.64,7.77,screen)
            bays=math.ceil(L/(5 if ornate else 3.5))
            for i in range(bays+1):
                x=i*L/bays
                self.box(x-.08,x+.08,edge-.08,edge+.08,6.52,10.04,steel)
                if ornate and i<bays:
                    self.diagonal(x,9.94 if i%2 else 6.63,x+L/bays,6.63 if i%2 else 9.94,edge,.18)
            if ornate:self.facade(1 if edge>0 else -1)
        for x in supports:
            self.box(x-.71,x+.71,-.87,.87,-.14,5.13,slab)
            self.solid([(x-.71,-.87,5.0),(x+.71,-.87,5.0),(x+.71,.87,5.0),(x-.71,.87,5.0)],
                       [(x-.83,-w+.12,6.15),(x+.83,-w+.12,6.15),(x+.83,w-.12,6.15),(x-.83,w-.12,6.15)],slab)
        mesh=bpy.data.meshes.new(self.name);mesh.from_pydata(self.vertices,[],self.faces);mesh.update()
        mats=list(dict.fromkeys(self.colors))
        for mat in mats:mesh.materials.append(mat)
        for poly,mat in zip(mesh.polygons,self.colors):poly.material_index=mats.index(mat)
        geometry=bmesh.new()
        geometry.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(geometry,faces=list(geometry.faces))
        geometry.to_mesh(mesh)
        geometry.free()
        obj=bpy.data.objects.new(self.name,mesh);bpy.context.collection.objects.link(obj)

# Three mapped ways form the I-shaped public walkway above Ciyun/Puding 3rd.
west=point(121.0116399,24.7906468);east=point(121.0119378,24.790476)
Span('慈雲主跨・鏤空折板',west,east,4.65).build(True,[])
for name,a,b in [
    ('慈雲西側連廊',point(121.0116791,24.7907548),point(121.0115994,24.7905354)),
    ('慈雲東側連廊',point(121.0118945,24.7903893),point(121.0119793,24.7905588)),
    ('埔頂一路・八號商場空橋',point(121.0127658,24.7926688),point(121.0128675,24.7929306))]:
    span=Span(name,a,b,5)
    span.build(False,[1,span.length-1])
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/retail-skywalks.blend'),compress=True)
asset=ROOT/'dist/assets/streets/retail-skywalks.glb.gz'
import tempfile
with tempfile.TemporaryDirectory() as tmp:
    glb=Path(tmp)/'skywalk.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_animations=False)
    asset.write_bytes(gzip.compress(glb.read_bytes(),mtime=0))
