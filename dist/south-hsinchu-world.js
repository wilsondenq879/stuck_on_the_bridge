import {makeGuanxinPark} from './guanxin-park.js?v=0.9.0';
import {drawText} from './game-text.js?v=0.8.2-puns';
import {makeGuanxin} from './guanxin-world.js?v=0.8.2-puns';
import * as THREE from './vendor/three.module.js';
import {seeded} from './geo.js?v=0.8.0';
import {intrudesRoad, pointInPolygon, rectangleFootprint} from './environment.js?v=0.8.0';
import {roadFrames, RoadClearance} from './road-geometry.js?v=0.8.0';

const campusSource='https://www.kcis.hc.edu.tw/HsinchuCampus/zh/location.html';
const schoolGate=[24.7691726,120.965622]; // OSM node 11411586504, 柴橋路側校門
// Simplified exterior vertices of the mapped school buildings and pitch, in WGS84.
const campusWings=[
  [409216512,12,[[24.768417,120.9656561],[24.7684391,120.9657188],[24.7683863,120.9661096],[24.7683437,120.9661579],[24.7680734,120.9661874],[24.7680094,120.9661512],[24.7679048,120.9658042],[24.7679012,120.96573],[24.7679492,120.9656839]]],
  [1230511824,13,[[24.7680954,120.9664146],[24.7682297,120.9667087],[24.7682416,120.9668202],[24.7683143,120.9667987],[24.7684509,120.9667209],[24.7684617,120.9667478],[24.7686196,120.9666648],[24.7684732,120.9663466],[24.7684206,120.9663751],[24.7683655,120.9662662]]],
  [556926000,9,[[24.7684999,120.9668245],[24.7686162,120.9670896],[24.7684132,120.967223],[24.7682707,120.9669183]]],
  [1290235203,11,[[24.7690635,120.965517],[24.769119,120.966047],[24.7690761,120.9661436],[24.7684527,120.9662111],[24.7684109,120.9663468],[24.7683807,120.9662889],[24.7684033,120.9662037],[24.7683881,120.9661218],[24.7684048,120.9659861],[24.768476,120.9659976],[24.7684536,120.9661253],[24.7685637,120.9661103],[24.7685209,120.9657251],[24.7685589,120.9657198],[24.7685296,120.9655224],[24.7685803,120.9655127],[24.7685764,120.9654912],[24.7687206,120.9654719],[24.7687849,120.966003],[24.7688901,120.9659848],[24.7688355,120.9655063],[24.7689953,120.9654859],[24.7690011,120.9655266]]]
];
const pitchOutline=[[24.7691683,120.9666165],[24.7687956,120.9668773],[24.7687588,120.96688],[24.7687145,120.9668664],[24.7686899,120.9668349],[24.7686727,120.9667889],[24.7686793,120.9667455],[24.768708,120.966705],[24.7690807,120.9664469],[24.7691151,120.9664361],[24.7691544,120.9664415],[24.7691831,120.9664641],[24.7692019,120.9664929],[24.7692101,120.9665308],[24.7692052,120.9665651],[24.7691921,120.9665949]];
const leaves=[0x4b7056,0x638653,0x7c965e,0x547852], stone=[0xcac1ae,0xd5ceba,0xaeb6ad,0xb6b1a7];
const pick=(list,i)=>list[i%list.length];
const meter=6371008.8*Math.PI/180;
function geographic(origin,[lat,lon]){
  return {x:(lon-origin.lon)*meter*Math.cos(origin.lat*Math.PI/180),z:(origin.lat-lat)*meter};
}
function local(a,x,z){
  const c=Math.cos(a.yaw),s=Math.sin(a.yaw);
  return {x:a.x+x*c+z*s,z:a.z-x*s+z*c};
}
function mid(points){
  return points.reduce((a,p)=>({x:a.x+p.x/points.length,z:a.z+p.z/points.length}),{x:0,z:0});
}
function bounds(points){return {x0:Math.min(...points.map(p=>p.x)),x1:Math.max(...points.map(p=>p.x)),z0:Math.min(...points.map(p=>p.z)),z1:Math.max(...points.map(p=>p.z))};}
function closed(points){return [...points,points[0]];}
function roofGeometry(){
  const A=[-.5,-.5,-.5],B=[.5,-.5,-.5],C=[-.5,-.5,.5],D=[.5,-.5,.5],E=[-.5,.5,0],F=[.5,.5,0];
  const g=new THREE.BufferGeometry(),tri=[A,E,F,A,F,B,C,D,F,C,F,E,A,C,E,B,F,D,A,B,D,A,D,C];
  g.setAttribute('position',new THREE.Float32BufferAttribute(tri.flat(),3));g.computeVertexNormals();return g;
}
function polygonMesh(parent,name,points,height,color,base=0){
  const shape=new THREE.Shape();
  points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
  const geom=height?new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1}):new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({color,roughness:.92,side:THREE.DoubleSide}));
  m.name=name;m.position.y=base;m.castShadow=!!height;m.receiveShadow=true;parent.add(m);return m;
}
class SceneParts{
  constructor(root){
    this.root=root;this.groups=new Map();this.batches=new Map();
    this.shapes={box:new THREE.BoxGeometry(1,1,1),roof:roofGeometry(),leaf:new THREE.IcosahedronGeometry(.5,1),round:new THREE.CylinderGeometry(.5,.5,1,8)};
    this.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9});
  }
  group(name){
    if(!this.groups.has(name)){const g=new THREE.Group();g.name=name;this.groups.set(name,g);this.root.add(g);}
    return this.groups.get(name);
  }
  add(group,anchor,x,y,z,w,h,d,color,shape='box',turn=0){
    const p=local(anchor,x,z),key=[group,shape,Math.floor(p.x/1100),Math.floor(p.z/1100)].join('/');
    if(!this.batches.has(key))this.batches.set(key,{group,shape,items:[]});
    this.batches.get(key).items.push([p.x,(anchor.y||0)+y,p.z,w,h,d,anchor.yaw+turn,color]);
  }
  finish(){
    const dummy=new THREE.Object3D(),tint=new THREE.Color();
    for(const {group,shape,items} of this.batches.values()){
      const im=new THREE.InstancedMesh(this.shapes[shape],this.material,items.length);
      im.name=group+'・'+shape;im.castShadow=shape!=='leaf';im.receiveShadow=true;
      items.forEach(([x,y,z,w,h,d,yaw,color],i)=>{
        dummy.position.set(x,y,z);dummy.rotation.y=yaw;dummy.scale.set(w,h,d);dummy.updateMatrix();
        im.setMatrixAt(i,dummy.matrix);im.setColorAt(i,tint.setHex(color));
      });
      im.computeBoundingSphere();this.group(group).add(im);
    }
  }
}

