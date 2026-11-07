import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {Route,seeded}=await import(repo+'/dist/geo.js');const THREE=await import(repo+'/dist/vendor/three.module.js');const {DrivingWorld}=await import(repo+'/dist/world.js');const {EnvironmentWorld}=await import(repo+'/dist/environment-world.js');const {bikeBranches}=await import(repo+'/dist/road-geometry.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(repo,'dist/data',p))),index=read('routes/index.json'),terrain=read('terrain.json'),overpasses=read('overpasses.json');
const context=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
fs.mkdirSync('terrain-intermediate',{recursive:true});
for(const entry of index.routes){
 const data=read('routes/'+entry.file),w=Object.create(DrivingWorld.prototype);w.route=new Route(data);w.bikeRoute=new Route({...data,points:data.bikePoints,lengthMeters:data.bikeLengthMeters});w.branches=bikeBranches(w.route,w.bikeRoute);w.interchange=data.sceneryProfile==='south-hsinchu'?null:overpasses;w.scene=new THREE.Scene();w.rng=seeded(12);w.mats={road:new THREE.MeshStandardMaterial({color:0x465051})};w.prepareRoadClearance();w.makeTerrain();const objects=[...w.scene.children];const environment=new EnvironmentWorld(w,terrain);objects.push(environment.land);const result=[];
 for(const obj of objects){if(!obj?.isMesh)continue;obj.updateMatrixWorld(true);let geo=obj.geometry.clone().applyMatrix4(obj.matrixWorld);if(geo.index)geo=geo.toNonIndexed();const pos=geo.getAttribute('position'),color=geo.getAttribute('color'),mat=Array.isArray(obj.material)?obj.material[0]:obj.material;
  result.push({name:obj===environment.land?'dem':obj.name||'ground',color:mat.color.getHex(),vertices:Buffer.from(pos.array.buffer,pos.array.byteOffset,pos.array.byteLength).toString('base64'),colors:color?Buffer.from(color.array.buffer,color.array.byteOffset,color.array.byteLength).toString('base64'):null});}
 fs.writeFileSync('terrain-intermediate/'+entry.id+'.json',JSON.stringify({id:entry.id,objects:result}));console.log(entry.id,'meshes',result.length);
}
