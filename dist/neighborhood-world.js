import {drawText} from './game-text.js?v=0.8.2-puns';
import * as THREE from './vendor/three.module.js';
import {seeded} from './geo.js';
import {geographicPoint} from './environment.js';
import {STOREY,GARAGE_EXTERIOR_END,isErchong,streetDistrict,streetHousePlan,communityBlocks} from './neighborhood.js';

const PASTELS=[0xb8afa0,0xbac0b3,0xa7b6b7,0xc4b0a0,0xd1c8b4,0x899d98];
const SHOP_NAMES=['早餐・豆漿','機車維修','五金行','便當・麵飯','冷飲・茶','理髮'];
function canvasMap(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function material(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:.92,...extra});}
class Parts{
 constructor(parent){this.parent=parent;this.groups=new Map();this.unit=new THREE.BoxGeometry(1,1,1);this.plane=new THREE.PlaneGeometry(1,1);this.round=new THREE.CylinderGeometry(.5,.5,1,8);this.tree=new THREE.IcosahedronGeometry(1,1);}
 add(mat,anchor,pos,size,shape='box',color=null){const geo=shape==='plane'?this.plane:shape==='round'?this.round:shape==='tree'?this.tree:this.unit;const key=mat.uuid+shape;if(!this.groups.has(key))this.groups.set(key,{mat,geo,parts:[]});const a=anchor||{},yaw=a.yaw||0,[x,y,z]=pos;this.groups.get(key).parts.push({x:(a.x||0)+x*Math.cos(yaw)+z*Math.sin(yaw),y:(a.y||0)+y,z:(a.z||0)-x*Math.sin(yaw)+z*Math.cos(yaw),yaw,size,color});}
 finish(){for(const {mat,geo,parts} of this.groups.values()){const m=new THREE.InstancedMesh(geo,mat,parts.length),o=new THREE.Object3D();parts.forEach((p,i)=>{o.position.set(p.x,p.y,p.z);o.rotation.set(0,p.yaw,0);o.scale.set(...p.size);o.updateMatrix();m.setMatrixAt(i,o.matrix);if(p.color!==null)m.setColorAt(i,new THREE.Color(p.color));});m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();this.parent.add(m);}}
}
function houseTexture(floors,variant){return canvasMap(256,floors*128,(c,w,h)=>{
 const random=seeded(floors*90+variant),base=['#bab1a1','#bfc2b6','#a5b4b6','#c3ad9b','#d3c7b1','#92a5a1'][variant];c.fillStyle=base;c.fillRect(0,0,w,h);
 c.strokeStyle='#817f6c38';c.lineWidth=1;for(let x=0;x<w;x+=12){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<h;y+=10){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
 for(let i=0;i<28;i++){const x=random()*w,y=random()*h;c.fillStyle=i%3===0?'#756f5848':'#ece6d12d';c.fillRect(x,y,5+random()*23,14+random()*55);}
 for(let floor=1;floor<floors;floor++){
  const y=h-(floor+1)*128;c.fillStyle='#c6c2b2';c.fillRect(0,y+116,w,9);
  for(let j=0;j<2;j++){const x=22+j*123;c.fillStyle='#39484a';c.fillRect(x,y+25,88,65);c.strokeStyle='#c8cac0';c.lineWidth=4;c.strokeRect(x,y+25,88,65);c.beginPath();c.moveTo(x+44,y+26);c.lineTo(x+44,y+89);c.stroke();
   c.strokeStyle='#758482';c.lineWidth=2;for(let k=0;k<6;k++){c.beginPath();c.moveTo(x+8+k*13,y+24);c.lineTo(x+8+k*13,y+91);c.stroke();}
   if((floor+j+variant)%2===0){c.fillStyle='#dedbd0';c.fillRect(x+50,y+94,38,23);c.strokeStyle='#878d87';for(let k=0;k<5;k++){c.beginPath();c.moveTo(x+54,y+98+k*3);c.lineTo(x+84,y+98+k*3);c.stroke();}}
  }
 }
 const ground=h-128;c.fillStyle=['#4c6969','#696e67','#6d777b','#8a7e70','#586969','#726c60'][variant];c.fillRect(7,ground+33,w-14,94);c.strokeStyle='#c0c5b84a';c.lineWidth=2;for(let y=ground+37;y<h;y+=7){c.beginPath();c.moveTo(8,y);c.lineTo(w-8,y);c.stroke();}
 if(variant%2===0){c.fillStyle='#293a36';c.fillRect(20,ground+40,84,86);c.fillStyle='#8d9c8e';c.fillRect(30,ground+47,66,46);c.fillStyle='#b4b2a0';c.fillRect(69,ground+43,4,82);}
 if(variant%3!==1){c.fillStyle=['#8e4039','#e4dac0','#346b6b'][variant%3];c.fillRect(0,ground+1,w,34);c.fillStyle=variant%3===1?'#784a3a':'#f1e6c8';c.font='bold 26px sans-serif';c.textAlign='center';drawText(c,SHOP_NAMES[variant],w/2,ground+27,242);}
 });}
function bladeSign(variant){return canvasMap(128,320,(c,w,h)=>{c.fillStyle=variant%2?'#c9b49c':'#833b34';c.fillRect(0,0,w,h);c.strokeStyle='#d2c8a7';c.lineWidth=7;c.strokeRect(5,5,w-10,h-10);c.fillStyle=variant%2?'#624932':'#e5d8ad';c.textAlign='center';c.font='bold 72px sans-serif';const words=['早餐','機車','五金','便當','茶飲','理髮'][variant];[...words].forEach((word,i)=>drawText(c,word,w/2,117+i*108));});}
function makePalette(){return {body:material(0xffffff),concrete:material(0xbfb9aa),roof:material(0x758886),awning:material(0x4d7375),metal:material(0xa0aaa4),dark:material(0x344447),leaf:material(0x657f51),wood:material(0x77735e),white:material(0xdedfd6),blue:material(0x364b72),yellow:material(0xc7a536),glass:material(0x263e4a,{roughness:.4}),lawn:material(0x77965d),facades:new Map()};}
function house(parts,m,h){const a=h,y=h.height;
 parts.add(m.body,a,[0,y/2,0],[h.width,y,h.depth],'box',PASTELS[h.variant]);
 const key=h.floors+':'+h.variant;if(!m.facades.has(key))m.facades.set(key,material(0xffffff,{map:houseTexture(h.floors,h.variant)}));
 parts.add(m.facades.get(key),a,[0,y/2,h.depth/2+.025],[h.width,y,1],'plane');
 parts.add(m.concrete,a,[0,y+.25,0],[h.width+.15,.5,h.depth+.15]);
 if(h.variant%2===0)parts.add(m.roof,a,[0,y+.7,-1],[h.width*.88,.13,h.depth*.65]);
 parts.add(m.awning,a,[0,3.08,h.depth/2+.65],[h.width,.14,1.65]);
 for(const side of[-1,1])parts.add(m.concrete,a,[side*(h.width/2-.22),1.48,h.depth/2+.9],[.2,2.96,.2]);
 if(h.variant%3===0){parts.add(m.metal,a,[h.width*.25,y+1.05,-h.depth*.1],[1.5,1.6,1.5],'round');parts.add(m.dark,a,[h.width*.25,y+1.9,-h.depth*.1],[1.6,.1,1.6],'round');}
 if(h.variant%2===0){const key='blade:'+h.variant;if(!m.facades.has(key))m.facades.set(key,material(0xffffff,{map:bladeSign(h.variant),side:THREE.DoubleSide}));const x=h.width/2-.2,z=h.depth/2+1.2,a2={x:a.x+x*Math.cos(a.yaw)+z*Math.sin(a.yaw),y:a.y||0,z:a.z-x*Math.sin(a.yaw)+z*Math.cos(a.yaw),yaw:a.yaw+Math.PI/2};parts.add(m.facades.get(key),a2,[0,5.3,0],[1.05,2.7,1],'plane');}
 // Older projecting balcony floors and rust-coloured railings are real geometry.
 for(let f=1;f<h.floors;f++)if((f+h.variant)%2===0){parts.add(m.concrete,a,[0,f*STOREY+.04,h.depth/2+.35],[h.width*.85,.14,.8]);parts.add(m.metal,a,[0,f*STOREY+.72,h.depth/2+.73],[h.width*.85,.08,.07]);}
}
function apartment(parts,m,b){const a={x:b.x,y:b.y||0,z:b.z,yaw:b.yaw||0},height=b.floors*STOREY;
 parts.add(m.white,a,[0,height/2,0],[b.width,height,b.depth]);
 for(let side=0;side<4;side++){const face={...a,yaw:a.yaw+side*Math.PI/2},span=side%2?b.depth:b.width,depth=side%2?b.width:b.depth;
  for(let f=0;f<b.floors;f++)for(let c=0;c<4;c++){
   const x=(c-1.5)*span/4,y=f*STOREY+1.7,z=depth/2+.08,w=span/4-.75;
   parts.add((f+c)%4===0?m.blue:m.dark,face,[x,y,z],[w,2.44,.16]);
   parts.add(m.glass,face,[x,y+.1,z+.12],[w*.72,1.85,.06]);
   parts.add(m.white,face,[x,f*STOREY+.16,z+.4],[w+.3,.25,.92]);
   parts.add(m.dark,face,[x,f*STOREY+1.03,z+.78],[w,.08,.08]);
   if(c===1&&f%4===1||c===3&&f%4===3){for(const v of[-1,1])parts.add(m.yellow,face,[x+v*w/2,y,z+.31],[.22,2.65,.42]);for(const v of[-1,1])parts.add(m.yellow,face,[x,y+v*1.3,z+.31],[w,.22,.42]);}
  }
 }
 parts.add(m.white,a,[0,height+.35,0],[b.width+.4,.7,b.depth+.4]);
}
function tree(parts,m,a,x,z,base=0,scale=1){parts.add(m.wood,a,[x,base+1.55*scale,z],[.22*scale,3.1*scale,.22*scale]);parts.add(m.leaf,a,[x,base+3.5*scale,z],[1.6*scale,2.1*scale,1.6*scale],'tree');}
function wires(parent,posts){const p=[];for(let i=1;i<posts.length;i++){const a=posts[i-1],b=posts[i];if(a.side!==b.side||Math.hypot(a.x-b.x,a.z-b.z)>80)continue;for(const level of[6.6,7.05,7.5])for(let j=0;j<6;j++){const u=j/6,v=(j+1)/6;for(const t of[u,v])p.push(a.x+(b.x-a.x)*t,level-Math.sin(t*Math.PI)*.38,a.z+(b.z-a.z)*t);}}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));parent.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x343c3c})));}
export function makeErchongStreets(world){if(!isErchong(world.route))return;const group=new THREE.Group();group.name='二重埔・中興路・光復路低層街廓';world.scene.add(group);const p=new Parts(group),m=makePalette(),route=world.route,plan=streetHousePlan(route,world.bikeRoute);world.streetHousePlan=plan;
 for(const h of plan)house(p,m,h);
 const posts=[];for(const side of[-1,1])for(let s=20;s<4960;s+=48){const edge=route.width(s)/2+(side<0?route.width(s)+1.5:0),v=world.clearance.roadside(route,s,side*(edge+2.6),.25,7.8);if(!v)continue;const a={x:v.x,z:v.z,yaw:v.yaw};p.add(m.concrete,a,[0,3.9,0],[.3,7.8,.3],'round');p.add(m.dark,a,[0,1.2,0],[.33,2.4,.33],'round');for(let k=0;k<4;k++)p.add(m.yellow,a,[0,.3+k*.55,0],[.35,.2,.35],'round');p.add(m.wood,a,[0,6.9,0],[1.5,.13,.13]);posts.push({x:v.x,z:v.z,side});}
 wires(group,posts);
 // The mid-Zhongxing sample has a large open field on the north/right side.
 for(let s=1320;s<2180;s+=75){const v=route.sample(s,75),a={x:v.x,z:v.z,yaw:v.yaw};p.add(m.lawn,a,[0,-.04,0],[120,.05,74]);for(let i=0;i<6;i++)p.add(m.wood,a,[-50+i*20,.005,0],[.16,.03,73]);}
 // Low roadside service station visible near the Mingxing junction reference.
 {const v=route.sample(95,24),a={x:v.x,z:v.z,yaw:v.yaw-Math.PI/2};p.add(m.concrete,a,[0,.03,0],[30,.08,23]);p.add(m.lawn,a,[0,5.4,0],[26,.45,15]);p.add(m.white,a,[0,5.06,0],[26,.2,15]);for(const x of[-10,10])p.add(m.white,a,[x,2.5,0],[.35,5,.35]);for(const x of[-7,0,7]){p.add(m.white,a,[x,1,0],[.85,2,.55]);p.add(m.dark,a,[x,1.4,.3],[.55,.45,.06]);}p.add(m.white,a,[0,2,-10],[20,4,5]);}
 // Institutional setbacks near Mingxing Road; not a wall of roadside towers.
 for(let s=40;s<360;s+=18){const v=route.sample(s,-route.width(s)*1.5-4),a={x:v.x,z:v.z,yaw:v.yaw};p.add(m.concrete,a,[0,.35,0],[.3,.7,17.6]);p.add(m.metal,a,[0,1.1,0],[.08,1.2,17.6]);tree(p,m,a,-4,0,0,1.25);}
 for(const s of[1450,1750,2050]){const v=route.sample(s,-58),a={x:v.x,z:v.z,yaw:v.yaw+Math.PI/2};p.add(m.body,a,[0,8.6,0],[65,17.2,32],'box',0xb2bfba);for(let f=0;f<5;f++)p.add(m.glass,a,[0,2+f*3.2,16.03],[59,.9,.08]);}
 // Six grouped, 14-storey volumes at the researched community's vicinity.
 // The arrangement is a massing approximation; the driving prologue is separate.
 const loc=geographicPoint(route.data.origin,24.7738302,121.0570896);for(const b of communityBlocks)apartment(p,m,{...b,x:loc.x+b.x,z:loc.z+b.z,y:2});
 p.finish();world.neighborhoodGroup=group;
}
export function makeCommunityExit(parent){const p=new Parts(parent),m=makePalette(),base=15.5;
 // One shared underground exit, multiple blocks, landscaped setbacks and guardhouse.
 for(const b of communityBlocks)apartment(p,m,{...b,y:base});
 for(const side of[-1,1])p.add(m.concrete,null,[side*60,base-.22,-110],[110,.4,180]);
 p.add(m.concrete,null,[0,base-.22,-131],[10,.4,138]);
 for(const side of[-1,1]){p.add(m.lawn,null,[side*22,base+.02,-92],[28,.08,58]);for(let z=-70;z>-125;z-=15)tree(p,m,null,side*12,z,base,1);}
 p.add(m.white,null,[9,base+1.65,-115],[5,3.3,4]);p.add(m.glass,null,[9,base+2.05,-112.95],[4,1.2,.06]);
 p.add(m.dark,null,[0,base+3.9,-122],[18,.25,1.1]);for(const x of[-8.8,8.8])p.add(m.white,null,[x,base+1.9,-122],[.38,3.8,.38]);
 // The same scene continues beyond the estate gate into old, narrow-front houses.
 for(let i=0;i<7;i++)for(const side of[-1,1]){const floors=2+(i%3),depth=10;house(p,m,{x:side*11.5,y:base,z:-137-i*7.6,yaw:-side*Math.PI/2,width:7.2,depth,floors,height:floors*STOREY,variant:(i+(side>0?2:0))%6});}
 p.add(m.roof,null,[0,base-.045,-(126+GARAGE_EXTERIOR_END)/2],[9,.05,GARAGE_EXTERIOR_END-126+14]);
 const poles=[];for(let s=134;s<GARAGE_EXTERIOR_END;s+=25){const x=6.1;p.add(m.concrete,null,[x,base+3.9,-s],[.24,7.8,.24],'round');poles.push({x,z:-s,side:1});}
 // Shift these exterior wires to the street level above the underground ramp.
 const wg=new THREE.Group();wg.position.y=base;parent.add(wg);wires(wg,poles);p.finish();
}
