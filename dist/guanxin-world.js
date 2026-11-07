import {drawText,gameText} from './game-text.js?v=0.8.2-puns';
import * as THREE from './vendor/three.module.js';
import {appendRibbon,ribbonRuns} from './road-geometry.js';

export const onGuanxin=(route,s)=>route.data.sceneryProfile==='south-hsinchu'&&route.sample(s).road==='關新路';
const district='關新路・實際街廓';
const palette=[0xa29e92,0xb3aea0,0xaaa69a,0x98998f,0xbab5a5];
const average=points=>points.reduce((a,p)=>({x:a.x+p.x/points.length,z:a.z+p.z/points.length}),{x:0,z:0});

function facadeTexture(height,width,variant,cache,lowPower){
 if(typeof document==='undefined')return null;
 const bucket=(n,steps)=>steps.find(v=>v>=n)??steps.at(-1);
 const floors=bucket(Math.max(2,Math.round(height/3.2)),[2,4,8,12,16,24,32]),bays=bucket(Math.max(2,Math.round(width/3.2)),[2,4,8,12,16]);
 variant=((variant%20)+20)%20;const key=[floors,bays,variant].join(':');if(cache.has(key))return cache.get(key);
 const c=document.createElement('canvas');c.width=lowPower?64:128;c.height=lowPower?128:256;
 const g=c.getContext('2d');g.scale(c.width/512,c.height/1024);
 g.fillStyle=['#aaa79d','#b7b0a1','#9d9f98','#c0b8a7'][variant%4];g.fillRect(0,0,512,1024);
 for(let f=0;f<floors;f++)for(let b=0;b<bays;b++){
  const x=b*512/bays,y=f*1024/floors,bw=512/bays,fh=1024/floors;
  g.fillStyle=(f+b+variant)%5===0?'#536669':'#3d5155';
  g.fillRect(x+bw*.19,y+fh*.17,bw*.61,fh*.62);
  g.fillStyle='#868c86';g.fillRect(x+bw*.47,y+fh*.17,2,fh*.62);
  g.fillStyle='#ccc4b4';g.fillRect(x+bw*.15,y+fh*.8,bw*.7,fh*.05);
  if((b+variant)%3===0){g.fillStyle='#747e79';g.fillRect(x+bw*.12,y+fh*.87,bw*.34,fh*.08);}
 }
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 cache.set(key,tex);return tex;
}

