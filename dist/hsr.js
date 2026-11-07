import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';

// © OpenStreetMap contributors, ODbL. Midpoints of corresponding nodes on
// https://www.openstreetmap.org/way/141727603 and /way/199777701, north to south.
// Metres in the same east/south projection as the two Erchong routes.
const spine=[[1014.165,2896.020],[908.955,3513.650],[775.410,4359.665],[746.965,4525.145],[677.225,4829.205]];
const marks=[0];for(let i=1;i<spine.length;i++)marks.push(marks[i-1]+Math.hypot(spine[i][0]-spine[i-1][0],spine[i][1]-spine[i-1][1]));
const crossing=marks[2]+Math.hypot(768.198-775.410,4401.628-4359.665);
const north=-crossing,south=marks.at(-1)-crossing;
export function trackPoint(s,lane=0){
 const d=s+crossing;let i=1;while(i<marks.length-1&&d>marks[i])i++;
 const a=spine[i-1],b=spine[i],len=marks[i]-marks[i-1],dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
 return {x:a[0]+dx*(d-marks[i-1])-dz*lane,z:a[1]+dz*(d-marks[i-1])+dx*lane,yaw:-Math.atan2(dz,dx)};
}
export function crossingStation(route){const p=trackPoint(0);return route.nearest(p.x,p.z).s;}
// A trip event, not a timetable. Simulation time freezes when paused. A second
// service uses the other track if a red light or queue keeps the driver nearby.
export class Headway{
 constructor(){this.start=null;this.dir=1;}
 update(t,meters,speed){
  if(this.start!==null&&t-this.start>29){this.start=null;this.dir*=-1;}
  if(this.start===null&&meters>=-16&&meters<=158){
   this.start=t;this.lead=Math.max(75,Math.min(370,Math.max(0,meters-62)/Math.max(9,speed)*48));
  }
  return this.start===null?null:{head:this.dir*((t-this.start)*48-this.lead),dir:this.dir};
 }
}
export async function loadHsr(){return (await new GLTFLoader().loadAsync(new URL('./assets/hsr.glb?v=099',import.meta.url).href)).scene;}
export class RailView{
 constructor(asset,route,bike){
  this.root=new THREE.Group();this.root.name='糕鐵・中興路四段雙軌';this.stations={car:crossingStation(route),bike:crossingStation(bike)};
  const m=new THREE.Object3D();const matrix=(x,y,z,yaw,scale=1)=>{m.position.set(x,y,z);m.rotation.set(0,yaw,0);m.scale.set(scale,1,1);m.updateMatrix();return m.matrix;};
  const from=(key,count)=>{const src=asset.getObjectByName(key),b=new THREE.InstancedMesh(src.geometry,src.material,count);b.name=key;b.receiveShadow=true;b.castShadow=true;this.root.add(b);return b;};
  const spans=[],piers=[];
  // Break at every mapped alignment vertex; no gap at a bend. The road is
  // spanned in one piece with the nearest supports 20 m on either side.
  const knots=[north,south,...marks.slice(1,-1).map(d=>d-crossing)];
  for(let s=20;s<south;s+=40)knots.push(s);
  for(let s=-20;s>north;s-=40)knots.push(s);
  knots.sort((a,b)=>a-b);
  let lastPier=-Infinity;
  for(let i=1;i<knots.length;i++){
   const a=trackPoint(knots[i-1]),b=trackPoint(knots[i]),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),yaw=-Math.atan2(dz,dx);
   spans.push(matrix((a.x+b.x)/2,0,(a.z+b.z)/2,yaw,(len+.04)/40).clone());
   if(knots[i-1]-lastPier<22||Math.abs(knots[i-1])<18)continue;
   // The model's column is at local x=-20. Keep its full footprint off
   // both player alignments, independent of any future lane realignment.
   if([route,bike].some(r=>{const n=r.nearest(a.x,a.z);return n.d<r.width(n.s)/2+6;}))continue;
   piers.push(matrix(a.x+20*dx/len,0,a.z+20*dz/len,yaw).clone());lastPier=knots[i-1];
  }
  for(const [key,list] of [['Span',spans],['Pier',piers]]){const batch=from(key,list.length);list.forEach((mat,i)=>batch.setMatrixAt(i,mat));batch.computeBoundingSphere();}
  this.cabs=from('Cab',2);this.coaches=from('Coach',10);this.matrix=matrix;
  for(const b of [this.cabs,this.coaches]){b.frustumCulled=false;b.instanceMatrix.setUsage(THREE.DynamicDrawUsage);b.visible=false;}
 }
 update(sim,play){
  if(sim!==this.trip){this.trip=sim;this.service=new Headway();}
  const meters=(this.stations[sim.player.vehicle]??this.stations.car)-sim.player.s;
  this.root.visible=play&&Math.abs(meters)<1150;if(!this.root.visible)return;
  const pass=this.service.update(sim.totalTime,meters,sim.player.speed);
  let cabs=0,coaches=0;
  if(pass)for(let i=0;i<12;i++){
   const s=pass.head-pass.dir*i*25.1;
   if(s<north+12.5||s>south-12.5)continue;
   const p=trackPoint(s,-pass.dir*3),cab=i===0||i===11;
   const mat=this.matrix(p.x,11.22,p.z,p.yaw+((pass.dir<0)!==(i===11)?Math.PI:0));
   if(cab)this.cabs.setMatrixAt(cabs++,mat);else this.coaches.setMatrixAt(coaches++,mat);
  }
  for(const [b,n] of [[this.cabs,cabs],[this.coaches,coaches]]){b.count=n;b.visible=n>0;b.instanceMatrix.needsUpdate=true;}
 }
}
