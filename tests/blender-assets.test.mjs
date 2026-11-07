import {liftHill} from '../dist/corridor-tiles.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {prepareBlenderAssets,prepareVehicleAsset,BlenderTrafficBatch,BlenderVehicleBatch,CAR_MODELS} from '../dist/blender-assets.js';import {Route} from '../dist/geo.js';
import {WorldArchive} from '../dist/world-archive.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+p,import.meta.url)));
const parse=async input=>{const b=Buffer.isBuffer(input)?input:fs.readFileSync(input);return new Promise((ok,err)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',ok,err));};
test('Blender library contains all selectable vehicle shapes and the double-arch pylon',async()=>{
 const gltf=await parse(new URL('../dist/assets/commute-assets.glb',import.meta.url)),assets=prepareBlenderAssets(gltf.scene);
 assert.equal(assets.models.size,14);assert.ok(assets.arch);assert.ok(assets.arch.children.length>=3);
 for(const model of CAR_MODELS){const parts=assets.models.get(model);assert.ok(parts.find(p=>p.name==='vehicle_paint'));assert.ok(parts.find(p=>p.name==='rubber'));assert.ok(parts.find(p=>p.name==='brake_lamps'));}
 const scene=new THREE.Scene(),batch=new BlenderTrafficBatch(scene,assets,20),cars=CAR_MODELS.map((model,id)=>({id,model,color:id%7,world:{x:id*10,y:0,z:0,yaw:0}}));
 batch.update(cars,{sample(){throw Error('position provided');}});for(let i=0;i<CAR_MODELS.length;i++)assert.ok(batch.parts.some(p=>p.index===i&&p.mesh.count===1),'selected model absent '+CAR_MODELS[i]);
});
test('Blender scooter retains an optional delivery box and an independently lit brake lamp',async()=>{
 const gltf=await parse(new URL('../dist/assets/vehicles/bike.glb',import.meta.url)),parts=prepareVehicleAsset(gltf.scene,'bike'),scene=new THREE.Scene(),batch=new BlenderVehicleBatch(scene,parts,2);
 assert.ok(parts.some(p=>p.role==='delivery'));assert.ok(parts.some(p=>p.role==='brake'));const pose={x:0,y:0,z:0,yaw:0};
 batch.update([{world:pose,color:1},{world:pose,color:2,delivery:'foodpanda'}],{});const delivery=batch.parts.find(p=>p.role==='delivery').mesh,m=new THREE.Matrix4(),s=new THREE.Vector3();delivery.getMatrixAt(0,m);m.decompose(new THREE.Vector3(),new THREE.Quaternion(),s);assert.equal(s.x,0);delivery.getMatrixAt(1,m);m.decompose(new THREE.Vector3(),new THREE.Quaternion(),s);assert.ok(s.x>.9);
});
test('both mapped restaurants retain the Blender double-arch pylon in their route scenery',()=>{
 for(const id of ['zhubei-tsmc','zhubei-mediatek','guanxin-tsmc','guanxin-mediatek','tsmc-guanxin','mediatek-guanxin']){const m=JSON.parse(fs.readFileSync(new URL('../dist/assets/world/'+id+'.json',import.meta.url))),pack=fs.readFileSync(new URL('../dist/assets/world/'+id+'.bin',import.meta.url));let found=false;
  for(const seg of [...m.scenery.tiles,...(m.scenery.global?[m.scenery.global]:[])]){const b=pack.subarray(seg.offset,seg.offset+seg.length),n=b.readUInt32LE(12),gltf=JSON.parse(b.subarray(20,20+n));if(gltf.materials?.some(x=>x.name==='yellow_arch'))found=true;}
  assert.ok(found,id+' restaurant pylon missing');
 }
});
test('Blender road tiles cover the mapped car and scooter paths without elevation gaps',async()=>{
 const index=read('routes/index.json');for(const entry of index.routes){const data=read('routes/'+entry.file),manifest=JSON.parse(fs.readFileSync(new URL('../dist/assets/world/'+entry.id+'.json',import.meta.url))),archive=fs.readFileSync(new URL('../dist/assets/world/'+entry.id+'.bin',import.meta.url));
  assert.equal(manifest.id,entry.id);assert.equal(manifest.byteLength,archive.length);const scene=new THREE.Scene();
  for(const tile of manifest.roads.tiles){const gltf=await parse(archive.subarray(tile.offset,tile.offset+tile.length));liftHill(gltf.scene);scene.add(gltf.scene);}
  scene.updateMatrixWorld(true);
  for(const [points,length] of [[data.points,data.lengthMeters],[data.bikePoints,data.bikeLengthMeters]]){const route=new Route({...data,points,lengthMeters:length});for(let s=35;s<route.length-35;s+=235){const p=route.sample(s),ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+2,p.z),new THREE.Vector3(0,-1,0),0,3.5);assert.ok(ray.intersectObject(scene,true).length,`${entry.id} missing pavement near ${s} (${points===data.bikePoints?'bike':'car'})`);}}
 }
});
test('range archives fetch only requested bytes and fall back when the server ignores ranges',async()=>{
 const old=globalThis.fetch,bytes=new Uint8Array([1,2,3,4,5,6]),data={version:1,id:'zhubei-tsmc',byteLength:6,roads:{tiles:[]},scenery:{tiles:[]},terrain:{offset:0,length:1}};
 try{for(const supportsRange of [true,false]){let downloads=0;globalThis.fetch=async(url,opts)=>{
   if(url.includes('.json'))return new Response(JSON.stringify(data));const match=opts.headers.Range.match(/bytes=(\d+)-(\d+)/),start=Number(match[1]),end=Number(match[2]);downloads++;
   return supportsRange?new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/6`}}):new Response(bytes,{status:200});
  };const archive=await WorldArchive.create('zhubei-tsmc');assert.deepEqual([...new Uint8Array(await archive.get({offset:2,length:3}))],[3,4,5]);assert.equal(downloads,supportsRange?2:1);await assert.rejects(()=>archive.get({offset:5,length:2}));archive.dispose();}
 }finally{globalThis.fetch=old;}
});