function building(parts,sites,b,group,textureCache,lowPower){
 let outline=b.points.slice();
 if(Math.hypot(outline[0].x-outline.at(-1).x,outline[0].z-outline.at(-1).z)<.02)outline.pop();
 const height=Math.max(3.2,Math.min(100,b.height??12)),center=average(outline);
 // Mapped building footprints can include sidewalks or driveways. Keep the
 // identifiable volume while leaving every mapped road physically clear.
 let footprintScale=1;
 if(!sites.safe(outline,height+6)){
  if(b.osmWayId!==363572242)return;
  const scale=[.97,.94,.9,.85,.8,.75].find(k=>sites.safe(outline.map(p=>({x:center.x+(p.x-center.x)*k,z:center.z+(p.z-center.z)*k})),height+6));
  if(!scale)return;
  footprintScale=scale;outline=outline.map(p=>({x:center.x+(p.x-center.x)*scale,z:center.z+(p.z-center.z)*scale}));
 }
 const shape=new THREE.Shape();outline.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geo.rotateX(-Math.PI/2);
 const shell=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:b.osmWayId===827291354?0x969b94:palette[b.osmWayId%palette.length],roughness:.9}));
 shell.name=(b.name||'關新街廓')+'・OSM '+b.osmWayId;shell.userData={osmWayId:b.osmWayId,height,heightSource:b.heightSource,footprintScale};
 shell.castShadow=true;shell.receiveShadow=true;group.add(shell);
 const tall=height>42,roof=height+.5;
 for(let i=0;i<outline.length;i++){
  const a=outline[i],z=outline[(i+1)%outline.length],dx=z.x-a.x,dz=z.z-a.z,len=Math.hypot(dx,dz);
  if(len<3.5)continue;
  const yaw=Math.atan2(-dz,dx),anchor={x:(a.x+z.x)/2,z:(a.z+z.z)/2,yaw};
  const tex=facadeTexture(height-4,len,b.osmWayId===827291354?2:b.osmWayId+i,textureCache,lowPower);
  const window=new THREE.Mesh(new THREE.PlaneGeometry(len-.16,height-4.2),
   new THREE.MeshStandardMaterial({map:tex,color:0xffffff,roughness:.64,side:THREE.DoubleSide}));
  const normal=Math.hypot(anchor.x-center.x,anchor.z-center.z)||1;
  window.position.set(anchor.x+(anchor.x-center.x)/normal*.045,4+(height-4.2)/2,anchor.z+(anchor.z-center.z)/normal*.045);window.rotation.y=yaw;
  window.name='灰褐窗框立面';group.add(window);
  // Continuous vertical piers and recessed bays give each mapped tower its own massing.
  const bays=Math.max(2,Math.round(len/5.8));
  for(let j=0;j<=bays;j++){
   const x=(j/bays-.5)*len;
   parts.add(district,anchor,x,height/2,0,.34,height+.4,.5,0xc0b9aa);
  }
  if(b.osmWayId===827291354&&i===1){
   for(let f=2;f<23;f++){
    parts.add(district,anchor,0,f*3.2+.1,.6,len+.5,.22,1.8,0x787e78);
    parts.add(district,anchor,0,f*3.2+.65,1.4,len-.1,.86,.12,0x626f6d);
    for(const x of [-len*.35,0,len*.35])parts.add(district,anchor,x,f*3.2+.65,1.42,.07,.94,.1,0xc4c4b5);
   }
  }
  if(tall){
   for(let f=2;f<Math.round(height/3.2);f++){
    parts.add(district,anchor,0,f*3.2,.12,len+.18,.16,.75,0x8b8b80);
   }
   // Open rooftop beams follow this face, leaving sky visible through the frame.
   parts.add(district,anchor,0,roof+3.4,0,len+.4,.65,.65,0x80867c);
   for(const side of [-1,1])parts.add(district,anchor,side*(len/2-.3),roof+1.65,0,.65,3.4,.65,0x969b8f);
  }
  // The junction storefronts are over 400 m from the route's first point;
  // measuring from that point mistakenly erased them from the streetscape.
  const near=sites.world.route.nearest(anchor.x,anchor.z);
  const frontage=near.d<85&&anchor.x>-930&&anchor.x<-650&&anchor.z>3450&&anchor.z<3900;
  if(frontage&&len>9){
   parts.add(district,anchor,0,1.9,.28,len-.5,3.5,.18,0x3d5151);
   parts.add(district,anchor,0,3.9,.6,len+.2,.24,1.65,0xaca591);
   for(let x=-len/2+1;x<len/2;x+=4.8)parts.add(district,anchor,x,1.9,.8,.34,3.8,.38,0xb6ad9b);
   if(b.osmWayId===363572242||[957540725,957540726,957540727,957540728].includes(b.osmWayId)){
    // Abstract shop signs use fictional colours rather than real brand names.
    for(let x=-len/2+3,j=0;x<len/2-1;x+=5.5,j++)
     parts.add(district,anchor,x,4.35,.88,4.5,.72,.12,[0x934b43,0x43716d,0x5a6c82,0xb19a6e][j%4]);
    group.userData.referenceFrontages++;
   }
  }
  if(b.osmWayId===363572242){
   // The 21 Guanxin Road reference has a broad, light-coloured structural
   // grid with horizontal slabs and recessed dark glazing on every floor.
   for(let f=1;f<Math.round(height/3.2);f++)
    parts.add(district,anchor,0,f*3.2,.32,len+.15,.34,.48,0xb8b4a9);
   group.userData.referenceGridFaces++;
  }
 }
 if(b.osmWayId===827291354&&typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=896;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#3f4845';ctx.fillRect(0,0,128,896);
  ctx.font='600 77px "PingFang TC",sans-serif';ctx.fillStyle='#e2dfd1';ctx.textAlign='center';
  [...gameText('美麗華東京中城')].forEach((char,i)=>drawText(ctx,char,64,104+i*113));
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const face={a:outline[1],b:outline[2]};
  const a=face.a,z=face.b,px=(a.x+z.x)/2,pz=(a.z+z.z)/2,n=Math.hypot(px-center.x,pz-center.z)||1;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.75,12),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide}));
  sign.position.set(px+(px-center.x)/n*.45,height-18,pz+(pz-center.z)/n*.45);sign.rotation.y=Math.atan2(-(z.z-a.z),z.x-a.x);sign.name='美麗華東京中城・照片所示直式招牌';group.add(sign);
 }
 group.userData.buildingIds.push(b.osmWayId);
}

