"""Reference: KCIS Hsinchu SchoolInfo facilities_08, school traffic diagram,
OSM campus service ways and footprints, supplied Guanxin Street View and
the 2020-08-28 Wikimedia photograph of the Jieshou Road gateway."""
import bpy, json, pathlib, math, random, bisect
from mathutils import Vector
from collections import defaultdict
root=pathlib.Path(__file__).resolve().parents[1]
d=json.loads((root/'dist/data/routes/guanxin-tsmc.json').read_text())
g=json.loads((root/'dist/corridor-data.js').read_text()[15:].strip().rstrip(';'))
rng=random.Random(8952)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
parts=defaultdict(lambda:[[],[],[]])
zone='city'
def h(x,z):
 u=(x-g['x0'])/g['step'];v=(z-g['z0'])/g['step'];i=math.floor(u);j=math.floor(v)
 if not(0<=i<g['nx']-1 and 0<=j<g['nz']-1):return 0
 k=j*g['nx']+i;a=g['cm'];t=u-i;f=v-j
 return ((1-f)*(a[k]*(1-t)+a[k+1]*t)+f*(a[k+g['nx']]*(1-t)+a[k+g['nx']+1]*t))*.01
def mesh(pts,faces,c):
 x,z,_=pts[0];v,fs,cs=parts[(zone,int(x//240),int(z//240))];n=len(v)
 v.extend((x,-z,y) for x,z,y in pts);fs.extend(tuple(n+i for i in f) for f in faces);cs.extend([c]*len(pts))
def frame(x,z,dx,dz):
 l=math.hypot(dx,dz);return x,z,dx/l,dz/l
def at(a,u,v):x,z,dx,dz=a;return x+u*dx-v*dz,z+u*dz+v*dx
def block(a,u,v,b,w,dz,ht,c):
 pts=[(*at(a,u+i*w/2,v+j*dz/2),b+k*ht) for k in [0,1] for j in [-1,1] for i in [-1,1]]
 mesh(pts,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],c)
def rings(x,z,b,profile,c,n=10):
 pts=[(x+rx*math.cos(i*2*math.pi/n),z+rz*math.sin(i*2*math.pi/n),b+y) for y,rx,rz in profile for i in range(n)]
 mesh(pts,[(k*n+i,(k+1)*n+i,(k+1)*n+(i+1)%n,k*n+(i+1)%n) for k in range(len(profile)-1) for i in range(n)],c)
def tree(x,z,size):
 b=h(x,z);rings(x,z,b,[(0,.18,.22),(size*.7,.13,.13)],'625548',6)
 for i in range(3):
  q=size*rng.uniform(.25,.42);rings(x+rng.uniform(-1,1)*q*.4,z+rng.uniform(-1,1)*q*.4,b+size*.43+i*.22*size,[(0,.18*q,.15*q),(.32*q,q,.9*q),(q,.85*q,.8*q),(1.45*q,.03,.03)],rng.choice(['466746','5c7850','64824d','3b6045','738758']),9)
def face(a,u,v,w,b,c):
 block(a,u,v,b,w,.18,2.6,c)
 for off in [-.44,0,.44]:block(a,u+w*off,v-.14,b,.12,.18,2.6,'b7b8ab')
font=bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')
def label(a,u,v,b,w,words,color='efeacb'):
 x,z=at(a,u,v);curve=bpy.data.curves.new(words,'FONT');curve.body=words;curve.font=font;curve.align_x='CENTER';curve.align_y='CENTER';ob=bpy.data.objects.new(words,curve);bpy.context.collection.objects.link(ob)
 ob.location=(x,-z,b);ob.rotation_euler=(math.pi/2,0,math.atan2(-a[3],a[2])+math.pi)
 # Letters face local -v (the roadway); reverse local X to face the viewer.
 ob.rotation_euler.z=math.atan2(-a[3],a[2])+math.pi
 bpy.context.view_layer.update();factor=w/max(.01,ob.dimensions.length);ob.scale=(factor,)*3
 mat=bpy.data.materials.get('ink'+color) or bpy.data.materials.new('ink'+color);mat.diffuse_color=(*[int(color[i:i+2],16)/255 for i in (0,2,4)],1);ob.data.materials.append(mat)
# Opposite shop row faces north towards the T; road axis increases eastward.
a=frame(-810.7,3767.1,.90,.43)
names=['早餐研究所','鐘錶眼鏡','三溪通訊','足下工房','茶水間','機車行','小林藥局','印相館','便當所','手機快修','電腦商行']
for i,name in enumerate(names):
 u=(i-5)*6.5;v=14.7+rng.uniform(-.35,.35);top=rng.choice([9.2,11.8,14.6]);c=rng.choice(['bbada0','aaa89a','a59a91','c4beac'])
 block(a,u,v+3,0,6.42,6,top,c)
 for y in range(5,int(top),3):face(a,u,v-.12,5.6,y,'667b7c')
 face(a,u,v-.15,5.8,.25,'314f55');block(a,u,v-.45,2.9,6.45,1.35,.3,'d5c6aa')
 block(a,u,v-.38,3.26,6.32,.35,1.45,['1b5347','a34d31','325884','873d36','c0a25d'][i%5]);label(a,u,v-.60,3.97,5.2,name)
 # Window pairs, tiled balcony aprons, metal shutters and wall-mounted AC.
 for floor in range(5,int(top),3):
  block(a,u,v-.22,floor,.52,.22,2.62,c)
  block(a,u-2.15,v-.36,floor-.45,1.07,.6,.62,'b8b5a3')
  for k in range(5):block(a,u-2.15,v-.67,floor-.38+k*.095,.79,.03,.034,'696d68')
 if i in [2,7,9]:
  for k in range(16):block(a,u+1.4,v-.28,.22+k*.155,2.55,.1,.13,'91958f')
 else:
  block(a,u-1.2,v-.36,.3,2,.18,.6,'ad9b75')
  for k in range(3):block(a,u-1.6+k*.45,v-.49,1.25,.38,.06,.56,['dbb461','d8d8c5','a19c85'][k])
 if i%3==0:block(a,u+2.6,v-.75,5,.6,1.5,2.8,'c1844e')
# 24-storey three-wing residential complex: audited 24-floor mapped group.
buildings=json.loads((root/'dist/data/guanxin.json').read_text())['buildings']
for b in buildings:
 if b['osmWayId'] not in (827280591,827280592,827280593):continue
 for p,q in zip(b['points'],b['points'][1:]):
  dx=q['x']-p['x'];dz=q['z']-p['z'];l=math.hypot(dx,dz)
  if l<8:continue
  a=frame((p['x']+q['x'])/2,(p['z']+q['z'])/2,dx,dz)
  for floor in range(2,25):
   block(a,0,0,3.2*floor,l+.22,.86,.28,'d9ceba')
   if floor%4==0:block(a,0,0,3.2*floor+.28,l,.65,.38,'8f8174')
  for u in [-l*.45,0,l*.45]:block(a,u,0,3,.55,1,76,'bbad96')
  block(a,0,0,79,l,.85,.85,'baa98c')
# Estate name on the public street-side wing.
label(frame(-600.0,3328.6,.65,.76),0,0,72,8,'壹集')
# Terrain apron under the Blender road surface. Limit vertex count to active cells.
zone='hill'
for j in range(g['nz']-1):
 for i in range(g['nx']-1):
  x=g['x0']+g['step']*i;z=g['z0']+g['step']*j;pts=[(x+u*g['step'],z+v*g['step']) for u,v in [(0,0),(1,0),(1,1),(0,1)]]
  if any(h(*p)>.02 for p in pts):mesh([(*p,h(*p)-.9) for p in pts],[(0,3,2,1)],'829070')
# Snap vegetation to the terrain but exclude every mapped carriageway and campus court.
roads=[r['points'] for r in d['surroundingRoads']]+[d['points'],d['bikePoints']];cells=defaultdict(list)
for pts in roads:
 for p,q in zip(pts,pts[1:]):
  x,z=p['x'],p['z'];dx=q['x']-x;dz=q['z']-z
  for i in range(math.floor((min(x,x+dx)-15)/50),math.floor((max(x,x+dx)+15)/50)+1):
   for j in range(math.floor((min(z,z+dz)-15)/50),math.floor((max(z,z+dz)+15)/50)+1):cells[i,j].append((x,z,dx,dz))
def safe(x,z):
 for a,b,dx,dz in cells[x//50,z//50]:
  t=max(0,min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz or 1)))
  if math.hypot(x-a-dx*t,z-b-dz*t)<13:return False
 return True
for p,q in zip(d['points'],d['points'][1:]):
 hill=p['road']=='柴橋路';park=p['road'] in ['園區一路','介壽路','園區二路','力行六路','園區三路']
 if not hill and not park:continue
 zone='hill' if hill else 'park';a=frame(p['x'],p['z'],q['x']-p['x'],q['z']-p['z'])
 for side in [-1,1]:
  for _ in range(2 if hill else 1):
   x,z=at(a,rng.uniform(-2,2),side*rng.uniform(15,48 if hill else 25))
   if safe(x,z) and not(-6125<x<-5950 and 5290<z<5480):tree(x,z,rng.uniform(5,10))
# Add setbacks, spandrels and continuous glazed bands to actual park footprints.
zone='park'
for b in d['buildings']:
 x=sum(p['x'] for p in b['points'])/len(b['points']);z=sum(p['z'] for p in b['points'])/len(b['points'])
 if not (-1650<x<-300 and 3980<z<5250):continue
 outline=b['points'][:-1]
 if not all(safe(p['x'],p['z']) for p in outline):continue
 body=[(x+.98*(p['x']-x),z+.98*(p['z']-z),y) for y in [0,(b.get('height') or 12)-.18] for p in outline];n=len(outline)
 mesh(body,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(range(n,2*n))],'a4a99e')
 for p,q in zip(b['points'],b['points'][1:]):
  dx=q['x']-p['x'];dz=q['z']-p['z'];l=math.hypot(dx,dz)
  if l<10:continue
  a=frame((p['x']+q['x'])/2,(p['z']+q['z'])/2,dx,dz)
  if not safe(a[0],a[1]):continue
  for y in range(2,min(32,int(b.get('height') or 12)),4):block(a,0,0,y,l,.52,1.8,'536e76');block(a,0,0,y+1.8,l,.76,.25,'c5c5b9')
