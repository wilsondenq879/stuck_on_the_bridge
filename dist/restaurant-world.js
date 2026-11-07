import * as THREE from './vendor/three.module.js';
import {Route} from './geo.js';
import {drawText} from './game-text.js?v=0.8.2-puns';

const material=color=>new THREE.MeshStandardMaterial({color,roughness:.8});
const cube=(group,w,h,d,mat,x,y,z,yaw=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.y=yaw;m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
function plate(group,label,w,h,x,y,z,yaw,bg='#a9342b',fg='#fff2cc'){
 if(typeof document==='undefined')return;
 const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);ctx.fillStyle=fg;ctx.textAlign='center';ctx.font='bold 112px "PingFang TC",sans-serif';drawText(ctx,label,512,169,970);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.set(y<.2?-Math.PI/2:0,yaw,0,'YXZ');m.name=label;group.add(m);
}
export function makeRestaurants(world){
 for(const shop of world.route.data.restaurants||[]){
  const group=new THREE.Group();group.name='麥當勞店景・'+shop.id;group.userData={osmWayId:shop.osmWayId,drivewayWayId:shop.drivewayWayId,address:shop.address};world.scene.add(group);
  const cream=material(0xddd2b7),red=material(0xa3342b),dark=material(0x304b4e),yellow=material(0xf0bd38),steel=material(0x6c7471),walk=material(0xb8b2a1);
  const ps=shop.footprint.slice(0,-1),shape=new THREE.Shape();ps.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:shop.height,bevelEnabled:false});geo.rotateX(-Math.PI/2);
  const shell=new THREE.Mesh(geo,cream);shell.name='實際餐廳輪廓';shell.castShadow=true;shell.receiveShadow=true;group.add(shell);
  // Every facade follows the mapped polygon instead of an invented rectangular lot.
  for(let i=0;i<ps.length;i++){
   const a=ps[i],b=ps[(i+1)%ps.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),cx=(a.x+b.x)/2,cz=(a.z+b.z)/2,yaw=Math.atan2(-dz,dx),nx=(cx-shop.x)/Math.hypot(cx-shop.x,cz-shop.z),nz=(cz-shop.z)/Math.hypot(cx-shop.x,cz-shop.z);
   cube(group,len,1.2,.26,red,cx,shop.height-.6,cz,yaw);
   cube(group,len-.8,1.9,.08,dark,cx+nx*.09,1.75,cz+nz*.09,yaw);
   cube(group,len+.6,.18,1.3,steel,cx+nx*.4,3,cz+nz*.4,yaw);
   for(let k=1;k<Math.floor(len/2);k++)cube(group,.08,2.1,.13,cream,a.x+dx*k/Math.floor(len/2)+nx*.12,1.75,a.z+dz*k/Math.floor(len/2)+nz*.12,yaw);
  }
  const entry=shop.driveway[0],dx=entry.x-shop.x,dz=entry.z-shop.z,dist=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz),face=ps.reduce((best,p)=>Math.max(best,((p.x-shop.x)*dx+(p.z-shop.z)*dz)/dist),0)+.3;
  plate(group,'麥當勞',10,1.9,shop.x+dx/dist*face,shop.height-.7,shop.z+dz/dist*face,yaw);
  const road=new Route({points:shop.queuePath,lengthMeters:shop.queuePath.at(-1).s}),pickup=road.sample(shop.serviceS);
  // The service lane is reserved in RoadClearance before trees or furniture are placed.
  world.roadLine(shop.driveway,3.3,world.mats.road,.065);
  const pole=road.sample(Math.max(0,shop.serviceS-24),-3.3);
  cube(group,.34,8,.34,steel,pole.x,4,pole.z);cube(group,3.6,2.6,.5,red,pole.x,7,pole.z,yaw);
  plate(group,'麥當勞',3.5,1,pole.x+Math.sin(yaw)*.28,7.3,pole.z+Math.cos(yaw)*.28,yaw);
  plate(group,'得來速 →',3.5,.9,pole.x+Math.sin(yaw)*.29,6.35,pole.z+Math.cos(yaw)*.29,yaw,'#302e2b','#efc553');
  // Menu/order pedestal beside the lane, keeping the car body envelope open.
  const board=road.sample(shop.serviceS-17,-2.1);
  cube(group,.35,1.5,.35,steel,board.x,.75,board.z);
  cube(group,1.4,1.8,.25,dark,board.x,2,board.z,board.yaw+Math.PI/2);
  plate(group,'點餐・請稍候',1.3,.55,board.x,2.3,board.z,board.yaw+Math.PI/2,'#273e39','#ffe4a3');
  const window=road.sample(shop.serviceS,-2.05);
  cube(group,1.7,1.4,.26,red,window.x,1.5,window.z,window.yaw+Math.PI/2);
  plate(group,'取餐',1.4,.7,window.x,2.4,window.z,window.yaw+Math.PI/2);
  for(const [s,label] of [[shop.serviceS-35,'得來速'],[shop.serviceS+18,'出口 →']]){const a=road.sample(s);plate(group,label,2.4,1,a.x,.095,a.z,a.yaw,'#465051','#eee7ce');}
  // Small pedestrian waiting group on the forecourt, away from the drive-through.
  const front=road.sample(shop.serviceS-9,-5.5);
  if(world.clearance.free(front.x,front.z,2.8,0,2)){
   cube(group,4.8,.12,2.4,walk,front.x,.1,front.z,front.yaw);
   for(let i=0;i<5;i++){
    const x=front.x+Math.cos(front.yaw)*(i-2)*.7,z=front.z-Math.sin(front.yaw)*(i-2)*.7;
    cube(group,.4,.85,.28,i%2?red:dark,x,.8,z);const head=new THREE.Mesh(new THREE.SphereGeometry(.17,8,6),cream);head.position.set(x,1.4,z);group.add(head);
   }
  }
  group.userData.queueService={x:pickup.x,z:pickup.z};
 }
}