function streetTree(parts,a,variant){
 const top=6.2+(variant%4)*.24;
 parts.add(district,a,0,top*.43,0,.17,top*.86,.17,0x776b5a,'round');
 for(let j=0;j<7;j++){
  const angle=j*2.4+variant,r=.8+(j%3)*.45;
  parts.add(district,a,Math.cos(angle)*.4,top-.7,Math.sin(angle)*.4,2.7,2.7,2.7,0x786e5d,'twig',angle);
  for(let k=0;k<3;k++){
   const d=r+k*.24,leaf=.58+(j%3)*.18;
   parts.add(district,a,Math.cos(angle)*d,top+.2+(j%3)*.47+k*.18,Math.sin(angle)*d,
    leaf,leaf*.62,leaf*1.2,[0x98a26b,0x859557,0x718c57,0xabb17a][(j+variant)%4],'leaf');
  }
 }
 // Full canopies are especially prominent on the approach to Guangfu Road.
 for(let j=0;j<4;j++)parts.add(district,a,Math.cos(j*1.7)*1.0,top+.4+(j%2)*.6,Math.sin(j*1.7)*1.0,2.8,2.5,2.8,[0x60794e,0x70855a,0x819164,0x6a8053][(j+variant)%4],'leaf');
}

function scooter(parts,a,variant){
 const B=(x,y,z,w,h,d,c,shape='box')=>parts.add(district,a,x,y,z,w,h,d,c,shape);
 const color=[0xa6aaa6,0xc9c7ba,0x694f46,0x52616b,0xb4b7b1,0xd0c8ba][variant%6];
 B(0,.53,.35,.47,.42,.61,color);
 B(0,.81,.29,.46,.13,.68,0x252c2d);
 B(0,.29,-.12,.38,.10,.72,color);
 B(0,.66,-.49,.46,.57,.17,color);
 B(0,1.00,-.57,.43,.14,.16,color);
 B(0,.98,-.663,.24,.09,.035,0xe0dfc6);
 B(0,1.14,-.5,.68,.04,.04,0x717c7d);
 for(const x of [-.28,.28]){
  B(x,1.28,-.49,.017,.24,.017,0x6c7775);
  B(x,1.41,-.49,.12,.075,.035,0x343b3d);
 }
 for(const z of [-.57,.57])B(0,.23,z,.15,.44,.44,0x232a2b,'wheel');
 B(0,.50,.68,.22,.16,.025,0xe1e0d6);
}