# White split mast and cable-supported twin signboards straddling Jieshou Road.
p=next(p for p in d['points'] if p['road']=='介壽路' and p['s']>889);q=d['points'][d['points'].index(p)+1]
dx,dz=q['x']-p['x'],q['z']-p['z'];a=frame(p['x'],p['z'],-dz,dx)
def beam(a,u,v,b,U,V,B,w,c):
 x,z=at(a,u,v);X,Z=at(a,U,V);av=Vector((x,z,b));bv=Vector((X,Z,B));along=(bv-av).normalized();right=along.cross(Vector((0,0,1)))
 if right.length<.001:right=Vector((1,0,0))
 right.normalize();up=along.cross(right).normalized()
 pts=[tuple(center+right*du*w/2+up*dv*w/2) for center in [av,bv] for du,dv in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 mesh(pts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],c)
mid=-(p['lanes'] or 2)*3.35/2-.65
for side in [-1,1]:
 beam(a,mid,0,0,mid+side*2.1,0,14,.56,'e1e1d8')
 beam(a,mid+side*2.1,0,13,mid+side*13,0,9.35,.08,'a5aaab')
 block(a,mid+side*7.3,0,7.2,14.4,.65,2.15,'bbbdb8')
 label(a,mid+side*7.3,-.36,8.27,10,'薪 築 瞌 學 圓 區','263e59')
