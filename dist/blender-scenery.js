import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export class BlenderScenery{
 static async create(archive,roadTexture){
  const data=archive.data.scenery,s=new BlenderScenery(archive,data.tiles,roadTexture);try{if(data.global)await s.load({...data.global,global:true});const terrain=await s.loader.parseAsync(await archive.get(archive.data.terrain),'');terrain.scene.name='Blender 地表與遠山';terrain.scene.userData.weatherMats=[];s.root.add(terrain.scene);s.loaded.set('terrain',terrain.scene);}catch(e){s.dispose();throw e;}return s;
 }
 constructor(archive,tiles,roadTexture){this.archive=archive;this.tiles=tiles;this.roadTexture=roadTexture;this.loader=new GLTFLoader();this.root=new THREE.Group();this.root.name='Blender 街景區塊';this.loaded=new Map();this.pending=new Map();this.closed=false;this.lastCell='';this.rain=0;}
 near(x,z,radius){return this.tiles.filter(t=>{const dx=Math.max(t.x*500-x,0,x-(t.x+1)*500),dz=Math.max(t.z*500-z,0,z-(t.z+1)*500);return dx*dx+dz*dz<radius*radius;});}
 async load(t){
  const key=t.global?'global':t.x+','+t.z;if(this.loaded.has(key))return this.loaded.get(key);if(this.pending.has(key))return this.pending.get(key);
  const promise=this.archive.get(t).then(bytes=>this.loader.parseAsync(bytes,'')).then(g=>{
   if(this.closed){this.destroy(g.scene);return null;}g.scene.userData.weatherMats=[];g.scene.traverse(o=>{if(o.isMesh&&o.name.startsWith('關新路・灰色瀝青'))g.scene.userData.weatherMats.push(o.material);if(o.isMesh&&o.name.startsWith('關新路・')&&o.geometry.attributes.uv&&(/灰色瀝青|路邊停車帶/.test(o.name))){o.material.map=this.roadTexture;o.material.needsUpdate=true;}});
   this.applyWeather(g.scene);this.root.add(g.scene);this.loaded.set(key,g.scene);return g.scene;
  }).finally(()=>this.pending.delete(key));this.pending.set(key,promise);return promise;
 }
 async ensureNear(x,z){this.current={x,z};await Promise.all(this.near(x,z,1100).map(t=>this.load(t)));if(!this.closed)this.prune(this.current.x,this.current.z);}
 update(x,z){const cell=Math.floor(x/250)+','+Math.floor(z/250);if(cell===this.lastCell)return;this.lastCell=cell;this.ensureNear(x,z).catch(e=>console.error('街景區塊載入失敗',e));}
 applyWeather(scene){for(const m of scene.userData.weatherMats){m.roughness=this.rain?.36:.98;m.color.setHex(this.rain?0x606b68:0x84867c);}}
 setWeather(rain){if(this.rain===rain)return;this.rain=rain;for(const scene of this.loaded.values())this.applyWeather(scene);}
 prune(x,z){const keep=new Set(this.near(x,z,1700).map(t=>t.x+','+t.z));keep.add('global');keep.add('terrain');for(const [k,obj] of this.loaded){if(!keep.has(k)){this.root.remove(obj);this.destroy(obj);this.loaded.delete(k);}}}
 destroy(obj){const gs=new Set(),ms=new Set(),ts=new Set();obj.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));});for(const m of ms){for(const value of Object.values(m))if(value?.isTexture&&value!==this.roadTexture)ts.add(value);m.dispose();}for(const t of ts){t.dispose();t.source?.data?.close?.();}for(const g of gs)g.dispose();}
 dispose(){this.closed=true;for(const obj of this.loaded.values())this.destroy(obj);this.loaded.clear();this.root.clear();}
}
