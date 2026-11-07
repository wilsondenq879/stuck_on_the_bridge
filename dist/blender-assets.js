import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

export const CAR_BRANDS = [
 ['benz','笨馳'],['bmw','寶馬鈴薯'],['toyota','頭又大'],['nissan','你桑'],
 ['tesla','特斯啦'],['honda','齁達'],['porsche','保時結']
];
export const CAR_MODELS=CAR_BRANDS.flatMap(([id])=>[id+'_sedan',id+'_suv']);
const COLORS=[0xd7d9d7,0x384f56,0x8b969b,0x202d35,0xb3aa91,0x7c4c43,0xe0e3dc];
let request;
const chapters=new Map();
export function loadBlenderChapter(challenge){
 const id=challenge.kind==='garage'?'garage':challenge.day.collapse?'sinkhole':'sinkhole-safe';
 if(!chapters.has(id))chapters.set(id,new GLTFLoader().loadAsync('assets/chapters/'+id+'.glb?v=0.9.7').then(g=>g.scene).catch(e=>{chapters.delete(id);throw e;}));
 return chapters.get(id);
}
export function loadBlenderAssets(){
 const loader=new GLTFLoader();return request??=Promise.all(['commute-assets.glb','vehicles/bike.glb','vehicles/bus.glb','vehicles/cabin.glb'].map(p=>loader.loadAsync('assets/'+p+'?v=0.9.7'))).then(([cars,bike,bus,cabin])=>{const shell=cabin.scene.getObjectByName('cabin_asset');if(!shell)throw Error('缺少車內模型');return {...prepareBlenderAssets(cars.scene),bike:prepareVehicleAsset(bike.scene,'bike'),bus:prepareVehicleAsset(bus.scene,'bus'),cabin:shell};}).catch(e=>{request=null;throw e;});
}
export function prepareVehicleAsset(scene,kind){
 scene.updateMatrixWorld(true);const root=scene.getObjectByName(kind+'_asset');if(!root)throw Error('缺少車輛模型 '+kind);const inverse=root.matrixWorld.clone().invert(),groups=new Map(),parts=[];
 root.traverse(o=>{if(!o.isMesh)return;const role=(o.material.name.match(/^(?:bike|bus)_(paint|delivery|brake|headlight)_/)||[])[1]||'plain';let geometry=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;}
  for(const attr of Object.keys(geometry.attributes))if(attr!=='position'&&attr!=='normal'&&(attr!=='uv'||!o.material.map))geometry.deleteAttribute(attr);if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
  const key=o.material.uuid+':'+role;if(!groups.has(key))groups.set(key,{role,material:o.material,geometries:[]});groups.get(key).geometries.push(geometry);
 });
 for(const group of groups.values()){const geometry=mergeGeometries(group.geometries);if(!geometry)throw Error('車輛模型無法合併 '+kind);for(const g of group.geometries)g.dispose();parts.push({role:group.role,geometry,material:group.material});}
 if(!parts.length)throw Error('車輛模型是空的 '+kind);return parts;
}
export function prepareBlenderAssets(scene){
  const models=new Map();scene.updateMatrixWorld(true);
  for(const id of CAR_MODELS){
   const root=scene.getObjectByName('car_'+id);if(!root)throw new Error('缺少車輛模型 '+id);
   const inverse=root.matrixWorld.clone().invert(),parts=new Map();
   root.traverse(o=>{if(!o.isMesh)return;const key=o.material.name;
    let geometry=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));
    if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;}
    for(const attr of Object.keys(geometry.attributes))if(attr!=='position'&&attr!=='normal')geometry.deleteAttribute(attr);
    if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
    if(!parts.has(key))parts.set(key,{material:o.material,geometries:[]});parts.get(key).geometries.push(geometry);
   });
   const merged=[];for(const [name,part] of parts){
    const geometry=mergeGeometries(part.geometries);if(!geometry)throw new Error('車輛模型無法合併 '+id+' '+name);
    for(const g of part.geometries)g.dispose();merged.push({name,geometry,material:part.material});
   }models.set(id,merged);
  }
  const arch=scene.getObjectByName('restaurant_arch_pylon');if(!arch)throw new Error('缺少餐廳招牌');
  return {models,arch};
}
function indexFor(car,index){
 if(car.model&&CAR_MODELS.includes(car.model))return CAR_MODELS.indexOf(car.model);
 const id=String(car.id??car.visualId??index);let h=2166136261;
 for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);
 return (h>>>0)%CAR_MODELS.length;
}
export class BlenderTrafficBatch{
 constructor(scene,assets,count,player=false){this.parts=[];this.player=player;this.dummy=new THREE.Object3D();this.color=new THREE.Color();
  for(const [index,id] of CAR_MODELS.entries())for(const part of assets.models.get(id)){
   const mat=part.material.clone();if(part.name==='vehicle_paint')mat.color.setHex(0xffffff);
   const mesh=new THREE.InstancedMesh(part.geometry,mat,count);mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);this.parts.push({index,name:part.name,mesh});
  }
 }
 update(cars,route){
  const groups=Array.from({length:CAR_MODELS.length},()=>[]);cars.forEach((c,i)=>groups[indexFor(c,i)].push(c));
  for(const part of this.parts){const {mesh,name,index}=part,group=groups[index];mesh.count=Math.min(group.length,mesh.instanceMatrix.count);
   for(let i=0;i<mesh.count;i++){const c=group[i],p=c.world||route.sample(c.s,c.offset);this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(p.pitch||0,p.yaw+(c.reverse?Math.PI:0),0,'YXZ');this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);
    if(name==='vehicle_paint'||name==='brake_lamps'||name==='head_lamps'){
     const tint=name==='vehicle_paint'?(c.paint||COLORS[(c.color||0)%COLORS.length]):name==='brake_lamps'?(c.braking?0xff5444:0x8b2823):(c.flashing?0xffffff:0xbec8bd);
     mesh.setColorAt(i,this.color.setHex(tint));
    }
   }mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
 }
}
export class BlenderVehicleBatch{
 constructor(scene,parts,count){this.parts=[];this.dummy=new THREE.Object3D();this.color=new THREE.Color();for(const part of parts){const mat=part.material.clone();if(part.role!=='plain')mat.color.setHex(0xffffff);const mesh=new THREE.InstancedMesh(part.geometry,mat,count);mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);this.parts.push({role:part.role,mesh});}}
 update(cars,route){for(const {role,mesh} of this.parts){mesh.count=Math.min(cars.length,mesh.instanceMatrix.count);for(let i=0;i<mesh.count;i++){const c=cars[i],p=c.world||route.sample(c.s,c.offset);this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(p.pitch||0,p.yaw+(c.reverse?Math.PI:0),0,'YXZ');this.dummy.scale.setScalar(role==='delivery'&&!c.delivery?0:1);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);
  if(role!=='plain'){const tint=role==='brake'?(c.braking?0xff3827:0x7b2421):role==='headlight'?(c.flashing?0xffffff:0x66828a):role==='delivery'?(c.delivery==='foodpanda'?0xdf397e:0x39a774):(c.paint||COLORS[(c.color||0)%COLORS.length]);mesh.setColorAt(i,this.color.setHex(tint));}}
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}}
}