zone='campus';court=g['court']
def strip(path,left,right,raise_y,c):
 pairs=[]
 for i,(x,z) in enumerate(path):
  a=path[max(0,i-1)];b=path[min(i+1,len(path)-1)];dx=b[0]-a[0];dz=b[1]-a[1];l=math.hypot(dx,dz) or 1
  pairs.append([(x-dz/l*t,z+dx/l*t) for t in [left,right]])
 for a,b in zip(pairs,pairs[1:]):
  pts=[a[0],a[1],b[1],b[0]];mesh([(*p,h(*p)+raise_y) for p in pts],[(0,1,2,3)],c)
strip(court,-2.85,2.85,.22,'595a55')
strip(court,-2.81,-2.67,.23,'d3ccad');strip(court,2.67,2.81,.23,'d3ccad')
# Rose-tile pavilion roofs, white arcade piers and apricot classroom wings.
o=d['origin'];meter=math.pi*6371008.8/180
def ll(lat,lon):return ((lon-o['lon'])*meter*math.cos(math.radians(o['lat'])),(o['lat']-lat)*meter)
for lat,lon,base in [(24.76902,120.96599,11),(24.76861,120.96604,11),(24.76840,120.96652,13),(24.76828,120.96663,13)]:
 x,z=ll(lat,lon);b=h(x,z)+base;a=frame(x,z,1,-.11)
 block(a,0,0,b,5.4,5.4,3.3,'dfb59a');block(a,0,0,b+3.15,6.05,6.05,.4,'f4e7ce')
 rings(x,z,b+3.55,[(0,4.1,4.1),(2.2,.16,.16)],'9a5045',4)
 for i in [-1.7,0,1.7]:block(a,i,-2.71,b+.48,1.1,.17,1.85,'547075')