export function makeGuanxin(world,parts,sites){
 parts.shapes.wheel=new THREE.CylinderGeometry(.5,.5,1,10).rotateZ(Math.PI/2);
 parts.shapes.twig=new THREE.CylinderGeometry(.012,.025,1,5).rotateZ(.62);
 const {route}=world,group=parts.group(district);group.userData.buildingIds=[];group.userData.referenceFrontages=0;group.userData.referenceGridFaces=0;group.userData.medianTreeCenters=[];
 const first=route.points.find(p=>p.road==='關新路');if(!first)return;
 sites.streetCenter=first;
 const buildings=world.route.data.guanxinBuildings??world.route.data.buildings??[],textureCache=new Map();
 for(const b of buildings){
  if((route.data.restaurants||[]).some(s=>s.osmWayId===b.osmWayId))continue;
  const c=average(b.points);
  if(c.x<-1000||c.x>-420||c.z<2950||c.z>4100)continue;
  building(parts,sites,b,group,textureCache,world.lowPower);
 }
 const path=world.carFrames,half=p=>route.width(p.s)/2;
 const runs=ribbonRuns(path,(a,b)=>onGuanxin(route,a.s)&&onGuanxin(route,b.s));
 const parking=[],paving=[],planted=[],asphalt=[];
 const roadMaterial=new THREE.MeshStandardMaterial({color:0x84867c,roughness:.98});
 world.guanxinRoadMaterial=roadMaterial;
 for(const run of runs){
  appendRibbon(asphalt,run,p=>-half(p),half,.079);
  appendRibbon(parking,run,half,p=>half(p)+2.25,.061);
  appendRibbon(paving,run,p=>half(p)+2.25,p=>half(p)+6.1,.16,.09);
  for(const garden of ribbonRuns(run,(a,b)=>!(route.data.intersections??[]).some(i=>Math.abs(i.s-(a.s+b.s)/2)<17)))
   appendRibbon(planted,garden,p=>-half(p)-world.medianWidth(p.s)+.22,p=>-half(p)-.22,.27,.08);
 }
 for(const run of ribbonRuns(world.opposingFrames,(a,b)=>onGuanxin(route,a.s)&&onGuanxin(route,b.s)))
  appendRibbon(asphalt,run,p=>-p.width/2,p=>p.width/2,.078);
 world.roadMesh(asphalt,roadMaterial,'關新路・灰色瀝青');
 world.roadMesh(parking,roadMaterial,'關新路・路邊停車帶');
 world.roadMesh(paving,world.mats.side,'關新路・鋪面人行道');
 world.roadMesh(planted,new THREE.MeshStandardMaterial({color:0x6e8752,roughness:1}),'關新路・植栽中央分隔島');
 for(const run of runs){
  const from=run[0].s,to=run.at(-1).s;
  for(let s=from+8;s<to-8;s+=1.25){
   if((route.data.intersections??[]).some(v=>Math.abs(v.s-s)<22))continue;
   const p=route.sample(s),w=route.width(s)/2;
   const median=route.sample(s,-w-world.medianWidth(s)/2);
   for(const shift of [-.7,0,.7])parts.add(district,median,0,.48,shift,1.55,.52,1.2,0x687e4e,'leaf');
   if(Math.floor(s)%3===0)parts.add(district,median,0,.65,0,.25,.18,.25,0xab7191,'leaf');
   const parked=route.sample(s,w+1.1);parked.yaw+=Math.PI*.32;
   if(world.clearance.free(parked.x,parked.z,.9,0,1.5))scooter(parts,parked,Math.floor(s/1.25));
   for(const z of [-1.1,1.1])parts.add(district,p,w+1.1,.085,z,2.1,.012,.07,0xe6e1cb);
  }
  for(let s=from+12;s<to-8;s+=17){
   if((route.data.intersections??[]).some(v=>Math.abs(v.s-s)<18))continue;
   const p=route.sample(s,route.width(s)/2+4.7);
   if(world.clearance.free(p.x,p.z,2.4,0,9))streetTree(parts,p,Math.floor(s));
  }
  for(let s=from+20;s<to-18;s+=25){
   if((route.data.intersections??[]).some(v=>Math.abs(v.s-s)<22))continue;
   const p=route.sample(s,-route.width(s)/2-world.medianWidth(s)/2);
   if(world.clearance.free(p.x,p.z,.25,0,8)){streetTree(parts,p,Math.floor(s));group.userData.medianTreeCenters.push({x:p.x,z:p.z});}
  }
 }
 return group;
}
