import * as THREE from './vendor/three.module.js';
import {drawText} from './game-text.js?v=0.8.2-puns';
import {pointInPolygon,rectangleFootprint} from './environment.js';

// OSM park boundary; facilities reconstructed from the city and designer's description.
export function makeGuanxinPark(parts,sites,outline){
 const name='關新公園・日光公園',group=parts.group(name);
 const north={x:(outline[0].x+outline[1].x)/2,z:(outline[0].z+outline[1].z)/2};
 const anchor={...north,yaw:Math.atan2(outline[0].z-outline[1].z,outline[1].x-outline[0].x)};
 const at=(x,z)=>({x:anchor.x+x*Math.cos(anchor.yaw)+z*Math.sin(anchor.yaw),z:anchor.z-x*Math.sin(anchor.yaw)+z*Math.cos(anchor.yaw),yaw:anchor.yaw});
 const safe=(x,z,w,d,h)=>{const a=at(x,z),poly=rectangleFootprint(a.x,a.z,w,d,a.yaw);return poly.every(p=>pointInPolygon(p.x,p.z,outline))&&sites.safe(poly,h);};
 const B=(x,y,z,w,h,d,color,shape='box')=>parts.add(name,anchor,x,y,z,w,h,d,color,shape);
 const patch=(label,x,z,w,d,color)=>{if(safe(x,z,w,d,.22)){B(x,.08,z,w,.12,d,color);group.userData.facilities.push(label);}};
 group.userData.facilities=[];
 group.userData.sources=['https://kids.hccg.gov.tw/resources-detail.php?id=JCU0IyE%3D','https://ta-mag.net/ta/News.php?id=1852'];
 const mound=(x,z,w,d,h)=>{if(!safe(x,z,w,d,h))return;const a=at(x,z),m=new THREE.Mesh(new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0x859b56,roughness:1}));m.position.set(a.x,.08,a.z);m.scale.set(w/2,h,d/2);m.rotation.y=anchor.yaw;m.name='地景草丘';m.receiveShadow=true;group.add(m);};
 const slide=(label,x,z,width,height,length)=>{
  if(!safe(x,z,width+2,length+3,height+1))return;
  const positions=[],n=18;
  for(let i=0;i<n;i++){
   const q=i/n,r=(i+1)/n;
   const y=t=>.18+height*(1-t)*(1-t)*(1+2*t);
   for(const [u,t] of [[-1,q],[1,q],[1,r],[-1,q],[1,r],[-1,r]])positions.push(u*width/2,y(t),length*(t-.5));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const a=at(x,z),m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xd0cbbb,roughness:.74,side:THREE.DoubleSide}));m.position.set(a.x,0,a.z);m.rotation.y=a.yaw;m.name=label;group.add(m);
  for(let i=0;i<=n;i++)for(const side of [-1,1]){const t=i/n,y=.18+height*(1-t)*(1-t)*(1+2*t);B(x+side*(width/2+.12),y+.18,z+length*(t-.5),.24,.36,length/n+.1,0xaaa58f);}
  for(let i=0;i<7;i++)B(x-width/2-1.1,(i+.5)*height/7,z+length/2-i*length/7,1.2,height/7,length/7+.06,0xaea990);
  group.userData.facilities.push(label);
 };
 // North play hill, south toddler hill, and an open centre lawn retain their geographic order.
 patch('北側遊戲軟墊',-19,29,43,29,0xb9946a);mound(-14,24,25,22,2.7);slide('北側磨石子寬滑梯',-20,28,5.5,2.55,10);
 patch('南側幼兒共融遊戲區',-19,94,38,25,0xb9a47b);mound(-13,90,16,15,1.35);slide('南側草坡小滑梯',-17,94,2.2,1.35,6);
 patch('中央大草坪',14,62,43,42,0x91a968);
 patch('星河數字遊戲巷',-24,61,12,27,0x98a9a0);
 patch('共融沙坑',-23,107,16,9,0xd8c49a);
 if(safe(-6,105,3,2,1)){B(-6,.72,105,2.5,.2,1.5,0xd1c0a0);for(const x of [-7,-5])B(x,.36,105,.15,.72,.15,0x7b887d);group.userData.facilities.push('共融沙桌');}
 if(safe(-8,43,10,7,3.5)){
  for(const x of [-12,-4])for(const z of [40,46])B(x,1.55,z,.16,3.1,.16,0x718b7c,'round');
  for(let i=0;i<7;i++){B(-12+i*1.33,2.5,43,.065,.065,6,0xd8c8a2);B(-8,2.5,40+i,.065,1.2, .065,0xb69e7e);}
  for(const x of [-12,-4])for(let i=0;i<6;i++)B(x,.4+i*.4,43,.08,.07,6,0xb9c3a7);
  B(-8,2.85,43,8.3,.14,6.2,0x8b9a79);group.userData.facilities.push('攀爬遊戲台');
 }
 if(safe(27,28,15,10,4)){
  for(const x of [21,33])for(const z of [25,31])B(x,1.7,z,.2,3.4,.2,0x7c7768);
  for(let i=0;i<9;i++)B(20+i*1.75,3.45,28,.32,.22,9.6,0x9b8d71);
  for(const x of [23,31]){B(x,.48,28,2.5,.22,.85,0xa7aba1);B(x,.24,28,.3,.48,.65,0x7f8b7e);}
  group.userData.facilities.push('林蔭景觀棚架');
 }
 if(safe(23,94,14,2,2.4)){
  B(23,1.05,94,12,2.1,.28,0x476058);for(const x of [17,29])B(x,1.2,94,.2,2.4,.4,0x8f8e78);
  group.userData.facilities.push('塗鴉黑板牆');
 }
 if(typeof document!=='undefined'){
  const lettering=(x,y,z,w,h,draw,flat=false)=>{
   const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');draw(ctx);
   const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
   const p=at(x,z),m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,transparent:true,side:THREE.DoubleSide}));m.position.set(p.x,y,p.z);m.rotation.set(flat?-Math.PI/2:0,anchor.yaw,0,'YXZ');m.name=flat?'數字遊戲地坪':'兒童粉筆塗鴉';group.add(m);
  };
  if(safe(23,94,14,2,2.4))lettering(23,1.12,94.16,11.5,1.7,c=>{
   c.strokeStyle='#e3dfb6';c.lineWidth=3;c.strokeRect(18,25,476,210);c.font='48px sans-serif';c.fillStyle='#e8e4c3';drawText(c,'一起玩，慢慢開',38,83);
   for(let i=0;i<6;i++){c.beginPath();c.arc(60+i*76,160,24,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(60+i*76,184);c.lineTo(60+i*76,211);c.stroke();}
  });
  for(let i=0;i<9;i++)if(safe(-24,50+i*2.4,2.4,2.2,.2))lettering(-24,.152,50+i*2.4,2.4,2.2,c=>{
   c.strokeStyle='#f1e6bc';c.lineWidth=9;c.strokeRect(12,12,488,232);c.fillStyle='#f1e6bc';c.font='180px sans-serif';c.textAlign='center';drawText(c,i+1,256,195);
  },true);
 }
 // Timber seats and moon-shaped seats along the play alley.
 for(const [x,z] of [[-38,59],[-38,76],[25,87],[25,106]])if(safe(x,z,3,1.5,1.2)){
  B(x,.47,z,2.6,.18,.72,0x9b8264);B(x,.76,z-.3,2.6,.48,.13,0x9b8264);for(const t of [-1,1])B(x+t,.22,z,.16,.44,.5,0x667366);
 }
 for(const z of [54,74])if(safe(-10,z,3,3,1.4)){
  const a=at(-10,z),moon=new THREE.Mesh(new THREE.TorusGeometry(1,.22,7,18,Math.PI*1.35),new THREE.MeshStandardMaterial({color:0xdfd9ad,roughness:.8}));moon.position.set(a.x,.75,a.z);moon.rotation.set(0,a.yaw,.35);moon.name='月亮遊憩座椅';group.add(moon);
 }
 // An entrance plaque faces drivers on Guanxin Road, inside the mapped park boundary.
 if(typeof document!=='undefined'&&safe(-40,45,3.4,1.5,1.6)){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;const c=canvas.getContext('2d');c.fillStyle='#6b7965';c.fillRect(0,0,512,192);c.fillStyle='#f2eedb';c.textAlign='center';c.font='600 64px sans-serif';drawText(c,'關新公園',256,92);c.font='24px sans-serif';drawText(c,'日光・草地・遊戲巷',256,147);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const p=at(-40,45),m=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.27),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide}));m.position.set(p.x,1,p.z);m.rotation.y=anchor.yaw-Math.PI/2;m.name='公園入口石牌';group.add(m);
 }
 return group;
}