# Match the shell edges used in the original Blender campus, including
# the recessed east facade facing the service loop. Loft broad window arches
# directly on both sides of each edge so they remain visible from the court.
campus_wings=[[409216512, 12, [[24.768417, 120.9656561], [24.7684391, 120.9657188], [24.7683863, 120.9661096], [24.7683437, 120.9661579], [24.7680734, 120.9661874], [24.7680094, 120.9661512], [24.7679048, 120.9658042], [24.7679012, 120.96573], [24.7679492, 120.9656839]]], [1230511824, 13, [[24.7680954, 120.9664146], [24.7682297, 120.9667087], [24.7682416, 120.9668202], [24.7683143, 120.9667987], [24.7684509, 120.9667209], [24.7684617, 120.9667478], [24.7686196, 120.9666648], [24.7684732, 120.9663466], [24.7684206, 120.9663751], [24.7683655, 120.9662662]]], [556926000, 9, [[24.7684999, 120.9668245], [24.7686162, 120.9670896], [24.7684132, 120.967223], [24.7682707, 120.9669183]]], [1290235203, 11, [[24.7690635, 120.965517], [24.769119, 120.966047], [24.7690761, 120.9661436], [24.7684527, 120.9662111], [24.7684109, 120.9663468], [24.7683807, 120.9662889], [24.7684033, 120.9662037], [24.7683881, 120.9661218], [24.7684048, 120.9659861], [24.768476, 120.9659976], [24.7684536, 120.9661253], [24.7685637, 120.9661103], [24.7685209, 120.9657251], [24.7685589, 120.9657198], [24.7685296, 120.9655224], [24.7685803, 120.9655127], [24.7685764, 120.9654912], [24.7687206, 120.9654719], [24.7687849, 120.966003], [24.7688901, 120.9659848], [24.7688355, 120.9655063], [24.7689953, 120.9654859], [24.7690011, 120.9655266]]]]
for way,ht,coords in campus_wings:
 poly=[ll(*pt) for pt in coords]
 for k,(x,z) in enumerate(poly):
  X,Z=poly[(k+1)%len(poly)];length=math.hypot(X-x,Z-z)
  if length<4:continue
  a=frame((x+X)/2,(z+Z)/2,X-x,Z-z);count=max(1,int(length/4));bay=length/count
  # Horizontal ledges and cream cornices on peach-coloured rendered walls.
  for y in [1,4.2,7.4,ht-.4,ht+.12]:
   for i in range(count):
    u=(i+.5-count/2)*bay;xx,zz=at(a,u,0);base=h(xx,zz)
    block(a,u,0,base+y,bay+.05,.63,.3,'eee5d4')
  for i in range(count):
   u=(i+.5-count/2)*bay;xx,zz=at(a,u,0);base=h(xx,zz)
   block(a,u,0,base+.4,bay+.02,.34,ht-.5,'d9b59d')
   block(a,u-bay*.47,0,base+.45,.28,.78,ht,'eee6da')
   for floor in [1.45,4.65,7.85]:
    if floor+1.7>ht:continue
    w=bay*.60
    block(a,u,0,base+floor,w,.52,1.7,'526e79')
    block(a,u,0,base+floor,.09,.62,1.7,'d6d5c8')
    block(a,u,0,base+floor+.96,w,.61,.10,'e2dacb')
    for side in [-1,1]:
     block(a,u+side*w*.53,0,base+floor-.04,.14,.69,1.73,'f6e8d5')
    # Peach spandrels above repeated pale arch mouldings.
    for j in range(6):
     t=math.pi*j/6;T=math.pi*(j+1)/6
     for v in [-.30,.30]:
      beam(a,u+w*.52*math.cos(t),v,base+floor+1.64+.46*math.sin(t),u+w*.52*math.cos(T),v,base+floor+1.64+.46*math.sin(T),.17,'f3e9db')
 # Square and round turrets punctuate the principal wings above the cornice.
 if way in (1290235203,1230511824):
  for idx in ([1,7,13] if way==1290235203 else [2,6]):
   x,z=poly[idx];base=h(x,z)+ht-.1;a=frame(x,z,1,0)
   rings(x,z,base,[(0,2.45,2.45),(3.7,2.45,2.45),(3.85,2.65,2.65)],'deb69d',8)
   for u in [-1.1,.65]:block(a,u,-2.27,base+.7,.75,.28,1.6,'506977')
   rings(x,z,base+3.82,[(0,2.8,2.8),(.28,2.8,2.8),(.3,2.65,2.65)],'f1e3ce',8)
   rings(x,z,base+4.12,[(0,2.7,2.7),(2.5,.12,.12)],'984e43',8)
