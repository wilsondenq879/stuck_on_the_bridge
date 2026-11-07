import {GLTFLoader} from './vendor/GLTFLoader.js';
import * as THREE from './vendor/three.module.js';

// Tiles are baked in Blender from the same surveyed route geometry used by
// traffic. A radius beyond the camera's view keeps upcoming pavement ready.
export class BlenderRoads{
 static async create(archive){
  const texture=await new THREE.TextureLoader().loadAsync('assets/asphalt.png?v=0.9.7');texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=2;
  return new BlenderRoads(archive,archive.data.roads.tiles,texture);
 }
 constructor(archive,tiles,texture){this.archive=archive;this.tiles=tiles;this.texture=texture;this.loader=new GLTFLoader();this.root=new THREE.Group();this.root.name='Blender 路面區塊';this.loaded=new Map();this.pending=new Map();this.closed=false;this.lastCell='';this.rain=0;}
 near(x,z,radius){return this.tiles.filter(t=>{const dx=Math.max(t.x*500-x,0,x-(t.x+1)*500),dz=Math.max(t.z*500-z,0,z-(t.z+1)*500);return dx*dx+dz*dz<radius*radius;});}
 async load(t){
  const key=t.x+','+t.z;if(this.loaded.has(key))return this.loaded.get(key);if(this.pending.has(key))return this.pending.get(key);
  const promise=this.archive.get(t).then(bytes=>this.loader.parseAsync(bytes,'')).then(g=>{
   if(this.closed){this.destroy(g.scene);return null;}g.scene.userData.weatherMats=[];g.scene.traverse(o=>{if(o.isMesh&&o.material.name==='road'&&o.geometry.attributes.uv){o.material.map=this.texture;o.material.needsUpdate=true;g.scene.userData.weatherMats.push(o.material);}});this.applyWeather(g.scene);g.scene.name='Blender 道路 '+key;this.root.add(g.scene);this.loaded.set(key,g.scene);return g.scene;
  }).finally(()=>this.pending.delete(key));this.pending.set(key,promise);return promise;
 }
 async ensureNear(x,z){this.current={x,z};await Promise.all(this.near(x,z,1100).map(t=>this.load(t)));if(!this.closed)this.prune(this.current.x,this.current.z);}
 update(x,z){const cell=Math.floor(x/250)+','+Math.floor(z/250);if(cell===this.lastCell)return;this.lastCell=cell;
  this.ensureNear(x,z).catch(e=>console.error('道路區塊載入失敗',e));
 }
 applyWeather(scene){for(const m of scene.userData.weatherMats){m.roughness=this.rain?.27:.96;m.color.setHex(this.rain?0x354448:0x465051);}}
 setWeather(rain){if(this.rain===rain)return;this.rain=rain;for(const scene of this.loaded.values())this.applyWeather(scene);}
 prune(x,z){const keep=new Set(this.near(x,z,1700).map(t=>t.x+','+t.z));for(const [k,obj] of this.loaded){if(!keep.has(k)){this.root.remove(obj);this.destroy(obj);this.loaded.delete(k);}}}
 destroy(obj){const g=new Set(),m=new Set();obj.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(x=>m.add(x));});for(const v of g)v.dispose();for(const v of m)v.dispose();}
 dispose(){this.closed=true;for(const obj of this.loaded.values())this.destroy(obj);this.loaded.clear();this.root.clear();this.texture?.dispose();this.archive.dispose();}
}
