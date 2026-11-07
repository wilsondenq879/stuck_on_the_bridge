"""Build the shared hill surface and the school service lane in game metres."""
import json, math, pathlib, bisect
root=pathlib.Path(__file__).resolve().parents[1]
d=json.loads((root/'dist/data/routes/guanxin-tsmc.json').read_text())
ps=d['points']; ss=[p['s'] for p in ps]
def xy(s):
 i=min(len(ps)-2,max(0,bisect.bisect_right(ss,s)-1)); a,b=ps[i:i+2];t=(s-a['s'])/(b['s']-a['s'])
 return [a[k]+t*(b[k]-a[k]) for k in ['x','z']]
# A regional DEM supplies relative relief. Feather it into the flat prototype
# beyond the hill corridor. Preserve a level court and the existing bridge deck relief.
spine=[(*xy(p['s']),max(0,p['y']-40)*min(1,(p['s']-8500)/480,(11900-p['s'])/550)) for p in d['elevationProfile'] if 8500<p['s']<11900]
step=24;x0=math.floor((min(p[0] for p in spine)-250)/step)*step;z0=math.floor((min(p[1] for p in spine)-250)/step)*step
nx=math.ceil((max(p[0] for p in spine)+250-x0)/step)+1;nz=math.ceil((max(p[1] for p in spine)+250-z0)/step)+1
def height(x,z):
 best=1e9;y=0
 for a,b in zip(spine,spine[1:]):
  dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz or 1)));dist=math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)
  if dist<best:best=dist;y=a[2]+(b[2]-a[2])*t
 fade=max(0,min(1,(215-best)/130));return round(100*y*fade*fade*(3-2*fade))
grid=[height(x0+i*step,z0+j*step) for j in range(nz) for i in range(nx)]
# Way 1230511825 connects to the closed one-way court 1230511826.
# Keep arrivals and departures on opposite halves of the shared access drive.
nodes=[(24.7692676,120.9656138),(24.7691726,120.9656220),(24.7691061,120.9656474),(24.7691647,120.9661560),(24.7691017,120.9661848),(24.7685459,120.9662459),(24.7685032,120.9663337),(24.7685402,120.9664321),(24.7686111,120.9664652)]
def project(ll):
 u=math.pi*6371008.8/180;o=d['origin'];return [(ll[1]-o['lon'])*u*math.cos(math.radians(o['lat'])),(o['lat']-ll[0])*u]
a=[project(n) for n in nodes];pts=[xy(d['schoolStop']['s']-7),a[0]]+a[1:]+[a[i] for i in [4,3,2,1,0]]+[xy(d['schoolStop']['s']+28)]
for i in [1,2,3,4,10,11,12,13,14]:
 dx=pts[i+1][0]-pts[i-1][0];dz=pts[i+1][1]-pts[i-1][1];k=1.7/math.hypot(dx,dz);pts[i]=[pts[i][0]-dz*k,pts[i][1]+dx*k]
for _ in range(3):
 pts=[pts[0]]+[[a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t] for a,b in zip(pts,pts[1:]) for t in [.25,.75]]+[pts[-1]]
payload=dict(x0=x0,z0=z0,nx=nx,nz=nz,step=step,cm=grid,court=[[round(x,3),round(z,3)] for x,z in pts])
(root/'dist/corridor-data.js').write_text('export default '+json.dumps(payload,separators=(',',':'))+';\n')