# Small planted beds lie inside the court, clear of the one-way asphalt.
boundary=[ll(*p) for p in [(24.76901,120.96623),(24.76856,120.96628),(24.76855,120.96633),(24.76858,120.96639),(24.76863,120.96640)]]
cx=sum(x for x,z in boundary)/len(boundary);cz=sum(z for x,z in boundary)/len(boundary)
for scale,c,dy in [(1,'c2bbac',.25),(.91,'6c864f',.30)]:
 pts=[(cx+(x-cx)*scale,cz+(z-cz)*scale) for x,z in boundary]
 mesh([(*p,h(*p)+dy) for p in pts],[tuple(range(len(pts)))],c)
for lat,lon in [(24.76863,120.96631),(24.76871,120.966285),(24.76857,120.96634)]:
 x,z=ll(lat,lon);tree(x,z,3.8);rings(x,z,h(x,z),[(0,2.8,3.7),(.3,2.65,3.5),(.4,.1,.1)],'748755',14)
mat=bpy.data.materials.new('Street palette');mat.use_nodes=True
attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Paint';sh=mat.node_tree.nodes.get('Principled BSDF');mat.node_tree.links.new(attr.outputs['Color'],sh.inputs['Base Color']);sh.inputs['Roughness'].default_value=.84
from functools import lru_cache
@lru_cache(None)
def linear(s):
 rgb=[int(s[i:i+2],16)/255 for i in (0,2,4)];return [((x+.055)/1.055)**2.4 if x>.04045 else x/12.92 for x in rgb]+[1]
for (name,i,j),(v,f,c) in parts.items():
 m=bpy.data.meshes.new(name);m.from_pydata(v,[],f);m.update();a=m.color_attributes.new(name='Paint',type='BYTE_COLOR',domain='POINT');a.data.foreach_set('color',[n for s in c for n in linear(s)])
 ob=bpy.data.objects.new(f'{name}_{i}_{j}',m);bpy.context.collection.objects.link(ob);m.materials.append(mat)
out=root/'dist/assets/streets';out.mkdir(exist_ok=True);bpy.context.preferences.filepaths.save_version=0
for ob in list(bpy.context.scene.objects):
 if ob.type=='FONT':ob.name=('park' if '圓' in ob.name else 'city')+'_'+ob.name
bpy.ops.wm.save_as_mainfile(filepath=str(root/'blender/street-corridor.blend'),compress=True)
for name in ['campus','city','park','hill']:
 bpy.ops.object.select_all(action='DESELECT')
 for ob in bpy.context.scene.objects:ob.select_set(ob.name.startswith(name+'_'))
 bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),use_selection=True,export_format='GLB',export_yup=True)
# A gzip member per district keeps the tree canopy light enough for Pages.
import gzip
for file in out.glob('*.glb'):
 file.with_suffix('.glb.gz').write_bytes(gzip.compress(file.read_bytes(),compresslevel=9,mtime=0))
 file.unlink()