class Sites{
  constructor(world){
    this.world=world;this.extra=new RoadClearance();this.plots=[];this.ranges=[];
    const data=world.route.data;
    this.water=(data.waterAreas||[]).map(a=>a.points||a).filter(p=>p.length>2).map(p=>({p,b:bounds(p)}));
    this.reservedAreas=(data.landscapeAreas||[]).filter(a=>a.kind==='park'&&a.points?.length>2).map(a=>({p:a.points,b:bounds(a.points)}));
    for(const road of data.surroundingRoads||[]){
      if(!road.points?.length||road.bridge||!road.highway||!['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','residential','unclassified','service','living_street'].includes(road.highway))continue;
      const half=Math.max(2,(Number(road.lanes)||1)*1.65);
      this.extra.add(roadFrames(road.points.map(p=>({...p,y:0}))),-half,half);
    }
    for(const route of new Set([world.route,world.bikeRoute].filter(Boolean))){
      const cells=new Map();
      for(const p of route.points){
        const key=Math.floor(p.x/64)+','+Math.floor(p.z/64);
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);
      }
      this.ranges.push({route,cells});
    }
  }
  dry(p){
    return !this.water.some(({b,p:poly})=>p.x>=b.x0&&p.x<=b.x1&&p.z>=b.z0&&p.z<=b.z1&&pointInPolygon(p.x,p.z,poly));
  }
  free(x,z,r,b,t){return this.world.clearance.free(x,z,r,b,t)&&this.extra.free(x,z,r,b,t);}
  safe(poly,h,base=0){
    const b=bounds(poly),near=this.ranges.map(({route,cells})=>{
      const points=[];
      for(let x=Math.floor((b.x0-21)/64);x<=Math.floor((b.x1+21)/64);x++)for(let z=Math.floor((b.z0-21)/64);z<=Math.floor((b.z1+21)/64);z++)points.push(...(cells.get(x+','+z)||[]));
      return {points,width:s=>route.width(s)};
    });
    if(intrudesRoad(closed(poly),near,.9))return false;
    const size=5;
    for(let x=b.x0;x<=b.x1+size;x+=size)for(let z=b.z0;z<=b.z1+size;z+=size){
      if(pointInPolygon(x,z,poly)&&(!this.dry({x,z})||!this.free(x,z,size*.72+.4,base,base+h)))return false;
    }
    for(let i=0;i<poly.length;i++){
      const a=poly[i],c=poly[(i+1)%poly.length],n=Math.max(1,Math.ceil(Math.hypot(c.x-a.x,c.z-a.z)/3));
      for(let k=0;k<n;k++){const x=a.x+(c.x-a.x)*k/n,z=a.z+(c.z-a.z)*k/n;if(!this.dry({x,z})||!this.free(x,z,1.8,base,base+h))return false;}
    }
    return true;
  }
  plot(route,s,side,w,d,h,setback){
    for(const extra of [0,8,19]){
      const p=route.sample(s,side*(route.width(s)/2+setback+d/2+extra));
      const a={x:p.x,z:p.z,y:0,yaw:Math.atan2(-side*p.rx,-side*p.rz)},radius=Math.hypot(w,d)/2;
      if(this.school&&Math.hypot(a.x-this.school.x,a.z-this.school.z)<102+radius)continue;
      if(this.plots.some(q=>Math.abs(a.x-q.x)<q.r+radius&&Math.hypot(a.x-q.x,a.z-q.z)<q.r+radius))continue;
      const corners=rectangleFootprint(a.x,a.z,w,d,a.yaw);
      if(this.reservedAreas.some(({b,p})=>a.x+radius>b.x0&&a.x-radius<b.x1&&a.z+radius>b.z0&&a.z-radius<b.z1&&
        ([a,...corners].some(c=>pointInPolygon(c.x,c.z,p))||p.some(c=>pointInPolygon(c.x,c.z,corners)))))continue;
      if(!this.safe(corners,h))continue;
      this.plots.push({...a,r:radius});return a;
    }
    return null;
  }
}
const motor='國一國三・隔音板與門架',hill='茄苳柴橋・坡地聚落',lake='明湖路・青草湖岸',park='科學園區・研發廠辦',town='市街・連棟透天',school='康橋新竹校區・柴橋路95號';
function tree(parts,g,a,x,z,h,variant){
  parts.add(g,a,x,h*.29,z,.32,h*.58,.32,0x685845,'round');
  parts.add(g,a,x,h*.7,z,h*.59,h*.66,h*.53,pick(leaves,variant),'leaf');
}
function rowHome(parts,g,a,v){
  const B=(x,y,z,w,h,d,c,shape)=>parts.add(g,a,x,y,z,w,h,d,c,shape);
  const walls=[0xc8bda1,0xafaea1,0xc4afa0,0xa1b4a1],roofs=[0x8b5a45,0x708178,0x956a55];
  const floors=2+v%2,h=floors*2.8;
  B(0,h/2,0,8.5,h,9.4,pick(walls,v));B(0,h+.85,0,9.2,1.7,10,pick(roofs,v),'roof');
  B(0,1.3,4.74,5.8,2.38,.15,0x5e6c66);B(0,2.6,5.05,6.5,.22,1.05,pick(roofs,v));
  for(let f=1;f<floors;f++)for(const x of [-2.1,2.1])B(x,f*2.8+1.25,4.76,2.7,1.42,.12,0x536b70);
  if(v%2)B(-2,h+1.1,-2.5,1.4,2.2,1.4,0xa1a29b,'round');
}
function orchard(parts,g,a,v){
  parts.add(g,a,0,.025,0,22,.12,18,pick([0x93a469,0x949e5a,0x8e9c72],v));
  for(let i=-2;i<=2;i++){
    parts.add(g,a,i*4,.12,0,.65,.14,17,0x9f946f);
    for(let j=-1;j<=1;j++)tree(parts,g,a,i*4,j*5.5,3.25+(i+j+4)%3*.4,v+i+j+3);
  }
}
function woodland(parts,g,a,v){
  parts.add(g,a,0,-.7,0,31,9,24,pick([0x869367,0x7c8d68,0x74895e],v),'leaf');
  for(let i=0;i<7;i++){
    const x=-11+(i*9%23),z=-7+(i*7%15),h=5+(i+v)%4;
    const base=2.5*Math.max(0,1-Math.hypot(x/17,z/14));
    tree(parts,g,{...a,y:base},x,z,h,v+i);
  }
}
function lab(parts,a,v){
  const B=(x,y,z,w,h,d,c)=>parts.add(park,a,x,y,z,w,h,d,c);
  const h=12+v%3*3;
  B(0,h/2,0,34,h,17,0xd5d3c4);B(-10,h/2-.5,8.7,6,h-1,1,0x8b9f9b);
  for(let y=2.5;y<h-1;y+=3)B(3,y,8.6,21,1.45,.24,0x58737d);
  B(0,h+.16,0,34.8,.32,17.7,0x8b9995);
  for(let i=0;i<3;i++)B(i*5-5,h+1.0,-2,3.7,1.8,3,0x9aa8a3);
}
function sign(parts,g,a,text,english,w,h){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=144;
  const ctx=canvas.getContext?.('2d');if(!ctx)return;
  const campus=g===school;
  ctx.fillStyle=campus?'#e5dbbb':'#285f50';ctx.fillRect(0,0,640,144);ctx.strokeStyle=campus?'#b49e76':'#c6d9c8';ctx.lineWidth=4;ctx.strokeRect(6,6,628,132);
  ctx.fillStyle=campus?'#354842':'#f6f0d7';ctx.textAlign='center';ctx.font='600 56px "PingFang TC", "Microsoft JhengHei", sans-serif';drawText(ctx,text,320,72,606);
  ctx.font='500 23px sans-serif';drawText(ctx,english,320,111,608);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
  panel.name=text;panel.position.set(a.x,a.y,a.z);panel.rotation.y=a.yaw;parts.group(g).add(panel);
}
function edge(parts,g,a,b,y,width,height,color){
  const dx=b.x-a.x,dz=b.z-a.z,anchor={x:(a.x+b.x)/2,z:(a.z+b.z)/2,yaw:Math.atan2(-dz,dx)};
  parts.add(g,anchor,0,y,0,Math.hypot(dx,dz),height,width,color);
}
function campusScene(parts,sites,data){
  const project=ll=>geographic(data.origin,ll),group=parts.group(school);
  const gate=project(schoolGate),center=project([24.76865,120.96631]);
  sites.school=center;group.userData={osmRelation:9540029,gateOsmNode:11411586504,source:campusSource};
  for(let j=0;j<campusWings.length;j++){
    const [id,height,coords]=campusWings[j],outline=coords.map(project),c=mid(outline);
    const poly=[1,.95,.88].map(scale=>outline.map(p=>({x:c.x+(p.x-c.x)*scale,z:c.z+(p.z-c.z)*scale}))).find(p=>sites.safe(p,height+4));
    if(!poly)continue;
    const m=polygonMesh(group,'校舍・OSM '+id,poly,height,pick([0xc8bca5,0xd4c5a8,0xc8ac8f,0xd3c7ac],j));
    m.userData.osmWayId=id;
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<7)continue;
      const count=Math.floor(length/4.4),yaw=Math.atan2(a.z-b.z,b.x-a.x);
      for(let k=0;k<count;k++){
        const f=(k+.5)/count,anchor={x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,yaw};
        for(let y=2.2;y<height-1;y+=3.0)parts.add(school,anchor,0,y,0,Math.min(2.7,length/count-.6),1.4,.25,0x5e7776);
      }
      edge(parts,school,a,b,height,.38,.35,0x98715b);
    }
  }
  // Roof wings follow the long axes of the mapped blocks; architectural details are illustrative.
  for(const [lat,lon,w,d,base,yaw] of [
    [24.7682,120.9659,37,25,12,-.12],[24.76836,120.96656,30,22,13,.45],
    [24.76845,120.967014,28,20,9,.44],[24.76899,120.965795,46,13,11,.11],
    [24.768665,120.96576,46,12,11,.11]
  ]){
    const a={...project([lat,lon]),yaw};
    if(sites.safe(rectangleFootprint(a.x,a.z,w,d,yaw),base+3.7))parts.add(school,a,0,base+1.35,0,w,2.7,d,0x91614e,'roof');
  }
  const pitch=pitchOutline.map(project),c=mid(pitch);
  if(sites.safe(pitch,.3)){
    polygonMesh(group,'校內運動場・OSM 1290235204',pitch,0,0xae7259,.1);
    for(const scale of [.95,.88,.81]){
      const ring=pitch.map(p=>({x:c.x+(p.x-c.x)*scale,z:c.z+(p.z-c.z)*scale}));
      for(let i=0;i<ring.length;i++)edge(parts,school,ring[i],ring[(i+1)%ring.length],.16,.16,.035,0xe4d4b6);
    }
    polygonMesh(group,'運動場內場',pitch.map(p=>({x:c.x+(p.x-c.x)*.74,z:c.z+(p.z-c.z)*.74})),0,0x849966,.19);
  }
  const road=sites.world.route,street=data.schoolStop||road.sample(road.nearest(gate.x,gate.z).s);
  const yaw=Math.atan2(street.x-gate.x,street.z-gate.z);
  const facing={...gate,yaw};
  for(const side of [-1,1]){
    const pier=local(facing,side*4.6,0);
    if(sites.safe(rectangleFootprint(pier.x,pier.z,1.45,1.3,yaw),3.2)){
      parts.add(school,{...pier,yaw},0,1.45,0,1.45,2.9,1.3,0x96765f);
      parts.add(school,{...pier,yaw},0,2.97,0,1.62,.22,1.42,0xd9c9ac);
    }
  }
  for(const side of [-1,1]){
    const p=local(facing,side*8.7,-.35),a={...p,yaw};
    if(!sites.safe(rectangleFootprint(p.x,p.z,6.8,1.1,yaw),2.6))continue;
    parts.add(school,a,0,1.25,0,6.8,2.5,1.1,0xc5b99b);
    sign(parts,school,{...local(a,0,.565),y:1.54,yaw},'康橋國際學校','KANG CHIAO INTERNATIONAL SCHOOL · HSINCHU',6.4,1.44);
    break;
  }
}
function schoolRoadside(parts,sites,data){
 const stop=data.schoolStop;if(!stop)return;const route=sites.world.route;
 for(let i=0;i<12;i++){
  const s=stop.s-12-i*9;if(s<0)continue;
  const p=route.sample(s,route.width(s)/2+.6);
  if(!sites.safe(rectangleFootprint(p.x,p.z,.6,.6,p.yaw),1))continue;
  parts.add(school,p,0,.10,0,.52,.15,.52,0x414943);
  parts.add(school,p,0,.42,0,.28,.58,.28,0xd78b4d,'round');
  parts.add(school,p,0,.45,0,.30,.12,.30,0xe5daba,'round');
 }
 const p=route.sample(stop.s-95,route.width(stop.s-95)/2+2.3);
 if(sites.safe(rectangleFootprint(p.x,p.z,2.5,1,p.yaw),2.6)){
  parts.add(school,p,0,1,0,.14,2,.14,0x738476);
  sign(parts,school,{...p,y:2.15},'接送排隊 → 右轉入校','減速慢行・依序接送',2.4,.95);
 }
}
function motorwayWall(parts,sites,route,s,side){
  for(let i=0;i<7;i++){
    const at=s+i*6.4;if(at>route.length||!route.highway(at).startsWith('motorway'))break;
    let p;
    for(const shift of [0,2.5,5]){
      const q=route.sample(at,side*(route.width(at)*(side<0?1.6:.5)+3.2+shift));
      if(sites.safe(rectangleFootprint(q.x,q.z,.55,6.35,q.yaw),3.15,q.y)){p=q;break;}
    }
    if(!p)continue;
    parts.add(motor,p,0,.55,0,.48,1.1,6.3,0xa7aba0);
    parts.add(motor,p,0,1.9,0,.22,1.65,6.25,0x849f99);
    parts.add(motor,p,0,2.8,0,.24,.28,6.25,0xb0bcb0);
    parts.add(motor,p,0,1.62,-3.1,.47,3.1,.24,0x75847c);
  }
}
function motorwayGantry(parts,sites,route,s){
  const road=route.sample(s),w=route.width(s),ends=[];
  for(const side of [-1,1]){
    let end;
    for(let shift=0;shift<=16;shift+=2){
      const offset=side*(w*(side<0?1.6:.5)+2.6+shift),p=route.sample(s,offset);
      if(sites.safe(rectangleFootprint(p.x,p.z,.9,.9,p.yaw),6.9,p.y)){end=offset;break;}
    }
    if(end===undefined)return;ends.push(end);
  }
  for(let o=ends[0];o<=ends[1]+1;o+=1){
    const p=route.sample(s,o);
    if(!sites.free(p.x,p.z,.95,p.y+5.36,p.y+7.2))return;
  }
  for(const o of ends)parts.add(motor,road,o,3.45,0,.55,6.9,.55,0x7a8881);
  const span=ends[1]-ends[0],middle=(ends[0]+ends[1])/2;
  parts.add(motor,road,middle,6.9,0,span+.55,.44,.5,0x81918a);
  parts.add(motor,road,0,6.25,.21,5.65,1.66,.24,0x38685b);
  const one=/中山|國道一|國道1/.test(road.road),three=/福爾摩沙|國道三|國道3/.test(road.road);
  const junction=[['茄苳','茄苳交流道','JIADONG INTERCHANGE'],['新竹系統','新竹系統交流道','HSINCHU SYSTEM INTERCHANGE'],['新竹交流道','新竹交流道','HSINCHU INTERCHANGE']].find(([name])=>road.road.includes(name));
  const title=junction?.[1]??(one?'國道一號':three?'國道三號':'高速公路');
  sign(parts,motor,{...local(road,0,.34),y:road.y+6.25,yaw:road.yaw},title,junction?.[2]??(one?'NATIONAL FREEWAY 1':three?'NATIONAL FREEWAY 3':'NATIONAL FREEWAY'),5.5,1.38);
}
function routeKind(route,s,ranges){
  const p=route.sample(s),h=route.highway(s),range=ranges?.find(a=>s>=a.startS&&s<=a.endS);
  if(range)return range.kind;
  if(h.startsWith('motorway'))return h.includes('link')?'interchange':'freeway';
  if(/關新/.test(p.road))return 'guanxin';
  if(/柴橋|茄苳/.test(p.road))return 'hills';
  if(/明湖|環湖/.test(p.road))return 'lake';
  if(/力行|園區|研新|篤行|創新/.test(p.road))return 'park';
  return 'urban';
}
function shoreline(parts,sites,data){
  const water=(data.waterAreas||[]).find(a=>/青草湖/.test(a.name||'')||[160953407,4010563].includes(Number(a.osmId||a.osmWayId)))
    ||(data.landscapeAreas||[]).find(a=>/青草湖/.test(a.name||'')&&a.points?.length>10);
  if(!water?.points?.length)return;
  const poly=water.points,c=mid(poly),group=parts.group(lake);
  group.userData.lakeOsmRelation=4010563;
  for(const hole of water.holes||[]){
    const island=hole.points||hole;if(island.length>2)polygonMesh(group,'青草湖・湖心島',island,0,0x879668,.085);
  }
  const points=closed(poly);let walked=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.z-a.z);
    for(let t=walked;t<len;t+=22){
      const x=a.x+(b.x-a.x)*t/len,z=a.z+(b.z-a.z)*t/len,n=Math.hypot(x-c.x,z-c.z)||1;
      const bank={x:x+6*(x-c.x)/n,z:z+6*(z-c.z)/n,yaw:0};
      if(sites.safe(rectangleFootprint(bank.x,bank.z,4.5,4.5,0),7))tree(parts,lake,bank,0,0,6.8,i);
    }
    walked=(walked-len%22+22)%22;
  }
}
function mappedGround(parts,sites,data){
  const name='關新公園・日光公園',landGroup=parts.group('南新竹林地與農田'),ground=new Map();
  // The mapped surfaces sit between the terrain and the surrounding public roads.
  for(const area of data.landscapeAreas||[]){
    if(!['farmland','wood','park'].includes(area.kind)||!area.points?.length)continue;
    const outline=area.points.slice();
    if(outline.length>1&&outline[0].x===outline.at(-1).x&&outline[0].z===outline.at(-1).z)outline.pop();
    if(outline.length<3)continue;
    const mainPark=Number(area.osmId||area.osmWayId)===134204596;
    if(mainPark){
      const group=parts.group(name),c=mid(outline);group.userData.osmWayId=134204596;
      polygonMesh(group,'關新公園・實際園界',outline,0,0x8b9d6e,-.078);
      makeGuanxinPark(parts,sites,outline);
      const walk=outline.map(p=>({x:c.x+(p.x-c.x)*.80,z:c.z+(p.z-c.z)*.80}));
      for(let i=0;i<walk.length;i++){
        const a=walk[i],b=walk[(i+1)%walk.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        const yaw=Math.atan2(-dz,dx),count=Math.max(1,Math.floor(len/10));
        for(let j=0;j<count;j++){
          const t=(j+.5)/count,x=a.x+dx*t,z=a.z+dz*t,anchor={x,z,yaw};
          if(sites.safe(rectangleFootprint(x,z,len/count,2.4,yaw),.12))parts.add(name,anchor,0,-.046,0,len/count,.025,2.4,0xbeb297);
          if(j%3===0){
            const p={...local(anchor,0,2.5),yaw};
            if(sites.safe(rectangleFootprint(p.x,p.z,2.4,1.4,yaw),1.05)){
              parts.add(name,p,0,.45,0,2.3,.18,.65,0x8e7050);parts.add(name,p,0,.77,-.30,2.3,.47,.13,0x937d61);
              for(const u of [-.75,.75])parts.add(name,p,u,.21,0,.16,.43,.47,0x606b62);
            }
          }
          const treeAt={x:c.x+(x-c.x)*.86,z:c.z+(z-c.z)*.86,yaw};
          if(sites.safe(rectangleFootprint(treeAt.x,treeAt.z,4.8,4.8,yaw),8))tree(parts,name,treeAt,0,0,6+(i+j)%3,i+j);
        }
      }
      continue;
    }
    const positions=ground.get(area.kind)||[];ground.set(area.kind,positions);
    const tri=THREE.ShapeUtils.triangulateShape(outline.map(p=>new THREE.Vector2(p.x,-p.z)),[]);
    for(const face of tri)for(const i of face)positions.push(outline[i].x,-.083,outline[i].z);
  }
  for(const [kind,positions] of ground){
    if(!positions.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    const tint={wood:0x7d906a,farmland:0x9fa773,park:0x91a475}[kind],m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:tint,roughness:1,side:THREE.DoubleSide}));
    m.name='OSM 地表・'+kind;m.receiveShadow=true;landGroup.add(m);
  }
}
function companyBuildings(parts,sites,data){
  for(const building of data.buildings||[]){
    const id=Number(building.osmWayId),media=id===257199553;
    if((!media&&id!==160110943)||building.points.length<3)continue;
    const group=parts.group(park),outline=building.points.slice(),c=mid(outline);
    if(outline[0].x===outline.at(-1).x&&outline[0].z===outline.at(-1).z)outline.pop();
    const height=Math.min(46,Math.max(10,building.height||12));
    const body=[1,.97,.92,.85].map(k=>outline.map(p=>({x:c.x+(p.x-c.x)*k,z:c.z+(p.z-c.z)*k}))).find(p=>sites.safe(p,height+4));
    if(!body)continue;
    sites.reservedAreas.push({p:body,b:bounds(body)});
    const shell=polygonMesh(group,media?'聯發科技總部':'台積電十二廠 12A',body,height,media?0xd5c5ad:0xd1d0c8);
    shell.userData.osmWayId=id;
    for(let i=0;i<body.length;i++){
      const a=body[i],b=body[(i+1)%body.length],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<4)continue;
      edge(parts,park,a,b,height,.46,.34,media?0x948678:0x9ca29a);
      for(let y=media?2.7:4.5;y<height-1;y+=media?3.15:4.5)edge(parts,park,a,b,y,.18,media?1.5:1.8,media?0x5b7981:0x849697);
    }
    const box=bounds(body);
    for(let x=box.x0+12;x<box.x1-8;x+=16)for(let z=box.z0+12;z<box.z1-8;z+=18){
      if(!rectangleFootprint(x,z,9,6,0).every(p=>pointInPolygon(p.x,p.z,body)))continue;
      const a={x,z,yaw:0};
      parts.add(park,a,0,height+.7,0,7.6,1.4,4.4,media?0x9a9c94:0x959c98);
      for(const p of [-1.7,1.7])parts.add(park,a,p,height+1.45,0,2.15,.22,2.15,0x697976,'round');
    }
  }
}
export function makeSouthHsinchu(world){
  const {route,bikeRoute}=world,data=route.data;
  if(data.sceneryProfile!=='south-hsinchu')return null;
  const group=new THREE.Group();group.name='南新竹通勤街景';world.scene.add(group);
  const parts=new SceneParts(group),sites=new Sites(world),visited=new Set(),random=seeded(66122);
  makeGuanxin(world,parts,sites);campusScene(parts,sites,data);schoolRoadside(parts,sites,data);shoreline(parts,sites,data);mappedGround(parts,sites,data);companyBuildings(parts,sites,data);
  const paths=[[route,data.sceneryDistricts]];
  if(bikeRoute&&bikeRoute!==route)paths.push([bikeRoute,data.bikeSceneryDistricts]);
  for(const [path,ranges] of paths){
    let nextPanel=60,nextGantry=370;
    for(let s=10;s<path.length;s+=47){
      const p=path.sample(s),kind=routeKind(path,s,ranges),v=Math.floor(random()*120);
      const key=kind+','+Math.floor(p.x/40)+','+Math.floor(p.z/40);
      if(visited.has(key))continue;visited.add(key);
      const freeway=path.highway(s).startsWith('motorway');
      if(freeway){
        if(s>=nextPanel){motorwayWall(parts,sites,path,s,v%2?1:-1);nextPanel=s+350+v*2;}
        if(s>=nextGantry){motorwayGantry(parts,sites,path,s);nextGantry=s+1050;}
        if(p.bridge||v%4!==0)continue;
      }else if(p.bridge)continue;
      for(const side of [-1,1]){
        if(kind==='guanxin'){
          continue;
        }
        if(kind==='park'){
          if(v%3===0&&side<0)continue;
          const a=sites.plot(path,s,side,37,20,21,9);if(a)lab(parts,a,v+side+1);continue;
        }
        if(kind==='urban'){
          const a=sites.plot(path,s,side,22,13,12,5);if(a){
            for(const i of [-1,1])rowHome(parts,town,{...local(a,i*5,0),yaw:a.yaw},v+i+1);
          }
          continue;
        }
        const g=freeway?motor:kind==='lake'?lake:hill;
        if(!freeway&&(v+side+1)%4===0){
          const a=sites.plot(path,s,side,12,14,12,6);if(a)rowHome(parts,g,a,v);
        }else if(!freeway&&(v+side+1)%3===0){
          const a=sites.plot(path,s,side,24,20,6,12);if(a)orchard(parts,g,a,v);
        }else{
          const a=sites.plot(path,s,side,34,27,14,freeway?28:18);if(a)woodland(parts,g,a,v);
        }
      }
    }
  }
  parts.finish();return group;
}
