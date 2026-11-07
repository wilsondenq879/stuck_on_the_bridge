import {drawText} from './game-text.js?v=0.8.2-puns';
import * as THREE from './vendor/three.module.js';
import {clamp,seeded} from './geo.js';
import {WEATHER,geographicPoint} from './environment.js';

export class EnvironmentWorld {
 constructor(world,terrain){
  this.w=world;this.terrain=terrain;this.random=seeded(938);this.time=0;this.weather='';this.labels=[];
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const c=canvas.getContext('2d');
  const gradient=c.createLinearGradient(0,0,0,1024);gradient.addColorStop(0,'#377bb7');gradient.addColorStop(.36,'#73b5d9');gradient.addColorStop(.53,'#c1dde0');gradient.addColorStop(1,'#d3d9c6');c.fillStyle=gradient;c.fillRect(0,0,2048,1024);
  for(let i=0;i<45;i++){const x=this.random()*2048,y=190+this.random()*280,r=30+this.random()*80;c.fillStyle=`rgba(255,255,245,${.08+this.random()*.12})`;for(let j=0;j<4;j++){c.beginPath();c.ellipse(x+j*r*.45,y+(j%2)*9,r,r*.25,0,0,Math.PI*2);c.fill();}}
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(38000,32,16),new THREE.MeshBasicMaterial({map:tex,side:THREE.BackSide,depthWrite:false,fog:false}));this.sky.renderOrder=-20;world.scene.add(this.sky);
  if(terrain)this.makeTerrain();
  this.rainPositions=new Float32Array(1600*6);this.drops=Array.from({length:1600},()=>({x:(this.random()-.5)*80,y:this.random()*36,z:(this.random()-.5)*90}));
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3).setUsage(THREE.DynamicDrawUsage));
  this.rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0xc9e2ea,transparent:true,opacity:.45,depthWrite:false}));this.rain.frustumCulled=false;world.scene.add(this.rain);
 }
 makeTerrain(){
  const {cols,rows,bounds,heights,peaks}=this.terrain,world=this.w,origin=world.route.data.origin,base=this.terrain.source.originSample.elevationMeters;
  const positions=[],colors=[],indices=[],low=new THREE.Color(0x889c72),high=new THREE.Color(0x3e7065),far=new THREE.Color(0x6c8d98),routes=[...world.route.points,...world.bikeRoute.points].filter((_,i)=>i%8===0);
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){
   const lat=bounds.maxLat-(bounds.maxLat-bounds.minLat)*r/(rows-1),lon=bounds.minLon+(bounds.maxLon-bounds.minLon)*col/(cols-1),p=geographicPoint(origin,lat,lon),height=heights[r*cols+col];
   let dist=Infinity;for(const q of routes)dist=Math.min(dist,Math.hypot(q.x-p.x,q.z-p.z));
   const t=clamp((dist-280)/850,0,1),blend=t*t*(3-2*t),y=Math.max(-2,height-base)*blend-1;
   positions.push(p.x,y,p.z);const color=low.clone().lerp(high,clamp(height/600,0,1)).lerp(far,clamp((height-700)/1500,0,1));colors.push(color.r,color.g,color.b);
  }
  for(let r=0;r<rows-1;r++)for(let col=0;col<cols-1;col++){const a=r*cols+col;indices.push(a,a+cols,a+1,a+1,a+cols,a+cols+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
  this.land=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));world.scene.add(this.land);
  for(const peak of peaks){const p=geographicPoint(origin,peak.lat,peak.lon),canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;const c=canvas.getContext('2d');c.fillStyle='#193e46cc';c.fillRect(0,0,512,88);c.fillStyle='#edf2dc';c.textAlign='center';c.font='34px "PingFang TC",sans-serif';drawText(c,peak.name+' '+Math.round(peak.elevation)+' m',256,57);c.fillStyle='#d4dbbd';c.beginPath();c.moveTo(246,88);c.lineTo(266,88);c.lineTo(256,106);c.fill();const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false}));sprite.position.set(p.x,peak.elevation-base+65,p.z);world.scene.add(sprite);this.labels.push({sprite,peak,p});}
 }
 update(sim,p,dt,challenge){
  this.time+=dt;const mode=sim.day?.weather||'sunny',weather=WEATHER[mode];
  if(this.weather!==mode){this.weather=mode;this.sky.material.color.setHex(weather.sky);this.w.scene.background.setHex(mode==='sunny'?0xc1dde0:mode==='rain'?0x8e9fa6:0x657882);this.w.scene.fog.color.copy(this.w.scene.background);this.w.scene.fog.density=weather.fog;this.w.sun.intensity=weather.sun;this.w.hemi.intensity=weather.ambient;this.w.mats.road.roughness=weather.rain?.27:.96;this.w.mats.road.color.setHex(weather.rain?0x354448:0x465051);}
  if(this.w.guanxinRoadMaterial){this.w.guanxinRoadMaterial.roughness=weather.rain?.36:.98;this.w.guanxinRoadMaterial.color.setHex(weather.rain?0x606b68:0x84867c);}
  this.sky.position.set(p.x,p.y,p.z);this.sky.rotation.y=this.time*.0004;
  this.rain.visible=weather.rain>0&&(!challenge||challenge.kind!=='garage'||challenge.player.s>60);this.rain.position.set(p.x,p.y,p.z);
  if(this.rain.visible){const count=weather.rain===2?1600:850;this.rain.geometry.setDrawRange(0,count*2);for(let i=0;i<count;i++){const d=this.drops[i];d.y-=dt*(weather.rain===2?47:29);d.x+=dt*weather.wind*20;if(d.y<0){d.y=35;d.x=(this.random()-.5)*80;d.z=(this.random()-.5)*90;}const k=i*6;this.rainPositions.set([d.x,d.y,d.z,d.x-weather.wind*5,d.y+1.8,d.z+.15],k);}this.rain.geometry.attributes.position.needsUpdate=true;}
  if(this.land)this.land.visible=!challenge;
  for(const {sprite} of this.labels){sprite.visible=!challenge&&mode==='sunny';const distance=sprite.position.distanceTo(this.w.camera.getWorldPosition(new THREE.Vector3()));sprite.scale.set(distance*.095,distance*.021,1);}
  if(this.w.wipers)for(let i=0;i<this.w.wipers.length;i++){const blade=this.w.wipers[i];blade.visible=weather.rain>0;blade.rotation.z=-.6+Math.sin(this.time*(weather.rain===2?8:4)+i*.1)*.65;}
 }
}
